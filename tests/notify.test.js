// LINE / Telegram 通知：收件人規則、綁定流程（與 Edge Function 共用同一套機器人程式）、發送
import { describe, it, expect, beforeEach } from 'vitest'
import { freshDemo, loginAs, byCode, itemByCode, all } from './helpers'
import { get, where, findBy } from '../src/db/store'
import * as L from '../src/logic'
import { dispatch, formatNotification } from '../supabase/functions/_shared/bot.ts'
import { verifyLineSignature, parseLineEvent, toLineMessage } from '../supabase/functions/_shared/line.ts'
import { parseTelegramUpdate, toTelegramMessage } from '../supabase/functions/_shared/telegram.ts'

beforeEach(freshDemo)
const lastN = () => all('notifications').at(-1)
const userId = (name) => findBy('users', 'name', name).id

describe('產生通知與收件人', () => {
  it('示範資料的通知標成 demo，不會被送出', () => {
    expect(all('notifications').length).toBeGreaterThan(5)
    expect(all('notifications').every((n) => n.status === 'demo')).toBe(true)
  })
  it('送簽核：通知有該模組核准權的人，不通知申請人自己', () => {
    loginAs('吳採購')
    L.savePurchaseOrder({ supplier_id: byCode('suppliers', 'S001').id, lines: [{ item_id: itemByCode('R001').id, qty: 500, price: 160 }] })
    const n = lastN()
    expect(n.event).toBe('approval_requested')
    expect(n.status).toBe('queued')
    expect(n.user_ids).toContain(userId('王老闆'))
    expect(n.user_ids).toContain(userId('劉廠長'))
    expect(n.user_ids).not.toContain(userId('吳採購'))
    expect(n.user_ids).not.toContain(userId('小美'))
    expect(n.body).toMatch(/64,000|80,000/)
  })
  it('核准後通知申請人', () => {
    const ap = L.pendingApprovals().find((a) => a.type === 'po')
    loginAs('劉廠長')
    L.decideApproval(ap.id, true, 'OK')
    const n = all('notifications').find((x) => x.event === 'approval_decided' && x.status === 'queued')
    expect(n.user_ids).toEqual([userId('吳採購')])
    expect(n.title).toMatch(/已核准/)
  })
  it('QC 不合格通知廠長、品管、管理者', () => {
    loginAs('李品管')
    const lot = L.pendingLots()[0]
    L.saveInspection({ lot_no: lot.lot_no, result: 'fail', checks: [], note: '色澤異常' })
    const n = lastN()
    expect(n.event).toBe('qc_failed')
    expect(n.user_ids).toEqual(expect.arrayContaining([userId('王老闆'), userId('劉廠長')]))
    expect(n.user_ids).not.toContain(userId('李品管')) // 自己做的不通知自己
  })
  it('出貨通知客戶的負責業務', () => {
    const so = findBy('sales_orders', 'customer_id', byCode('customers', 'C001').id)
    loginAs('張師傅')
    L.shipGoods({ sales_order_id: so.id, lines: [{ item_id: itemByCode('F002').id, qty: 10 }] })
    const n = all('notifications').find((x) => x.event === 'shipped' && x.status === 'queued')
    expect(n.user_ids).toContain(userId('陳業務'))
  })
  it('規則可關閉；關閉後不產生通知', () => {
    loginAs('王老闆')
    L.saveRules({ wo_created: { enabled: false, role_ids: [], owner: false } })
    const before = all('notifications').length
    loginAs('劉廠長')
    L.createWorkOrder({ product_id: itemByCode('F001').id, plan_qty: 10 })
    expect(all('notifications').length).toBe(before)
  })
  it('動作失敗時通知也一起還原', () => {
    loginAs('張師傅')
    const before = all('notifications').length
    const so = findBy('sales_orders', 'customer_id', byCode('customers', 'C001').id)
    expect(() => L.shipGoods({ sales_order_id: so.id, lines: [{ item_id: itemByCode('F002').id, qty: 10 }, { item_id: itemByCode('F001').id, qty: 10 }] })).toThrow()
    expect(all('notifications').length).toBe(before)
  })
})

