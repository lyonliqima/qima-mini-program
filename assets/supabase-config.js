/**
 * QIMA mini program — Supabase project: qima-mini-program
 * Dashboard: https://supabase.com/dashboard/project/dewcjtkqykkclxwcmusg
 *
 * Production frontend: GitHub Pages
 * https://lyonliqima.github.io/qima-mini-program/
 *
 * OCR / multimodal order parse → Supabase Edge Function parse-order (NVIDIA vision + LLM)
 * Waybill photo → parse-waybill (single short vision call; local Tesseract raced as fallback)
 * Voice ASR → Supabase Edge Function transcribe-voice
 * Local label-parse.js is fallback only when the edge API is unavailable.
 */
window.SUPABASE_CONFIG = {
  url: 'https://dewcjtkqykkclxwcmusg.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRld2NqdGtxeWtrY2x4d2NtdXNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MzA5ODMsImV4cCI6MjA5OTUwNjk4M30.eVxfQNKzfRVtwLcWcWDrPY-t9mVyrfcgBC7s71yMoNY',
  asrEndpoint: 'https://dewcjtkqykkclxwcmusg.supabase.co/functions/v1/transcribe-voice',
  parseEndpoint: 'https://dewcjtkqykkclxwcmusg.supabase.co/functions/v1/parse-order',
  waybillEndpoint: 'https://dewcjtkqykkclxwcmusg.supabase.co/functions/v1/parse-waybill',
  parseEndpointFallback: ''
};
