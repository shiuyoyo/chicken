// 促銷活動價、業務業績、掃碼銷貨、電子發票證明聯
import { describe, it, expect, beforeEach } from 'vitest'
import { execFileSync } from 'child_process'
import { where, get } from '../src/db/store'
import * as L from '../src/logic'
import { freshDemo, loginAs, byCode, itemByCode, all } from './helpers'

beforeEach(async () => {
  await freshDemo()
  loginAs('王老闆')
})

describe('促銷活動價', () => {
  it('活動期間自動套用活動價，期間外回到原價；門市用門市活動價', () => {
    const mala = itemByCode('F004')
    const c2 = byCode('customers', 'C002')
    expect(L.priceFor(c2.id, mala.id)).toBe(115)
    expect(L.priceFor(c2.id, mala.id, L.addDays(L.today(), 30))).toBe(mala.price)
    expect(L.posPrice(mala.id)).toBe(149)
    // 下個月的週年慶：整檔 9 折
    const f1 = itemByCode('F001')
    expect(L.priceFor(c2.id, f1.id, L.addDays(L.today(), 25))).toBe(108)
    expect(L.posPrice(f1.id, L.addDays(L.today(), 25))).toBe(135)
  })

  it('活動價低於最低售價不用簽核；沒有活動時要簽核', () => {
    loginAs('陳業務')
    const mala = itemByCode('F004')
    const c2 = byCode('customers', 'C002')
    const ok = L.saveSalesOrder({ customer_id: c2.id, lines: [{ item_id: mala.id, qty: 5, price: 115 }] })
    expect(ok.status).toBe('confirmed')
    const later = L.saveSalesOrder({ customer_id: c2.id, date: L.addDays(L.today(), 30), lines: [{ item_id: mala.id, qty: 5, price: 115 }] })
    expect(later.status).toBe('pending')
  })

  it('門市結帳用活動價；只有主管能設定活動', () => {
    loginAs('陳業務')
    expect(() => L.savePromotion({ name: 'x', start_date: L.today(), end_date: L.today(), lines: [{ item_id: itemByCode('F001').id, price: 1 }] })).toThrow(/權限/)
    loginAs('周店長')
    const mala = itemByCode('F004')
    L.transfer({ from_bin_id: L.defaultBin(mala.id), to_bin_id: byCode('bins', 'S-01')?.id || all('bins').find((b) => b.code === 'S-01').id, lines: [{ item_id: mala.id, qty: 3 }], reason: '展場' })
    loginAs('小美')
    const shift = where('pos_shifts', (s) => s.status === 'open')[0]
    const sale = L.posCheckout({ shift_id: shift.id, cart: [{ item_id: mala.id, qty: 2 }], method: '信用卡' })
    expect(sale.total).toBe(298)
    expect(sale.random_code).toMatch(/^\d{4}$/)
  })
})

describe('業務業績', () => {
  it('依訂單上的業務歸屬，計算銷售額、毛利、目標達成率', () => {
    const from = L.addDays(L.today(), -60)
    const rows = L.salesPerformance(from, L.today())
    const chen = rows.find((r) => get('users', r.user_id)?.name === '陳業務')
    expect(chen.revenue).toBeGreaterThan(0)
    expect(chen.target).toBe(60000 * 3)
    expect(chen.achieve).toBe(Math.round((chen.revenue / chen.target) * 100))
    expect(chen.margin).toBe(L.round(chen.revenue - chen.cost))
    // 全部業務的銷售額 = 批發出貨銷售額
    const wholesale = L.groupSales(L.salesLines(from, L.today()).filter((l) => l.channel === '批發'), () => 'x')[0].revenue
    expect(Math.abs(L.sum(rows, (r) => r.revenue) - wholesale)).toBeLessThan(1)
  })

  it('新訂單記錄業務：客戶的負責業務優先', () => {
    loginAs('黃經理')
    const c1 = byCode('customers', 'C001')
    const so = L.saveSalesOrder({ customer_id: c1.id, lines: [{ item_id: itemByCode('F002').id, qty: 1, price: 135 }] })
    expect(get('users', so.salesperson_id).name).toBe('陳業務')
  })
})

