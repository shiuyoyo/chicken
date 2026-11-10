import { useState } from 'react'
import { all, get } from '../db/store'
import * as L from '../logic'
import { Field, Input, Table, Tabs, Kpi, Badge, money, qty, itemName, itemUnit, partyName, useTab, LotLink, PrintButton, attempt } from '../ui'

function Bars({ rows, value = (r) => r.revenue, label = (r) => r.key }) {
  const max = Math.max(1, ...rows.map(value))
  return (
    <div className="bars">
      {rows.map((r) => (
        <div key={r.key} className="bar-row">
          <span className="bar-label" title={label(r)}>{label(r)}</span>
          <span className="bar-track"><i style={{ width: `${(value(r) / max) * 100}%` }} /></span>
          <span className="bar-val">{money(value(r))}</span>
        </div>
      ))}
    </div>
  )
}

export default function Reports() {
  const [tab, setTab] = useTab('sales')
  const [from, setFrom] = useState(L.addDays(L.today(), -90))
  const [to, setTo] = useState(L.today())
  const lines = L.salesLines(from, to)
  const byItem = L.groupSales(lines, (l) => l.item_id)
  const byCust = L.groupSales(lines, (l) => l.customer_id || '門市非會員')
  const byChannel = L.groupSales(lines, (l) => l.channel)
  const byMonth = L.groupSales(lines, (l) => l.date.slice(0, 7)).sort((a, b) => a.key.localeCompare(b.key))
  const total = L.groupSales(lines, () => 'all')[0] || { revenue: 0, cost: 0, margin: 0, pct: 0 }
  const inv = L.inventoryValuation()
  const custName = (k) => (get('customers', k)?.name || k)
  return (
    <div className="stack">
      <div className="page-head"><h1 className="grow">經營報表</h1></div>
      <Tabs value={tab} onChange={setTab} tabs={[['sales', '銷售與毛利'], ['people', '業務業績'], ['inventory', '庫存評價']]} />
      {tab === 'sales' && (
        <>
          <div className="row">
            <Field label="期間起"><Input type="date" value={from} onChange={setFrom} /></Field>
            <Field label="期間迄"><Input type="date" value={to} onChange={setTo} /></Field>
          </div>
          <div className="grid grid-kpi">
            <Kpi label="銷售額（未稅，扣退貨）" value={money(total.revenue)} />
            <Kpi label="銷貨成本" value={money(total.cost)} />
            <Kpi label="毛利" value={money(total.margin)} sub={`毛利率 ${total.pct}%`} />
            {byChannel.map((c) => <Kpi key={c.key} label={`${c.key}通路`} value={money(c.revenue)} sub={`毛利率 ${c.pct}%`} />)}
          </div>
          <div className="grid grid-2">
            <div className="card"><div className="card-head"><h3>依產品</h3></div><div className="card-pad"><Bars rows={byItem} label={(r) => itemName(r.key)} /></div>
              <Table rows={byItem.map((r) => ({ id: r.key, ...r }))} columns={[
                { h: '產品', r: (r) => itemName(r.key) },
                { h: '數量', cls: 'num', r: (r) => qty(r.qty, itemUnit(r.key)) },
                { h: '銷售額', cls: 'num', r: (r) => money(r.revenue) },
                { h: '毛利', cls: 'num', r: (r) => money(r.margin) },
                { h: '毛利率', cls: 'num', r: (r) => `${r.pct}%` },
              ]} />
            </div>
            <div className="card"><div className="card-head"><h3>依客戶</h3></div><div className="card-pad"><Bars rows={byCust} label={(r) => custName(r.key)} /></div>
              <Table rows={byCust.map((r) => ({ id: r.key, ...r }))} columns={[
                { h: '客戶', r: (r) => custName(r.key) },
                { h: '銷售額', cls: 'num', r: (r) => money(r.revenue) },
                { h: '毛利', cls: 'num', r: (r) => money(r.margin) },
                { h: '毛利率', cls: 'num', r: (r) => `${r.pct}%` },
              ]} />
            </div>
          </div>
          <div className="card"><div className="card-head"><h3>依月份</h3></div><div className="card-pad"><Bars rows={byMonth} /></div></div>
        </>
      )}
      {tab === 'people' && <SalesPeople from={from} to={to} setFrom={setFrom} setTo={setTo} />}
      {tab === 'inventory' && (
        <>
          <div className="grid grid-kpi">
            {inv.byWarehouse.map((w) => <Kpi key={w.warehouse?.id} label={w.warehouse?.name} value={money(w.value)} sub={`${w.rows} 個批號`} />)}
          </div>
          <div className="card">
            <Table rows={inv.rows.sort((a, b) => b.value - a.value).map((r, i) => ({ id: i, ...r }))} columns={[
              { h: '儲位', r: (r) => L.binLabel(r.bin_id) },
              { h: '品項', r: (r) => r.item?.name },
              { h: '批號', r: (r) => <LotLink no={r.lot_no} /> },
              { h: '數量', cls: 'num', r: (r) => qty(r.qty, r.item?.unit) },
              { h: '單位成本', cls: 'num', r: (r) => money(r.lot?.unit_cost) },
              { h: '價值', cls: 'num', r: (r) => money(r.value) },
              { h: '效期', r: (r) => (r.lot && L.isExpired(r.lot) ? <Badge kind="bad">已過期</Badge> : r.lot?.exp_date) },
            ]} />
          </div>
        </>
      )}
    </div>
  )
}

