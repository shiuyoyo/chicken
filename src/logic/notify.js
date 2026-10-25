// 通知：資料異動時產生通知（寫進 notifications 待發送），由 Supabase Edge Function 推播到 LINE / Telegram。
// 收件人在這裡就決定好（依角色、權限、負責業務），發送端只負責送。
import { all, get, where, insert, update, findBy, nowISO, currentUser, transaction, uid } from '../db/store'
import { fail, need, can, getSetting, setSetting } from './core'
import { handleIncoming, formatNotification } from '../../supabase/functions/_shared/bot.ts'

export const CHANNELS = { line: 'LINE', telegram: 'Telegram' }

// 事件清單：預設通知哪些角色（用角色名稱比對，管理員可以在通知規則改）
export const NOTIFY_EVENTS = {
  approval_requested: { label: '有單據等你核准', who: '該模組有「核准」權限的人', fixed: true },
  approval_decided: { label: '你送出的申請有結果', who: '申請人', fixed: true },
  order_created: { label: '新訂單成立', roles: ['管理者', '業務主管', '廠長'], owner: true },
  requisition_created: { label: '新的請購單', roles: ['採購'] },
  po_received: { label: '進貨入庫', roles: ['採購', '廠長'] },
  iqc_needed: { label: '進料等待檢驗', roles: ['品管'] },
  wo_created: { label: '新的生產工單', roles: ['廠長', '現場人員'] },
  output_pending_qc: { label: '成品等待 QC', roles: ['品管'] },
  qc_failed: { label: 'QC 判定不合格', roles: ['管理者', '廠長', '品管'] },
  shipped: { label: '已出貨', roles: ['業務主管'], owner: true },
  payment_received: { label: '收到貨款', roles: ['管理者', '會計'], owner: true },
  low_stock: { label: '原料低於安全庫存', roles: ['採購', '廠長'] },
  pos_closed: { label: '門市日結', roles: ['管理者', '店長'] },
  period_closed: { label: '月結關帳', roles: ['管理者', '會計'] },
}

const roleIdsByName = (names = []) => all('roles').filter((r) => names.includes(r.name)).map((r) => r.id)

export function getRule(event) {
  const saved = (getSetting('notify_rules') || {})[event]
  const def = NOTIFY_EVENTS[event]
  return saved || { enabled: true, role_ids: roleIdsByName(def?.roles), owner: !!def?.owner }
}
export function saveRules(rules) {
  need('admin', 2)
  setSetting('notify_rules', rules)
}

const activeUsers = () => all('users').filter((u) => u.active !== false)

// 決定收件人（不通知做這個動作的人自己）
export function resolveRecipients(event, { module, userIds = [], ownerId } = {}) {
  const rule = getRule(event)
  if (!rule.enabled) return []
  const ids = new Set(userIds)
  if (event === 'approval_requested') for (const u of activeUsers()) if (can(module, 3, u)) ids.add(u.id)
  for (const u of activeUsers()) if (rule.role_ids?.includes(u.role_id)) ids.add(u.id)
  if (rule.owner && ownerId) ids.add(ownerId)
  const me = currentUser()?.id
  if (me && event !== 'approval_decided') ids.delete(me)
  return [...ids].filter((id) => get('users', id)?.active !== false)
}

// 產生一則通知；lines 是內容的每一行，link 是系統內的路徑（例如 /approvals）
export function notify(event, { title, lines = [], link = '', module, userIds, ownerId } = {}) {
  const user_ids = resolveRecipients(event, { module, userIds, ownerId })
  if (!user_ids.length) return null
  return insert('notifications', { event, title, body: lines.filter(Boolean).join('\n'), link, user_ids, contact_ids: [], status: 'queued', results: [] })
}

// 直接傳給某個 LINE / Telegram 聯絡人（例如綁定結果）
function notifyContact(contact, title, lines, link = '') {
  return insert('notifications', { event: 'contact', title, body: lines.filter(Boolean).join('\n'), link, user_ids: [], contact_ids: [contact.id], status: 'queued', results: [] })
}

export const eventsForUser = (user) =>
  Object.entries(NOTIFY_EVENTS)
    .filter(([e, d]) => {
      if (d.fixed) return e === 'approval_decided' || Object.keys(user ? get('roles', user.role_id)?.perms || {} : {}).some((m) => can(m, 3, user))
      const r = getRule(e)
      // 「負責業務」只有真的負責某位客戶的人才算
      return r.enabled && (r.role_ids?.includes(user?.role_id) || (r.owner && !!user?.id && all('customers').some((c) => c.owner_id === user.id)))
    })
    .map(([, d]) => d.label)

