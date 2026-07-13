-- Seed data for QIMA mini program prototype

insert into public.labs (id, name_zh, name_en, address_zh, address_en, recipient, phone) values
  (
    'hangzhou',
    '杭州实验室',
    'Hangzhou Lab',
    '浙江省杭州市萧山区经济技术开发区建设三路 733 号 QIMA 启迈实验室',
    'QIMA Lab, No. 733 Jianshe San Road, Xiaoshan Economic & Technological Development Zone, Hangzhou, Zhejiang',
    '样品组',
    '+86 571 8999 7158'
  ),
  (
    'shanghai',
    '上海实验室',
    'Shanghai Lab',
    '上海市浦东新区张江高科技园区科苑路 88 号 QIMA 启迈实验室',
    'QIMA Lab, No. 88 Keyuan Road, Zhangjiang Hi-Tech Park, Pudong, Shanghai',
    '样品组',
    '+86 21 6072 5688'
  ),
  (
    'dongguan',
    '东莞实验室',
    'Dongguan Lab',
    '广东省东莞市松山湖高新技术产业开发区工业南路 8 号 QIMA 启迈实验室',
    'QIMA Lab, No. 8 Gongye South Road, Songshan Lake Hi-Tech Industrial Development Zone, Dongguan, Guangdong',
    '样品组',
    '+86 769 8920 1868'
  )
on conflict (id) do update set
  name_zh = excluded.name_zh,
  name_en = excluded.name_en,
  address_zh = excluded.address_zh,
  address_en = excluded.address_en,
  recipient = excluded.recipient,
  phone = excluded.phone;

insert into public.orders (
  application_no, order_ref, status, service_type, category, product_name,
  test_type, testing_location, supplier_name, po_number, material, project_name,
  origin_country, sales_countries, turnaround_time, need_quotation,
  manufacturer_name, item_model, ean_code, brand, collection_method,
  ordered_at, report_date
) values
  (
    '08008571', 'T-25617004', 'pending_verification', '实验室检测', 'Textile', '黑色复合面料',
    'first', 'hangzhou', 'Shenzhen Zhichuang Co., Ltd.', 'PO-7845120', 'Polyester / Spandex',
    'TEMU Hardware - Seller Pay（商家付款）', '中国', array['欧盟','美国'], '7 Day Regular', false,
    'QIMA Sample Manufacturer', 'T-25617004', '6 901234 567890', 'QIMA Sample',
    '启迈 QIMA 将在执行产品服务时收集样本', '2026-06-03', null
  ),
  (
    '080082671', 'T-26356800-11-R', 'report_completed', '实验室检测', 'Textile', '黑色机织面料',
    'retest', 'hangzhou', 'Shenzhen Textile Supplier Co., Ltd.', 'PO-26356800', '100% Polyester',
    'TEMU Hardware - Seller Pay（商家付款）', '中国', array['欧盟'], '7 Day Regular', false,
    'QIMA Textile Factory', 'T-26356800-11-R', null, 'QIMA Sample',
    null, '2026-06-03', '2026-06-03'
  ),
  (
    '08008536', 'T-25617036', 'pending_verification', '实验室检测', 'Textile', '灰色针织面料',
    'first', 'hangzhou', 'Vietnam Fabric Supplier Ltd.', 'PI-2026-036', 'Cotton / Spandex',
    '通用检测项目', '越南', array['美国','加拿大'], '7 Day Regular', false,
    'QIMA Knitwear Factory', 'T-25617036', null, 'QIMA Sample',
    null, '2026-06-02', null
  )
on conflict (application_no) do nothing;

insert into public.order_recipients (order_id, email, mail_type)
select o.id, '850600530@qq.com', 'all'
from public.orders o
where o.application_no = '08008571'
  and not exists (
    select 1 from public.order_recipients r
    where r.order_id = o.id and r.email = '850600530@qq.com'
  );

insert into public.reports (
  report_no, category, product_name_zh, product_name_en, sku, status, report_date,
  preview_page1_path, preview_page2_path
) values
  (
    'T-24106085-11-R1', 'lab', '玩具安全检测', 'Toy safety testing', 'SKU-65120', 'pass', '2026-06-03',
    'assets/report-pdf-preview.png', 'assets/report-pdf-preview-page2.png'
  ),
  (
    'T-24106088-11-R1', 'lab', '硬线检测', 'Hardline testing', 'SKU-43902', 'pending', '2026-05-20',
    'assets/report-pdf-preview.png', 'assets/report-pdf-preview-page2.png'
  ),
  (
    'T-24106086-11-R1', 'dupro', '纺织品检测', 'Textile testing', 'SKU-77321', 'fail', '2026-06-02',
    'assets/report-pdf-preview.png', null
  ),
  (
    'T-24106087-11-R1', 'fri', '电子产品检测', 'Electronics testing', 'SKU-51840', 'pass', '2026-05-28',
    'assets/report-pdf-preview.png', null
  ),
  (
    'T-24106089-11-R1', 'csr', '食品接触检测', 'Food-contact testing', 'SKU-38771', 'pass', '2026-05-12',
    'assets/report-pdf-preview.png', null
  ),
  (
    'T-24106090-11-R1', 'psi', '装运前检测', 'Pre-shipment inspection', 'SKU-89231', 'pass', '2026-06-03',
    'assets/report-pdf-preview.png', null
  )
on conflict (report_no) do update set
  category = excluded.category,
  product_name_zh = excluded.product_name_zh,
  product_name_en = excluded.product_name_en,
  sku = excluded.sku,
  status = excluded.status,
  report_date = excluded.report_date;
