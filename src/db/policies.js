// 雲端（Supabase）權限：登入的員工才能讀寫，寫入依角色的模組權限檢查；
// 帳務、庫存、簽核、關帳的關鍵規則由資料庫觸發器在伺服器端再檢查一次。
// schemaSQL() 會把這裡的內容接在建表 SQL 後面，一起輸出成 supabase/schema.sql。
import { SCHEMA } from './schema.js'

// 每張表可以由哪些模組（編輯權限以上）寫入。'member' = 任何已開通的員工
export const WRITE_MODULES = {
  roles: ['admin'],
  users: ['admin'],
  settings: null, // 依 key 檢查，見 erp_can_write_setting
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
