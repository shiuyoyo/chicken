// 營運規則測試：每一條規則都在這裡被驗證。
import { describe, it, expect, beforeEach } from 'vitest'
import { freshDemo, loginAs, itemByCode, byCode, all } from './helpers'
import { get, where, findBy, setPref, update } from '../src/db/store'
import * as L from '../src/logic'

const bin = (code) => findBy('bins', 'code', code).id
const lotsOf = (code, kind) => where('lots', (l) => l.item_id === itemByCode(code).id && (!kind || l.kind === kind))
const count = (t) => all(t).length

beforeEach(freshDemo)

describe('權限與登入', () => {
  it('未登入不能做任何異動', () => {
    setPref('userId', '')
    expect(() => L.saveSalesOrder({ customer_id: byCode('customers', 'C001').id, lines: [] })).toThrow('請先登入')
  })
  it('門市人員不能下銷售訂單', () => {
    loginAs('小美')
    expect(() => L.saveSalesOrder({ customer_id: byCode('customers', 'C001').id, lines: [{ item_id: itemByCode('F001').id, qty: 1 }] })).toThrow(/權限不足.*銷售/)
  })
  it('業務不能核准採購單', () => {
    loginAs('陳業務')
    const ap = L.pendingApprovals().find((a) => a.type === 'po')
    expect(() => L.decideApproval(ap.id, true)).toThrow(/權限不足/)
  })
  it('申請人不能核准自己的申請', () => {
    loginAs('王老闆')
    const po = L.savePurchaseOrder({ supplier_id: byCode('suppliers', 'S001').id, lines: [{ item_id: itemByCode('R001').id, qty: 500, price: 160 }] })
    expect(po.status).toBe('pending')
    expect(() => L.decideApproval(L.pendingFor(po.id).id, true)).toThrow('申請人不能核准自己的申請')
  })
  it('PIN 錯誤不能登入，連錯 5 次鎖定', () => {
    const u = findBy('users', 'name', '張師傅')
    expect(() => L.login(u.id, '0000')).toThrow('PIN 碼錯誤')
    for (let i = 0; i < 4; i++) expect(() => L.login(u.id, '9999')).toThrow()
    expect(() => L.login(u.id, '5555')).toThrow(/錯誤太多次/)
    const w = findBy('users', 'name', '李品管')
    expect(L.login(w.id, '6666').name).toBe('李品管')
  })
  it('不能把最後一位管理者的權限拿掉', () => {
    loginAs('王老闆')
    const admin = findBy('roles', 'name', '管理者')
    expect(() => L.saveRole({ ...admin, perms: { ...admin.perms, admin: 2 } }, admin.id)).toThrow(/至少要保留一位/)
  })
})

describe('交易一致性', () => {
  it('動作失敗時整批還原，不留下半套資料', () => {
    loginAs('張師傅')
    const so = findBy('sales_orders', 'customer_id', byCode('customers', 'C001').id)
    const before = [count('shipments'), count('stock_moves'), count('journal')]
    // 麻油雞剩 80 可出，但三杯雞還沒 QC → 整張出貨失敗
    expect(() => L.shipGoods({ sales_order_id: so.id, lines: [{ item_id: itemByCode('F002').id, qty: 10 }, { item_id: itemByCode('F001').id, qty: 10 }] })).toThrow(/尚未通過 QC/)
    expect([count('shipments'), count('stock_moves'), count('journal')]).toEqual(before)
  })
})

