import { useState } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation, useNavigate, Navigate, Link } from 'react-router-dom'
import { useStore, currentUser } from './db/store'
import { can, canDecide, pendingApprovals, pendingContacts, logout, roleOf, MODULES } from './logic'
import { Toasts, AskHost, NoAccess } from './ui'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Approvals from './pages/Approvals'
import Progress from './pages/Progress'
import { Customers, Customer360, CrmWork, Quotations, PriceLists } from './pages/Crm'
import { SalesOrders, Returns } from './pages/Sales'
import { PurchaseOrders, Suppliers, Receiving } from './pages/Purchase'
import { Production, Schedule } from './pages/Production'
import QC from './pages/QC'
import Shipping from './pages/Shipping'
import Wms from './pages/Wms'
import Trace from './pages/Trace'
import { Items } from './pages/Items'
import Accounting from './pages/Accounting'
import Reports from './pages/Reports'
import { PosSales, Members } from './pages/PosAdmin'
import Admin from './pages/Admin'
import Developer from './pages/Developer'
import SystemMap from './pages/SystemMap'
import Notify from './pages/Notify'
import Requisitions from './pages/Requisitions'
import Forms from './print/Forms'
import PrintView from './print/PrintView'
import Pos from './pos/Pos'
import Simple from './simple/Simple'

// [路徑, 圖示, 名稱, 權限模組, 元件]
const NAV = [
  ['總覽', [
    ['/', '📊', '儀表板', 'dashboard', Dashboard],
    ['/approvals', '✅', '簽核中心', null, Approvals],
    ['/progress', '🧭', '訂單進度', 'progress', Progress],
  ]],
  ['客戶關係 CRM', [
    ['/customers', '🏪', '客戶', 'crm', Customers],
    ['/crm', '📇', '業務活動與商機', 'crm', CrmWork],
    ['/quotes', '📝', '報價單', 'crm', Quotations],
    ['/price-lists', '🏷️', '價格表', 'crm', PriceLists],
  ]],
  ['銷售', [
    ['/sales', '🧾', '銷售訂單', 'sales', SalesOrders],
    ['/returns', '↩️', '退貨', 'sales', Returns],
  ]],
  ['採購', [
    ['/requisitions', '📋', '請購單', ['purchase', 'wms', 'production'], Requisitions],
    ['/purchase', '🛒', '採購單', 'purchase', PurchaseOrders],
    ['/receiving', '📥', '進貨', ['purchase', 'wms'], Receiving],
    ['/suppliers', '🚚', '供應商', 'purchase', Suppliers],
  ]],
  ['生產與品管', [
    ['/production', '🍲', '生產工單', 'production', Production],
    ['/schedule', '📅', '生產排程', 'production', Schedule],
    ['/qc', '🔬', '品管 QC', 'qc', QC],
  ]],
  ['倉儲物流 WMS', [
    ['/shipping', '📦', '出貨', 'shipping', Shipping],
    ['/wms', '🏬', '倉儲管理', 'wms', Wms],
    ['/trace', '🔎', '食品追溯', 'trace', Trace],
  ]],
  ['門市 POS', [
    ['/pos', '🛍️', '收銀台', 'pos', null],
    ['/pos-sales', '🧮', '門市銷售與日結', 'pos', PosSales],
    ['/members', '🎟️', '會員', 'pos', Members],
  ]],
  ['財務', [
    ['/accounting', '💰', '會計', 'accounting', Accounting],
    ['/reports', '📈', '經營報表', ['accounting', 'sales'], Reports],
  ]],
  ['系統', [
    ['/items', '🥩', '品項與配方', 'master', Items],
    ['/admin', '👥', '使用者與權限', 'admin', Admin],
    ['/notify', '💬', 'LINE 通知', 'admin', Notify],
    ['/forms', '🖨️', '表單列印', null, Forms],
    ['/map', '🗺️', '系統關聯圖', null, SystemMap],
    ['/dev', '🛠️', '開發者', 'dev', Developer],
  ]],
]
const allowed = (mod) => !mod || (Array.isArray(mod) ? mod.some((m) => can(m, 1)) : can(mod, 1))
const modLabel = (mod) => (Array.isArray(mod) ? mod.map((m) => MODULES[m]).join(' / ') : MODULES[mod])

