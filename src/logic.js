// 業務邏輯：所有「會動到庫存或帳務」的動作都集中在這裡，
// 簡易模式與標準模式呼叫同一套函式，資料才會一致。
import { all, get, where, insert, update, nextNo, nowISO, currentUser } from './db/store'

export const TAX_RATE = 0.05

export const today = () => new Date().toISOString().slice(0, 10)
export const addDays = (d, n) => {
  const x = new Date(d)
  x.setDate(x.getDate() + Number(n || 0))
  return x.toISOString().slice(0, 10)
}
export const round = (n, d = 2) => Math.round((Number(n) || 0) * 10 ** d) / 10 ** d
const userName = () => currentUser()?.name || ''

// ---------- 會計科目 ----------
export const ACCOUNTS = {
  1100: '現金及銀行存款',
  1200: '應收帳款',
  1300: '原料及包材存貨',
  1310: '成品存貨',
  1320: '在製品',
  1400: '進項稅額',
  2100: '應付帳款',
  2200: '銷項稅額',
  3100: '業主資本',
  4100: '銷貨收入',
  5100: '銷貨成本',
  5200: '生產損耗',
  6100: '薪資費用',
  6200: '水電瓦斯',
  6300: '運費',
  6400: '租金',
  6900: '其他費用',
}
export const accountType = (code) =>
  ({ 1: '資產', 2: '負債', 3: '權益', 4: '收入', 5: '成本', 6: '費用' })[String(code)[0]]

export function postJournal({ date = today(), memo, lines, ref_type, ref_id }) {
  const clean = lines.filter((l) => round(l.debit) || round(l.credit)).map((l) => ({ ...l, debit: round(l.debit), credit: round(l.credit) }))
  if (!clean.length) return null
  return insert('journal', { no: nextNo('journal', 'JV'), date, memo, lines: clean, ref_type, ref_id })
}

// ---------- 庫存 ----------
// loc：WH = 倉庫、WIP = 產線（已領料未投料）
export const stockOf = (itemId, loc = 'WH', lotNo) =>
  round(
    all('stock_moves')
      .filter((m) => m.item_id === itemId && m.loc === loc && (lotNo === undefined || m.lot_no === lotNo))
      .reduce((s, m) => s + Number(m.qty), 0),
    3,
  )

export function avgCost(itemId) {
  const ins = all('stock_moves').filter((m) => m.item_id === itemId && m.qty > 0 && m.loc === 'WH' && m.unit_cost != null)
  const q = ins.reduce((s, m) => s + Number(m.qty), 0)
  if (!q) return Number(get('items', itemId)?.cost || 0)
  return round(ins.reduce((s, m) => s + m.qty * m.unit_cost, 0) / q, 4)
}

function move(m) {
  return insert('stock_moves', { date: nowISO(), user_name: userName(), loc: 'WH', ...m, qty: round(m.qty, 3) })
}

export const lotStock = (lot) => stockOf(lot.item_id, 'WH', lot.lot_no)

// 可出貨批號（QC 合格且有庫存），先進先出
export const shippableLots = (itemId) =>
  where('lots', (l) => l.item_id === itemId && l.qc_status === 'pass' && lotStock(l) > 0).sort((a, b) =>
    String(a.mfg_date).localeCompare(String(b.mfg_date)),
  )

export function adjustStock({ item_id, qty, note, lot_no }) {
  const unit_cost = avgCost(item_id)
  move({ item_id, qty, type: 'adjust', note, lot_no, unit_cost })
  const item = get('items', item_id)
  const acct = item?.type === 'product' ? 1310 : 1300
  const v = round(Math.abs(qty) * unit_cost)
  postJournal({
    memo: `庫存調整 ${item?.name} ${qty}${item?.unit || ''}${note ? '（' + note + '）' : ''}`,
    lines: qty > 0 ? [{ account: acct, debit: v }, { account: 6900, credit: v }] : [{ account: 6900, debit: v }, { account: acct, credit: v }],
    ref_type: 'adjust',
  })
}

// ---------- 銷售 ----------
export const docTotal = (lines = []) => round(lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.price || 0), 0))

export function saveSalesOrder(data, id) {
  const row = { ...data, total: docTotal(data.lines) }
  return id ? update('sales_orders', id, row) : insert('sales_orders', { no: nextNo('sales_orders', 'SO'), status: 'confirmed', ...row })
}

