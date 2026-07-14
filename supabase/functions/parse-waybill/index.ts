/**
 * Fast shipping-label (waybill) parse on Supabase Edge.
 * Single NVIDIA vision call → carrier + tracking only (no full-order LLM).
 *
 * Secret: NVIDIA_API_KEY
 * Frontend: POST multipart field "file" (or "files") to
 *   /functions/v1/parse-waybill
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1/chat/completions";
// Same vision stack as parse-order; short prompt + low max_tokens keeps latency down
const VISION_MODEL = "meta/llama-3.2-11b-vision-instruct";
const MAX_FILE_BYTES = 6 * 1024 * 1024;

type WaybillResult = {
  carrier: string;
  carrierKey: string;
  tracking: string;
  raw_excerpt: string;
  source: string;
};

function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin &&
      (origin.startsWith("http://localhost") ||
        origin.startsWith("http://127.0.0.1") ||
        origin.includes("vercel.app") ||
        origin.includes("github.io"))
      ? origin
      : "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string | null,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function nvidiaChat(payload: Record<string, unknown>): Promise<string> {
  const apiKey = Deno.env.get("NVIDIA_API_KEY") || "";
  if (!apiKey) throw new Error("missing_nvidia_key");
  const res = await fetch(NVIDIA_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errBody = (await res.text()).slice(0, 400);
    throw new Error(`upstream_http_${res.status}:${errBody}`);
  }
  const body = await res.json();
  const choices = body?.choices || [];
  if (!choices.length) return "";
  return String(choices[0]?.message?.content || "").trim();
}

function parseJsonFromLlm(text: string): Record<string, unknown> {
  let t = (text || "").trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  try {
    return JSON.parse(t);
  } catch {
    const m = t.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("invalid_llm_json");
  }
}

function normalizeCarrier(raw: string): { carrier: string; carrierKey: string } {
  const text = String(raw || "").trim();
  if (!text) return { carrier: "", carrierKey: "" };
  const rules: { key: string; re: RegExp; label: string }[] = [
    { key: "sf", re: /顺丰|SF\s*EXPRESS|\bSFEXPRESS\b/i, label: "顺丰速运" },
    { key: "zto", re: /中通|ZTO|ZHONG\s*TONG/i, label: "中通快递" },
    { key: "yto", re: /圆通|YTO|YUAN\s*TONG/i, label: "圆通速递" },
    { key: "sto", re: /申通|STO|SHEN\s*TONG/i, label: "申通快递" },
    { key: "yunda", re: /韵达|YUNDA/i, label: "韵达快递" },
    { key: "jd", re: /京东(物流|快递)?|\bJD\b|京东速运/i, label: "京东物流" },
    { key: "jt", re: /极兔|J&T|JT\s*EXPRESS/i, label: "极兔速递" },
    { key: "dhl", re: /\bDHL\b/i, label: "DHL" },
    { key: "ups", re: /\bUPS\b/i, label: "UPS" },
    { key: "fedex", re: /FEDEX|联邦快递/i, label: "FedEx" },
  ];
  for (const rule of rules) {
    if (rule.re.test(text)) return { carrier: rule.label, carrierKey: rule.key };
  }
  // Keep short free-form brand if vision returned something plausible
  if (text.length <= 24 && !/\d{8,}/.test(text)) {
    return { carrier: text, carrierKey: "" };
  }
  return { carrier: "", carrierKey: "" };
}

function normalizeTracking(raw: string, carrierKey: string): string {
  let code = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!code) return "";
  if (code.length < 8 || code.length > 24) return "";
  if (/^(86)?1[3-9]\d{9}$/.test(code)) return "";
  if (/^XM\d+|FCC/i.test(code)) return "";
  // Infer carrier from prefix when missing
  void carrierKey;
  return code;
}

function inferCarrierFromTracking(tracking: string): {
  carrier: string;
  carrierKey: string;
} {
  if (/^SF/.test(tracking)) return { carrier: "顺丰速运", carrierKey: "sf" };
  if (/^JD/.test(tracking)) return { carrier: "京东物流", carrierKey: "jd" };
  if (/^YT/.test(tracking)) return { carrier: "圆通速递", carrierKey: "yto" };
  if (/^JT/.test(tracking)) return { carrier: "极兔速递", carrierKey: "jt" };
  if (/^ZT|^ZTO/.test(tracking)) {
    return { carrier: "中通快递", carrierKey: "zto" };
  }
  return { carrier: "", carrierKey: "" };
}

function extractFromOcrText(ocrText: string): WaybillResult {
  const text = String(ocrText || "").replace(/\s+/g, " ").trim();
  const upper = text.toUpperCase();
  let { carrier, carrierKey } = normalizeCarrier(text);

  let tracking = "";
  const labeled = text.match(
    /(?:运单号|快递单号|物流单号|单号|邮件号|Waybill|Tracking(?:\s*No\.?)?|Consignment)\s*[:：#]?\s*([A-Za-z0-9][A-Za-z0-9\-]{7,24})/i,
  );
  if (labeled) {
    tracking = normalizeTracking(labeled[1], carrierKey);
  }
  if (!tracking) {
    const candidates: string[] = [];
    const re =
      /\b([A-Z]{0,3}\d{10,18}|[A-Z]{2}\d{9,18}[A-Z]?|SF[A-Z0-9]{10,18}|JD[A-Z0-9]{8,18}|YT\d{10,16}|JT\d{10,16})\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(upper)) !== null) {
      const code = normalizeTracking(m[1], carrierKey);
      if (code) candidates.push(code);
    }
    if (candidates.length) {
      candidates.sort((a, b) => {
        const score = (c: string) => {
          let s = c.length;
          if (/^SF/.test(c)) s += 20;
          if (/^JD/.test(c)) s += 15;
          if (/^YT|^JT|^ZT/.test(c)) s += 12;
          if (/^\d{12,15}$/.test(c)) s += 8;
          return s;
        };
        return score(b) - score(a);
      });
      tracking = candidates[0];
    }
  }

  if (tracking && !carrier) {
    const inferred = inferCarrierFromTracking(tracking);
    carrier = inferred.carrier;
    carrierKey = inferred.carrierKey;
  }

  return {
    carrier,
    carrierKey,
    tracking,
    raw_excerpt: text.slice(0, 400),
    source: "waybill_edge_regex",
  };
}

async function visionWaybill(
  data: Uint8Array,
  mime: string,
): Promise<WaybillResult> {
  const media = mime.startsWith("image/") ? mime : "image/jpeg";
  const b64 = bytesToBase64(data);
  const prompt =
    "这是一张快递面单/运单照片。只抽取快递公司与运单号，输出合法 JSON，不要 markdown。\n" +
    '格式：{"carrier":"快递公司简称或品牌","tracking":"运单号","ocr_text":"关键可见文字"}\n' +
    "规则：carrier 优先 顺丰/中通/圆通/申通/韵达/京东/极兔/DHL/UPS/FedEx；" +
    "tracking 只要字母数字运单号；不确定字段用空字符串。务必简短。";

  const raw = await nvidiaChat({
    model: VISION_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: `data:${media};base64,${b64}` },
          },
        ],
      },
    ],
    max_tokens: 220,
    temperature: 0,
  });

  let parsed: Record<string, unknown> = {};
  try {
    parsed = parseJsonFromLlm(raw);
  } catch {
    // Fall back to regex on raw model text
    return extractFromOcrText(raw);
  }

  const fromVisionCarrier = normalizeCarrier(String(parsed.carrier || ""));
  let tracking = normalizeTracking(
    String(parsed.tracking || ""),
    fromVisionCarrier.carrierKey,
  );
  const ocr = String(parsed.ocr_text || raw || "");
  const fromText = extractFromOcrText(ocr);

  let carrier = fromVisionCarrier.carrier || fromText.carrier;
  let carrierKey = fromVisionCarrier.carrierKey || fromText.carrierKey;
  if (!tracking) tracking = fromText.tracking;
  if (tracking && !carrier) {
    const inferred = inferCarrierFromTracking(tracking);
    carrier = inferred.carrier;
    carrierKey = inferred.carrierKey;
  }

  return {
    carrier,
    carrierKey,
    tracking,
    raw_excerpt: (ocr || raw).slice(0, 400),
    source: "waybill_edge_vision",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, origin);
  }

  let form: FormData;
  try {
    form = await formDataSafe(req);
  } catch {
    return jsonResponse({ error: "invalid_multipart" }, 400, origin);
  }

  let file: File | null = null;
  for (const [name, value] of form.entries()) {
    if (!(value instanceof File)) continue;
    if (
      name === "file" || name === "files" || String(name).startsWith("files")
    ) {
      file = value;
      break;
    }
    if (!file) file = value;
  }
  if (!file || file.size <= 0) {
    return jsonResponse({ error: "missing_file" }, 400, origin);
  }
  if (file.size > MAX_FILE_BYTES) {
    return jsonResponse({ error: "file_too_large" }, 413, origin);
  }

  const mime = (file.type || "image/jpeg").toLowerCase();
  if (!mime.startsWith("image/") && !/\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name || "")) {
    return jsonResponse({ error: "unsupported_type" }, 415, origin);
  }

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const result = await visionWaybill(data, mime);
    if (!result.tracking && !result.carrier) {
      return jsonResponse({ error: "waybill_not_recognized", ...result }, 422, origin);
    }
    return jsonResponse(result as unknown as Record<string, unknown>, 200, origin);
  } catch (err) {
    const code = err instanceof Error ? err.message : "upstream_failed";
    console.error("parse-waybill error", err);
    if (code === "missing_nvidia_key") {
      return jsonResponse({ error: code }, 500, origin);
    }
    return jsonResponse({ error: code.slice(0, 180) }, 502, origin);
  }
});

async function formDataSafe(req: Request): Promise<FormData> {
  return await req.formData();
}
