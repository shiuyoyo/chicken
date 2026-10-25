// 銷售：價格（客戶價格表 / 最低售價）、銷售訂單（信用額度與低價簽核）、報價單轉訂單。
import { all, get, where, insert, update, nextNo, transaction } from '../db/store'
import { fail, need, round, sum, today, addDays, taxRate, docTotal, requestApproval, registerApproval, pendingFor, isSystem } from './core'
import { notify } from './notify'

export const SO_STATUS = { pending: '待核准', confirmed: '已確認', cancelled: '已取消', rejected: '核准退回', closed: '已結案' }
export const QUOTE_STATUS = { draft: '草稿', sent: '已送出', accepted: '客戶接受', rejected: '客戶拒絕', converted: '已轉訂單', expired: '已過期' }

// 客戶價格：價格表優先，否則用品項標準售價
export function priceFor(customerId, itemId) {
  const c = get('customers', customerId)
  const pl = get('price_lists', c?.price_list_id)
  const line = pl?.lines?.find((l) => l.item_id === itemId)
  return Number(line?.price ?? get('items', itemId)?.price ?? 0)
}

// 應收未收（含稅）
export const invoiceBalance = (i) => round(i.total - (i.paid || 0) - (i.credited || 0))
export const arOutstanding = (customerId) => round(sum(where('invoices', (i) => i.customer_id === customerId), invoiceBalance))

// 已確認但還沒開帳的訂單金額（含稅），一起算進信用曝險
export function uninvoicedOrders(customerId, exceptId) {
  const t = 1 + taxRate()
  return round(
    sum(
      where('sales_orders', (s) => s.customer_id === customerId && ['confirmed', 'closed'].includes(s.status) && s.id !== exceptId),
      (s) => Math.max(0, s.total * t - sum(where('invoices', (i) => i.sales_order_id === s.id), (i) => i.total)),
    ),
  )
}
export const creditExposure = (customerId, exceptId) => round(arOutstanding(customerId) + uninvoicedOrders(customerId, exceptId))

// 檢查訂單需要簽核的原因
export function orderChecks(customerId, lines, exceptId) {
  const reasons = []
  for (const l of lines) {
    const item = get('items', l.item_id)
    if (item?.min_price && Number(l.price) < item.min_price) reasons.push(`${item.name} 單價 ${l.price} 低於最低售價 ${item.min_price}`)
  }
  const c = get('customers', customerId)
  const total = docTotal(lines) * (1 + taxRate())
  if (c?.credit_limit > 0) {
    const exp = creditExposure(customerId, exceptId)
    if (exp + total > c.credit_limit) reasons.push(`超過信用額度：未收+未開帳 ${Math.round(exp)} + 本單 ${Math.round(total)} > 額度 ${c.credit_limit}`)
  }
  return reasons
}

export function saveSalesOrder(data, id) {
  return transaction(() => {
    need('sales', 2)
    const c = get('customers', data.customer_id)
    if (!c) fail('請選擇客戶')
    if (c.status === '停止往來') fail(`${c.name} 已停止往來，不能下單`)
    const lines = (data.lines || []).filter((l) => l.item_id && Number(l.qty) > 0).map((l) => ({ item_id: l.item_id, qty: Number(l.qty), price: Number(l.price ?? priceFor(c.id, l.item_id)) }))
    if (!lines.length) fail('請至少輸入一項產品')
    for (const l of lines) if (!['product', 'semi'].includes(get('items', l.item_id)?.type)) fail('訂單只能賣自製的成品或半成品')
    const old = get('sales_orders', id)
    if (old && ['cancelled', 'closed'].includes(old.status)) fail('這張訂單已結束，不能修改')
    if (old) {
      for (const l of old.lines) {
        const shipped = sum(where('shipments', (s) => s.sales_order_id === id).flatMap((s) => s.lines.filter((x) => x.item_id === l.item_id)), (x) => x.qty)
        const nl = lines.find((x) => x.item_id === l.item_id)
        if (shipped > 0 && (!nl || nl.qty < shipped)) fail(`${get('items', l.item_id)?.name} 已出貨 ${shipped}，數量不能少於已出貨`)
      }
    }
    const total = docTotal(lines)
    const reasons = isSystem() ? [] : orderChecks(c.id, lines, id)
    const approvedOk = old && old.approved_total && total <= old.approved_total && !reasons.some((r) => r.includes('最低售價'))
    const status = reasons.length && !approvedOk ? 'pending' : 'confirmed'
    const row = { ...data, lines, total, status }
    const so = old ? update('sales_orders', id, row) : insert('sales_orders', { no: nextNo('sales_orders', 'SO', data.date || today()), ...row })
    if (status === 'pending')
      requestApproval({ type: 'so', module: 'sales', ref_table: 'sales_orders', ref_id: so.id, amount: total, summary: `${so.no} ${c.name}`, reason: reasons.join('；') })
    else if (pendingFor(so.id)) update('approvals', pendingFor(so.id).id, { status: 'superseded' })
    if (status === 'confirmed' && !old) notifyOrder(so)
    return so
  })
}
function notifyOrder(so) {
  const c = get('customers', so.customer_id)
  notify('order_created', {
    ownerId: c?.owner_id,
    title: `新訂單 ${so.no}`,
    lines: [`客戶：${c?.name}`, so.lines.map((l) => `${get('items', l.item_id)?.name} × ${l.qty}`).join('、'), `金額：$${Math.round(so.total).toLocaleString()}（未稅）`, `交期：${so.due_date || '—'}`],
    link: `/progress/${so.id}`,
  })
}

