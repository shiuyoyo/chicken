// 發送通知：把 notifications 表中「待發送」的訊息推播到員工綁定的 LINE / Telegram。
// ERP 每次產生通知後會呼叫這支；也可以設定排程每分鐘呼叫一次補送。
import { dispatch, makeSenders } from '../_shared/handlers.ts'
import { supabaseRepo, getSettingValue } from '../_shared/supabaseRepo.ts'

const LINE_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || ''
const TG_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || ''
const APP_URL = Deno.env.get('APP_URL') || ''

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    // 系統網址：優先用環境變數，沒有就用後台「系統設定」裡填的
    const appUrl = APP_URL || String((await getSettingValue('app_url')) || '')
    const summary = await dispatch(supabaseRepo(), makeSenders(LINE_TOKEN, TG_TOKEN), appUrl)
    return Response.json(summary, { headers: cors })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500, headers: cors })
  }
})
