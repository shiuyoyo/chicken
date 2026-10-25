// Webhook 與發送的處理流程（不含 Deno.serve），方便測試。
import { handleIncoming, dispatch, type Repo, type Sender } from './bot.ts'
import { verifyLineSignature, parseLineEvent, lineReply, lineProfile, linePush, type LineEvent } from './line.ts'
import { parseTelegramUpdate, telegramSend, telegramAnswerCallback, type TgUpdate } from './telegram.ts'

export async function handleLineRequest(req: Request, d: { repo: Repo; secret: string; token: string }): Promise<Response> {
  if (req.method !== 'POST') return new Response('ok')
  const raw = await req.text()
  if (!(await verifyLineSignature(d.secret, raw, req.headers.get('x-line-signature')))) return new Response('bad signature', { status: 401 })
  const { events = [] } = JSON.parse(raw) as { events: LineEvent[] }
  for (const e of events) {
    const ev = parseLineEvent(e)
    if (!ev) continue
    try {
      // 第一次互動時抓 LINE 顯示名稱與頭像，方便管理員辨認
      if (ev.kind !== 'unfollow' && !(await d.repo.getContact('line', ev.externalId))?.display_name) {
        const p = await lineProfile(d.token, ev.externalId)
        Object.assign(ev, { displayName: p.displayName, pictureUrl: p.pictureUrl })
      }
      const outs = await handleIncoming(d.repo, ev)
      if (ev.replyToken) await lineReply(d.token, ev.replyToken, outs)
    } catch (err) {
      console.error('line-webhook', err)
    }
  }
  // LINE 要求一律回 200
  return new Response('ok')
}

export async function handleTelegramRequest(req: Request, d: { repo: Repo; token: string; secret: string }): Promise<Response> {
  if (req.method !== 'POST') return new Response('ok')
  if (!d.secret || req.headers.get('x-telegram-bot-api-secret-token') !== d.secret) return new Response('forbidden', { status: 401 })
  const ev = parseTelegramUpdate((await req.json()) as TgUpdate)
  if (ev) {
    try {
      const outs = await handleIncoming(d.repo, ev)
      if (ev.callbackId) await telegramAnswerCallback(d.token, ev.callbackId)
      for (const o of outs) await telegramSend(d.token, ev.externalId, o)
    } catch (err) {
      console.error('telegram-webhook', err)
    }
  }
  return new Response('ok')
}

export function makeSenders(lineToken: string, tgToken: string) {
  const senders: Partial<Record<'line' | 'telegram', Sender>> = {}
  if (lineToken) senders.line = (to, out) => linePush(lineToken, to, out)
  if (tgToken) senders.telegram = (to, out) => telegramSend(tgToken, to, out)
  return senders
}

export { dispatch }
