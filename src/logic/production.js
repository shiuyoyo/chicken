// 生產：工單（排程 / 產線產能）、領料（倉庫→產線，記錄原料批號）、投料（下鍋，記錄批號）、
// 產出（建立成品批號，記錄用了哪些原料批號）、結案退料、標準成本與實際成本。
import { all, get, where, insert, update, nextNo, nowISO, transaction } from '../db/store'
import { fail, need, round, sum, today, addDays, userName, getSetting, postJournal, assertOpen } from './core'
import { notify } from './notify'
import { allocate, move, stockOf, lineBin, lotByNo, createLot, defaultBin, checkTemp, onHand, lastCost, lotCost, binOf, binKind } from './inventory'

export const WO_STATUS = {
  planned: '待領料', issued: '已領料', cooking: '烹煮中', done: '待 QC', qc_pass: 'QC 合格', qc_fail: 'QC 不合格', closed: '已結案', cancelled: '已取消',
}

// 標準成本：配方 × 最近進價
export const bomCost = (productId) => round(sum(get('items', productId)?.bom || [], (b) => b.qty * lastCost(b.item_id)), 4)

export const woNeeds = (wo) => (get('items', wo.product_id)?.bom || []).map((b) => ({ item_id: b.item_id, qty: round(b.qty * wo.plan_qty, 3) }))

const woMoves = (wo, type) => where('stock_moves', (m) => m.ref_type === 'work_orders' && m.ref_id === wo.id && m.type === type)
// 已領料 = 進到產線的量
export const woIssued = (wo, itemId) => round(sum(woMoves(wo, 'issue').filter((m) => m.qty > 0 && (!itemId || m.item_id === itemId)), (m) => m.qty), 3)
export const woFed = (wo, itemId) => round(sum((wo.feeds || []).filter((f) => !itemId || f.item_id === itemId), (f) => f.qty), 3)
export const woReturned = (wo, itemId) => round(sum(woMoves(wo, 'return').filter((m) => m.qty > 0 && (!itemId || m.item_id === itemId)), (m) => m.qty), 3)
export const woLots = (wo) => where('lots', (l) => l.work_order_id === wo.id)

// 某天某產線已排的量
export const lineLoad = (line, date, exceptId) =>
  sum(where('work_orders', (w) => w.line === line && w.plan_date === date && w.id !== exceptId && !['closed', 'cancelled'].includes(w.status)), (w) => w.plan_qty)

export function capacityWarning({ line, plan_date, plan_qty }, exceptId) {
  const cap = (getSetting('lines') || []).find((l) => l.name === line)?.capacity
  if (!cap || !plan_date) return ''
  const load = lineLoad(line, plan_date, exceptId) + Number(plan_qty)
  return load > cap ? `${plan_date} ${line} 排程 ${load}，超過產能 ${cap}` : ''
}

// 成品批號：工單開立時就保留，避免同一天兩張工單拿到同一個號碼
function nextProductLot(date) {
  const head = `L${String(date).slice(0, 10).replace(/-/g, '')}-`
  const used = [...all('lots').map((l) => l.lot_no), ...all('work_orders').map((w) => w.lot_no)].filter((n) => n?.startsWith(head))
  const max = Math.max(0, ...used.map((n) => Number(n.slice(head.length).split('-')[0]) || 0))
  return head + String(max + 1).padStart(3, '0')
}

