// Deno 測試：模擬 LINE / Telegram 打進 webhook，確認簽章、對話流程與對外呼叫的 API 內容。
// 執行：deno test supabase/functions/tests
import { assertEquals, assertMatch } from 'jsr:@std/assert@1'
import { handleLineRequest, handleTelegramRequest, dispatch, makeSenders } from '../_shared/handlers.ts'
import type { Contact, Notification, Repo } from '../_shared/bot.ts'

function memRepo() {
  const contacts: Contact[] = []
  const notifications: Notification[] = []
  const roles = [{ id: 'r1', name: '廠長' }, { id: 'r2', name: '現場人員' }]
  let n = 0
  const repo: Repo = {
    async getContact(ch, ext) { return contacts.find((c) => c.channel === ch && c.external_id === ext) || null },
    async saveContact(c) {
      const cur = contacts.find((x) => x.id === c.id)
      if (cur) return Object.assign(cur, c)
      const row = { id: 'c' + ++n, ...c } as Contact
      contacts.push(row)
      return row
    },
    async listRoles() { return roles },
    async getUser(id) { return { id, name: '測試員工', role_id: 'r2' } },
    async claimQueued() { const q = notifications.filter((x) => x.status === 'queued'); q.forEach((x) => (x.status = 'sending')); return q },
    async contactsForUsers(ids) { return contacts.filter((c) => c.user_id && ids.includes(c.user_id)) },
    async contactsByIds(ids) { return contacts.filter((c) => ids.includes(c.id)) },
    async updateNotification(id, patch) { Object.assign(notifications.find((x) => x.id === id)!, patch) },
  }
  return { repo, contacts, notifications }
}

// 攔截對外 HTTP 呼叫
function mockFetch() {
  const calls: { url: string; body: any }[] = []
  const orig = globalThis.fetch
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null })
    if (String(url).includes('/profile/')) return Response.json({ displayName: '小明', pictureUrl: 'https://p/1.jpg' })
    return Response.json({})
  }) as typeof fetch
  return { calls, restore: () => (globalThis.fetch = orig) }
}

async function sign(secret: string, body: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))))
}
async function lineReq(secret: string, events: unknown[], badSig = false) {
  const body = JSON.stringify({ events })
  return new Request('https://x/line-webhook', { method: 'POST', body, headers: { 'x-line-signature': badSig ? 'nope' : await sign(secret, body) } })
}
const user = { type: 'user', userId: 'U123' }

Deno.test('LINE：簽章錯誤回 401', async () => {
  const { repo } = memRepo()
  const res = await handleLineRequest(await lineReq('s', [], true), { repo, secret: 's', token: 't' })
  assertEquals(res.status, 401)
})

Deno.test('LINE：加好友 → 選職位 → 輸入姓名，回覆內容與 API 呼叫正確', async () => {
  const { repo, contacts } = memRepo()
  const f = mockFetch()
  try {
    const d = { repo, secret: 's', token: 'TOKEN' }
    await handleLineRequest(await lineReq('s', [{ type: 'follow', replyToken: 'rt1', source: user }]), d)
    const reply1 = f.calls.find((c) => c.url.endsWith('/message/reply'))!
    assertEquals(reply1.body.replyToken, 'rt1')
    assertMatch(reply1.body.messages[0].text, /請選擇你在公司的職位/)
    assertEquals(reply1.body.messages[0].quickReply.items.map((i: any) => i.action.label), ['廠長', '現場人員'])
    assertEquals(contacts[0].display_name, '小明') // 從 LINE 個人資料抓到的名稱

    await handleLineRequest(await lineReq('s', [{ type: 'postback', replyToken: 'rt2', postback: { data: 'role:r2' }, source: user }]), d)
    await handleLineRequest(await lineReq('s', [{ type: 'message', replyToken: 'rt3', message: { type: 'text', text: '王小明' }, source: user }]), d)
    const last = f.calls.filter((c) => c.url.endsWith('/message/reply')).at(-1)!
    assertMatch(last.body.messages[0].text, /已送出申請/)
    assertEquals(contacts[0].status, 'pending')
    assertEquals(contacts[0].requested_role_id, 'r2')
    assertEquals(contacts[0].requested_name, '王小明')
  } finally {
    f.restore()
  }
})

Deno.test('Telegram：secret 錯誤回 401；/start 送出選職位按鈕', async () => {
  const { repo } = memRepo()
  const f = mockFetch()
  try {
    const bad = await handleTelegramRequest(new Request('https://x', { method: 'POST', body: '{}' }), { repo, token: 'T', secret: 'abc' })
    assertEquals(bad.status, 401)
    const req = new Request('https://x', { method: 'POST', body: JSON.stringify({ message: { chat: { id: 9, type: 'private' }, text: '/start', from: { first_name: 'Amy' } } }), headers: { 'x-telegram-bot-api-secret-token': 'abc' } })
    await handleTelegramRequest(req, { repo, token: 'T', secret: 'abc' })
    const send = f.calls.find((c) => c.url.includes('/botT/sendMessage'))!
    assertEquals(send.body.chat_id, '9')
    assertEquals(send.body.reply_markup.inline_keyboard[0][0].callback_data, 'role:r1')
  } finally {
    f.restore()
  }
})

Deno.test('發送：已綁定的人用 LINE push 收到，暫停的人不收', async () => {
  const { repo, contacts, notifications } = memRepo()
  contacts.push({ id: 'a', channel: 'line', external_id: 'U-a', status: 'approved', user_id: 'u1' }, { id: 'b', channel: 'line', external_id: 'U-b', status: 'approved', user_id: 'u2', muted: true })
  notifications.push({ id: 'n1', event: 'wo_created', title: '新工單', body: '三杯雞 50 包', link: '/production', user_ids: ['u1', 'u2'], status: 'queued' })
  const f = mockFetch()
  try {
    const r = await dispatch(repo, makeSenders('TOKEN', ''), 'https://erp.example.com/')
    assertEquals(r, { notifications: 1, sent: 1, failed: 0 })
    const push = f.calls.filter((c) => c.url.endsWith('/message/push'))
    assertEquals(push.length, 1)
    assertEquals(push[0].body.to, 'U-a')
    assertMatch(push[0].body.messages[0].text, /新工單\n三杯雞 50 包\nhttps:\/\/erp\.example\.com\/#\/production/)
    assertEquals(notifications[0].status, 'sent')
  } finally {
    f.restore()
  }
})
