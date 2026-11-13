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

// ---------- 離線：待上傳佇列（展場網路不穩也能繼續收銀） ----------
// 每個動作的異動先存進這台裝置的佇列，依序上傳；斷線時保留，連上後自動補傳。
// 伺服器拒絕的（例如庫存已被別台賣完）移到「上傳失敗」清單，由主管處理，不會默默消失。
const OUTBOX = 'food-erp:outbox'
const FAILED = 'food-erp:outbox-failed'
const SNAPSHOT = 'food-erp:cloud-snapshot'
const readJSON = (k, d) => {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(k) || 'null') ?? d
  } catch {
    return d
  }
}
const writeJSON = (k, v) => {
  try {
    globalThis.localStorage?.setItem(k, JSON.stringify(v))
    return true
  } catch {
    return false
  }
}
export const isNetworkError = (e) => /Failed to fetch|NetworkError|Load failed|fetch failed|network|timeout|ECONNREFUSED/i.test(String(e?.message || e || ''))
export const failedUploads = () => readJSON(FAILED, [])
// 上傳失敗清單的摘要（給畫面顯示）
export const describeBatch = (b) =>
  b.ops.map((o) => `${SCHEMA[o.t]?.label || o.t}${o.row?.no ? ' ' + o.row.no : o.row?.name ? ' ' + o.row.name : ''}`).filter((x, i, a) => a.indexOf(x) === i).join('、')

