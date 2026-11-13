import { useBackend, initStore, setPref, all, findBy, currentUser } from '../src/db/store'
import { seedDemo } from '../src/db/seed'

// 測試用記憶體後端。資料庫重播測試（npm run test:replay）會另外記錄每一批寫入與操作人
const record = (ops) => globalThis.__replay?.batches.push({ by: currentUser()?.id, ops })
export async function freshDemo() {
  globalThis.__replay?.reset()
  useBackend({
    name: 'memory',
    loadAll: async (t) => Object.fromEntries(t.map((x) => [x, []])),
    save: (t, op, row) => record([{ t, op, row }]),
    ...(globalThis.__replay ? { saveBatch: record } : {}),
    replaceAll: async () => {},
  })
  await initStore()
  await seedDemo()
}
export const loginAs = (name) => setPref('userId', findBy('users', 'name', name).id)
export const byCode = (t, code) => findBy(t, 'code', code)
export const itemByCode = (code) => findBy('items', 'code', code)
export { all }
