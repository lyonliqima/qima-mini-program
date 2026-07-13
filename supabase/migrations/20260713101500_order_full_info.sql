-- Complete order info: extend orders + read view + atomic save RPC
-- Aligns DB with order-chat / order-detail fields that were missing from init schema.

-- ── Extra columns on orders ─────────────────────────────────────────────────
alter table public.orders
  add column if not exists manufacturer_address text,
  add column if not exists carrier text,
  add column if not exists tracking_number text,
  add column if not exists shipping_remark text,
  add column if not exists is_electric boolean not null default false,
  add column if not exists electric_description text,
  add column if not exists need_report_fields boolean not null default false,
  add column if not exists report_fields_detail text,
  add column if not exists testing_lab_address text,
  add column if not exists inspection_order_ref text,
  add column if not exists source text not null default 'manual',
  add column if not exists form_answers jsonb not null default '{}'::jsonb;

comment on column public.orders.manufacturer_address is '制造商地址';
comment on column public.orders.carrier is '寄送承运商';
comment on column public.orders.tracking_number is '运单号';
comment on column public.orders.shipping_remark is '寄送备注';
comment on column public.orders.is_electric is '是否带电产品';
comment on column public.orders.electric_description is '带电产品说明';
comment on column public.orders.need_report_fields is '报告是否需要额外字段';
comment on column public.orders.report_fields_detail is '报告额外字段内容';
comment on column public.orders.testing_lab_address is '检测实验室地址快照';
comment on column public.orders.inspection_order_ref is '验货订单参考号（取样场景）';
comment on column public.orders.source is '下单来源：manual / chat / reorder / retest / form';
comment on column public.orders.form_answers is '下单表单完整答案快照（JSONB）';

create index if not exists orders_tracking_number_idx
  on public.orders(tracking_number)
  where tracking_number is not null;

create index if not exists orders_source_idx on public.orders(source);

-- ── Full order read view (orders + lab + recipients + files) ────────────────
create or replace view public.order_full
with (security_invoker = true)
as
select
  o.*,
  l.name_zh as lab_name_zh,
  l.name_en as lab_name_en,
  l.address_zh as lab_address_zh,
  l.address_en as lab_address_en,
  l.phone as lab_phone,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'email', r.email,
          'mail_type', r.mail_type,
          'created_at', r.created_at
        )
        order by r.created_at
      )
      from public.order_recipients r
      where r.order_id = o.id
    ),
    '[]'::jsonb
  ) as recipients,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', f.id,
          'file_name', f.file_name,
          'file_type', f.file_type,
          'storage_path', f.storage_path,
          'label_key', f.label_key,
          'created_at', f.created_at
        )
        order by f.created_at
      )
      from public.order_files f
      where f.order_id = o.id
    ),
    '[]'::jsonb
  ) as files
from public.orders o
left join public.labs l on l.id = o.testing_location;

comment on view public.order_full is '订单完整信息视图：主表 + 实验室 + 收件人 + 附件';

grant select on public.order_full to anon, authenticated;

-- View uses underlying table RLS via security_invoker; no separate RLS on views.

-- ── Atomic save: order + recipients + files ─────────────────────────────────
create or replace function public.save_order_full(payload jsonb)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  order_data jsonb := coalesce(payload->'order', payload);
  recipients jsonb := coalesce(payload->'recipients', '[]'::jsonb);
  files jsonb := coalesce(payload->'files', '[]'::jsonb);
  rec jsonb;
  fil jsonb;
  app_no text;
  ord_ref text;