describe('掃碼銷貨', () => {
  it('條碼或料號都找得到品項', () => {
    expect(L.itemByCode('4710000000011').code).toBe('F001')
    expect(L.itemByCode('f004').code).toBe('F004')
    expect(L.itemByCode('nope')).toBeUndefined()
  })

  it('一次產生訂單、出貨單、應收與發票，用活動價、先到期先出扣庫存', () => {
    loginAs('黃經理')
    const mala = itemByCode('F004')
    const before = L.stockOf(mala.id)
    const c2 = byCode('customers', 'C002')
    const r = L.quickSale({ customer_id: c2.id, lines: [{ item_id: mala.id, qty: 4, price: L.priceFor(c2.id, mala.id) }] })
    expect(r.pending).toBe(false)
    expect(r.so.status).toBe('closed')
    expect(r.shipment.lines.reduce((s, l) => s + l.qty, 0)).toBe(4)
    expect(r.invoice.amount).toBe(460)
    expect(r.invoice.random_code).toMatch(/^\d{4}$/)
    expect(L.stockOf(mala.id)).toBe(before - 4)
  })

  it('超過信用額度時只建立待核准訂單，不出貨', () => {
    loginAs('黃經理')
    const c3 = byCode('customers', 'C003')
    const r = L.quickSale({ customer_id: c3.id, lines: [{ item_id: itemByCode('F004').id, qty: 200, price: 140 }] })
    expect(r.pending).toBe(true)
    expect(where('shipments', (s) => s.sales_order_id === r.so.id)).toHaveLength(0)
  })
})

describe('電子發票證明聯', () => {
  it('期別：民國年 + 雙月', () => {
    expect(L.invoicePeriod('2026-11-09')).toEqual({ code: '11512', label: '115年11-12月' })
    expect(L.invoicePeriod('2026-01-31')).toEqual({ code: '11502', label: '115年01-02月' })
  })

  it('加密驗證欄位與 OpenSSL 的 AES-128-CBC 結果一致', async () => {
    const key = '0123456789ABCDEF0123456789ABCDEF'
    const iv = Buffer.from('Dt8lyToo17X/XkXaQvihuA==', 'base64').toString('hex')
    const ref = execFileSync('openssl', ['enc', '-aes-128-cbc', '-K', key, '-iv', iv, '-base64'], { input: 'AB100000011234' }).toString().trim()
    expect(await L.encryptVerify('AB10000001', '1234', key)).toBe(ref.slice(0, 24))
    expect(await L.encryptVerify('AB10000001', '1234', '')).toBe('*'.repeat(24))
  })

  it('左 QR 前 77 碼格式正確、品目放不下的接到右 QR', async () => {
    const sale = all('pos_sales').find((s) => s.status === 'done')
    const e = L.einvoiceData(`pos_sales:${sale.id}`)
    const { left, right } = await L.qrTexts(e)
    const head = left.split(':')[0]
    expect(head).toHaveLength(77)
    expect(head.slice(0, 10)).toBe(e.no)
    expect(head.slice(17, 21)).toBe(e.random)
    expect(parseInt(head.slice(29, 37), 16)).toBe(e.total)
    expect(right.startsWith('**')).toBe(true)
    expect(L.barcodeText(e)).toMatch(/^\d{5}[A-Z]{2}\d{8}\d{4}$/)
    const many = { ...e, lines: Array.from({ length: 12 }, (_, i) => ({ name: `商品${i}`, qty: 1, price: 10 })) }
    const q = await L.qrTexts(many)
    expect(q.right.split(':').length).toBeGreaterThan(1)
  })
})

describe('展場多台收銀機', () => {
  it('每台收銀機各自的班別、交易單號、發票號碼區段，不會重號；日結列出空白發票', async () => {
    const { setPref } = await import('../src/db/store')
    const s1 = all('bins').find((b) => b.code === 'S-01')
    const f2 = itemByCode('F002')
    loginAs('小美')
    const start = Number(L.getSetting('gui_next'))
    setPref('posDevice', 'A')
    const a = L.startShift({ bin_id: s1.id, opening_cash: 1000 })
    setPref('posDevice', 'B')
    const b = L.startShift({ bin_id: s1.id, opening_cash: 1000 })
    expect([a.gui_from, a.gui_to]).toEqual([start, start + 99])
    expect([b.gui_from, b.gui_to]).toEqual([start + 100, start + 199])
    expect(Number(L.getSetting('gui_next'))).toBe(start + 200)
    expect(L.openShift(s1.id).id).toBe(b.id)
    const sb = L.posCheckout({ shift_id: b.id, cart: [{ item_id: f2.id, qty: 1 }], method: '信用卡' })
    setPref('posDevice', 'A')
    const sa = L.posCheckout({ shift_id: a.id, cart: [{ item_id: f2.id, qty: 1 }], method: '信用卡', buyer_tax_id: '12345675' })
    expect(sa.no).toMatch(/^POSA/)
    expect(sb.no).toMatch(/^POSB/)
    expect(sa.gui_no).toBe(`AB-${String(start).padStart(8, '0')}`)
    expect(sb.gui_no).toBe(`AB-${String(start + 100).padStart(8, '0')}`)
    expect(L.unusedGui(get('pos_shifts', a.id)).count).toBe(99)
    expect(() => L.posCheckout({ shift_id: a.id, cart: [{ item_id: f2.id, qty: 1 }], method: '信用卡', buyer_tax_id: '123' })).toThrow(/8 位數字/)
    setPref('posDevice', '')
  })
})