export function createWorkOrder({ sales_order_id, product_id, plan_qty, plan_date = today(), line, note = '' }) {
  return transaction(() => {
    need('production', 2)
    const so = get('sales_orders', sales_order_id)
    if (sales_order_id && so?.status !== 'confirmed') fail(`訂單 ${so?.no} 狀態不是「已確認」，不能開工單（可能還在等核准）`)
    const p = get('items', product_id)
    if (p?.type !== 'product') fail('請選擇成品')
    if (!p.bom?.length) fail(`${p.name} 還沒有設定配方`)
    if (!(Number(plan_qty) > 0)) fail('請輸入計畫數量')
    line ||= getSetting('lines')?.[0]?.name || ''
    const wo = insert('work_orders', {
      no: nextNo('work_orders', 'WO', plan_date), sales_order_id: sales_order_id || '', product_id, plan_qty: Number(plan_qty), plan_date, line,
      status: 'planned', lot_no: nextProductLot(plan_date), feeds: [], output_qty: 0, waste_qty: 0, std_cost: bomCost(product_id), note,
    })
    notify('wo_created', {
      title: `新工單 ${wo.no}`,
      lines: [`${p.name} ${wo.plan_qty} ${p.unit}`, `${plan_date}・${line}`, so ? `訂單 ${so.no}（${get('customers', so.customer_id)?.name}）` : '備貨生產'],
      link: `/production?open=${wo.id}`,
    })
    return wo
  })
}

export function rescheduleWorkOrder(id, { plan_date, line }) {
  need('production', 2)
  const wo = get('work_orders', id)
  if (['closed', 'cancelled'].includes(wo.status)) fail('工單已結束')
  return update('work_orders', id, { plan_date, line })
}

function openWO(id) {
  const wo = get('work_orders', id)
  if (!wo) fail('找不到工單')
  if (['closed', 'cancelled'].includes(wo.status)) fail(`工單 ${wo.no} 已${WO_STATUS[wo.status]}`)
  return wo
}

// 領料：lines = [{ item_id, qty, lot_no? }]，沒指定批號就先到期先出
export function issueMaterials(woId, lines, { date = today() } = {}) {
  return transaction(() => {
    need('production', 2)
    assertOpen(date)
    const wo = openWO(woId)
    const valid = lines.filter((l) => l.item_id && Number(l.qty) > 0)
    if (!valid.length) fail('沒有輸入領料數量')
    const tol = Number(getSetting('issue_tolerance'))
    const needs = woNeeds(wo)
    const before = Object.fromEntries(valid.map((l) => [l.item_id, stockOf(l.item_id, date)]))
    const line = lineBin()
    let value = 0
    for (const l of valid) {
      const n = needs.find((x) => x.item_id === l.item_id)
      if (!n) fail(`${get('items', l.item_id)?.name} 不在這個產品的配方裡`)
      const after = woIssued(wo, l.item_id) - woReturned(wo, l.item_id) + Number(l.qty)
      if (after > n.qty * (1 + tol) + 0.0005) fail(`${get('items', l.item_id)?.name} 領料超過配方需求 ${tol * 100}%（需求 ${n.qty}，領了會變 ${round(after, 3)}）`)
      for (const a of allocate(l.item_id, l.qty, { lot_no: l.lot_no || undefined, date })) {
        const c = lotCost(a.lot_no, a.item_id)
        value += a.qty * c
        move({ ...a, qty: -a.qty, type: 'issue', unit_cost: c, ref_type: 'work_orders', ref_id: wo.id, note: wo.no, doc_date: date })
        move({ ...a, bin_id: line, type: 'issue', unit_cost: c, ref_type: 'work_orders', ref_id: wo.id, note: `${wo.no}｜自 ${binOf(a.bin_id)?.code}`, from_bin_id: a.bin_id, doc_date: date })
      }
    }
    update('work_orders', wo.id, { status: wo.status === 'planned' ? 'issued' : wo.status, start_at: wo.start_at || nowISO() })
    postJournal({ date, memo: `領料 ${wo.no}`, lines: [{ account: 1320, debit: value }, { account: 1300, credit: value }], ref_type: 'work_orders', ref_id: wo.id })
    // 這次領料讓原料跌破安全庫存才通知（已經低於的不重複通知）
    const low = Object.keys(before).map((id) => get('items', id)).filter((i) => i.safety_stock > 0 && before[i.id] >= i.safety_stock && stockOf(i.id, date) < i.safety_stock)
    if (low.length) notify('low_stock', { title: '原料低於安全庫存', lines: low.map((i) => `${i.name}：剩 ${stockOf(i.id, date)} ${i.unit}（安全量 ${i.safety_stock}）`), link: '/purchase' })
  })
}

