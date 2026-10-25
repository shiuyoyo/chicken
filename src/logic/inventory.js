// 倉儲 WMS：倉庫 / 儲位、批號、庫存索引、先到期先出(FEFO)配貨、調撥、調整、盤點、效期。
import { all, get, where, insert, update, findBy, nextNo, nowISO, memo, transaction } from '../db/store'
import {
  fail, need, needAny, round, sum, today, addDays, daysBetween, userName, getSetting, postJournal, assertOpen,
  requestApproval, registerApproval, isSystem, asSystem,
} from './core'

export const WAREHOUSE_KINDS = { storage: '倉庫', line: '產線', store: '門市', quarantine: '待處理區（退貨 / 隔離）' }
export const TEMP_ZONES = ['冷凍', '冷藏', '常溫']
export const MOVE_TYPES = {
  receive: '進貨', issue: '領料', feed: '投料', output: '產出', ship: '出貨', adjust: '調整', return: '退料',
  transfer: '調撥', pos: '門市銷售', sales_return: '銷貨退回', purchase_return: '退回供應商', scrap: '報廢',
}

// ---------- 倉庫 / 儲位 ----------
export const binOf = (id) => get('bins', id)
export const warehouseOfBin = (binId) => get('warehouses', binOf(binId)?.warehouse_id)
export const binKind = (binId) => warehouseOfBin(binId)?.kind
export const binLabel = (binId) => {
  const b = binOf(binId)
  if (!b) return '—'
  return `${get('warehouses', b.warehouse_id)?.name || ''} ${b.code}`
}
export const binsOfKind = (kind) => where('bins', (b) => b.active !== false && get('warehouses', b.warehouse_id)?.kind === kind)
export const lineBin = () => binsOfKind('line')[0]?.id || fail('尚未設定產線儲位')
export const quarantineBin = () => binsOfKind('quarantine')[0]?.id || fail('尚未設定待處理區儲位')

// 溫層規則：冷凍品不能放常溫倉，依此類推（產線與待處理區除外）
export function checkTemp(itemId, binId, itemData) {
  const item = itemData || get('items', itemId)
  const wh = warehouseOfBin(binId)
  if (!wh) fail('儲位不存在')
  if (['line', 'quarantine'].includes(wh.kind)) return
  if (item?.temp_zone && wh.temp_zone && item.temp_zone !== wh.temp_zone)
    fail(`溫層不符：${item.name} 需要「${item.temp_zone}」，但 ${wh.name} 是「${wh.temp_zone}」`)
}

export const defaultBin = (itemId) => {
  const item = get('items', itemId)
  if (item?.default_bin_id && binOf(item.default_bin_id)) return item.default_bin_id
  const b = binsOfKind('storage').find((b) => !item?.temp_zone || get('warehouses', b.warehouse_id)?.temp_zone === item.temp_zone)
  return b?.id || fail(`${item?.name} 沒有預設儲位，請到品項設定`)
}

// ---------- 批號 ----------
const lotIndex = () => memo('lotIndex', () => new Map(all('lots').map((l) => [l.lot_no, l])))
export const lotByNo = (no) => lotIndex().get(no)
export const daysLeft = (lot, d = today()) => (lot?.exp_date ? daysBetween(d, lot.exp_date) : 9999)
export const isExpired = (lot, d = today()) => !!lot?.exp_date && lot.exp_date < d

export function createLot(data) {
  return insert('lots', { qc_status: 'pass', ...data, lot_no: data.lot_no || nextNo('lots', data.kind === 'raw' ? 'R' : 'L', data.mfg_date || today()) })
}

// ---------- 庫存 ----------
// 索引：item|bin|lot → 數量，資料沒變就不重算
const stockIndex = () =>
  memo('stockIndex', () => {
    const m = new Map()
    for (const s of all('stock_moves')) {
      const k = `${s.item_id}|${s.bin_id}|${s.lot_no || ''}`
      m.set(k, (m.get(k) || 0) + Number(s.qty))
    }
    return m
  })

