// 採購：採購單（金額門檻簽核）、進貨（建立原料批號、放到儲位）、退回供應商、應付帳款。
import { get, where, insert, update, nextNo, transaction } from '../db/store'
import {
  fail, need, needAny, round, sum, today, addDays, getSetting, taxRate, postJournal, assertOpen, docTotal,
  requestApproval, registerApproval, pendingFor, isSystem,
} from './core'
import { notify } from './notify'
import { createLot, defaultBin, checkTemp, move, lotByNo, onHand, stockOf, binOf } from './inventory'

export const PO_STATUS = { pending: '待核准', open: '未到貨', partial: '部分到貨', received: '已到齊', closed: '已結案', cancelled: '已作廢', rejected: '核准退回' }

export function poStatus(po) {
  if (['cancelled', 'closed', 'pending', 'rejected'].includes(po.status)) return po.status
  const r = sum(po.lines, (l) => l.received || 0)
  if (!r) return 'open'
  return po.lines.every((l) => (l.received || 0) >= l.qty) ? 'received' : 'partial'
}

export function savePurchaseOrder(data, id) {
  return transaction(() => {
    need('purchase', 2)
    if (!data.supplier_id) fail('請選擇供應商')
    const lines = (data.lines || []).filter((l) => l.item_id && Number(l.qty) > 0).map((l) => ({ ...l, qty: Number(l.qty), price: Number(l.price || 0), received: l.received || 0 }))
    if (!lines.length) fail('請至少輸入一項')
    for (const l of lines) if (get('items', l.item_id)?.type === 'product') fail('採購單只能買原料或包材')
    const old = get('purchase_orders', id)
    if (old && ['received', 'closed', 'cancelled'].includes(poStatus(old))) fail('這張採購單已結束，不能修改')
    if (old) for (const l of old.lines) if ((l.received || 0) > 0 && !lines.find((x) => x.item_id === l.item_id && x.qty >= l.received)) fail('已到貨的品項不能刪除或改成少於已收量')
    const total = docTotal(lines)
    const overLimit = !isSystem() && total > Number(getSetting('po_approval_amount'))
    const alreadyApproved = old && old.status !== 'pending' && old.status !== 'rejected' && total <= Number(old.approved_total || 0)
    const status = overLimit && !alreadyApproved ? 'pending' : old && poStatus(old) !== 'pending' && poStatus(old) !== 'rejected' ? old.status : 'open'
    const row = { ...data, lines, total, status }
    const po = old ? update('purchase_orders', id, row) : insert('purchase_orders', { no: nextNo('purchase_orders', 'PO', data.date || today()), ...row })
    if (status === 'pending')
      requestApproval({
        type: 'po', module: 'purchase', ref_table: 'purchase_orders', ref_id: po.id, amount: total,
        summary: `${po.no} ${get('suppliers', po.supplier_id)?.name}`, reason: `採購金額 ${total} 超過門檻 ${getSetting('po_approval_amount')}`,
      })
    return po
  })
}
registerApproval('po', {
  approve: (ap) => {
    const po = get('purchase_orders', ap.ref_id)
    update('purchase_orders', po.id, { status: 'open', approved_total: po.total })
  },
  reject: (ap) => update('purchase_orders', ap.ref_id, { status: 'rejected' }),
})

export function cancelPurchaseOrder(id) {
  return transaction(() => {
    need('purchase', 2)
    const po = get('purchase_orders', id)
    if (sum(po.lines, (l) => l.received || 0) > 0) fail('已經有到貨，不能作廢；請改用「結案」')
    update('purchase_orders', id, { status: 'cancelled' })
    const ap = pendingFor(id)
    if (ap) update('approvals', ap.id, { status: 'superseded' })
  })
}
export function closePurchaseOrder(id) {
  need('purchase', 2)
  const po = get('purchase_orders', id)
  if (poStatus(po) !== 'partial') fail('只有部分到貨的採購單可以結案')
  update('purchase_orders', id, { status: 'closed' })
}