// ---------- 綁定管理 ----------
export const contactsOf = (userId) => where('notify_contacts', (c) => c.user_id === userId && c.status === 'approved')
export const pendingContacts = () => where('notify_contacts', (c) => c.status === 'pending')

// 管理員確定職位：綁定到既有員工，或用申請資料建立新員工
export function approveContact(id, { user_id, role_id, create_user } = {}) {
  return transaction(() => {
    need('admin', 2)
    const c = get('notify_contacts', id)
    if (!c) fail('找不到這筆申請')
    role_id ||= c.requested_role_id
    if (!get('roles', role_id)) fail('請選擇職位')
    let user = get('users', user_id)
    let pin = ''
    if (create_user) {
      const name = String(create_user.name || c.requested_name || c.display_name || '').trim()
      if (!name) fail('請輸入姓名')
      if (findBy('users', 'name', name)) fail(`已經有叫「${name}」的員工，請改用「綁定既有員工」`)
      pin = String(Math.floor(1000 + Math.random() * 9000))
      user = insert('users', { name, role_id, pin, active: true })
    }
    if (!user) fail('請選擇要綁定的員工')
    if (user.role_id !== role_id) update('users', user.id, { role_id })
    const other = where('notify_contacts', (x) => x.user_id === user.id && x.channel === c.channel && x.id !== id && x.status === 'approved')
    for (const o of other) update('notify_contacts', o.id, { status: 'replaced', user_id: '' })
    const saved = update('notify_contacts', id, { status: 'approved', state: 'done', user_id: user.id, approved_by: currentUser()?.id, approved_at: nowISO() })
    const role = get('roles', role_id)?.name
    const events = eventsForUser({ ...user, role_id })
    notifyContact(saved, '管理員已確認你的職位 ✅', [`姓名：${user.name}`, `職位：${role}`, events.length ? `之後會收到：${events.join('、')}` : '', '輸入「暫停通知」可以暫停'], '/')
    return { contact: saved, user: get('users', user.id), pin }
  })
}

export function rejectContact(id, reason = '') {
  return transaction(() => {
    need('admin', 2)
    const c = update('notify_contacts', id, { status: 'rejected', note: reason })
    notifyContact(c, '你的職位申請沒有通過', [reason && `原因：${reason}`, '可以輸入「重新申請」再試一次'])
  })
}

export function unlinkContact(id) {
  need('admin', 2)
  update('notify_contacts', id, { status: 'rejected', user_id: '', note: '管理員解除綁定' })
}

export function setContactMuted(id, muted) {
  need('admin', 2)
  update('notify_contacts', id, { muted })
}

export function sendTest(userId) {
  need('admin', 2)
  if (!contactsOf(userId).length) fail('這位員工還沒有綁定 LINE / Telegram')
  return insert('notifications', { event: 'test', title: '測試通知', body: '如果你看到這則訊息，代表通知設定成功 👍', link: '/', user_ids: [userId], contact_ids: [], status: 'queued', results: [] })
}

// 某個聯絡人「會收到」的通知（模擬器與後台預覽用）
export function notificationsForContact(c) {
  return all('notifications').filter((n) => (n.contact_ids || []).includes(c.id) || (c.user_id && c.status === 'approved' && (n.user_ids || []).includes(c.user_id) && n.created_at >= (c.approved_at || '')))
}

// ---------- 模擬器：在瀏覽器裡用同一套機器人流程 ----------
const localRepo = {
  async getContact(channel, externalId) {
    return where('notify_contacts', (c) => c.channel === channel && c.external_id === externalId)[0] || null
  },
  async saveContact(c) {
    return c.id ? update('notify_contacts', c.id, c) : insert('notify_contacts', c)
  },
  async listRoles() {
    return all('roles').map((r) => ({ id: r.id, name: r.name }))
  },
  async getUser(id) {
    return get('users', id) || null
  },
}
export const simulateIncoming = (ev) => handleIncoming(localRepo, ev)
export const newSimId = (channel) => `sim-${channel}-${uid().slice(0, 8)}`

// 預覽用：轉成訊息格式（連結用後台設定的系統網址，沒設定就用目前網址）
const previewBase = () => getSetting('app_url') || (globalThis.location ? globalThis.location.href.replace(/#.*$/, '') : '')
export const formatOut = (n) => formatNotification(n, previewBase())
export const formatNotificationPreview = (n) => formatOut(n).text
