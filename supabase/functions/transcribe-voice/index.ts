/**
 * Proxy browser audio to NVIDIA hosted Parakeet CTC Mandarin (zh-CN) ASR.
 * Secret: NVIDIA_API_KEY (nvapi-...)
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const NVIDIA_ASR_URL =
  "https://3e2b62ff-7ae7-4ac5-87c8-d5949ecafff5.invocation.api.nvcf.nvidia.com/v1/audio/transcriptions";
const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_ORIGINS = [
  "https://qima-mini-program.vercel.app",
  "https://lyonliqima.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "null",
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin && (ALLOWED_ORIGINS.includes(origin) || origin.startsWith("http://localhost") ||
      origin.startsWith("http://127.0.0.1") || origin.startsWith("file://"))
      ? origin
      : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow === "null" ? "*" : allow,
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
      "Content-Type": "application/json",
    },
  });
}

function extractTranscript(payload: unknown): string {
  if (!payload) return "";
  if (typeof payload === "string") return payload.trim();
  if (typeof payload !== "object") return "";
  const obj = payload as Record<string, unknown>;
  for (const key of ["text", "transcript", "transcription"]) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  if (Array.isArray(obj.results) && obj.results.length) {
    const first = obj.results[0] as Record<string, unknown>;
    if (typeof first?.transcript === "string") return first.transcript.trim();
    if (Array.isArray(first?.alternatives) && first.alternatives[0]) {
      const alt = first.alternatives[0] as Record<string, unknown>;
      if (typeof alt.transcript === "string") return alt.transcript.trim();
    }
  }
  return "";
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, origin);
  }

  const apiKey = Deno.env.get("NVIDIA_API_KEY") || "";
  if (!apiKey) {
    return jsonResponse({ error: "missing_nvidia_key" }, 503, origin);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonResponse({ error: "invalid_multipart" }, 400, origin);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonResponse({ error: "missing_file" }, 400, origin);
  }
  if (file.size <= 0) {
    return jsonResponse({ error: "empty_audio" }, 400, origin);
  }
  if (file.size > MAX_BYTES) {
    return jsonResponse({ error: "file_too_large" }, 413, origin);
  }

  const upstream = new FormData();
  upstream.append("language", "zh-CN");
  upstream.append(
    "file",
    new File([file], file.name || "recording.wav", {
      type: file.type || "audio/wav",
    }),
  );

  let nvidiaRes: Response;
  try {
    nvidiaRes = await fetch(NVIDIA_ASR_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      body: upstream,
    });
  } catch (err) {
    console.error("NVIDIA ASR network error", err);
    return jsonResponse({ error: "upstream_network" }, 502, origin);
  }

  const rawText = await nvidiaRes.text();
  let parsed: unknown = null;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsed = rawText;
  }

  if (!nvidiaRes.ok) {
    console.error("NVIDIA ASR error", nvidiaRes.status, rawText.slice(0, 500));
    if (nvidiaRes.status === 401 || nvidiaRes.status === 403) {
      return jsonResponse({ error: "upstream_auth" }, 502, origin);
    }
    return jsonResponse(
      { error: "upstream_failed", status: nvidiaRes.status },
      502,
      origin,
    );
  }

  const text =
    typeof parsed === "string"
      ? parsed.trim()
      : extractTranscript(parsed);

  if (!text) {
    return jsonResponse({ error: "empty_transcript", text: "" }, 200, origin);
  }

  return jsonResponse({ text }, 200, origin);
});
