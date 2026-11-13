// 品項與 BOM：多階組成（半成品、成品也能當零件，例如醬汁 → 調理包 → 禮盒）、
// 迴圈檢查、多階展開與淨需求、用途查詢、變化款料號、檢驗項目範本。
import { all, get, where, insert, update, transaction } from '../db/store'
import { fail, need, can, round, sum, getSetting, setSetting } from './core'
import { stockOf } from './inventory'

export const ITEM_TYPES = { raw: '原料', pack: '包材 / 零件', semi: '半成品', product: '成品' }
export const BUY_TYPES = ['raw', 'pack']
export const MADE_TYPES = ['semi', 'product']
export const isMade = (item) => MADE_TYPES.includes(item?.type)
export const isBuy = (item) => BUY_TYPES.includes(item?.type)
export const EXP_RULES = { shelf: '製造日 + 保存天數', min_component: '取用料中最早的有效日期（組裝品）', none: '不管理效期' }

// ---------- 迴圈檢查：A 用到 B、B 又用到 A 不允許 ----------
export function findCycle(itemId, bom, seen = [itemId]) {
  for (const b of bom || []) {
    if (seen.includes(b.item_id)) return [...seen, b.item_id]
    const child = get('items', b.item_id)
    if (child?.bom?.length) {
      const c = findCycle(itemId, child.bom, [...seen, b.item_id])
      if (c) return c
    }
  }
  return null
}

// ---------- 多階展開（樹狀） ----------
export function bomTree(itemId, qty = 1, level = 0) {
  const item = get('items', itemId)
  return (item?.bom || []).map((b) => {
    const q = round(b.qty * qty, 4)
    const child = get('items', b.item_id)
    return { item_id: b.item_id, qty: q, per: b.qty, level, children: isMade(child) && child.bom?.length && level < 10 ? bomTree(b.item_id, q, level + 1) : [] }
  })
}
export const flattenTree = (tree) => tree.flatMap((n) => [n, ...flattenTree(n.children)])

// 標準成本：多階往下加總到外購料（外購料用最近進價）
export function rollupCost(itemId, lastCost, depth = 0) {
  const item = get('items', itemId)
  if (!item?.bom?.length || depth > 10) return Number(lastCost(itemId)) || 0
  return round(sum(item.bom, (b) => b.qty * (isMade(get('items', b.item_id)) && get('items', b.item_id)?.bom?.length ? rollupCost(b.item_id, lastCost, depth + 1) : lastCost(b.item_id))), 4)
}

// ---------- 用途查詢（這個料用在哪些品項，含間接） ----------
export function whereUsed(itemId, level = 0, seen = new Set()) {
  if (level > 10 || seen.has(itemId)) return []
  seen.add(itemId)
  return all('items')
    .filter((p) => p.bom?.some((b) => b.item_id === itemId))
    .flatMap((p) => [{ item_id: p.id, per: p.bom.find((b) => b.item_id === itemId).qty, level }, ...whereUsed(p.id, level + 1, seen)])
}

// 進行中工單還沒做出來的量（可以抵扣半成品需求）
export const openWOQty = (itemId) =>
  round(sum(where('work_orders', (w) => w.product_id === itemId && !['closed', 'cancelled'].includes(w.status)), (w) => Math.max(0, w.plan_qty - (w.output_qty || 0))), 3)

// 多階淨需求：第一層照訂單量全部生產；下層的半成品 / 成品先扣可用庫存與進行中工單，不夠才自製；
// 外購料（原料、包材、零件）彙總成採購需求。
export function explodeNeeds(lines, { net = true } = {}) {
  const avail = {}
  const make = {}
  const buy = {}
  const depthOf = {}
  const walk = (itemId, q, depth) => {
    const it = get('items', itemId)
    if (!it || q <= 0) return
    if (isMade(it) && it.bom?.length && depth < 10) {
      if (net && depth > 0) {
        avail[itemId] ??= stockOf(itemId) + openWOQty(itemId)
        const take = Math.min(avail[itemId], q)
        avail[itemId] = round(avail[itemId] - take, 4)
        q = round(q - take, 4)
        if (q <= 0) return
      }
      if (depth > 0) {
        make[itemId] = round((make[itemId] || 0) + q, 4)
        depthOf[itemId] = Math.max(depthOf[itemId] || 0, depth)
      }
      for (const b of it.bom) walk(b.item_id, b.qty * q, depth + 1)
    } else buy[itemId] = round((buy[itemId] || 0) + q, 4)
  }
  for (const l of lines) walk(l.item_id, Number(l.qty), 0)
  return { buy, make, depth: depthOf }
}

