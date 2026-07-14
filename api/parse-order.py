"""
Multimodal order parsing: voice text + product-label images (OCR/VLM) + documents + link
→ structured order fields via NVIDIA NIM (vision + LLM).

Env: NVIDIA_API_KEY
Limits: max 5 files, 8MB each
Routes as /api/parse (prefer this over hyphenated names on Vercel Python).
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

# Compliance marks on product labels → sales regions (简体)
MARK_TO_REGIONS = {
    "CE": ["欧盟"],
    "UKCA": ["英国"],
    "UKNI": ["英国"],
    "FCC": ["美国"],
    "FC": ["美国"],
    "FDA": ["美国"],
    "CCC": ["中国"],
    "PSE": ["日本"],
    "KC": ["韩国"],
    "RCM": ["澳大利亚"],
    "EAC": ["俄罗斯"],
}

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


def _parse_json_from_llm(text: str) -> dict:
    text = (text or "").strip()
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


def _to_simplified(text: str) -> str:
    if not text:
        return ""
    try:
        import zhconv

        return zhconv.convert(text, "zh-cn")
    except Exception:
        return text


def _normalize_origin(raw: str) -> str:
    s = _to_simplified(str(raw or "").strip())
    if not s:
        return ""
    low = s.lower()
    if any(k in low for k in ("china", "中国", "cn", "p.r.c", "prc", "made in china")):
        return "中国"
    if "vietnam" in low or "越南" in s:
        return "越南"
    if "india" in low or "印度" in s:
        return "印度"
    if "aland" in low or "åland" in low or "奥兰" in s:
        return "奥兰群岛"
    s = re.sub(r"(?i)^made\s+in\s+", "", s).strip()
    return s


def _regions_from_marks(marks) -> list[str]:
    found: list[str] = []
    seen = set()
    if not marks:
        return found
    items = marks if isinstance(marks, list) else re.split(r"[,，/\s]+", str(marks))
    for item in items:
        key = str(item or "").strip().upper()
        key = key.replace(".", "")
        if key == "ROHS":
            continue
        regions = MARK_TO_REGIONS.get(key) or MARK_TO_REGIONS.get(key.replace("MARK", ""))
        if not regions and "UKCA" in key:
            regions = MARK_TO_REGIONS["UKCA"]
        if not regions and key in ("CE", "ＣＥ"):
            regions = MARK_TO_REGIONS["CE"]
        if not regions:
            continue
        for region in regions:
            if region not in seen:
                seen.add(region)
                found.append(region)
    return found


def _merge_region_list(*parts: str) -> str:
    seen = set()
    out: list[str] = []
    for part in parts:
        if not part:
            continue
        for token in re.split(r"[,，、;/|]+", str(part)):
            region = _to_simplified(token.strip())
            if not region:
                continue
            # normalize common english → zh
            low = region.lower()
            mapping = {
                "european union": "欧盟",
                "eu": "欧盟",
                "europe": "欧盟",
                "united states": "美国",
                "usa": "美国",
                "us": "美国",
                "u.s.a": "美国",
                "u.s.": "美国",
                "united kingdom": "英国",
                "uk": "英国",
                "great britain": "英国",
                "australia": "澳大利亚",
                "canada": "加拿大",
                "south africa": "南非",
                "china": "中国",
            }
            region = mapping.get(low, region)
            if region not in seen:
                seen.add(region)
                out.append(region)
    return "、".join(out)


def _build_shipping_remark(extra: dict) -> str:
    bits = []
    batch = str(extra.get("Batch") or extra.get("batch") or "").strip()
    date = str(
        extra.get("Date of manufacture")
        or extra.get("Manufacture Date")
        or extra.get("date")
        or ""
    ).strip()
    ec = str(extra.get("EC REP") or extra.get("ec_rep") or "").strip()
    marks = extra.get("marks") or extra.get("compliance_marks") or []
    if isinstance(marks, list):
        marks_s = "、".join(str(m).strip() for m in marks if str(m).strip())
    else:
        marks_s = str(marks or "").strip()
    if batch:
        bits.append(f"批号：{batch}")
    if date:
        bits.append(f"生产日期：{date}")
    if ec:
        bits.append(f"欧代：{ec}")
    if marks_s:
        bits.append(f"合规标识：{marks_s}")
    return "；".join(bits)


def _ocr_image_structured(data: bytes, mime: str, filename: str) -> dict:
    """Vision model extracts product-label fields as JSON (one pass)."""
    b64 = base64.b64encode(data).decode("ascii")
    media = mime if mime.startswith("image/") else "image/jpeg"
    if media == "application/octet-stream":
        media = "image/jpeg"
    prompt = (
        "你是产品标签/合格证识别助手。请仔细阅读图片中的全部文字与标识，"
        "抽取检测下单所需字段，只返回合法 JSON（不要 markdown）。\n"
        "字段说明：\n"
        '- "Product Name": 产品名称（如 Product name / 品名）\n'
        '- "Item#/model#": 型号/货号，优先取标签上的 Model / 型号 / SKU / Item No 一行的值（如 XY-03、LX-03）\n'
        '- "Manufacturer": 制造商公司全称\n'
        '- "Manufacturer Address": 制造商地址（完整一行）\n'
        '- "Country of Origin": 原产国（优先 MADE IN / Manufacturing location，值用简体如「中国」）\n'
        '- "Batch": 批号/Batch\n'
        '- "Date of manufacture": 生产日期\n'
        '- "EC REP": 欧代公司+地址（如有 EC REP）\n'
        '- "marks": 图片上出现的合规标识数组，可能含 CE, UKCA, FC, FCC, RoHS, WEEE 等\n'
        '- "Countries/Regions of Distribution": 销售国家/地区；'
        "若未写明，则根据标识推断：CE→欧盟，UKCA→英国，FC/FCC→美国，CCC→中国，RCM→澳大利亚\n"
        '- "ocr_text": 关键可见关键文字要点（简体）\n'
        "无法确定的字段用空字符串；marks 用数组。"
    )
    payload = {
        "model": VISION_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{media};base64,{b64}"},
                    },
                ],
            }
        ],
        "max_tokens": 1600,
        "temperature": 0.05,
    }
    raw = _nvidia_chat(payload)
    try:
        return _parse_json_from_llm(raw)
    except Exception:
        return {"ocr_text": raw, "marks": []}


def _label_dict_to_snippet(label: dict, filename: str) -> str:
    if not isinstance(label, dict):
        return f"【文件: {filename}】\n{label}"
    lines = [f"【产品标签识别: {filename}】"]
    for key in (
        "Product Name",
        "Item#/model#",
        "Manufacturer",
        "Manufacturer Address",
        "Country of Origin",
        "Countries/Regions of Distribution",
        "Batch",
        "Date of manufacture",
        "EC REP",
        "ocr_text",
    ):
        val = label.get(key)
        if val:
            lines.append(f"{key}: {val}")
    marks = label.get("marks") or []
    if marks:
        lines.append("marks: " + ", ".join(str(m) for m in marks))
    return "\n".join(lines)


def _extract_file(item: dict) -> tuple[str, dict | None]:
    """Return (text_snippet, label_json_or_None)."""
    filename = item["filename"]
    mime = item["mime"]
    data = item["data"]
    lower = filename.lower()
    try:
        if _is_image(filename, mime):
            label = _ocr_image_structured(data, mime, filename)
            return _label_dict_to_snippet(label, filename), label
        if mime == "application/pdf" or lower.endswith(".pdf"):
            text = _extract_pdf(data)
            if text.strip():
                return f"【文件: {filename}】\n{text}", None
            return f"[PDF {filename}: 未提取到文本，建议上传照片或截图]", None
        if (
            "wordprocessingml" in mime
            or lower.endswith(".docx")
            or lower.endswith(".doc")
        ):
            if lower.endswith(".docx") or "wordprocessingml" in mime:
                return f"【文件: {filename}】\n{_extract_docx(data)}", None
            return f"[Word {filename}: 仅支持 .docx]", None
        if mime.startswith("text/") or lower.endswith((".txt", ".csv", ".md")):
            return f"【文件: {filename}】\n{_extract_plain(data, filename)}", None
    except Exception as exc:
        return f"[{filename}: 提取失败 {exc}]", None
    return f"[{filename}: 暂不支持的格式，请上传图片/PDF/DOCX]", None


def _structure_fields(context: str, seed_fields: dict | None = None) -> dict:
    field_list = "\n".join(f'- "{k}"' for k in FIELD_KEYS)
    system = (
        "你是 QIMA 检测订单信息抽取助手。根据用户提供的语音、文档、产品标签识别结果和商品链接，"
        "抽取订单字段。必须输出合法 JSON，不要 markdown。所有字段值使用简体中文。"
        "规则：\n"
        "1) Country of Origin：MADE IN CHINA / Manufacturing location 含 China →「中国」\n"
        "2) Countries/Regions of Distribution：CE→欧盟，UKCA→英国，FC/FCC→美国；"
        "多个用顿号「、」连接\n"
        "3) Item#/model# 取 Model / SKU / 货号\n"
        "4) Shipping Remark 可汇总批号、生产日期、欧代、合规标识\n"
        "5) 无法确定的字段留空字符串\n"
        'JSON：{"product_summary":{"name":"","brand":"","hint":""},'
        '"fields":{...},"confidence":{...},"raw_excerpt":""}'
    )
    seed_note = ""
    if seed_fields:
        seed_note = (
            "\n\n已从标签直接识别的候选字段（可校对合并）：\n"
            + json.dumps(seed_fields, ensure_ascii=False)
        )
    user = (
        f"请从以下资料抽取订单字段。\n\n字段列表：\n{field_list}\n\n"
        f"资料内容：\n{context[:24000]}{seed_note}\n\n"
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
    return _normalize_result(parsed, seed_fields)


def _seed_fields_from_labels(labels: list[dict]) -> dict:
    seed: dict[str, str] = {k: "" for k in FIELD_KEYS}
    remark_bits: list[str] = []
    regions: list[str] = []
    for label in labels:
        if not isinstance(label, dict):
            continue
        for key in (
            "Product Name",
            "Item#/model#",
            "Manufacturer",
            "Manufacturer Address",
        ):
            val = str(label.get(key) or "").strip()
            if val and not seed[key]:
                seed[key] = val
        origin = _normalize_origin(str(label.get("Country of Origin") or ""))
        if origin and not seed["Country of Origin"]:
            seed["Country of Origin"] = origin
        regions.append(str(label.get("Countries/Regions of Distribution") or ""))
        regions.extend(_regions_from_marks(label.get("marks")))
        extra_remark = _build_shipping_remark(label)
        if extra_remark:
            remark_bits.append(extra_remark)
    seed["Countries/Regions of Distribution"] = _merge_region_list(*regions)
    if remark_bits and not seed["Shipping Remark"]:
        seed["Shipping Remark"] = "；".join(remark_bits)
    return seed


def _normalize_result(parsed: dict, seed_fields: dict | None = None) -> dict:
    fields_in = parsed.get("fields") if isinstance(parsed.get("fields"), dict) else {}
    seed = seed_fields or {}
    fields: dict[str, str] = {}
    for key in FIELD_KEYS:
        val = fields_in.get(key, "")
        if val is None or str(val).strip() == "":
            val = seed.get(key, "")
        fields[key] = _to_simplified(str(val).strip()) if val is not None else ""

    if fields.get("Country of Origin"):
        fields["Country of Origin"] = _normalize_origin(fields["Country of Origin"])

    # Prefer merged regions from seed marks + LLM
    fields["Countries/Regions of Distribution"] = _merge_region_list(
        seed.get("Countries/Regions of Distribution", ""),
        fields.get("Countries/Regions of Distribution", ""),
    )

    if not fields.get("Shipping Remark") and seed.get("Shipping Remark"):
        fields["Shipping Remark"] = seed["Shipping Remark"]
    elif fields.get("Shipping Remark") and seed.get("Shipping Remark"):
        if seed["Shipping Remark"] not in fields["Shipping Remark"]:
            fields["Shipping Remark"] = (
                fields["Shipping Remark"] + "；" + seed["Shipping Remark"]
            )

    summary_in = parsed.get("product_summary")
    if not isinstance(summary_in, dict):
        summary_in = {}
    product_summary = {
        "name": _to_simplified(
            str(summary_in.get("name") or fields.get("Product Name") or "").strip()
        ),
        "brand": _to_simplified(str(summary_in.get("brand") or "").strip()),
        "hint": _to_simplified(str(summary_in.get("hint") or "").strip()),
    }
    if not product_summary["name"] and fields.get("Product Name"):
        product_summary["name"] = fields["Product Name"]

    confidence = (
        parsed.get("confidence") if isinstance(parsed.get("confidence"), dict) else {}
    )
    excerpt = _to_simplified(str(parsed.get("raw_excerpt") or "")[:500])

    return {
        "product_summary": product_summary,
        "fields": fields,
        "confidence": confidence,
        "raw_excerpt": excerpt,
    }


def _build_context(voice_text: str, link: str, files: list) -> tuple[str, list[dict]]:
    chunks = []
    labels: list[dict] = []
    if voice_text:
        chunks.append(f"【语音转写】\n{voice_text}")
    if link:
        chunks.append(f"【商品链接】\n{link}")
    for item in files:
        text, label = _extract_file(item)
        if text.strip():
            chunks.append(text)
        if label:
            labels.append(label)
    return "\n\n".join(chunks).strip(), labels


def parse_order_request(voice_text: str, link: str, files: list) -> dict:
    context, labels = _build_context(voice_text, link, files)
    if not context:
        raise ValueError("empty_input")
    seed = _seed_fields_from_labels(labels)
    # If only images and seed already rich, still run LLM for polish; if LLM fails, return seed
    try:
        return _structure_fields(context, seed)
    except Exception:
        if any(seed.get(k) for k in FIELD_KEYS):
            return {
                "product_summary": {
                    "name": seed.get("Product Name") or "",
                    "brand": "",
                    "hint": "来自产品标签识别",
                },
                "fields": seed,
                "confidence": {},
                "raw_excerpt": context[:500],
            }
        raise


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