// 依配方計算訂單需要的原料
export function materialNeeds(lines = []) {
  const need = {}
  for (const l of lines) {
    const p = get('items', l.item_id)
    for (const b of p?.bom || []) need[b.item_id] = round((need[b.item_id] || 0) + b.qty * l.qty, 3)
  }
  return need
}

// 依訂單產生採購單（扣掉目前庫存，依品項的預設供應商分單）
export function purchaseSuggestions(soId) {
  const so = get('sales_orders', soId)
  const need = materialNeeds(so?.lines)
  const out = []
  for (const [item_id, q] of Object.entries(need)) {
    const short = round(q - stockOf(item_id) - openPOQty(item_id), 3)
    if (short > 0) out.push({ item_id, need: q, stock: stockOf(item_id), short })
  }
  return out
}

export function openPOQty(itemId) {
  return round(
    where('purchase_orders', (p) => p.status !== 'cancelled' && p.status !== 'closed').reduce(
      (s, p) => s + p.lines.filter((l) => l.item_id === itemId).reduce((a, l) => a + Math.max(0, l.qty - (l.received || 0)), 0),
      0,
    ),
    3,
  )
}

// ---------- 採購 / 進貨 ----------
export function savePurchaseOrder(data, id) {
  const row = { ...data, total: docTotal(data.lines) }
  return id ? update('purchase_orders', id, row) : insert('purchase_orders', { no: nextNo('purchase_orders', 'PO'), status: 'open', ...row })
}

export function poStatus(po) {
  if (po.status === 'cancelled' || po.status === 'closed') return po.status
  const r = po.lines.reduce((s, l) => s + (l.received || 0), 0)
  if (!r) return 'open'
  return po.lines.every((l) => (l.received || 0) >= l.qty) ? 'received' : 'partial'
}

// 進貨：lines = [{ item_id, qty, price? }]，有採購單會一併更新已收量
export function receiveGoods({ supplier_id, purchase_order_id, lines, note, date = today() }) {
  const po = get('purchase_orders', purchase_order_id)
  supplier_id ||= po?.supplier_id
  const valid = lines.filter((l) => Number(l.qty) > 0)
  if (!valid.length) throw new Error('沒有輸入進貨數量')
  let amount = 0
  for (const l of valid) {
    const poLine = po?.lines.find((x) => x.item_id === l.item_id)
    const price = Number(l.price ?? poLine?.price ?? get('items', l.item_id)?.cost ?? 0)
    amount += l.qty * price
    move({ item_id: l.item_id, qty: l.qty, type: 'receive', unit_cost: price, ref_type: po ? 'purchase_orders' : 'suppliers', ref_id: po?.id || supplier_id, note: note || po?.no || '直接進貨' })
  }
  if (po) {
    const newLines = po.lines.map((pl) => {
      const got = valid.filter((l) => l.item_id === pl.item_id).reduce((s, l) => s + Number(l.qty), 0)
      return { ...pl, received: round((pl.received || 0) + got, 3) }
    })
    const next = { ...po, lines: newLines }
    update('purchase_orders', po.id, { lines: newLines, status: poStatus(next) })
  }
  amount = round(amount)
  const tax = round(amount * TAX_RATE)
  const sup = get('suppliers', supplier_id)
  const bill = insert('bills', {
    no: nextNo('bills', 'AP'),
    supplier_id,
    purchase_order_id: po?.id,
    date,
    due_date: addDays(date, sup?.terms_days || 30),
    amount,
    tax,
    total: round(amount + tax),
    paid: 0,
    status: 'unpaid',
    note: po ? `採購單 ${po.no} 進貨` : '直接進貨',
  })
  postJournal({
    date,
    memo: `進貨 ${sup?.name || ''} ${po?.no || ''}`,
    lines: [{ account: 1300, debit: amount }, { account: 1400, debit: tax }, { account: 2100, credit: amount + tax }],
    ref_type: 'bills',
    ref_id: bill.id,
  })
  return bill
}

// ---------- 生產 ----------
export const WO_STATUS = {
  planned: '待領料',
  issued: '已領料',
  cooking: '烹煮中',
  done: '待 QC',
  qc_pass: 'QC 合格',
  qc_fail: 'QC 不合格',
  closed: '已結案',
}

