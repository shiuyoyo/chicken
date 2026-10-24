import { useBackend, initStore, setPref, all, findBy } from '../src/db/store'
import { seedDemo } from '../src/db/seed'

// 測試用記憶體後端
export async function freshDemo() {
  useBackend({ name: 'memory', loadAll: async (t) => Object.fromEntries(t.map((x) => [x, []])), save() {}, replaceAll: async () => {} })
  await initStore()
  await seedDemo()
}
export const loginAs = (name) => setPref('userId', findBy('users', 'name', name).id)
export const byCode = (t, code) => findBy(t, 'code', code)
export const itemByCode = (code) => findBy('items', 'code', code)
export { all }
