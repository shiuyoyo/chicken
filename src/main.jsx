import { createRoot } from 'react-dom/client'
import { initStore } from './db/store'
import { seedDemo } from './db/seed'
import App from './App'
import './styles.css'

const root = createRoot(document.getElementById('root'))
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
        <h1>資料庫連線失敗</h1>
        <p>{e.message}</p>
        <button
          className="btn"
          onClick={() => {
            localStorage.removeItem('food-erp:supabase')
            location.reload()
          }}
        >
          改回本機儲存
        </button>
      </div>,
    )
  })
