// 表單列印：每一種單據、每一張示範資料都要能產生，關鍵數字要對
import { describe, it, expect, beforeAll } from 'vitest'
import { freshDemo, loginAs, byCode, all } from './helpers'
import { where } from '../src/db/store'
import * as L from '../src/logic'
import { FORMS, recentDocs } from '../src/print/forms'

beforeAll(async () => {
  await freshDemo()
  loginAs('王老闆')
})

describe('表單列印', () => {
  it('每一種表單都能用所有示範單據產生', () => {
    const counts = {}
    for (const type of Object.keys(FORMS)) {
      const docs = recentDocs(type, 500)
      expect(docs.length, type).toBeGreaterThan(0)
      for (const d of docs) {
        const f = FORMS[type].build(d.id, {})
        expect(f, `${type} ${d.id}`).toBeTruthy()
        expect(f.title).toBeTruthy()
        expect(f.no).toBeTruthy()
        // 每一欄都能算出內容
        for (const r of f.rows || []) for (const c of f.columns) expect(() => c.r(r), `${type} ${d.no} ${c.h}`).not.toThrow()
      }
      counts[type] = docs.length
    }
    expect(Object.keys(counts).length).toBe(Object.keys(FORMS).length)
  })

  it('庫存單據涵蓋進貨單、領料單、投料單、生產入庫單、調整單', () => {
    const titles = new Set(recentDocs('doc', 500).map((d) => FORMS.doc.build(d.id).title))
    for (const t of ['進貨單', '領料單', '投料單', '生產入庫單', '庫存調整單']) expect(titles.has(t), t).toBe(true)
  })

  it('進貨單金額 = 應付帳款未稅金額；領料單只列倉庫發料那一邊', () => {
    const bill = all('bills').find((b) => b.receipt_no)
    const f = FORMS.doc.build(bill.receipt_no)
    expect(f.totals[0][1]).toBe(Math.round(bill.amount).toLocaleString())
    const mi = recentDocs('doc', 500).find((d) => d.no.startsWith('MI'))
    const fm = FORMS.doc.build(mi.id)
    expect(fm.rows.every((m) => m.qty < 0)).toBe(true)
    expect(fm.signatures).toContain('領料（現場）')
  })

  it('出貨單稅額正確、附簽收欄', () => {
    const s = all('shipments')[0]
    const f = FORMS.shipment.build(s.id)
    const amount = L.sum(s.lines, (l) => l.qty * l.price)
    expect(f.totals.map((t) => t[1])).toEqual([amount, Math.round(amount * 0.05), Math.round(amount * 1.05)].map((n) => Math.round(n).toLocaleString()))
    expect(f.signatures.join()).toMatch(/客戶簽收/)
  })

  it('應收對帳單期末餘額 = 帳上未收', () => {
    const c = byCode('customers', 'C001')
    const f = FORMS.statement.build(`customers:${c.id}`, { from: '2000-01-01', to: L.today() })
    expect(f.totals[0][1]).toBe(Math.round(L.arOutstanding(c.id)).toLocaleString())
  })

  it('批號標籤有 QR、張數上限 100', () => {
    const lot = all('lots')[0]
    const f = FORMS.label.build(lot.lot_no, { copies: 500 })
    expect(f.qr).toBe(`LOT:${lot.lot_no}`)
    expect(f.copies).toBe(100)
  })

  it('盤點中的盤點表實盤欄留白', () => {
    loginAs('張師傅')
    const st = L.createStocktake(where('warehouses', (w) => w.code === 'W1')[0].id)
    const f = FORMS.stocktake.build(st.id)
    const col = f.columns.find((c) => c.h === '實盤數')
    expect(f.rows.every((r) => col.r(r) === '')).toBe(true)
  })

  it('簽核單：列出申請人、相關單據明細與狀態', () => {
    const ap = all('approvals').find((a) => a.type === 'po')
    const f = FORMS.approval.build(ap.id)
    const meta = Object.fromEntries(f.meta)
    expect(meta['申請人']).toBe('吳採購')
    expect(meta['相關單據']).toMatch(/^PO/)
    expect(f.sections[0].rows.length).toBeGreaterThan(0)
    expect(f.signatures).toContain('核准人')
    const st = all('approvals').find((a) => a.type === 'stocktake' || a.type === 'adjust')
    expect(FORMS.approval.build(st.id).sections[0].rows.length).toBeGreaterThan(0)
  })

  it('BOM 表：多階展開、批量成本 = 標準成本 × 批量', () => {
    const gift = byCode('items', 'G001')
    const f = FORMS.bom.build(gift.id, { qty: 10 })
    expect(f.rows.some((r) => r.level === 1)).toBe(true)
    expect(Object.fromEntries(f.meta)['階數']).toBe(2)
    expect(Number(f.totals[1][1].replace(/,/g, ''))).toBeCloseTo(L.bomCost(gift.id) * 10, 1)
    const firstLevel = L.sum(f.rows.filter((r) => r.level === 0), (r) => Number(String(f.columns[8].r(r)).replace(/,/g, '')))
    expect(Math.abs(firstLevel - L.bomCost(gift.id) * 10)).toBeLessThan(0.05)
  })

  it('試算表借貸平衡；帳齡表合計 = 應收未收；庫存明細表合計 = 存貨評價', () => {
    const tb = FORMS.trial_balance.build(L.today().slice(0, 7))
    expect(tb.totals[0][1]).toBe(tb.totals[1][1])
    const ar = FORMS.aging.build('ar')
    const open = L.sum(all('invoices'), (i) => (Math.abs(L.invoiceBalance(i)) < 0.5 ? 0 : L.invoiceBalance(i)))
    expect(ar.totals.at(-1)[1]).toBe(Math.round(open).toLocaleString())
    const st = FORMS.stock_report.build('all')
    expect(st.totals[0][1]).toBe(Math.round(L.sum(L.inventoryValuation().rows, (r) => r.value)).toLocaleString())
    const pl = FORMS.income_statement.build(L.today().slice(0, 7))
    expect(pl.rows.at(-1).v).toBe(L.profitAndLoss(...[L.today().slice(0, 7) + '-01', pl.date]).net)
  })

  it('出貨嘜頭：每一箱一張，箱號 1/n ～ n/n', () => {
    const sh = all('shipments').find((s) => s.boxes > 1)
    const f = FORMS.ship_label.build(sh.id)
    expect(f.cards).toHaveLength(Math.min(100, sh.boxes))
    expect(Object.fromEntries(f.cards.at(-1).meta)['箱號']).toBe(`${f.cards.length} / ${f.cards.length}`)
  })
})