export function createWorkOrder({ sales_order_id, product_id, plan_qty, note }) {
  const lot_no = nextNo('lots', 'L')
  const wo = insert('work_orders', {
    no: nextNo('work_orders', 'WO'),
    sales_order_id,
    product_id,
    plan_qty: Number(plan_qty),
    status: 'planned',
    lot_no,
    feeds: [],
    output_qty: 0,
    waste_qty: 0,
    note,
  })
  return wo
}

export const woNeeds = (wo) => {
  const p = get('items', wo.product_id)
  return (p?.bom || []).map((b) => ({ item_id: b.item_id, qty: round(b.qty * wo.plan_qty, 3) }))
}

const woMoves = (wo, type) => where('stock_moves', (m) => m.ref_type === 'work_orders' && m.ref_id === wo.id && m.type === type)
export const woIssued = (wo, itemId) => round(woMoves(wo, 'issue').filter((m) => m.item_id === itemId && m.loc === 'WIP').reduce((s, m) => s + m.qty, 0), 3)
export const woFed = (wo, itemId) => round((wo.feeds || []).filter((f) => !itemId || f.item_id === itemId).reduce((s, f) => s + Number(f.qty), 0), 3)

// 領料：倉庫 → 產線
export function issueMaterials(woId, lines) {
  const wo = get('work_orders', woId)
  const valid = lines.filter((l) => Number(l.qty) > 0)
  if (!valid.length) throw new Error('沒有輸入領料數量')
  let value = 0
  for (const l of valid) {
    const c = avgCost(l.item_id)
    value += l.qty * c
    move({ item_id: l.item_id, qty: -l.qty, type: 'issue', unit_cost: c, ref_type: 'work_orders', ref_id: wo.id, note: wo.no })
    move({ item_id: l.item_id, qty: l.qty, loc: 'WIP', type: 'issue', unit_cost: c, ref_type: 'work_orders', ref_id: wo.id, note: wo.no })
  }
  update('work_orders', wo.id, { status: wo.status === 'planned' ? 'issued' : wo.status, start_at: wo.start_at || nowISO() })
  postJournal({ memo: `領料 ${wo.no}`, lines: [{ account: 1320, debit: value }, { account: 1300, credit: value }], ref_type: 'work_orders', ref_id: wo.id })
}

// 投料：產線上的料放進鍋裡（產線庫存減少，記在工單投料紀錄）
export function feedMaterials(woId, lines) {
  const wo = get('work_orders', woId)
  const valid = lines.filter((l) => Number(l.qty) > 0)
  if (!valid.length) throw new Error('沒有輸入投料數量')
  const feeds = [...(wo.feeds || [])]
  for (const l of valid) {
    const onLine = stockOf(l.item_id, 'WIP')
    // 產線上的料不夠時，自動從倉庫補領
    if (onLine < l.qty) issueMaterials(wo.id, [{ item_id: l.item_id, qty: round(l.qty - Math.max(0, onLine), 3) }])
    move({ item_id: l.item_id, qty: -l.qty, loc: 'WIP', type: 'feed', unit_cost: avgCost(l.item_id), ref_type: 'work_orders', ref_id: wo.id, note: wo.no })
    feeds.push({ at: nowISO(), item_id: l.item_id, qty: Number(l.qty), user: userName() })
  }
  update('work_orders', wo.id, { feeds, status: ['planned', 'issued'].includes(get('work_orders', wo.id).status) ? 'cooking' : get('work_orders', wo.id).status })
}

// 產出成品：建立/累加批號，成品入庫但需 QC 合格才能出貨
export function recordOutput(woId, { qty, waste = 0 }) {
  const wo = get('work_orders', woId)
  qty = Number(qty)
  if (!(qty > 0)) throw new Error('請輸入產出數量')
  const product = get('items', wo.product_id)
  // 成本 = 這張工單投入的原料成本（實際成本），平均到所有產出
  const fedValue = where('stock_moves', (m) => m.ref_id === wo.id && m.type === 'feed').reduce((s, m) => s + -m.qty * (m.unit_cost || 0), 0)
  const totalOut = (wo.output_qty || 0) + qty
  const unit_cost = round(fedValue / totalOut || product?.cost || 0, 4)
  let lot = where('lots', (l) => l.lot_no === wo.lot_no)[0]
  if (lot) lot = update('lots', lot.id, { qty: totalOut, unit_cost, qc_status: 'pending' })
  else
    lot = insert('lots', {
      lot_no: wo.lot_no,
      item_id: wo.product_id,
      work_order_id: wo.id,
      qty: totalOut,
      unit_cost,
      qc_status: 'pending',
      mfg_date: today(),
      exp_date: addDays(today(), product?.shelf_days || 180),
    })
  move({ item_id: wo.product_id, qty, type: 'output', lot_no: wo.lot_no, unit_cost, ref_type: 'work_orders', ref_id: wo.id, note: wo.no })
  update('work_orders', wo.id, {
    output_qty: totalOut,
    waste_qty: round((wo.waste_qty || 0) + Number(waste || 0), 3),
    status: 'done',
    end_at: nowISO(),
  })
  const value = round(qty * unit_cost)
  postJournal({ memo: `產出入庫 ${wo.no} ${product?.name} ${qty}${product?.unit}`, lines: [{ account: 1310, debit: value }, { account: 1320, credit: value }], ref_type: 'work_orders', ref_id: wo.id })
  return lot
}