function Gate({ mod, children }) {
  return allowed(mod) ? children : <NoAccess mod={modLabel(mod)} />
}

function Shell() {
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const loc = useLocation()
  const me = currentUser()
  const links = NAV.flatMap((g) => g[1])
  const title = links.find(([p]) => (p === '/' ? loc.pathname === '/' : loc.pathname.startsWith(p)))?.[2]
  const myApprovals = pendingApprovals().filter((a) => canDecide(a)).length
  const pendingBind = can('admin', 2) ? pendingContacts().length : 0
  const home = can('dashboard') ? '/' : links.find(([p, , , m]) => p !== '/' && m && allowed(m))?.[0] || '/approvals'
  return (
    <div className="layout">
      {open && <div className="backdrop" onClick={() => setOpen(false)} />}
      <aside className={'sidebar' + (open ? ' open' : '')} aria-label="主選單">
        <div className="brand">
          <div className="brand-logo">🐔</div>
          <div>
            食品工廠 ERP
            <div className="small muted">{me.name}｜{roleOf(me)?.name}</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map(([g, ls]) => {
            const vis = ls.filter(([, , , m]) => allowed(m))
            if (!vis.length) return null
            return (
              <div className="nav-group" key={g}>
                <div className="nav-title">{g}</div>
                {vis.map(([to, ico, label]) => (
                  <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)}>
                    <span aria-hidden="true">{ico}</span>
                    {label}
                    {to === '/approvals' && myApprovals > 0 && <span className="nav-count">{myApprovals}</span>}
                    {to === '/notify' && pendingBind > 0 && <span className="nav-count">{pendingBind}</span>}
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="開啟選單">
            ☰
          </button>
          <b className="hide-sm">{title}</b>
          <span className="spacer" />
          {myApprovals > 0 && (
            <Link to="/approvals" className="badge warn" title="待我核准">
              待簽 {myApprovals}
            </Link>
          )}
          <div className="mode-switch">
            <button className="on">標準</button>
            <button onClick={() => nav('/simple')}>大按鈕</button>
          </div>
          <button className="btn sm" onClick={logout} title={`${me.name} 登出`}>
            登出
          </button>
        </header>
        <main className="content">
          <Routes>
            {links
              .filter(([, , , , C]) => C)
              .map(([to, , , mod, C]) => (
                <Route key={to} path={to} element={to === '/' && !can('dashboard') ? <Navigate to={home} /> : <Gate mod={mod}><C /></Gate>} />
              ))}
            <Route path="/progress/:id" element={<Gate mod="progress"><Progress /></Gate>} />
            <Route path="/customers/:id" element={<Gate mod="crm"><Customer360 /></Gate>} />
            <Route path="*" element={<Navigate to={home} />} />
          </Routes>
        </main>
        <nav className="bottombar" aria-label="快捷列">
          <NavLink to={home} end>
            <span className="ico">📊</span>首頁
          </NavLink>
          <NavLink to="/approvals">
            <span className="ico">✅</span>簽核{myApprovals ? `(${myApprovals})` : ''}
          </NavLink>
          <NavLink to="/simple">
            <span className="ico">👆</span>大按鈕
          </NavLink>
          {can('pos') ? (
            <NavLink to="/pos">
              <span className="ico">🛍️</span>收銀
            </NavLink>
          ) : (
            <NavLink to="/progress">
              <span className="ico">🧭</span>進度
            </NavLink>
          )}
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
  const me = currentUser()
  return (
    <HashRouter>
      {!me ? (
        <Login />
      ) : (
        <Routes>
          <Route path="/simple/*" element={<Simple />} />
          <Route path="/pos" element={<Gate mod="pos"><Pos /></Gate>} />
          <Route path="/print/:type/:id" element={<PrintView />} />
          <Route path="/*" element={<Shell />} />
        </Routes>
      )}
      <Toasts />
      <AskHost />
    </HashRouter>
  )
}
