import { describe, it, expect, beforeEach } from 'vitest'
import { get, where } from '../src/db/store'
import * as L from '../src/logic'
import { freshDemo, loginAs, byCode, itemByCode } from './helpers'

beforeEach(async () => {
  await freshDemo()
  loginAs('王老闆')
})

describe('多階 BOM 與半成品', () => {
  it('BOM 樹狀展開到每一層（禮盒 → 調理包 → 原料）', () => {
    const tree = L.bomTree(itemByCode('G001').id, 10)
    const sanbei = tree.find((n) => n.item_id === itemByCode('F001').id)
    expect(sanbei.qty).toBe(20)
    const leg = sanbei.children.find((n) => n.item_id === itemByCode('R001').id)
    expect(leg.qty).toBe(6) // 20 包 × 0.3kg
    expect(leg.level).toBe(1)
  })

  it('用途查詢：薄鹽醬油 → 麻辣醬汁 → 麻辣雞丁', () => {
    const used = L.whereUsed(itemByCode('R008').id)
    expect(used.map((u) => get('items', u.item_id).code)).toEqual(['S001', 'F004'])
    expect(used[1].level).toBe(1)
  })

  it('標準成本多階加總', () => {
    const sauce = L.bomCost(itemByCode('S001').id)
    expect(sauce).toBeGreaterThan(0)
    const mala = L.bomCost(itemByCode('F004').id)
    expect(mala).toBeCloseTo(0.3 * L.lastCost(itemByCode('R001').id) + 0.08 * sauce + 1 * 3 + 0.05 * 15, 2)
  })

  it('BOM 不能形成迴圈', () => {
    const sauce = itemByCode('S001')
    const mala = itemByCode('F004')
    expect(() => L.saveMaster('items', { ...sauce, bom: [...sauce.bom, { item_id: mala.id, qty: 1 }] }, sauce.id)).toThrow(/迴圈/)
    expect(() => L.saveMaster('items', { ...sauce, bom: [{ item_id: sauce.id, qty: 1 }] }, sauce.id)).toThrow(/自己/)
  })

  it('外購料不能設定 BOM；半成品可以開工單', () => {
    const soy = itemByCode('R007')
    expect(() => L.saveMaster('items', { ...soy, bom: [{ item_id: itemByCode('R003').id, qty: 1 }] }, soy.id)).toThrow(/只有成品或半成品/)
    const wo = L.createWorkOrder({ product_id: itemByCode('S001').id, plan_qty: 5 })
    expect(wo.status).toBe('planned')
  })

  it('半成品不需 QC 時產出直接合格，可以被下一層領用', () => {
    const lot = where('lots', (l) => l.item_id === itemByCode('S001').id)[0]
    expect(lot.kind).toBe('semi')
    expect(lot.qc_status).toBe('pass')
    expect(lot.exp_date).toBe(L.addDays(lot.mfg_date, 30))
    const mala = where('work_orders', (w) => w.product_id === itemByCode('F004').id)[0]
    expect(mala.feeds.some((f) => f.lot_no === lot.lot_no)).toBe(true)
    expect(L.stockOf(itemByCode('F004').id)).toBe(60)
  })

  it('多階淨需求：下層半成品先扣庫存，不夠才自製', () => {
    const { make, buy } = L.explodeNeeds([{ item_id: itemByCode('F004').id, qty: 100 }])
    const sauceStock = L.stockOf(itemByCode('S001').id)
    // 100 包要 8kg 醬汁，庫存 20 - 60×0.08 = 15.2kg 足夠 → 不用再做醬汁、也不用買醬油
    expect(sauceStock).toBeCloseTo(15.2, 3)
    expect(make[itemByCode('S001').id]).toBeUndefined()
    expect(buy[itemByCode('R008').id]).toBeUndefined()
    const big = L.explodeNeeds([{ item_id: itemByCode('F004').id, qty: 300 }])
    expect(big.make[itemByCode('S001').id]).toBeCloseTo(24 - 15.2, 3)
    expect(big.buy[itemByCode('R008').id]).toBeCloseTo((24 - 15.2) * 0.5, 3)
  })

  it('依訂單開工單：禮盒訂單先開不夠的組件工單，再開禮盒工單', () => {
    const so = where('sales_orders', (s) => s.lines.some((l) => l.item_id === itemByCode('G001').id))[0]
    const wos = where('work_orders', (w) => w.sales_order_id === so.id)
    const giftWO = wos.find((w) => w.product_id === itemByCode('G001').id)
    const subs = wos.filter((w) => w !== giftWO)
    expect(giftWO.plan_qty).toBe(30)
    expect(subs.length).toBeGreaterThan(0)
    for (const w of subs) expect(w.plan_date < giftWO.plan_date).toBe(true)
    // 再按一次不會重開
    expect(L.planWorkOrders(so.id)).toEqual([])
  })

  it('禮盒組裝：效期取最早到期的組件、追溯可以從原料一路追到禮盒', () => {
    const f1 = itemByCode('F001')
    const f2 = itemByCode('F002')
    const gift = itemByCode('G001')
    // 先做一批三杯雞讓禮盒有料
    const w1 = L.createWorkOrder({ product_id: f1.id, plan_qty: 4 })
    L.issueMaterials(w1.id, L.woNeeds(w1))
    L.feedMaterials(w1.id, L.woNeeds(w1))
    const l1 = L.recordOutput(w1.id, { qty: 4 })
    L.saveInspection({ lot_no: l1.lot_no, sample_size: 1, defect_qty: 0, result: 'pass', checks: [] })
    const wo = L.createWorkOrder({ product_id: gift.id, plan_qty: 2 })
    L.issueMaterials(wo.id, L.woNeeds(wo))
    L.feedMaterials(wo.id, L.woNeeds(wo))
    const lot = L.recordOutput(wo.id, { qty: 2 })
    const fedLots = get('work_orders', wo.id).feeds.map((f) => L.lotByNo(f.lot_no)).filter((l) => l.exp_date)
    expect(lot.exp_date).toBe(fedLots.map((l) => l.exp_date).sort()[0])
    expect(lot.qc_status).toBe('pending')
    expect(L.checksForLot(lot)[0].name).toBe('外觀')
    // 往上：禮盒 → 調理包批號 → 雞腿肉批號
    const t = L.traceLot(lot.lot_no)
    expect(t.materials.some((m) => m.item_id === f2.id && m.children.some((c) => c.item_id === itemByCode('R001').id))).toBe(true)
    expect(t.sources.some((s) => s.supplier)).toBe(true)
    // 往下：雞腿肉批號會追到禮盒
    const legLot = t.sources.find((s) => s.item_id === itemByCode('R001').id).lot_no
    expect(L.traceLot(legLot).allUsing.some((u) => u.lot.lot_no === lot.lot_no)).toBe(true)
    // 帳務：領用成品組件記 1310，傳票平衡
    const issue = where('journal', (j) => j.ref_id === wo.id && j.memo.startsWith('領料'))[0]
    expect(issue.lines.some((l) => l.account === 1310 && l.credit > 0)).toBe(true)
    expect(issue.lines.some((l) => l.account === 1300 && l.credit > 0)).toBe(true)
  })
})

