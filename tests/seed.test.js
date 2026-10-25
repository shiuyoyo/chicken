import { describe, it, expect, beforeAll } from 'vitest'
import { freshDemo, all } from './helpers'
import * as L from '../src/logic'

describe('示範資料', () => {
  beforeAll(freshDemo)
  it('可以完整建立', () => {
    expect(all('items').length).toBe(20)
    expect(all('lots').length).toBeGreaterThan(5)
  })
  it('沒有負庫存、傳票平衡', () => {
    expect(L.stockRows().filter((r) => r.qty < 0)).toEqual([])
    for (const j of all('journal')) expect(L.round(L.sum(j.lines, (l) => l.debit))).toBe(L.round(L.sum(j.lines, (l) => l.credit)))
  })
  it('有待簽核單據', () => {
    console.log(L.pendingApprovals().map((a) => `${a.type} ${a.summary} ${a.reason}`))
    expect(L.pendingApprovals().length).toBeGreaterThanOrEqual(4)
  })
})