// 依品項的供應商紀錄找最近一次的採購價
export function lastPurchase(itemId) {
  return where('purchase_orders', (p) => p.lines.some((l) => l.item_id === itemId) && p.status !== 'cancelled').sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]
}

// 進貨：lines = [{ item_id, qty, price?, bin_id?, supplier_lot?, exp_date?, mfg_date? }]
export function receiveGoods({ supplier_id, purchase_order_id, lines, note = '', date = today() }) {
  return transaction(() => {
    needAny(['purchase', 'wms'], 2)
    assertOpen(date)
    const po = get('purchase_orders', purchase_order_id)
    if (po && !['open', 'partial'].includes(poStatus(po))) fail(`採購單 ${po.no} 狀態是「${PO_STATUS[poStatus(po)]}」，不能進貨`)
    supplier_id ||= po?.supplier_id
    if (!supplier_id) fail('請選擇供應商')
    const valid = lines.filter((l) => l.item_id && Number(l.qty) > 0)
    if (!valid.length) fail('沒有輸入進貨數量')
    const tol = Number(getSetting('receive_tolerance'))
    const lots = []
    let amount = 0
    for (const l of valid) {
      const item = get('items', l.item_id)
      if (item?.type === 'product') fail('成品不能用進貨入庫')
      const poLine = po?.lines.find((x) => x.item_id === l.item_id)
      if (po && !poLine) fail(`${item.name} 不在採購單 ${po.no} 內`)
      if (poLine) {
        const after = (poLine.received || 0) + Number(l.qty)
        if (after > poLine.qty * (1 + tol) + 0.0005) fail(`${item.name} 超收：訂 ${poLine.qty}，收了會變 ${round(after, 3)}（最多可超收 ${tol * 100}%）`)
      }
      const bin_id = l.bin_id || defaultBin(l.item_id)
      checkTemp(l.item_id, bin_id)
      const price = Number(l.price ?? poLine?.price ?? item?.cost ?? 0)
      amount += Number(l.qty) * price
      const lot = createLot({
        kind: 'raw', item_id: l.item_id, supplier_id, supplier_lot: l.supplier_lot || '', purchase_order_id: po?.id || '',
        qty: Number(l.qty), unit_cost: price, qc_status: item.iqc_required ? 'pending' : 'pass',
        mfg_date: l.mfg_date || date, exp_date: l.exp_date || addDays(date, item.shelf_days || 365), note,
      })
      lots.push(lot)
      move({ item_id: l.item_id, lot_no: lot.lot_no, bin_id, qty: l.qty, type: 'receive', unit_cost: price, ref_type: po ? 'purchase_orders' : 'suppliers', ref_id: po?.id || supplier_id, note: note || po?.no || '直接進貨', doc_date: date })
    }
    if (po) {
      const newLines = po.lines.map((pl) => ({ ...pl, received: round((pl.received || 0) + sum(valid.filter((l) => l.item_id === pl.item_id), (l) => l.qty), 3) }))
      update('purchase_orders', po.id, { lines: newLines, status: poStatus({ ...po, lines: newLines }) })
    }
    amount = round(amount)
    const tax = round(amount * taxRate())
    const sup = get('suppliers', supplier_id)
    const bill = insert('bills', {
      no: nextNo('bills', 'AP', date), supplier_id, purchase_order_id: po?.id || '', date, due_date: addDays(date, sup?.terms_days ?? 30),
      amount, tax, total: round(amount + tax), paid: 0, credited: 0, status: 'unpaid', note: (po ? `採購單 ${po.no} 進貨` : '直接進貨') + (note ? `｜${note}` : ''),
    })
    postJournal({ date, memo: `進貨 ${sup?.name || ''} ${po?.no || ''}`, lines: [{ account: 1300, debit: amount }, { account: 1400, debit: tax }, { account: 2100, credit: amount + tax }], ref_type: 'bills', ref_id: bill.id })
    const lotText = (l) => `${get('items', l.item_id)?.name} ${l.qty}${get('items', l.item_id)?.unit || ''}（${l.lot_no}）`
    notify('po_received', { title: `進貨入庫：${sup?.name}`, lines: [po ? `採購單 ${po.no}` : '直接進貨', ...lots.map(lotText)], link: po ? `/purchase?open=${po.id}` : '/receiving' })
    const waiting = lots.filter((l) => l.qc_status === 'pending')
    if (waiting.length) notify('iqc_needed', { title: '進料等待檢驗', lines: [...waiting.map(lotText), '檢驗合格前不能領用'], link: '/qc' })
    return { bill, lots }
  })
}

