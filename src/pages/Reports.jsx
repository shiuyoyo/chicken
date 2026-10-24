import { useState } from 'react'
import { get } from '../db/store'
import * as L from '../logic'
import { Field, Input, Table, Tabs, Kpi, Badge, money, qty, itemName, itemUnit, partyName, useTab, LotLink } from '../ui'

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
      <Tabs value={tab} onChange={setTab} tabs={[['sales', '銷售與毛利'], ['inventory', '庫存評價']]} />
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

export { partyName }
