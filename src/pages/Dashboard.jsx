import { useNavigate } from 'react-router-dom'
import { all, where } from '../db/store'
import { orderProgress, stockOf, balances, today, lotStock } from '../logic'
import { Kpi, Table, Badge, money, qty, itemName, itemUnit, partyName } from '../ui'

export function StepsBar({ p }) {
  return (
    <div className="steps">
      {p.steps.map((s, i) => (
        <div key={s.key} className={'step' + (s.pct >= 100 ? ' done' : '') + (i === p.current ? ' now' : '')}>
          <div className="t">{s.key}</div>
          <div className="v" title={s.text}>{s.text}</div>
          <div className="bar"><i style={{ width: s.pct + '%' }} /></div>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const nav = useNavigate()
  const orders = where('sales_orders', (s) => s.status !== 'cancelled').map((s) => orderProgress(s.id))
  const active = orders.filter((p) => p.status !== '已完成').sort((a, b) => String(a.so.due_date).localeCompare(String(b.so.due_date)))
  const low = all('items').filter((i) => i.type !== 'product' && i.safety_stock > 0 && stockOf(i.id) < i.safety_stock)
  const pendingLots = where('lots', (l) => l.qc_status === 'pending')
  const ready = where('lots', (l) => l.qc_status === 'pass').reduce((s, l) => s + lotStock(l), 0)
  const ar = all('invoices').reduce((s, i) => s + i.total - (i.paid || 0), 0)
  const ap = all('bills').reduce((s, i) => s + i.total - (i.paid || 0), 0)
  const month = today().slice(0, 7)
  const b = balances(month + '-01')
  const revenue = (b[4100]?.credit || 0) - (b[4100]?.debit || 0)
  const late = active.filter((p) => p.so.due_date && p.so.due_date < today()).length

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">儀表板</h1>
        <button className="btn primary" onClick={() => nav('/sales')}>＋ 新訂單</button>
      </div>
      <div className="grid grid-kpi">
        <Kpi label="進行中訂單" value={active.length} sub={late ? `⚠ ${late} 張已過交期` : '皆在交期內'} />
        <Kpi label="待 QC 批號" value={pendingLots.length} sub="檢驗合格才能出貨" />
        <Kpi label="可出貨成品" value={qty(ready)} sub="QC 合格庫存" />
        <Kpi label="本月營收" value={money(revenue)} sub="未稅" />
        <Kpi label="應收未收" value={money(ar)} />
        <Kpi label="應付未付" value={money(ap)} />
      </div>

      <div className="card">
        <div className="card-head"><h2 className="grow">訂單進度</h2><button className="btn sm" onClick={() => nav('/progress')}>全部</button></div>
        <div className="card-pad stack">
          {active.length === 0 && <div className="empty">目前沒有進行中的訂單</div>}
          {active.slice(0, 5).map((p) => (
            <div key={p.so.id} style={{ cursor: 'pointer' }} onClick={() => nav('/progress/' + p.so.id)}>
              <div className="row" style={{ marginBottom: 6 }}>
                <b>{p.so.no}</b>
                <span>{partyName('customers', p.so.customer_id)}</span>
                <Badge kind="primary">{p.status}</Badge>
                <span className="muted small">交期 {p.so.due_date}</span>
              </div>
              <StepsBar p={p} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-head"><h2 className="grow">低於安全庫存</h2><button className="btn sm" onClick={() => nav('/purchase')}>去採購</button></div>
          <Table
            empty="庫存都充足 👍"
            rows={low}
            columns={[
              { h: '品項', r: (i) => i.name },
              { h: '現有', cls: 'num', r: (i) => qty(stockOf(i.id), i.unit) },
              { h: '安全量', cls: 'num', r: (i) => qty(i.safety_stock, i.unit) },
            ]}
          />
        </div>
        <div className="card">
          <div className="card-head"><h2 className="grow">等待 QC 的批號</h2><button className="btn sm" onClick={() => nav('/qc')}>去檢驗</button></div>
          <Table
            empty="沒有待檢批號"
            rows={pendingLots}
            columns={[
              { h: '批號', r: (l) => l.lot_no },
              { h: '品項', r: (l) => itemName(l.item_id) },
              { h: '數量', cls: 'num', r: (l) => qty(l.qty, itemUnit(l.item_id)) },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
