/**
 * QIMA mini program — Supabase project: qima-mini-program
 * Dashboard: https://supabase.com/dashboard/project/dewcjtkqykkclxwcmusg
 *
 * Production frontend: GitHub Pages
 * https://lyonliqima.github.io/qima-mini-program/
 *
 * OCR / multimodal order parse → Vercel Python function (NVIDIA vision + LLM)
 * Voice ASR → Vercel /api/transcribe
 * Local label-parse.js is fallback only when the edge API is unavailable.
 */
window.SUPABASE_CONFIG = {
  url: 'https://dewcjtkqykkclxwcmusg.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRld2NqdGtxeWtrY2x4d2NtdXNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MzA5ODMsImV4cCI6MjA5OTUwNjk4M30.eVxfQNKzfRVtwLcWcWDrPY-t9mVyrfcgBC7s71yMoNY',
  asrEndpoint: 'https://qima-mini-program.vercel.app/api/transcribe',
  parseEndpoint: 'https://qima-mini-program.vercel.app/api/parse',
  parseEndpointFallback: ''
};