// 投料：產線上的料下鍋。產線不夠會自動從倉庫補領
export function feedMaterials(woId, lines, { date = today() } = {}) {
  return transaction(() => {
    need('production', 2)
    const wo = openWO(woId)
    const valid = lines.filter((l) => l.item_id && Number(l.qty) > 0)
    if (!valid.length) fail('沒有輸入投料數量')
    const line = lineBin()
    for (const l of valid) {
      const short = round(Number(l.qty) - onHand({ item_id: l.item_id, bin_id: line }), 3)
      if (short > 0) issueMaterials(wo.id, [{ item_id: l.item_id, qty: short }], { date })
    }
    const feeds = [...(get('work_orders', wo.id).feeds || [])]
    for (const l of valid) {
      for (const a of allocate(l.item_id, l.qty, { kinds: ['line'], bin_id: line, date })) {
        const c = lotCost(a.lot_no, a.item_id)
        move({ ...a, qty: -a.qty, type: 'feed', unit_cost: c, ref_type: 'work_orders', ref_id: wo.id, note: wo.no, doc_date: date })
        feeds.push({ at: nowISO(), item_id: a.item_id, lot_no: a.lot_no, qty: a.qty, unit_cost: c, user: userName() })
      }
    }
    const cur = get('work_orders', wo.id)
    update('work_orders', wo.id, { feeds, status: ['planned', 'issued'].includes(cur.status) ? 'cooking' : cur.status })
  })
}

// 產出：成品進成品倉，QC 合格前不能出貨
export function recordOutput(woId, { qty, waste = 0, date = today() }) {
  return transaction(() => {
    need('production', 2)
    assertOpen(date)
    const wo = openWO(woId)
    qty = Number(qty)
    if (!(qty > 0)) fail('請輸入產出數量')
    if (!wo.feeds?.length) fail('這張工單還沒有投料紀錄，不能產出')
    const product = get('items', wo.product_id)
    const fedValue = sum(wo.feeds, (f) => f.qty * (f.unit_cost || 0))
    const outBefore = wo.output_qty || 0
    // 實際成本：投入原料總成本 ÷ 總產出
    const unit_cost = round(fedValue / (outBefore + qty), 4)
    // 已經 QC 過的批號不再追加，改開子批號
    let lot = lotByNo(wo.lot_no)
    if (lot && lot.qc_status !== 'pending') {
      const n = woLots(wo).length + 1
      lot = createLot({ lot_no: `${wo.lot_no}-${n}`, kind: 'product', item_id: wo.product_id, work_order_id: wo.id, qty, unit_cost, qc_status: 'pending', mfg_date: date, exp_date: addDays(date, product.shelf_days || 180) })
    } else if (lot) {
      lot = update('lots', lot.id, { qty: round(lot.qty + qty, 3), unit_cost })
    } else {
      lot = createLot({ lot_no: wo.lot_no, kind: 'product', item_id: wo.product_id, work_order_id: wo.id, qty, unit_cost, qc_status: 'pending', mfg_date: date, exp_date: addDays(date, product.shelf_days || 180) })
    }
    // 所有這張工單的成品批號統一成本
    for (const l of woLots(wo)) if (l.unit_cost !== unit_cost) update('lots', l.id, { unit_cost })
    const bin = defaultBin(wo.product_id)
    checkTemp(wo.product_id, bin)
    move({ item_id: wo.product_id, lot_no: lot.lot_no, bin_id: bin, qty, type: 'output', unit_cost, ref_type: 'work_orders', ref_id: wo.id, note: wo.no, doc_date: date })
    update('work_orders', wo.id, { output_qty: round(outBefore + qty, 3), waste_qty: round((wo.waste_qty || 0) + Number(waste || 0), 3), status: 'done', end_at: nowISO() })
    // 在製品轉成品：本次轉出 = 累計投料成本 × 本次產出比例
    const value = round(qty * unit_cost)
    postJournal({ date, memo: `產出入庫 ${wo.no} ${product.name} ${qty}${product.unit}`, lines: [{ account: 1310, debit: value }, { account: 1320, credit: value }], ref_type: 'work_orders', ref_id: wo.id })
    notify('output_pending_qc', { title: '成品等待 QC', lines: [`${product.name} ${qty} ${product.unit}`, `批號 ${lot.lot_no}`, `工單 ${wo.no}`], link: '/qc' })
    return lot
  })
}

