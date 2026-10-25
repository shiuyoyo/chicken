// Supabase 後端：啟動時一次載入所有資料表，之後每次寫入同步送到 Supabase。
import { createClient } from '@supabase/supabase-js'
import { SCHEMA } from './schema'

const CFG_KEY = 'food-erp:supabase'

export function supabaseConfig() {
  const envUrl = import.meta.env.VITE_SUPABASE_URL
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (envUrl && envKey) return { url: envUrl, key: envKey, from: 'env' }
  try {
    const c = JSON.parse(localStorage.getItem(CFG_KEY) || 'null')
    if (c?.url && c?.key) return { ...c, from: 'settings' }
  } catch {}
  return null
}

export function setSupabaseConfig(cfg) {
  if (cfg) localStorage.setItem(CFG_KEY, JSON.stringify(cfg))
  else localStorage.removeItem(CFG_KEY)
}

const pick = (table, row) => {
  const cols = SCHEMA[table].cols
  const out = { id: row.id, created_at: row.created_at, updated_at: row.updated_at }
  for (const c of Object.keys(cols)) if (c in row) out[c] = row[c] === '' ? null : row[c]
  return out
}

export function supabaseBackend({ url, key }) {
  const sb = createClient(url, key)
  let kickTimer = null
  const kickDispatch = () => {
    clearTimeout(kickTimer)
    kickTimer = setTimeout(() => {
      sb.functions.invoke('notify-dispatch', { body: {} }).then(({ error }) => error && console.warn('通知發送函式尚未部署或失敗：', error.message))
    }, 800)
  }
  const report = (error) => {
    if (error) {
      console.error(error)
      window.dispatchEvent(new CustomEvent('erp:backend-error', { detail: error.message }))
    }
  }
  return {
    name: 'Supabase 雲端資料庫',
    async loadAll(tables) {
      const data = {}
      for (const t of tables) {
        const { data: rows, error } = await sb.from(t).select('*').limit(10000)
        if (error) throw new Error(`讀取 ${t} 失敗：${error.message}`)
        data[t] = rows
      }
      return data
    },
    save(table, op, row) {
      const q =
        op === 'delete'
          ? sb.from(table).delete().eq('id', row.id)
          : sb.from(table).upsert(pick(table, row))
      q.then(({ error }) => {
        report(error)
        // 有新通知寫進資料庫後，請 Edge Function 推播到 LINE / Telegram（多筆合併成一次呼叫）
        if (!error && table === 'notifications' && op === 'insert' && row.status === 'queued') kickDispatch()
      })
    },
    async replaceAll(all) {
      for (const [t, rows] of Object.entries(all)) {
        if (!SCHEMA[t]) continue
        await sb.from(t).delete().neq('id', '')
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await sb.from(t).upsert(rows.slice(i, i + 500).map((r) => pick(t, r)))
          report(error)
        }
      }
    },
  }
}