// 工單結案：產線剩料退回倉庫
export function closeWorkOrder(woId) {
  const wo = get('work_orders', woId)
  for (const b of woNeeds(wo)) {
    const left = round(woIssued(wo, b.item_id) - woFed(wo, b.item_id), 3)
    const onLine = stockOf(b.item_id, 'WIP')
    const back = Math.min(left, onLine)
    if (back > 0) {
      const c = avgCost(b.item_id)
      move({ item_id: b.item_id, qty: -back, loc: 'WIP', type: 'return', unit_cost: c, ref_type: 'work_orders', ref_id: wo.id, note: `${wo.no} 退料` })
      move({ item_id: b.item_id, qty: back, type: 'return', unit_cost: c, ref_type: 'work_orders', ref_id: wo.id, note: `${wo.no} 退料` })
      postJournal({ memo: `退料 ${wo.no}`, lines: [{ account: 1300, debit: back * c }, { account: 1320, credit: back * c }], ref_type: 'work_orders', ref_id: wo.id })
    }
  }
  update('work_orders', wo.id, { status: 'closed' })
}

// ---------- QC ----------
export const DEFAULT_CHECKS = [
  { name: '外觀 / 色澤', standard: '色澤均勻、無異物' },
  { name: '氣味', standard: '無異味' },
  { name: '中心溫度', standard: '≥ 75°C' },
  { name: '重量', standard: '標示重量 ±3%' },
  { name: '包裝密封', standard: '無漏氣、無破損' },
  { name: '標示', standard: '品名、批號、效期正確' },
]

export function saveInspection(data) {
  const qc = insert('qc_inspections', { no: nextNo('qc_inspections', 'QC'), date: today(), inspector: userName(), ...data })
  if (data.kind === 'FQC' && data.lot_no) {
    const lot = where('lots', (l) => l.lot_no === data.lot_no)[0]
    if (lot) {
      update('lots', lot.id, { qc_status: data.result })
      if (lot.work_order_id) update('work_orders', lot.work_order_id, { status: data.result === 'pass' ? 'qc_pass' : 'qc_fail' })
    }
  }
  return qc
}

// ---------- 出貨 ----------
export const PACK_MODES = ['紙箱', '保冷箱', '棧板', '冷凍貨櫃', '散裝']

