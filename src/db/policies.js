// 雲端（Supabase）權限：登入的員工才能讀寫，寫入依角色的模組權限檢查；
// 帳務、庫存、簽核、關帳的關鍵規則由資料庫觸發器在伺服器端再檢查一次。
// schemaSQL() 會把這裡的內容接在建表 SQL 後面，一起輸出成 supabase/schema.sql。
import { SCHEMA } from './schema.js'

// 每張表可以由哪些模組（編輯權限以上）寫入。'member' = 任何已開通的員工
export const WRITE_MODULES = {
  roles: ['admin'],
  users: ['admin'],
  settings: null, // 依 key 檢查，見 erp_can_write_setting
  promotions: null, // 活動價可以低於最低售價，只有業務 / CRM 主管（核准權）能設定
  approvals: 'member', // 簽核決定另外由觸發器檢查
  notify_contacts: ['admin'],
  notifications: 'member',
  audit_log: 'member',
  items: ['master'],
  warehouses: ['wms', 'master'],
  bins: ['wms', 'master'],
  customers: ['crm', 'sales', 'pos'],
  price_lists: ['crm', 'sales'],
  activities: ['crm', 'sales'],
  opportunities: ['crm', 'sales'],
  quotations: ['crm', 'sales'],
  suppliers: ['purchase', 'master'],
  sales_orders: ['sales', 'shipping'],
  requisitions: ['purchase', 'wms', 'production'],
  purchase_orders: ['purchase', 'wms'],
  work_orders: ['production', 'qc'],
  lots: ['production', 'purchase', 'wms', 'qc'],
  stock_moves: ['wms', 'purchase', 'production', 'shipping', 'sales', 'pos', 'qc'],
  transfers: ['wms', 'pos'],
  stocktakes: ['wms'],
  qc_inspections: ['qc'],
  shipments: ['shipping'],
  returns: ['sales', 'purchase', 'shipping'],
  pos_shifts: ['pos'],
  pos_sales: ['pos'],
  invoices: ['accounting', 'shipping', 'sales', 'pos'],
  bills: ['accounting', 'purchase', 'wms'],
  payments: ['accounting'],
  journal: ['accounting', 'purchase', 'wms', 'production', 'shipping', 'sales', 'pos', 'qc'],
}
// 可以刪除資料的表（主檔維護），其他表只有系統擁有者在還原備份時能刪
export const DELETABLE = ['roles', 'items', 'warehouses', 'bins', 'customers', 'price_lists', 'activities', 'suppliers']

const sqlArr = (mods) => `array[${mods.map((m) => `'${m}'`).join(', ')}]`
const writeCheck = (t) => {
  const m = WRITE_MODULES[t]
  if (t === 'settings') return 'public.erp_can_write_setting(key)'
  if (t === 'promotions') return "(public.erp_level('sales') >= 3 or public.erp_level('crm') >= 3)"
  if (m === 'member') return 'public.erp_is_member()'
  return `public.erp_can_write(${sqlArr(m)})`
}

// 每張表的新增 / 修改 / 刪除（給 erp_apply、erp_restore 共用）。
// 不用 upsert：ON CONFLICT 會讓「新增」的觸發器也跑在修改上，而且權限不足的修改會被默默略過。
function writeCases() {
  return Object.entries(SCHEMA)
    .map(([t, def]) => {
      const cols = [...Object.keys(def.cols), 'created_at', 'updated_at']
      return `    when '${t}' then
      if op = 'insert' or op = 'restore' then
        insert into public.${t} select * from jsonb_populate_record(null::public.${t}, r);
      elsif op = 'update' then
        update public.${t} set (${cols.join(', ')}) = (select ${cols.join(', ')} from jsonb_populate_record(null::public.${t}, r)) where id = r->>'id';
      elsif op = 'delete' then
        delete from public.${t} where id = r->>'id';
      elsif op = 'delete-all' then
        delete from public.${t} where true;
        return;
      end if;`
    })
    .join('\n')
}