describe('員工自己在 LINE 設定職位、管理員確認', () => {
  it('加好友 → 選職位 → 輸入姓名 → 待確認 → 管理員確定 → 收到確認訊息', async () => {
    const ev = { channel: 'line', externalId: 'U-test-1', displayName: '小黃' }
    let out = await L.simulateIncoming({ ...ev, kind: 'follow' })
    expect(out[0].text).toMatch(/請選擇你在公司的職位/)
    const role = out[0].buttons.find((b) => b.label === '現場人員')
    out = await L.simulateIncoming({ ...ev, kind: 'action', data: role.data })
    expect(out[0].text).toMatch(/請輸入你的姓名/)
    expect(out[0].buttons[0].label).toBe('用「小黃」')
    out = await L.simulateIncoming({ ...ev, kind: 'text', text: '黃小明' })
    expect(out[0].text).toMatch(/已送出申請/)
    const c = findBy('notify_contacts', 'external_id', 'U-test-1')
    expect(c.status).toBe('pending')
    // 還沒確認前不能暫停通知（沒有綁定）
    out = await L.simulateIncoming({ ...ev, kind: 'text', text: '我的職位' })
    expect(out[0].text).toMatch(/等待管理員確認/)

    loginAs('陳業務')
    expect(() => L.approveContact(c.id, { create_user: {} })).toThrow(/權限不足/)
    loginAs('王老闆')
    const r = L.approveContact(c.id, { create_user: { name: '黃小明' } })
    expect(r.user.name).toBe('黃小明')
    expect(get('roles', r.user.role_id).name).toBe('現場人員')
    expect(r.pin).toMatch(/^\d{4}$/)
    // 現場人員不負責客戶，不該列出訂單、出貨、收款
    expect(L.eventsForUser(r.user)).toEqual(['你送出的申請有結果', '新的生產工單'])
    expect(L.eventsForUser(get('users', userId('陳業務')))).toContain('已出貨')
    const n = lastN()
    expect(n.contact_ids).toEqual([c.id])
    expect(n.body).toMatch(/職位：現場人員/)
    out = await L.simulateIncoming({ ...ev, kind: 'text', text: '我的職位' })
    expect(out[0].text).toMatch(/已綁定：黃小明（現場人員）/)
  })
  it('綁定既有員工並調整職位；暫停後不再收到通知', async () => {
    const c = L.pendingContacts().find((x) => x.requested_name === '阿明')
    loginAs('王老闆')
    L.approveContact(c.id, { user_id: userId('張師傅') })
    expect(get('notify_contacts', c.id).user_id).toBe(userId('張師傅'))
    await L.simulateIncoming({ channel: 'line', externalId: c.external_id, kind: 'text', text: '暫停通知' })
    expect(get('notify_contacts', c.id).muted).toBe(true)
  })
  it('退回申請會通知對方並可重新申請', async () => {
    const c = L.pendingContacts().find((x) => x.requested_name === '林艾咪')
    loginAs('王老闆')
    L.rejectContact(c.id, '請用公司登記的全名')
    expect(get('notify_contacts', c.id).status).toBe('rejected')
    const out = await L.simulateIncoming({ channel: 'telegram', externalId: c.external_id, kind: 'text', text: '重新申請' })
    expect(out[0].text).toMatch(/請選擇/)
  })
})