const personName = (id) => (id ? partyName('users', id) : '（未指定業務）')

function SalesPeople({ from, to, setFrom, setTo }) {
  const rows = L.salesPerformance(from, to)
  const trend = L.salesTrend(6, to)
  const [targets, setTargets] = useState(null)
  const canSet = L.can('sales', 3) || L.can('admin', 2)
  const sales = all('users').filter((u) => u.active !== false && Number(get('roles', u.role_id)?.perms?.sales || 0) >= 2)
  const totalRev = L.sum(rows, (r) => r.revenue)
  return (
    <>
      <div className="row">
        <Field label="期間起"><Input type="date" value={from} onChange={setFrom} /></Field>
        <Field label="期間迄"><Input type="date" value={to} onChange={setTo} /></Field>
        <button className="btn sm" onClick={() => { setFrom(L.today().slice(0, 7) + '-01'); setTo(L.today()) }}>本月</button>
        <span style={{ flex: 1 }} />
        <PrintButton type="sales_performance" id={`${from}~${to}`} label="業績報表" />
        {canSet && <button className="btn" onClick={() => setTargets(targets ? null : { ...L.salesTargets() })}>{targets ? '收起目標設定' : '設定每月目標'}</button>}
      </div>
      {targets && (
        <div className="card card-pad stack">
          <b>每位業務的每月業績目標（未稅出貨金額）</b>
          <div className="form-grid">
            {sales.map((u) => <Field key={u.id} label={u.name}><Input type="number" value={targets[u.id] ?? ''} onChange={(v) => setTargets({ ...targets, [u.id]: v })} /></Field>)}
          </div>
          <div className="row"><button className="btn primary" onClick={() => attempt(() => L.saveSalesTargets(targets), '目標已儲存') && setTargets(null)}>儲存目標</button></div>
        </div>
      )}
      <div className="grid grid-kpi">
        {rows.filter((r) => r.user_id).slice(0, 4).map((r) => (
          <Kpi key={r.user_id} label={personName(r.user_id)} value={money(r.revenue)} sub={`${r.achieve !== null ? `達成 ${r.achieve}%・` : ''}毛利率 ${r.pct}%`} />
        ))}
      </div>
      <div className="card">
        <div className="card-head"><h3 className="grow">業務業績（出貨扣退貨，未稅）</h3><span className="small muted">合計 {money(totalRev)}</span></div>
        <Table rows={rows.map((r) => ({ id: r.user_id || 'none', ...r }))} columns={[
          { h: '業務', r: (r) => <b>{personName(r.user_id)}</b> },
          { h: '銷售額', cls: 'num', r: (r) => money(r.revenue) },
          { h: '佔比', cls: 'num', r: (r) => (totalRev ? `${Math.round((r.revenue / totalRev) * 100)}%` : '') },
          { h: '目標', cls: 'num', r: (r) => (r.target ? money(r.target) : '—') },
          { h: '達成率', cls: 'num', r: (r) => (r.achieve === null ? '—' : <Badge kind={r.achieve >= 100 ? 'ok' : r.achieve >= 70 ? 'warn' : 'bad'}>{r.achieve}%</Badge>) },
          { h: '毛利', cls: 'num', r: (r) => money(r.margin) },
          { h: '毛利率', cls: 'num', r: (r) => `${r.pct}%` },
          { h: '接單（筆 / 金額）', cls: 'num', r: (r) => `${r.orders} / ${money(r.ordered)}` },
          { h: '出貨客戶', cls: 'num', r: (r) => r.customers },
          { h: '新客戶', cls: 'num', r: (r) => r.newCustomers },
          { h: '報價成交', cls: 'num', r: (r) => (r.winRate === null ? '—' : `${r.won}/${r.quotes}（${r.winRate}%）`) },
          { h: '負責客戶應收未收', cls: 'num', r: (r) => money(r.ar) },
        ]} />
      </div>
      <div className="card">
        <div className="card-head"><h3>近 6 個月出貨銷售額</h3></div>
        <Table rows={trend.rows.map((r) => ({ id: r.user_id || 'none', ...r }))} columns={[
          { h: '業務', r: (r) => personName(r.user_id) },
          ...trend.months.map((m) => ({ h: m, cls: 'num', r: (r) => (r.months[m] ? money(r.months[m]) : '') })),
        ]} />
      </div>
    </>
  )
}

export { partyName }