begin
  if order_data is null or jsonb_typeof(order_data) <> 'object' then
    raise exception 'payload.order is required';
  end if;

  app_no := nullif(trim(coalesce(order_data->>'application_no', '')), '');
  ord_ref := nullif(trim(coalesce(order_data->>'order_ref', '')), '');

  if app_no is null then
    app_no := to_char(now(), 'YYYYMMDDHH24MISS') || lpad((floor(random() * 1000))::int::text, 3, '0');
  end if;
  if ord_ref is null then
    ord_ref := 'T-' || to_char(now(), 'YYMMDD') || lpad((floor(random() * 10000))::int::text, 4, '0');
  end if;

  insert into public.orders (
    application_no,
    order_ref,
    user_id,
    status,
    service_type,
    category,
    product_name,
    test_type,
    testing_location,
    supplier_name,
    product_ref_no,
    po_number,
    sku_value,
    material,
    age_grade,
    project_name,
    origin_country,
    sales_countries,
    turnaround_time,
    need_quotation,
    manufacturer_name,
    manufacturer_address,
    item_model,
    fibre_content,
    color_value,
    product_type,
    sun_lens_cat,
    ean_code,
    brand,
    batch_number,
    spu_id,
    skc_id,
    collection_method,
    order_remark,
    ordered_at,
    report_date,
    carrier,
    tracking_number,
    shipping_remark,
    is_electric,
    electric_description,
    need_report_fields,
    report_fields_detail,
    testing_lab_address,
    inspection_order_ref,
    source,
    form_answers
  ) values (
    app_no,
    ord_ref,
    nullif(order_data->>'user_id', '')::uuid,
    coalesce((order_data->>'status')::public.order_status, 'pending_verification'),
    coalesce(nullif(order_data->>'service_type', ''), '实验室检测'),
    nullif(order_data->>'category', ''),
    coalesce(nullif(order_data->>'product_name', ''), '未命名产品'),
    coalesce((order_data->>'test_type')::public.test_type, 'first'),
    nullif(order_data->>'testing_location', ''),
    nullif(order_data->>'supplier_name', ''),
    nullif(order_data->>'product_ref_no', ''),
    nullif(order_data->>'po_number', ''),
    nullif(order_data->>'sku_value', ''),
    nullif(order_data->>'material', ''),
    nullif(order_data->>'age_grade', ''),
    nullif(order_data->>'project_name', ''),
    nullif(order_data->>'origin_country', ''),
    case
      when order_data ? 'sales_countries' and jsonb_typeof(order_data->'sales_countries') = 'array'
        then array(select jsonb_array_elements_text(order_data->'sales_countries'))
      when nullif(order_data->>'sales_countries', '') is not null
        then string_to_array(order_data->>'sales_countries', ',')
      else '{}'::text[]
    end,
    nullif(order_data->>'turnaround_time', ''),
    coalesce((order_data->>'need_quotation')::boolean, false),
    nullif(order_data->>'manufacturer_name', ''),
    nullif(order_data->>'manufacturer_address', ''),
    nullif(order_data->>'item_model', ''),
    nullif(order_data->>'fibre_content', ''),
    nullif(order_data->>'color_value', ''),
    nullif(order_data->>'product_type', ''),
    nullif(order_data->>'sun_lens_cat', ''),
    nullif(order_data->>'ean_code', ''),
    nullif(order_data->>'brand', ''),
    nullif(order_data->>'batch_number', ''),
    nullif(order_data->>'spu_id', ''),
    nullif(order_data->>'skc_id', ''),
    nullif(order_data->>'collection_method', ''),
    nullif(order_data->>'order_remark', ''),
    coalesce((order_data->>'ordered_at')::date, current_date),
    nullif(order_data->>'report_date', '')::date,
    nullif(order_data->>'carrier', ''),
    nullif(order_data->>'tracking_number', ''),
    nullif(order_data->>'shipping_remark', ''),
    coalesce((order_data->>'is_electric')::boolean, false),
    nullif(order_data->>'electric_description', ''),
    coalesce((order_data->>'need_report_fields')::boolean, false),
    nullif(order_data->>'report_fields_detail', ''),
    nullif(order_data->>'testing_lab_address', ''),
    nullif(order_data->>'inspection_order_ref', ''),
    coalesce(nullif(order_data->>'source', ''), 'manual'),
    coalesce(order_data->'form_answers', '{}'::jsonb)
  )
  returning * into order_row;

  if jsonb_typeof(recipients) = 'array' then
    for rec in select * from jsonb_array_elements(recipients)
    loop
      if nullif(trim(coalesce(rec->>'email', '')), '') is not null then
        insert into public.order_recipients (order_id, email, mail_type)
        values (
          order_row.id,
          trim(rec->>'email'),
          coalesce(nullif(rec->>'mail_type', ''), 'all')
        );
      end if;
    end loop;
  end if;

  if jsonb_typeof(files) = 'array' then
    for fil in select * from jsonb_array_elements(files)
    loop
      if nullif(trim(coalesce(fil->>'file_name', '')), '') is not null then
        insert into public.order_files (
          order_id, file_name, file_type, storage_path, label_key
        ) values (
          order_row.id,
          trim(fil->>'file_name'),
          nullif(fil->>'file_type', ''),
          nullif(fil->>'storage_path', ''),
          nullif(fil->>'label_key', '')
        );
      end if;
    end loop;
  end if;

  return order_row;
end;
$$;

comment on function public.save_order_full(jsonb) is
  '原子写入完整订单：主表字段 + recipients[] + files[]；可附带 form_answers 快照';

grant execute on function public.save_order_full(jsonb) to anon, authenticated;
