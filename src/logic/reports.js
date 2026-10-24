// 報表：銷售毛利（批發 + 門市）、庫存評價。
import { all, get } from '../db/store'
import { round } from './core'
import { lotCost, stockRows, warehouseOfBin, lotByNo } from './inventory'
import { returnedQty } from './shipping'

// 每一筆銷售明細（出貨扣掉退回 + 門市）
export function salesLines(from, to) {
  const out = []
  for (const s of all('shipments')) {
    if ((from && s.date < from) || (to && s.date > to)) continue
    for (const l of s.lines) {
      const qty = round(l.qty - returnedQty(s.id, l.item_id, l.lot_no), 3)
      if (qty <= 0) continue
      out.push({ channel: '批發', date: s.date, customer_id: s.customer_id, item_id: l.item_id, qty, revenue: qty * l.price, cost: qty * lotCost(l.lot_no, l.item_id) })
    }
  }
  for (const s of all('pos_sales')) {
    if (s.status !== 'done' || (from && s.date < from) || (to && s.date > to)) continue
    const gross = s.lines.reduce((a, l) => a + l.qty * l.price, 0) || 1
    const net = s.total - s.tax
    for (const l of s.lines) {
      const share = (l.qty * l.price) / gross
      out.push({ channel: '門市', date: s.date, customer_id: s.customer_id, item_id: l.item_id, qty: l.qty, revenue: net * share, cost: l.qty * lotCost(l.lot_no, l.item_id) })
    }
  }
  return out
}

export function groupSales(lines, keyFn) {
  const g = {}
  for (const l of lines) {
    const k = keyFn(l)
    g[k] ||= { key: k, qty: 0, revenue: 0, cost: 0 }
    g[k].qty += l.qty
    g[k].revenue += l.revenue
    g[k].cost += l.cost
  }
  return Object.values(g)
    .map((x) => ({ ...x, revenue: round(x.revenue), cost: round(x.cost), margin: round(x.revenue - x.cost), pct: x.revenue ? Math.round(((x.revenue - x.cost) / x.revenue) * 100) : 0 }))
    .sort((a, b) => b.revenue - a.revenue)
}

export function inventoryValuation() {
  const rows = stockRows().filter((r) => r.qty > 0)
  const by = {}
  for (const r of rows) {
    const wh = warehouseOfBin(r.bin_id)
    const k = wh?.id || '?'
    by[k] ||= { warehouse: wh, value: 0, rows: 0 }
    by[k].value += r.qty * lotCost(r.lot_no, r.item_id)
    by[k].rows++
  }
  return {
    rows: rows.map((r) => ({ ...r, lot: lotByNo(r.lot_no), item: get('items', r.item_id), value: round(r.qty * lotCost(r.lot_no, r.item_id)) })),
    byWarehouse: Object.values(by).map((x) => ({ ...x, value: round(x.value) })),
  }
}