// 篩選條件：item_id、bin_id、warehouse_id、lot_no、kinds（倉庫種類陣列）
export function stockRows(f = {}) {
  const out = []
  for (const [k, q] of stockIndex()) {
    const qty = round(q, 3)
    if (!qty) continue
    const [item_id, bin_id, lot_no] = k.split('|')
    if (f.item_id && item_id !== f.item_id) continue
    if (f.bin_id && bin_id !== f.bin_id) continue
    if (f.lot_no !== undefined && lot_no !== f.lot_no) continue
    if (f.warehouse_id && binOf(bin_id)?.warehouse_id !== f.warehouse_id) continue
    if (f.kinds && !f.kinds.includes(binKind(bin_id))) continue
    out.push({ item_id, bin_id, lot_no, qty })
  }
  return out
}
export const onHand = (f) => round(sum(stockRows(f), (r) => r.qty), 3)
// 倉庫可用量：只算倉庫裡 QC 合格、未過期的批號（不含產線、門市、待處理區）
export const stockOf = (itemId, date = today()) =>
  round(
    sum(
      stockRows({ item_id: itemId, kinds: ['storage'] }).filter((r) => {
        const l = lotByNo(r.lot_no)
        return r.qty > 0 && (!l || (l.qc_status === 'pass' && !isExpired(l, date)))
      }),
      (r) => r.qty,
    ),
    3,
  )
export const lineStock = (itemId) => onHand({ item_id: itemId, kinds: ['line'] })
export const lotStock = (lotNo) => onHand({ lot_no: lotNo })
export const stockValue = (rows) => round(sum(rows, (r) => r.qty * (lotByNo(r.lot_no)?.unit_cost || get('items', r.item_id)?.cost || 0)))

// 某日（含）結束時的庫存價值：依單據日期累計異動
export function stockValueAsOf(date) {
  return round(sum(all('stock_moves').filter((m) => (m.doc_date || String(m.date).slice(0, 10)) <= date), (m) => m.qty * lotCost(m.lot_no, m.item_id)))
}

export function lotCost(lotNo, itemId) {
  const l = lotByNo(lotNo)
  return Number(l?.unit_cost ?? get('items', itemId)?.cost ?? 0)
}

// 最近進貨成本（沒有批號時用品項參考成本）
export function lastCost(itemId) {
  const l = where('lots', (l) => l.item_id === itemId && l.unit_cost > 0).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
  return Number(l?.unit_cost ?? get('items', itemId)?.cost ?? 0)
}

// 先到期先出配貨。回傳 [{ item_id, lot_no, bin_id, qty }]，不足就丟錯並說明原因
export function allocate(itemId, qty, opt = {}) {
  const { kinds = ['storage'], bin_id, needPass = true, minDaysLeft = 0, lot_no, allowExpired = false, date = today() } = opt
  qty = round(qty, 3)
  if (!(qty > 0)) return []
  const rows = stockRows({ item_id: itemId, kinds, bin_id, lot_no }).filter((r) => r.qty > 0)
  let blockedQC = 0
  let blockedExp = 0
  const ok = []
  for (const r of rows) {
    const lot = lotByNo(r.lot_no)
    if (needPass && lot && lot.qc_status !== 'pass') {
      blockedQC += r.qty
      continue
    }
    if (lot && ((!allowExpired && isExpired(lot, date)) || (minDaysLeft && daysLeft(lot, date) < minDaysLeft))) {
      blockedExp += r.qty
      continue
    }
    ok.push({ ...r, lot })
  }
  ok.sort((a, b) => String(a.lot?.exp_date || '9999').localeCompare(String(b.lot?.exp_date || '9999')) || String(a.lot?.mfg_date).localeCompare(String(b.lot?.mfg_date)))
  const out = []
  let left = qty
  for (const r of ok) {
    if (left <= 0) break
    const take = round(Math.min(left, r.qty), 3)
    out.push({ item_id: itemId, lot_no: r.lot_no, bin_id: r.bin_id, qty: take })
    left = round(left - take, 3)
  }
  if (left > 0) {
    const item = get('items', itemId)
    const why = [blockedQC && `${round(blockedQC, 3)} 尚未通過 QC`, blockedExp && `${round(blockedExp, 3)} 已過期或效期不足`].filter(Boolean).join('、')
    fail(`${item?.name || itemId} 可用庫存不足：需要 ${qty}，可用 ${round(qty - left, 3)}${why ? `（另有 ${why}）` : ''}`)
  }
  return out
}

