// 報表：銷售毛利（批發 + 門市）、庫存評價。
import { all, get, where } from '../db/store'
import { round, sum, getSetting, setSetting, need, can, fail, today, addDays } from './core'
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

// ---------- 業務業績 ----------
// 業績歸屬：訂單上的業務（沒有就用客戶的負責業務）；門市銷售另列「門市」
export const salespersonOf = (shipment) => {
  const so = get('sales_orders', shipment.sales_order_id)
  return so?.salesperson_id || get('customers', shipment.customer_id)?.owner_id || ''
}
export const salesTargets = () => getSetting('sales_targets') || {}
export function saveSalesTargets(targets) {
  if (!can('sales', 3)) need('admin', 2)
  const clean = {}
  for (const [uid, v] of Object.entries(targets)) {
    const n = Number(v)
    if (v !== '' && v !== null && !(n >= 0)) fail('目標金額請輸入數字')
    if (n > 0) clean[uid] = n
  }
  setSetting('sales_targets', clean, { system: true })
  return clean
}
const monthsBetween = (from, to) => {
  const [fy, fm] = from.slice(0, 7).split('-').map(Number)
  const [ty, tm] = to.slice(0, 7).split('-').map(Number)
  return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1)
}

// 每位業務：出貨銷售額（扣退貨，未稅）、毛利、接單、新客戶、報價成交、應收未收、目標達成
export function salesPerformance(from, to) {
  const months = monthsBetween(from, to)
  const targets = salesTargets()
  const by = {}
  const row = (uid) =>
    (by[uid] ||= { user_id: uid, revenue: 0, cost: 0, orders: 0, ordered: 0, customers: new Set(), newCustomers: 0, quotes: 0, won: 0, ar: 0, target: (targets[uid] || 0) * months })
  for (const s of all('shipments')) {
    if (s.date < from || s.date > to) continue
    const r = row(salespersonOf(s))
    for (const l of s.lines) {
      const q = round(l.qty - returnedQty(s.id, l.item_id, l.lot_no), 3)
      if (q <= 0) continue
      r.revenue += q * l.price
      r.cost += q * lotCost(l.lot_no, l.item_id)
    }
    r.customers.add(s.customer_id)
  }
  for (const so of all('sales_orders')) {
    if (so.date < from || so.date > to || !['confirmed', 'closed'].includes(so.status)) continue
    const r = row(so.salesperson_id || get('customers', so.customer_id)?.owner_id || '')
    r.orders++
    r.ordered += so.total
  }
  for (const c of where('customers', (c) => c.kind !== 'member' && c.owner_id)) {
    const r = row(c.owner_id)
    if (String(c.created_at).slice(0, 10) >= from && String(c.created_at).slice(0, 10) <= to) r.newCustomers++
    r.ar += sum(where('invoices', (i) => i.customer_id === c.id), (i) => i.total - (i.paid || 0) - (i.credited || 0))
  }
  for (const q of all('quotations')) {
    if (q.date < from || q.date > to) continue
    const r = row(get('customers', q.customer_id)?.owner_id || '')
    r.quotes++
    if (['converted', 'accepted'].includes(q.status)) r.won++
  }
  for (const uid of Object.keys(targets)) row(uid)
  return Object.values(by)
    .map((r) => ({
      ...r, customers: r.customers.size, revenue: round(r.revenue), cost: round(r.cost), margin: round(r.revenue - r.cost), ordered: round(r.ordered), ar: round(r.ar),
      pct: r.revenue ? Math.round(((r.revenue - r.cost) / r.revenue) * 100) : 0,
      achieve: r.target ? Math.round((r.revenue / r.target) * 100) : null,
      winRate: r.quotes ? Math.round((r.won / r.quotes) * 100) : null,
    }))
    .sort((a, b) => b.revenue - a.revenue)
}

// 近 n 個月每位業務的出貨銷售額（看趨勢）
export function salesTrend(n = 6, end = today()) {
  const months = Array.from({ length: n }, (_, i) => {
    const d = new Date(end.slice(0, 7) + '-01')
    d.setUTCMonth(d.getUTCMonth() - (n - 1 - i))
    return d.toISOString().slice(0, 7)
  })
  const by = {}
  for (const s of all('shipments')) {
    const m = s.date.slice(0, 7)
    if (!months.includes(m)) continue
    const uid = salespersonOf(s)
    by[uid] ||= Object.fromEntries(months.map((x) => [x, 0]))
    by[uid][m] += sum(s.lines, (l) => Math.max(0, l.qty - returnedQty(s.id, l.item_id, l.lot_no)) * l.price)
  }
  return { months, rows: Object.entries(by).map(([user_id, v]) => ({ user_id, months: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)])) })) }
}
