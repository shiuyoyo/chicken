-- 工廠 ERP：Supabase / Postgres schema（由 src/db/schema.js 產生）

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

-- 使用者
create table if not exists public.users (
  id text primary key,
  name text,
  role_id text,
  pin text,
  active boolean,
  phone text,
  email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists users_role_id_idx on public.users (role_id);
alter table public.users enable row level security;

-- 系統設定
create table if not exists public.settings (
  id text primary key,
  key text,
  value jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.settings enable row level security;

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

-- 品項（原料/包材零件/半成品/成品）
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
  qc_required boolean,
  qc_template text,
  exp_rule text,
  category text,
  family_code text,
  variant_attr text,
  variant_value text,
  pos_enabled boolean,
  pos_price numeric,
  bom jsonb,
  active boolean,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists items_default_bin_id_idx on public.items (default_bin_id);
alter table public.items enable row level security;

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

-- 請購單
create table if not exists public.requisitions (
  id text primary key,
  no text,
  date date,
  need_date date,
  requester_id text,
  status text,
  lines jsonb,
  reason text,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists requisitions_requester_id_idx on public.requisitions (requester_id);
alter table public.requisitions enable row level security;

-- 採購單
create table if not exists public.purchase_orders (
  id text primary key,
  no text,
  supplier_id text,
  sales_order_id text,
  requisition_id text,
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
create index if not exists purchase_orders_requisition_id_idx on public.purchase_orders (requisition_id);
alter table public.purchase_orders enable row level security;

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

-- 庫存異動
create table if not exists public.stock_moves (
  id text primary key,
  date timestamptz,
  doc_date date,
  doc_no text,
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
  receipt_no text,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists bills_supplier_id_idx on public.bills (supplier_id);
create index if not exists bills_purchase_order_id_idx on public.bills (purchase_order_id);
alter table public.bills enable row level security;

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


-- ======================================================================
-- 權限與伺服器端規則
-- ======================================================================
-- 系統擁有者（第一次設定、還原備份用）：只能在 SQL Editor 新增，網頁讀不到這張表
create schema if not exists erp_private;
create table if not exists erp_private.owners (email text primary key);
revoke all on schema erp_private from public;
alter table public.users add column if not exists email text;
create unique index if not exists users_email_idx on public.users (lower(email)) where email is not null and email <> '';

-- 目前登入者已驗證的 Email（沒驗證過信箱的帳號不算）
create or replace function public.erp_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null
$$;
create or replace function public.erp_is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from erp_private.owners o where lower(o.email) = public.erp_email())
$$;
-- 對應到系統裡的哪一位員工（users.email）
create or replace function public.erp_user_id() returns text
language sql stable security definer set search_path = '' as $$
  select u.id from public.users u
  where public.erp_email() is not null and lower(u.email) = public.erp_email() and coalesce(u.active, true)
  limit 1
$$;
create or replace function public.erp_is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.erp_is_owner() or public.erp_user_id() is not null
$$;
-- 某模組的權限等級 0 無 / 1 檢視 / 2 編輯 / 3 核准
create or replace function public.erp_level(m text) returns int
language sql stable security definer set search_path = '' as $$
  select case when public.erp_is_owner() then 3 else coalesce((
    select case when jsonb_typeof(r.perms -> m) = 'number' then (r.perms ->> m)::int else 0 end
    from public.users u join public.roles r on r.id = u.role_id where u.id = public.erp_user_id()
  ), 0) end
$$;
create or replace function public.erp_can_write(mods text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.erp_is_owner() or exists (select 1 from unnest(mods) m where public.erp_level(m) >= 2)
$$;
create or replace function public.erp_can_write_setting(k text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when k = 'gui_next' then public.erp_can_write(array['accounting', 'shipping', 'sales', 'pos'])
    when k = 'closed_until' then public.erp_level('accounting') >= 3 or public.erp_level('admin') >= 3
    when k = 'qc_templates' then public.erp_level('qc') >= 3 or public.erp_level('admin') >= 2
    else public.erp_level('admin') >= 2
  end
$$;
-- 不檢查的情況：SQL Editor / service role（Edge Function），或系統擁有者正在還原備份
create or replace function public.erp_bypass() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'role', '') not in ('authenticated', 'anon')
    or (coalesce(current_setting('erp.restore', true), '') = 'on' and public.erp_is_owner())
$$;
create or replace function public.erp_setting(k text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select value from public.settings where key = k limit 1
$$;
create or replace function public.erp_closed_until() returns date
language sql stable security definer set search_path = '' as $$
  select nullif(public.erp_setting('closed_until') #>> '{}', '')::date
$$;

-- 角色與權限
drop policy if exists "roles_all" on public.roles;
drop policy if exists "roles_read" on public.roles;
drop policy if exists "roles_insert" on public.roles;
drop policy if exists "roles_update" on public.roles;
drop policy if exists "roles_delete" on public.roles;
create policy "roles_read" on public.roles for select to authenticated using (public.erp_is_member());
create policy "roles_insert" on public.roles for insert to authenticated with check (public.erp_can_write(array['admin']));
create policy "roles_update" on public.roles for update to authenticated using (public.erp_can_write(array['admin'])) with check (public.erp_can_write(array['admin']));
create policy "roles_delete" on public.roles for delete to authenticated using (public.erp_is_owner() or public.erp_can_write(array['admin']));

-- 使用者
drop policy if exists "users_all" on public.users;
drop policy if exists "users_read" on public.users;
drop policy if exists "users_insert" on public.users;
drop policy if exists "users_update" on public.users;
drop policy if exists "users_delete" on public.users;
create policy "users_read" on public.users for select to authenticated using (public.erp_is_member());
create policy "users_insert" on public.users for insert to authenticated with check (public.erp_can_write(array['admin']));
create policy "users_update" on public.users for update to authenticated using (public.erp_can_write(array['admin'])) with check (public.erp_can_write(array['admin']));
create policy "users_delete" on public.users for delete to authenticated using (public.erp_is_owner());

-- 系統設定
drop policy if exists "settings_all" on public.settings;
drop policy if exists "settings_read" on public.settings;
drop policy if exists "settings_insert" on public.settings;
drop policy if exists "settings_update" on public.settings;
drop policy if exists "settings_delete" on public.settings;
create policy "settings_read" on public.settings for select to authenticated using (public.erp_is_member());
create policy "settings_insert" on public.settings for insert to authenticated with check (public.erp_can_write_setting(key));
create policy "settings_update" on public.settings for update to authenticated using (public.erp_can_write_setting(key)) with check (public.erp_can_write_setting(key));
create policy "settings_delete" on public.settings for delete to authenticated using (public.erp_is_owner());

-- 簽核
drop policy if exists "approvals_all" on public.approvals;
drop policy if exists "approvals_read" on public.approvals;
drop policy if exists "approvals_insert" on public.approvals;
drop policy if exists "approvals_update" on public.approvals;
drop policy if exists "approvals_delete" on public.approvals;
create policy "approvals_read" on public.approvals for select to authenticated using (public.erp_is_member());
create policy "approvals_insert" on public.approvals for insert to authenticated with check (public.erp_is_member());
create policy "approvals_update" on public.approvals for update to authenticated using (public.erp_is_member()) with check (public.erp_is_member());
create policy "approvals_delete" on public.approvals for delete to authenticated using (public.erp_is_owner());

-- 通知綁定（LINE / Telegram）
drop policy if exists "notify_contacts_all" on public.notify_contacts;
drop policy if exists "notify_contacts_read" on public.notify_contacts;
drop policy if exists "notify_contacts_insert" on public.notify_contacts;
drop policy if exists "notify_contacts_update" on public.notify_contacts;
drop policy if exists "notify_contacts_delete" on public.notify_contacts;
create policy "notify_contacts_read" on public.notify_contacts for select to authenticated using (public.erp_is_member());
create policy "notify_contacts_insert" on public.notify_contacts for insert to authenticated with check (public.erp_can_write(array['admin']));
create policy "notify_contacts_update" on public.notify_contacts for update to authenticated using (public.erp_can_write(array['admin'])) with check (public.erp_can_write(array['admin']));
create policy "notify_contacts_delete" on public.notify_contacts for delete to authenticated using (public.erp_is_owner());

-- 通知發送紀錄
drop policy if exists "notifications_all" on public.notifications;
drop policy if exists "notifications_read" on public.notifications;
drop policy if exists "notifications_insert" on public.notifications;
drop policy if exists "notifications_update" on public.notifications;
drop policy if exists "notifications_delete" on public.notifications;
create policy "notifications_read" on public.notifications for select to authenticated using (public.erp_is_member());
create policy "notifications_insert" on public.notifications for insert to authenticated with check (public.erp_is_member());
create policy "notifications_update" on public.notifications for update to authenticated using (public.erp_is_member()) with check (public.erp_is_member());
create policy "notifications_delete" on public.notifications for delete to authenticated using (public.erp_is_owner());

-- 操作紀錄
drop policy if exists "audit_log_all" on public.audit_log;
drop policy if exists "audit_log_read" on public.audit_log;
drop policy if exists "audit_log_insert" on public.audit_log;
drop policy if exists "audit_log_update" on public.audit_log;
drop policy if exists "audit_log_delete" on public.audit_log;
create policy "audit_log_read" on public.audit_log for select to authenticated using (public.erp_is_member());
create policy "audit_log_insert" on public.audit_log for insert to authenticated with check (public.erp_is_member());
create policy "audit_log_update" on public.audit_log for update to authenticated using (public.erp_is_owner()) with check (public.erp_is_owner());
create policy "audit_log_delete" on public.audit_log for delete to authenticated using (public.erp_is_owner());

-- 品項（原料/包材零件/半成品/成品）
drop policy if exists "items_all" on public.items;
drop policy if exists "items_read" on public.items;
drop policy if exists "items_insert" on public.items;
drop policy if exists "items_update" on public.items;
drop policy if exists "items_delete" on public.items;
create policy "items_read" on public.items for select to authenticated using (public.erp_is_member());
create policy "items_insert" on public.items for insert to authenticated with check (public.erp_can_write(array['master']));
create policy "items_update" on public.items for update to authenticated using (public.erp_can_write(array['master'])) with check (public.erp_can_write(array['master']));
create policy "items_delete" on public.items for delete to authenticated using (public.erp_is_owner() or public.erp_can_write(array['master']));

-- 倉庫
drop policy if exists "warehouses_all" on public.warehouses;
drop policy if exists "warehouses_read" on public.warehouses;
drop policy if exists "warehouses_insert" on public.warehouses;
drop policy if exists "warehouses_update" on public.warehouses;
drop policy if exists "warehouses_delete" on public.warehouses;
create policy "warehouses_read" on public.warehouses for select to authenticated using (public.erp_is_member());
create policy "warehouses_insert" on public.warehouses for insert to authenticated with check (public.erp_can_write(array['wms', 'master']));
create policy "warehouses_update" on public.warehouses for update to authenticated using (public.erp_can_write(array['wms', 'master'])) with check (public.erp_can_write(array['wms', 'master']));
create policy "warehouses_delete" on public.warehouses for delete to authenticated using (public.erp_is_owner() or public.erp_can_write(array['wms', 'master']));

-- 儲位
drop policy if exists "bins_all" on public.bins;
drop policy if exists "bins_read" on public.bins;
drop policy if exists "bins_insert" on public.bins;
drop policy if exists "bins_update" on public.bins;
drop policy if exists "bins_delete" on public.bins;
create policy "bins_read" on public.bins for select to authenticated using (public.erp_is_member());
create policy "bins_insert" on public.bins for insert to authenticated with check (public.erp_can_write(array['wms', 'master']));
create policy "bins_update" on public.bins for update to authenticated using (public.erp_can_write(array['wms', 'master'])) with check (public.erp_can_write(array['wms', 'master']));
create policy "bins_delete" on public.bins for delete to authenticated using (public.erp_is_owner() or public.erp_can_write(array['wms', 'master']));

-- 客戶 / 會員
drop policy if exists "customers_all" on public.customers;
drop policy if exists "customers_read" on public.customers;
drop policy if exists "customers_insert" on public.customers;
drop policy if exists "customers_update" on public.customers;
drop policy if exists "customers_delete" on public.customers;
create policy "customers_read" on public.customers for select to authenticated using (public.erp_is_member());
create policy "customers_insert" on public.customers for insert to authenticated with check (public.erp_can_write(array['crm', 'sales', 'pos']));
create policy "customers_update" on public.customers for update to authenticated using (public.erp_can_write(array['crm', 'sales', 'pos'])) with check (public.erp_can_write(array['crm', 'sales', 'pos']));
create policy "customers_delete" on public.customers for delete to authenticated using (public.erp_is_owner() or public.erp_can_write(array['crm', 'sales', 'pos']));

-- 價格表
drop policy if exists "price_lists_all" on public.price_lists;
drop policy if exists "price_lists_read" on public.price_lists;
drop policy if exists "price_lists_insert" on public.price_lists;
drop policy if exists "price_lists_update" on public.price_lists;
drop policy if exists "price_lists_delete" on public.price_lists;
create policy "price_lists_read" on public.price_lists for select to authenticated using (public.erp_is_member());
create policy "price_lists_insert" on public.price_lists for insert to authenticated with check (public.erp_can_write(array['crm', 'sales']));
create policy "price_lists_update" on public.price_lists for update to authenticated using (public.erp_can_write(array['crm', 'sales'])) with check (public.erp_can_write(array['crm', 'sales']));
create policy "price_lists_delete" on public.price_lists for delete to authenticated using (public.erp_is_owner() or public.erp_can_write(array['crm', 'sales']));

-- 客戶互動紀錄
drop policy if exists "activities_all" on public.activities;
drop policy if exists "activities_read" on public.activities;
drop policy if exists "activities_insert" on public.activities;
drop policy if exists "activities_update" on public.activities;
drop policy if exists "activities_delete" on public.activities;
create policy "activities_read" on public.activities for select to authenticated using (public.erp_is_member());
create policy "activities_insert" on public.activities for insert to authenticated with check (public.erp_can_write(array['crm', 'sales']));
create policy "activities_update" on public.activities for update to authenticated using (public.erp_can_write(array['crm', 'sales'])) with check (public.erp_can_write(array['crm', 'sales']));
create policy "activities_delete" on public.activities for delete to authenticated using (public.erp_is_owner() or public.erp_can_write(array['crm', 'sales']));

-- 商機
drop policy if exists "opportunities_all" on public.opportunities;
drop policy if exists "opportunities_read" on public.opportunities;
drop policy if exists "opportunities_insert" on public.opportunities;
drop policy if exists "opportunities_update" on public.opportunities;
drop policy if exists "opportunities_delete" on public.opportunities;
create policy "opportunities_read" on public.opportunities for select to authenticated using (public.erp_is_member());
create policy "opportunities_insert" on public.opportunities for insert to authenticated with check (public.erp_can_write(array['crm', 'sales']));
create policy "opportunities_update" on public.opportunities for update to authenticated using (public.erp_can_write(array['crm', 'sales'])) with check (public.erp_can_write(array['crm', 'sales']));
create policy "opportunities_delete" on public.opportunities for delete to authenticated using (public.erp_is_owner());

-- 報價單
drop policy if exists "quotations_all" on public.quotations;
drop policy if exists "quotations_read" on public.quotations;
drop policy if exists "quotations_insert" on public.quotations;
drop policy if exists "quotations_update" on public.quotations;
drop policy if exists "quotations_delete" on public.quotations;
create policy "quotations_read" on public.quotations for select to authenticated using (public.erp_is_member());
create policy "quotations_insert" on public.quotations for insert to authenticated with check (public.erp_can_write(array['crm', 'sales']));
create policy "quotations_update" on public.quotations for update to authenticated using (public.erp_can_write(array['crm', 'sales'])) with check (public.erp_can_write(array['crm', 'sales']));
create policy "quotations_delete" on public.quotations for delete to authenticated using (public.erp_is_owner());

-- 供應商
drop policy if exists "suppliers_all" on public.suppliers;
drop policy if exists "suppliers_read" on public.suppliers;
drop policy if exists "suppliers_insert" on public.suppliers;
drop policy if exists "suppliers_update" on public.suppliers;
drop policy if exists "suppliers_delete" on public.suppliers;
create policy "suppliers_read" on public.suppliers for select to authenticated using (public.erp_is_member());
create policy "suppliers_insert" on public.suppliers for insert to authenticated with check (public.erp_can_write(array['purchase', 'master']));
create policy "suppliers_update" on public.suppliers for update to authenticated using (public.erp_can_write(array['purchase', 'master'])) with check (public.erp_can_write(array['purchase', 'master']));
create policy "suppliers_delete" on public.suppliers for delete to authenticated using (public.erp_is_owner() or public.erp_can_write(array['purchase', 'master']));

-- 銷售訂單
drop policy if exists "sales_orders_all" on public.sales_orders;
drop policy if exists "sales_orders_read" on public.sales_orders;
drop policy if exists "sales_orders_insert" on public.sales_orders;
drop policy if exists "sales_orders_update" on public.sales_orders;
drop policy if exists "sales_orders_delete" on public.sales_orders;
create policy "sales_orders_read" on public.sales_orders for select to authenticated using (public.erp_is_member());
create policy "sales_orders_insert" on public.sales_orders for insert to authenticated with check (public.erp_can_write(array['sales', 'shipping']));
create policy "sales_orders_update" on public.sales_orders for update to authenticated using (public.erp_can_write(array['sales', 'shipping'])) with check (public.erp_can_write(array['sales', 'shipping']));
create policy "sales_orders_delete" on public.sales_orders for delete to authenticated using (public.erp_is_owner());

-- 請購單
drop policy if exists "requisitions_all" on public.requisitions;
drop policy if exists "requisitions_read" on public.requisitions;
drop policy if exists "requisitions_insert" on public.requisitions;
drop policy if exists "requisitions_update" on public.requisitions;
drop policy if exists "requisitions_delete" on public.requisitions;
create policy "requisitions_read" on public.requisitions for select to authenticated using (public.erp_is_member());
create policy "requisitions_insert" on public.requisitions for insert to authenticated with check (public.erp_can_write(array['purchase', 'wms', 'production']));
create policy "requisitions_update" on public.requisitions for update to authenticated using (public.erp_can_write(array['purchase', 'wms', 'production'])) with check (public.erp_can_write(array['purchase', 'wms', 'production']));
create policy "requisitions_delete" on public.requisitions for delete to authenticated using (public.erp_is_owner());

-- 採購單
drop policy if exists "purchase_orders_all" on public.purchase_orders;
drop policy if exists "purchase_orders_read" on public.purchase_orders;
drop policy if exists "purchase_orders_insert" on public.purchase_orders;
drop policy if exists "purchase_orders_update" on public.purchase_orders;
drop policy if exists "purchase_orders_delete" on public.purchase_orders;
create policy "purchase_orders_read" on public.purchase_orders for select to authenticated using (public.erp_is_member());
create policy "purchase_orders_insert" on public.purchase_orders for insert to authenticated with check (public.erp_can_write(array['purchase', 'wms']));
create policy "purchase_orders_update" on public.purchase_orders for update to authenticated using (public.erp_can_write(array['purchase', 'wms'])) with check (public.erp_can_write(array['purchase', 'wms']));
create policy "purchase_orders_delete" on public.purchase_orders for delete to authenticated using (public.erp_is_owner());

-- 生產工單
drop policy if exists "work_orders_all" on public.work_orders;
drop policy if exists "work_orders_read" on public.work_orders;
drop policy if exists "work_orders_insert" on public.work_orders;
drop policy if exists "work_orders_update" on public.work_orders;
drop policy if exists "work_orders_delete" on public.work_orders;
create policy "work_orders_read" on public.work_orders for select to authenticated using (public.erp_is_member());
create policy "work_orders_insert" on public.work_orders for insert to authenticated with check (public.erp_can_write(array['production', 'qc']));
create policy "work_orders_update" on public.work_orders for update to authenticated using (public.erp_can_write(array['production', 'qc'])) with check (public.erp_can_write(array['production', 'qc']));
create policy "work_orders_delete" on public.work_orders for delete to authenticated using (public.erp_is_owner());

-- 批號（原料/成品）
drop policy if exists "lots_all" on public.lots;
drop policy if exists "lots_read" on public.lots;
drop policy if exists "lots_insert" on public.lots;
drop policy if exists "lots_update" on public.lots;
drop policy if exists "lots_delete" on public.lots;
create policy "lots_read" on public.lots for select to authenticated using (public.erp_is_member());
create policy "lots_insert" on public.lots for insert to authenticated with check (public.erp_can_write(array['production', 'purchase', 'wms', 'qc']));
create policy "lots_update" on public.lots for update to authenticated using (public.erp_can_write(array['production', 'purchase', 'wms', 'qc'])) with check (public.erp_can_write(array['production', 'purchase', 'wms', 'qc']));
create policy "lots_delete" on public.lots for delete to authenticated using (public.erp_is_owner());

-- 庫存異動
drop policy if exists "stock_moves_all" on public.stock_moves;
drop policy if exists "stock_moves_read" on public.stock_moves;
drop policy if exists "stock_moves_insert" on public.stock_moves;
drop policy if exists "stock_moves_update" on public.stock_moves;
drop policy if exists "stock_moves_delete" on public.stock_moves;
create policy "stock_moves_read" on public.stock_moves for select to authenticated using (public.erp_is_member());
create policy "stock_moves_insert" on public.stock_moves for insert to authenticated with check (public.erp_can_write(array['wms', 'purchase', 'production', 'shipping', 'sales', 'pos', 'qc']));
create policy "stock_moves_update" on public.stock_moves for update to authenticated using (public.erp_can_write(array['wms', 'purchase', 'production', 'shipping', 'sales', 'pos', 'qc'])) with check (public.erp_can_write(array['wms', 'purchase', 'production', 'shipping', 'sales', 'pos', 'qc']));
create policy "stock_moves_delete" on public.stock_moves for delete to authenticated using (public.erp_is_owner());

-- 調撥單
drop policy if exists "transfers_all" on public.transfers;
drop policy if exists "transfers_read" on public.transfers;
drop policy if exists "transfers_insert" on public.transfers;
drop policy if exists "transfers_update" on public.transfers;
drop policy if exists "transfers_delete" on public.transfers;
create policy "transfers_read" on public.transfers for select to authenticated using (public.erp_is_member());
create policy "transfers_insert" on public.transfers for insert to authenticated with check (public.erp_can_write(array['wms', 'pos']));
create policy "transfers_update" on public.transfers for update to authenticated using (public.erp_can_write(array['wms', 'pos'])) with check (public.erp_can_write(array['wms', 'pos']));
create policy "transfers_delete" on public.transfers for delete to authenticated using (public.erp_is_owner());

-- 盤點單
drop policy if exists "stocktakes_all" on public.stocktakes;
drop policy if exists "stocktakes_read" on public.stocktakes;
drop policy if exists "stocktakes_insert" on public.stocktakes;
drop policy if exists "stocktakes_update" on public.stocktakes;
drop policy if exists "stocktakes_delete" on public.stocktakes;
create policy "stocktakes_read" on public.stocktakes for select to authenticated using (public.erp_is_member());
create policy "stocktakes_insert" on public.stocktakes for insert to authenticated with check (public.erp_can_write(array['wms']));
create policy "stocktakes_update" on public.stocktakes for update to authenticated using (public.erp_can_write(array['wms'])) with check (public.erp_can_write(array['wms']));
create policy "stocktakes_delete" on public.stocktakes for delete to authenticated using (public.erp_is_owner());

-- QC 檢驗
drop policy if exists "qc_inspections_all" on public.qc_inspections;
drop policy if exists "qc_inspections_read" on public.qc_inspections;
drop policy if exists "qc_inspections_insert" on public.qc_inspections;
drop policy if exists "qc_inspections_update" on public.qc_inspections;
drop policy if exists "qc_inspections_delete" on public.qc_inspections;
create policy "qc_inspections_read" on public.qc_inspections for select to authenticated using (public.erp_is_member());
create policy "qc_inspections_insert" on public.qc_inspections for insert to authenticated with check (public.erp_can_write(array['qc']));
create policy "qc_inspections_update" on public.qc_inspections for update to authenticated using (public.erp_can_write(array['qc'])) with check (public.erp_can_write(array['qc']));
create policy "qc_inspections_delete" on public.qc_inspections for delete to authenticated using (public.erp_is_owner());

-- 出貨單
drop policy if exists "shipments_all" on public.shipments;
drop policy if exists "shipments_read" on public.shipments;
drop policy if exists "shipments_insert" on public.shipments;
drop policy if exists "shipments_update" on public.shipments;
drop policy if exists "shipments_delete" on public.shipments;
create policy "shipments_read" on public.shipments for select to authenticated using (public.erp_is_member());
create policy "shipments_insert" on public.shipments for insert to authenticated with check (public.erp_can_write(array['shipping']));
create policy "shipments_update" on public.shipments for update to authenticated using (public.erp_can_write(array['shipping'])) with check (public.erp_can_write(array['shipping']));
create policy "shipments_delete" on public.shipments for delete to authenticated using (public.erp_is_owner());

-- 退貨單
drop policy if exists "returns_all" on public.returns;
drop policy if exists "returns_read" on public.returns;
drop policy if exists "returns_insert" on public.returns;
drop policy if exists "returns_update" on public.returns;
drop policy if exists "returns_delete" on public.returns;
create policy "returns_read" on public.returns for select to authenticated using (public.erp_is_member());
create policy "returns_insert" on public.returns for insert to authenticated with check (public.erp_can_write(array['sales', 'purchase', 'shipping']));
create policy "returns_update" on public.returns for update to authenticated using (public.erp_can_write(array['sales', 'purchase', 'shipping'])) with check (public.erp_can_write(array['sales', 'purchase', 'shipping']));
create policy "returns_delete" on public.returns for delete to authenticated using (public.erp_is_owner());

-- POS 班別
drop policy if exists "pos_shifts_all" on public.pos_shifts;
drop policy if exists "pos_shifts_read" on public.pos_shifts;
drop policy if exists "pos_shifts_insert" on public.pos_shifts;
drop policy if exists "pos_shifts_update" on public.pos_shifts;
drop policy if exists "pos_shifts_delete" on public.pos_shifts;
create policy "pos_shifts_read" on public.pos_shifts for select to authenticated using (public.erp_is_member());
create policy "pos_shifts_insert" on public.pos_shifts for insert to authenticated with check (public.erp_can_write(array['pos']));
create policy "pos_shifts_update" on public.pos_shifts for update to authenticated using (public.erp_can_write(array['pos'])) with check (public.erp_can_write(array['pos']));
create policy "pos_shifts_delete" on public.pos_shifts for delete to authenticated using (public.erp_is_owner());

-- POS 銷售
drop policy if exists "pos_sales_all" on public.pos_sales;
drop policy if exists "pos_sales_read" on public.pos_sales;
drop policy if exists "pos_sales_insert" on public.pos_sales;
drop policy if exists "pos_sales_update" on public.pos_sales;
drop policy if exists "pos_sales_delete" on public.pos_sales;
create policy "pos_sales_read" on public.pos_sales for select to authenticated using (public.erp_is_member());
create policy "pos_sales_insert" on public.pos_sales for insert to authenticated with check (public.erp_can_write(array['pos']));
create policy "pos_sales_update" on public.pos_sales for update to authenticated using (public.erp_can_write(array['pos'])) with check (public.erp_can_write(array['pos']));
create policy "pos_sales_delete" on public.pos_sales for delete to authenticated using (public.erp_is_owner());

-- 應收（發票）
drop policy if exists "invoices_all" on public.invoices;
drop policy if exists "invoices_read" on public.invoices;
drop policy if exists "invoices_insert" on public.invoices;
drop policy if exists "invoices_update" on public.invoices;
drop policy if exists "invoices_delete" on public.invoices;
create policy "invoices_read" on public.invoices for select to authenticated using (public.erp_is_member());
create policy "invoices_insert" on public.invoices for insert to authenticated with check (public.erp_can_write(array['accounting', 'shipping', 'sales', 'pos']));
create policy "invoices_update" on public.invoices for update to authenticated using (public.erp_can_write(array['accounting', 'shipping', 'sales', 'pos'])) with check (public.erp_can_write(array['accounting', 'shipping', 'sales', 'pos']));
create policy "invoices_delete" on public.invoices for delete to authenticated using (public.erp_is_owner());

-- 應付（進貨帳款）
drop policy if exists "bills_all" on public.bills;
drop policy if exists "bills_read" on public.bills;
drop policy if exists "bills_insert" on public.bills;
drop policy if exists "bills_update" on public.bills;
drop policy if exists "bills_delete" on public.bills;
create policy "bills_read" on public.bills for select to authenticated using (public.erp_is_member());
create policy "bills_insert" on public.bills for insert to authenticated with check (public.erp_can_write(array['accounting', 'purchase', 'wms']));
create policy "bills_update" on public.bills for update to authenticated using (public.erp_can_write(array['accounting', 'purchase', 'wms'])) with check (public.erp_can_write(array['accounting', 'purchase', 'wms']));
create policy "bills_delete" on public.bills for delete to authenticated using (public.erp_is_owner());

-- 收付款
drop policy if exists "payments_all" on public.payments;
drop policy if exists "payments_read" on public.payments;
drop policy if exists "payments_insert" on public.payments;
drop policy if exists "payments_update" on public.payments;
drop policy if exists "payments_delete" on public.payments;
create policy "payments_read" on public.payments for select to authenticated using (public.erp_is_member());
create policy "payments_insert" on public.payments for insert to authenticated with check (public.erp_can_write(array['accounting']));
create policy "payments_update" on public.payments for update to authenticated using (public.erp_can_write(array['accounting'])) with check (public.erp_can_write(array['accounting']));
create policy "payments_delete" on public.payments for delete to authenticated using (public.erp_is_owner());

-- 會計傳票
drop policy if exists "journal_all" on public.journal;
drop policy if exists "journal_read" on public.journal;
drop policy if exists "journal_insert" on public.journal;
drop policy if exists "journal_update" on public.journal;
drop policy if exists "journal_delete" on public.journal;
create policy "journal_read" on public.journal for select to authenticated using (public.erp_is_member());
create policy "journal_insert" on public.journal for insert to authenticated with check (public.erp_can_write(array['accounting', 'purchase', 'wms', 'production', 'shipping', 'sales', 'pos', 'qc']));
create policy "journal_update" on public.journal for update to authenticated using (public.erp_can_write(array['accounting', 'purchase', 'wms', 'production', 'shipping', 'sales', 'pos', 'qc'])) with check (public.erp_can_write(array['accounting', 'purchase', 'wms', 'production', 'shipping', 'sales', 'pos', 'qc']));
create policy "journal_delete" on public.journal for delete to authenticated using (public.erp_is_owner());


-- 傳票：借貸要平衡、不能記在已關帳期間、不能修改或刪除（要更正請開沖銷傳票）
create or replace function public.erp_journal_guard() returns trigger
language plpgsql set search_path = '' as $$
declare d numeric; c numeric; cu date;
begin
  if public.erp_bypass() then return coalesce(new, old); end if;
  if tg_op <> 'INSERT' then raise exception '傳票不能修改或刪除，請開沖銷傳票'; end if;
  select coalesce(sum(round(coalesce((l ->> 'debit')::numeric, 0), 2)), 0), coalesce(sum(round(coalesce((l ->> 'credit')::numeric, 0), 2)), 0)
    into d, c from jsonb_array_elements(coalesce(new.lines, '[]'::jsonb)) l;
  if d <> c or d = 0 then raise exception '傳票借貸不平衡（借 % / 貸 %）', d, c; end if;
  cu := public.erp_closed_until();
  if cu is not null and new.date <= cu then raise exception '% 屬於已關帳期間（關帳至 %），不能再異動', new.date, cu; end if;
  return new;
end $$;
drop trigger if exists erp_journal_guard on public.journal;
create trigger erp_journal_guard before insert or update or delete on public.journal for each row execute function public.erp_journal_guard();

-- 庫存異動：不能修改或刪除、不能記在已關帳期間、扣庫存不能扣成負數
create or replace function public.erp_stock_guard() returns trigger
language plpgsql set search_path = '' as $$
declare cu date; bal numeric;
begin
  if public.erp_bypass() then return coalesce(new, old); end if;
  if tg_op <> 'INSERT' then raise exception '庫存異動不能修改或刪除，請用調整單'; end if;
  cu := public.erp_closed_until();
  if cu is not null and coalesce(new.doc_date, new.date::date) <= cu then
    raise exception '% 屬於已關帳期間（關帳至 %），不能再異動庫存', coalesce(new.doc_date, new.date::date), cu;
  end if;
  if new.qty < 0 then
    -- 同一批號同一儲位同時扣庫存時排隊檢查，避免兩人同時扣成負數
    perform pg_advisory_xact_lock(hashtext(new.item_id || '|' || new.bin_id || '|' || coalesce(new.lot_no, '')));
    select coalesce(sum(qty), 0) into bal from public.stock_moves
      where item_id = new.item_id and bin_id = new.bin_id and lot_no is not distinct from new.lot_no;
    if bal + new.qty < -0.0005 then raise exception '庫存不足：批號 % 在這個儲位只剩 %，不能扣 %', new.lot_no, bal, -new.qty; end if;
  end if;
  return new;
end $$;
drop trigger if exists erp_stock_guard on public.stock_moves;
create trigger erp_stock_guard before insert or update or delete on public.stock_moves for each row execute function public.erp_stock_guard();

-- 簽核：申請人寫自己的名字；核准 / 退回要有該模組核准權，而且不能核准自己的申請；處理過的不能再改
create or replace function public.erp_approval_guard() returns trigger
language plpgsql set search_path = '' as $$
declare me text := public.erp_user_id();
begin
  if public.erp_bypass() then return new; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then raise exception '新的簽核只能是待簽核'; end if;
    if coalesce(new.requested_by, '') <> coalesce(me, '') and not public.erp_is_owner() then raise exception '申請人必須是自己'; end if;
    return new;
  end if;
  if old.status <> 'pending' then raise exception '這筆簽核已處理過'; end if;
  if new.type is distinct from old.type or new.module is distinct from old.module or new.requested_by is distinct from old.requested_by
     or new.ref_id is distinct from old.ref_id or new.amount is distinct from old.amount then
    raise exception '不能修改簽核內容';
  end if;
  if new.status in ('approved', 'rejected') then
    if new.decided_by is distinct from me then raise exception '核准人必須是自己'; end if;
    if public.erp_level(new.module) < 3 then raise exception '沒有核准權限'; end if;
    if new.decided_by = new.requested_by and coalesce(public.erp_setting('allow_self_approve') #>> '{}', 'false') <> 'true' then
      raise exception '申請人不能核准自己的申請，請由其他主管處理';
    end if;
  elsif new.status not in ('pending', 'superseded') then
    raise exception '簽核狀態不正確：%', new.status;
  end if;
  return new;
end $$;
drop trigger if exists erp_approval_guard on public.approvals;
create trigger erp_approval_guard before insert or update on public.approvals for each row execute function public.erp_approval_guard();

-- 關帳日只能往後；往前（重新開帳）要系統管理核准權
create or replace function public.erp_settings_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.erp_bypass() then return new; end if;
  if new.key = 'closed_until' and tg_op = 'UPDATE' and coalesce(new.value #>> '{}', '') < coalesce(old.value #>> '{}', '')
     and public.erp_level('admin') < 3 then
    raise exception '重新開帳需要系統管理核准權';
  end if;
  return new;
end $$;
drop trigger if exists erp_settings_guard on public.settings;
create trigger erp_settings_guard before insert or update on public.settings for each row execute function public.erp_settings_guard();

-- 操作紀錄：人員姓名與時間由伺服器填，不能冒用別人的名字
create or replace function public.erp_audit_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.erp_bypass() then return new; end if;
  new.user_name := coalesce((select name from public.users where id = public.erp_user_id()), '系統擁有者');
  new.at := now();
  return new;
end $$;
drop trigger if exists erp_audit_stamp on public.audit_log;
create trigger erp_audit_stamp before insert on public.audit_log for each row execute function public.erp_audit_stamp();

-- ======================================================================
-- 網頁寫入用的函式：一個動作的所有異動在同一個資料庫交易裡完成，任何一筆被拒絕就整批取消
-- ======================================================================
create or replace function public.erp_write(t text, op text, r jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare n int;
begin
  if op not in ('insert', 'update', 'delete', 'delete-all', 'restore') then raise exception '不支援的動作：%', op; end if;
  case t
    when 'roles' then
      if op = 'insert' or op = 'restore' then
        insert into public.roles select * from jsonb_populate_record(null::public.roles, r);
      elsif op = 'update' then
        update public.roles set (name, perms, note, created_at, updated_at) = (select name, perms, note, created_at, updated_at from jsonb_populate_record(null::public.roles, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.roles where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.roles where true;
        return;
      end if;
    when 'users' then
      if op = 'insert' or op = 'restore' then
        insert into public.users select * from jsonb_populate_record(null::public.users, r);
      elsif op = 'update' then
        update public.users set (name, role_id, pin, active, phone, email, created_at, updated_at) = (select name, role_id, pin, active, phone, email, created_at, updated_at from jsonb_populate_record(null::public.users, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.users where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.users where true;
        return;
      end if;
    when 'settings' then
      if op = 'insert' or op = 'restore' then
        insert into public.settings select * from jsonb_populate_record(null::public.settings, r);
      elsif op = 'update' then
        update public.settings set (key, value, created_at, updated_at) = (select key, value, created_at, updated_at from jsonb_populate_record(null::public.settings, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.settings where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.settings where true;
        return;
      end if;
    when 'approvals' then
      if op = 'insert' or op = 'restore' then
        insert into public.approvals select * from jsonb_populate_record(null::public.approvals, r);
      elsif op = 'update' then
        update public.approvals set (no, type, module, ref_table, ref_id, summary, amount, reason, payload, status, requested_by, decided_by, decided_at, decision_note, created_at, updated_at) = (select no, type, module, ref_table, ref_id, summary, amount, reason, payload, status, requested_by, decided_by, decided_at, decision_note, created_at, updated_at from jsonb_populate_record(null::public.approvals, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.approvals where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.approvals where true;
        return;
      end if;
    when 'notify_contacts' then
      if op = 'insert' or op = 'restore' then
        insert into public.notify_contacts select * from jsonb_populate_record(null::public.notify_contacts, r);
      elsif op = 'update' then
        update public.notify_contacts set (channel, external_id, display_name, picture_url, state, status, requested_role_id, requested_name, user_id, muted, approved_by, approved_at, note, created_at, updated_at) = (select channel, external_id, display_name, picture_url, state, status, requested_role_id, requested_name, user_id, muted, approved_by, approved_at, note, created_at, updated_at from jsonb_populate_record(null::public.notify_contacts, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.notify_contacts where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.notify_contacts where true;
        return;
      end if;
    when 'notifications' then
      if op = 'insert' or op = 'restore' then
        insert into public.notifications select * from jsonb_populate_record(null::public.notifications, r);
      elsif op = 'update' then
        update public.notifications set (event, title, body, link, user_ids, contact_ids, status, results, sent_at, created_at, updated_at) = (select event, title, body, link, user_ids, contact_ids, status, results, sent_at, created_at, updated_at from jsonb_populate_record(null::public.notifications, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.notifications where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.notifications where true;
        return;
      end if;
    when 'audit_log' then
      if op = 'insert' or op = 'restore' then
        insert into public.audit_log select * from jsonb_populate_record(null::public.audit_log, r);
      elsif op = 'update' then
        update public.audit_log set (at, user_name, action, table_name, row_id, summary, created_at, updated_at) = (select at, user_name, action, table_name, row_id, summary, created_at, updated_at from jsonb_populate_record(null::public.audit_log, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.audit_log where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.audit_log where true;
        return;
      end if;
    when 'items' then
      if op = 'insert' or op = 'restore' then
        insert into public.items select * from jsonb_populate_record(null::public.items, r);
      elsif op = 'update' then
        update public.items set (code, name, type, unit, spec, barcode, alt_unit, alt_factor, price, min_price, cost, safety_stock, pack_per_box, shelf_days, temp_zone, default_bin_id, iqc_required, qc_required, qc_template, exp_rule, category, family_code, variant_attr, variant_value, pos_enabled, pos_price, bom, active, created_at, updated_at) = (select code, name, type, unit, spec, barcode, alt_unit, alt_factor, price, min_price, cost, safety_stock, pack_per_box, shelf_days, temp_zone, default_bin_id, iqc_required, qc_required, qc_template, exp_rule, category, family_code, variant_attr, variant_value, pos_enabled, pos_price, bom, active, created_at, updated_at from jsonb_populate_record(null::public.items, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.items where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.items where true;
        return;
      end if;
    when 'warehouses' then
      if op = 'insert' or op = 'restore' then
        insert into public.warehouses select * from jsonb_populate_record(null::public.warehouses, r);
      elsif op = 'update' then
        update public.warehouses set (code, name, kind, temp_zone, note, created_at, updated_at) = (select code, name, kind, temp_zone, note, created_at, updated_at from jsonb_populate_record(null::public.warehouses, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.warehouses where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.warehouses where true;
        return;
      end if;
    when 'bins' then
      if op = 'insert' or op = 'restore' then
        insert into public.bins select * from jsonb_populate_record(null::public.bins, r);
      elsif op = 'update' then
        update public.bins set (code, warehouse_id, name, capacity, active, created_at, updated_at) = (select code, warehouse_id, name, capacity, active, created_at, updated_at from jsonb_populate_record(null::public.bins, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.bins where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.bins where true;
        return;
      end if;
    when 'customers' then
      if op = 'insert' or op = 'restore' then
        insert into public.customers select * from jsonb_populate_record(null::public.customers, r);
      elsif op = 'update' then
        update public.customers set (code, name, kind, level, status, contact, phone, email, address, tax_id, terms_days, credit_limit, min_shelf_days, price_list_id, owner_id, source, tags, contacts, points, note, created_at, updated_at) = (select code, name, kind, level, status, contact, phone, email, address, tax_id, terms_days, credit_limit, min_shelf_days, price_list_id, owner_id, source, tags, contacts, points, note, created_at, updated_at from jsonb_populate_record(null::public.customers, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.customers where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.customers where true;
        return;
      end if;
    when 'price_lists' then
      if op = 'insert' or op = 'restore' then
        insert into public.price_lists select * from jsonb_populate_record(null::public.price_lists, r);
      elsif op = 'update' then
        update public.price_lists set (name, lines, note, created_at, updated_at) = (select name, lines, note, created_at, updated_at from jsonb_populate_record(null::public.price_lists, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.price_lists where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.price_lists where true;
        return;
      end if;
    when 'activities' then
      if op = 'insert' or op = 'restore' then
        insert into public.activities select * from jsonb_populate_record(null::public.activities, r);
      elsif op = 'update' then
        update public.activities set (customer_id, opportunity_id, type, date, summary, next_action, next_date, done, user_id, created_at, updated_at) = (select customer_id, opportunity_id, type, date, summary, next_action, next_date, done, user_id, created_at, updated_at from jsonb_populate_record(null::public.activities, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.activities where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.activities where true;
        return;
      end if;
    when 'opportunities' then
      if op = 'insert' or op = 'restore' then
        insert into public.opportunities select * from jsonb_populate_record(null::public.opportunities, r);
      elsif op = 'update' then
        update public.opportunities set (customer_id, title, stage, amount, probability, expected_date, owner_id, lost_reason, note, created_at, updated_at) = (select customer_id, title, stage, amount, probability, expected_date, owner_id, lost_reason, note, created_at, updated_at from jsonb_populate_record(null::public.opportunities, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.opportunities where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.opportunities where true;
        return;
      end if;
    when 'quotations' then
      if op = 'insert' or op = 'restore' then
        insert into public.quotations select * from jsonb_populate_record(null::public.quotations, r);
      elsif op = 'update' then
        update public.quotations set (no, customer_id, opportunity_id, sales_order_id, date, valid_until, status, lines, total, note, created_at, updated_at) = (select no, customer_id, opportunity_id, sales_order_id, date, valid_until, status, lines, total, note, created_at, updated_at from jsonb_populate_record(null::public.quotations, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.quotations where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.quotations where true;
        return;
      end if;
    when 'suppliers' then
      if op = 'insert' or op = 'restore' then
        insert into public.suppliers select * from jsonb_populate_record(null::public.suppliers, r);
      elsif op = 'update' then
        update public.suppliers set (code, name, contact, phone, address, tax_id, terms_days, certs, rating, note, created_at, updated_at) = (select code, name, contact, phone, address, tax_id, terms_days, certs, rating, note, created_at, updated_at from jsonb_populate_record(null::public.suppliers, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.suppliers where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.suppliers where true;
        return;
      end if;
    when 'sales_orders' then
      if op = 'insert' or op = 'restore' then
        insert into public.sales_orders select * from jsonb_populate_record(null::public.sales_orders, r);
      elsif op = 'update' then
        update public.sales_orders set (no, customer_id, quotation_id, date, due_date, status, lines, total, approved_total, note, created_at, updated_at) = (select no, customer_id, quotation_id, date, due_date, status, lines, total, approved_total, note, created_at, updated_at from jsonb_populate_record(null::public.sales_orders, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.sales_orders where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.sales_orders where true;
        return;
      end if;
    when 'requisitions' then
      if op = 'insert' or op = 'restore' then
        insert into public.requisitions select * from jsonb_populate_record(null::public.requisitions, r);
      elsif op = 'update' then
        update public.requisitions set (no, date, need_date, requester_id, status, lines, reason, note, created_at, updated_at) = (select no, date, need_date, requester_id, status, lines, reason, note, created_at, updated_at from jsonb_populate_record(null::public.requisitions, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.requisitions where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.requisitions where true;
        return;
      end if;
    when 'purchase_orders' then
      if op = 'insert' or op = 'restore' then
        insert into public.purchase_orders select * from jsonb_populate_record(null::public.purchase_orders, r);
      elsif op = 'update' then
        update public.purchase_orders set (no, supplier_id, sales_order_id, requisition_id, date, due_date, status, lines, total, approved_total, note, created_at, updated_at) = (select no, supplier_id, sales_order_id, requisition_id, date, due_date, status, lines, total, approved_total, note, created_at, updated_at from jsonb_populate_record(null::public.purchase_orders, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.purchase_orders where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.purchase_orders where true;
        return;
      end if;
    when 'work_orders' then
      if op = 'insert' or op = 'restore' then
        insert into public.work_orders select * from jsonb_populate_record(null::public.work_orders, r);
      elsif op = 'update' then
        update public.work_orders set (no, sales_order_id, product_id, plan_qty, plan_date, line, status, lot_no, feeds, output_qty, waste_qty, std_cost, start_at, end_at, note, created_at, updated_at) = (select no, sales_order_id, product_id, plan_qty, plan_date, line, status, lot_no, feeds, output_qty, waste_qty, std_cost, start_at, end_at, note, created_at, updated_at from jsonb_populate_record(null::public.work_orders, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.work_orders where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.work_orders where true;
        return;
      end if;
    when 'lots' then
      if op = 'insert' or op = 'restore' then
        insert into public.lots select * from jsonb_populate_record(null::public.lots, r);
      elsif op = 'update' then
        update public.lots set (lot_no, kind, item_id, supplier_id, supplier_lot, purchase_order_id, work_order_id, qty, unit_cost, qc_status, mfg_date, exp_date, note, created_at, updated_at) = (select lot_no, kind, item_id, supplier_id, supplier_lot, purchase_order_id, work_order_id, qty, unit_cost, qc_status, mfg_date, exp_date, note, created_at, updated_at from jsonb_populate_record(null::public.lots, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.lots where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.lots where true;
        return;
      end if;
    when 'stock_moves' then
      if op = 'insert' or op = 'restore' then
        insert into public.stock_moves select * from jsonb_populate_record(null::public.stock_moves, r);
      elsif op = 'update' then
        update public.stock_moves set (date, doc_date, doc_no, item_id, lot_no, bin_id, from_bin_id, qty, type, unit_cost, ref_type, ref_id, note, user_name, created_at, updated_at) = (select date, doc_date, doc_no, item_id, lot_no, bin_id, from_bin_id, qty, type, unit_cost, ref_type, ref_id, note, user_name, created_at, updated_at from jsonb_populate_record(null::public.stock_moves, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.stock_moves where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.stock_moves where true;
        return;
      end if;
    when 'transfers' then
      if op = 'insert' or op = 'restore' then
        insert into public.transfers select * from jsonb_populate_record(null::public.transfers, r);
      elsif op = 'update' then
        update public.transfers set (no, date, from_bin_id, to_bin_id, lines, reason, user_name, created_at, updated_at) = (select no, date, from_bin_id, to_bin_id, lines, reason, user_name, created_at, updated_at from jsonb_populate_record(null::public.transfers, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.transfers where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.transfers where true;
        return;
      end if;
    when 'stocktakes' then
      if op = 'insert' or op = 'restore' then
        insert into public.stocktakes select * from jsonb_populate_record(null::public.stocktakes, r);
      elsif op = 'update' then
        update public.stocktakes set (no, date, warehouse_id, status, lines, note, user_name, created_at, updated_at) = (select no, date, warehouse_id, status, lines, note, user_name, created_at, updated_at from jsonb_populate_record(null::public.stocktakes, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.stocktakes where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.stocktakes where true;
        return;
      end if;
    when 'qc_inspections' then
      if op = 'insert' or op = 'restore' then
        insert into public.qc_inspections select * from jsonb_populate_record(null::public.qc_inspections, r);
      elsif op = 'update' then
        update public.qc_inspections set (no, kind, lot_no, item_id, work_order_id, date, sample_size, defect_qty, checks, result, inspector, note, created_at, updated_at) = (select no, kind, lot_no, item_id, work_order_id, date, sample_size, defect_qty, checks, result, inspector, note, created_at, updated_at from jsonb_populate_record(null::public.qc_inspections, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.qc_inspections where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.qc_inspections where true;
        return;
      end if;
    when 'shipments' then
      if op = 'insert' or op = 'restore' then
        insert into public.shipments select * from jsonb_populate_record(null::public.shipments, r);
      elsif op = 'update' then
        update public.shipments set (no, sales_order_id, customer_id, date, lines, boxes, pack_mode, container_no, carrier, address, status, note, created_at, updated_at) = (select no, sales_order_id, customer_id, date, lines, boxes, pack_mode, container_no, carrier, address, status, note, created_at, updated_at from jsonb_populate_record(null::public.shipments, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.shipments where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.shipments where true;
        return;
      end if;
    when 'returns' then
      if op = 'insert' or op = 'restore' then
        insert into public.returns select * from jsonb_populate_record(null::public.returns, r);
      elsif op = 'update' then
        update public.returns set (no, kind, customer_id, supplier_id, shipment_id, invoice_id, bill_id, date, lines, disposition, reason, amount, tax, status, created_at, updated_at) = (select no, kind, customer_id, supplier_id, shipment_id, invoice_id, bill_id, date, lines, disposition, reason, amount, tax, status, created_at, updated_at from jsonb_populate_record(null::public.returns, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.returns where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.returns where true;
        return;
      end if;
    when 'pos_shifts' then
      if op = 'insert' or op = 'restore' then
        insert into public.pos_shifts select * from jsonb_populate_record(null::public.pos_shifts, r);
      elsif op = 'update' then
        update public.pos_shifts set (no, bin_id, opened_by, opened_at, opening_cash, closed_by, closed_at, expected_cash, counted_cash, diff, status, note, created_at, updated_at) = (select no, bin_id, opened_by, opened_at, opening_cash, closed_by, closed_at, expected_cash, counted_cash, diff, status, note, created_at, updated_at from jsonb_populate_record(null::public.pos_shifts, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.pos_shifts where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.pos_shifts where true;
        return;
      end if;
    when 'pos_sales' then
      if op = 'insert' or op = 'restore' then
        insert into public.pos_sales select * from jsonb_populate_record(null::public.pos_sales, r);
      elsif op = 'update' then
        update public.pos_sales set (no, gui_no, shift_id, customer_id, date, at, lines, discount, total, tax, method, received, change, points, cashier, status, created_at, updated_at) = (select no, gui_no, shift_id, customer_id, date, at, lines, discount, total, tax, method, received, change, points, cashier, status, created_at, updated_at from jsonb_populate_record(null::public.pos_sales, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.pos_sales where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.pos_sales where true;
        return;
      end if;
    when 'invoices' then
      if op = 'insert' or op = 'restore' then
        insert into public.invoices select * from jsonb_populate_record(null::public.invoices, r);
      elsif op = 'update' then
        update public.invoices set (no, gui_no, customer_id, sales_order_id, shipment_id, date, due_date, amount, tax, total, paid, credited, status, created_at, updated_at) = (select no, gui_no, customer_id, sales_order_id, shipment_id, date, due_date, amount, tax, total, paid, credited, status, created_at, updated_at from jsonb_populate_record(null::public.invoices, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.invoices where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.invoices where true;
        return;
      end if;
    when 'bills' then
      if op = 'insert' or op = 'restore' then
        insert into public.bills select * from jsonb_populate_record(null::public.bills, r);
      elsif op = 'update' then
        update public.bills set (no, supplier_id, purchase_order_id, date, due_date, amount, tax, total, paid, credited, status, receipt_no, note, created_at, updated_at) = (select no, supplier_id, purchase_order_id, date, due_date, amount, tax, total, paid, credited, status, receipt_no, note, created_at, updated_at from jsonb_populate_record(null::public.bills, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.bills where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.bills where true;
        return;
      end if;
    when 'payments' then
      if op = 'insert' or op = 'restore' then
        insert into public.payments select * from jsonb_populate_record(null::public.payments, r);
      elsif op = 'update' then
        update public.payments set (no, kind, invoice_id, bill_id, party_id, date, amount, method, note, created_at, updated_at) = (select no, kind, invoice_id, bill_id, party_id, date, amount, method, note, created_at, updated_at from jsonb_populate_record(null::public.payments, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.payments where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.payments where true;
        return;
      end if;
    when 'journal' then
      if op = 'insert' or op = 'restore' then
        insert into public.journal select * from jsonb_populate_record(null::public.journal, r);
      elsif op = 'update' then
        update public.journal set (no, date, memo, lines, ref_type, ref_id, created_at, updated_at) = (select no, date, memo, lines, ref_type, ref_id, created_at, updated_at from jsonb_populate_record(null::public.journal, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.journal where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.journal where true;
        return;
      end if;
    else raise exception '沒有這張資料表：%', t;
  end case;
  get diagnostics n = row_count;
  -- 修改 / 刪除沒有影響任何一筆：資料不存在，或沒有權限（RLS 會默默略過，這裡改成明確拒絕）
  if n = 0 and op in ('update', 'delete') then
    raise exception '沒有權限修改「%」或資料已不存在（%）', t, r->>'id' using errcode = '42501';
  end if;
end $$;

create or replace function public.erp_apply(ops jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare x jsonb;
begin
  if not public.erp_is_member() then raise exception '你的帳號還沒有開通，請管理員在「使用者與權限」加入你的 Email'; end if;
  for x in select * from jsonb_array_elements(ops) loop
    perform public.erp_write(x ->> 't', x ->> 'op', x -> 'row');
  end loop;
end $$;

-- 還原備份 / 第一次上傳：只有系統擁有者可以，會先清空那張表
create or replace function public.erp_restore(t text, rows jsonb, wipe boolean) returns void
language plpgsql security invoker set search_path = '' as $$
declare x jsonb;
begin
  if not public.erp_is_owner() then raise exception '只有系統擁有者可以還原或上傳整份資料'; end if;
  perform set_config('erp.restore', 'on', true);
  if wipe then perform public.erp_write(t, 'delete-all', '{}'::jsonb); end if;
  for x in select * from jsonb_array_elements(rows) loop
    perform public.erp_write(t, 'restore', x);
  end loop;
end $$;

create or replace function public.erp_whoami() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('email', public.erp_email(), 'owner', public.erp_is_owner(), 'user_id', public.erp_user_id())
$$;

-- 資料表：登入的人才有存取權（實際能讀寫哪些由上面的 policy 決定）；沒登入的訪客完全沒有權限
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;

revoke execute on function public.erp_apply(jsonb), public.erp_restore(text, jsonb, boolean), public.erp_write(text, text, jsonb) from public, anon;
grant execute on function public.erp_apply(jsonb), public.erp_restore(text, jsonb, boolean), public.erp_write(text, text, jsonb), public.erp_whoami() to authenticated;

