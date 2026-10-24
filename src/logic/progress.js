// 訂單進度：從報價、接單一路追到收款，並列出每一張關聯單據。
import { get, where } from '../db/store'
import { round, sum, taxRate } from './core'
import { woFed } from './production'
import { shippedQty } from './shipping'
import { invoiceBalance } from './sales'
import { stockOf } from './inventory'
import { openPOQty } from './purchase'

export const STAGES = ['接單', '原料進貨', '領料', '投料烹煮', '產出', 'QC', '出貨', '收款']

export function materialNeeds(lines = []) {
  const need = {}
  for (const l of lines) for (const b of get('items', l.item_id)?.bom || []) need[b.item_id] = round((need[b.item_id] || 0) + b.qty * l.qty, 3)
  return need
}

// 訂單缺料建議：配方需求 − 可用庫存（合格未過期）− 已訂未到
export function purchaseSuggestions(soId) {
  const so = get('sales_orders', soId)
  return Object.entries(materialNeeds(so?.lines))
    .map(([item_id, q]) => ({ item_id, need: q, stock: stockOf(item_id), onOrder: openPOQty(item_id), short: round(q - stockOf(item_id) - openPOQty(item_id), 3) }))
    .filter((s) => s.short > 0)
}

export function orderProgress(soId) {
  const so = get('sales_orders', soId)
  if (!so) return null
  const wos = where('work_orders', (w) => w.sales_order_id === so.id && w.status !== 'cancelled')
  const pos = where('purchase_orders', (p) => p.sales_order_id === so.id && !['cancelled', 'rejected'].includes(p.status))
  const ships = where('shipments', (s) => s.sales_order_id === so.id)
  const invs = where('invoices', (i) => i.sales_order_id === so.id)
  const lots = where('lots', (l) => wos.some((w) => w.id === l.work_order_id))
  const returns = where('returns', (r) => ships.some((s) => s.id === r.shipment_id))
  const payments = where('payments', (p) => invs.some((i) => i.id === p.invoice_id))
  const quote = get('quotations', so.quotation_id)
  const approvals = where('approvals', (a) => a.ref_id === so.id || pos.some((p) => p.id === a.ref_id) || returns.some((r) => r.id === a.ref_id))

  const ordered = sum(so.lines, (l) => l.qty)
  const needs = materialNeeds(so.lines)
  const needTotal = sum(Object.values(needs))
  const poQty = sum(pos, (p) => sum(p.lines, (l) => l.qty))
  const received = sum(pos, (p) => sum(p.lines, (l) => l.received || 0))
  const issued = sum(wos, (w) => sum(where('stock_moves', (m) => m.ref_id === w.id && m.type === 'issue' && m.qty > 0), (m) => m.qty))
  const fed = sum(wos, (w) => woFed(w))
  const output = sum(wos, (w) => w.output_qty || 0)
  const qcPass = sum(lots.filter((l) => l.qc_status === 'pass'), (l) => l.qty)
  const qcFail = sum(lots.filter((l) => l.qc_status === 'fail'), (l) => l.qty)
  const shipped = sum(so.lines, (l) => shippedQty(so.id, l.item_id))
  const boxes = sum(ships, (s) => s.boxes || 0)
  const invTotal = sum(invs, (i) => i.total - (i.credited || 0))
  const paid = sum(invs, (i) => i.paid || 0)

  const pct = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0)
  const matPct = poQty ? pct(received, poQty) : issued > 0 || needTotal === 0 ? 100 : 0
  const steps = [
    { key: '接單', pct: so.status === 'pending' ? 50 : 100, text: so.status === 'pending' ? '待核准' : `${ordered} 單位` },
    { key: '原料進貨', pct: matPct, text: poQty ? `${round(received)}/${round(poQty)}` : '用庫存' },
    { key: '領料', pct: pct(issued, needTotal), text: `${round(issued)}/${round(needTotal)}` },
    { key: '投料烹煮', pct: pct(fed, needTotal * 0.98), text: `${round(fed)}/${round(needTotal)}` },
    { key: '產出', pct: pct(output, ordered), text: `${round(output)}/${ordered}` },
    { key: 'QC', pct: pct(qcPass, ordered), text: `合格 ${round(qcPass)}${qcFail ? ` 不合格 ${round(qcFail)}` : ''}` },
    { key: '出貨', pct: pct(shipped, ordered), text: `${round(shipped)}/${ordered}（${boxes} 箱）` },
    { key: '收款', pct: pct(paid, invTotal || so.total * (1 + taxRate())), text: `$${Math.round(paid).toLocaleString()}` },
  ]
  let current = steps.findIndex((s) => s.pct < 100)
  if (current === -1) current = steps.length
  // 已出貨完畢且已收齊 = 完成；中間階段若已被後面階段超越則以出貨為準
  if (shipped >= ordered && invs.length && sum(invs, invoiceBalance) <= 0) current = steps.length
  const status = so.status === 'cancelled' ? '已取消' : so.status === 'rejected' ? '核准退回' : so.status === 'pending' ? '待核准' : current >= steps.length ? '已完成' : STAGES[current]
  return { so, quote, wos, pos, ships, invs, lots, returns, payments, approvals, needs, steps, current, status, ordered, output, qcPass, shipped, boxes, paid, invTotal }
}
