-- 食品工廠 ERP：Supabase / Postgres schema（由 src/db/schema.js 產生）

-- 角色與權限
create table if not exists public.roles (
  id text primary key,
  name text,
  perms jsonb,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.roles enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "roles_all" on public.roles;
create policy "roles_all" on public.roles for all using (true) with check (true);

-- 使用者
create table if not exists public.users (
  id text primary key,
  name text,
  role_id text,
  pin text,
  active boolean,
  phone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists users_role_id_idx on public.users (role_id);
alter table public.users enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "users_all" on public.users;
create policy "users_all" on public.users for all using (true) with check (true);

-- 系統設定
create table if not exists public.settings (
  id text primary key,
  key text,
  value jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.settings enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "settings_all" on public.settings;
create policy "settings_all" on public.settings for all using (true) with check (true);

-- 簽核
create table if not exists public.approvals (
  id text primary key,
  no text,
  type text,
  module text,
  ref_table text,
  ref_id text,
  summary text,
  amount numeric,
  reason text,
  payload jsonb,
  status text,
  requested_by text,
  decided_by text,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.approvals enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "approvals_all" on public.approvals;
create policy "approvals_all" on public.approvals for all using (true) with check (true);

-- 通知綁定（LINE / Telegram）
create table if not exists public.notify_contacts (
  id text primary key,
  channel text,
  external_id text,
  display_name text,
  picture_url text,
  state text,
  status text,
  requested_role_id text,
  requested_name text,
  user_id text,
  muted boolean,
  approved_by text,
  approved_at timestamptz,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists notify_contacts_requested_role_id_idx on public.notify_contacts (requested_role_id);
create index if not exists notify_contacts_user_id_idx on public.notify_contacts (user_id);
create index if not exists notify_contacts_approved_by_idx on public.notify_contacts (approved_by);
create unique index if not exists notify_contacts_channel_ext_idx on public.notify_contacts (channel, external_id);
alter table public.notify_contacts enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "notify_contacts_all" on public.notify_contacts;
create policy "notify_contacts_all" on public.notify_contacts for all using (true) with check (true);

-- 通知發送紀錄
create table if not exists public.notifications (
  id text primary key,
  event text,
  title text,
  body text,
  link text,
  user_ids jsonb,
  contact_ids jsonb,
  status text,
  results jsonb,
  sent_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists notifications_status_idx on public.notifications (status, created_at);
alter table public.notifications enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "notifications_all" on public.notifications;
create policy "notifications_all" on public.notifications for all using (true) with check (true);

-- 操作紀錄
create table if not exists public.audit_log (
  id text primary key,
  at timestamptz,
  user_name text,
  action text,
  table_name text,
  row_id text,
  summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.audit_log enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "audit_log_all" on public.audit_log;
create policy "audit_log_all" on public.audit_log for all using (true) with check (true);

-- 品項（原料/包材/成品）
create table if not exists public.items (
  id text primary key,
  code text,
  name text,
  type text,
  unit text,
  spec text,
  barcode text,
  alt_unit text,
  alt_factor numeric,
  price numeric,
  min_price numeric,
  cost numeric,
  safety_stock numeric,
  pack_per_box numeric,
  shelf_days integer,
  temp_zone text,
  default_bin_id text,
  iqc_required boolean,
  pos_enabled boolean,
  pos_price numeric,
  bom jsonb,
  active boolean,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists items_default_bin_id_idx on public.items (default_bin_id);
alter table public.items enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "items_all" on public.items;
create policy "items_all" on public.items for all using (true) with check (true);

-- 倉庫
create table if not exists public.warehouses (
  id text primary key,
  code text,
  name text,
  kind text,
  temp_zone text,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.warehouses enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "warehouses_all" on public.warehouses;
create policy "warehouses_all" on public.warehouses for all using (true) with check (true);

-- 儲位
create table if not exists public.bins (
  id text primary key,
  code text,
  warehouse_id text,
  name text,
  capacity numeric,
  active boolean,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists bins_warehouse_id_idx on public.bins (warehouse_id);
alter table public.bins enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "bins_all" on public.bins;
create policy "bins_all" on public.bins for all using (true) with check (true);

-- 客戶 / 會員
create table if not exists public.customers (
  id text primary key,
  code text,
  name text,
  kind text,
  level text,
  status text,
  contact text,
  phone text,
  email text,
  address text,
  tax_id text,
  terms_days integer,
  credit_limit numeric,
  min_shelf_days integer,
  price_list_id text,
  owner_id text,
  source text,
  tags text,
  contacts jsonb,
  points numeric,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists customers_price_list_id_idx on public.customers (price_list_id);
create index if not exists customers_owner_id_idx on public.customers (owner_id);
alter table public.customers enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "customers_all" on public.customers;
create policy "customers_all" on public.customers for all using (true) with check (true);

-- 價格表
create table if not exists public.price_lists (
  id text primary key,
  name text,
  lines jsonb,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.price_lists enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "price_lists_all" on public.price_lists;
create policy "price_lists_all" on public.price_lists for all using (true) with check (true);

-- 客戶互動紀錄
create table if not exists public.activities (
  id text primary key,
  customer_id text,
  opportunity_id text,
  type text,
  date date,
  summary text,
  next_action text,
  next_date date,
  done boolean,
  user_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists activities_customer_id_idx on public.activities (customer_id);
create index if not exists activities_opportunity_id_idx on public.activities (opportunity_id);
create index if not exists activities_user_id_idx on public.activities (user_id);
alter table public.activities enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "activities_all" on public.activities;
create policy "activities_all" on public.activities for all using (true) with check (true);

-- 商機
create table if not exists public.opportunities (
  id text primary key,
  customer_id text,
  title text,
  stage text,
  amount numeric,
  probability numeric,
  expected_date date,
  owner_id text,
  lost_reason text,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists opportunities_customer_id_idx on public.opportunities (customer_id);
create index if not exists opportunities_owner_id_idx on public.opportunities (owner_id);
alter table public.opportunities enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "opportunities_all" on public.opportunities;
create policy "opportunities_all" on public.opportunities for all using (true) with check (true);

-- 報價單
create table if not exists public.quotations (
  id text primary key,
  no text,
  customer_id text,
  opportunity_id text,
  sales_order_id text,
  date date,
  valid_until date,
  status text,
  lines jsonb,
  total numeric,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists quotations_customer_id_idx on public.quotations (customer_id);
create index if not exists quotations_opportunity_id_idx on public.quotations (opportunity_id);
create index if not exists quotations_sales_order_id_idx on public.quotations (sales_order_id);
alter table public.quotations enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "quotations_all" on public.quotations;
create policy "quotations_all" on public.quotations for all using (true) with check (true);

-- 供應商
create table if not exists public.suppliers (
  id text primary key,
  code text,
  name text,
  contact text,
  phone text,
  address text,
  tax_id text,
  terms_days integer,
  certs text,
  rating text,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.suppliers enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "suppliers_all" on public.suppliers;
create policy "suppliers_all" on public.suppliers for all using (true) with check (true);

-- 銷售訂單
create table if not exists public.sales_orders (
  id text primary key,
  no text,
  customer_id text,
  quotation_id text,
  date date,
  due_date date,
  status text,
  lines jsonb,
  total numeric,
  approved_total numeric,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sales_orders_customer_id_idx on public.sales_orders (customer_id);
create index if not exists sales_orders_quotation_id_idx on public.sales_orders (quotation_id);
alter table public.sales_orders enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "sales_orders_all" on public.sales_orders;
create policy "sales_orders_all" on public.sales_orders for all using (true) with check (true);

-- 採購單
create table if not exists public.purchase_orders (
  id text primary key,
  no text,
  supplier_id text,
  sales_order_id text,
  date date,
  due_date date,
  status text,
  lines jsonb,
  total numeric,
  approved_total numeric,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists purchase_orders_supplier_id_idx on public.purchase_orders (supplier_id);
create index if not exists purchase_orders_sales_order_id_idx on public.purchase_orders (sales_order_id);
alter table public.purchase_orders enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "purchase_orders_all" on public.purchase_orders;
create policy "purchase_orders_all" on public.purchase_orders for all using (true) with check (true);

-- 生產工單
create table if not exists public.work_orders (
  id text primary key,
  no text,
  sales_order_id text,
  product_id text,
  plan_qty numeric,
  plan_date date,
  line text,
  status text,
  lot_no text,
  feeds jsonb,
  output_qty numeric,
  waste_qty numeric,
  std_cost numeric,
  start_at timestamptz,
  end_at timestamptz,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists work_orders_sales_order_id_idx on public.work_orders (sales_order_id);
create index if not exists work_orders_product_id_idx on public.work_orders (product_id);
alter table public.work_orders enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "work_orders_all" on public.work_orders;
create policy "work_orders_all" on public.work_orders for all using (true) with check (true);

-- 批號（原料/成品）
create table if not exists public.lots (
  id text primary key,
  lot_no text,
  kind text,
  item_id text,
  supplier_id text,
  supplier_lot text,
  purchase_order_id text,
  work_order_id text,
  qty numeric,
  unit_cost numeric,
  qc_status text,
  mfg_date date,
  exp_date date,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists lots_item_id_idx on public.lots (item_id);
create index if not exists lots_supplier_id_idx on public.lots (supplier_id);
create index if not exists lots_purchase_order_id_idx on public.lots (purchase_order_id);
create index if not exists lots_work_order_id_idx on public.lots (work_order_id);
alter table public.lots enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "lots_all" on public.lots;
create policy "lots_all" on public.lots for all using (true) with check (true);

-- 庫存異動
create table if not exists public.stock_moves (
  id text primary key,
  date timestamptz,
  doc_date date,
  item_id text,
  lot_no text,
  bin_id text,
  from_bin_id text,
  qty numeric,
  type text,
  unit_cost numeric,
  ref_type text,
  ref_id text,
  note text,
  user_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists stock_moves_item_id_idx on public.stock_moves (item_id);
create index if not exists stock_moves_bin_id_idx on public.stock_moves (bin_id);
create index if not exists stock_moves_from_bin_id_idx on public.stock_moves (from_bin_id);
alter table public.stock_moves enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "stock_moves_all" on public.stock_moves;
create policy "stock_moves_all" on public.stock_moves for all using (true) with check (true);

-- 調撥單
create table if not exists public.transfers (
  id text primary key,
  no text,
  date date,
  from_bin_id text,
  to_bin_id text,
  lines jsonb,
  reason text,
  user_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists transfers_from_bin_id_idx on public.transfers (from_bin_id);
create index if not exists transfers_to_bin_id_idx on public.transfers (to_bin_id);
alter table public.transfers enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "transfers_all" on public.transfers;
create policy "transfers_all" on public.transfers for all using (true) with check (true);

-- 盤點單
create table if not exists public.stocktakes (
  id text primary key,
  no text,
  date date,
  warehouse_id text,
  status text,
  lines jsonb,
  note text,
  user_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists stocktakes_warehouse_id_idx on public.stocktakes (warehouse_id);
alter table public.stocktakes enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "stocktakes_all" on public.stocktakes;
create policy "stocktakes_all" on public.stocktakes for all using (true) with check (true);

-- QC 檢驗
create table if not exists public.qc_inspections (
  id text primary key,
  no text,
  kind text,
  lot_no text,
  item_id text,
  work_order_id text,
  date date,
  sample_size numeric,
  defect_qty numeric,
  checks jsonb,
  result text,
  inspector text,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists qc_inspections_item_id_idx on public.qc_inspections (item_id);
create index if not exists qc_inspections_work_order_id_idx on public.qc_inspections (work_order_id);
alter table public.qc_inspections enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "qc_inspections_all" on public.qc_inspections;
create policy "qc_inspections_all" on public.qc_inspections for all using (true) with check (true);

-- 出貨單
create table if not exists public.shipments (
  id text primary key,
  no text,
  sales_order_id text,
  customer_id text,
  date date,
  lines jsonb,
  boxes numeric,
  pack_mode text,
  container_no text,
  carrier text,
  address text,
  status text,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists shipments_sales_order_id_idx on public.shipments (sales_order_id);
create index if not exists shipments_customer_id_idx on public.shipments (customer_id);
alter table public.shipments enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "shipments_all" on public.shipments;
create policy "shipments_all" on public.shipments for all using (true) with check (true);

-- 退貨單
create table if not exists public.returns (
  id text primary key,
  no text,
  kind text,
  customer_id text,
  supplier_id text,
  shipment_id text,
  invoice_id text,
  bill_id text,
  date date,
  lines jsonb,
  disposition text,
  reason text,
  amount numeric,
  tax numeric,
  status text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists returns_customer_id_idx on public.returns (customer_id);
create index if not exists returns_supplier_id_idx on public.returns (supplier_id);
create index if not exists returns_shipment_id_idx on public.returns (shipment_id);
create index if not exists returns_invoice_id_idx on public.returns (invoice_id);
create index if not exists returns_bill_id_idx on public.returns (bill_id);
alter table public.returns enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "returns_all" on public.returns;
create policy "returns_all" on public.returns for all using (true) with check (true);

-- POS 班別
create table if not exists public.pos_shifts (
  id text primary key,
  no text,
  bin_id text,
  opened_by text,
  opened_at timestamptz,
  opening_cash numeric,
  closed_by text,
  closed_at timestamptz,
  expected_cash numeric,
  counted_cash numeric,
  diff numeric,
  status text,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists pos_shifts_bin_id_idx on public.pos_shifts (bin_id);
alter table public.pos_shifts enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "pos_shifts_all" on public.pos_shifts;
create policy "pos_shifts_all" on public.pos_shifts for all using (true) with check (true);

-- POS 銷售
create table if not exists public.pos_sales (
  id text primary key,
  no text,
  gui_no text,
  shift_id text,
  customer_id text,
  date date,
  at timestamptz,
  lines jsonb,
  discount numeric,
  total numeric,
  tax numeric,
  method text,
  received numeric,
  change numeric,
  points numeric,
  cashier text,
  status text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists pos_sales_shift_id_idx on public.pos_sales (shift_id);
create index if not exists pos_sales_customer_id_idx on public.pos_sales (customer_id);
alter table public.pos_sales enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "pos_sales_all" on public.pos_sales;
create policy "pos_sales_all" on public.pos_sales for all using (true) with check (true);

-- 應收（發票）
create table if not exists public.invoices (
  id text primary key,
  no text,
  gui_no text,
  customer_id text,
  sales_order_id text,
  shipment_id text,
  date date,
  due_date date,
  amount numeric,
  tax numeric,
  total numeric,
  paid numeric,
  credited numeric,
  status text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists invoices_customer_id_idx on public.invoices (customer_id);
create index if not exists invoices_sales_order_id_idx on public.invoices (sales_order_id);
create index if not exists invoices_shipment_id_idx on public.invoices (shipment_id);
alter table public.invoices enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "invoices_all" on public.invoices;
create policy "invoices_all" on public.invoices for all using (true) with check (true);

-- 應付（進貨帳款）
create table if not exists public.bills (
  id text primary key,
  no text,
  supplier_id text,
  purchase_order_id text,
  date date,
  due_date date,
  amount numeric,
  tax numeric,
  total numeric,
  paid numeric,
  credited numeric,
  status text,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists bills_supplier_id_idx on public.bills (supplier_id);
create index if not exists bills_purchase_order_id_idx on public.bills (purchase_order_id);
alter table public.bills enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "bills_all" on public.bills;
create policy "bills_all" on public.bills for all using (true) with check (true);

-- 收付款
create table if not exists public.payments (
  id text primary key,
  no text,
  kind text,
  invoice_id text,
  bill_id text,
  party_id text,
  date date,
  amount numeric,
  method text,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists payments_invoice_id_idx on public.payments (invoice_id);
create index if not exists payments_bill_id_idx on public.payments (bill_id);
alter table public.payments enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "payments_all" on public.payments;
create policy "payments_all" on public.payments for all using (true) with check (true);

-- 會計傳票
create table if not exists public.journal (
  id text primary key,
  no text,
  date date,
  memo text,
  lines jsonb,
  ref_type text,
  ref_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.journal enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "journal_all" on public.journal;
create policy "journal_all" on public.journal for all using (true) with check (true);

