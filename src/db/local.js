// 本機儲存：整份資料存在瀏覽器 localStorage（每台裝置各自一份）。
const KEY = 'food-erp:data:v1'

export function localBackend() {
  let timer = null
  let snapshot = null
  const flush = () => {
    timer = null
    try {
      localStorage.setItem(KEY, JSON.stringify(snapshot))
    } catch (e) {
      console.error('本機儲存失敗', e)
    }
  }
  return {
    name: '本機儲存（瀏覽器）',
    async loadAll(tables) {
      let data = {}
      try {
        data = JSON.parse(localStorage.getItem(KEY) || '{}') || {}
      } catch {
        data = {}
      }
      for (const t of tables) data[t] ||= []
      return data
    },
    // 本機版直接整份寫回（延遲合併多次寫入）
    save(_table, _op, _row, all) {
      snapshot = all
      if (!timer) timer = setTimeout(flush, 150)
    },
    async replaceAll(all) {
      snapshot = all
      flush()
    },
  }
}
