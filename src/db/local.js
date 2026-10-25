// 本機儲存：整份資料存在瀏覽器 localStorage（每台裝置各自一份）。
const KEY = 'food-erp:data:v4'

export function localBackend() {
  let pending = false
  let snapshot = null
  const flush = () => {
    if (!pending) return
    pending = false
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify(snapshot))
    } catch (e) {
      console.error('本機儲存失敗', e)
      globalThis.dispatchEvent?.(new CustomEvent('erp:backend-error', { detail: '本機儲存空間不足或被瀏覽器封鎖，請備份資料並改用 Supabase' }))
    }
  }
  // 頁面關閉 / 切到背景前一定寫入
  globalThis.addEventListener?.('pagehide', flush)
  globalThis.addEventListener?.('visibilitychange', flush)
  return {
    name: '本機儲存（瀏覽器）',
    async loadAll(tables) {
      let data = {}
      try {
        data = JSON.parse(globalThis.localStorage?.getItem(KEY) || '{}') || {}
      } catch {
        data = {}
      }
      for (const t of tables) data[t] ||= []
      return data
    },
    // 同一輪操作的多次寫入合併成一次，在這輪結束時立刻寫入
    save(_table, _op, _row, all) {
      snapshot = all
      if (!pending) {
        pending = true
        queueMicrotask(flush)
      }
    },
    async replaceAll(all) {
      snapshot = all
      pending = true
      flush()
    },
  }
}
