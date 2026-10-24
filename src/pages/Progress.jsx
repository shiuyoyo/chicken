import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { all, get, where } from '../db/store'
import { orderProgress, woNeeds, woIssued, woFed, WO_STATUS, shippedQty } from '../logic'
import { Badge, Table, money, qty, dt, itemName, itemUnit, partyName, Search, matches } from '../ui'
import { StepsBar } from './Dashboard'

export default function Progress() {
  const { id } = useParams()
  return id ? <OrderDetail id={id} /> : <OrderList />
}

function OrderList() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [show, setShow] = useState('active')
  const list = all('sales_orders')
    .map((s) => orderProgress(s.id))
    .filter((p) => (show === 'all' ? true : show === 'done' ? p.status === '已完成' : p.status !== '已完成' && p.status !== '已取消'))
    .filter((p) => matches(q, p.so.no, partyName('customers', p.so.customer_id)))
    .sort((a, b) => String(b.so.date).localeCompare(String(a.so.date)))
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">訂單進度追蹤</h1>
        <Search value={q} onChange={setQ} placeholder="訂單號 / 客戶" />
        <select className="input" style={{ width: 'auto' }} value={show} onChange={(e) => setShow(e.target.value)}>
          <option value="active">進行中</option>
          <option value="done">已完成</option>
          <option value="all">全部</option>
        </select>
      </div>
      {list.length === 0 && <div className="card empty">沒有符合的訂單</div>}
      {list.map((p) => (
        <div key={p.so.id} className="card card-pad" style={{ cursor: 'pointer' }} onClick={() => nav('/progress/' + p.so.id)}>
          <div className="row" style={{ marginBottom: 8 }}>
            <b>{p.so.no}</b>
            <span>{partyName('customers', p.so.customer_id)}</span>
            <Badge kind={p.status === '已完成' ? 'ok' : 'primary'}>{p.status}</Badge>
            <span className="muted small">
              {p.so.lines.map((l) => `${itemName(l.item_id)}×${l.qty}`).join('、')}
            </span>
            <span className="grow" style={{ flex: 1 }} />
            <span className="muted small">交期 {p.so.due_date}</span>
          </div>
          <StepsBar p={p} />
        </div>
      ))}
    </div>
  )
}