// 庫存單據號碼（進貨單 RC、領料單 MI、退料單 MR、生產入庫單 MS、調整單 AJ…）
// 同一次動作的多筆異動共用一個單號，對應鼎新 ERP 的「單據」，可以單獨查詢與列印
export const DOC_TYPES = {
  RC: '進貨單', MI: '領料單', FD: '投料單', MR: '退料單', MS: '生產入庫單', AJ: '庫存調整單', SC: '報廢單',
  TR: '調撥單', SH: '出貨單', SR: '銷退單', PR: '進退單', POS: '門市銷售',
}
export function nextDocNo(prefix, date = today()) {
  const head = `${prefix}${String(date).slice(0, 10).replace(/-/g, '')}-`
  let max = 0
  for (const m of all('stock_moves')) if (m.doc_no?.startsWith(head)) max = Math.max(max, Number(m.doc_no.slice(head.length)) || 0)
  return head + String(max + 1).padStart(3, '0')
}

// 寫一筆庫存異動（出庫時檢查不能變負）
export function move(m) {
  const qty = round(m.qty, 3)
  if (!qty) return null
  if (!binOf(m.bin_id)) fail('儲位不存在')
  if (qty < 0) {
    const have = onHand({ item_id: m.item_id, bin_id: m.bin_id, lot_no: m.lot_no || '' })
    if (have + qty < -0.0005) fail(`${get('items', m.item_id)?.name} 批號 ${m.lot_no} 在 ${binLabel(m.bin_id)} 只有 ${have}，不能扣 ${-qty}`)
  }
  return insert('stock_moves', { date: nowISO(), doc_date: today(), user_name: userName(), ...m, lot_no: m.lot_no || '', qty })
}

// ---------- 調撥 ----------
// lines: [{ item_id, qty, lot_no? }]，沒指定批號依先到期先出
export function transfer({ from_bin_id, to_bin_id, lines, reason = '', date = today() }) {
  return transaction(() => {
    need('wms', 2)
    if (!from_bin_id || !to_bin_id) fail('請選擇來源與目的儲位')
    if (from_bin_id === to_bin_id) fail('來源與目的儲位相同')
    const toKind = binKind(to_bin_id)
    const valid = lines.filter((l) => l.item_id && Number(l.qty) > 0)
    if (!valid.length) fail('請輸入調撥數量')
    const alloc = valid.flatMap((l) => {
      checkTemp(l.item_id, to_bin_id)
      // 送到門市或倉庫的成品必須是 QC 合格；從待處理區放行也必須合格
      const needPass = toKind === 'store' || (toKind === 'storage' && binKind(from_bin_id) === 'quarantine')
      return allocate(l.item_id, l.qty, { kinds: null, bin_id: from_bin_id, lot_no: l.lot_no || undefined, needPass, allowExpired: toKind === 'quarantine', date })
    })
    const doc = insert('transfers', { no: nextNo('transfers', 'TR', date), date, from_bin_id, to_bin_id, lines: alloc, reason, user_name: userName() })
    for (const a of alloc) {
      const c = lotCost(a.lot_no, a.item_id)
      move({ ...a, bin_id: from_bin_id, qty: -a.qty, type: 'transfer', unit_cost: c, ref_type: 'transfers', ref_id: doc.id, note: doc.no, doc_date: date, doc_no: doc.no })
      move({ ...a, bin_id: to_bin_id, qty: a.qty, type: 'transfer', unit_cost: c, ref_type: 'transfers', ref_id: doc.id, note: doc.no, doc_date: date, doc_no: doc.no })
    }
    return doc
  })
}

