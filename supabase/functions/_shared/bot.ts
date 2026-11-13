// 通知機器人核心：與通訊軟體無關的對話流程與發送邏輯。
// LINE、Telegram 的 Edge Function 與網頁上的「模擬器」都用這一份，行為才會一致。
//
// 員工加入官方帳號 → 選職位 → 輸入姓名 → 狀態「待確認」
// 管理員在 ERP 後台按「確定」綁定到員工帳號 → 之後相關的資料異動會推播給他。

export type Channel = 'line' | 'telegram'

export interface Contact {
  id: string
  channel: Channel
  external_id: string
  display_name?: string
  picture_url?: string
  state?: string // ask_role | ask_name | done
  status: string // new | pending | approved | rejected | blocked
  requested_role_id?: string
  requested_name?: string
  user_id?: string
  muted?: boolean
}

export interface Notification {
  id: string
  event: string
  title: string
  body?: string
  link?: string
  user_ids?: string[]
  contact_ids?: string[]
  status: string
  created_at?: string
}

export type Incoming =
  | { kind: 'follow'; channel: Channel; externalId: string; displayName?: string; pictureUrl?: string }
  | { kind: 'unfollow'; channel: Channel; externalId: string }
  | { kind: 'text'; channel: Channel; externalId: string; text: string; displayName?: string; pictureUrl?: string }
  | { kind: 'action'; channel: Channel; externalId: string; data: string; displayName?: string }

// 與通訊軟體無關的回覆格式；各管道再轉成自己的格式（LINE 快速回覆、Telegram 按鈕）
export interface Out {
  text: string
  buttons?: { label: string; data: string }[]
  link?: { label: string; url: string }
}

export interface Repo {
  getContact(channel: Channel, externalId: string): Promise<Contact | null>
  saveContact(c: Partial<Contact> & { channel: Channel; external_id: string }): Promise<Contact>
  listRoles(): Promise<{ id: string; name: string }[]>
  getUser(id: string): Promise<{ id: string; name: string; role_id: string } | null>
  // 發送用
  claimQueued(maxAgeMinutes: number): Promise<Notification[]>
  contactsForUsers(userIds: string[]): Promise<Contact[]>
  contactsByIds(ids: string[]): Promise<Contact[]>
  updateNotification(id: string, patch: Record<string, unknown>): Promise<void>
}

export const COMMANDS = {
  setup: ['設定職位', '重新設定', '重新申請', '/start', 'start'],
  me: ['我的職位', '/me'],
  mute: ['暫停通知', '/mute'],
  unmute: ['恢復通知', '開啟通知', '/unmute'],
  help: ['說明', '幫助', 'help', '/help'],
}
const isCmd = (text: string, k: keyof typeof COMMANDS) => COMMANDS[k].some((c) => text.trim().toLowerCase() === c.toLowerCase())

const HELP: Out = {
  text: '可以輸入：\n・我的職位：查看綁定狀態\n・暫停通知 / 恢復通知\n・重新設定：重新選擇職位',
  buttons: [
    { label: '我的職位', data: 'cmd:me' },
    { label: '暫停通知', data: 'cmd:mute' },
    { label: '恢復通知', data: 'cmd:unmute' },
  ],
}

async function askRole(repo: Repo, greeting: string): Promise<Out> {
  const roles = await repo.listRoles()
  return {
    text: `${greeting}請選擇你在公司的職位：`,
    // LINE 快速回覆最多 13 個
    buttons: roles.slice(0, 13).map((r) => ({ label: r.name.slice(0, 20), data: `role:${r.id}` })),
  }
}

async function statusText(repo: Repo, c: Contact): Promise<Out> {
  const roles = await repo.listRoles()
  const role = roles.find((r) => r.id === c.requested_role_id)?.name || '未選擇'
  if (c.status === 'approved') {
    const u = c.user_id ? await repo.getUser(c.user_id) : null
    const ur = roles.find((r) => r.id === u?.role_id)?.name || role
    return { text: `✅ 已綁定：${u?.name || c.requested_name}（${ur}）\n通知：${c.muted ? '已暫停' : '開啟中'}`, buttons: HELP.buttons }
  }
  if (c.status === 'pending') return { text: `⏳ 等待管理員確認\n姓名：${c.requested_name}\n職位：${role}`, buttons: [{ label: '重新設定', data: 'cmd:setup' }] }
  if (c.status === 'rejected') return { text: '管理員沒有通過你的申請，請洽管理員，或重新申請。', buttons: [{ label: '重新申請', data: 'cmd:setup' }] }
  return askRole(repo, '')
}

