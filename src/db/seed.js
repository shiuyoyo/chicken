// 示範資料：一間做雞肉調理包的食品工廠，含幾張走到不同階段的訂單。
import { insert, clearAll, setPref, all } from './store'
import {
  saveSalesOrder, savePurchaseOrder, receiveGoods, createWorkOrder, issueMaterials, feedMaterials,
  recordOutput, saveInspection, shipGoods, invoiceShipment, receivePayment, payBill, recordExpense,
  postJournal, woNeeds, DEFAULT_CHECKS, today, addDays,
} from '../logic'

export async function seedDemo() {
  await clearAll()
  const u = (name, role) => insert('users', { name, role, pin: '', active: true })
  const boss = u('王老闆', '管理者')
  u('林會計', '會計')
  u('陳業務', '業務')
  u('張師傅', '現場')
  u('李品管', '品管')
  setPref('userId', boss.id)

  const it = (code, name, type, unit, cost, extra = {}) =>
    insert('items', { code, name, type, unit, cost, price: 0, safety_stock: 0, pack_per_box: 1, shelf_days: 0, spec: '', bom: [], active: true, ...extra })
  const leg = it('R001', '去骨雞腿肉', 'raw', 'kg', 165, { safety_stock: 100, spec: '冷凍 2kg/包' })
  const breast = it('R002', '雞胸肉', 'raw', 'kg', 120, { safety_stock: 50 })
  const wine = it('R003', '米酒', 'raw', '瓶', 45, { safety_stock: 30, spec: '600ml' })
  const sesame = it('R004', '黑麻油', 'raw', '瓶', 180, { safety_stock: 20, spec: '500ml' })
  const ginger = it('R005', '老薑', 'raw', 'kg', 90, { safety_stock: 20 })
  const basil = it('R006', '九層塔', 'raw', 'kg', 150, { safety_stock: 5 })
  const soy = it('R007', '醬油', 'raw', '瓶', 60, { safety_stock: 20 })
  const bag = it('P001', '真空調理袋', 'pack', '個', 3, { safety_stock: 2000 })
  const box = it('P002', '外箱（20入）', 'pack', '個', 15, { safety_stock: 200 })
  const bom = (rows) => rows.map(([item, qty]) => ({ item_id: item.id, qty }))
  const sanbei = it('F001', '三杯雞調理包', 'product', '包', 70, {
    price: 120, pack_per_box: 20, shelf_days: 365, spec: '450g/包 冷凍',
    bom: bom([[leg, 0.3], [wine, 0.05], [sesame, 0.03], [soy, 0.04], [ginger, 0.02], [basil, 0.01], [bag, 1], [box, 0.05]]),
  })
  const mayou = it('F002', '麻油雞調理包', 'product', '包', 80, {
    price: 135, pack_per_box: 20, shelf_days: 365, spec: '500g/包 冷凍',
    bom: bom([[leg, 0.32], [wine, 0.1], [sesame, 0.05], [ginger, 0.04], [bag, 1], [box, 0.05]]),
  })
  const shred = it('F003', '舒肥雞胸', 'product', '包', 40, {
    price: 65, pack_per_box: 40, shelf_days: 180, spec: '150g/包 冷藏',
    bom: bom([[breast, 0.17], [bag, 1], [box, 0.025]]),
  })

  const cu = (code, name, contact, phone, address, terms_days = 30) => insert('customers', { code, name, contact, phone, address, terms_days, tax_id: '', note: '' })
  const c1 = cu('C001', '好鮮超市（示範）', '吳經理', '02-2345-6789', '台北市信義區示範路 1 號')
  const c2 = cu('C002', '大和團膳（示範）', '黃小姐', '03-345-6789', '桃園市中壢區示範街 88 號', 45)
  const c3 = cu('C003', '小吃便當店（示範）', '鄭老闆', '0912-345-678', '新竹市東區示範巷 5 號', 0)

  const su = (code, name, contact, phone, terms_days = 30) => insert('suppliers', { code, name, contact, phone, terms_days, address: '', tax_id: '', note: '' })
  const s1 = su('S001', '鴻運禽肉行（示範）', '劉先生', '04-2233-4455')
  const s2 = su('S002', '金香調味批發（示範）', '蔡小姐', '04-2666-7788')
  const s3 = su('S003', '新亞包材（示範）', '許先生', '02-2999-1234', 60)

  // 期初：業主投入資金、期初庫存
  postJournal({ date: addDays(today(), -20), memo: '期初資本', lines: [{ account: 1100, debit: 2000000 }, { account: 3100, credit: 2000000 }] })
  const po0 = savePurchaseOrder({ supplier_id: s2.id, date: addDays(today(), -15), due_date: addDays(today(), -12), lines: [
    { item_id: wine.id, qty: 60, price: 45 }, { item_id: sesame.id, qty: 30, price: 180 }, { item_id: soy.id, qty: 30, price: 60 },
    { item_id: ginger.id, qty: 30, price: 90 }, { item_id: basil.id, qty: 8, price: 150 },
  ], note: '期初備料' })
  const b0 = receiveGoods({ purchase_order_id: po0.id, lines: po0.lines.map((l) => ({ item_id: l.item_id, qty: l.qty })), date: addDays(today(), -12) })
  payBill({ bill_id: b0.id, amount: b0.total, date: addDays(today(), -5) })
  const poPack = savePurchaseOrder({ supplier_id: s3.id, date: addDays(today(), -15), lines: [{ item_id: bag.id, qty: 5000, price: 3 }, { item_id: box.id, qty: 300, price: 15 }] })
  receiveGoods({ purchase_order_id: poPack.id, lines: poPack.lines.map((l) => ({ item_id: l.item_id, qty: l.qty })), date: addDays(today(), -11) })

  const runWO = (so, product, qty, { fed = true, out = true, qc = 'pass', ship = false, pay = false } = {}) => {
    const wo = createWorkOrder({ sales_order_id: so.id, product_id: product.id, plan_qty: qty })
    issueMaterials(wo.id, woNeeds(wo))
    if (!fed) return wo
    feedMaterials(wo.id, woNeeds(wo))
    if (!out) return wo
    const lot = recordOutput(wo.id, { qty: qty + 6, waste: 1.2 })
    if (!qc) return wo
    saveInspection({
      kind: 'FQC', lot_no: lot.lot_no, item_id: product.id, work_order_id: wo.id, sample_size: 5, defect_qty: qc === 'pass' ? 0 : 2,
      checks: DEFAULT_CHECKS.map((c, i) => ({ ...c, value: '', pass: qc === 'pass' || i !== 0 })), result: qc,
      inspector: '李品管', note: qc === 'pass' ? '' : '色澤偏深，重新評估',
    })
    if (!ship || qc !== 'pass') return wo
    const sh = shipGoods({ sales_order_id: so.id, lines: [{ item_id: product.id, qty }], pack_mode: '保冷箱', carrier: '黑貓冷凍（示範）' })
    const inv = invoiceShipment(sh.id)
    if (pay) receivePayment({ invoice_id: inv.id, amount: inv.total })
    return wo
  }

  // 訂單 1：已完成出貨並收款
  const so1 = saveSalesOrder({ customer_id: c3.id, date: addDays(today(), -10), due_date: addDays(today(), -3), lines: [{ item_id: sanbei.id, qty: 100, price: 120 }], note: '' })
  const po1 = savePurchaseOrder({ supplier_id: s1.id, sales_order_id: so1.id, date: addDays(today(), -10), lines: [{ item_id: leg.id, qty: 200, price: 165 }] })
  receiveGoods({ purchase_order_id: po1.id, lines: [{ item_id: leg.id, qty: 200 }], date: addDays(today(), -9) })
  runWO(so1, sanbei, 100, { ship: true, pay: true })

  // 訂單 2：已產出、QC 合格，等出貨
  const so2 = saveSalesOrder({ customer_id: c1.id, date: addDays(today(), -5), due_date: addDays(today(), 3), lines: [{ item_id: mayou.id, qty: 200, price: 135 }, { item_id: sanbei.id, qty: 100, price: 120 }], note: '冷凍配送，早上 9 點前到' })
  const po2 = savePurchaseOrder({ supplier_id: s1.id, sales_order_id: so2.id, date: addDays(today(), -5), lines: [{ item_id: leg.id, qty: 120, price: 162 }] })
  receiveGoods({ purchase_order_id: po2.id, lines: [{ item_id: leg.id, qty: 120 }], date: addDays(today(), -4) })
  runWO(so2, mayou, 200)
  runWO(so2, sanbei, 100, { qc: null })

  // 訂單 3：剛接單，原料已訂購尚未到貨
  const so3 = saveSalesOrder({ customer_id: c2.id, date: today(), due_date: addDays(today(), 10), lines: [{ item_id: shred.id, qty: 400, price: 65 }], note: '' })
  savePurchaseOrder({ supplier_id: s1.id, sales_order_id: so3.id, date: today(), due_date: addDays(today(), 2), lines: [{ item_id: breast.id, qty: 70, price: 120 }] })

  recordExpense({ account: 6200, amount: 18500, date: addDays(today(), -3), memo: '本月水電瓦斯' })
  recordExpense({ account: 6100, amount: 120000, date: addDays(today(), -1), memo: '現場人員薪資' })
  return all('items').length
}