function OrderDetail({ id }) {
  const nav = useNavigate()
  const p = orderProgress(id)
  if (!p) return <div className="empty">找不到訂單</div>
  const { so } = p
  const events = [
    ...p.pos.map((x) => ({ at: x.created_at, t: `開立採購單 ${x.no}（${partyName('suppliers', x.supplier_id)}）` })),
    ...where('stock_moves', (m) => (m.ref_type === 'purchase_orders' && p.pos.some((x) => x.id === m.ref_id))).map((m) => ({ at: m.date, t: `進貨 ${itemName(m.item_id)} ${qty(m.qty, itemUnit(m.item_id))}`, who: m.user_name })),
    ...p.wos.flatMap((w) => [
      { at: w.created_at, t: `開立工單 ${w.no}：${itemName(w.product_id)} ${w.plan_qty}` },
      ...where('stock_moves', (m) => m.ref_id === w.id && m.loc === 'WIP' && m.type === 'issue').map((m) => ({ at: m.date, t: `領料 ${itemName(m.item_id)} ${qty(m.qty, itemUnit(m.item_id))}`, who: m.user_name })),
      ...(w.feeds || []).map((f) => ({ at: f.at, t: `投料 ${itemName(f.item_id)} ${qty(f.qty, itemUnit(f.item_id))}`, who: f.user })),
      ...where('stock_moves', (m) => m.ref_id === w.id && m.type === 'output').map((m) => ({ at: m.date, t: `產出 ${itemName(m.item_id)} ${qty(m.qty, itemUnit(m.item_id))}（批號 ${m.lot_no}）`, who: m.user_name })),
    ]),
    ...where('qc_inspections', (q) => p.lots.some((l) => l.lot_no === q.lot_no)).map((q) => ({ at: q.created_at, t: `QC ${q.no} 批號 ${q.lot_no}：${q.result === 'pass' ? '合格' : '不合格'}`, who: q.inspector })),
    ...p.ships.map((s) => ({ at: s.created_at, t: `出貨 ${s.no}：${s.lines.map((l) => `${itemName(l.item_id)}×${l.qty}`).join('、')}，${s.boxes} 箱（${s.pack_mode}${s.container_no ? ' ' + s.container_no : ''}）` })),
    ...p.invs.map((i) => ({ at: i.created_at, t: `開立帳款 ${i.no} ${money(i.total)}` })),
    ...where('payments', (x) => p.invs.some((i) => i.id === x.invoice_id)).map((x) => ({ at: x.created_at, t: `收款 ${money(x.amount)}（${x.method}）` })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)))

  return (
    <div className="stack">
      <div className="page-head">
        <button className="btn" onClick={() => nav('/progress')}>← 返回</button>
        <h1 className="grow">{so.no} 進度</h1>
        <Badge kind={p.status === '已完成' ? 'ok' : 'primary'}>{p.status}</Badge>
        <button className="btn no-print" onClick={() => print()}>列印</button>
      </div>
      <div className="card card-pad">
        <div className="row" style={{ marginBottom: 12 }}>
          <span>客戶：<b>{partyName('customers', so.customer_id)}</b></span>
          <span className="muted">下單 {so.date}</span>
          <span className="muted">交期 {so.due_date}</span>
          <span className="muted">金額 {money(so.total)}</span>
        </div>
        <StepsBar p={p} />
      </div>

      <div className="card">
        <div className="card-head"><h2>產品數量</h2></div>
        <Table
          rows={so.lines}
          columns={[
            { h: '產品', r: (l) => itemName(l.item_id) },
            { h: '訂購', cls: 'num', r: (l) => qty(l.qty, itemUnit(l.item_id)) },
            { h: '已產出', cls: 'num', r: (l) => qty(p.wos.filter((w) => w.product_id === l.item_id).reduce((s, w) => s + (w.output_qty || 0), 0)) },
            { h: 'QC 合格', cls: 'num', r: (l) => qty(p.lots.filter((x) => x.item_id === l.item_id && x.qc_status === 'pass').reduce((s, x) => s + x.qty, 0)) },
            { h: '已出貨', cls: 'num', r: (l) => qty(shippedQty(so.id, l.item_id)) },
            { h: '未出貨', cls: 'num', r: (l) => qty(Math.max(0, l.qty - shippedQty(so.id, l.item_id))) },
          ]}
        />
      </div>

      <div className="card">
        <div className="card-head"><h2>生產工單與用料</h2></div>
        {p.wos.length === 0 && <div className="empty">尚未開立工單 — 到「生產工單」從這張訂單開工單</div>}
        {p.wos.map((w) => (
          <div key={w.id} className="card-pad" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <b>{w.no}</b> {itemName(w.product_id)} 計畫 {w.plan_qty}
              <Badge s={w.status}>{WO_STATUS[w.status]}</Badge>
              <span className="muted small">批號 {w.lot_no}・產出 {qty(w.output_qty)}・損耗 {qty(w.waste_qty)}</span>
            </div>
            <Table
              rows={woNeeds(w)}
              columns={[
                { h: '原料', r: (n) => itemName(n.item_id) },
                { h: '需求', cls: 'num', r: (n) => qty(n.qty, itemUnit(n.item_id)) },
                { h: '已領料', cls: 'num', r: (n) => qty(woIssued(w, n.item_id)) },
                { h: '已投料', cls: 'num', r: (n) => qty(woFed(w, n.item_id)) },
              ]}
            />
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head"><h2>歷程</h2></div>
        <div className="card-pad">
          <ul className="timeline">
            {events.map((e, i) => (
              <li key={i}>
                <span className="when">{dt(e.at)}</span>
                <span style={{ flex: 1 }}>{e.t}</span>
                {e.who && <span className="muted small">{e.who}</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
