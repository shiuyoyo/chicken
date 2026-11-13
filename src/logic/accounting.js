// 會計：收款、付款、費用、帳齡、損益、月結關帳。
import { all, get, where, insert, update, nextNo, transaction } from '../db/store'
import { fail, need, round, sum, today, daysBetween, postJournal, assertOpen, getSetting, setSetting, balances, pendingApprovals, ACCOUNTS } from './core'
import { notify } from './notify'
import { invoiceBalance } from './sales'
import { billBalance, billStatus } from './purchase'
import { stockRows, stockValueAsOf } from './inventory'

export const PAY_METHODS = ['匯款', '現金', '支票', '信用卡']

export function receivePayment({ invoice_id, amount, method = '匯款', date = today(), note = '' }) {
  return transaction(() => {
    need('accounting', 2)
    assertOpen(date)
    const inv = get('invoices', invoice_id)
    amount = round(amount)
    if (!(amount > 0)) fail('請輸入收款金額')
    if (amount > invoiceBalance(inv) + 0.001) fail(`收款超過未收金額 ${invoiceBalance(inv)}`)
    const paid = round((inv.paid || 0) + amount)
    update('invoices', inv.id, { paid, status: invoiceBalance({ ...inv, paid }) <= 0 ? 'paid' : 'partial' })
    const p = insert('payments', { no: nextNo('payments', 'RV', date), kind: 'in', invoice_id, party_id: inv.customer_id, date, amount, method, note })
    postJournal({ date, memo: `收款 ${inv.no} ${get('customers', inv.customer_id)?.name}`, lines: [{ account: 1100, debit: amount }, { account: 1200, credit: amount }], ref_type: 'payments', ref_id: p.id })
    const cust = get('customers', inv.customer_id)
    notify('payment_received', { ownerId: cust?.owner_id, title: `收到貨款 $${Math.round(amount).toLocaleString()}`, lines: [`客戶：${cust?.name}`, `帳款 ${inv.no}・${method}`, invoiceBalance({ ...inv, paid }) > 0 ? `尚欠 $${Math.round(invoiceBalance({ ...inv, paid })).toLocaleString()}` : '已結清'], link: '/accounting?tab=ar' })
    return p
  })
}

export function payBill({ bill_id, amount, method = '匯款', date = today(), note = '' }) {
  return transaction(() => {
    need('accounting', 2)
    assertOpen(date)
    const bill = get('bills', bill_id)
    amount = round(amount)
    if (!(amount > 0)) fail('請輸入付款金額')
    if (amount > billBalance(bill) + 0.001) fail(`付款超過未付金額 ${billBalance(bill)}`)
    const paid = round((bill.paid || 0) + amount)
    update('bills', bill.id, { paid, status: billStatus({ ...bill, paid }) })
    const p = insert('payments', { no: nextNo('payments', 'PV', date), kind: 'out', bill_id, party_id: bill.supplier_id, date, amount, method, note })
    postJournal({ date, memo: `付款 ${bill.no} ${get('suppliers', bill.supplier_id)?.name}`, lines: [{ account: 2100, debit: amount }, { account: 1100, credit: amount }], ref_type: 'payments', ref_id: p.id })
    return p
  })
}

export function recordExpense({ account, amount, date = today(), memo }) {
  return transaction(() => {
    need('accounting', 2)
    if (!(Number(amount) > 0)) fail('請輸入金額')
    if (!String(account).startsWith('6')) fail('請選擇費用科目')
    if (!memo) fail('請填寫摘要')
    return postJournal({ date, memo, lines: [{ account: Number(account), debit: amount }, { account: 1100, credit: amount }], ref_type: 'expense' })
  })
}

export function manualJournal({ date, memo, lines }) {
  return transaction(() => {
    need('accounting', 2)
    if (!memo) fail('請填寫摘要')
    return postJournal({ date, memo, lines, ref_type: 'manual' })
  })
}

// 帳齡：0-30、31-60、61-90、90+（以到期日計算逾期天數）
export const AGING_BUCKETS = ['未到期', '逾期 1-30 天', '逾期 31-60 天', '逾期 61-90 天', '逾期 90 天以上']
export function agingBucket(due, d = today()) {
  const late = daysBetween(due, d)
  if (late <= 0) return 0
  if (late <= 30) return 1
  if (late <= 60) return 2
  if (late <= 90) return 3
  return 4
}
export function aging(kind) {
  const rows = kind === 'ar' ? all('invoices').map((i) => ({ doc: i, party: i.customer_id, bal: invoiceBalance(i) })) : all('bills').map((b) => ({ doc: b, party: b.supplier_id, bal: billBalance(b) }))
  const by = {}
  for (const r of rows) {
    if (Math.abs(r.bal) < 0.5) continue
    by[r.party] ||= { party: r.party, buckets: [0, 0, 0, 0, 0], total: 0 }
    by[r.party].buckets[agingBucket(r.doc.due_date)] += r.bal
    by[r.party].total += r.bal
  }
  return Object.values(by).sort((a, b) => b.total - a.total)
}

