// 出貨：揀貨（先到期先出、QC 合格、符合客戶效期要求）、出貨單、開立應收（含統一發票號碼）、銷貨退回。
import { get, where, insert, update, nextNo, transaction } from '../db/store'
import {
  fail, need, needAny, round, sum, today, addDays, taxRate, postJournal, assertOpen, nextGui, getSetting,
  requestApproval, registerApproval, isSystem,
} from './core'
import { notify } from './notify'
import { allocate, move, lotByNo, lotCost, quarantineBin, binOf } from './inventory'
import { invoiceBalance } from './sales'

export const PACK_MODES = ['紙箱', '保冷箱', '棧板', '冷凍貨櫃', '散裝']
export const SHIP_STATUS = { shipped: '已出貨', delivered: '已送達' }

const shipmentsOf = (soId) => where('shipments', (s) => s.sales_order_id === soId)
export const shippedQty = (soId, itemId) => round(sum(shipmentsOf(soId).flatMap((s) => s.lines.filter((l) => l.item_id === itemId)), (l) => l.qty), 3)
export const returnedQty = (shipmentId, itemId, lotNo) =>
  round(sum(where('returns', (r) => r.kind === 'sales' && r.shipment_id === shipmentId && r.status !== 'rejected').flatMap((r) => r.lines.filter((l) => l.item_id === itemId && (!lotNo || l.lot_no === lotNo))), (l) => l.qty), 3)
export const soReturnedQty = (soId, itemId) => round(sum(shipmentsOf(soId), (s) => returnedQty(s.id, itemId)), 3)
export const remainingToShip = (so, itemId) => {
  const l = so.lines.find((x) => x.item_id === itemId)
  return round(Math.max(0, (l?.qty || 0) - shippedQty(so.id, itemId)), 3)
}
export const autoBoxes = (lines) => sum(lines, (l) => Math.ceil(Number(l.qty) / (Number(get('items', l.item_id)?.pack_per_box) || 1)))

// 揀貨單預覽（不寫入）
export function pickList(soId, lines, date = today()) {
  const so = get('sales_orders', soId)
  const minDays = Number(get('customers', so?.customer_id)?.min_shelf_days || 0)
  return lines.filter((l) => Number(l.qty) > 0).flatMap((l) => allocate(l.item_id, l.qty, { minDaysLeft: minDays, date }))
}

export function shipGoods({ sales_order_id, lines, boxes, pack_mode = '紙箱', container_no = '', carrier = '', note = '', date = today() }) {
  return transaction(() => {
    need('shipping', 2)
    assertOpen(date)
    const so = get('sales_orders', sales_order_id)
    if (!so) fail('請選擇訂單')
    if (so.status !== 'confirmed') fail(`訂單 ${so.no} 不是「已確認」狀態，不能出貨`)
    const valid = lines.filter((l) => Number(l.qty) > 0)
    if (!valid.length) fail('沒有輸入出貨數量')
    for (const l of valid) {
      const left = remainingToShip(so, l.item_id)
      if (Number(l.qty) > left + 0.0005) fail(`${get('items', l.item_id)?.name} 超出訂單：還能出 ${left}`)
    }
    const alloc = pickList(so.id, valid, date)
    const cust = get('customers', so.customer_id)
    const shipment = insert('shipments', {
      no: nextNo('shipments', 'SH', date), sales_order_id, customer_id: so.customer_id, date,
      lines: alloc.map((a) => ({ ...a, price: so.lines.find((x) => x.item_id === a.item_id)?.price || 0 })),
      boxes: Number(boxes) || autoBoxes(valid), pack_mode, container_no, carrier, address: cust?.address || '', status: 'shipped', note,
    })
    let cogs = 0
    for (const a of alloc) {
      const c = lotCost(a.lot_no, a.item_id)
      cogs += a.qty * c
      move({ ...a, qty: -a.qty, type: 'ship', unit_cost: c, ref_type: 'shipments', ref_id: shipment.id, note: shipment.no, doc_date: date })
    }
    postJournal({ date, memo: `出貨成本 ${shipment.no}`, lines: [{ account: 5100, debit: cogs }, { account: 1310, credit: cogs }], ref_type: 'shipments', ref_id: shipment.id })
    // 全部出完自動結案
    if (so.lines.every((l) => remainingToShip(so, l.item_id) <= 0)) update('sales_orders', so.id, { status: 'closed' })
    notify('shipped', {
      ownerId: cust?.owner_id,
      title: `已出貨給 ${cust?.name}`,
      lines: [`${shipment.no}（訂單 ${so.no}）`, valid.map((l) => `${get('items', l.item_id)?.name} × ${l.qty}`).join('、'), `${shipment.boxes} 箱・${pack_mode}${container_no ? ' ' + container_no : ''}`],
      link: `/progress/${so.id}`,
    })
    return shipment
  })
}

export function markDelivered(id) {
  need('shipping', 2)
  update('shipments', id, { status: 'delivered' })
}

