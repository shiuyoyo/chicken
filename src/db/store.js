// 資料存取中心：所有頁面都透過這裡讀寫。
// 讀取是同步的（記憶體快取），寫入會交給目前的後端（本機或 Supabase）。
// transaction()：一個動作中途出錯時整批還原，不會留下寫一半的資料。
import { useSyncExternalStore } from 'react'
import { TABLES } from './schema'
import { localBackend } from './local'
import { supabaseBackend, supabaseConfig } from './supabase'

let cache = Object.fromEntries(TABLES.map((t) => [t, []]))
let backend = localBackend()
let version = 0
const listeners = new Set()

// 交易狀態
let txDepth = 0
let txOps = null
let txDirty = false

const emit = () => {
  version++
  if (txDepth) {
    txDirty = true
    return
  }
  listeners.forEach((l) => l())
}

export const getVersion = () => version

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '').slice(0, 20)

export const nowISO = () => new Date().toISOString()

export function backendName() {
  return backend.name
}

// 測試用：直接指定後端（例如記憶體）
export function useBackend(b) {
  backend = b
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
export const findBy = (t, k, v) => all(t).find((r) => r[k] === v)

// 依資料版本快取計算結果（例如庫存索引），資料沒變就不重算
const memoCache = new Map()
export function memo(key, fn) {
  const hit = memoCache.get(key)
  if (hit && hit.v === version) return hit.value
  const value = fn()
  memoCache.set(key, { v: version, value })
  return value
}

// ---- 寫入 ----
function persist(t, op, row) {
  if (txDepth) txOps.push([t, op, row])
  else backend.save(t, op, row, cache)
}

const writeLog = (action, table, row, summary) => {
  if (table === 'audit_log' || table === 'notifications') return
  const entry = {
    id: uid(),
    at: nowISO(),
    user_name: sessionUserName(),
    action,
    table_name: table,
    row_id: row.id,
    summary: summary || row.no || row.name || row.lot_no || '',
    created_at: nowISO(),
    updated_at: nowISO(),
  }
  cache.audit_log = [entry, ...cache.audit_log]
  if (cache.audit_log.length > 3000) cache.audit_log.length = 3000
  persist('audit_log', 'insert', entry)
}

export function insert(t, row, summary) {
  const r = { id: uid(), created_at: nowISO(), updated_at: nowISO(), ...row }
  cache[t] = [...all(t), r]
  persist(t, 'insert', r)
  writeLog('新增', t, r, summary)
  emit()
  return r
}

export function update(t, id, patch, summary) {
  let updated
  cache[t] = all(t).map((r) => (r.id === id ? (updated = { ...r, ...patch, updated_at: nowISO() }) : r))
  if (updated) {
    persist(t, 'update', updated)
    writeLog('修改', t, updated, summary)
    emit()
  }
  return updated
}

export function remove(t, id) {
  const row = get(t, id)
  if (!row) return
  cache[t] = all(t).filter((r) => r.id !== id)
  persist(t, 'delete', row)
  writeLog('刪除', t, row)
  emit()
}

// 全部成功才寫入後端；任何一步丟出錯誤就整批還原
export function transaction(fn) {
  if (txDepth) return fn()
  const snapshot = { ...cache }
  const snapVersion = version
  txDepth = 1
  txOps = []
  txDirty = false
  try {
    const result = fn()
    const ops = txOps
    txDepth = 0
    txOps = null
    for (const [t, op, row] of ops) backend.save(t, op, row, cache)
    if (txDirty) listeners.forEach((l) => l())
    return result
  } catch (e) {
    cache = snapshot
    version = snapVersion + 1
    txDepth = 0
    txOps = null
    throw e
  }
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
  const d = (typeof date === 'string' ? date : date.toISOString()).slice(0, 10).replace(/-/g, '')
  const head = `${prefix}${d}-`
  const field = table === 'lots' ? 'lot_no' : 'no'
  let max = 0
  for (const r of all(table)) {
    const v = r[field]
    if (v?.startsWith(head)) max = Math.max(max, Number(v.slice(head.length)) || 0)
  }
  return head + String(max + 1).padStart(3, '0')
}

// ---- 裝置偏好與登入狀態（每台裝置各自記住） ----
const PREF_KEY = 'food-erp:prefs'
let prefs = (() => {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(PREF_KEY) || '{}') || {}
  } catch {
    return {}
  }
})()

export const getPref = (k, d) => (k in prefs ? prefs[k] : d)
export function setPref(k, v) {
  prefs = { ...prefs, [k]: v }
  try {
    globalThis.localStorage?.setItem(PREF_KEY, JSON.stringify(prefs))
  } catch {}
  emit()
}

// 目前登入的使用者（未登入回傳 undefined）
export const currentUser = () => {
  const u = get('users', prefs.userId)
  return u && u.active !== false ? u : undefined
}
const sessionUserName = () => currentUser()?.name || '系統'

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
