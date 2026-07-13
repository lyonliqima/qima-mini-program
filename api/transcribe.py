"""
Chinese speech recognition via NVIDIA hosted Whisper Large v3 (Riva gRPC / NVCF).
Env: NVIDIA_API_KEY
"""
from __future__ import annotations

import json
import os
import re
import struct
import traceback
from http.server import BaseHTTPRequestHandler


NVIDIA_WHISPER_FUNCTION_ID = "b702f636-f60c-4a3d-a6f4-f3568c13bd7d"
MAX_BYTES = 10 * 1024 * 1024

ALLOWED_ORIGINS = {
    "https://qima-mini-program.vercel.app",
    "https://lyonliqima.github.io",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
}


def _cors(origin: str | None) -> dict:
    allow = "*"
    if origin and (
        origin in ALLOWED_ORIGINS
        or origin.startswith("http://localhost")
        or origin.startswith("http://127.0.0.1")
    ):
        allow = origin
    return {
        "Access-Control-Allow-Origin": allow,
        "Access-Control-Allow-Headers": "authorization, content-type, apikey",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    }


def _extract_multipart_file(body: bytes, content_type: str) -> bytes:
    m = re.search(r'boundary=(?:"([^"]+)"|([^;]+))', content_type, re.I)
    if not m:
        raise ValueError("missing_file")
    boundary = (m.group(1) or m.group(2)).strip().encode("utf-8")
    parts = body.split(b"--" + boundary)
    for part in parts:
        if b"Content-Disposition:" not in part or b'name="file"' not in part:
            continue
        split_at = part.find(b"\r\n\r\n")
        if split_at < 0:
            continue
        data = part[split_at + 4 :]
        if data.endswith(b"\r\n"):
            data = data[:-2]
        if data.endswith(b"--"):
            data = data[:-2]
        return data
    raise ValueError("missing_file")


def _pcm16_from_wav(data: bytes) -> tuple[bytes, int]:
    if len(data) < 44 or data[0:4] != b"RIFF" or data[8:12] != b"WAVE":
        return data, 16000
    sample_rate = 16000
    channels = 1
    bits = 16
    offset = 12
    pcm = b""
    while offset + 8 <= len(data):
        chunk_id = data[offset : offset + 4]
        chunk_size = struct.unpack_from("<I", data, offset + 4)[0]
        chunk_data = data[offset + 8 : offset + 8 + chunk_size]
        if chunk_id == b"fmt " and len(chunk_data) >= 16:
            _fmt, channels, sample_rate, _br, _ba, bits = struct.unpack_from("<HHIIHH", chunk_data, 0)
        elif chunk_id == b"data":
            pcm = chunk_data
            break
        offset += 8 + chunk_size + (chunk_size % 2)
    if not pcm:
        pcm = data[44:]
    if channels > 1 and bits == 16 and len(pcm) >= 2:
        samples = struct.unpack("<%dh" % (len(pcm) // 2), pcm)
        mono = []
        for i in range(0, len(samples), channels):
            frame = samples[i : i + channels]
            if not frame:
                break
            mono.append(int(sum(frame) / len(frame)))
        pcm = struct.pack("<%dh" % len(mono), *mono)
    return pcm, sample_rate


def _transcribe(wav_bytes: bytes) -> str:
    import riva.client
    from riva.client.proto.riva_audio_pb2 import AudioEncoding

    api_key = os.environ.get("NVIDIA_API_KEY") or ""
    if not api_key:
        raise RuntimeError("missing_nvidia_key")

    pcm, sample_rate = _pcm16_from_wav(wav_bytes)
    if len(pcm) < 320:
        return ""

    auth = riva.client.Auth(
        uri="grpc.nvcf.nvidia.com:443",
        use_ssl=True,
        metadata_args=[
            ["function-id", NVIDIA_WHISPER_FUNCTION_ID],
            ["authorization", f"Bearer {api_key}"],
        ],
    )
    asr = riva.client.ASRService(auth)
    config = riva.client.RecognitionConfig(
        encoding=AudioEncoding.LINEAR_PCM,
        sample_rate_hertz=sample_rate or 16000,
        language_code="zh-CN",
        max_alternatives=1,
        enable_automatic_punctuation=True,
        audio_channel_count=1,
    )
    resp = asr.offline_recognize(pcm, config)
    parts = []
    for result in resp.results:
        for alt in result.alternatives:
            if alt.transcript:
                parts.append(alt.transcript.strip())
    text = " ".join(parts).strip()
    if not text:
        return ""
    # Whisper may emit Traditional Chinese; force Simplified for the mini program UI.
    import zhconv
    return zhconv.convert(text, "zh-cn")


class handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: dict, origin: str | None):
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        for k, v in _cors(origin).items():
            self.send_header(k, v)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        origin = self.headers.get("Origin")
        self.send_response(204)
        for k, v in _cors(origin).items():
            self.send_header(k, v)
        self.end_headers()

    def do_POST(self):
        origin = self.headers.get("Origin")
        try:
            content_type = self.headers.get("Content-Type", "")
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0:
                return self._send(400, {"error": "invalid_size"}, origin)
            if length > MAX_BYTES:
                return self._send(413, {"error": "file_too_large"}, origin)

            raw = self.rfile.read(length)
            if "multipart/form-data" in content_type:
                file_bytes = _extract_multipart_file(raw, content_type)
            else:
                file_bytes = raw

            if not file_bytes:
                return self._send(400, {"error": "empty_audio"}, origin)

            text = _transcribe(file_bytes)
            if not text:
                return self._send(200, {"error": "empty_transcript", "text": ""}, origin)
            return self._send(200, {"text": text}, origin)
        except ValueError as e:
            return self._send(400, {"error": str(e) or "missing_file"}, origin)
        except RuntimeError as e:
            code = str(e)
            status = 503 if code == "missing_nvidia_key" else 500
            return self._send(status, {"error": code}, origin)
        except Exception:
            traceback.print_exc()
            return self._send(502, {"error": "upstream_failed"}, origin)

    def log_message(self, format, *args):
        return