describe('採購與進貨', () => {
  it('超過門檻的採購單要核准才能進貨', () => {
    const ap = L.pendingApprovals().find((a) => a.type === 'po')
    const po = get('purchase_orders', ap.ref_id)
    loginAs('張師傅')
    expect(() => L.receiveGoods({ purchase_order_id: po.id, lines: [{ item_id: po.lines[0].item_id, qty: 10 }] })).toThrow(/待核准/)
    loginAs('劉廠長')
    L.decideApproval(ap.id, true)
    expect(get('purchase_orders', po.id).status).toBe('open')
    loginAs('張師傅')
    const r = L.receiveGoods({ purchase_order_id: po.id, lines: [{ item_id: po.lines[0].item_id, qty: 100, supplier_lot: 'X1' }] })
    expect(r.lots[0].qc_status).toBe('pending') // 雞肉要 IQC
    expect(L.poStatus(get('purchase_orders', po.id))).toBe('partial')
  })
  it('超收超過 10% 不允許', () => {
    loginAs('吳採購')
    const po = L.savePurchaseOrder({ supplier_id: byCode('suppliers', 'S002').id, lines: [{ item_id: itemByCode('R003').id, qty: 10, price: 45 }] })
    expect(() => L.receiveGoods({ purchase_order_id: po.id, lines: [{ item_id: itemByCode('R003').id, qty: 12 }] })).toThrow(/超收/)
    L.receiveGoods({ purchase_order_id: po.id, lines: [{ item_id: itemByCode('R003').id, qty: 11 }] })
  })
  it('溫層不符不能入庫（冷凍雞肉放常溫倉）', () => {
    loginAs('吳採購')
    expect(() => L.receiveGoods({ supplier_id: byCode('suppliers', 'S001').id, lines: [{ item_id: itemByCode('R001').id, qty: 5, bin_id: bin('N-A01') }] })).toThrow(/溫層不符/)
  })
  it('進料未檢驗（IQC 待檢）不能領料', () => {
    loginAs('吳採購')
    const r = L.receiveGoods({ supplier_id: byCode('suppliers', 'S001').id, lines: [{ item_id: itemByCode('R002').id, qty: 50 }] })
    expect(r.lots[0].qc_status).toBe('pending')
    loginAs('劉廠長')
    const wo = L.createWorkOrder({ product_id: itemByCode('F003').id, plan_qty: 100 })
    expect(() => L.issueMaterials(wo.id, [{ item_id: itemByCode('R002').id, qty: 17 }])).toThrow(/尚未通過 QC/)
  })
  it('退回供應商沖減應付帳款', () => {
    const ret = where('returns', (r) => r.kind === 'purchase')[0]
    expect(ret).toBeTruthy()
    const bill = get('bills', ret.bill_id)
    expect(bill.credited).toBeCloseTo(ret.amount + ret.tax)
  })
})

describe('銷售與 CRM', () => {
  it('超過信用額度的訂單要核准，核准前不能開工單、不能出貨', () => {
    const ap = L.pendingApprovals().find((a) => a.type === 'so')
    const so = get('sales_orders', ap.ref_id)
    expect(so.status).toBe('pending')
    loginAs('劉廠長')
    expect(() => L.createWorkOrder({ sales_order_id: so.id, product_id: so.lines[0].item_id, plan_qty: 10 })).toThrow(/不是「已確認」/)
    loginAs('張師傅')
    expect(() => L.shipGoods({ sales_order_id: so.id, lines: [{ item_id: so.lines[0].item_id, qty: 1 }] })).toThrow(/不是「已確認」/)
    loginAs('黃經理')
    L.decideApproval(ap.id, true)
    expect(get('sales_orders', so.id).status).toBe('confirmed')
  })
  it('低於最低售價要核准；退回要寫原因', () => {
    loginAs('陳業務')
    const so = L.saveSalesOrder({ customer_id: byCode('customers', 'C002').id, lines: [{ item_id: itemByCode('F001').id, qty: 10, price: 90 }] })
    expect(so.status).toBe('pending')
    expect(L.pendingFor(so.id).reason).toMatch(/低於最低售價/)
    loginAs('黃經理')
    expect(() => L.decideApproval(L.pendingFor(so.id).id, false)).toThrow(/原因/)
    L.decideApproval(L.pendingFor(so.id).id, false, '價格太低')
    expect(get('sales_orders', so.id).status).toBe('rejected')
  })
  it('客戶價格表優先於標準售價', () => {
    expect(L.priceFor(byCode('customers', 'C001').id, itemByCode('F001').id)).toBe(112)
    expect(L.priceFor(byCode('customers', 'C002').id, itemByCode('F001').id)).toBe(120)
  })
  it('停止往來的客戶不能下單', () => {
    loginAs('陳業務')
    const c = byCode('customers', 'C004')
    L.saveCustomer({ ...c, status: '停止往來' }, c.id)
    expect(() => L.saveSalesOrder({ customer_id: c.id, lines: [{ item_id: itemByCode('F001').id, qty: 1 }] })).toThrow(/停止往來/)
  })
  it('報價單轉訂單，商機改為成交；過期報價不能轉', () => {
    loginAs('黃經理')
    const q = findBy('quotations', 'customer_id', byCode('customers', 'C004').id)
    const so = L.convertQuotation(q.id)
    expect(so.quotation_id).toBe(q.id)
    expect(get('quotations', q.id).status).toBe('converted')
    expect(get('opportunities', q.opportunity_id).stage).toBe('成交')
    loginAs('陳業務')
    const old = L.saveQuotation({ customer_id: byCode('customers', 'C002').id, date: '2020-01-01', lines: [{ item_id: itemByCode('F003').id, qty: 1, price: 65 }] })
    expect(L.quoteStatus(old)).toBe('expired')
    loginAs('黃經理')
    expect(() => L.convertQuotation(old.id)).toThrow(/過期/)
  })
  it('客戶 360 計算營收與回購', () => {
    const x = L.customer360(byCode('customers', 'C001').id)
    expect(x.revenue).toBeGreaterThan(0)
    expect(x.orders.length).toBeGreaterThan(0)
    expect(L.dueFollowups().length).toBeGreaterThan(0)
  })
})

