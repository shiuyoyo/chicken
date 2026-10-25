// 批號追溯（多階）：任一批號往上追到每一層用料與供應商，往下追到用到它的半成品、成品、禮盒，
// 再到出貨客戶、門市銷售，產出召回名單。
import { get, where } from '../db/store'
import { round, sum } from './core'
import { lotByNo, stockRows } from './inventory'

const feedsOfWO = (wo) => wo?.feeds || []
const MAX_DEPTH = 10

// 直接用到這個批號的下一層批號
function lotsUsing(lotNo) {
  const wos = where('work_orders', (w) => feedsOfWO(w).some((f) => f.lot_no === lotNo))
  return wos.flatMap((w) => where('lots', (l) => l.work_order_id === w.id).map((l) => ({ lot: l, wo: w, qty: round(sum(feedsOfWO(w).filter((f) => f.lot_no === lotNo), (f) => f.qty), 3) })))
}

// 往下：用到它的批號，每一層再往下展開（children）
function usedInTree(lotNo, depth = 0, seen = new Set([lotNo])) {
  if (depth >= MAX_DEPTH) return []
  return lotsUsing(lotNo)
    .filter((u) => !seen.has(u.lot.lot_no))
    .map((u) => {
      seen.add(u.lot.lot_no)
      return { ...u, level: depth, children: usedInTree(u.lot.lot_no, depth + 1, seen) }
    })
}

// 往上：這個批號投入了哪些批號；自製的料再往上展開（children）
function materialsTree(lot, depth = 0) {
  const wo = get('work_orders', lot?.work_order_id)
  const by = {}
  for (const f of feedsOfWO(wo)) {
    by[f.lot_no] ||= { lot_no: f.lot_no, item_id: f.item_id, qty: 0 }
    by[f.lot_no].qty = round(by[f.lot_no].qty + f.qty, 3)
  }
  return Object.values(by).map((m) => {
    const l = lotByNo(m.lot_no)
    return {
      ...m, lot: l, level: depth, supplier: get('suppliers', l?.supplier_id), po: get('purchase_orders', l?.purchase_order_id),
      children: l?.work_order_id && depth < MAX_DEPTH ? materialsTree(l, depth + 1) : [],
    }
  })
}

export const flattenTrace = (nodes) => nodes.flatMap((n) => [n, ...flattenTrace(n.children || [])])

function downstreamOf(lotNos) {
  const set = new Set(lotNos)
  const shipments = where('shipments', (s) => s.lines.some((l) => set.has(l.lot_no))).flatMap((s) =>
    s.lines.filter((l) => set.has(l.lot_no)).map((l) => ({ shipment: s, customer: get('customers', s.customer_id), lot_no: l.lot_no, item_id: l.item_id, qty: l.qty })),
  )
  const pos = where('pos_sales', (s) => s.status === 'done' && s.lines.some((l) => set.has(l.lot_no))).flatMap((s) =>
    s.lines.filter((l) => set.has(l.lot_no)).map((l) => ({ sale: s, customer: get('customers', s.customer_id), lot_no: l.lot_no, item_id: l.item_id, qty: l.qty })),
  )
  const returns = where('returns', (r) => r.lines.some((l) => set.has(l.lot_no)))
  const onHand = [...set].flatMap((no) => stockRows({ lot_no: no }))
  // 召回名單：依客戶彙總
  const recall = {}
  for (const x of [...shipments, ...pos]) {
    const key = x.customer?.id || '門市非會員'
    recall[key] ||= { customer: x.customer, qty: 0, docs: [] }
    recall[key].qty = round(recall[key].qty + x.qty, 3)
    recall[key].docs.push(x.shipment?.no || x.sale?.no)
  }
  return { shipments, pos, returns, onHand, recall: Object.values(recall) }
}

export function traceLot(lotNo) {
  const lot = lotByNo(String(lotNo || '').trim())
  if (!lot) return null
  const item = get('items', lot.item_id)
  const qc = where('qc_inspections', (q) => q.lot_no === lot.lot_no)
  const moves = where('stock_moves', (m) => m.lot_no === lot.lot_no).sort((a, b) => String(a.date).localeCompare(String(b.date)))
  // products：直接用到它的批號（含多階 children）；allUsing：所有下游批號
  const products = usedInTree(lot.lot_no)
  const allUsing = flattenTrace(products)
  const base = { lot, item, qc, moves, products, allUsing }
  if (lot.kind === 'raw') {
    return {
      ...base, kind: 'raw',
      supplier: get('suppliers', lot.supplier_id),
      po: get('purchase_orders', lot.purchase_order_id),
      ...downstreamOf(allUsing.map((p) => p.lot.lot_no)),
      rawOnHand: stockRows({ lot_no: lot.lot_no }),
    }
  }
  const wo = get('work_orders', lot.work_order_id)
  const materials = materialsTree(lot)
  // 最上游的外購料批號（含供應商），召回時通知供應商用
  const sources = flattenTrace(materials).filter((m) => !m.children.length)
  return { ...base, kind: 'product', wo, so: get('sales_orders', wo?.sales_order_id), materials, sources, ...downstreamOf([lot.lot_no, ...allUsing.map((p) => p.lot.lot_no)]) }
}
