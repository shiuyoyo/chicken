// 門市 POS：只賣「門市儲位有庫存」的品項（從成品倉調撥過去 = 設定門市庫存）。
// 開班 → 結帳（現金找零 / 刷卡 / 行動支付、會員點數、折扣權限）→ 作廢（主管）→ 日結對帳。
import { all, get, where, insert, update, nextNo, nowISO, transaction } from '../db/store'
import { fail, need, can, round, sum, today, userName, getSetting, taxRate, postJournal, assertOpen, nextGui, requestApproval, registerApproval, isSystem } from './core'
import { notify } from './notify'
import { allocate, move, binsOfKind, onHand, lotCost, stockRows, lotByNo, isExpired } from './inventory'

export const POS_METHODS = ['現金', '信用卡', 'LINE Pay', '街口支付']

export const storeBins = () => binsOfKind('store')
export const openShift = (binId) => where('pos_shifts', (s) => s.status === 'open' && (!binId || s.bin_id === binId))[0]

// 門市可賣的品項：啟用 POS、門市有 QC 合格且未過期的庫存
export function posCatalog(binId) {
  return all('items')
    .filter((i) => i.pos_enabled && i.active !== false)
    .map((i) => {
      const avail = round(
        sum(
          stockRows({ item_id: i.id, bin_id: binId }).filter((r) => {
            const l = lotByNo(r.lot_no)
            return r.qty > 0 && (!l || (l.qc_status === 'pass' && !isExpired(l)))
          }),
          (r) => r.qty,
        ),
        3,
      )
      return { item: i, price: Number(i.pos_price || i.price || 0), avail }
    })
    .filter((x) => x.avail > 0)
}

export function startShift({ bin_id, opening_cash = 0 }) {
  return transaction(() => {
    need('pos', 2)
    if (!bin_id) fail('請選擇門市')
    if (openShift(bin_id)) fail('這個門市已經有開著的班別')
    return insert('pos_shifts', { no: nextNo('pos_shifts', 'SF'), bin_id, opened_by: userName(), opened_at: nowISO(), opening_cash: Number(opening_cash) || 0, status: 'open' })
  })
}

export const shiftSales = (shiftId) => where('pos_sales', (s) => s.shift_id === shiftId)
export function shiftSummary(shiftId) {
  const sh = get('pos_shifts', shiftId)
  const sales = shiftSales(shiftId).filter((s) => s.status === 'done')
  const byMethod = {}
  for (const s of sales) byMethod[s.method] = round((byMethod[s.method] || 0) + s.total)
  const byItem = {}
  for (const s of sales) for (const l of s.lines) byItem[l.item_id] = round((byItem[l.item_id] || 0) + l.qty, 3)
  const cash = byMethod['現金'] || 0
  return { shift: sh, count: sales.length, total: round(sum(sales, (s) => s.total)), byMethod, byItem, expected: round((sh?.opening_cash || 0) + cash), voids: shiftSales(shiftId).filter((s) => s.status === 'void').length }
}

// cart: [{ item_id, qty }]
export function posCheckout({ shift_id, cart, discount = 0, method = '現金', received, customer_id = '', date = today() }) {
  return transaction(() => {
    need('pos', 2)
    assertOpen(date)
    const shift = get('pos_shifts', shift_id)
    if (!shift || shift.status !== 'open') fail('請先開班')
    const lines0 = cart.filter((c) => Number(c.qty) > 0)
    if (!lines0.length) fail('購物車是空的')
    const priced = lines0.map((c) => {
      const item = get('items', c.item_id)
      if (!item?.pos_enabled) fail(`${item?.name} 沒有開放門市銷售`)
      return { item_id: c.item_id, qty: Number(c.qty), price: Number(item.pos_price || item.price || 0) }
    })
    const subtotal = round(sum(priced, (l) => l.qty * l.price))
    discount = round(Number(discount) || 0)
    if (discount < 0 || discount > subtotal) fail('折扣金額不正確')
    if (discount > subtotal * Number(getSetting('pos_max_discount')) + 0.001 && !can('pos', 3) && !isSystem())
      fail(`折扣超過 ${Number(getSetting('pos_max_discount')) * 100}%，需要店長登入操作`)
    const total = round(subtotal - discount)
    if (!POS_METHODS.includes(method)) fail('付款方式不正確')
    let change = 0
    if (method === '現金') {
      received = Number(received ?? total)
      if (received < total) fail(`收現 ${received} 不足 ${total}`)
      change = round(received - total)
    }
    // 先到期先出，只能從這個門市的庫存扣
    const alloc = priced.flatMap((l) => allocate(l.item_id, l.qty, { kinds: ['store'], bin_id: shift.bin_id, date }).map((a) => ({ ...a, price: l.price })))
    const tax = round(total - total / (1 + taxRate()))
    const pointsPer = Number(getSetting('pos_points_per')) || 100
    const points = customer_id ? Math.floor(total / pointsPer) : 0
    const sale = insert('pos_sales', {
      no: nextNo('pos_sales', 'POS', date), gui_no: nextGui(), shift_id, customer_id, date, at: nowISO(), lines: alloc, discount, total, tax, method,
      received: method === '現金' ? received : total, change, points, cashier: userName(), status: 'done',
    })
    let cogs = 0
    for (const a of alloc) {
      const c = lotCost(a.lot_no, a.item_id)
      cogs += a.qty * c
      move({ item_id: a.item_id, lot_no: a.lot_no, bin_id: a.bin_id, qty: -a.qty, type: 'pos', unit_cost: c, ref_type: 'pos_sales', ref_id: sale.id, note: sale.no, doc_date: date })
    }
    const cashAcct = method === '現金' ? 1100 : 1130
    postJournal({ date, memo: `門市銷售 ${sale.no}（${method}）`, lines: [{ account: cashAcct, debit: total }, { account: 4100, credit: total - tax }, { account: 2200, credit: tax }], ref_type: 'pos_sales', ref_id: sale.id })
    postJournal({ date, memo: `門市銷售成本 ${sale.no}`, lines: [{ account: 5100, debit: cogs }, { account: 1310, credit: cogs }], ref_type: 'pos_sales', ref_id: sale.id })
    if (customer_id && points) {
      const c = get('customers', customer_id)
      update('customers', customer_id, { points: (c.points || 0) + points })
    }
    return sale
  })
}