describe('變化款料號', () => {
  it('同系列不同口味各自是一個料號、各自有庫存', () => {
    const fam = L.familyOf(itemByCode('R007'))
    expect(fam.map((i) => i.variant_value).sort()).toEqual(['甘味', '薄鹽'])
    expect(L.stockOf(itemByCode('R007').id)).not.toBe(L.stockOf(itemByCode('R008').id))
  })

  it('一次建立多個變化款', () => {
    const made = L.createVariants(itemByCode('F001').id, '辣度', ['小辣', '大辣', '小辣'])
    expect(made).toHaveLength(2)
    expect(made[0].code).toBe('F001-01')
    expect(made[0].name).toBe('三杯雞調理包（小辣）')
    expect(made[0].bom).toEqual(itemByCode('F001').bom)
    expect(made[0].barcode).toBe('')
    expect(L.stockOf(made[0].id)).toBe(0)
    expect(() => L.createVariants(itemByCode('F001').id, '辣度', ['大辣'])).toThrow(/已經有料號/)
  })

  it('同系列同一個選項不能重複', () => {
    const r8 = itemByCode('R008')
    expect(() => L.saveMaster('items', { ...r8, variant_value: '甘味' }, r8.id)).toThrow(/同系列/)
  })
})

describe('檢驗範本', () => {
  it('品項指定範本、沒指定依來源', () => {
    expect(L.checksFor(itemByCode('G001'), 'FQC')[1].name).toBe('組裝完整')
    expect(L.checksFor(itemByCode('R001'), 'IQC')[0].name).toBe('到貨溫度')
    L.setSetting('qc_templates', { ...L.QC_TEMPLATE_DEFAULTS, 零件進料: [{ name: '尺寸', standard: '±0.1mm' }] })
    expect(L.checksFor({ qc_template: '零件進料' }, 'IQC')).toEqual([{ name: '尺寸', standard: '±0.1mm' }])
  })

  it('訂單只能賣自製品；採購單不能買自製品', () => {
    const c = byCode('customers', 'C002')
    expect(() => L.saveSalesOrder({ customer_id: c.id, lines: [{ item_id: itemByCode('R001').id, qty: 1, price: 100 }] })).toThrow(/自製/)
    expect(() => L.savePurchaseOrder({ supplier_id: byCode('suppliers', 'S001').id, lines: [{ item_id: itemByCode('S001').id, qty: 1, price: 1 }] })).toThrow(/原料、包材或零件/)
  })
})