// lines = [{ item_id, lot_no, qty }]
export function shipGoods({ sales_order_id, lines, boxes, pack_mode, container_no, carrier, note, date = today() }) {
  const so = get('sales_orders', sales_order_id)
  const valid = lines.filter((l) => Number(l.qty) > 0)
  if (!valid.length) throw new Error('沒有輸入出貨數量')
  // 沒指定批號就自動依先進先出分配合格批號
  const alloc = []
  for (const l of valid) {
    if (l.lot_no) {
      alloc.push(l)
      continue
    }
    let left = Number(l.qty)
    for (const lot of shippableLots(l.item_id)) {
      const take = Math.min(left, lotStock(lot))
      if (take > 0) alloc.push({ item_id: l.item_id, lot_no: lot.lot_no, qty: take })
      left = round(left - take, 3)
      if (left <= 0) break
    }
    if (left > 0) throw new Error(`${get('items', l.item_id)?.name} QC 合格庫存不足（還差 ${left}）`)
  }
  for (const a of alloc) {
    const lot = where('lots', (x) => x.lot_no === a.lot_no)[0]
    if (lot?.qc_status !== 'pass') throw new Error(`批號 ${a.lot_no} 尚未通過 QC，不能出貨`)
    if (lotStock(lot) < a.qty) throw new Error(`批號 ${a.lot_no} 庫存不足`)
  }
  const shipment = insert('shipments', {
    no: nextNo('shipments', 'SH'),
    sales_order_id,
    customer_id: so?.customer_id,
    date,
    lines: alloc.map((a) => ({ ...a, price: so?.lines.find((x) => x.item_id === a.item_id)?.price || get('items', a.item_id)?.price || 0 })),
    boxes: Number(boxes) || autoBoxes(alloc),
    pack_mode: pack_mode || '紙箱',
    container_no,
    carrier,
    address: get('customers', so?.customer_id)?.address,
    status: 'shipped',
    note,
  })
  let cogs = 0
  for (const a of alloc) {
    const lot = where('lots', (x) => x.lot_no === a.lot_no)[0]
    cogs += a.qty * (lot?.unit_cost || 0)
    move({ item_id: a.item_id, qty: -a.qty, type: 'ship', lot_no: a.lot_no, unit_cost: lot?.unit_cost, ref_type: 'shipments', ref_id: shipment.id, note: shipment.no })
  }
  postJournal({ date, memo: `出貨成本 ${shipment.no}`, lines: [{ account: 5100, debit: cogs }, { account: 1310, credit: cogs }], ref_type: 'shipments', ref_id: shipment.id })
  return shipment
}

export const autoBoxes = (lines) =>
  lines.reduce((s, l) => s + Math.ceil(Number(l.qty) / (Number(get('items', l.item_id)?.pack_per_box) || 1)), 0)

// ---------- 應收 / 應付 / 收付款 ----------
export function invoiceShipment(shipmentId) {
  const sh = get('shipments', shipmentId)
  if (where('invoices', (i) => i.shipment_id === sh.id).length) throw new Error('這張出貨單已開過帳款')
  const amount = docTotal(sh.lines)
  const tax = round(amount * TAX_RATE)
  const cust = get('customers', sh.customer_id)
  const inv = insert('invoices', {
    no: nextNo('invoices', 'AR'),
    customer_id: sh.customer_id,
    sales_order_id: sh.sales_order_id,
    shipment_id: sh.id,
    date: sh.date,
    due_date: addDays(sh.date, cust?.terms_days || 30),
    amount,
    tax,
    total: round(amount + tax),
    paid: 0,
    status: 'unpaid',
  })
  postJournal({
    date: sh.date,
    memo: `銷貨 ${cust?.name} ${sh.no}`,
    lines: [{ account: 1200, debit: amount + tax }, { account: 4100, credit: amount }, { account: 2200, credit: tax }],
    ref_type: 'invoices',
    ref_id: inv.id,
  })
  return inv
}

export function receivePayment({ invoice_id, amount, method = '匯款', date = today(), note }) {
  const inv = get('invoices', invoice_id)
  amount = round(amount)
  const paid = round((inv.paid || 0) + amount)
  update('invoices', inv.id, { paid, status: paid >= inv.total ? 'paid' : 'partial' })
  const p = insert('payments', { no: nextNo('payments', 'RV'), kind: 'in', invoice_id, party_id: inv.customer_id, date, amount, method, note })
  postJournal({ date, memo: `收款 ${inv.no}`, lines: [{ account: 1100, debit: amount }, { account: 1200, credit: amount }], ref_type: 'payments', ref_id: p.id })
  return p
}

export function payBill({ bill_id, amount, method = '匯款', date = today(), note }) {
  const bill = get('bills', bill_id)
  amount = round(amount)
  const paid = round((bill.paid || 0) + amount)
  update('bills', bill.id, { paid, status: paid >= bill.total ? 'paid' : 'partial' })
  const p = insert('payments', { no: nextNo('payments', 'PV'), kind: 'out', bill_id, party_id: bill.supplier_id, date, amount, method, note })
  postJournal({ date, memo: `付款 ${bill.no}`, lines: [{ account: 2100, debit: amount }, { account: 1100, credit: amount }], ref_type: 'payments', ref_id: p.id })
  return p
}

export function recordExpense({ account, amount, date = today(), memo }) {
  return postJournal({ date, memo, lines: [{ account: Number(account), debit: amount }, { account: 1100, credit: amount }], ref_type: 'expense' })
}

