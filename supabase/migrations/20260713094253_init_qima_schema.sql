-- QIMA Mini Program schema
-- Orders, reports, labs, recipients, and uploaded files

create extension if not exists "pgcrypto";

-- ── Enums ───────────────────────────────────────────────────────────────────
do $$ begin
  create type public.order_status as enum (
    'pending_verification',
    'in_progress',
    'report_completed',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.test_type as enum ('first', 'retest', 'reorder');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_status as enum ('pass', 'fail', 'pending');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_category as enum ('lab', 'psi', 'dupro', 'fri', 'csr');
exception when duplicate_object then null; end $$;

-- ── Labs ────────────────────────────────────────────────────────────────────
create table if not exists public.labs (
  id text primary key,
  name_zh text not null,
  name_en text not null,
  address_zh text not null,
  address_en text not null,
  recipient text not null default '样品组',
  phone text not null,
  created_at timestamptz not null default now()
);

-- ── Profiles (optional link to auth.users) ──────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  company text,
  locale text not null default 'zh',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Orders ──────────────────────────────────────────────────────────────────
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  application_no text unique not null,
  order_ref text unique not null,
  user_id uuid references public.profiles(id) on delete set null,
  status public.order_status not null default 'pending_verification',
  service_type text not null default '实验室检测',
  category text,
  product_name text not null,
  test_type public.test_type not null default 'first',
  testing_location text references public.labs(id),
  supplier_name text,
  product_ref_no text,
  po_number text,
  sku_value text,
  material text,
  age_grade text,
  project_name text,
  origin_country text,
  sales_countries text[] not null default '{}',
  turnaround_time text,
  need_quotation boolean not null default false,
  manufacturer_name text,
  item_model text,
  fibre_content text,
  color_value text,
  product_type text,
  sun_lens_cat text,
  ean_code text,
  brand text,
  batch_number text,
  spu_id text,
  skc_id text,
  collection_method text,
  order_remark text,
  ordered_at date,
  report_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_user_id_idx on public.orders(user_id);
create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_ordered_at_idx on public.orders(ordered_at desc);

-- ── Order recipients ────────────────────────────────────────────────────────
create table if not exists public.order_recipients (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  email text not null,
  mail_type text not null default 'all',
  created_at timestamptz not null default now()
);

create index if not exists order_recipients_order_id_idx on public.order_recipients(order_id);

-- ── Order files ─────────────────────────────────────────────────────────────
create table if not exists public.order_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  file_name text not null,
  file_type text,
  storage_path text,
  label_key text,
  created_at timestamptz not null default now()
);

create index if not exists order_files_order_id_idx on public.order_files(order_id);

-- ── Reports ─────────────────────────────────────────────────────────────────
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  report_no text unique not null,
  order_id uuid references public.orders(id) on delete set null,
  category public.report_category not null default 'lab',
  product_name_zh text not null,
  product_name_en text not null,
  sku text,
  status public.report_status not null default 'pending',
  report_date date,
  preview_page1_path text,
  preview_page2_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reports_category_idx on public.reports(category);
create index if not exists reports_status_idx on public.reports(status);
create index if not exists reports_report_date_idx on public.reports(report_date desc);

-- ── updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

drop trigger if exists reports_set_updated_at on public.reports;
create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.labs enable row level security;
alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_recipients enable row level security;
alter table public.order_files enable row level security;
alter table public.reports enable row level security;

-- Prototype: allow anon read for demo pages; tighten later for production auth
create policy "labs_public_read" on public.labs
  for select to anon, authenticated using (true);

create policy "reports_public_read" on public.reports
  for select to anon, authenticated using (true);

create policy "orders_public_read" on public.orders
  for select to anon, authenticated using (true);

create policy "order_recipients_public_read" on public.order_recipients
  for select to anon, authenticated using (true);

create policy "order_files_public_read" on public.order_files
  for select to anon, authenticated using (true);

create policy "orders_anon_insert" on public.orders
  for insert to anon, authenticated with check (true);

create policy "orders_anon_update" on public.orders
  for update to anon, authenticated using (true) with check (true);

create policy "order_recipients_anon_write" on public.order_recipients
  for all to anon, authenticated using (true) with check (true);

create policy "order_files_anon_write" on public.order_files
  for all to anon, authenticated using (true) with check (true);

create policy "profiles_own_read" on public.profiles
  for select to authenticated using (auth.uid() = id);

create policy "profiles_own_upsert" on public.profiles
  for all to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- ── Storage bucket for report PDFs / uploads (public read for demo) ─────────
insert into storage.buckets (id, name, public)
values ('report-previews', 'report-previews', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('order-uploads', 'order-uploads', false)
on conflict (id) do nothing;

create policy "report_previews_public_read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'report-previews');

create policy "order_uploads_auth_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'order-uploads');

create policy "order_uploads_anon_insert"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'order-uploads');