describe('請購單', () => {
  it('現場提出請購 → 採購轉成採購單（依供應商分單）→ 請購單變已轉採購', () => {
    const rq = all('requisitions').find((r) => L.reqStatus(r) === 'open')
    expect(rq.lines.length).toBe(2)
    loginAs('小美')
    expect(() => L.convertRequisition(rq.id)).toThrow(/權限不足/)
    loginAs('吳採購')
    const pos = L.convertRequisition(rq.id)
    expect(pos.length).toBe(2) // 黑麻油跟調味批發買、外箱跟包材行買
    expect(pos.every((p) => p.requisition_id === rq.id)).toBe(true)
    expect(L.reqStatus(get('requisitions', rq.id))).toBe('converted')
    expect(() => L.convertRequisition(rq.id)).toThrow(/全部轉成採購單/)
    loginAs('劉廠長')
    expect(() => L.cancelRequisition(rq.id)).toThrow(/不能取消/)
  })
  it('依安全庫存自動產生請購單', () => {
    loginAs('張師傅')
    const rq = L.lowStockRequisition()
    expect(rq.lines.some((l) => l.item_id === itemByCode('R004').id)).toBe(true)
  })
  it('每一筆庫存異動都有單據號碼', () => {
    expect(all('stock_moves').filter((m) => !m.doc_no)).toEqual([])
    const kinds = new Set(all('stock_moves').map((m) => m.doc_no.replace(/\d.*$/, '')))
    for (const k of ['RC', 'MI', 'FD', 'MS', 'AJ', 'SH', 'TR', 'POS', 'SR', 'PR']) expect(kinds.has(k), k).toBe(true)
  })
})

describe('缺料建議', () => {
  it('過期或待檢的原料不算可用庫存', () => {
    loginAs('陳業務')
    const so = L.saveSalesOrder({ customer_id: byCode('customers', 'C002').id, lines: [{ item_id: itemByCode('F002').id, qty: 300, price: 135 }] })
    const ginger = L.purchaseSuggestions(so.id).find((s) => s.item_id === itemByCode('R005').id)
    // 需要 12 kg，倉庫有 20 kg 過期 + 8 kg 新鮮 → 缺 4
    expect(ginger.stock).toBe(8)
    expect(ginger.short).toBe(4)
  })
})

