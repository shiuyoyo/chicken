import { useState } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { useStore, all, currentUser, setPref } from './db/store'
import { Toasts } from './ui'
import Dashboard from './pages/Dashboard'
import Progress from './pages/Progress'
import { SalesOrders, Customers } from './pages/Sales'
import { PurchaseOrders, Suppliers, Receiving } from './pages/Purchase'
import Production from './pages/Production'
import QC from './pages/QC'
import Shipping from './pages/Shipping'
import { Items, Inventory, Moves } from './pages/Inventory'
import Accounting from './pages/Accounting'
import Developer from './pages/Developer'
import Users from './pages/Users'
import Simple from './simple/Simple'

const NAV = [
  ['總覽', [['/', '📊', '儀表板'], ['/progress', '🧭', '訂單進度']]],
  ['業務', [['/sales', '🧾', '銷售訂單'], ['/customers', '🏪', '客戶']]],
  ['採購', [['/purchase', '🛒', '採購單'], ['/receiving', '📥', '進貨紀錄'], ['/suppliers', '🚚', '供應商']]],
  ['生產', [['/production', '🍲', '生產工單'], ['/qc', '🔬', '品管 QC']]],
  ['物流', [['/shipping', '📦', '出貨'], ['/inventory', '🏬', '庫存'], ['/moves', '🔁', '庫存異動'], ['/items', '🥩', '品項與配方']]],
  ['財務', [['/accounting', '💰', '會計']]],
  ['系統', [['/users', '👥', '使用者'], ['/dev', '🛠️', '開發者']]],
]

function UserPicker({ className }) {
  const me = currentUser()
  return (
    <select className={className || 'input'} style={{ width: 'auto' }} value={me?.id || ''} onChange={(e) => setPref('userId', e.target.value)} aria-label="目前使用者">
      {all('users').map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}（{u.role}）
        </option>
      ))}
    </select>
  )
}

function Shell() {
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const loc = useLocation()
  const title = NAV.flatMap((g) => g[1]).find(([p]) => (p === '/' ? loc.pathname === '/' : loc.pathname.startsWith(p)))?.[2]
  return (
    <div className="layout">
      {open && <div className="backdrop" onClick={() => setOpen(false)} />}
      <aside className={'sidebar' + (open ? ' open' : '')}>
        <div className="brand">
          <div className="brand-logo">🐔</div>
          食品工廠 ERP
        </div>
        <nav className="nav">
          {NAV.map(([g, links]) => (
            <div className="nav-group" key={g}>
              <div className="nav-title">{g}</div>
              {links.map(([to, ico, label]) => (
                <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)}>
                  <span>{ico}</span>
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="選單">
            ☰
          </button>
          <b className="hide-sm">{title}</b>
          <span className="spacer" />
          <div className="mode-switch">
            <button className="on">標準</button>
            <button onClick={() => nav('/simple')}>簡易大按鈕</button>
          </div>
          <span className="hide-sm">
            <UserPicker />
          </span>
        </header>
        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/progress/:id" element={<Progress />} />
            <Route path="/sales" element={<SalesOrders />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/purchase" element={<PurchaseOrders />} />
            <Route path="/receiving" element={<Receiving />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/production" element={<Production />} />
            <Route path="/qc" element={<QC />} />
            <Route path="/shipping" element={<Shipping />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/moves" element={<Moves />} />
            <Route path="/items" element={<Items />} />
            <Route path="/accounting" element={<Accounting />} />
            <Route path="/users" element={<Users UserPicker={UserPicker} />} />
            <Route path="/dev" element={<Developer />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
        <nav className="bottombar">
          <NavLink to="/" end>
            <span className="ico">📊</span>總覽
          </NavLink>
          <NavLink to="/progress">
            <span className="ico">🧭</span>進度
          </NavLink>
          <NavLink to="/simple">
            <span className="ico">👆</span>大按鈕
          </NavLink>
          <NavLink to="/sales">
            <span className="ico">🧾</span>訂單
          </NavLink>
          <button onClick={() => setOpen(true)}>
            <span className="ico">☰</span>全部
          </button>
        </nav>
      </div>
    </div>
  )
}

export default function App() {
  useStore()
  return (
    <HashRouter>
      <Routes>
        <Route path="/simple/*" element={<Simple UserPicker={UserPicker} />} />
        <Route path="/*" element={<Shell />} />
      </Routes>
      <Toasts />
    </HashRouter>
  )
}
