-- 食品工廠 ERP：Supabase / Postgres schema（由 src/db/schema.js 產生）

-- 使用者
create table if not exists public.users (
  id text primary key,
  name text,
  role text,
  pin text,
  active boolean,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.users enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "users_all" on public.users;
create policy "users_all" on public.users for all using (true) with check (true);

-- 品項（原料/包材/成品）
create table if not exists public.items (
  id text primary key,
  code text,
  name text,
  type text,
  unit text,
  spec text,
  price numeric,
  cost numeric,
  safety_stock numeric,
  pack_per_box numeric,
  shelf_days integer,
  bom jsonb,
  active boolean,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.items enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "items_all" on public.items;
create policy "items_all" on public.items for all using (true) with check (true);

-- 客戶
create table if not exists public.customers (
  id text primary key,
  code text,
  name text,
  contact text,
  phone text,
  address text,
  tax_id text,
  terms_days integer,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.customers enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "customers_all" on public.customers;
create policy "customers_all" on public.customers for all using (true) with check (true);

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
  date date,
  due_date date,
  status text,
  lines jsonb,
  total numeric,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
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
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
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
  status text,
  lot_no text,
  feeds jsonb,
  output_qty numeric,
  waste_qty numeric,
  start_at timestamptz,
  end_at timestamptz,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.work_orders enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "work_orders_all" on public.work_orders;
create policy "work_orders_all" on public.work_orders for all using (true) with check (true);

-- 批號
create table if not exists public.lots (
  id text primary key,
  lot_no text,
  item_id text,
  work_order_id text,
  qty numeric,
  unit_cost numeric,
  qc_status text,
  mfg_date date,
  exp_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.lots enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "lots_all" on public.lots;
create policy "lots_all" on public.lots for all using (true) with check (true);

-- 庫存異動
create table if not exists public.stock_moves (
  id text primary key,
  date timestamptz,
  item_id text,
  qty numeric,
  loc text,
  type text,
  lot_no text,
  unit_cost numeric,
  ref_type text,
  ref_id text,
  note text,
  user_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.stock_moves enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "stock_moves_all" on public.stock_moves;
create policy "stock_moves_all" on public.stock_moves for all using (true) with check (true);

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
alter table public.shipments enable row level security;
-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。
drop policy if exists "shipments_all" on public.shipments;
create policy "shipments_all" on public.shipments for all using (true) with check (true);

-- 應收（發票）
create table if not exists public.invoices (
  id text primary key,
  no text,
  customer_id text,
  sales_order_id text,
  shipment_id text,
  date date,
  due_date date,
  amount numeric,
  tax numeric,
  total numeric,
  paid numeric,
  status text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
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
  status text,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
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

