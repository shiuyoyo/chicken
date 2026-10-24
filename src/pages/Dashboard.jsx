import { Link, useNavigate } from 'react-router-dom'
import { all, where, currentUser } from '../db/store'
import * as L from '../logic'
import { Kpi, Table, Badge, money, qty, itemName, itemUnit, partyName, LotLink, DocLink } from '../ui'

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

function Panel({ title, to, toLabel = '查看', children }) {
  return (
    <div className="card">
      <div className="card-head">
        <h2 className="grow">{title}</h2>
        {to && <Link className="btn sm" to={to}>{toLabel}</Link>}
      </div>
      {children}
    </div>
  )
}

export default function Dashboard() {
  const nav = useNavigate()
  const me = currentUser()
  const c = (m, l = 1) => L.can(m, l)
  const orders = c('progress') ? where('sales_orders', (s) => ['confirmed', 'pending'].includes(s.status)).map((s) => L.orderProgress(s.id)) : []
  const active = orders.sort((a, b) => String(a.so.due_date).localeCompare(String(b.so.due_date)))
  const late = active.filter((p) => p.so.due_date && p.so.due_date < L.today()).length
  const mine = L.pendingApprovals().filter((a) => L.canDecide(a))
  const myReq = L.pendingApprovals().filter((a) => a.requested_by === me.id)
  const month = L.today().slice(0, 7)
  const pl = L.profitAndLoss(month + '-01', L.today())
  const ar = L.sum(all('invoices'), L.invoiceBalance)
  const ap = L.sum(all('bills'), L.billBalance)
  const expiring = L.expiringLots()
  const low = L.lowStockItems()
  const follow = L.dueFollowups()
  const reorder = c('crm') ? L.reorderReminders() : []
  const todayWO = where('work_orders', (w) => w.plan_date === L.today() && !['closed', 'cancelled'].includes(w.status))
  const store = L.storeBins()[0]
  const shift = store && L.openShift(store.id)
  const shiftSum = shift && L.shiftSummary(shift.id)

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">早安，{me.name}</h1>
        {c('sales', 2) && <button className="btn primary" onClick={() => nav('/sales?new=1')}>＋ 新訂單</button>}
      </div>

      <div className="grid grid-kpi">
        <Kpi label="待我簽核" value={mine.length} sub={myReq.length ? `我送出的 ${myReq.length} 筆等待中` : '沒有等待中的申請'} to="/approvals" tone={mine.length ? 'warn' : ''} />
        {c('progress') && <Kpi label="進行中訂單" value={active.length} sub={late ? `⚠ ${late} 張已過交期` : '皆在交期內'} to="/progress" tone={late ? 'bad' : ''} />}
        {c('qc') && <Kpi label="待 QC 批號" value={L.pendingLots().length} sub="合格才能出貨 / 使用" to="/qc" />}
        {c('wms') && <Kpi label="效期預警" value={expiring.length} sub={`${L.getSetting('expiry_warn_days')} 天內到期或已過期`} to="/wms?tab=expiry" tone={expiring.some((l) => L.isExpired(l)) ? 'bad' : ''} />}
        {c('accounting') && <Kpi label="本月淨利" value={money(pl.net)} sub={`營收 ${money(pl.revenue)}`} to="/accounting?tab=pl" />}
        {c('accounting') && <Kpi label="應收 / 應付" value={money(ar)} sub={`應付 ${money(ap)}`} to="/accounting?tab=ar" />}
        {c('pos') && <Kpi label="門市今日" value={shiftSum ? money(shiftSum.total) : '未開班'} sub={shiftSum ? `${shiftSum.count} 筆交易` : '到收銀台開班'} to="/pos" />}
        {c('crm') && <Kpi label="今日待辦跟進" value={follow.length} sub={reorder.length ? `${reorder.length} 位客戶該回購了` : ''} to="/crm" />}
      </div>

      {mine.length > 0 && (
        <Panel title="待我簽核" to="/approvals" toLabel="簽核中心">
          <Table rows={mine.slice(0, 5)} onRow={() => nav('/approvals')} columns={[
            { h: '類型', r: (a) => <Badge kind="warn">{L.APPROVAL_TYPES[a.type]}</Badge> },
            { h: '內容', r: (a) => a.summary },
            { h: '原因', r: (a) => <span className="small">{a.reason}</span> },
            { h: '申請人', r: (a) => partyName('users', a.requested_by) },
          ]} />
        </Panel>
      )}

      {c('progress') && (
        <Panel title="訂單進度" to="/progress" toLabel="全部">
          <div className="card-pad stack">
            {active.length === 0 && <div className="empty">目前沒有進行中的訂單</div>}
            {active.slice(0, 4).map((p) => (
              <div key={p.so.id} className="clickable" onClick={() => nav('/progress/' + p.so.id)}>
                <div className="row" style={{ marginBottom: 6 }}>
                  <b>{p.so.no}</b>
                  <span>{partyName('customers', p.so.customer_id)}</span>
                  <Badge kind={p.so.status === 'pending' ? 'warn' : 'primary'}>{p.status}</Badge>
                  <span className="muted small">交期 {p.so.due_date}</span>
                </div>
                <StepsBar p={p} />
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="grid grid-2">
        {c('production') && (
          <Panel title="今日生產" to="/schedule" toLabel="排程">
            <Table empty="今天沒有排工單" rows={todayWO} onRow={(w) => nav(`/production?open=${w.id}`)} columns={[
              { h: '工單', r: (w) => w.no },
              { h: '產線', r: (w) => w.line },
              { h: '產品', r: (w) => itemName(w.product_id) },
              { h: '計畫', cls: 'num', r: (w) => qty(w.plan_qty) },
              { h: '狀態', r: (w) => <Badge s={w.status}>{L.WO_STATUS[w.status]}</Badge> },
            ]} />
          </Panel>
        )}
        {c('wms') && (
          <Panel title="效期預警" to="/wms?tab=expiry">
            <Table empty="沒有快到期的批號 👍" rows={expiring.slice(0, 6)} columns={[
              { h: '批號', r: (l) => <LotLink no={l.lot_no} /> },
              { h: '品項', r: (l) => itemName(l.item_id) },
              { h: '庫存', cls: 'num', r: (l) => qty(L.lotStock(l.lot_no), itemUnit(l.item_id)) },
              { h: '到期', r: (l) => (L.isExpired(l) ? <Badge kind="bad">已過期 {l.exp_date}</Badge> : <Badge kind="warn">剩 {L.daysLeft(l)} 天</Badge>) },
            ]} />
          </Panel>
        )}
        {(c('purchase') || c('wms')) && (
          <Panel title="低於安全庫存" to="/purchase" toLabel="去採購">
            <Table empty="庫存都充足 👍" rows={low} columns={[
              { h: '品項', r: (i) => i.name },
              { h: '可用', cls: 'num', r: (i) => qty(L.stockOf(i.id), i.unit) },
              { h: '安全量', cls: 'num', r: (i) => qty(i.safety_stock, i.unit) },
              { h: '已訂未到', cls: 'num', r: (i) => qty(L.openPOQty(i.id)) },
            ]} />
          </Panel>
        )}
        {c('crm') && (
          <Panel title="業務待辦" to="/crm">
            <Table empty="今天沒有待辦" rows={follow.slice(0, 6)} columns={[
              { h: '日期', r: (a) => (a.next_date < L.today() ? <Badge kind="bad">{a.next_date}</Badge> : a.next_date) },
              { h: '客戶', r: (a) => <DocLink t="customers" id={a.customer_id} /> },
              { h: '待辦', r: (a) => a.next_action },
            ]} />
            {reorder.length > 0 && (
              <div className="card-pad small">
                🔔 該回購但還沒下單：{reorder.map((x) => <DocLink key={x.c.id} t="customers" row={x.c}>{x.c.name}（預計 {x.nextExpected}）</DocLink>).reduce((a, b) => [a, '、', b])}
              </div>
            )}
          </Panel>
        )}
      </div>
    </div>
  )
}