// ---------- 應收 ----------
export function invoiceShipment(shipmentId, { date } = {}) {
  return transaction(() => {
    needAny(['accounting', 'shipping'], 2)
    const sh = get('shipments', shipmentId)
    date ||= sh.date
    assertOpen(date)
    if (where('invoices', (i) => i.shipment_id === sh.id).length) fail('這張出貨單已開過帳款')
    // 已經退回的數量不開帳
    const amount = round(sum(sh.lines, (l) => (l.qty - returnedQty(sh.id, l.item_id, l.lot_no)) * l.price))
    if (amount <= 0) fail('這張出貨單已全部退回，不需開帳')
    const tax = round(amount * taxRate())
    const cust = get('customers', sh.customer_id)
    const inv = insert('invoices', {
      no: nextNo('invoices', 'AR', date), gui_no: nextGui(), customer_id: sh.customer_id, sales_order_id: sh.sales_order_id, shipment_id: sh.id, date,
      due_date: addDays(date, cust?.terms_days ?? 30), amount, tax, total: round(amount + tax), paid: 0, credited: 0, status: 'unpaid',
    })
    postJournal({ date, memo: `銷貨 ${cust?.name} ${sh.no} 發票 ${inv.gui_no}`, lines: [{ account: 1200, debit: amount + tax }, { account: 4100, credit: amount }, { account: 2200, credit: tax }], ref_type: 'invoices', ref_id: inv.id })
    return inv
  })
}

// ---------- 銷貨退回 ----------
// lines: [{ item_id, lot_no, qty }]；disposition: restock（回待處理區等 QC）/ scrap（客戶端銷毀）
export function createSalesReturn({ shipment_id, lines, disposition = 'restock', reason, date = today() }) {
  return transaction(() => {
    need('sales', 2)
    const sh = get('shipments', shipment_id)
    if (!sh) fail('請選擇出貨單')
    if (!reason) fail('請填寫退貨原因')
    const valid = lines.filter((l) => Number(l.qty) > 0)
    if (!valid.length) fail('請輸入退貨數量')
    for (const l of valid) {
      const sl = sh.lines.find((x) => x.item_id === l.item_id && x.lot_no === l.lot_no)
      if (!sl) fail('退貨品項不在這張出貨單裡')
      const can = round(sl.qty - returnedQty(sh.id, l.item_id, l.lot_no), 3)
      if (Number(l.qty) > can + 0.0005) fail(`${get('items', l.item_id)?.name} 批號 ${l.lot_no} 最多可退 ${can}`)
    }
    const priced = valid.map((l) => ({ ...l, qty: Number(l.qty), price: sh.lines.find((x) => x.item_id === l.item_id && x.lot_no === l.lot_no).price }))
    const amount = round(sum(priced, (l) => l.qty * l.price))
    const tax = round(amount * taxRate())
    const needApproval = !isSystem() && getSetting('return_needs_approval')
    const doc = insert('returns', {
      no: nextNo('returns', 'SR', date), kind: 'sales', customer_id: sh.customer_id, shipment_id: sh.id, date, lines: priced, disposition, reason, amount, tax,
      status: needApproval ? 'pending' : 'done',
    })
    if (needApproval)
      requestApproval({ type: 'sales_return', module: 'sales', ref_table: 'returns', ref_id: doc.id, amount: amount + tax, summary: `${doc.no} ${get('customers', sh.customer_id)?.name}（${sh.no}）`, reason })
    else executeSalesReturn(doc.id)
    return doc
  })
}

export function executeSalesReturn(id) {
  const r = get('returns', id)
  assertOpen(r.date)
  const sh = get('shipments', r.shipment_id)
  // 存貨：可再利用的退到「待處理區」等 QC 複檢；銷毀的記損耗
  let cost = 0
  for (const l of r.lines) {
    const c = lotCost(l.lot_no, l.item_id)
    cost += l.qty * c
    if (r.disposition === 'restock') move({ item_id: l.item_id, lot_no: l.lot_no, bin_id: quarantineBin(), qty: l.qty, type: 'sales_return', unit_cost: c, ref_type: 'returns', ref_id: r.id, note: r.no, doc_date: r.date })
  }
  postJournal({
    date: r.date,
    memo: `銷貨退回 ${r.no}（${r.disposition === 'restock' ? '退回待處理區' : '客戶端銷毀'}）`,
    lines: r.disposition === 'restock' ? [{ account: 1310, debit: cost }, { account: 5100, credit: cost }] : [{ account: 5200, debit: cost }, { account: 5100, credit: cost }],
    ref_type: 'returns',
    ref_id: r.id,
  })
  // 帳款：已開帳的沖應收（折讓），未開帳的之後開帳會自動扣掉
  const inv = where('invoices', (i) => i.shipment_id === sh.id)[0]
  if (inv) {
    const credit = round(r.amount + r.tax)
    const credited = round((inv.credited || 0) + credit)
    update('invoices', inv.id, { credited, status: invoiceBalance({ ...inv, credited }) <= 0 ? 'paid' : inv.status })
    update('returns', r.id, { invoice_id: inv.id })
    postJournal({ date: r.date, memo: `銷貨折讓 ${r.no} 沖 ${inv.no}`, lines: [{ account: 4110, debit: r.amount }, { account: 2200, debit: r.tax }, { account: 1200, credit: credit }], ref_type: 'returns', ref_id: r.id })
  }
  update('returns', r.id, { status: 'done' })
}
registerApproval('sales_return', {
  approve: (ap) => executeSalesReturn(ap.ref_id),
  reject: (ap) => update('returns', ap.ref_id, { status: 'rejected' }),
})

export { binOf, lotByNo }