describe('生產', () => {
  it('領料超過配方 20% 不允許；沒有投料不能產出', () => {
    loginAs('劉廠長')
    const wo = L.createWorkOrder({ product_id: itemByCode('F002').id, plan_qty: 10 })
    loginAs('張師傅')
    expect(() => L.issueMaterials(wo.id, [{ item_id: itemByCode('R001').id, qty: 5 }])).toThrow(/超過配方需求/)
    expect(() => L.recordOutput(wo.id, { qty: 10 })).toThrow(/還沒有投料/)
  })
  it('投料不足時自動從倉庫補領，並記錄原料批號', () => {
    loginAs('劉廠長')
    const wo = L.createWorkOrder({ product_id: itemByCode('F002').id, plan_qty: 10 })
    loginAs('張師傅')
    L.feedMaterials(wo.id, L.woNeeds(wo))
    const w = get('work_orders', wo.id)
    expect(w.feeds.every((f) => f.lot_no)).toBe(true)
    expect(L.woIssued(w, itemByCode('R001').id)).toBeCloseTo(3.2)
    expect(w.status).toBe('cooking')
  })
  it('成品未 QC 不能出貨；QC 合格後可以', () => {
    const so = findBy('sales_orders', 'customer_id', byCode('customers', 'C001').id)
    loginAs('張師傅')
    expect(() => L.shipGoods({ sales_order_id: so.id, lines: [{ item_id: itemByCode('F001').id, qty: 50 }] })).toThrow(/尚未通過 QC/)
    const lot = where('lots', (l) => l.item_id === itemByCode('F001').id && l.qc_status === 'pending')[0]
    loginAs('李品管')
    L.saveInspection({ lot_no: lot.lot_no, sample_size: 5, defect_qty: 0, result: 'pass', checks: L.DEFAULT_CHECKS.map((c) => ({ ...c, pass: true })) })
    loginAs('張師傅')
    const sh = L.shipGoods({ sales_order_id: so.id, lines: [{ item_id: itemByCode('F001').id, qty: 50 }] })
    // 先到期先出：先出較早的批號，不夠再用剛合格的新批號
    expect(sh.lines.map((l) => l.lot_no)).toContain(lot.lot_no)
    expect(sh.lines[0].lot_no < lot.lot_no).toBe(true)
  })
  it('結案時產線剩料退回原儲位，在製品歸零', () => {
    loginAs('劉廠長')
    const wo = L.createWorkOrder({ product_id: itemByCode('F001').id, plan_qty: 10 })
    loginAs('張師傅')
    L.issueMaterials(wo.id, L.woNeeds(wo))
    L.feedMaterials(wo.id, L.woNeeds(wo).map((n) => ({ ...n, qty: L.round(n.qty / 2, 3) })))
    L.recordOutput(wo.id, { qty: 5 })
    const lineBefore = L.lineStock(itemByCode('R001').id)
    expect(lineBefore).toBeGreaterThan(0)
    loginAs('劉廠長')
    L.closeWorkOrder(wo.id)
    expect(L.lineStock(itemByCode('R001').id)).toBe(0)
    const wip = L.sum(where('journal', (j) => j.ref_id === wo.id).flatMap((j) => j.lines.filter((l) => l.account === 1320)), (l) => l.debit - l.credit)
    expect(L.round(wip)).toBe(0)
  })
})

describe('品管', () => {
  it('有 NG 項目不能判合格', () => {
    loginAs('李品管')
    const lot = L.pendingLots()[0]
    expect(() => L.saveInspection({ lot_no: lot.lot_no, result: 'pass', checks: [{ name: 'x', pass: false }] })).toThrow(/NG/)
  })
  it('不合格改判合格：品管員要送簽核，品管主管可直接改', () => {
    loginAs('王老闆')
    const r = L.saveRole({ name: '品管員', perms: { qc: 2 } })
    const u = L.saveUser({ name: '新品管', role_id: r.id, pin: '1234' })
    loginAs('李品管')
    const lot = L.pendingLots()[0]
    L.saveInspection({ lot_no: lot.lot_no, result: 'fail', checks: [] })
    setPref('userId', u.id)
    const res = L.saveInspection({ lot_no: lot.lot_no, result: 'pass', checks: [] })
    expect(res.pending).toBe(true)
    expect(L.lotByNo(lot.lot_no).qc_status).toBe('fail')
    loginAs('李品管')
    L.decideApproval(L.pendingFor(lot.id).id, true)
    expect(L.lotByNo(lot.lot_no).qc_status).toBe('pass')
  })
})