export function supabaseBackend(cfg, { sb = supabaseClient(cfg), onRejected } = {}) {
  let kickTimer = null
  const kickDispatch = () => {
    clearTimeout(kickTimer)
    kickTimer = setTimeout(() => {
      sb.functions.invoke('notify-dispatch', { body: {} }).then(({ error }) => error && console.warn('通知發送函式尚未部署或失敗：', error.message))
    }, 800)
  }
  let outbox = readJSON(OUTBOX, [])
  let offline = false
  // 每一批記下是誰做的：只用同一個人的登入身分上傳（換人登入時，前一個人的待上傳資料會等他再登入）
  let owner = null
  const mine = (b) => !b.owner || b.owner === owner
  let draining = null
  let retryTimer = null
  let snapTimer = null
  const status = () => ({ pending: outbox.filter(mine).length, others: outbox.filter((b) => !mine(b)).length, failed: failedUploads().length, offline })
  const emit = () => globalThis.dispatchEvent?.(new CustomEvent('erp:sync', { detail: status() }))
  const persist = () => {
    if (!writeJSON(OUTBOX, outbox)) globalThis.dispatchEvent?.(new CustomEvent('erp:backend-error', { detail: '這台裝置的儲存空間不足，離線資料可能無法保留，請盡快連線上傳' }))
    emit()
  }
  // 依序上傳；斷線就停下來稍後重試
  const drain = () => {
    if (draining) return draining
    // 注意：沒東西可傳時 async 函式會「同步」跑完，所以 draining 要在 promise 結束後才清掉
    draining = (async () => {
      let rejected = false
      while (owner && outbox.some(mine)) {
        const b = outbox.find(mine)
        let error
        try {
          ;({ error } = await sb.rpc('erp_apply', { ops: b.ops }))
        } catch (e) {
          error = e
        }
        // 登入憑證在離線期間過期：重新取得後再傳，不算失敗
        if (error && /JWT expired|invalid JWT|not authenticated/i.test(error.message || '')) await sb.auth.refreshSession().catch(() => {})
        if (error && (isNetworkError(error) || /JWT expired|invalid JWT|not authenticated/i.test(error.message || ''))) {
          offline = true
          emit()
          clearTimeout(retryTimer)
          retryTimer = setTimeout(drain, 10000)
          break
        }
        offline = false
        outbox = outbox.filter((x) => x.id !== b.id)
        if (error) {
          console.error(error)
          rejected = true
          const detail = friendlyError(error.message)
          writeJSON(FAILED, [...failedUploads(), { ...b, error: detail, failed_at: new Date().toISOString() }])
          globalThis.dispatchEvent?.(new CustomEvent('erp:backend-error', { detail: detail + '（已重新載入雲端資料）' }))
        } else if (b.ops.some((o) => o.t === 'notifications' && o.op === 'insert' && o.row.status === 'queued')) kickDispatch()
        persist()
      }
      if (rejected && !outbox.some(mine)) onRejected?.()
    })().finally(() => {
      draining = null
    })
    return draining
  }
  globalThis.addEventListener?.('online', () => drain())
  sb.auth?.onAuthStateChange?.((_ev, session) => {
    owner = session?.user?.id || null
    if (owner && outbox.length) drain()
  })
  const send = (ops, cache) => {
    const payload = ops.map(({ t, op, row }) => ({ t, op, row: op === 'delete' ? { id: row.id } : toDbRow(t, row) }))
    outbox = [...outbox, { id: Math.random().toString(36).slice(2), at: new Date().toISOString(), owner, ops: payload }]
    persist()
    // 畫面上的資料（含還沒上傳的）存一份在這台裝置，離線重開也看得到
    if (cache) {
      clearTimeout(snapTimer)
      snapTimer = setTimeout(() => writeJSON(SNAPSHOT, cache), 1500)
    }
    return drain()
  }
  if (outbox.length) drain()
  return {
    kind: 'supabase',
    name: 'Supabase 雲端資料庫',
    sb,
    status,
    // 沒有待上傳、沒有斷線：可以安全地重新載入雲端最新資料
    idle: () => !outbox.some(mine) && !offline && !draining,
    retryFailed() {
      outbox = [...outbox, ...failedUploads().map(({ error, failed_at, ...b }) => b)]
      writeJSON(FAILED, [])
      persist()
      return drain()
    },
    discardFailed(id) {
      writeJSON(FAILED, failedUploads().filter((b) => b.id !== id))
      emit()
    },
    async loadAll(tables) {
      // 裝置確定沒有網路（例如展場 Wi-Fi 斷了）：直接用這台裝置上次的資料，不用等連線逾時
      const snapNow = readJSON(SNAPSHOT, null)
      if (globalThis.navigator?.onLine === false && snapNow) {
        offline = true
        emit()
        return snapNow
      }
      await drain()
      const data = {}
      try {
        for (const t of tables) {
          const rows = []
          for (let from = 0; ; from += PAGE) {
            const { data: page, error } = await sb.from(t).select('*').order('created_at', { ascending: true, nullsFirst: true }).order('id').range(from, from + PAGE - 1)
            if (error) throw Object.assign(new Error(`讀取 ${SCHEMA[t]?.label || t} 失敗：${friendlyError(error.message)}`), { network: isNetworkError(error) })
            rows.push(...page)
            if (page.length < PAGE) break
          }
          data[t] = rows
        }
      } catch (e) {
        // 斷線：用這台裝置上次的資料（含還沒上傳的異動）
        const snap = readJSON(SNAPSHOT, null)
        if ((e.network || isNetworkError(e)) && snap) {
          offline = true
          emit()
          return snap
        }
        throw e
      }
      if (!outbox.some(mine)) writeJSON(SNAPSHOT, data)
      offline = false
      emit()
      return data
    },
    saveBatch(ops, cache) {
      return send(ops, cache)
    },
    save(t, op, row, cache) {
      return send([{ t, op, row }], cache)
    },
    // 等所有寫入都送完（例如登出前）
    flushed: () => drain(),
    // 整份覆蓋（第一次上傳、還原備份）：只有系統擁有者可以
    async replaceAll(all) {
      await drain()
      if (outbox.some(mine)) throw new Error('還有資料沒上傳（目前離線），請連線後再試')
      for (const t of Object.keys(SCHEMA)) {
        const rows = (all[t] || []).map((r) => toDbRow(t, r))
        for (let i = 0; i === 0 || i < rows.length; i += 500) {
          const { error } = await sb.rpc('erp_restore', { t, rows: rows.slice(i, i + 500), wipe: i === 0 })
          if (error) throw new Error(`上傳 ${SCHEMA[t].label} 失敗：${friendlyError(error.message)}`)
        }
      }
      writeJSON(SNAPSHOT, all)
    },
  }
}
