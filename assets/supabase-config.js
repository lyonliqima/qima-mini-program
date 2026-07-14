/**
 * QIMA mini program — Supabase project: qima-mini-program
 * Dashboard: https://supabase.com/dashboard/project/dewcjtkqykkclxwcmusg
 *
 * Production frontend: GitHub Pages
 * https://lyonliqima.github.io/qima-mini-program/
 *
 * Order parse runs locally in the browser (label-parse.js).
 * Voice ASR still calls the existing Vercel function (no new Vercel deploys).
 */
window.SUPABASE_CONFIG = {
  url: 'https://dewcjtkqykkclxwcmusg.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRld2NqdGtxeWtrY2x4d2NtdXNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MzA5ODMsImV4cCI6MjA5OTUwNjk4M30.eVxfQNKzfRVtwLcWcWDrPY-t9mVyrfcgBC7s71yMoNY',
  // Existing ASR endpoint (legacy Vercel function; do not redeploy Vercel for UI)
  asrEndpoint: 'https://qima-mini-program.vercel.app/api/transcribe',
  // Prefer local multimodal parse on GitHub Pages (no Vercel /api/parse)
  parseEndpoint: '',
  parseEndpointFallback: ''
};