describe('出貨與退貨', () => {
  it('依客戶要求的剩餘效期挑批號（超市要 200 天以上）', () => {
    loginAs('劉廠長')
    // 做一批只剩 100 天效期的麻油雞
    const p = itemByCode('F002')
    const wo = L.createWorkOrder({ product_id: p.id, plan_qty: 10 })
    loginAs('張師傅')
    L.feedMaterials(wo.id, L.woNeeds(wo))
    const lot = L.recordOutput(wo.id, { qty: 10 })
    loginAs('王老闆')
    update('lots', lot.id, { exp_date: L.addDays(L.today(), 100), qc_status: 'pass' })
    const so = findBy('sales_orders', 'customer_id', byCode('customers', 'C001').id)
    const pick = L.pickList(so.id, [{ item_id: p.id, qty: 44 }])
    expect(pick.every((a) => a.lot_no !== lot.lot_no)).toBe(true)
    expect(() => L.pickList(so.id, [{ item_id: p.id, qty: 50 }])).toThrow(/效期不足/)
  })
  it('不能超出訂單數量出貨', () => {
    const so = findBy('sales_orders', 'customer_id', byCode('customers', 'C001').id)
    loginAs('張師傅')
    expect(() => L.shipGoods({ sales_order_id: so.id, lines: [{ item_id: itemByCode('F002').id, qty: 81 }] })).toThrow(/超出訂單/)
  })
  it('開帳自動給發票號碼，同一出貨單不能開兩次', () => {
    const sh = where('shipments', (s) => !where('invoices', (i) => i.shipment_id === s.id).length)
    expect(sh.length).toBe(0)
    const inv = all('invoices')
    expect(new Set(inv.map((i) => i.gui_no)).size).toBe(inv.length)
    loginAs('林會計')
    expect(() => L.invoiceShipment(inv[0].shipment_id)).toThrow(/開過/)
  })
  it('銷貨退回：進待處理區、沖應收、不能退超過出貨量', () => {
    const r = where('returns', (r) => r.kind === 'sales')[0]
    expect(r.status).toBe('done')
    expect(where('stock_moves', (m) => m.ref_id === r.id)[0].bin_id).toBe(bin('Q-01'))
    loginAs('陳業務')
    expect(() => L.createSalesReturn({ shipment_id: r.shipment_id, lines: [{ ...r.lines[0], qty: 96 }], reason: 'x' })).toThrow(/最多可退 95/)
  })
})

describe('倉儲 WMS', () => {
  it('未 QC 合格的成品不能調到門市', () => {
    loginAs('周店長')
    const lot = L.pendingLots().find((l) => l.kind === 'product')
    expect(() => L.transfer({ from_bin_id: bin('P-A01'), to_bin_id: bin('S-01'), lines: [{ item_id: lot.item_id, qty: 1, lot_no: lot.lot_no }] })).toThrow(/QC/)
  })
  it('小額調整直接生效，大額調整需核准', () => {
    loginAs('張師傅')
    const lot = lotsOf('R003')[0]
    expect(L.adjustStock({ item_id: lot.item_id, lot_no: lot.lot_no, bin_id: bin('N-A01'), qty: -1, reason: '破損' }).pending).toBe(false)
    const ap = L.pendingApprovals().find((a) => a.type === 'adjust')
    const before = L.stockOf(ap.payload.item_id)
    loginAs('劉廠長')
    L.decideApproval(ap.id, true)
    expect(L.stockOf(ap.payload.item_id)).toBeCloseTo(before - 24)
  })
  it('盤點差異產生調整與傳票', () => {
    const st = all('stocktakes')[0]
    expect(st.status).toBe('posted')
    expect(where('stock_moves', (m) => m.ref_id === st.id).length).toBe(1)
  })
  it('過期批號不能用，並出現在效期預警', () => {
    const exp = L.expiringLots()
    expect(exp.some((l) => l.item_id === itemByCode('R005').id && L.isExpired(l))).toBe(true)
    expect(exp.some((l) => l.item_id === itemByCode('R006').id)).toBe(true)
  })
})

