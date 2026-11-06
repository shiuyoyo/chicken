// 雲端資料庫權限測試：在真的 PostgreSQL 上套用 supabase/schema.sql，
// 用每位員工的身分把示範情境（進貨、生產、QC、出貨、POS、簽核…）整批重播，再測試各種越權與違規寫入。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'crypto'
import { useBackend, initStore, all, currentUser, exportAll } from '../src/db/store'
import { seedDemo, DEMO_USERS } from '../src/db/seed'
import { schemaSQL, TABLES } from '../src/db/schema'
import { toDbRow } from '../src/db/supabase'
import * as L from '../src/logic'
import { hasPostgres, startPostgres, AUTH_STUB, asUser, dollar } from './pg'

const OWNER = randomUUID()
const STRANGER = randomUUID()
const UNCONFIRMED = randomUUID()
const uids = Object.fromEntries(DEMO_USERS.map(([name]) => [name, randomUUID()]))
const emailOf = (name) => `u${DEMO_USERS.findIndex(([n]) => n === name)}@test.local`

let pg
let batches = []
const payload = (ops) => ops.map(({ t, op, row }) => ({ t, op, row: op === 'delete' ? { id: row.id } : toDbRow(t, t === 'users' ? { ...row, email: emailOf(row.name) } : row) }))
const apply = (who, ops) => asUser(who, `select public.erp_apply(${dollar(JSON.stringify(payload(ops)))}::jsonb);`)
const q = (who, sql) => pg.psql(asUser(who, sql)).split('\n').pop() || ''
const fails = (who, ops) => {
  try {
    pg.psql(apply(who, ops))
  } catch (e) {
    return e.message
  }
  return ''
}
const user = (name) => all('users').find((u) => u.name === name)
const row = (t, data) => ({ t, op: 'insert', row: { id: randomUUID().slice(0, 20), created_at: L.today(), updated_at: L.today(), ...data } })