export function balances(from, to) {
  const b = {}
  for (const j of all('journal')) {
    if ((from && j.date < from) || (to && j.date > to)) continue
    for (const l of j.lines) {
      b[l.account] ||= { debit: 0, credit: 0 }
      b[l.account].debit += l.debit || 0
      b[l.account].credit += l.credit || 0
    }
  }
  return b
}

// ---------- 訂單進度（從接單一路追到收款） ----------
export const STAGES = ['接單', '原料進貨', '領料', '投料烹煮', '產出', 'QC', '出貨', '收款']

export function orderProgress(soId) {
  const so = get('sales_orders', soId)
  if (!so) return null
  const wos = where('work_orders', (w) => w.sales_order_id === so.id)
  const pos = where('purchase_orders', (p) => p.sales_order_id === so.id && p.status !== 'cancelled')
  const ships = where('shipments', (s) => s.sales_order_id === so.id)
  const invs = where('invoices', (i) => i.sales_order_id === so.id)
  const lots = where('lots', (l) => wos.some((w) => w.id === l.work_order_id))

  const ordered = so.lines.reduce((s, l) => s + Number(l.qty), 0)
  const needs = materialNeeds(so.lines)
  const needTotal = Object.values(needs).reduce((a, b) => a + b, 0)
  const poQty = pos.reduce((s, p) => s + p.lines.reduce((a, l) => a + l.qty, 0), 0)
  const received = pos.reduce((s, p) => s + p.lines.reduce((a, l) => a + (l.received || 0), 0), 0)
  const issued = wos.reduce((s, w) => s + woMoves(w, 'issue').filter((m) => m.loc === 'WIP').reduce((a, m) => a + m.qty, 0), 0)
  const fed = wos.reduce((s, w) => s + woFed(w), 0)
  const output = wos.reduce((s, w) => s + (w.output_qty || 0), 0)
  const qcPass = lots.filter((l) => l.qc_status === 'pass').reduce((s, l) => s + l.qty, 0)
  const qcFail = lots.filter((l) => l.qc_status === 'fail').reduce((s, l) => s + l.qty, 0)
  const shipped = ships.reduce((s, sh) => s + sh.lines.reduce((a, l) => a + Number(l.qty), 0), 0)
  const boxes = ships.reduce((s, sh) => s + Number(sh.boxes || 0), 0)
  const invTotal = invs.reduce((s, i) => s + i.total, 0)
  const paid = invs.reduce((s, i) => s + (i.paid || 0), 0)

  const pct = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0)
  // 原料：有開採購單看進貨率；沒開採購單（庫存足夠）看是否已開始領料
  const matPct = poQty ? pct(received, poQty) : issued > 0 || needTotal === 0 ? 100 : 0
  const steps = [
    { key: '接單', pct: 100, text: `${ordered} 單位` },
    { key: '原料進貨', pct: matPct, text: poQty ? `${round(received)}/${round(poQty)}` : '用庫存' },
    { key: '領料', pct: pct(issued, needTotal), text: `${round(issued)}/${round(needTotal)}` },
    { key: '投料烹煮', pct: pct(fed, needTotal), text: `${round(fed)}/${round(needTotal)}` },
    { key: '產出', pct: pct(output, ordered), text: `${round(output)}/${ordered}` },
    { key: 'QC', pct: pct(qcPass, ordered), text: `合格 ${round(qcPass)}${qcFail ? ` 不合格 ${round(qcFail)}` : ''}` },
    { key: '出貨', pct: pct(shipped, ordered), text: `${round(shipped)}/${ordered}（${boxes} 箱）` },
    { key: '收款', pct: pct(paid, invTotal || so.total * (1 + TAX_RATE)), text: `$${round(paid, 0).toLocaleString()}` },
  ]
  let current = steps.findIndex((s) => s.pct < 100)
  if (current === -1) current = steps.length
  const status = so.status === 'cancelled' ? '已取消' : current >= steps.length ? '已完成' : STAGES[current]
  return { so, wos, pos, ships, invs, lots, needs, steps, current, status, ordered, output, qcPass, shipped, boxes, paid, invTotal }
}

export function shippedQty(soId, itemId) {
  return where('shipments', (s) => s.sales_order_id === soId).reduce(
    (s, sh) => s + sh.lines.filter((l) => l.item_id === itemId).reduce((a, l) => a + Number(l.qty), 0),
    0,
  )
}
