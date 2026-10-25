// 示範資料：一間做雞肉調理包的工廠（含工廠直營門市）。示範多階 BOM（醬汁半成品、禮盒組裝）與變化款料號。
// 全部用正式的業務邏輯跑出來，所以庫存、批號、帳務、簽核都彼此一致。
import { insert, update, clearAll, setPref, all, get, where, findBy, nowISO } from './store'
import * as L from '../logic'

const FULL = Object.fromEntries(Object.keys(L.MODULES).map((m) => [m, 3]))
const perms = (o) => Object.fromEntries(Object.keys(L.MODULES).map((m) => [m, o[m] || 0]))

export const DEMO_USERS = [
  ['王老闆', '管理者', '0000'],
  ['林會計', '會計', '1111'],
  ['陳業務', '業務', '2222'],
  ['黃經理', '業務主管', '2323'],
  ['吳採購', '採購', '3333'],
  ['劉廠長', '廠長', '4444'],
  ['張師傅', '現場人員', '5555'],
  ['李品管', '品管', '6666'],
  ['小美', '門市人員', '7777'],
  ['周店長', '店長', '8888'],
]

export async function seedDemo() {
  await clearAll()
  const base = { dashboard: 1, progress: 1, trace: 1 }
  const roles = {
    管理者: FULL,
    會計: perms({ ...base, accounting: 3, sales: 1, purchase: 1, shipping: 1, wms: 1, pos: 1, crm: 1, master: 1, qc: 1, production: 1 }),
    業務: perms({ ...base, crm: 2, sales: 2, shipping: 1, wms: 1, master: 1, production: 1, qc: 1, pos: 0 }),
    業務主管: perms({ ...base, crm: 3, sales: 3, shipping: 2, wms: 1, master: 1, production: 1, qc: 1, accounting: 1 }),
    採購: perms({ ...base, purchase: 2, wms: 1, master: 1, production: 1 }),
    廠長: perms({ ...base, production: 3, wms: 3, purchase: 3, qc: 1, shipping: 2, master: 2, trace: 2, sales: 1 }),
    現場人員: perms({ ...base, production: 2, wms: 2, shipping: 2, qc: 1 }),
    品管: perms({ ...base, qc: 3, trace: 2, production: 1, wms: 1, purchase: 1 }),
    門市人員: perms({ pos: 2 }),
    店長: perms({ dashboard: 1, pos: 3, wms: 2, crm: 1, trace: 1 }),
  }
  const roleIds = {}
  for (const [name, p] of Object.entries(roles)) roleIds[name] = insert('roles', { name, perms: p }).id
  const U = {}
  for (const [name, role, pin] of DEMO_USERS) U[name] = insert('users', { name, role_id: roleIds[role], pin, active: true }).id
  const as = (name, fn) => {
    setPref('userId', U[name])
    return fn()
  }
  setPref('userId', U.王老闆)

  // ---------- LINE / Telegram 通知綁定（示範） ----------
  const contact = (channel, external_id, display_name, user, role, extra = {}) =>
    insert('notify_contacts', {
      channel, external_id, display_name, picture_url: '', state: 'done', status: user ? 'approved' : 'pending', requested_role_id: roleIds[role],
      requested_name: user || '', user_id: user ? U[user] : '', muted: false, approved_by: user ? U.王老闆 : '', approved_at: user ? nowISO() : null, ...extra,
    })
  contact('line', 'demo-line-boss', '王大明', '王老闆', '管理者')
  contact('line', 'demo-line-factory', '劉廠長 Kevin', '劉廠長', '廠長')
  contact('line', 'demo-line-sales', '陳小陳', '陳業務', '業務')
  contact('telegram', 'demo-tg-qc', 'Lee QC', '李品管', '品管')
  contact('line', 'demo-line-new1', '阿明 🐣', null, '現場人員', { requested_name: '阿明' })
  contact('telegram', 'demo-tg-new2', 'Amy Lin', null, '門市人員', { requested_name: '林艾咪' })
  const d = (n) => L.addDays(L.today(), n)

  // ---------- 倉儲 ----------
  const wh = (code, name, kind, temp_zone, bins) => {
    const w = insert('warehouses', { code, name, kind, temp_zone, note: '' })
    return Object.fromEntries(bins.map((b) => [b, insert('bins', { code: b, warehouse_id: w.id, name: '', capacity: 0, active: true }).id]))
  }
  const B = {
    ...wh('W1', '原料冷凍庫', 'storage', '冷凍', ['F-A01', 'F-A02', 'F-B01']),
    ...wh('W2', '原料冷藏庫', 'storage', '冷藏', ['C-A01', 'C-A02']),
    ...wh('W3', '常溫倉', 'storage', '常溫', ['N-A01', 'N-B01']),
    ...wh('W4', '成品冷凍庫', 'storage', '冷凍', ['P-A01', 'P-A02']),
    ...wh('W5', '生產線', 'line', '', ['LINE-1']),
    ...wh('W6', '工廠直營門市', 'store', '冷凍', ['S-01']),
    ...wh('W7', '退貨待處理區', 'quarantine', '', ['Q-01']),
  }

  // ---------- 品項 ----------
  const it = (code, name, type, unit, cost, extra = {}) =>
    insert('items', {
      code, name, type, unit, cost, price: 0, min_price: 0, safety_stock: 0, pack_per_box: 1, shelf_days: 365, spec: '', barcode: '', alt_unit: '', alt_factor: 0,
      temp_zone: '常溫', default_bin_id: B['N-A01'], iqc_required: false, pos_enabled: false, pos_price: 0, bom: [], active: true, ...extra,
    })
  const leg = it('R001', '去骨雞腿肉', 'raw', 'kg', 165, { safety_stock: 100, spec: '冷凍 2kg/包', temp_zone: '冷凍', default_bin_id: B['F-A01'], alt_unit: '箱', alt_factor: 12, shelf_days: 180, iqc_required: true })
  const breast = it('R002', '雞胸肉', 'raw', 'kg', 120, { safety_stock: 50, temp_zone: '冷凍', default_bin_id: B['F-A02'], alt_unit: '箱', alt_factor: 10, shelf_days: 180, iqc_required: true })
  const wine = it('R003', '米酒', 'raw', '瓶', 45, { safety_stock: 30, spec: '600ml', alt_unit: '箱', alt_factor: 12 })
  const sesame = it('R004', '黑麻油', 'raw', '瓶', 180, { safety_stock: 20, spec: '500ml' })
  const ginger = it('R005', '老薑', 'raw', 'kg', 90, { safety_stock: 20, temp_zone: '冷藏', default_bin_id: B['C-A01'], shelf_days: 21 })
  const basil = it('R006', '九層塔', 'raw', 'kg', 150, { safety_stock: 5, temp_zone: '冷藏', default_bin_id: B['C-A02'], shelf_days: 7 })
  // 同一種醬油不同口味 → 不同料號（同一個系列 family_code）
  const soy = it('R007', '醬油（甘味）', 'raw', '瓶', 60, { safety_stock: 20, category: '調味料', family_code: 'SOY', variant_attr: '口味', variant_value: '甘味' })
  const soyLite = it('R008', '醬油（薄鹽）', 'raw', '瓶', 65, { safety_stock: 6, category: '調味料', family_code: 'SOY', variant_attr: '口味', variant_value: '薄鹽' })
  const pepper = it('R009', '花椒', 'raw', 'kg', 400, { category: '調味料', shelf_days: 365 })
  const chili = it('R010', '乾辣椒', 'raw', 'kg', 200, { category: '調味料', shelf_days: 365 })
  const bag = it('P001', '真空調理袋', 'pack', '個', 3, { safety_stock: 2000, default_bin_id: B['N-B01'], alt_unit: '捆', alt_factor: 500, shelf_days: 1000 })
  const box = it('P002', '外箱（20入）', 'pack', '個', 15, { safety_stock: 200, default_bin_id: B['N-B01'], shelf_days: 1000 })
  const giftCase = it('P003', '禮盒紙盒', 'pack', '個', 35, { category: '禮盒零件', default_bin_id: B['N-B01'], shelf_days: 0 })
  const giftBag = it('P004', '禮盒提袋', 'pack', '個', 8, { category: '禮盒零件', default_bin_id: B['N-B01'], shelf_days: 0 })
  const bom = (rows) => rows.map(([item, qty]) => ({ item_id: item.id, qty }))
  const prod = { type: 'product', temp_zone: '冷凍', default_bin_id: B['P-A01'], alt_unit: '箱', pos_enabled: true }
  const sanbei = it('F001', '三杯雞調理包', 'product', '包', 70, {
    ...prod, price: 120, min_price: 100, pos_price: 150, pack_per_box: 20, alt_factor: 20, shelf_days: 365, spec: '450g/包 冷凍', barcode: '4710000000011',
    bom: bom([[leg, 0.3], [wine, 0.05], [sesame, 0.03], [soy, 0.04], [ginger, 0.02], [basil, 0.01], [bag, 1], [box, 0.05]]),
  })
  const mayou = it('F002', '麻油雞調理包', 'product', '包', 80, {
    ...prod, price: 135, min_price: 115, pos_price: 169, pack_per_box: 20, alt_factor: 20, shelf_days: 365, spec: '500g/包 冷凍', barcode: '4710000000028',
    bom: bom([[leg, 0.32], [wine, 0.1], [sesame, 0.05], [ginger, 0.04], [bag, 1], [box, 0.05]]),
  })
  const shred = it('F003', '舒肥雞胸', 'product', '包', 40, {
    ...prod, price: 65, min_price: 55, pos_price: 79, pack_per_box: 40, alt_factor: 40, shelf_days: 180, spec: '150g/包 冷凍', barcode: '4710000000035', default_bin_id: B['P-A02'],
    bom: bom([[breast, 0.17], [bag, 1], [box, 0.025]]),
  })

  // 半成品：麻辣醬汁先做一大鍋，再給調理包用（不需要成品抽檢）
  const sauce = it('S001', '麻辣醬汁', 'semi', 'kg', 0, {
    category: '醬汁', temp_zone: '冷藏', default_bin_id: B['C-A02'], shelf_days: 30, qc_required: false, spec: '半成品・冷藏',
    bom: bom([[soyLite, 0.5], [sesame, 0.2], [pepper, 0.05], [chili, 0.1]]),
  })
  const mala = it('F004', '麻辣雞丁調理包', 'product', '包', 0, {
    ...prod, category: '調理包', price: 140, min_price: 120, pos_price: 169, pack_per_box: 20, alt_factor: 20, shelf_days: 365, spec: '450g/包 冷凍', barcode: '4710000000042',
    bom: bom([[leg, 0.3], [sauce, 0.08], [bag, 1], [box, 0.05]]),
  })
  // 組裝品：禮盒用成品當零件，效期取裡面最早到期的那一包
  const gift = it('G001', '中秋團圓禮盒', 'product', '盒', 0, {
    ...prod, category: '禮盒', price: 699, min_price: 599, pos_price: 799, alt_unit: '', alt_factor: 0, shelf_days: 0, spec: '三杯雞 ×2、麻油雞 ×2、紙盒、提袋',
    default_bin_id: B['P-A02'], exp_rule: 'min_component', qc_template: '組裝成品', barcode: '4710000000059',
    bom: bom([[sanbei, 2], [mayou, 2], [giftCase, 1], [giftBag, 1]]),
  })
  for (const p of [sanbei, mayou, shred]) update('items', p.id, { category: '調理包' })

  // ---------- 供應商 / 價格表 / 客戶 ----------
  const su = (code, name, contact, phone, terms_days, certs) => insert('suppliers', { code, name, contact, phone, terms_days, certs, rating: 'A', address: '', tax_id: '', note: '' })
  const s1 = su('S001', '鴻運禽肉行（示範）', '劉先生', '04-2233-4455', 30, 'CAS、HACCP')
  const s2 = su('S002', '金香調味批發（示範）', '蔡小姐', '04-2666-7788', 30, 'ISO 22000')
  const s3 = su('S003', '新亞包材（示範）', '許先生', '02-2999-1234', 60, '食品級包材檢驗')
  const plMarket = insert('price_lists', { name: '量販通路價', lines: [{ item_id: sanbei.id, price: 112 }, { item_id: mayou.id, price: 126 }], note: '月量 300 包以上' })

  const cu = (data) => L.saveCustomer({ kind: 'company', status: '往來中', terms_days: 30, credit_limit: 0, min_shelf_days: 0, contacts: [], points: 0, tags: '', source: '', email: '', tax_id: '', note: '', ...data })
  const c1 = cu({ code: 'C001', name: '好鮮超市（示範）', level: 'A', contact: '吳經理', phone: '02-2345-6789', address: '台北市信義區示範路 1 號', terms_days: 15, credit_limit: 300000, price_list_id: plMarket.id, owner_id: U.陳業務, min_shelf_days: 200, source: '展覽', contacts: [{ name: '吳經理', title: '採購經理', phone: '0911-111-111' }, { name: '倉管阿德', title: '收貨', phone: '0911-222-333' }] })
  const c2 = cu({ code: 'C002', name: '大和團膳（示範）', level: 'VIP', contact: '黃小姐', phone: '03-345-6789', address: '桃園市中壢區示範街 88 號', terms_days: 45, credit_limit: 500000, owner_id: U.黃經理, min_shelf_days: 60, source: '轉介紹' })
  const c3 = cu({ code: 'C003', name: '小吃便當店（示範）', level: 'B', contact: '鄭老闆', phone: '0912-345-678', address: '新竹市東區示範巷 5 號', terms_days: 30, credit_limit: 20000, owner_id: U.陳業務, source: '業務開發' })
  const c4 = cu({ code: 'C004', name: '山海餐酒館（示範）', level: 'C', status: '潛在客戶', contact: '林主廚', phone: '0933-000-111', address: '台中市西區示範路 9 號', owner_id: U.陳業務, source: '網站詢問' })
  const m1 = L.saveCustomer({ kind: 'member', code: 'M0001', name: '王小姐', phone: '0988-123-456', level: 'C', status: '往來中', terms_days: 0, points: 12 })
  L.saveCustomer({ kind: 'member', code: 'M0002', name: '李先生', phone: '0977-654-321', level: 'C', status: '往來中', terms_days: 0, points: 0 })

  // ---------- 期初 ----------
  L.postJournal({ date: d(-30), memo: '期初資本', lines: [{ account: 1100, debit: 3000000 }, { account: 3100, credit: 3000000 }] })
  const receiveAll = (po, date, extra = {}) => L.receiveGoods({ purchase_order_id: po.id, date, lines: po.lines.map((l) => ({ item_id: l.item_id, qty: l.qty, ...(extra[l.item_id] || {}) })) })

  const seasoningPO = as('吳採購', () => L.savePurchaseOrder({ supplier_id: s2.id, date: d(-26), due_date: d(-24), lines: [
    { item_id: wine.id, qty: 72, price: 45 }, { item_id: sesame.id, qty: 30, price: 180 }, { item_id: soy.id, qty: 30, price: 60 }, { item_id: ginger.id, qty: 30, price: 90 },
  ], note: '期初備料' }))
  const b0 = as('張師傅', () => receiveAll(seasoningPO, d(-24)).bill)
  as('林會計', () => L.payBill({ bill_id: b0.id, amount: b0.total, date: d(-10) }))
  const packPO = as('吳採購', () => L.savePurchaseOrder({ supplier_id: s3.id, date: d(-26), lines: [{ item_id: bag.id, qty: 5000, price: 3 }, { item_id: box.id, qty: 300, price: 15 }] }))
  as('張師傅', () => receiveAll(packPO, d(-23)))
  // 九層塔效期很短，示範效期預警
  const basilPO = as('吳採購', () => L.savePurchaseOrder({ supplier_id: s2.id, date: d(-6), lines: [{ item_id: basil.id, qty: 8, price: 150 }, { item_id: ginger.id, qty: 10, price: 95 }] }))
  as('張師傅', () => L.receiveGoods({ purchase_order_id: basilPO.id, date: d(-5), lines: [{ item_id: basil.id, qty: 8, supplier_lot: 'B-1019', exp_date: d(3) }, { item_id: ginger.id, qty: 10 }] }))

  // 雞肉要進料檢驗
  const meatPO = as('吳採購', () => L.savePurchaseOrder({ supplier_id: s1.id, date: d(-25), lines: [{ item_id: leg.id, qty: 240, price: 165 }, { item_id: breast.id, qty: 40, price: 120 }] }))
  const meat = as('張師傅', () => L.receiveGoods({ purchase_order_id: meatPO.id, date: d(-22), lines: [
    { item_id: leg.id, qty: 240, supplier_lot: 'HY-0915-A', mfg_date: d(-28), exp_date: d(150) },
    { item_id: breast.id, qty: 40, supplier_lot: 'HY-0915-B', mfg_date: d(-28), exp_date: d(150) },
  ] }))
  const iqc = (lot, ok, note = '') =>
    as('李品管', () => L.saveInspection({ lot_no: lot.lot_no, sample_size: 3, defect_qty: ok ? 0 : 1, result: ok ? 'pass' : 'fail', note, checks: L.IQC_CHECKS.map((c, i) => ({ ...c, value: i === 0 ? '-18°C' : '', pass: ok || i !== 0 })) }))
  iqc(meat.lots[0], true)
  iqc(meat.lots[1], false, '到貨溫度 -8°C，不符規定')
  // 不合格的雞胸退回供應商
  as('吳採購', () => L.purchaseReturn({ lot_no: meat.lots[1].lot_no, bin_id: B['F-A02'], qty: 40, reason: 'IQC 不合格：到貨溫度過高', date: d(-21) }))

  const fqc = (lotNo, ok = true) =>
    as('李品管', () => L.saveInspection({ lot_no: lotNo, sample_size: 5, defect_qty: ok ? 0 : 2, result: ok ? 'pass' : 'fail', checks: L.DEFAULT_CHECKS.map((c, i) => ({ ...c, value: i === 2 ? '82°C' : '', pass: ok || i !== 0 })) }))
  const produce = (so, product, qty, date, { output = true, qc = true, extra = 4 } = {}) => {
    const wo = as('劉廠長', () => L.createWorkOrder({ sales_order_id: so?.id, product_id: product.id, plan_qty: qty, plan_date: date, line: product === mayou || product === sauce ? '一號蒸煮鍋' : '二號炒鍋' }))
    as('張師傅', () => {
      L.issueMaterials(wo.id, L.woNeeds(wo), { date })
      L.feedMaterials(wo.id, L.woNeeds(wo), { date })
    })
    if (!output) return wo
    const lot = as('張師傅', () => L.recordOutput(wo.id, { qty: qty + extra, waste: 1.5, date }))
    if (qc && lot.qc_status === 'pending') fqc(lot.lot_no)
    return get('work_orders', wo.id)
  }

  // ---------- 訂單 1：便當店，已出貨、收款，之後有一筆退貨 ----------
  const so1 = as('陳業務', () => L.saveSalesOrder({ customer_id: c3.id, date: d(-20), due_date: d(-15), lines: [{ item_id: sanbei.id, qty: 100, price: 120 }] }))
  const wo1 = produce(so1, sanbei, 100, d(-18))
  as('劉廠長', () => L.closeWorkOrder(wo1.id, { date: d(-18) }))
  const sh1 = as('張師傅', () => L.shipGoods({ sales_order_id: so1.id, lines: [{ item_id: sanbei.id, qty: 100 }], pack_mode: '保冷箱', carrier: '黑貓冷凍（示範）', date: d(-17) }))
  const inv1 = as('林會計', () => L.invoiceShipment(sh1.id))
  as('林會計', () => L.receivePayment({ invoice_id: inv1.id, amount: inv1.total, date: d(-8) }))
  const sr = as('陳業務', () => L.createSalesReturn({ shipment_id: sh1.id, lines: [{ item_id: sanbei.id, lot_no: sh1.lines[0].lot_no, qty: 5 }], disposition: 'restock', reason: '外箱壓損，客戶退回 5 包', date: d(-7) }))
  as('黃經理', () => L.decideApproval(L.pendingFor(sr.id).id, true, '確認為物流壓損'))

  // ---------- 訂單 2：超市，麻油雞已 QC 合格並部分出貨；三杯雞待 QC ----------
  const so2 = as('陳業務', () => L.saveSalesOrder({ customer_id: c1.id, date: d(-12), due_date: d(2), lines: [{ item_id: mayou.id, qty: 200, price: L.priceFor(c1.id, mayou.id) }, { item_id: sanbei.id, qty: 100, price: L.priceFor(c1.id, sanbei.id) }], note: '冷凍配送，早上 9 點前到' }))
  const legPO = as('吳採購', () => L.savePurchaseOrder({ supplier_id: s1.id, sales_order_id: so2.id, date: d(-12), lines: [{ item_id: leg.id, qty: 120, price: 162 }] }))
  const leg2 = as('張師傅', () => L.receiveGoods({ purchase_order_id: legPO.id, date: d(-11), lines: [{ item_id: leg.id, qty: 120, supplier_lot: 'HY-1003-A', mfg_date: d(-13), exp_date: d(160) }] }))
  iqc(leg2.lots[0], true)
  const wo2 = produce(so2, mayou, 200, d(-9))
  as('劉廠長', () => L.closeWorkOrder(wo2.id, { date: d(-9) }))
  produce(so2, sanbei, 100, d(-1), { qc: false })
  const sh2 = as('張師傅', () => L.shipGoods({ sales_order_id: so2.id, lines: [{ item_id: mayou.id, qty: 120 }], pack_mode: '冷凍貨櫃', container_no: 'KLH-2381', carrier: '新竹物流（示範）', date: d(-8) }))
  as('林會計', () => L.invoiceShipment(sh2.id))

  // ---------- 訂單 3：團膳，剛接單，雞胸已下單未到 ----------
  const so3 = as('黃經理', () => L.saveSalesOrder({ customer_id: c2.id, date: d(0), due_date: d(10), lines: [{ item_id: shred.id, qty: 400, price: 65 }] }))
  as('吳採購', () => L.savePurchaseOrder({ supplier_id: s1.id, sales_order_id: so3.id, date: d(0), due_date: d(2), lines: [{ item_id: breast.id, qty: 70, price: 120 }] }))
  as('劉廠長', () => L.createWorkOrder({ sales_order_id: so3.id, product_id: shred.id, plan_qty: 400, plan_date: d(3), line: '包裝線' }))

  // ---------- 多階：麻辣醬汁（半成品）→ 麻辣雞丁調理包 ----------
  const spicePO = as('吳採購', () => L.savePurchaseOrder({ supplier_id: s2.id, date: d(-7), lines: [{ item_id: soyLite.id, qty: 24, price: 65 }, { item_id: pepper.id, qty: 3, price: 400 }, { item_id: chili.id, qty: 5, price: 200 }] }))
  as('張師傅', () => receiveAll(spicePO, d(-6)))
  const giftPO = as('吳採購', () => L.savePurchaseOrder({ supplier_id: s3.id, date: d(-7), lines: [{ item_id: giftCase.id, qty: 60, price: 35 }, { item_id: giftBag.id, qty: 60, price: 8 }] }))
  as('張師傅', () => receiveAll(giftPO, d(-6)))
  const woSauce = produce(null, sauce, 20, d(-4), { extra: 0 })
  as('劉廠長', () => L.closeWorkOrder(woSauce.id, { date: d(-4) }))
  const woMala = produce(null, mala, 60, d(-3), { extra: 0 })
  as('劉廠長', () => L.closeWorkOrder(woMala.id, { date: d(-3) }))
  // 禮盒訂單：依訂單開工單會自動開出不夠的三杯雞（半成品 / 組件）工單，再開禮盒工單
  const so4 = as('陳業務', () => L.saveSalesOrder({ customer_id: c1.id, date: d(0), due_date: d(12), lines: [{ item_id: gift.id, qty: 30, price: 650 }], note: '中秋禮盒，附賀卡' }))
  as('劉廠長', () => L.planWorkOrders(so4.id))

  // ---------- 待簽核示範 ----------
  // 便當店信用額度只有 2 萬，再下大單會卡簽核
  as('陳業務', () => L.saveSalesOrder({ customer_id: c3.id, date: d(0), due_date: d(5), lines: [{ item_id: mayou.id, qty: 180, price: 130 }], note: '中秋檔期備貨' }))
  // 大額採購
  as('吳採購', () => L.savePurchaseOrder({ supplier_id: s1.id, date: d(0), due_date: d(5), lines: [{ item_id: leg.id, qty: 400, price: 160 }], note: '年節備料' }))

  // ---------- 請購單 ----------
  const rq1 = as('張師傅', () => L.saveRequisition({ date: d(-7), need_date: d(-4), lines: [{ item_id: soy.id, qty: 12 }], reason: '醬油快用完' }))
  const rqPO = as('吳採購', () => L.convertRequisition(rq1.id))[0]
  as('張師傅', () => L.receiveGoods({ purchase_order_id: rqPO.id, lines: [{ item_id: soy.id, qty: 12 }], date: d(-4) }))
  as('劉廠長', () => L.saveRequisition({ date: d(0), need_date: d(3), lines: [{ item_id: sesame.id, qty: 24, note: '中秋檔期' }, { item_id: box.id, qty: 200 }], reason: '中秋檔期備料' }))

  // ---------- 門市：補貨 → 開班 → 銷售 ----------
  as('周店長', () => L.transfer({ from_bin_id: B['P-A01'], to_bin_id: B['S-01'], lines: [{ item_id: mayou.id, qty: 40 }], reason: '門市補貨', date: d(-6) }))
  // 退回的三杯雞 QC 複檢合格後放行回成品倉，再送到門市
  const rLot = sh1.lines[0].lot_no
  as('周店長', () => L.transfer({ from_bin_id: B['Q-01'], to_bin_id: B['P-A01'], lines: [{ item_id: sanbei.id, qty: 5, lot_no: rLot }], reason: '退貨複檢合格放行', date: d(-6) }))
  as('周店長', () => L.transfer({ from_bin_id: B['P-A01'], to_bin_id: B['S-01'], lines: [{ item_id: sanbei.id, qty: 4 }], reason: '門市補貨', date: d(-6) }))
  const shiftY = as('小美', () => L.startShift({ bin_id: B['S-01'], opening_cash: 3000 }))
  as('小美', () => {
    L.posCheckout({ shift_id: shiftY.id, cart: [{ item_id: mayou.id, qty: 2 }], method: '現金', received: 500, customer_id: m1.id, date: d(-1) })
    L.posCheckout({ shift_id: shiftY.id, cart: [{ item_id: sanbei.id, qty: 1 }, { item_id: mayou.id, qty: 1 }], method: 'LINE Pay', date: d(-1) })
    L.posCheckout({ shift_id: shiftY.id, cart: [{ item_id: mayou.id, qty: 3 }], method: '現金', received: 1000, date: d(-1) })
  })
  as('小美', () => L.closeShift(shiftY.id, 3000 + 338 + 507 - 10, '少 10 元'))
  const shiftT = as('小美', () => L.startShift({ bin_id: B['S-01'], opening_cash: 3000 }))
  const s4 = as('小美', () => L.posCheckout({ shift_id: shiftT.id, cart: [{ item_id: mayou.id, qty: 2 }], method: '現金', received: 400 }))
  as('小美', () => L.posCheckout({ shift_id: shiftT.id, cart: [{ item_id: mayou.id, qty: 1 }, { item_id: sanbei.id, qty: 1 }], method: '信用卡', customer_id: m1.id }))
  as('小美', () => L.voidSale(s4.id, '客人改刷卡'))

  // ---------- 倉儲：盤點與待核准調整 ----------
  const st = as('張師傅', () => L.createStocktake(findBy('warehouses', 'code', 'W3').id))
  as('張師傅', () => {
    const soyLine = st.lines.find((l) => l.item_id === soy.id)
    L.saveCount(st.id, st.lines.map((l) => ({ ...l, counted_qty: l === soyLine ? l.system_qty - 1 : l.system_qty })))
    L.submitStocktake(st.id)
  })
  as('張師傅', () => L.adjustStock({ item_id: leg.id, bin_id: B['F-A01'], lot_no: meat.lots[0].lot_no, qty: -24, reason: '冷凍庫門未關，2 箱解凍報廢' }))

  // ---------- CRM ----------
  as('陳業務', () => {
    L.logActivity({ customer_id: c1.id, type: '拜訪', date: d(-14), summary: '介紹麻油雞新品，吳經理有興趣上架', next_action: '寄報價單', next_date: d(-12) })
    L.logActivity({ customer_id: c3.id, type: '電話', date: d(-3), summary: '鄭老闆反映上次外箱壓損，已安排退貨', next_action: '確認新一批到貨狀況', next_date: d(0) })
    L.logActivity({ customer_id: c4.id, type: '試吃 / 送樣', date: d(-4), summary: '送三杯雞、麻油雞各 5 包試吃', next_action: '回訪試吃意見', next_date: d(1) })
    const opp = L.saveOpportunity({ customer_id: c4.id, title: '山海餐酒館 年度調理包合作', stage: '送樣試吃', amount: 180000, expected_date: d(30) })
    const q = L.saveQuotation({ customer_id: c4.id, opportunity_id: opp.id, date: d(-2), lines: [{ item_id: sanbei.id, qty: 200, price: 118 }, { item_id: mayou.id, qty: 200, price: 132 }], note: '月結 30 天，免運' })
    L.saveQuotation({ ...q, status: 'sent' }, q.id)
    L.saveOpportunity({ customer_id: c2.id, title: '大和團膳 舒肥雞胸長約', stage: '議價', amount: 420000, expected_date: d(14) })
  })
  as('黃經理', () => {
    L.logActivity({ customer_id: c2.id, type: '拜訪', date: d(-1), summary: '確認 400 包舒肥雞胸交期，客戶要求剩餘效期 60 天以上', next_action: '出貨前電話通知', next_date: d(9) })
    const q2 = L.saveQuotation({ customer_id: c2.id, date: d(-15), lines: [{ item_id: shred.id, qty: 400, price: 65 }] })
    L.saveQuotation({ ...q2, status: 'accepted' }, q2.id)
  })

  // ---------- 費用 ----------
  as('林會計', () => {
    L.recordExpense({ account: 6200, amount: 18500, date: d(-3), memo: '本月水電瓦斯' })
    L.recordExpense({ account: 6100, amount: 62000, date: d(-1), memo: '現場人員薪資（半月）' })
    L.recordExpense({ account: 6400, amount: 28000, date: d(-20), memo: '廠房租金' })
  })

  // 示範資料產生的通知只供預覽，切到雲端後不會真的送出
  for (const n of all('notifications')) update('notifications', n.id, { status: 'demo' })
  setPref('userId', '')
  return all('items').length
}

export { where }
