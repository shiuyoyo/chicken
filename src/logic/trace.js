// 食品追溯：任一批號往上追原料與供應商，往下追成品、出貨客戶、門市銷售，產出召回名單。
import { get, where } from '../db/store'
import { round, sum } from './core'
import { lotByNo, stockRows } from './inventory'

const feedsOfWO = (wo) => wo?.feeds || []

// 原料批號用到哪些成品批號
function productLotsUsing(rawLotNo) {
  const wos = where('work_orders', (w) => feedsOfWO(w).some((f) => f.lot_no === rawLotNo))
  return wos.flatMap((w) => where('lots', (l) => l.work_order_id === w.id).map((l) => ({ lot: l, wo: w, qty: round(sum(feedsOfWO(w).filter((f) => f.lot_no === rawLotNo), (f) => f.qty), 3) })))
}

// 成品批號的原料來源
function materialsOf(productLot) {
  const wo = get('work_orders', productLot.work_order_id)
  const by = {}
  for (const f of feedsOfWO(wo)) {
    by[f.lot_no] ||= { lot_no: f.lot_no, item_id: f.item_id, qty: 0 }
    by[f.lot_no].qty = round(by[f.lot_no].qty + f.qty, 3)
  }
  return Object.values(by).map((m) => {
    const lot = lotByNo(m.lot_no)
    return { ...m, lot, supplier: get('suppliers', lot?.supplier_id), po: get('purchase_orders', lot?.purchase_order_id) }
  })
}

function downstreamOf(productLotNos) {
  const set = new Set(productLotNos)
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
  if (lot.kind === 'raw') {
    const products = productLotsUsing(lot.lot_no)
    return {
      lot, item, qc, moves, kind: 'raw',
      supplier: get('suppliers', lot.supplier_id),
      po: get('purchase_orders', lot.purchase_order_id),
      products,
      ...downstreamOf(products.map((p) => p.lot.lot_no)),
      rawOnHand: stockRows({ lot_no: lot.lot_no }),
    }
  }
  const wo = get('work_orders', lot.work_order_id)
  return { lot, item, qc, moves, kind: 'product', wo, so: get('sales_orders', wo?.sales_order_id), materials: materialsOf(lot), ...downstreamOf([lot.lot_no]) }
}
