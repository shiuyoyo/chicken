// 雲端版離線：斷線時異動存在待上傳佇列、依序補傳；被伺服器拒絕的移到失敗清單，不會消失
import { describe, it, expect, beforeEach } from 'vitest'
import { supabaseBackend, failedUploads } from '../src/db/supabase'

// 測試環境沒有 localStorage：用記憶體版本
const mem = new Map()
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }

function fakeClient() {
  const c = {
    online: true,
    reject: null,
    sent: [],
    rpc: async (fn, args) => {
      if (!c.online) throw new TypeError('Failed to fetch')
      if (c.reject && args.ops.some((o) => o.row?.no === c.reject)) return { error: { message: 'ERROR:  庫存不足：批號 X 在這個儲位只剩 0' } }
      c.sent.push(...args.ops)
      return { error: null }
    },
    from: () => ({ select: () => ({ order: () => ({ order: () => ({ range: async () => (c.online ? { data: [{ id: 'srv' }], error: null } : { data: null, error: { message: 'Failed to fetch' } }) }) }) }) }),
    functions: { invoke: async () => ({}) },
    user: 'u1',
    listeners: [],
    auth: {
      refreshSession: async () => ({}),
      onAuthStateChange: (cb) => {
        c.listeners.push(cb)
        cb('INITIAL_SESSION', { user: { id: c.user } })
        return { data: { subscription: { unsubscribe() {} } } }
      },
    },
    signInAs: (id) => {
      c.user = id
      for (const cb of c.listeners) cb('SIGNED_IN', id ? { user: { id } } : null)
    },
  }
  return c
}
const row = (no) => ({ t: 'pos_sales', op: 'insert', row: { id: no, no, created_at: 'x', updated_at: 'x', lines: [] } })

beforeEach(() => mem.clear())

describe('離線待上傳佇列', () => {
  it('斷線時先存在裝置上，連線後依序補傳', async () => {
    const sb = fakeClient()
    const b = supabaseBackend({}, { sb })
    sb.online = false
    await b.saveBatch([row('POSA-001')])
    await b.saveBatch([row('POSA-002')])
    expect(b.status()).toMatchObject({ pending: 2, offline: true })
    expect(JSON.parse(mem.get('food-erp:outbox'))).toHaveLength(2)
    // 重新開網頁（新的 backend 從裝置上的佇列接續）
    sb.online = true
    const b2 = supabaseBackend({}, { sb })
    await b2.flushed()
    expect(sb.sent.map((o) => o.row.no)).toEqual(['POSA-001', 'POSA-002'])
    expect(b2.status()).toMatchObject({ pending: 0, offline: false })
  })

  it('離線時讀取資料用裝置上的快照（含還沒上傳的）', async () => {
    const sb = fakeClient()
    const b = supabaseBackend({}, { sb })
    const loaded = await b.loadAll(['pos_sales'])
    expect(loaded.pos_sales[0].id).toBe('srv')
    sb.online = false
    await b.saveBatch([row('POSA-003')], { pos_sales: [{ id: 'srv' }, { id: 'POSA-003' }] })
    await new Promise((r) => setTimeout(r, 1700))
    const offline = await b.loadAll(['pos_sales'])
    expect(offline.pos_sales.map((r) => r.id)).toEqual(['srv', 'POSA-003'])
  })

  it('被伺服器拒絕的移到失敗清單，其餘照常上傳；可以重試', async () => {
    const sb = fakeClient()
    let reloaded = 0
    const b = supabaseBackend({}, { sb, onRejected: () => reloaded++ })
    sb.reject = 'POSA-010'
    sb.online = false
    await b.saveBatch([row('POSA-010')])
    await b.saveBatch([row('POSA-011')])
    sb.online = true
    await b.flushed()
    expect(sb.sent.map((o) => o.row.no)).toEqual(['POSA-011'])
    expect(failedUploads()).toHaveLength(1)
    expect(failedUploads()[0].error).toMatch(/庫存不足/)
    expect(reloaded).toBe(1)
    // 處理好原因後重試
    sb.reject = null
    await b.retryFailed()
    expect(sb.sent.map((o) => o.row.no)).toEqual(['POSA-011', 'POSA-010'])
    expect(failedUploads()).toHaveLength(0)
  })

  it('換人登入時，前一個人的待上傳資料不會用新的身分送出', async () => {
    const sb = fakeClient()
    const b = supabaseBackend({}, { sb })
    sb.online = false
    await b.saveBatch([row('POSA-020')])
    // 小美離線時下班，店長在同一台登入
    sb.signInAs('u2')
    sb.online = true
    await b.saveBatch([row('POSA-021')])
    await b.flushed()
    expect(sb.sent.map((o) => o.row.no)).toEqual(['POSA-021'])
    expect(b.status()).toMatchObject({ pending: 0, others: 1 })
    // 小美再登入：她的那筆才上傳
    sb.signInAs('u1')
    await b.flushed()
    expect(sb.sent.map((o) => o.row.no)).toEqual(['POSA-021', 'POSA-020'])
  })

  it('先載入資料（沒有待上傳）之後的異動也會正常上傳', async () => {
    const sb = fakeClient()
    const b = supabaseBackend({}, { sb })
    await b.loadAll(['pos_sales'])
    await b.saveBatch([row('POSA-030')])
    expect(sb.sent.map((o) => o.row.no)).toEqual(['POSA-030'])
    expect(b.idle()).toBe(true)
  })
})