// 結案：產線剩料退回原儲位，在製品差額轉損耗
export function closeWorkOrder(woId, { date = today() } = {}) {
  return transaction(() => {
    need('production', 2)
    assertOpen(date)
    const wo = openWO(woId)
    const line = lineBin()
    // 這張工單領到產線、還沒投完的批號
    const byLot = {}
    for (const m of where('stock_moves', (m) => m.ref_id === wo.id && m.bin_id === line)) {
      const k = `${m.item_id}|${m.lot_no}`
      byLot[k] ||= { item_id: m.item_id, lot_no: m.lot_no, qty: 0, from: m.from_bin_id }
      byLot[k].qty += m.qty
      if (m.from_bin_id) byLot[k].from = m.from_bin_id
    }
    let back = 0
    for (const r of Object.values(byLot)) {
      const qty = round(Math.min(r.qty, onHand({ item_id: r.item_id, bin_id: line, lot_no: r.lot_no })), 3)
      if (qty <= 0) continue
      const to = r.from && binKind(r.from) === 'storage' ? r.from : defaultBin(r.item_id)
      const c = lotCost(r.lot_no, r.item_id)
      back += qty * c
      move({ item_id: r.item_id, lot_no: r.lot_no, bin_id: line, qty: -qty, type: 'return', unit_cost: c, ref_type: 'work_orders', ref_id: wo.id, note: `${wo.no} 退料`, doc_date: date })
      move({ item_id: r.item_id, lot_no: r.lot_no, bin_id: to, qty, type: 'return', unit_cost: c, ref_type: 'work_orders', ref_id: wo.id, note: `${wo.no} 退料`, doc_date: date })
    }
    if (back) postJournal({ date, memo: `退料 ${wo.no}`, lines: [{ account: 1300, debit: back }, { account: 1320, credit: back }], ref_type: 'work_orders', ref_id: wo.id })
    // 在製品剩餘（四捨五入差額）轉生產損耗，讓每張工單的在製品歸零
    const wip = round(sum(where('journal', (j) => j.ref_type === 'work_orders' && j.ref_id === wo.id).flatMap((j) => j.lines.filter((l) => l.account === 1320)), (l) => l.debit - l.credit))
    if (wip) postJournal({ date, memo: `工單結案差額 ${wo.no}`, lines: wip > 0 ? [{ account: 5200, debit: wip }, { account: 1320, credit: wip }] : [{ account: 1320, debit: -wip }, { account: 5200, credit: -wip }], ref_type: 'work_orders', ref_id: wo.id })
    update('work_orders', wo.id, { status: 'closed', end_at: wo.end_at || nowISO() })
  })
}

export function cancelWorkOrder(woId) {
  return transaction(() => {
    need('production', 2)
    const wo = openWO(woId)
    if (wo.status !== 'planned') fail('已經領料的工單請用「結案」退料')
    update('work_orders', wo.id, { status: 'cancelled' })
  })
}

// 工單成本分析：標準 vs 實際
export function woCostReport(wo) {
  const fed = sum(wo.feeds || [], (f) => f.qty * (f.unit_cost || 0))
  const actual = wo.output_qty ? round(fed / wo.output_qty, 2) : 0
  const yieldPct = wo.plan_qty ? Math.round((wo.output_qty / wo.plan_qty) * 100) : 0
  return { fed: round(fed), std: round(wo.std_cost || 0, 2), actual, variance: round(actual - (wo.std_cost || 0), 2), yieldPct }
}

export const activeWorkOrders = () => all('work_orders').filter((w) => !['closed', 'cancelled'].includes(w.status))
