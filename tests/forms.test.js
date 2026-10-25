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
})