// ---------- 調整 ----------
const invAccount = (itemId) => (get('items', itemId)?.type === 'product' ? 1310 : 1300)

function doAdjust({ item_id, lot_no, bin_id, qty, reason, date = today(), ref_type = 'adjust', ref_id }) {
  assertOpen(date)
  const c = lotCost(lot_no, item_id)
  move({ item_id, lot_no, bin_id, qty, type: 'adjust', unit_cost: c, ref_type, ref_id, note: reason, doc_date: date, doc_no: nextDocNo('AJ', date) })
  const v = round(Math.abs(qty) * c)
  const item = get('items', item_id)
  postJournal({
    date,
    memo: `庫存調整 ${item?.name} ${qty > 0 ? '+' : ''}${qty}${item?.unit || ''}（${reason || '未填原因'}）`,
    lines: qty > 0 ? [{ account: invAccount(item_id), debit: v }, { account: 7100, credit: v }] : [{ account: 5200, debit: v }, { account: invAccount(item_id), credit: v }],
    ref_type,
    ref_id,
  })
}

// 回傳 { pending: true, approval } 表示已送簽核
export function adjustStock({ item_id, lot_no = '', bin_id, qty, reason }) {
  return transaction(() => {
    need('wms', 2)
    qty = round(qty, 3)
    if (!item_id || !bin_id || !qty) fail('請選擇品項、儲位並輸入數量')
    if (!reason) fail('請填寫調整原因')
    if (qty > 0) checkTemp(item_id, bin_id)
    if (qty < 0 && onHand({ item_id, bin_id, lot_no }) + qty < 0) fail('調整後庫存會變成負數')
    if (qty > 0 && !lot_no) fail('增加庫存請指定批號')
    const value = round(Math.abs(qty) * lotCost(lot_no, item_id))
    if (!isSystem() && value > Number(getSetting('adjust_approval_amount'))) {
      const ap = requestApproval({
        type: 'adjust', module: 'wms', ref_table: 'items', ref_id: item_id, amount: value,
        summary: `${get('items', item_id)?.name} ${binLabel(bin_id)} ${qty > 0 ? '+' : ''}${qty}（${reason}）`,
        reason: `金額 ${value} 超過門檻`, payload: { item_id, lot_no, bin_id, qty, reason },
      })
      return { pending: true, approval: ap }
    }
    doAdjust({ item_id, lot_no, bin_id, qty, reason })
    return { pending: false }
  })
}
registerApproval('adjust', { approve: (ap) => doAdjust(ap.payload) })

// 報廢整個批號（例如 QC 不合格）
export function scrapLot(lotNo, reason = '報廢') {
  return transaction(() => {
    needAny(['qc', 'wms'], 3)
    const lot = lotByNo(lotNo)
    if (!lot) fail('找不到批號')
    const rows = stockRows({ lot_no: lotNo }).filter((r) => r.qty > 0)
    if (!rows.length) fail('這個批號已沒有庫存')
    const docNo = nextDocNo('SC')
    for (const r of rows) {
      const c = lotCost(lotNo, r.item_id)
      move({ ...r, qty: -r.qty, type: 'scrap', unit_cost: c, ref_type: 'lots', ref_id: lot.id, note: reason, doc_no: docNo })
      postJournal({ memo: `報廢 ${lotNo} ${get('items', r.item_id)?.name} ${r.qty}（${reason}）`, lines: [{ account: 5200, debit: r.qty * c }, { account: invAccount(r.item_id), credit: r.qty * c }], ref_type: 'lots', ref_id: lot.id })
    }
    update('lots', lot.id, { qc_status: lot.qc_status === 'pass' ? 'hold' : lot.qc_status, note: `${lot.note || ''} 已報廢：${reason}`.trim() })
  })
}

