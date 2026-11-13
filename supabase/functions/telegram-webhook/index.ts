// Telegram Bot Webhook：流程與 LINE 相同（/start → 選職位 → 輸入姓名）。
// 部署：supabase functions deploy telegram-webhook --no-verify-jwt
import { handleTelegramRequest } from '../_shared/handlers.ts'
import { supabaseRepo } from '../_shared/supabaseRepo.ts'

const token = Deno.env.get('TELEGRAM_BOT_TOKEN') || ''
const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') || ''

Deno.serve((req) => handleTelegramRequest(req, { repo: supabaseRepo(), token, secret }))
