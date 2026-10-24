// 核心：日期工具、系統設定、權限、簽核、會計傳票與關帳檢查。
import { all, get, where, insert, update, findBy, nextNo, nowISO, currentUser, transaction } from '../db/store'

// ---------- 小工具 ----------
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const today = () => ymd(new Date())
export const addDays = (d, n) => {
  const x = new Date(String(d).slice(0, 10) + 'T00:00:00')
  x.setDate(x.getDate() + Number(n || 0))
  return ymd(x)
}
export const daysBetween = (a, b) => Math.round((new Date(String(b).slice(0, 10)) - new Date(String(a).slice(0, 10))) / 86400000)
export const round = (n, d = 2) => Math.round((Number(n) || 0) * 10 ** d) / 10 ** d
export const sum = (arr, fn = (x) => x) => arr.reduce((s, x) => s + (Number(fn(x)) || 0), 0)
export const userName = () => currentUser()?.name || '系統'

export class RuleError extends Error {}
export const fail = (msg) => {
  throw new RuleError(msg)
}

// ---------- 系統設定 ----------
export const SETTING_DEFAULTS = {
  company_name: '示範雞肉食品廠',
  tax_rate: 0.05,
  po_approval_amount: 50000, // 採購單超過此金額需核准
  adjust_approval_amount: 3000, // 庫存調整 / 盤差金額超過需核准
  receive_tolerance: 0.1, // 進貨可超收比例
  issue_tolerance: 0.2, // 領料可超過配方需求比例
  expiry_warn_days: 30, // 效期預警天數
  return_needs_approval: true, // 銷貨退回需核准
  allow_self_approve: false, // 是否允許核准自己的申請
  pos_max_discount: 0.1, // 收銀員可給的最大折扣比例（超過要主管）
  pos_points_per: 100, // 每消費多少元得 1 點
  closed_until: '', // 已關帳到哪一天（含）
  gui_prefix: 'AB', // 發票字軌
  gui_next: 10000001, // 下一張發票號碼
  lines: [
    { name: '一號蒸煮鍋', capacity: 500 },
    { name: '二號炒鍋', capacity: 300 },
    { name: '包裝線', capacity: 1200 },
  ],
}
export const SETTING_LABELS = {
  company_name: '公司名稱',
  tax_rate: '營業稅率',
  po_approval_amount: '採購單核准門檻（元）',
  adjust_approval_amount: '庫存調整核准門檻（元）',
  receive_tolerance: '進貨可超收比例',
  issue_tolerance: '領料可超過配方比例',
  expiry_warn_days: '效期預警天數',
  return_needs_approval: '銷貨退回需核准',
  allow_self_approve: '允許核准自己的申請',
  pos_max_discount: '收銀員最大折扣比例',
  pos_points_per: '每多少元得 1 點',
  gui_prefix: '發票字軌',
  gui_next: '下一張發票號碼',
}

export function getSetting(key) {
  const row = findBy('settings', 'key', key)
  return row ? row.value : SETTING_DEFAULTS[key]
}
export function setSetting(key, value, { system = false } = {}) {
  if (!system) need('admin', 2)
  const row = findBy('settings', 'key', key)
  if (row) update('settings', row.id, { value })
  else insert('settings', { key, value })
}
export const taxRate = () => Number(getSetting('tax_rate'))

// 下一個統一發票號碼（字軌 + 8 碼）
export function nextGui() {
  const n = Number(getSetting('gui_next'))
  setSetting('gui_next', n + 1, { system: true })
  return `${getSetting('gui_prefix')}-${String(n).padStart(8, '0')}`
}

// ---------- 權限 ----------
export const MODULES = {
  dashboard: '儀表板',
  progress: '訂單進度',
  crm: '客戶關係 CRM',
  sales: '銷售',
  purchase: '採購',
  production: '生產',
  qc: '品管 QC',
  shipping: '出貨',
  wms: '倉儲 WMS',
  pos: '門市 POS',
  trace: '食品追溯',
  accounting: '會計',
  master: '品項與配方',
  admin: '使用者與權限',
  dev: '開發者',
}
export const LEVELS = ['無', '檢視', '編輯', '核准']

let systemDepth = 0
// 已被授權的內部動作（例如核准後自動執行）不再逐一檢查權限
export function asSystem(fn) {
  systemDepth++
  try {
    return fn()
  } finally {
    systemDepth--
  }
}
export const isSystem = () => systemDepth > 0

export const roleOf = (user = currentUser()) => get('roles', user?.role_id)
export const level = (mod, user = currentUser()) => Number(roleOf(user)?.perms?.[mod] || 0)
export const can = (mod, lvl = 1, user = currentUser()) => level(mod, user) >= lvl

export function need(mod, lvl = 2) {
  if (systemDepth) return
  const u = currentUser()
  if (!u) fail('請先登入')
  if (!can(mod, lvl, u)) fail(`權限不足：${u.name}（${roleOf(u)?.name || '無角色'}）沒有「${MODULES[mod]}」的${LEVELS[lvl]}權限`)
}
// 任一模組有權限即可
export function needAny(mods, lvl = 2) {
  if (systemDepth) return
  if (!mods.some((m) => can(m, lvl))) need(mods[0], lvl)
}

