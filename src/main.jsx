import { createRoot } from 'react-dom/client'
import { initStore } from './db/store'
import { supabaseConfig } from './db/supabase'
import { seedDemo } from './db/seed'
import App from './App'
import CloudGate from './cloud/CloudGate'
import './styles.css'

const root = createRoot(document.getElementById('root'))

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