export async function handleIncoming(repo: Repo, ev: Incoming): Promise<Out[]> {
  const key = { channel: ev.channel, external_id: ev.externalId }
  if (ev.kind === 'unfollow') {
    const c = await repo.getContact(ev.channel, ev.externalId)
    if (c) await repo.saveContact({ ...key, id: c.id, status: 'blocked' })
    return []
  }
  const profile: Partial<Contact> = {}
  if ('displayName' in ev && ev.displayName) profile.display_name = ev.displayName
  if ('pictureUrl' in ev && ev.pictureUrl) profile.picture_url = ev.pictureUrl

  let c = await repo.getContact(ev.channel, ev.externalId)
  if (!c) c = await repo.saveContact({ ...key, ...profile, status: 'new', state: 'ask_role' })
  else if (c.status === 'blocked') c = await repo.saveContact({ ...key, id: c.id, ...profile, status: c.user_id ? 'approved' : 'new', state: c.user_id ? 'done' : 'ask_role' })
  else if (Object.keys(profile).length) c = await repo.saveContact({ ...key, id: c.id, ...profile })

  // 把按鈕指令與文字指令統一
  let text = ev.kind === 'text' ? ev.text.trim() : ''
  let data = ev.kind === 'action' ? ev.data : ''
  if (data.startsWith('cmd:')) {
    text = { setup: '設定職位', me: '我的職位', mute: '暫停通知', unmute: '恢復通知', help: '說明' }[data.slice(4)] || ''
    data = ''
  }

  if (ev.kind === 'follow') {
    if (c.status === 'approved') return [{ text: '歡迎回來！你的通知已恢復。' }, await statusText(repo, c)]
    await repo.saveContact({ ...key, id: c.id, state: 'ask_role' })
    return [await askRole(repo, '歡迎加入公司通知帳號！\n')]
  }

  if (isCmd(text, 'setup')) {
    await repo.saveContact({ ...key, id: c.id, state: 'ask_role' })
    return [await askRole(repo, '')]
  }
  if (isCmd(text, 'me')) return [await statusText(repo, c)]
  if (isCmd(text, 'help')) return [HELP]
  if (isCmd(text, 'mute') || isCmd(text, 'unmute')) {
    if (c.status !== 'approved') return [await statusText(repo, c)]
    const muted = isCmd(text, 'mute')
    await repo.saveContact({ ...key, id: c.id, muted })
    return [{ text: muted ? '🔕 已暫停通知。輸入「恢復通知」可以再開啟。' : '🔔 已恢復通知。' }]
  }

  // 選職位
  if (data.startsWith('role:') && c.state === 'ask_role') {
    const roles = await repo.listRoles()
    const role = roles.find((r) => r.id === data.slice(5))
    if (!role) return [await askRole(repo, '找不到這個職位，')]
    await repo.saveContact({ ...key, id: c.id, requested_role_id: role.id, state: 'ask_name' })
    const name = c.display_name
    return [{ text: `職位：${role.name}\n請輸入你的姓名（跟公司登記的一樣，方便管理員確認）`, buttons: name ? [{ label: `用「${name.slice(0, 14)}」`, data: `name:${name}` }] : undefined }]
  }
  // 文字也可以直接打職位名稱
  if (c.state === 'ask_role' && text) {
    const role = (await repo.listRoles()).find((r) => r.name === text)
    if (role) return handleIncoming(repo, { kind: 'action', channel: ev.channel, externalId: ev.externalId, data: `role:${role.id}` })
    return [await askRole(repo, '請用下面的按鈕選擇，')]
  }
  // 輸入姓名
  if (c.state === 'ask_name' && (text || data.startsWith('name:'))) {
    const name = (data.startsWith('name:') ? data.slice(5) : text).slice(0, 30)
    const saved = await repo.saveContact({ ...key, id: c.id, requested_name: name, status: 'pending', state: 'done' })
    const role = (await repo.listRoles()).find((r) => r.id === saved.requested_role_id)?.name
    return [{ text: `已送出申請 📝\n姓名：${name}\n職位：${role}\n\n管理員在後台確認後，就會開始收到相關通知。`, buttons: [{ label: '重新設定', data: 'cmd:setup' }] }]
  }

  if (c.status === 'approved') return [HELP]
  return [await statusText(repo, c)]
}

// ---------- 發送 ----------
export function formatNotification(n: Notification, appUrl = ''): Out {
  const out: Out = { text: `🔔 ${n.title}${n.body ? '\n' + n.body : ''}` }
  if (n.link && appUrl) {
    const base = appUrl.replace(/#.*$/, '')
    out.link = { label: '開啟系統', url: (/(\/|\.html?)$/.test(base) ? base : base + '/') + '#' + n.link }
  }
  return out
}

export type Sender = (externalId: string, out: Out) => Promise<void>

// 取出待發送的通知，依收件人綁定的管道送出，並記錄結果
export async function dispatch(repo: Repo, senders: Partial<Record<Channel, Sender>>, appUrl = '', maxAgeMinutes = 24 * 60) {
  const list = await repo.claimQueued(maxAgeMinutes)
  const summary = { notifications: list.length, sent: 0, failed: 0 }
  for (const n of list) {
    const contacts = n.contact_ids?.length
      ? await repo.contactsByIds(n.contact_ids)
      : (await repo.contactsForUsers(n.user_ids || [])).filter((c) => c.status === 'approved' && !c.muted)
    const results: { contact_id: string; channel: Channel; ok: boolean; error?: string }[] = []
    const out = formatNotification(n, appUrl)
    for (const c of contacts) {
      const send = senders[c.channel]
      if (!send) {
        results.push({ contact_id: c.id, channel: c.channel, ok: false, error: `${c.channel} 尚未設定` })
        continue
      }
      try {
        await send(c.external_id, out)
        results.push({ contact_id: c.id, channel: c.channel, ok: true })
      } catch (e) {
        results.push({ contact_id: c.id, channel: c.channel, ok: false, error: String((e as Error)?.message || e).slice(0, 200) })
      }
    }
    const ok = results.filter((r) => r.ok).length
    summary.sent += ok
    summary.failed += results.length - ok
    await repo.updateNotification(n.id, {
      status: !results.length ? 'no_recipient' : ok === results.length ? 'sent' : ok ? 'partial' : 'failed',
      results,
      sent_at: new Date().toISOString(),
    })
  }
  return summary
}
