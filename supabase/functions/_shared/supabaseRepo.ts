// Edge Function 用的資料存取：以 service role 直接讀寫 Supabase（不受 RLS 限制）。
import { createClient } from 'npm:@supabase/supabase-js@2'
import type { Channel, Contact, Notification, Repo } from './bot.ts'

const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20)

export function supabaseRepo(): Repo {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const must = <T>({ data, error }: { data: T; error: { message: string } | null }) => {
    if (error) throw new Error(error.message)
    return data
  }
  return {
    async getContact(channel: Channel, externalId: string) {
      return must(await sb.from('notify_contacts').select('*').eq('channel', channel).eq('external_id', externalId).maybeSingle()) as Contact | null
    },
    async saveContact(c) {
      const now = new Date().toISOString()
      const row = c.id ? { ...c, updated_at: now } : { id: newId(), created_at: now, updated_at: now, ...c }
      return must(await sb.from('notify_contacts').upsert(row).select().single()) as Contact
    },
    async listRoles() {
      return must(await sb.from('roles').select('id,name').order('created_at')) as { id: string; name: string }[]
    },
    async getUser(id) {
      return must(await sb.from('users').select('id,name,role_id').eq('id', id).maybeSingle())
    },
    // 一次把待發送的通知改成「發送中」，避免同時被兩個請求重複送出
    async claimQueued(maxAgeMinutes) {
      const since = new Date(Date.now() - maxAgeMinutes * 60000).toISOString()
      return must(await sb.from('notifications').update({ status: 'sending' }).eq('status', 'queued').gte('created_at', since).select()) as Notification[]
    },
    async contactsForUsers(userIds) {
      if (!userIds.length) return []
      return must(await sb.from('notify_contacts').select('*').in('user_id', userIds)) as Contact[]
    },
    async contactsByIds(ids) {
      if (!ids.length) return []
      return must(await sb.from('notify_contacts').select('*').in('id', ids)) as Contact[]
    },
    async updateNotification(id, patch) {
      must(await sb.from('notifications').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id))
    },
  }
}

// 讀系統設定（例如後台設定的系統網址）
export async function getSettingValue(key: string): Promise<unknown> {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data } = await sb.from('settings').select('value').eq('key', key).maybeSingle()
  return data?.value
}