function doVoid(id) {
  const s = get('pos_sales', id)
  if (s.status !== 'done') fail('這筆已作廢')
  assertOpen(today())
  for (const m of where('stock_moves', (m) => m.ref_type === 'pos_sales' && m.ref_id === id))
    move({ item_id: m.item_id, lot_no: m.lot_no, bin_id: m.bin_id, qty: -m.qty, type: 'pos', unit_cost: m.unit_cost, ref_type: 'pos_sales', ref_id: id, note: `作廢 ${s.no}` })
  for (const j of where('journal', (j) => j.ref_type === 'pos_sales' && j.ref_id === id))
    postJournal({ memo: `作廢沖銷 ${j.no}`, lines: j.lines.map((l) => ({ account: l.account, debit: l.credit, credit: l.debit })), ref_type: 'pos_void', ref_id: id })
  if (s.customer_id && s.points) {
    const c = get('customers', s.customer_id)
    update('customers', c.id, { points: Math.max(0, (c.points || 0) - s.points) })
  }
  update('pos_sales', id, { status: 'void' })
}

// 作廢：店長直接作廢；收銀員送簽核
export function voidSale(id, reason) {
  return transaction(() => {
    need('pos', 2)
    if (!reason) fail('請填寫作廢原因')
    const s = get('pos_sales', id)
    if (s.status !== 'done') fail('這筆已作廢')
    if (get('pos_shifts', s.shift_id)?.status !== 'open') fail('已日結的班別不能作廢，請改用退貨處理')
    if (can('pos', 3) || isSystem()) {
      doVoid(id)
      return { pending: false }
    }
    requestApproval({ type: 'pos_void', module: 'pos', ref_table: 'pos_sales', ref_id: id, amount: s.total, summary: `${s.no} $${s.total}`, reason })
    return { pending: true }
  })
}
registerApproval('pos_void', { approve: (ap) => doVoid(ap.ref_id) })

export function closeShift(id, counted_cash, note = '') {
  return transaction(() => {
    need('pos', 2)
    const sh = get('pos_shifts', id)
    if (sh.status !== 'open') fail('班別已日結')
    if (counted_cash === '' || counted_cash === null || isNaN(Number(counted_cash))) fail('請輸入點收現金')
    if (where('approvals', (a) => a.status === 'pending' && a.type === 'pos_void' && shiftSales(id).some((s) => s.id === a.ref_id)).length) fail('還有待店長核准的作廢單')
    const { expected } = shiftSummary(id)
    const diff = round(Number(counted_cash) - expected)
    if (diff) postJournal({ memo: `${sh.no} 現金${diff > 0 ? '溢' : '短'} ${Math.abs(diff)}`, lines: diff > 0 ? [{ account: 1100, debit: diff }, { account: 6950, credit: diff }] : [{ account: 6950, debit: -diff }, { account: 1100, credit: -diff }], ref_type: 'pos_shifts', ref_id: id })
    const sum0 = shiftSummary(id)
    notify('pos_closed', {
      title: `門市日結 ${sh.no}`,
      lines: [`營業額 $${Math.round(sum0.total).toLocaleString()}（${sum0.count} 筆）`, Object.entries(sum0.byMethod).map(([m, v]) => `${m} $${Math.round(v).toLocaleString()}`).join('、'), diff ? `⚠ 現金${diff > 0 ? '多' : '少'} $${Math.abs(diff)}` : '現金相符', `收銀：${userName()}`],
      link: '/pos-sales',
    })
    return update('pos_shifts', id, { status: 'closed', closed_by: userName(), closed_at: nowISO(), expected_cash: expected, counted_cash: Number(counted_cash), diff, note })
  })
}

export const storeStock = (binId) => stockRows({ bin_id: binId }).filter((r) => r.qty > 0)
export { onHand }