// ---------- 盤點 ----------
export function createStocktake(warehouse_id) {
  return transaction(() => {
    need('wms', 2)
    if (!warehouse_id) fail('請選擇倉庫')
    if (where('stocktakes', (s) => s.warehouse_id === warehouse_id && ['counting', 'pending'].includes(s.status)).length) fail('這個倉庫已有進行中的盤點單')
    const lines = stockRows({ warehouse_id })
      .filter((r) => r.qty > 0)
      .sort((a, b) => binOf(a.bin_id)?.code.localeCompare(binOf(b.bin_id)?.code) || a.item_id.localeCompare(b.item_id))
      .map((r) => ({ ...r, system_qty: r.qty, counted_qty: null }))
    return insert('stocktakes', { no: nextNo('stocktakes', 'ST'), date: today(), warehouse_id, status: 'counting', lines, user_name: userName() })
  })
}
export function saveCount(id, lines) {
  need('wms', 2)
  const st = get('stocktakes', id)
  if (st.status !== 'counting') fail('盤點單已送出')
  return update('stocktakes', id, { lines })
}
export const stocktakeDiffs = (st) =>
  st.lines
    .filter((l) => l.counted_qty !== null && l.counted_qty !== '' && round(Number(l.counted_qty) - (l.system_qty || 0), 3) !== 0)
    .map((l) => ({ ...l, diff: round(Number(l.counted_qty) - (l.system_qty || 0), 3), value: round((Number(l.counted_qty) - (l.system_qty || 0)) * lotCost(l.lot_no, l.item_id)) }))

function postStocktakeNow(st) {
  for (const d of stocktakeDiffs(st)) {
    const now = onHand({ item_id: d.item_id, bin_id: d.bin_id, lot_no: d.lot_no || '' })
    // 盤點期間若有其他異動，以「實盤 − 目前帳面」為準
    const delta = round(Number(d.counted_qty) - now, 3)
    if (delta) doAdjust({ item_id: d.item_id, lot_no: d.lot_no, bin_id: d.bin_id, qty: delta, reason: `盤點 ${st.no}`, ref_type: 'stocktakes', ref_id: st.id })
  }
  update('stocktakes', st.id, { status: 'posted' })
}

export function submitStocktake(id) {
  return transaction(() => {
    need('wms', 2)
    const st = get('stocktakes', id)
    if (st.status !== 'counting') fail('盤點單已送出')
    if (st.lines.some((l) => l.counted_qty === null || l.counted_qty === '')) fail('還有品項沒有輸入實盤數量')
    const diffs = stocktakeDiffs(st)
    const value = round(sum(diffs, (d) => Math.abs(d.value)))
    if (value > Number(getSetting('adjust_approval_amount'))) {
      update('stocktakes', id, { status: 'pending' })
      requestApproval({ type: 'stocktake', module: 'wms', ref_table: 'stocktakes', ref_id: id, amount: value, summary: `${st.no} 盤差 ${diffs.length} 項`, reason: `盤差金額 ${value} 超過門檻` })
      return { pending: true }
    }
    postStocktakeNow(st)
    return { pending: false }
  })
}
registerApproval('stocktake', {
  approve: (ap) => postStocktakeNow(get('stocktakes', ap.ref_id)),
  reject: (ap) => update('stocktakes', ap.ref_id, { status: 'counting' }),
})

// ---------- 效期 ----------
export function expiringLots(days = Number(getSetting('expiry_warn_days'))) {
  const limit = addDays(today(), days)
  return all('lots')
    .filter((l) => l.exp_date && l.exp_date <= limit && lotStock(l.lot_no) > 0)
    .sort((a, b) => a.exp_date.localeCompare(b.exp_date))
}

export const lowStockItems = () => all('items').filter((i) => i.type !== 'product' && i.active !== false && i.safety_stock > 0 && stockOf(i.id) < i.safety_stock)

export { asSystem }
