// 資料存取中心：所有頁面都透過這裡讀寫。
// 讀取是同步的（記憶體快取），寫入會同步交給目前的後端（本機或 Supabase）。
import { useSyncExternalStore } from 'react'
import { TABLES } from './schema'
import { localBackend } from './local'
import { supabaseBackend, supabaseConfig } from './supabase'

let cache = Object.fromEntries(TABLES.map((t) => [t, []]))
let backend = localBackend()
let version = 0
const listeners = new Set()

const emit = () => {
  version++
  listeners.forEach((l) => l())
}

export const uid = () =>
  (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '').slice(0, 20)

export const nowISO = () => new Date().toISOString()

export function backendName() {
  return backend.name
}

export async function initStore() {
  const cfg = supabaseConfig()
  if (cfg) backend = supabaseBackend(cfg)
  const data = await backend.loadAll(TABLES)
  cache = Object.fromEntries(TABLES.map((t) => [t, data[t] || []]))
  emit()
  // 回傳是否為空資料庫（第一次使用時載入示範資料）
  return !cache.items.length && !cache.users.length
}

// ---- 讀取 ----
export const all = (t) => cache[t] || []
export const get = (t, id) => (id ? all(t).find((r) => r.id === id) : undefined)
export const where = (t, fn) => all(t).filter(fn)

// ---- 寫入 ----
const writeLog = (action, table, row, summary) => {
  if (table === 'audit_log') return
  const entry = {
    id: uid(),
    at: nowISO(),
    user_name: currentUser()?.name || '',
    action,
    table_name: table,
    row_id: row.id,
    summary: summary || row.no || row.name || row.lot_no || '',
    created_at: nowISO(),
    updated_at: nowISO(),
  }
  cache.audit_log = [entry, ...cache.audit_log].slice(0, 2000)
  backend.save('audit_log', 'insert', entry, cache)
}

export function insert(t, row, summary) {
  const r = { id: uid(), created_at: nowISO(), updated_at: nowISO(), ...row }
  cache[t] = [...all(t), r]
  backend.save(t, 'insert', r, cache)
  writeLog('新增', t, r, summary)
  emit()
  return r
}

export function update(t, id, patch, summary) {
  let updated
  cache[t] = all(t).map((r) => (r.id === id ? (updated = { ...r, ...patch, updated_at: nowISO() }) : r))
  if (updated) {
    backend.save(t, 'update', updated, cache)
    writeLog('修改', t, updated, summary)
    emit()
  }
  return updated
}

export function remove(t, id) {
  const row = get(t, id)
  if (!row) return
  cache[t] = all(t).filter((r) => r.id !== id)
  backend.save(t, 'delete', row, cache)
  writeLog('刪除', t, row)
  emit()
}

export function exportAll() {
  return JSON.parse(JSON.stringify(cache))
}

export async function importAll(data) {
  cache = Object.fromEntries(TABLES.map((t) => [t, Array.isArray(data[t]) ? data[t] : []]))
  await backend.replaceAll(cache)
  emit()
}

export async function clearAll() {
  await importAll({})
}

// ---- 單號 ----
export function nextNo(table, prefix, date = new Date()) {
  const d = date.toISOString().slice(0, 10).replace(/-/g, '')
  const head = `${prefix}${d}-`
  const field = table === 'lots' ? 'lot_no' : 'no'
  const n = all(table).filter((r) => r[field]?.startsWith(head)).length + 1
  return head + String(n).padStart(3, '0')
}

// ---- 使用者與介面偏好（每台裝置各自記住） ----
const PREF_KEY = 'food-erp:prefs'
let prefs = (() => {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) || '{}')
  } catch {
    return {}
  }
})()

export const getPref = (k, d) => (k in prefs ? prefs[k] : d)
export function setPref(k, v) {
  prefs = { ...prefs, [k]: v }
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs))
  } catch {}
  emit()
}

export const currentUser = () => get('users', prefs.userId) || all('users')[0]

// React hook：資料有變動就重新渲染
export function useStore() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version,
  )
}