// ---------- 簽核 ----------
const HANDLERS = {}
export function registerApproval(type, handler) {
  HANDLERS[type] = handler
}
export const APPROVAL_TYPES = {
  po: '採購單金額',
  so: '銷售訂單（信用額度 / 低價）',
  adjust: '庫存調整',
  stocktake: '盤點差異',
  sales_return: '銷貨退回',
  pos_void: 'POS 作廢',
  qc_release: 'QC 不合格改判',
}

export function requestApproval({ type, module, ref_table, ref_id, summary, amount = 0, reason, payload }) {
  // 同一張單據只留一筆待簽
  for (const a of where('approvals', (a) => a.status === 'pending' && a.type === type && ref_id && a.ref_id === ref_id))
    update('approvals', a.id, { status: 'superseded' })
  return insert('approvals', {
    no: nextNo('approvals', 'AP'),
    type,
    module,
    ref_table,
    ref_id,
    summary,
    amount: round(amount),
    reason,
    payload: payload || null,
    status: 'pending',
    requested_by: currentUser()?.id || '',
  })
}

export const pendingApprovals = () => where('approvals', (a) => a.status === 'pending')
export const pendingFor = (ref_id) => where('approvals', (a) => a.status === 'pending' && a.ref_id === ref_id)[0]

export function canDecide(ap, user = currentUser()) {
  if (!user || !can(ap.module, 3, user)) return false
  if (ap.requested_by === user.id && !getSetting('allow_self_approve')) return false
  return true
}

export function decideApproval(id, approve, note = '') {
  return transaction(() => {
    const ap = get('approvals', id)
    if (!ap || ap.status !== 'pending') fail('這筆簽核已處理過')
    need(ap.module, 3)
    if (ap.requested_by === currentUser()?.id && !getSetting('allow_self_approve')) fail('申請人不能核准自己的申請，請由其他主管處理')
    if (!approve && !note) fail('退回時請填寫原因')
    const h = HANDLERS[ap.type]
    asSystem(() => (approve ? h?.approve?.(ap) : h?.reject?.(ap, note)))
    update('approvals', id, { status: approve ? 'approved' : 'rejected', decided_by: currentUser()?.id, decided_at: nowISO(), decision_note: note })
  })
}

// ---------- 會計 ----------
export const ACCOUNTS = {
  1100: '現金及銀行存款',
  1130: '刷卡 / 行動支付待撥款',
  1200: '應收帳款',
  1300: '原料及包材存貨',
  1310: '成品存貨',
  1320: '在製品',
  1400: '進項稅額',
  2100: '應付帳款',
  2200: '銷項稅額',
  3100: '業主資本',
  4100: '銷貨收入',
  4110: '銷貨退回',
  5100: '銷貨成本',
  5200: '生產損耗及報廢',
  6100: '薪資費用',
  6200: '水電瓦斯',
  6300: '運費',
  6400: '租金',
  6900: '其他費用',
  6950: '現金短溢',
  7100: '其他收入',
}
export const accountType = (code) => ({ 1: '資產', 2: '負債', 3: '權益', 4: '收入', 5: '成本', 6: '費用', 7: '收入' })[String(code)[0]]

// 關帳：已關帳期間不能再產生任何會計影響
export function assertOpen(date = today()) {
  const closed = getSetting('closed_until')
  if (closed && String(date).slice(0, 10) <= closed) fail(`${String(date).slice(0, 10)} 屬於已關帳期間（關帳至 ${closed}），不能再異動`)
}

export function postJournal({ date = today(), memo, lines, ref_type, ref_id }) {
  assertOpen(date)
  const clean = lines
    .map((l) => ({ account: Number(l.account), debit: round(l.debit), credit: round(l.credit) }))
    .filter((l) => l.debit || l.credit)
  if (!clean.length) return null
  const d = round(sum(clean, (l) => l.debit))
  const c = round(sum(clean, (l) => l.credit))
  if (d !== c) fail(`傳票借貸不平衡（借 ${d} / 貸 ${c}）`)
  for (const l of clean) if (!ACCOUNTS[l.account]) fail(`科目 ${l.account} 不存在`)
  return insert('journal', { no: nextNo('journal', 'JV', date), date, memo, lines: clean, ref_type, ref_id })
}

// 反轉某單據產生的所有傳票（作廢用）
export function reverseJournals(ref_type, ref_id, memo, date = today()) {
  for (const j of where('journal', (j) => j.ref_type === ref_type && j.ref_id === ref_id && !j.memo?.startsWith('沖銷')))
    postJournal({ date, memo: `沖銷 ${j.no} ${memo || j.memo}`, lines: j.lines.map((l) => ({ account: l.account, debit: l.credit, credit: l.debit })), ref_type, ref_id })
}

export function balances(from, to) {
  const b = {}
  for (const j of all('journal')) {
    if ((from && j.date < from) || (to && j.date > to)) continue
    for (const l of j.lines) {
      b[l.account] ||= { debit: 0, credit: 0 }
      b[l.account].debit += l.debit || 0
      b[l.account].credit += l.credit || 0
    }
  }
  return b
}
export const accountBalance = (code, from, to) => {
  const b = balances(from, to)[code]
  return b ? round(b.debit - b.credit) : 0
}

export const docTotal = (lines = []) => round(sum(lines, (l) => Number(l.qty || 0) * Number(l.price || 0)))
