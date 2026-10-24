// 登入、使用者、角色權限、主檔維護（含驗證規則）。
import { all, get, where, insert, update, remove, setPref, currentUser, transaction } from '../db/store'
import { fail, need, can, MODULES, LEVELS } from './core'
import { checkTemp } from './inventory'

// ---------- 登入 ----------
const tries = {}
export function login(userId, pin) {
  const u = get('users', userId)
  if (!u || u.active === false) fail('帳號不存在或已停用')
  const t = tries[userId] || { n: 0, until: 0 }
  if (t.until > Date.now()) fail(`錯誤太多次，請 ${Math.ceil((t.until - Date.now()) / 1000)} 秒後再試`)
  if (String(u.pin || '') !== String(pin || '')) {
    t.n++
    if (t.n >= 5) {
      t.until = Date.now() + 60000
      t.n = 0
    }
    tries[userId] = t
    fail('PIN 碼錯誤')
  }
  delete tries[userId]
  setPref('userId', u.id)
  return u
}
export const logout = () => setPref('userId', '')

// ---------- 使用者 / 角色 ----------
const adminCount = (users = all('users'), roles = all('roles')) =>
  users.filter((u) => u.active !== false && Number(roles.find((r) => r.id === u.role_id)?.perms?.admin || 0) >= 3).length

export function saveUser(data, id) {
  return transaction(() => {
    need('admin', 2)
    if (!data.name) fail('請輸入姓名')
    if (!get('roles', data.role_id)) fail('請選擇角色')
    if (!/^\d{4,6}$/.test(String(data.pin || ''))) fail('PIN 碼請設定 4–6 位數字')
    if (where('users', (u) => u.name === data.name && u.id !== id).length) fail('姓名重複')
    if (id === currentUser()?.id && data.active === false) fail('不能停用自己')
    const next = id ? all('users').map((u) => (u.id === id ? { ...u, ...data } : u)) : [...all('users'), { ...data, active: data.active !== false }]
    if (!adminCount(next)) fail('至少要保留一位有「使用者與權限」核准權的啟用帳號')
    return id ? update('users', id, data) : insert('users', { active: true, ...data })
  })
}

export function saveRole(data, id) {
  return transaction(() => {
    need('admin', 2)
    if (!data.name) fail('請輸入角色名稱')
    for (const [m, v] of Object.entries(data.perms || {})) if (!MODULES[m] || !(v >= 0 && v < LEVELS.length)) fail('權限設定錯誤')
    const roles = id ? all('roles').map((r) => (r.id === id ? { ...r, ...data } : r)) : [...all('roles'), data]
    if (!adminCount(all('users'), roles)) fail('至少要保留一位有「使用者與權限」核准權的啟用帳號')
    return id ? update('roles', id, data) : insert('roles', data)
  })
}
export function deleteRole(id) {
  need('admin', 2)
  if (where('users', (u) => u.role_id === id).length) fail('還有使用者屬於這個角色')
  remove('roles', id)
}

// ---------- 主檔 ----------
const MASTER_MODULE = { items: 'master', suppliers: 'purchase', warehouses: 'wms', bins: 'wms', price_lists: 'crm' }

function validate(table, d, id) {
  const dup = (k) => d[k] && where(table, (r) => r[k] === d[k] && r.id !== id).length
  if (table === 'items') {
    if (!d.name) fail('請輸入品名')
    if (!d.code) fail('請輸入編號')
    if (dup('code')) fail(`編號 ${d.code} 重複`)
    if (d.barcode && dup('barcode')) fail(`條碼 ${d.barcode} 重複`)
    if (!d.unit) fail('請輸入單位')
    if (d.alt_unit && !(Number(d.alt_factor) > 0)) fail('請輸入換算數量（1 個包裝單位 = 幾個基本單位）')
    if (d.type === 'product') {
      if (!(Number(d.price) > 0)) fail('成品請設定售價')
      if (d.min_price && Number(d.min_price) > Number(d.price)) fail('最低售價不能高於售價')
      for (const b of d.bom || []) {
        const m = get('items', b.item_id)
        if (!m) fail('配方有不存在的原料')
        if (m.type === 'product') fail('配方只能用原料或包材')
        if (!(Number(b.qty) > 0)) fail(`配方 ${m.name} 用量要大於 0`)
      }
      if (new Set((d.bom || []).map((b) => b.item_id)).size !== (d.bom || []).length) fail('配方有重複的原料')
    } else if (d.pos_enabled) fail('只有成品可以在門市販售')
    if (d.default_bin_id) checkTemp(id || '__new', d.default_bin_id, d)
  }
  if (table === 'suppliers' || table === 'warehouses') {
    if (!d.name) fail('請輸入名稱')
    if (dup('code')) fail(`編號 ${d.code} 重複`)
  }
  if (table === 'bins') {
    if (!d.code || !d.warehouse_id) fail('請輸入儲位代碼並選擇倉庫')
    if (where('bins', (b) => b.code === d.code && b.warehouse_id === d.warehouse_id && b.id !== id).length) fail('同倉庫儲位代碼重複')
  }
  if (table === 'price_lists' && !d.name) fail('請輸入價格表名稱')
}

export function saveMaster(table, data, id) {
  return transaction(() => {
    need(MASTER_MODULE[table], 2)
    validate(table, data, id)
    return id ? update(table, id, data) : insert(table, data)
  })
}

export function deleteMaster(table, id) {
  return transaction(() => {
    need(MASTER_MODULE[table], 2)
    const used = {
      items: () => where('stock_moves', (m) => m.item_id === id).length || where('sales_orders', (s) => s.lines.some((l) => l.item_id === id)).length,
      suppliers: () => where('purchase_orders', (p) => p.supplier_id === id).length,
      warehouses: () => where('bins', (b) => b.warehouse_id === id).length,
      bins: () => where('stock_moves', (m) => m.bin_id === id).length,
      price_lists: () => where('customers', (c) => c.price_list_id === id).length,
    }[table]?.()
    if (used) fail('已經被其他單據使用，不能刪除（可以改成停用）')
    remove(table, id)
  })
}

export function deleteCustomer(id) {
  return transaction(() => {
    need('crm', 2)
    if (where('sales_orders', (s) => s.customer_id === id).length || where('pos_sales', (s) => s.customer_id === id).length) fail('客戶已有交易紀錄，不能刪除；可改為「停止往來」')
    for (const a of where('activities', (a) => a.customer_id === id)) remove('activities', a.id)
    remove('customers', id)
  })
}

export { can }