// ---------- 變化款：同一系列不同口味 / 顏色 / 尺寸，各自是獨立料號 ----------
export function createVariants(baseId, attr, values) {
  return transaction(() => {
    need('master', 2)
    const base = get('items', baseId)
    if (!base) fail('找不到基準品項')
    if (!attr) fail('請輸入屬性名稱，例如：口味、顏色、尺寸')
    const vals = [...new Set(values.map((v) => String(v).trim()).filter(Boolean))]
    if (!vals.length) fail('請至少輸入一個選項')
    const family = base.family_code || base.code
    if (!base.family_code) update('items', base.id, { family_code: family })
    const used = new Set(all('items').map((i) => i.code))
    const made = []
    let n = 1
    for (const v of vals) {
      if (where('items', (i) => i.family_code === family && i.variant_value === v).length) fail(`「${v}」已經有料號了`)
      while (used.has(`${base.code}-${String(n).padStart(2, '0')}`)) n++
      const code = `${base.code}-${String(n).padStart(2, '0')}`
      used.add(code)
      const { id, created_at, updated_at, code: _c, name: _n, barcode, ...rest } = base
      made.push(insert('items', { ...rest, code, name: `${base.name.replace(/（.*）$/, '')}（${v}）`, barcode: '', family_code: family, variant_attr: attr, variant_value: v }))
    }
    return made
  })
}
export const familyOf = (item) => (item?.family_code ? where('items', (i) => i.family_code === item.family_code) : [])

// ---------- 檢驗項目範本（不限食品業） ----------
export const QC_TEMPLATE_DEFAULTS = {
  食品成品: [
    { name: '外觀 / 色澤', standard: '色澤均勻、無異物' },
    { name: '氣味', standard: '無異味' },
    { name: '中心溫度', standard: '≥ 75°C' },
    { name: '重量', standard: '標示重量 ±3%' },
    { name: '包裝密封', standard: '無漏氣、無破損' },
    { name: '標示', standard: '品名、批號、效期正確' },
  ],
  食品進料: [
    { name: '到貨溫度', standard: '冷凍 ≤ -15°C / 冷藏 ≤ 7°C' },
    { name: '外觀 / 氣味', standard: '無異味、無變色' },
    { name: '包裝完整', standard: '無破損、無污染' },
    { name: '標示與效期', standard: '有效期限 ≥ 2/3' },
    { name: '檢驗報告', standard: '供應商附藥檢 / 微生物報告' },
  ],
  組裝成品: [
    { name: '外觀', standard: '無刮傷、無髒污、無變形' },
    { name: '組裝完整', standard: '零件齊全、螺絲鎖緊、卡扣到位' },
    { name: '尺寸', standard: '依圖面公差' },
    { name: '功能測試', standard: '全功能正常' },
    { name: '包裝標示', standard: '品名、料號、批號正確' },
  ],
  零件進料: [
    { name: '外觀', standard: '無變形、無生鏽、無毛邊' },
    { name: '尺寸抽測', standard: '依規格公差' },
    { name: '數量', standard: '與送貨單相符' },
    { name: '材質證明', standard: '附出廠檢驗報告' },
  ],
  一般: [
    { name: '外觀', standard: '無破損、無髒污' },
    { name: '數量', standard: '與單據相符' },
    { name: '標示', standard: '品名、料號、批號正確' },
  ],
}
export const qcTemplates = () => getSetting('qc_templates') || QC_TEMPLATE_DEFAULTS
export function saveQcTemplates(t) {
  if (!can('qc', 3)) need('admin', 2)
  const clean = Object.fromEntries(
    Object.entries(t)
      .map(([k, rows]) => [String(k).trim(), rows.filter((r) => String(r.name || '').trim()).map((r) => ({ name: r.name.trim(), standard: String(r.standard || '').trim() }))])
      .filter(([k]) => k),
  )
  for (const [k, rows] of Object.entries(clean)) if (!rows.length) fail(`範本「${k}」至少要有一個檢驗項目`)
  for (const i of all('items')) if (i.qc_template && !clean[i.qc_template]) fail(`品項 ${i.name} 還在使用範本「${i.qc_template}」，不能刪除`)
  setSetting('qc_templates', clean, { system: true })
  return clean
}
// 依品項指定的範本；沒指定就依來源：外購用「食品進料」、自製用「食品成品」（相容舊資料）
export function checksFor(item, kind) {
  const t = qcTemplates()
  return t[item?.qc_template] || t[kind === 'IQC' ? '食品進料' : '食品成品'] || t['一般'] || []
}
