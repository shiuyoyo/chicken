import { createRoot } from 'react-dom/client'
import { initStore } from './db/store'
import { supabaseConfig } from './db/supabase'
import { seedDemo } from './db/seed'
import App from './App'
import CloudGate from './cloud/CloudGate'
import './styles.css'

const root = createRoot(document.getElementById('root'))

// 離線用（展場收銀）：註冊 service worker，把網頁存在裝置上。單一檔案版與預覽環境不註冊
if ('serviceWorker' in navigator && window.isSecureContext && import.meta.env.MODE !== 'single' && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('離線功能未啟用：', e.message))
  navigator.serviceWorker.ready.then((reg) => {
    const urls = [location.href.split('#')[0], ...performance.getEntriesByType('resource').map((r) => r.name)].filter((u) => u.startsWith(location.origin))
    reg.active?.postMessage({ cache: urls })
  })
}

// 雲端版：先用 Email 登入，登入後才載入資料（資料庫只讓開通的員工讀寫）
if (supabaseConfig()) {
  root.render(<CloudGate />)
} else {
  root.render(<div className="empty">載入中…</div>)
  initStore()
    .then(async (empty) => {
      if (empty) await seedDemo()
      root.render(<App />)
    })
    .catch((e) => {
      console.error(e)
      root.render(
        <div className="content">
          <h1>資料讀取失敗</h1>
          <p>{e.message}</p>
        </div>,
      )
    })
}