describe('門市 POS', () => {
  const shift = () => L.openShift()
  it('只能賣門市有庫存的品項與數量', () => {
    const cat = L.posCatalog(bin('S-01'))
    expect(cat.map((c) => c.item.code).sort()).toEqual(['F001', 'F002'])
    loginAs('小美')
    expect(() => L.posCheckout({ shift_id: shift().id, cart: [{ item_id: itemByCode('F003').id, qty: 1 }] })).toThrow(/不足/)
    const avail = cat.find((c) => c.item.code === 'F001').avail
    expect(() => L.posCheckout({ shift_id: shift().id, cart: [{ item_id: itemByCode('F001').id, qty: avail + 1 }] })).toThrow(/不足/)
  })
  it('收銀員折扣上限 10%，現金不足擋下，找零正確，會員累點', () => {
    loginAs('小美')
    const f2 = itemByCode('F002')
    expect(() => L.posCheckout({ shift_id: shift().id, cart: [{ item_id: f2.id, qty: 1 }], discount: 30 })).toThrow(/店長/)
    expect(() => L.posCheckout({ shift_id: shift().id, cart: [{ item_id: f2.id, qty: 1 }], received: 100 })).toThrow(/不足/)
    const m = byCode('customers', 'M0002')
    const s = L.posCheckout({ shift_id: shift().id, cart: [{ item_id: f2.id, qty: 2 }], received: 500, customer_id: m.id })
    expect(s.change).toBe(500 - 338)
    expect(get('customers', m.id).points).toBe(3)
    loginAs('周店長')
    expect(L.posCheckout({ shift_id: shift().id, cart: [{ item_id: f2.id, qty: 1 }], discount: 30 }).total).toBe(139)
  })
  it('作廢：店長核准後庫存回補、傳票沖銷', () => {
    const ap = L.pendingApprovals().find((a) => a.type === 'pos_void')
    const sale = get('pos_sales', ap.ref_id)
    const before = L.onHand({ bin_id: bin('S-01'), item_id: sale.lines[0].item_id })
    loginAs('周店長')
    L.decideApproval(ap.id, true)
    expect(get('pos_sales', sale.id).status).toBe('void')
    expect(L.onHand({ bin_id: bin('S-01'), item_id: sale.lines[0].item_id })).toBe(before + 2)
  })
  it('日結有待核准作廢時不能結；短少記入現金短溢', () => {
    loginAs('小美')
    expect(() => L.closeShift(shift().id, 0)).toThrow(/待店長核准/)
    const y = where('pos_shifts', (s) => s.status === 'closed')[0]
    expect(y.diff).toBe(-10)
    expect(where('journal', (j) => j.ref_id === y.id)[0].lines.find((l) => l.account === 6950).debit).toBe(10)
  })
})

describe('會計', () => {
  it('收款不能超過未收金額', () => {
    loginAs('林會計')
    const inv = all('invoices').find((i) => L.invoiceBalance(i) > 0)
    expect(() => L.receivePayment({ invoice_id: inv.id, amount: L.invoiceBalance(inv) + 1 })).toThrow(/超過/)
  })
  it('試算表平衡；損益表有營收與成本', () => {
    const b = L.balances()
    const d = L.round(L.sum(Object.values(b), (x) => x.debit))
    const c = L.round(L.sum(Object.values(b), (x) => x.credit))
    expect(d).toBe(c)
    const pl = L.profitAndLoss()
    expect(pl.revenue).toBeGreaterThan(0)
    expect(pl.cogs).toBeGreaterThan(0)
    expect(pl.returns).toBeGreaterThan(0)
  })
  it('POS 未日結不能關帳；關帳後不能再補登該期間', () => {
    loginAs('林會計')
    const until = L.addDays(L.today(), -2)
    expect(() => L.closePeriod(L.today())).toThrow(/POS 已日結/) // 今天的班別還沒日結
    L.closePeriod(until)
    expect(() => L.recordExpense({ account: 6900, amount: 100, date: until, memo: 'x' })).toThrow(/已關帳/)
    L.recordExpense({ account: 6900, amount: 100, date: L.today(), memo: 'x' })
    loginAs('陳業務')
    expect(() => L.closePeriod(L.today())).toThrow(/權限不足/)
  })
})

describe('食品追溯', () => {
  it('成品批號往上追到原料批號與供應商', () => {
    const sh = all('shipments')[0]
    const t = L.traceLot(sh.lines[0].lot_no)
    expect(t.kind).toBe('product')
    const leg = t.materials.find((m) => m.item_id === itemByCode('R001').id)
    expect(leg.supplier.code).toBe('S001')
    expect(leg.lot.supplier_lot).toBe('HY-0915-A')
  })
  it('原料批號往下追到成品、客戶與門市會員（召回名單）', () => {
    const raw = lotsOf('R001', 'raw').find((l) => l.supplier_lot === 'HY-0915-A')
    const t = L.traceLot(raw.lot_no)
    expect(t.products.length).toBeGreaterThanOrEqual(2)
    const names = t.recall.map((r) => r.customer?.name || '門市非會員')
    expect(names).toEqual(expect.arrayContaining(['小吃便當店（示範）', '好鮮超市（示範）', '王小姐']))
  })
})

describe('訂單進度', () => {
  it('已出貨收款的訂單顯示已完成，各階段都有關聯單據', () => {
    const so1 = findBy('sales_orders', 'customer_id', byCode('customers', 'C003').id)
    const p = L.orderProgress(so1.id)
    expect(p.status).toBe('已完成')
    expect(p.wos.length).toBe(1)
    expect(p.ships.length).toBe(1)
    expect(p.returns.length).toBe(1)
    expect(p.payments.length).toBe(1)
  })
})
