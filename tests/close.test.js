import { it, expect } from 'vitest'
import { freshDemo } from './helpers'
import * as L from '../src/logic'

it('月結檢查：帳實相符、試算平衡', async () => {
  await freshDemo()
  const checks = L.closingChecks(L.today())
  console.log(checks.map((c) => `${c.ok ? 'OK' : 'NG'} ${c.name}：${c.detail}`).join('\n'))
  expect(checks.find((c) => c.name === '存貨帳實相符').ok).toBe(true)
  expect(checks.find((c) => c.name === '試算表平衡').ok).toBe(true)
})

it('過去日期的帳實相符（用單據日期回推庫存）', async () => {
  await freshDemo()
  for (const d of [-25, -15, -10, -5, -1]) {
    const until = L.addDays(L.today(), d)
    const c = L.closingChecks(until).find((x) => x.name === '存貨帳實相符')
    expect(c.ok, `${until} ${c.detail}`).toBe(true)
  }
})
