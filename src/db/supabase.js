// Supabase 後端：登入後一次載入所有資料表，之後每個動作的異動整批送到資料庫函式 erp_apply，
// 在同一個資料庫交易裡套用（伺服器端會再檢查權限、傳票平衡、關帳、庫存不足、簽核）。
import { createClient } from '@supabase/supabase-js'
import { SCHEMA } from './schema'

const CFG_KEY = 'food-erp:supabase'
const PAGE = 1000 // Supabase 每次最多回傳 1000 筆

export function supabaseConfig() {
  const envUrl = import.meta.env?.VITE_SUPABASE_URL
  const envKey = import.meta.env?.VITE_SUPABASE_ANON_KEY
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

// 同一組設定只建立一個連線（登入狀態共用）
let client = null
let clientKey = ''
export function supabaseClient(cfg = supabaseConfig(), create = createClient) {
  if (!cfg) return null
  const k = cfg.url + '|' + cfg.key
  if (!client || clientKey !== k) {
    // pkce：登入 / 重設密碼的回傳參數放在 ?code=，不會跟系統的 #/ 網址衝突
    client = create(cfg.url, cfg.key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
    clientKey = k
  }
  return client
}

// 只送資料表有的欄位；空字串改成 null（日期、數字欄位才不會出錯）
export function toDbRow(table, row) {
  const cols = SCHEMA[table].cols
  const out = { id: row.id, created_at: row.created_at, updated_at: row.updated_at }
  for (const c of Object.keys(cols)) if (c in row) out[c] = row[c] === '' ? null : row[c]
  return out
}

// 資料庫錯誤訊息轉成看得懂的中文
export function friendlyError(msg = '') {
  const m = String(msg)
  const rls = m.match(/row-level security policy for table "(\w+)"/)
  if (rls) return `沒有權限修改「${SCHEMA[rls[1]]?.label || rls[1]}」，這次的變更沒有存到雲端`
  const denied = m.match(/沒有權限修改「(\w+)」/)
  if (denied) return `沒有權限修改「${SCHEMA[denied[1]]?.label || denied[1]}」，這次的變更沒有存到雲端`
  // 資料庫觸發器的中文訊息直接顯示（去掉 PostgreSQL 附加的說明）
  const first = m.split('\n')[0].replace(/^ERROR:\s*/, '')
  if (/[\u4e00-\u9fff]/.test(first)) return first
  if (/JWT expired|Invalid JWT|not authenticated/i.test(m)) return '登入已過期，請重新登入'
  if (/Failed to fetch|NetworkError|network/i.test(m)) return '連不上雲端資料庫，請檢查網路'
  return m
}

export function supabaseBackend(cfg, { sb = supabaseClient(cfg), onRejected } = {}) {
  let kickTimer = null
  const kickDispatch = () => {
    clearTimeout(kickTimer)
    kickTimer = setTimeout(() => {
      sb.functions.invoke('notify-dispatch', { body: {} }).then(({ error }) => error && console.warn('通知發送函式尚未部署或失敗：', error.message))
    }, 800)
  }
  // 寫入依序送出，前一批完成才送下一批，順序不會亂
  let chain = Promise.resolve()
  const send = (ops) => {
    chain = chain.then(async () => {
      const payload = ops.map(({ t, op, row }) => ({ t, op, row: op === 'delete' ? { id: row.id } : toDbRow(t, row) }))
      const { error } = await sb.rpc('erp_apply', { ops: payload })
      if (error) {
        console.error(error)
        const detail = friendlyError(error.message)
        globalThis.dispatchEvent?.(new CustomEvent('erp:backend-error', { detail: detail + '（已重新載入雲端資料）' }))
        onRejected?.(detail)
        return
      }
      if (ops.some((o) => o.t === 'notifications' && o.op === 'insert' && o.row.status === 'queued')) kickDispatch()
    })
    return chain
  }
  return {
    kind: 'supabase',
    name: 'Supabase 雲端資料庫',
    sb,
    async loadAll(tables) {
      const data = {}
      for (const t of tables) {
        const rows = []
        for (let from = 0; ; from += PAGE) {
          const { data: page, error } = await sb.from(t).select('*').order('id').range(from, from + PAGE - 1)
          if (error) throw new Error(`讀取 ${SCHEMA[t]?.label || t} 失敗：${friendlyError(error.message)}`)
          rows.push(...page)
          if (page.length < PAGE) break
        }
        data[t] = rows
      }
      return data
    },
    saveBatch(ops) {
      return send(ops)
    },
    save(t, op, row) {
      return send([{ t, op, row }])
    },
    // 等所有寫入都送完（例如登出前）
    flushed: () => chain,
    // 整份覆蓋（第一次上傳、還原備份）：只有系統擁有者可以
    async replaceAll(all) {
      await chain
      for (const t of Object.keys(SCHEMA)) {
        const rows = (all[t] || []).map((r) => toDbRow(t, r))
        for (let i = 0; i === 0 || i < rows.length; i += 500) {
          const { error } = await sb.rpc('erp_restore', { t, rows: rows.slice(i, i + 500), wipe: i === 0 })
          if (error) throw new Error(`上傳 ${SCHEMA[t].label} 失敗：${friendlyError(error.message)}`)
        }
      }
    },
  }
}
