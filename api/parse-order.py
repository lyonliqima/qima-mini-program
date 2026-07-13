"""
Multimodal order parsing: voice text + images (OCR) + documents + product link
→ structured order fields via NVIDIA NIM (vision + LLM).

Env: NVIDIA_API_KEY
Limits: max 5 files, 8MB each
"""
from __future__ import annotations

import base64
import io
import json
import os
import re
import traceback
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler

NVIDIA_BASE = "https://integrate.api.nvidia.com/v1/chat/completions"
VISION_MODEL = "meta/llama-3.2-11b-vision-instruct"
LLM_MODEL = "nvidia/llama-3.1-nemotron-nano-8b-v1"

MAX_FILES = 5
MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_BODY_BYTES = 45 * 1024 * 1024

FIELD_KEYS = [
    "Product Name",
    "Program",
    "Country of Origin",
    "Countries/Regions of Distribution",
    "Item#/model#",
    "Manufacturer",
    "Manufacturer Address",
    "Sample Collection Method",
    "Carrier",
    "Tracking Number",
    "Shipping Remark",
]

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


def _parse_multipart(body: bytes, content_type: str) -> dict:
    m = re.search(r'boundary=(?:"([^"]+)"|([^;]+))', content_type, re.I)
    if not m:
        raise ValueError("invalid_multipart")
    boundary = (m.group(1) or m.group(2)).strip().encode("utf-8")
    result: dict = {"voice_text": "", "link": "", "files": []}
    for part in body.split(b"--" + boundary):
        if b"Content-Disposition:" not in part:
            continue
        header_end = part.find(b"\r\n\r\n")
        if header_end < 0:
            continue
        headers = part[:header_end].decode("utf-8", errors="replace")
        data = part[header_end + 4 :]
        if data.endswith(b"\r\n"):
            data = data[:-2]
        if data.endswith(b"--"):
            data = data[:-2]
        name_m = re.search(r'name="([^"]+)"', headers)
        if not name_m:
            continue
        name = name_m.group(1)
        if name in ("voice_text", "link"):
            result[name] = data.decode("utf-8", errors="replace").strip()
            continue
        if name != "files" and not name.startswith("files"):
            continue
        if len(result["files"]) >= MAX_FILES:
            continue
        if len(data) > MAX_FILE_BYTES:
            raise ValueError("file_too_large")
        fn_m = re.search(r'filename="([^"]*)"', headers)
        filename = (fn_m.group(1) if fn_m else "upload.bin") or "upload.bin"
        ct_m = re.search(r"Content-Type:\s*([^\r\n]+)", headers, re.I)
        mime = (ct_m.group(1).strip() if ct_m else "application/octet-stream").lower()
        result["files"].append({"filename": filename, "mime": mime, "data": data})
    return result


def _nvidia_chat(payload: dict) -> str:
    api_key = os.environ.get("NVIDIA_API_KEY") or ""
    if not api_key:
        raise RuntimeError("missing_nvidia_key")
    req = urllib.request.Request(
        NVIDIA_BASE,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"upstream_http_{e.code}:{err_body}") from e
    choices = body.get("choices") or []
    if not choices:
        return ""
    msg = choices[0].get("message") or {}
    return (msg.get("content") or "").strip()


def _is_image(filename: str, mime: str) -> bool:
    if mime.startswith("image/"):
        return True
    return bool(re.search(r"\.(jpe?g|png|gif|webp|bmp|heic)$", filename, re.I))


def _extract_pdf(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    parts = []
    for page in reader.pages[:20]:
        text = page.extract_text() or ""
        if text.strip():
            parts.append(text.strip())
    return "\n".join(parts)


def _extract_docx(data: bytes) -> str:
    from docx import Document

    doc = Document(io.BytesIO(data))
    return "\n".join(p.text.strip() for p in doc.paragraphs if p.text.strip())


def _extract_plain(data: bytes, filename: str) -> str:
    for enc in ("utf-8", "gb18030", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return ""


def _ocr_image(data: bytes, mime: str, filename: str) -> str:
    b64 = base64.b64encode(data).decode("ascii")
    media = mime if mime.startswith("image/") else "image/jpeg"
    if media == "application/octet-stream":
        media = "image/jpeg"
    payload = {
        "model": VISION_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "请识别图片中所有与产品检测订单相关的文字，"
                            "包括产品名称、规格、型号、材质、制造商、地址、"
                            "原产国、销售地区、检测项目等。输出简体中文，保留原文要点。"
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{media};base64,{b64}"},
                    },
                ],
            }
        ],
        "max_tokens": 1200,
        "temperature": 0.1,
    }
    return _nvidia_chat(payload)


