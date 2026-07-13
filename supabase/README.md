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

## Voice ASR (NVIDIA Whisper zh-CN)

Primary endpoint: Vercel Python serverless [`api/transcribe.py`](../api/transcribe.py)

NVIDIA hosted Parakeet zh-CN is **streaming-only gRPC**; offline Chinese ASR uses **Whisper Large v3** via Riva gRPC (`grpc.nvcf.nvidia.com`).

```bash
# Vercel secret
vercel env add NVIDIA_API_KEY production

# Optional: Supabase Edge proxy → Vercel
npx supabase functions deploy transcribe-voice --project-ref dewcjtkqykkclxwcmusg
```

Frontend: `QimaSupabase.transcribeVoice(wavBlob)` → `SUPABASE_CONFIG.asrEndpoint`.
