// CRM：客戶 360、互動紀錄與待辦提醒、商機管道、回購預測。
import { all, get, where, insert, update, transaction, currentUser } from '../db/store'
import { fail, need, round, sum, today, addDays, daysBetween } from './core'
import { arOutstanding, creditExposure } from './sales'
import { lotCost } from './inventory'

export const CUSTOMER_KINDS = { company: '企業客戶', member: '門市會員' }
export const CUSTOMER_LEVELS = ['VIP', 'A', 'B', 'C']
export const CUSTOMER_STATUS = ['潛在客戶', '往來中', '停止往來']
export const ACTIVITY_TYPES = ['拜訪', '電話', 'LINE', 'Email', '試吃 / 送樣', '客訴', '其他']
export const OPP_STAGES = ['接洽', '送樣試吃', '報價', '議價', '成交', '失敗']
export const STAGE_PROB = { 接洽: 10, 送樣試吃: 30, 報價: 50, 議價: 70, 成交: 100, 失敗: 0 }

export function saveCustomer(data, id) {
  return transaction(() => {
    need(data.kind === 'member' ? 'pos' : 'crm', 2)
    if (!data.name) fail('請輸入名稱')
    if (data.phone && where('customers', (c) => c.phone === data.phone && c.id !== id).length) fail(`電話 ${data.phone} 已經是其他客戶 / 會員`)
    if (data.code && where('customers', (c) => c.code === data.code && c.id !== id).length) fail(`編號 ${data.code} 重複`)
    return id ? update('customers', id, data) : insert('customers', { kind: 'company', status: '往來中', level: 'B', points: 0, contacts: [], ...data })
  })
}

export function findMember(phone) {
  return where('customers', (c) => c.phone && c.phone.replace(/\D/g, '') === String(phone).replace(/\D/g, ''))[0]
}
export function quickMember({ name, phone }) {
  if (!phone) fail('請輸入電話')
  if (findMember(phone)) fail('這支電話已經是會員')
  const n = where('customers', (c) => c.kind === 'member').length + 1
  return saveCustomer({ kind: 'member', code: `M${String(n).padStart(4, '0')}`, name: name || `會員 ${phone.slice(-4)}`, phone, level: 'C', status: '往來中', terms_days: 0 })
}

export function logActivity(data, id) {
  return transaction(() => {
    need('crm', 2)
    if (!data.customer_id) fail('請選擇客戶')
    if (!data.summary) fail('請填寫內容')
    return id ? update('activities', id, data) : insert('activities', { date: today(), done: false, user_id: currentUser()?.id, ...data })
  })
}
export const completeActivity = (id) => (need('crm', 2), update('activities', id, { done: true }))
export const dueFollowups = (d = today()) => where('activities', (a) => !a.done && a.next_date && a.next_date <= d).sort((a, b) => a.next_date.localeCompare(b.next_date))

export function saveOpportunity(data, id) {
  return transaction(() => {
    need('crm', 2)
    if (!data.customer_id) fail('請選擇客戶')
    if (!data.title) fail('請輸入商機名稱')
    if (data.stage === '失敗' && !data.lost_reason) fail('請填寫失敗原因')
    const row = { ...data, probability: data.probability ?? STAGE_PROB[data.stage] ?? 10 }
    return id ? update('opportunities', id, row) : insert('opportunities', { stage: '接洽', owner_id: currentUser()?.id, ...row })
  })
}
export const pipeline = () =>
  OPP_STAGES.map((s) => {
    const list = where('opportunities', (o) => o.stage === s)
    return { stage: s, list, amount: round(sum(list, (o) => o.amount)), weighted: round(sum(list, (o) => (o.amount * (o.probability ?? STAGE_PROB[s])) / 100)) }
  })

// 客戶 360：營收、毛利、下單頻率、回購預測、未收款、信用
export function customer360(id) {
  const c = get('customers', id)
  if (!c) return null
  const orders = where('sales_orders', (s) => s.customer_id === id && s.status !== 'cancelled').sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const shipments = where('shipments', (s) => s.customer_id === id)
  const pos = where('pos_sales', (s) => s.customer_id === id && s.status === 'done')
  const revenue = round(sum(shipments.flatMap((s) => s.lines), (l) => l.qty * l.price) + sum(pos, (s) => s.total - s.tax))
  const cost = round(sum(shipments.flatMap((s) => s.lines), (l) => l.qty * lotCost(l.lot_no, l.item_id)) + sum(pos.flatMap((s) => s.lines), (l) => l.qty * lotCost(l.lot_no, l.item_id)))
  const dates = [...orders.map((o) => o.date), ...pos.map((p) => p.date)].sort()
  let avgInterval = null
  if (dates.length >= 2) avgInterval = Math.round(daysBetween(dates[0], dates[dates.length - 1]) / (dates.length - 1))
  const last = dates[dates.length - 1]
  const nextExpected = avgInterval && last ? addDays(last, avgInterval) : null
  const items = {}
  for (const o of orders) for (const l of o.lines) items[l.item_id] = round((items[l.item_id] || 0) + l.qty, 3)
  for (const p of pos) for (const l of p.lines) items[l.item_id] = round((items[l.item_id] || 0) + l.qty, 3)
  return {
    c, orders, shipments, pos, revenue, cost,
    invoices: where('invoices', (i) => i.customer_id === id),
    quotations: where('quotations', (q) => q.customer_id === id),
    activities: where('activities', (a) => a.customer_id === id).sort((a, b) => String(b.date).localeCompare(String(a.date))),
    opportunities: where('opportunities', (o) => o.customer_id === id),
    returns: where('returns', (r) => r.customer_id === id),
    ar: arOutstanding(id), exposure: creditExposure(id), avgInterval, last, nextExpected,
    overdueReorder: nextExpected && nextExpected < today(),
    topItems: Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 5),
  }
}

// 該回購還沒下單的客戶
export const reorderReminders = () =>
  all('customers')
    .filter((c) => c.kind !== 'member' && c.status !== '停止往來')
    .map((c) => customer360(c.id))
    .filter((x) => x?.overdueReorder)