describe('發送（Edge Function 用的 dispatch）', () => {
  // 用記憶體模擬 Supabase
  const memRepo = () => ({
    async claimQueued() {
      const list = all('notifications').filter((n) => n.status === 'queued')
      list.forEach((n) => (n.status = 'sending'))
      return list
    },
    async contactsForUsers(ids) { return all('notify_contacts').filter((c) => ids.includes(c.user_id)) },
    async contactsByIds(ids) { return all('notify_contacts').filter((c) => ids.includes(c.id)) },
    async updateNotification(id, patch) { Object.assign(all('notifications').find((n) => n.id === id), patch) },
  })
  it('依綁定管道送出；暫停的人不送；失敗會記錄', async () => {
    loginAs('吳採購')
    L.savePurchaseOrder({ supplier_id: byCode('suppliers', 'S001').id, lines: [{ item_id: itemByCode('R001').id, qty: 500, price: 160 }] })
    findBy('notify_contacts', 'external_id', 'demo-line-factory').muted = true
    const sent = []
    const r = await dispatch(memRepo(), {
      line: async (to, out) => sent.push(['line', to, out.text]),
      telegram: async () => { throw new Error('bot 被封鎖') },
    }, 'https://erp.example.com/')
    expect(r.notifications).toBe(1)
    expect(sent.map((s) => s[1])).toEqual(['demo-line-boss'])
    expect(sent[0][2]).toMatch(/待你核准/)
    const n = lastN()
    expect(n.status).toBe('sent')
  })
  it('Telegram 送失敗會記成 failed，不影響其他通知', async () => {
    loginAs('李品管')
    L.saveInspection({ lot_no: L.pendingLots()[0].lot_no, result: 'fail', checks: [] }) // 通知廠長(LINE)、老闆(LINE)
    loginAs('王老闆')
    L.sendTest(userId('李品管')) // 李品管用 Telegram
    const r = await dispatch(memRepo(), { line: async () => {}, telegram: async () => { throw new Error('403') } })
    expect(r.failed).toBe(1)
    expect(all('notifications').find((n) => n.event === 'test').status).toBe('failed')
  })
  it('通知內容帶系統連結', () => {
    const out = formatNotification({ title: '新訂單', body: 'A\nB', link: '/progress/1' }, 'https://erp.example.com/index.html')
    expect(out.text).toBe('🔔 新訂單\nA\nB')
    expect(out.link.url).toBe('https://erp.example.com/index.html#/progress/1')
    expect(formatNotification({ title: 'x', link: '/' }, 'https://erp.example.com').link.url).toBe('https://erp.example.com/#/')
  })
})

describe('LINE / Telegram 格式轉換與驗證', () => {
  it('LINE 簽章驗證', async () => {
    const secret = 'abc123'
    const body = '{"events":[]}'
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))).toString('base64')
    expect(await verifyLineSignature(secret, body, sig)).toBe(true)
    expect(await verifyLineSignature(secret, body + ' ', sig)).toBe(false)
    expect(await verifyLineSignature(secret, body, null)).toBe(false)
  })
  it('LINE 事件解析：只處理私訊', () => {
    expect(parseLineEvent({ type: 'follow', replyToken: 't', source: { type: 'user', userId: 'U1' } })).toMatchObject({ kind: 'follow', externalId: 'U1' })
    expect(parseLineEvent({ type: 'postback', postback: { data: 'role:x' }, source: { type: 'user', userId: 'U1' } })).toMatchObject({ kind: 'action', data: 'role:x' })
    expect(parseLineEvent({ type: 'message', message: { type: 'text', text: 'hi' }, source: { type: 'group', userId: 'U1' } })).toBeNull()
  })
  it('按鈕轉成 LINE 快速回覆（最多 13 個）與 Telegram 按鈕', () => {
    const out = { text: '選職位', buttons: Array.from({ length: 15 }, (_, i) => ({ label: '職位' + i, data: 'role:' + i })), link: { label: '開啟系統', url: 'https://x/#/' } }
    const m = toLineMessage(out)
    expect(m.quickReply.items).toHaveLength(13)
    expect(m.quickReply.items[0].action).toMatchObject({ type: 'postback', data: 'role:0' })
    const t = toTelegramMessage(out)
    expect(t.reply_markup.inline_keyboard.at(-1)[0]).toEqual({ text: '開啟系統', url: 'https://x/#/' })
    expect(parseTelegramUpdate({ message: { chat: { id: 5, type: 'private' }, text: '/start', from: { first_name: 'Amy' } } })).toMatchObject({ kind: 'follow', externalId: '5', displayName: 'Amy' })
  })
})
