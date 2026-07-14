# Supabase Backend — QIMA Mini Program

## What this includes

- Postgres schema for labs, orders, recipients, files, reports
- **Complete order storage**: `orders` extended fields + view `order_full` + RPC `save_order_full`
- RLS policies (demo-friendly anon read/write; tighten for production auth)
- Seed data matching current prototype orders/reports
- Frontend helper: `assets/supabase-client.js`

### Complete order API

| Piece | Purpose |
|---|---|
| `orders` | Order master row (product, lab, shipping, electric, report extras, `form_answers` JSON snapshot) |
| `order_recipients` / `order_files` | Related contacts & uploads |
| `order_full` | Read view: order + lab + recipients[] + files[] |
| `save_order_full(payload)` | Atomic write of order + recipients + files |

Frontend:

```js
// Write
await QimaSupabase.saveFullOrder({
  order: {
    product_name: '黑色复合面料',
    project_name: 'TEMU Hardware - Seller Pay',
    origin_country: '中国',
    sales_countries: ['欧盟', '美国'],
    manufacturer_name: '…',
    manufacturer_address: '…',
    collection_method: '自行寄样',
    carrier: '顺丰',
    tracking_number: 'SF…',
    testing_location: 'hangzhou',
    source: 'chat',
    form_answers: { /* full chat answers */ }
  },
  recipients: [{ email: 'a@example.com', mail_type: 'all' }],
  files: [{ file_name: 'style.jpg', label_key: 'orderDetail.fileStyle' }]
});

// Read
await QimaSupabase.getFullOrderByRef('T-25617004');
await QimaSupabase.getFullOrders();
```

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

## Order parse + Voice ASR (Supabase Edge + NVIDIA)

Frontend calls **Supabase Edge Functions only** (no Vercel):

| Function | Purpose |
|---|---|
| `parse-order` | Multimodal OCR / label parse (NVIDIA vision + LLM) |
| `parse-waybill` | Fast shipping-label OCR (single short vision call → carrier + tracking) |
| `transcribe-voice` | Chinese ASR proxy (Whisper via upstream if configured) |

```bash
export SUPABASE_ACCESS_TOKEN=sbp_xxx   # https://supabase.com/dashboard/account/tokens

# One-time secret (NVIDIA NIM / NVCF key)
npx supabase secrets set NVIDIA_API_KEY=nvapi-xxx --project-ref dewcjtkqykkclxwcmusg

npx supabase functions deploy parse-order --project-ref dewcjtkqykkclxwcmusg
npx supabase functions deploy parse-waybill --project-ref dewcjtkqykkclxwcmusg
npx supabase functions deploy transcribe-voice --project-ref dewcjtkqykkclxwcmusg
```

Endpoints:

- `https://dewcjtkqykkclxwcmusg.supabase.co/functions/v1/parse-order`
- `https://dewcjtkqykkclxwcmusg.supabase.co/functions/v1/parse-waybill`
- `https://dewcjtkqykkclxwcmusg.supabase.co/functions/v1/transcribe-voice`

Frontend: `SUPABASE_CONFIG.parseEndpoint` / `waybillEndpoint` / `asrEndpoint` in `assets/supabase-config.js`.
Local `assets/label-parse.js` is fallback / race partner when the edge API is slow or unavailable.
