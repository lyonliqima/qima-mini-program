# Supabase Backend — QIMA Mini Program

## What this includes

- Postgres schema for labs, orders, recipients, files, reports
- RLS policies (demo-friendly anon read/write; tighten for production auth)
- Seed data matching current prototype orders/reports
- Frontend helper: `assets/supabase-client.js`

## Deploy to Supabase Cloud

### 1. Login

```bash
npx supabase login
```

Or set a personal access token:

```bash
export SUPABASE_ACCESS_TOKEN=sbp_xxx
```

Create a token at: https://supabase.com/dashboard/account/tokens

### 2. Create project

```bash
npx supabase projects create qima-mini-program --org-id <ORG_ID> --db-password <STRONG_PASSWORD> --region ap-southeast-1
```

List orgs:

```bash
npx supabase orgs list
```

### 3. Link & push

```bash
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
psql "$DATABASE_URL" -f supabase/seed.sql
# or from SQL editor paste supabase/seed.sql
```

### 4. Wire frontend

Copy Project URL + anon key into `assets/supabase-config.js`.

## Local (optional, needs Docker)

```bash
npx supabase start
npx supabase db reset   # applies migrations + seed
```

## Voice ASR (NVIDIA Parakeet zh-CN)

Edge Function: `supabase/functions/transcribe-voice`

Proxies browser WAV audio to NVIDIA hosted Mandarin ASR.

```bash
# Set secret (nvapi-... from https://build.nvidia.com/settings)
npx supabase secrets set NVIDIA_API_KEY=nvapi-... --project-ref dewcjtkqykkclxwcmusg

# Deploy
npx supabase functions deploy transcribe-voice --project-ref dewcjtkqykkclxwcmusg
```

Frontend calls `QimaSupabase.transcribeVoice(wavBlob)` from `order-chat.html`.
