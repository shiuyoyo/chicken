// LINE Messaging API 轉接：驗證簽章、解析 webhook 事件、轉換訊息格式、回覆 / 推播。
import type { Incoming, Out } from './bot.ts'

const API = 'https://api.line.me/v2/bot'

const b64 = (buf: ArrayBuffer) => {
  let s = ''
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b)
  return btoa(s)
}

// X-Line-Signature = base64(HMAC-SHA256(channel secret, 原始 body))
export async function verifyLineSignature(secret: string, rawBody: string, signature: string | null): Promise<boolean> {
  if (!secret || !signature) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const expected = b64(mac)
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

export interface LineEvent {
  type: string
  replyToken?: string
  source?: { type: string; userId?: string }
  message?: { type: string; text?: string }
  postback?: { data: string }
}

// 只處理一對一聊天；群組訊息忽略
export function parseLineEvent(e: LineEvent): (Incoming & { replyToken?: string }) | null {
  const uid = e.source?.type === 'user' ? e.source.userId : undefined
  if (!uid) return null
  const base = { channel: 'line' as const, externalId: uid, replyToken: e.replyToken }
  if (e.type === 'follow') return { ...base, kind: 'follow' }
  if (e.type === 'unfollow') return { ...base, kind: 'unfollow' }
  if (e.type === 'postback' && e.postback) return { ...base, kind: 'action', data: e.postback.data }
  if (e.type === 'message' && e.message?.type === 'text') return { ...base, kind: 'text', text: e.message.text || '' }
  return null
}

// 通用訊息 → LINE 訊息（按鈕用快速回覆，連結用 URI 動作）
export function toLineMessage(out: Out) {
  const items = [
    ...(out.buttons || []).map((b) => ({ type: 'action', action: { type: 'postback', label: b.label.slice(0, 20), data: b.data.slice(0, 300), displayText: b.label } })),
    ...(out.link ? [{ type: 'action', action: { type: 'uri', label: out.link.label.slice(0, 20), uri: out.link.url } }] : []),
  ].slice(0, 13)
  const text = out.link ? `${out.text}\n${out.link.url}` : out.text
  return { type: 'text', text: text.slice(0, 5000), ...(items.length ? { quickReply: { items } } : {}) }
}

async function call(token: string, path: string, body: unknown) {
  const res = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`LINE ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

export const lineReply = (token: string, replyToken: string, outs: Out[]) =>
  outs.length ? call(token, '/message/reply', { replyToken, messages: outs.slice(0, 5).map(toLineMessage) }) : Promise.resolve()

export const linePush = (token: string, to: string, out: Out) => call(token, '/message/push', { to, messages: [toLineMessage(out)] })

export async function lineProfile(token: string, userId: string): Promise<{ displayName?: string; pictureUrl?: string }> {
  const res = await fetch(`${API}/profile/${userId}`, { headers: { Authorization: `Bearer ${token}` } })
  return res.ok ? res.json() : {}
}