export function policiesSQL() {
  const out = []
  out.push(String.raw`
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
    when k = 'sales_targets' then public.erp_level('sales') >= 3 or public.erp_level('admin') >= 2
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
`)

  for (const t of Object.keys(SCHEMA)) {
    const w = writeCheck(t)
    out.push(
      `-- ${SCHEMA[t].label}`,
      `drop policy if exists "${t}_all" on public.${t};`,
      `drop policy if exists "${t}_read" on public.${t};`,
      `drop policy if exists "${t}_insert" on public.${t};`,
      `drop policy if exists "${t}_update" on public.${t};`,
      `drop policy if exists "${t}_delete" on public.${t};`,
      `create policy "${t}_read" on public.${t} for select to authenticated using (public.erp_is_member());`,
      `create policy "${t}_insert" on public.${t} for insert to authenticated with check (${w});`,
      t === 'audit_log'
        ? `create policy "${t}_update" on public.${t} for update to authenticated using (public.erp_is_owner()) with check (public.erp_is_owner());`
        : `create policy "${t}_update" on public.${t} for update to authenticated using (${w}) with check (${w});`,
      `create policy "${t}_delete" on public.${t} for delete to authenticated using (public.erp_is_owner()${DELETABLE.includes(t) ? ` or ${w}` : ''});`,
      '',
    )
  }

  out.push(String.raw`
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
    -- 記下「這個交易裡核准了什麼」，給下面的門檻檢查用（核准後執行的動作在同一個交易裡）
    if new.status = 'approved' then
      perform set_config('erp.approved', coalesce(current_setting('erp.approved', true), '') || '|' || new.type || ':' || coalesce(new.ref_id, '') || '|', true);
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
-- 簽核門檻與數量上限（伺服器端）：在交易結束（commit）時檢查，
-- 所以「核准」與「核准後執行的動作」在同一批送來時，順序不影響
-- ======================================================================
create or replace function public.erp_num(k text, d numeric) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(public.erp_setting(k) #>> '{}', '')::numeric, d)
$$;
create or replace function public.erp_flag(k text, d boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(public.erp_setting(k) #>> '{}', '')::boolean, d)
$$;
-- 這個交易裡是否核准了某張單據
create or replace function public.erp_approved_now(t text, ref text) returns boolean
language sql stable set search_path = '' as $$
  select position('|' || t || ':' || coalesce(ref, '') || '|' in coalesce(current_setting('erp.approved', true), '')) > 0
$$;
-- 這張單據是否有已核准、金額涵蓋 amt 的簽核
create or replace function public.erp_has_approval(t text, ref text, amt numeric) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.approvals a where a.type = t and a.ref_id = ref and a.status = 'approved' and coalesce(a.amount, 0) >= amt - 0.01)
$$;
create or replace function public.erp_lines_total(lines jsonb) returns numeric
language sql immutable set search_path = '' as $$
  select coalesce(sum(coalesce((l ->> 'qty')::numeric, 0) * coalesce((l ->> 'price')::numeric, 0)), 0) from jsonb_array_elements(coalesce(lines, '[]'::jsonb)) l
$$;

-- 採購單：超過金額門檻要核准；進貨不能超過可超收比例
create or replace function public.erp_po_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cur public.purchase_orders; total numeric; bad text;
begin
  if public.erp_bypass() then return null; end if;
  select * into cur from public.purchase_orders where id = new.id;
  if not found then return null; end if;
  select string_agg(l ->> 'item_id', '、') into bad from jsonb_array_elements(coalesce(cur.lines, '[]'::jsonb)) l
    where coalesce((l ->> 'received')::numeric, 0) > coalesce((l ->> 'qty')::numeric, 0) * (1 + public.erp_num('receive_tolerance', 0.1)) + 0.0005;
  if bad is not null then raise exception '採購單 % 進貨超過可超收比例', cur.no; end if;
  if cur.status in ('pending', 'rejected', 'cancelled') then return null; end if;
  total := public.erp_lines_total(cur.lines);
  if total > public.erp_num('po_approval_amount', 50000) + 0.005
     and (tg_op = 'INSERT' or old.status in ('pending', 'rejected') or total > public.erp_lines_total(old.lines) + 0.005)
     and not public.erp_has_approval('po', cur.id, total) then
    raise exception '採購單 % 金額 % 超過門檻，需要先核准', cur.no, round(total);
  end if;
  return null;
end $$;
drop trigger if exists erp_po_rules on public.purchase_orders;
create constraint trigger erp_po_rules after insert or update on public.purchase_orders deferrable initially deferred for each row execute function public.erp_po_rules();

-- 促銷活動價：這個價格是否不低於當天有效活動的活動價（活動由主管設定）
create or replace function public.erp_promo_allows(item text, price numeric, cust text, d date) returns boolean
language sql stable security definer set search_path = '' as $$
  with c as (select level, price_list_id from public.customers where id = cust),
  base as (
    select coalesce((select (pl ->> 'price')::numeric from public.price_lists p, jsonb_array_elements(p.lines) pl
                     where p.id = (select price_list_id from c) and pl ->> 'item_id' = item limit 1),
                    (select i.price from public.items i where i.id = item), 0) as b
  )
  select exists (
    select 1 from public.promotions p, jsonb_array_elements(coalesce(p.lines, '[]'::jsonb)) l
    where coalesce(p.active, true) and (p.start_date is null or p.start_date <= d) and (p.end_date is null or p.end_date >= d)
      and (coalesce(p.customer_level, '') = '' or p.customer_level = (select level from c))
      and l ->> 'item_id' = item
      and price >= coalesce(nullif((l ->> 'price')::numeric, 0), case when coalesce(p.discount_pct, 0) > 0 then round((select b from base) * (1 - p.discount_pct / 100), 2) end, 1e12) - 0.005
  )
$$;

-- 銷售訂單：低於最低售價、超過信用額度要核准
create or replace function public.erp_so_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cur public.sales_orders; total numeric; lim numeric; tax numeric; exposure numeric; low text;
begin
  if public.erp_bypass() then return null; end if;
  select * into cur from public.sales_orders where id = new.id;
  if not found or cur.status <> 'confirmed' then return null; end if;
  if tg_op = 'UPDATE' and old.status not in ('pending', 'rejected') and cur.lines is not distinct from old.lines then return null; end if;
  if public.erp_approved_now('so', cur.id) then return null; end if;
  -- 低於最低售價，而且不是當天有效的促銷活動價
  select string_agg(i.name, '、') into low from jsonb_array_elements(coalesce(cur.lines, '[]'::jsonb)) l
    join public.items i on i.id = l ->> 'item_id'
    where coalesce(i.min_price, 0) > 0 and coalesce((l ->> 'price')::numeric, 0) < i.min_price
      and not public.erp_promo_allows(l ->> 'item_id', coalesce((l ->> 'price')::numeric, 0), cur.customer_id, coalesce(cur.date, current_date));
  if low is not null then raise exception '訂單 % 的 % 低於最低售價，需要先核准', cur.no, low; end if;
  total := public.erp_lines_total(cur.lines);
  select credit_limit into lim from public.customers where id = cur.customer_id;
  if coalesce(lim, 0) > 0 and not public.erp_has_approval('so', cur.id, total) then
    tax := public.erp_num('tax_rate', 0.05);
    select coalesce(sum(i.total - coalesce(i.paid, 0) - coalesce(i.credited, 0)), 0) into exposure from public.invoices i where i.customer_id = cur.customer_id;
    exposure := exposure + coalesce((
      select sum(greatest(0, s.total * (1 + tax) - coalesce((select sum(i.total) from public.invoices i where i.sales_order_id = s.id), 0)))
      from public.sales_orders s where s.customer_id = cur.customer_id and s.status in ('confirmed', 'closed') and s.id <> cur.id), 0);
    if exposure + total * (1 + tax) > lim + 0.5 then
      raise exception '訂單 % 超過客戶信用額度（未收 % + 本單 % > 額度 %），需要先核准', cur.no, round(exposure), round(total * (1 + tax)), lim;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists erp_so_rules on public.sales_orders;
create constraint trigger erp_so_rules after insert or update on public.sales_orders deferrable initially deferred for each row execute function public.erp_so_rules();

-- 庫存：調整 / 盤差超過金額要核准；報廢要核准權；領料不能超過 BOM 用量的可超領比例
create or replace function public.erp_move_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v numeric; lim numeric := public.erp_num('adjust_approval_amount', 3000); wo public.work_orders; per numeric; got numeric;
begin
  if public.erp_bypass() then return null; end if;
  if new.type = 'adjust' then
    if new.ref_type = 'stocktakes' then
      select coalesce(sum(abs(qty * coalesce(unit_cost, 0))), 0) into v from public.stock_moves where type = 'adjust' and ref_type = 'stocktakes' and ref_id = new.ref_id;
      if round(v, 2) > lim + 0.005 and not public.erp_approved_now('stocktake', new.ref_id) then
        raise exception '盤點差異金額 % 超過門檻，需要先核准', round(v);
      end if;
    elsif round(abs(new.qty * coalesce(new.unit_cost, 0)), 2) > lim + 0.005 and not public.erp_approved_now('adjust', new.item_id) then
      raise exception '庫存調整金額 % 超過門檻，需要先核准', round(abs(new.qty * coalesce(new.unit_cost, 0)));
    end if;
  elsif new.type = 'scrap' then
    if public.erp_level('qc') < 3 and public.erp_level('wms') < 3 then raise exception '報廢需要品管或倉儲的核准權'; end if;
  elsif new.type = 'issue' and new.qty > 0 and new.ref_type = 'work_orders' then
    select * into wo from public.work_orders where id = new.ref_id;
    select (b ->> 'qty')::numeric into per from public.items i, jsonb_array_elements(coalesce(i.bom, '[]'::jsonb)) b
      where i.id = wo.product_id and b ->> 'item_id' = new.item_id limit 1;
    if per is null then raise exception '領料的品項不在工單 % 的 BOM 裡', wo.no; end if;
    select coalesce(sum(qty) filter (where type = 'issue'), 0) - coalesce(sum(qty) filter (where type = 'return'), 0) into got
      from public.stock_moves where ref_type = 'work_orders' and ref_id = wo.id and item_id = new.item_id and qty > 0;
    if got > per * wo.plan_qty * (1 + public.erp_num('issue_tolerance', 0.2)) + 0.0005 then
      raise exception '工單 % 領料超過 BOM 需求的可超領比例', wo.no;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists erp_move_rules on public.stock_moves;
create constraint trigger erp_move_rules after insert on public.stock_moves deferrable initially deferred for each row execute function public.erp_move_rules();

-- 銷貨退回：設定需要核准時，完成退貨要在同一個交易裡核准
create or replace function public.erp_return_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare cur public.returns;
begin
  if public.erp_bypass() then return null; end if;
  select * into cur from public.returns where id = new.id;
  if not found or cur.kind <> 'sales' or cur.status <> 'done' then return null; end if;
  if tg_op = 'UPDATE' and old.status = 'done' then return null; end if;
  if public.erp_flag('return_needs_approval', true) and not public.erp_approved_now('sales_return', cur.id) then
    raise exception '銷貨退回 % 需要先核准', cur.no;
  end if;
  return null;
end $$;
drop trigger if exists erp_return_rules on public.returns;
create constraint trigger erp_return_rules after insert or update on public.returns deferrable initially deferred for each row execute function public.erp_return_rules();

-- 門市：折扣超過上限、作廢交易要店長（或核准）
create or replace function public.erp_pos_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sub numeric;
begin
  if public.erp_bypass() then return null; end if;
  if tg_op = 'INSERT' then
    sub := public.erp_lines_total(new.lines);
    if coalesce(new.discount, 0) > sub * public.erp_num('pos_max_discount', 0.1) + 0.001 and public.erp_level('pos') < 3 then
      raise exception '折扣超過上限，需要店長操作';
    end if;
  elsif new.status = 'void' and old.status <> 'void' and public.erp_level('pos') < 3 and not public.erp_approved_now('pos_void', new.id) then
    raise exception '作廢門市交易需要店長核准';
  end if;
  return null;
end $$;
drop trigger if exists erp_pos_rules on public.pos_sales;
create constraint trigger erp_pos_rules after insert or update on public.pos_sales deferrable initially deferred for each row execute function public.erp_pos_rules();

-- 品管：不合格 / 暫扣的批號改判合格要品管核准權（或核准）
create or replace function public.erp_lot_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.erp_bypass() then return null; end if;
  if new.qc_status = 'pass' and old.qc_status in ('fail', 'hold') and public.erp_level('qc') < 3 and not public.erp_approved_now('qc_release', new.id) then
    raise exception '批號 % 改判合格需要品管主管核准', new.lot_no;
  end if;
  return null;
end $$;
drop trigger if exists erp_lot_rules on public.lots;
create constraint trigger erp_lot_rules after update on public.lots deferrable initially deferred for each row execute function public.erp_lot_rules();

-- 出貨：不能超出訂單數量
create or replace function public.erp_ship_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare bad text;
begin
  if public.erp_bypass() or new.sales_order_id is null then return null; end if;
  select string_agg(i.name, '、') into bad from (
    select l ->> 'item_id' item_id, sum((l ->> 'qty')::numeric) q from public.shipments s, jsonb_array_elements(s.lines) l
    where s.sales_order_id = new.sales_order_id group by 1
  ) x
  join public.items i on i.id = x.item_id
  left join lateral (
    select sum((ol ->> 'qty')::numeric) q from public.sales_orders so, jsonb_array_elements(so.lines) ol where so.id = new.sales_order_id and ol ->> 'item_id' = x.item_id
  ) o on true
  where x.q > coalesce(o.q, 0) + 0.0005;
  if bad is not null then raise exception '出貨超出訂單數量：%', bad; end if;
  return null;
end $$;
drop trigger if exists erp_ship_rules on public.shipments;
create constraint trigger erp_ship_rules after insert or update on public.shipments deferrable initially deferred for each row execute function public.erp_ship_rules();

-- 收付款：不能超過未收 / 未付金額
create or replace function public.erp_payment_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare paid numeric; due numeric; doc text;
begin
  if public.erp_bypass() then return null; end if;
  if new.invoice_id is not null and new.invoice_id <> '' then
    select coalesce(sum(amount), 0) into paid from public.payments where invoice_id = new.invoice_id and kind = 'in';
    select total - coalesce(credited, 0), no into due, doc from public.invoices where id = new.invoice_id;
  elsif new.bill_id is not null and new.bill_id <> '' then
    select coalesce(sum(amount), 0) into paid from public.payments where bill_id = new.bill_id and kind = 'out';
    select total - coalesce(credited, 0), no into due, doc from public.bills where id = new.bill_id;
  else
    return null;
  end if;
  if paid > coalesce(due, 0) + 0.01 then raise exception '% 收付款合計 % 超過應收付金額 %', doc, paid, due; end if;
  return null;
end $$;
drop trigger if exists erp_payment_rules on public.payments;
create constraint trigger erp_payment_rules after insert on public.payments deferrable initially deferred for each row execute function public.erp_payment_rules();

-- ======================================================================
-- 網頁寫入用的函式：一個動作的所有異動在同一個資料庫交易裡完成，任何一筆被拒絕就整批取消
-- ======================================================================
create or replace function public.erp_write(t text, op text, r jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare n int;
begin
  if op not in ('insert', 'update', 'delete', 'delete-all', 'restore') then raise exception '不支援的動作：%', op; end if;
  case t
${writeCases()}
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
`)
  return out.join('\n')
}