export const billBalance = (b) => round(b.total - (b.paid || 0) - (b.credited || 0))
export const billStatus = (b) => (billBalance(b) <= 0 ? 'paid' : (b.paid || 0) + (b.credited || 0) > 0 ? 'partial' : 'unpaid')

// 退回供應商：從某原料批號退貨，沖減應付帳款
export function purchaseReturn({ lot_no, bin_id, qty, reason, date = today() }) {
  return transaction(() => {
    need('purchase', 2)
    assertOpen(date)
    const lot = lotByNo(lot_no)
    if (!lot || lot.kind !== 'raw') fail('請選擇原料批號')
    qty = Number(qty)
    if (!(qty > 0)) fail('請輸入退貨數量')
    if (!reason) fail('請填寫退貨原因')
    if (onHand({ lot_no, bin_id }) < qty) fail(`${binOf(bin_id)?.code} 這個批號只剩 ${onHand({ lot_no, bin_id })}`)
    const amount = round(qty * lot.unit_cost)
    const tax = round(amount * taxRate())
    const doc = insert('returns', {
      no: nextNo('returns', 'PR', date), kind: 'purchase', supplier_id: lot.supplier_id, date, lines: [{ item_id: lot.item_id, lot_no, bin_id, qty, price: lot.unit_cost }],
      disposition: 'return', reason, amount, tax, status: 'done',
    })
    move({ item_id: lot.item_id, lot_no, bin_id, qty: -qty, type: 'purchase_return', unit_cost: lot.unit_cost, ref_type: 'returns', ref_id: doc.id, note: doc.no, doc_date: date })
    // 優先沖這個批號的採購單帳款，沒有就開一張負的應付
    const bill = where('bills', (b) => b.supplier_id === lot.supplier_id && b.purchase_order_id && b.purchase_order_id === lot.purchase_order_id && billBalance(b) > 0)[0]
    if (bill) {
      const credited = round((bill.credited || 0) + Math.min(amount + tax, billBalance(bill)))
      update('bills', bill.id, { credited, status: billStatus({ ...bill, credited }) })
      update('returns', doc.id, { bill_id: bill.id })
    } else {
      const b = insert('bills', { no: nextNo('bills', 'AP', date), supplier_id: lot.supplier_id, date, due_date: date, amount: -amount, tax: -tax, total: -(amount + tax), paid: 0, credited: 0, status: 'unpaid', note: `退貨折讓 ${doc.no}` })
      update('returns', doc.id, { bill_id: b.id })
    }
    postJournal({ date, memo: `退回供應商 ${doc.no}（${reason}）`, lines: [{ account: 2100, debit: amount + tax }, { account: 1300, credit: amount }, { account: 1400, credit: tax }], ref_type: 'returns', ref_id: doc.id })
    return doc
  })
}

// 訂單缺料建議（依配方 − 倉庫可用 − 已訂未到）
export function openPOQty(itemId) {
  return round(
    sum(
      where('purchase_orders', (p) => ['open', 'partial', 'pending'].includes(poStatus(p))),
      (p) => sum(p.lines.filter((l) => l.item_id === itemId), (l) => Math.max(0, l.qty - (l.received || 0))),
    ),
    3,
  )
}

export { stockOf }