registerApproval('so', {
  approve: (ap) => {
    const so = get('sales_orders', ap.ref_id)
    update('sales_orders', so.id, { status: 'confirmed', approved_total: so.total })
    notifyOrder(so)
  },
  reject: (ap) => update('sales_orders', ap.ref_id, { status: 'rejected' }),
})

export function cancelSalesOrder(id, reason = '') {
  return transaction(() => {
    need('sales', 2)
    const so = get('sales_orders', id)
    if (where('shipments', (s) => s.sales_order_id === id).length) fail('已經出貨的訂單不能取消')
    const busy = where('work_orders', (w) => w.sales_order_id === id && w.status !== 'planned' && w.status !== 'closed' && w.status !== 'cancelled')
    if (busy.length) fail(`工單 ${busy.map((w) => w.no).join('、')} 已開始生產，請先處理工單`)
    for (const w of where('work_orders', (w) => w.sales_order_id === id && w.status === 'planned')) update('work_orders', w.id, { status: 'cancelled' })
    update('sales_orders', id, { status: 'cancelled', note: `${so.note || ''} 取消原因：${reason}`.trim() })
    const ap = pendingFor(id)
    if (ap) update('approvals', ap.id, { status: 'superseded' })
  })
}

// ---------- 報價單 ----------
export function saveQuotation(data, id) {
  return transaction(() => {
    need('crm', 2)
    if (!data.customer_id) fail('請選擇客戶')
    const lines = (data.lines || []).filter((l) => l.item_id && Number(l.qty) > 0).map((l) => ({ item_id: l.item_id, qty: Number(l.qty), price: Number(l.price || 0) }))
    if (!lines.length) fail('請至少輸入一項產品')
    const old = get('quotations', id)
    if (old && old.status === 'converted') fail('已轉訂單的報價不能修改')
    const row = { ...data, lines, total: docTotal(lines) }
    return old ? update('quotations', id, row) : insert('quotations', { no: nextNo('quotations', 'QT', data.date || today()), status: 'draft', valid_until: addDays(data.date || today(), 14), ...row })
  })
}
export const quoteStatus = (q) => (['draft', 'sent'].includes(q.status) && q.valid_until && q.valid_until < today() ? 'expired' : q.status)

export function convertQuotation(id) {
  return transaction(() => {
    need('sales', 2)
    const q = get('quotations', id)
    const st = quoteStatus(q)
    if (st === 'converted') fail('已經轉過訂單')
    if (st === 'expired') fail('報價已過期，請重新報價')
    if (st === 'rejected') fail('客戶已拒絕這張報價')
    const so = saveSalesOrder({ customer_id: q.customer_id, quotation_id: q.id, date: today(), due_date: addDays(today(), 7), lines: q.lines, note: `由報價 ${q.no} 轉入` })
    update('quotations', id, { status: 'converted', sales_order_id: so.id })
    if (q.opportunity_id) update('opportunities', q.opportunity_id, { stage: '成交', probability: 100 })
    return so
  })
}

export const soLines = (soId) => get('sales_orders', soId)?.lines || []
export const activeOrders = () => all('sales_orders').filter((s) => s.status === 'confirmed')
