// LINE 官方帳號 Webhook：員工加好友、選職位、輸入姓名、查詢 / 暫停通知。
// 部署：supabase functions deploy line-webhook --no-verify-jwt
import { handleLineRequest } from '../_shared/handlers.ts'
import { supabaseRepo } from '../_shared/supabaseRepo.ts'

const secret = Deno.env.get('LINE_CHANNEL_SECRET') || ''
const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') || ''

Deno.serve((req) => handleLineRequest(req, { repo: supabaseRepo(), secret, token }))
