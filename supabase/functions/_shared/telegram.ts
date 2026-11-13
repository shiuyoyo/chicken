// Telegram Bot API 轉接：解析 update、轉換訊息格式、發送。
import type { Incoming, Out } from './bot.ts'

export interface TgUpdate {
  message?: { chat: { id: number; type: string }; from?: { first_name?: string; last_name?: string; username?: string }; text?: string }
  callback_query?: { id: string; data?: string; from: { first_name?: string; last_name?: string }; message?: { chat: { id: number; type: string } } }
  my_chat_member?: { chat: { id: number; type: string }; new_chat_member: { status: string } }
}

const fullName = (f?: { first_name?: string; last_name?: string }) => [f?.first_name, f?.last_name].filter(Boolean).join(' ') || undefined

// 只處理私訊；/start 視為加入
export function parseTelegramUpdate(u: TgUpdate): (Incoming & { callbackId?: string }) | null {
  if (u.my_chat_member && u.my_chat_member.chat.type === 'private' && u.my_chat_member.new_chat_member.status === 'kicked')
    return { kind: 'unfollow', channel: 'telegram', externalId: String(u.my_chat_member.chat.id) }
  if (u.callback_query?.message?.chat.type === 'private')
    return { kind: 'action', channel: 'telegram', externalId: String(u.callback_query.message.chat.id), data: u.callback_query.data || '', displayName: fullName(u.callback_query.from), callbackId: u.callback_query.id }
  if (u.message?.chat.type === 'private' && typeof u.message.text === 'string') {
    const base = { channel: 'telegram' as const, externalId: String(u.message.chat.id), displayName: fullName(u.message.from) }
    if (u.message.text.trim() === '/start') return { ...base, kind: 'follow' }
    return { ...base, kind: 'text', text: u.message.text }
  }
  return null
}

export function toTelegramMessage(out: Out) {
  const rows: { text: string; callback_data?: string; url?: string }[][] = []
  const btns = out.buttons || []
  for (let i = 0; i < btns.length; i += 2) rows.push(btns.slice(i, i + 2).map((b) => ({ text: b.label, callback_data: b.data.slice(0, 64) })))
  if (out.link) rows.push([{ text: out.link.label, url: out.link.url }])
  return { text: out.text.slice(0, 4096), ...(rows.length ? { reply_markup: { inline_keyboard: rows } } : {}) }
}

export async function telegramSend(token: string, chatId: string, out: Out) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, ...toTelegramMessage(out) }),
  })
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

export async function telegramAnswerCallback(token: string, id: string) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: id }) })
}
