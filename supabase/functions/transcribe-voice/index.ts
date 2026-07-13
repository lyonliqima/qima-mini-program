/**
 * Optional proxy: prefer Vercel /api/transcribe (NVIDIA Whisper gRPC).
 * Kept so existing Edge URL still works when ASR_UPSTREAM is set.
 *
 * Secrets:
 * - NVIDIA_API_KEY (unused here if proxying)
 * - ASR_UPSTREAM (default https://qima-mini-program.vercel.app/api/transcribe)
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const DEFAULT_UPSTREAM = "https://qima-mini-program.vercel.app/api/transcribe";
const MAX_BYTES = 10 * 1024 * 1024;

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
      "Content-Type": "application/json",
    },
  });
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
  upstream.append(
    "file",
    new File([file], file.name || "recording.wav", {
      type: file.type || "audio/wav",
    }),
  );

  const target = Deno.env.get("ASR_UPSTREAM") || DEFAULT_UPSTREAM;
  try {
    const res = await fetch(target, { method: "POST", body: upstream });
    const text = await res.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      return jsonResponse({ error: "upstream_failed", raw: text.slice(0, 200) }, 502, origin);
    }
    return new Response(JSON.stringify(parsed), {
      status: res.status,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.error("ASR upstream error", err);
    return jsonResponse({ error: "upstream_network" }, 502, origin);
  }
});
