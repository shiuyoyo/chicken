// 電子發票證明聯（財政部格式）：期別、隨機碼、一維條碼（Code 39）、左右兩個 QR Code。
// 只負責「印出來」；上傳到財政部平台要另外串加值服務中心或 Turnkey。
import { get } from '../db/store'
import { getSetting, round, taxRate } from './core'

// 民國年期別：1-2 月為一期…，條碼用「年 + 雙月」，例如 2026-11 → 11512、顯示「115年11-12月」
export function invoicePeriod(date) {
  const [y, m] = String(date).slice(0, 7).split('-').map(Number)
  const roc = y - 1911
  const even = m % 2 === 0 ? m : m + 1
  return { code: `${roc}${String(even).padStart(2, '0')}`, label: `${roc}年${String(even - 1).padStart(2, '0')}-${String(even).padStart(2, '0')}月` }
}
const rocDate = (date) => {
  const [y, m, d] = String(date).slice(0, 10).split('-')
  return `${Number(y) - 1911}${m}${d}`
}
export const newRandomCode = () => String(Math.floor(Math.random() * 10000)).padStart(4, '0')
// 舊資料沒有隨機碼時，用單據 id 算出固定的 4 碼，重印結果一樣
export const stableRandomCode = (id) => String([...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 10000, 7)).padStart(4, '0')
const plainNo = (gui) => String(gui || '').replace(/-/g, '')
const hex8 = (n) => Math.max(0, Math.round(Number(n) || 0)).toString(16).toUpperCase().padStart(8, '0')

// 發票資料：來源是門市交易（pos_sales）或應收帳款（invoices）
export function einvoiceData(ref) {
  const [table, id] = String(ref).split(':')
  const doc = get(table, id)
  if (!doc) return null
  const isPos = table === 'pos_sales'
  const cust = get('customers', doc.customer_id)
  const buyer = isPos ? doc.buyer_tax_id || '' : cust?.tax_id || ''
  const total = Math.round(Number(doc.total) || 0)
  const tax = isPos ? Math.round(Number(doc.tax) || 0) : Math.round(Number(doc.tax) || 0)
  const lines = isPos
    ? doc.lines.map((l) => ({ name: get('items', l.item_id)?.name || '', qty: l.qty, price: l.price }))
    : (get('shipments', doc.shipment_id)?.lines || []).map((l) => ({ name: get('items', l.item_id)?.name || '', qty: l.qty, price: round(l.price * (1 + taxRate()), 2) }))
  // 同品項合併（出貨單會依批號拆成多列）
  const merged = []
  for (const l of lines) {
    const m = merged.find((x) => x.name === l.name && x.price === l.price)
    if (m) m.qty = round(m.qty + l.qty, 3)
    else merged.push({ ...l })
  }
  const date = doc.date
  const time = isPos && doc.at ? new Date(doc.at).toTimeString().slice(0, 8) : '00:00:00'
  return {
    ref, isPos, gui: doc.gui_no, no: plainNo(doc.gui_no), date, time, period: invoicePeriod(date),
    random: doc.random_code || stableRandomCode(doc.id), total, tax, amount: total - tax, buyer, seller: String(getSetting('company_tax_id') || ''),
    lines: merged, doc,
  }
}

// 一維條碼內容：期別(5) + 發票號碼(10) + 隨機碼(4)
export const barcodeText = (e) => `${e.period.code}${e.no}${e.random}`

// 加密驗證資訊：AES-128-CBC（財政部提供的金鑰、固定 IV），加密「發票號碼 + 隨機碼」，Base64 後 24 碼
const MOF_IV = 'Dt8lyToo17X/XkXaQvihuA=='
const b64 = (bytes) => (typeof btoa === 'function' ? btoa(String.fromCharCode(...bytes)) : Buffer.from(bytes).toString('base64'))
const fromB64 = (s) => (typeof atob === 'function' ? Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) : new Uint8Array(Buffer.from(s, 'base64')))
export async function encryptVerify(no, random, keyHex = getSetting('einvoice_aes_key')) {
  if (!/^[0-9a-fA-F]{32}$/.test(String(keyHex || ''))) return '*'.repeat(24)
  const key = await globalThis.crypto.subtle.importKey('raw', Uint8Array.from(keyHex.match(/../g).map((h) => parseInt(h, 16))), { name: 'AES-CBC' }, false, ['encrypt'])
  const out = await globalThis.crypto.subtle.encrypt({ name: 'AES-CBC', iv: fromB64(MOF_IV) }, key, new TextEncoder().encode(no + random))
  return b64(new Uint8Array(out)).slice(0, 24)
}

// 左右 QR Code 內容：左邊是固定 77 碼表頭 + 自行使用區 + 品目；放不下的品目接到右邊（以 ** 開頭）
export async function qrTexts(e, { maxLeft = 180 } = {}) {
  const head =
    e.no + rocDate(e.date) + e.random + hex8(e.amount) + hex8(e.total) + (e.buyer || '00000000').padStart(8, '0') + e.seller.padStart(8, '0') + (await encryptVerify(e.no, e.random))
  const items = e.lines.map((l) => `${l.name.replace(/:/g, '：')}:${l.qty}:${l.price}`)
  let left = `${head}:**********:${items.length}:${items.length}:1`
  const bytes = (s) => new TextEncoder().encode(s).length
  const rest = []
  for (const it of items) {
    if (!rest.length && bytes(left + ':' + it) <= maxLeft) left += ':' + it
    else rest.push(it)
  }
  return { left, right: '**' + (rest.length ? ':' + rest.join(':') : '') }
}

// Code 39：每個字 9 個元素（5 條 4 空，3 個寬），字與字之間一個窄空白，前後加 *
const C39 = {
  0: 'nnnwwnwnn', 1: 'wnnwnnnnw', 2: 'nnwwnnnnw', 3: 'wnwwnnnnn', 4: 'nnnwwnnnw', 5: 'wnnwwnnnn', 6: 'nnwwwnnnn', 7: 'nnnwnnwnw', 8: 'wnnwnnwnn', 9: 'nnwwnnwnn',
  A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
  K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
  U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn',
}
// 回傳每一條黑條的 [x, 寬]（單位：窄條寬），以及總寬
export function code39Bars(text, wide = 2.5) {
  const bars = []
  let x = 0
  for (const ch of `*${String(text).toUpperCase()}*`) {
    const p = C39[ch]
    if (!p) throw new Error(`Code 39 不支援字元「${ch}」`)
    for (let i = 0; i < 9; i++) {
      const w = p[i] === 'w' ? wide : 1
      if (i % 2 === 0) bars.push([x, w])
      x += w
    }
    x += 1
  }
  return { bars, width: x - 1 }
}