export function profitAndLoss(from, to) {
  const b = balances(from, to)
  const net = (k) => round((b[k]?.debit || 0) - (b[k]?.credit || 0))
  const revenue = round(-net(4100) - net(4110))
  const costs = Object.keys(ACCOUNTS).filter((k) => k.startsWith('5')).map((k) => ({ k, v: net(k) })).filter((x) => x.v)
  const expenses = Object.keys(ACCOUNTS).filter((k) => k.startsWith('6')).map((k) => ({ k, v: net(k) })).filter((x) => x.v)
  const other = round(-net(7100))
  const cogs = round(sum(costs, (x) => x.v))
  const opex = round(sum(expenses, (x) => x.v))
  return { gross_sales: -net(4100), returns: net(4110), revenue, costs, cogs, gross: round(revenue - cogs), expenses, opex, other, net: round(revenue - cogs - opex + other) }
}

// ---------- 月結 ----------
export function closingChecks(until) {
  const checks = []
  const bad = all('journal').filter((j) => j.date <= until && round(sum(j.lines, (l) => l.debit)) !== round(sum(j.lines, (l) => l.credit)))
  checks.push({ name: '傳票借貸平衡', ok: !bad.length, detail: bad.length ? `${bad.length} 張不平衡` : '全部平衡', block: true })
  const tb = balances(undefined, until)
  const d = round(sum(Object.values(tb), (x) => x.debit))
  const c = round(sum(Object.values(tb), (x) => x.credit))
  checks.push({ name: '試算表平衡', ok: d === c, detail: `借 ${d.toLocaleString()} / 貸 ${c.toLocaleString()}`, block: true })
  const neg = stockRows().filter((r) => r.qty < 0)
  checks.push({ name: '沒有負庫存', ok: !neg.length, detail: neg.length ? `${neg.length} 筆負庫存` : '正常', block: true })
  const pend = pendingApprovals()
  checks.push({ name: '沒有待簽核單據', ok: !pend.length, detail: pend.length ? `${pend.length} 筆待簽（不擋關帳，建議先處理）` : '無', block: false })
  const openWO = where('work_orders', (w) => !['closed', 'cancelled'].includes(w.status) && w.plan_date <= until)
  checks.push({ name: '工單已結案', ok: !openWO.length, detail: openWO.length ? `${openWO.length} 張工單未結案（在製品會留到下期）` : '全部結案', block: false })
  const shifts = where('pos_shifts', (s) => s.status === 'open' && String(s.opened_at).slice(0, 10) <= until)
  checks.push({ name: 'POS 已日結', ok: !shifts.length, detail: shifts.length ? `${shifts.length} 個班別未日結` : '全部日結', block: true })
  const inv = stockValueAsOf(until)
  const gl = round(sum([1300, 1310, 1320], (k) => (tb[k]?.debit || 0) - (tb[k]?.credit || 0)))
  checks.push({ name: '存貨帳實相符', ok: Math.abs(inv - gl) < Math.max(100, inv * 0.01), detail: `庫存評價 ${Math.round(inv).toLocaleString()} / 帳上 ${Math.round(gl).toLocaleString()}`, block: false })
  return checks
}

export function closePeriod(until) {
  return transaction(() => {
    need('accounting', 3)
    if (!until) fail('請選擇關帳日期')
    if (until > today()) fail('不能關未來的帳')
    const cur = getSetting('closed_until')
    if (cur && until <= cur) fail(`已經關帳到 ${cur}`)
    const blocking = closingChecks(until).filter((c) => c.block && !c.ok)
    if (blocking.length) fail('關帳檢查未通過：' + blocking.map((c) => `${c.name}（${c.detail}）`).join('、'))
    setSetting('closed_until', until, { system: true })
    notify('period_closed', { title: `已關帳至 ${until}`, lines: ['這個日期以前的帳務不能再異動'], link: '/accounting?tab=close' })
  })
}

export function reopenPeriod(until) {
  need('admin', 3)
  setSetting('closed_until', until || '', { system: true })
}