def _extract_file_text(item: dict) -> str:
    filename = item["filename"]
    mime = item["mime"]
    data = item["data"]
    lower = filename.lower()
    try:
        if _is_image(filename, mime):
            return _ocr_image(data, mime, filename)
        if mime == "application/pdf" or lower.endswith(".pdf"):
            text = _extract_pdf(data)
            if text.strip():
                return text
            return f"[PDF {filename}: 未提取到文本，建议上传照片或截图]"
        if (
            "wordprocessingml" in mime
            or lower.endswith(".docx")
            or lower.endswith(".doc")
        ):
            if lower.endswith(".docx") or "wordprocessingml" in mime:
                return _extract_docx(data)
            return f"[Word {filename}: 仅支持 .docx]"
        if mime.startswith("text/") or lower.endswith((".txt", ".csv", ".md")):
            return _extract_plain(data, filename)
    except Exception as exc:
        return f"[{filename}: 提取失败 {exc}]"
    return f"[{filename}: 暂不支持的格式，请上传图片/PDF/DOCX]"


def _parse_json_from_llm(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            return json.loads(m.group(0))
        raise


def _structure_fields(context: str) -> dict:
    field_list = "\n".join(f'- "{k}"' for k in FIELD_KEYS)
    system = (
        "你是 QIMA 检测订单信息抽取助手。根据用户提供的语音、文档、图片 OCR 文本和商品链接，"
        "抽取订单字段。必须输出合法 JSON，不要 markdown。所有字段值使用简体中文。"
        "无法确定的字段留空字符串。JSON 结构："
        '{"product_summary":{"name":"","brand":"","hint":""},'
        '"fields":{...},"confidence":{...},"raw_excerpt":""}'
    )
    user = (
        f"请从以下资料抽取订单字段。\n\n字段列表：\n{field_list}\n\n"
        f"资料内容：\n{context[:24000]}\n\n"
        "只返回 JSON。"
    )
    payload = {
        "model": LLM_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.1,
        "max_tokens": 2048,
    }
    raw = _nvidia_chat(payload)
    parsed = _parse_json_from_llm(raw)
    return _normalize_result(parsed)


def _to_simplified(text: str) -> str:
    if not text:
        return ""
    try:
        import zhconv

        return zhconv.convert(text, "zh-cn")
    except Exception:
        return text


def _normalize_result(parsed: dict) -> dict:
    fields_in = parsed.get("fields") if isinstance(parsed.get("fields"), dict) else {}
    fields: dict[str, str] = {}
    for key in FIELD_KEYS:
        val = fields_in.get(key, "")
        fields[key] = _to_simplified(str(val).strip()) if val is not None else ""

    summary_in = parsed.get("product_summary")
    if not isinstance(summary_in, dict):
        summary_in = {}
    product_summary = {
        "name": _to_simplified(str(summary_in.get("name") or fields.get("Product Name") or "").strip()),
        "brand": _to_simplified(str(summary_in.get("brand") or "").strip()),
        "hint": _to_simplified(str(summary_in.get("hint") or "").strip()),
    }
    if not product_summary["name"] and fields.get("Product Name"):
        product_summary["name"] = fields["Product Name"]

    confidence = parsed.get("confidence") if isinstance(parsed.get("confidence"), dict) else {}
    excerpt = _to_simplified(str(parsed.get("raw_excerpt") or "")[:500])

    return {
        "product_summary": product_summary,
        "fields": fields,
        "confidence": confidence,
        "raw_excerpt": excerpt,
    }


def _build_context(voice_text: str, link: str, files: list) -> str:
    chunks = []
    if voice_text:
        chunks.append(f"【语音转写】\n{voice_text}")
    if link:
        chunks.append(f"【商品链接】\n{link}")
    for item in files:
        text = _extract_file_text(item)
        if text.strip():
            chunks.append(f"【文件: {item['filename']}】\n{text}")
    return "\n\n".join(chunks).strip()


def parse_order_request(voice_text: str, link: str, files: list) -> dict:
    context = _build_context(voice_text, link, files)
    if not context:
        raise ValueError("empty_input")
    return _structure_fields(context)


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
            if length > MAX_BODY_BYTES:
                return self._send(413, {"error": "payload_too_large"}, origin)

            raw = self.rfile.read(length)
            if "multipart/form-data" not in content_type:
                return self._send(400, {"error": "invalid_multipart"}, origin)

            parts = _parse_multipart(raw, content_type)
            voice_text = parts.get("voice_text") or ""
            link = parts.get("link") or ""
            files = parts.get("files") or []

            if not voice_text and not link and not files:
                return self._send(400, {"error": "empty_input"}, origin)

            result = parse_order_request(voice_text, link, files)
            return self._send(200, result, origin)
        except ValueError as e:
            code = str(e) or "bad_request"
            status = 413 if code == "file_too_large" else 400
            return self._send(status, {"error": code}, origin)
        except RuntimeError as e:
            code = str(e)
            status = 503 if code == "missing_nvidia_key" else 502
            return self._send(status, {"error": code}, origin)
        except Exception:
            traceback.print_exc()
            return self._send(502, {"error": "upstream_failed"}, origin)

    def log_message(self, format, *args):
        return