describe.skipIf(!hasPostgres)('雲端資料庫權限（PostgreSQL）', () => {
  beforeAll(async () => {
    // 1) 跑示範情境，記錄每一批寫入是誰做的
    useBackend({
      name: 'capture',
      loadAll: async (t) => Object.fromEntries(t.map((x) => [x, []])),
      save(t, op, r) {
        batches.push({ by: currentUser()?.name, ops: [{ t, op, row: r }] })
      },
      saveBatch(ops) {
        batches.push({ by: currentUser()?.name, ops })
      },
      replaceAll: async () => {},
    })
    await initStore()
    await seedDemo()
    batches = batches.filter((b) => b.ops.length)
    // 2) 建資料庫：模擬 Supabase auth + 我們的 schema
    pg = startPostgres()
    pg.psql(AUTH_STUB)
    pg.psql(schemaSQL())
    const users = [
      [OWNER, 'owner@test.local', true],
      [STRANGER, 'stranger@test.local', true],
      [UNCONFIRMED, emailOf('王老闆'), false],
      ...DEMO_USERS.map(([n]) => [uids[n], emailOf(n), true]),
    ]
    pg.psql(
      users.map(([id, email, ok]) => `insert into auth.users values ('${id}', '${email}', ${ok ? 'now()' : 'null'});`).join('\n') +
        `\ninsert into erp_private.owners values ('owner@test.local');`,
    )
  }, 120000)
  afterAll(() => pg?.stop())

  it('示範情境的每個動作，用各員工自己的身分都能寫進去，資料筆數完全一致', () => {
    // 還沒建立員工資料前的動作（建立角色、員工）由系統擁有者執行
    const script = batches.map((b) => apply(b.by ? uids[b.by] : OWNER, b.ops)).join('\n')
    pg.psql(script)
    const data = exportAll()
    for (const t of TABLES) expect(Number(pg.psql(`select count(*) from public.${t}`)), t).toBe(data[t].length)
  }, 120000)

  it('沒登入、沒開通、信箱沒驗證的帳號讀不到任何資料，也不能寫入', () => {
    expect(() => q(null, 'select count(*) from public.items;')).toThrow(/permission denied/)
    expect(q(STRANGER, 'select count(*) from public.items;')).toBe('0')
    expect(q(UNCONFIRMED, 'select count(*) from public.customers;')).toBe('0')
    expect(q(uids['小美'], 'select count(*) from public.items;')).not.toBe('0')
    expect(fails(STRANGER, [row('customers', { name: '駭客' })])).toMatch(/還沒有開通/)
    expect(fails(null, [row('customers', { name: '駭客' })])).toMatch(/permission denied|還沒有開通/)
    expect(q(STRANGER, `select public.erp_whoami() ->> 'user_id';`)).toBe('')
    expect(q(uids['小美'], `select public.erp_whoami() ->> 'user_id';`)).toBe(user('小美').id)
  })

  it('依角色的模組權限擋寫入：門市人員不能開採購單、不能改自己的權限', () => {
    expect(fails(uids['小美'], [row('purchase_orders', { no: 'PO-X', status: 'open', lines: [] })])).toMatch(/row-level security/)
    const me = user('小美')
    const boss = all('roles').find((r) => r.name === '管理者')
    expect(fails(uids['小美'], [{ t: 'users', op: 'update', row: { ...me, role_id: boss.id } }])).toMatch(/沒有權限修改「users」/)
    expect(fails(uids['小美'], [row('settings', { key: 'tax_rate', value: 0 })])).toMatch(/row-level security/)
    // 門市結帳要更新發票號碼，這個可以
    const gui = all('settings').find((s) => s.key === 'gui_next')
    expect(fails(uids['小美'], [{ t: 'settings', op: 'update', row: { ...gui, value: gui.value + 1 } }])).toBe('')
  })

  it('傳票借貸不平衡、修改傳票、刪除傳票都會被伺服器擋下', () => {
    const acc = uids['林會計']
    expect(fails(acc, [row('journal', { no: 'JV-X', date: L.today(), lines: [{ account: 1100, debit: 100, credit: 0 }, { account: 4100, debit: 0, credit: 90 }] })])).toMatch(/借貸不平衡/)
    const j = all('journal')[0]
    expect(fails(acc, [{ t: 'journal', op: 'update', row: { ...j, memo: '偷改' } }])).toMatch(/不能修改或刪除/)
    const before = q(OWNER, 'select count(*) from public.journal;')
    expect(fails(uids['王老闆'], [{ t: 'journal', op: 'delete', row: j }])).toMatch(/沒有權限|不能修改或刪除/)
    expect(q(OWNER, 'select count(*) from public.journal;')).toBe(before)
  })

  it('庫存不能扣成負數、庫存異動不能修改', () => {
    const m = all('stock_moves').find((x) => x.qty > 0)
    expect(fails(uids['張師傅'], [row('stock_moves', { item_id: m.item_id, bin_id: m.bin_id, lot_no: m.lot_no, qty: -999999, type: 'issue', date: new Date().toISOString(), doc_date: L.today() })])).toMatch(/庫存不足/)
    expect(fails(uids['張師傅'], [{ t: 'stock_moves', op: 'update', row: { ...m, qty: m.qty + 100 } }])).toMatch(/不能修改或刪除/)
  })

  it('關帳後不能補登；只有系統管理核准權可以重新開帳', () => {
    const acc = uids['林會計']
    const until = L.addDays(L.today(), -2)
    expect(fails(acc, [row('settings', { key: 'closed_until', value: until })])).toBe('')
    expect(fails(acc, [row('journal', { no: 'JV-Y', date: L.addDays(until, -1), lines: [{ account: 6200, debit: 10 }, { account: 1100, credit: 10 }] })])).toMatch(/已關帳/)
    const m = all('stock_moves').find((x) => x.qty > 0)
    expect(fails(uids['張師傅'], [row('stock_moves', { item_id: m.item_id, bin_id: m.bin_id, lot_no: m.lot_no, qty: 1, type: 'adjust', date: new Date().toISOString(), doc_date: until })])).toMatch(/已關帳/)
    const cur = JSON.parse(q(OWNER, `select row_to_json(s) from public.settings s where key = 'closed_until';`))
    expect(fails(acc, [{ t: 'settings', op: 'update', row: { ...cur, value: '' } }])).toMatch(/重新開帳/)
    expect(fails(uids['王老闆'], [{ t: 'settings', op: 'update', row: { ...cur, value: '' } }])).toBe('')
  })

  it('簽核：不能冒用別人申請、不能核准自己的申請、沒有核准權不能核准、處理過的不能再改', () => {
    const boss = user('王老闆')
    const plant = user('劉廠長')
    expect(fails(uids['張師傅'], [row('approvals', { type: 'adjust', module: 'wms', status: 'pending', requested_by: boss.id })])).toMatch(/申請人必須是自己/)
    expect(fails(uids['張師傅'], [row('approvals', { type: 'adjust', module: 'wms', status: 'approved', requested_by: user('張師傅').id })])).toMatch(/只能是待簽核/)
    const mine = row('approvals', { type: 'po', module: 'purchase', status: 'pending', requested_by: plant.id, amount: 1 })
    expect(fails(uids['劉廠長'], [mine])).toBe('')
    expect(fails(uids['劉廠長'], [{ ...mine, op: 'update', row: { ...mine.row, status: 'approved', decided_by: plant.id } }])).toMatch(/不能核准自己/)
    expect(fails(uids['吳採購'], [{ ...mine, op: 'update', row: { ...mine.row, status: 'approved', decided_by: user('吳採購').id } }])).toMatch(/沒有核准權限/)
    expect(fails(uids['吳採購'], [{ ...mine, op: 'update', row: { ...mine.row, status: 'approved', decided_by: boss.id } }])).toMatch(/核准人必須是自己/)
    expect(fails(uids['王老闆'], [{ ...mine, op: 'update', row: { ...mine.row, status: 'approved', decided_by: boss.id } }])).toBe('')
    expect(fails(uids['王老闆'], [{ ...mine, op: 'update', row: { ...mine.row, status: 'rejected', decided_by: boss.id } }])).toMatch(/已處理過/)
  })

  it('操作紀錄的人員姓名由伺服器填，不能冒名', () => {
    const r = row('audit_log', { user_name: '王老闆', action: '新增', table_name: 'x', summary: '冒名測試' })
    expect(fails(uids['小美'], [r])).toBe('')
    expect(q(OWNER, `select user_name from public.audit_log where id = '${r.row.id}';`)).toBe('小美')
  })

  it('同一批異動有一筆被拒絕，整批都不會寫入', () => {
    const c = row('customers', { name: '整批測試客戶', kind: 'company' })
    const bad = row('journal', { no: 'JV-Z', date: L.today(), lines: [{ account: 1100, debit: 1 }] })
    expect(fails(uids['王老闆'], [c, bad])).toMatch(/借貸不平衡/)
    expect(q(OWNER, `select count(*) from public.customers where id = '${c.row.id}';`)).toBe('0')
  })

  it('只有系統擁有者可以整份覆蓋資料', () => {
    expect(() => pg.psql(asUser(uids['王老闆'], `select public.erp_restore('items', '[]'::jsonb, true);`))).toThrow(/只有系統擁有者/)
    const n = q(OWNER, 'select count(*) from public.items;')
    const items = all('items').map((i) => toDbRow('items', i))
    pg.psql(asUser(OWNER, `select public.erp_restore('items', ${dollar(JSON.stringify(items))}::jsonb, true);`))
    expect(q(OWNER, 'select count(*) from public.items;')).toBe(n)
  })
})
