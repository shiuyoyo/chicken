import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { all, where } from '../db/store'
import * as L from '../logic'
import { Badge, Table, money, qty, dt, itemName, itemUnit, partyName, Search, matches, DocLink, LotLink } from '../ui'
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
    .map((s) => L.orderProgress(s.id))
    .filter((p) => (show === 'all' ? true : show === 'done' ? ['已完成', '已取消', '核准退回'].includes(p.status) : !['已完成', '已取消', '核准退回'].includes(p.status)))
    .filter((p) => matches(q, p.so.no, partyName('customers', p.so.customer_id)))
    .sort((a, b) => String(b.so.date).localeCompare(String(a.so.date)))
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">訂單進度追蹤</h1>
        <Search value={q} onChange={setQ} placeholder="訂單號 / 客戶" />
        <select className="input auto" value={show} onChange={(e) => setShow(e.target.value)} aria-label="篩選">
          <option value="active">進行中</option>
          <option value="done">已結束</option>
          <option value="all">全部</option>
        </select>
      </div>
      {list.length === 0 && <div className="card empty">沒有符合的訂單</div>}
      {list.map((p) => (
        <div key={p.so.id} className="card card-pad clickable" onClick={() => nav('/progress/' + p.so.id)}>
          <div className="row" style={{ marginBottom: 8 }}>
            <b>{p.so.no}</b>
            <span>{partyName('customers', p.so.customer_id)}</span>
            <Badge kind={p.status === '已完成' ? 'ok' : p.so.status === 'pending' ? 'warn' : 'primary'}>{p.status}</Badge>
            <span className="muted small">{p.so.lines.map((l) => `${itemName(l.item_id)}×${l.qty}`).join('、')}</span>
            <span style={{ flex: 1 }} />
            <span className={'small ' + (p.so.due_date < L.today() && p.status !== '已完成' ? 'tone-bad' : 'muted')}>交期 {p.so.due_date}</span>
          </div>
          <StepsBar p={p} />
        </div>
      ))}
    </div>
  )
}

function OrderDetail({ id }) {
  const nav = useNavigate()
  const p = L.orderProgress(id)
  if (!p) return <div className="empty">找不到訂單</div>
  const { so } = p
  const mv = (fn) => where('stock_moves', fn)
  const events = [
    p.quote && { at: p.quote.created_at, t: <>報價 <DocLink t="quotations" row={p.quote} /> {money(p.quote.total)}</> },
    { at: so.created_at, t: <>接單 <DocLink t="sales_orders" row={so} /> {money(so.total)}</> },
    ...p.approvals.map((a) => ({ at: a.decided_at || a.created_at, t: <>簽核 {L.APPROVAL_TYPES[a.type]}：<Badge s={a.status}>{a.status === 'pending' ? '待核准' : undefined}</Badge> {a.reason}</>, who: partyName('users', a.decided_by || a.requested_by) })),
    ...p.pos.map((x) => ({ at: x.created_at, t: <>開立採購單 <DocLink t="purchase_orders" row={x} />（{partyName('suppliers', x.supplier_id)}）</> })),
    ...mv((m) => m.type === 'receive' && p.pos.some((x) => x.id === m.ref_id)).map((m) => ({ at: m.date, t: <>進貨 {itemName(m.item_id)} {qty(m.qty, itemUnit(m.item_id))} 批號 <LotLink no={m.lot_no} /></>, who: m.user_name })),
    ...p.wos.flatMap((w) => [
      { at: w.created_at, t: <>開立工單 <DocLink t="work_orders" row={w} />：{itemName(w.product_id)} {w.plan_qty}（{w.plan_date} {w.line}）</> },
      ...mv((m) => m.ref_id === w.id && m.type === 'issue' && m.qty > 0).map((m) => ({ at: m.date, t: <>領料 {itemName(m.item_id)} {qty(m.qty, itemUnit(m.item_id))}（<LotLink no={m.lot_no} />）</>, who: m.user_name })),
      ...(w.feeds || []).map((f) => ({ at: f.at, t: <>投料 {itemName(f.item_id)} {qty(f.qty, itemUnit(f.item_id))}（<LotLink no={f.lot_no} />）</>, who: f.user })),
      ...mv((m) => m.ref_id === w.id && m.type === 'output').map((m) => ({ at: m.date, t: <>產出 {itemName(m.item_id)} {qty(m.qty, itemUnit(m.item_id))}（批號 <LotLink no={m.lot_no} />）</>, who: m.user_name })),
    ]),
    ...where('qc_inspections', (q) => p.lots.some((l) => l.lot_no === q.lot_no)).map((q) => ({ at: q.created_at, t: <>QC {q.no} 批號 <LotLink no={q.lot_no} />：<Badge s={q.result} /></>, who: q.inspector })),
    ...p.ships.map((s) => ({ at: s.created_at, t: <>出貨 <DocLink t="shipments" row={s} />：{s.lines.map((l) => `${itemName(l.item_id)}×${l.qty}`).join('、')}，{s.boxes} 箱（{s.pack_mode}{s.container_no ? ' ' + s.container_no : ''}）</> })),
    ...p.invs.map((i) => ({ at: i.created_at, t: <>開立帳款 {i.no} 發票 {i.gui_no} {money(i.total)}</> })),
    ...p.returns.map((r) => ({ at: r.created_at, t: <>退貨 {r.no} {money(r.amount + r.tax)}（{r.reason}）<Badge s={r.status}>{r.status === 'pending' ? '待核准' : undefined}</Badge></> })),
    ...p.payments.map((x) => ({ at: x.created_at, t: <>收款 {money(x.amount)}（{x.method}）</> })),
  ]
    .filter(Boolean)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))

  return (
    <div className="stack">
      <div className="page-head">
        <button className="btn" onClick={() => nav('/progress')}>← 返回</button>
        <h1 className="grow">{so.no} 進度</h1>
        <Badge kind={p.status === '已完成' ? 'ok' : so.status === 'pending' ? 'warn' : 'primary'}>{p.status}</Badge>
      </div>
      <div className="card card-pad">
        <div className="row" style={{ marginBottom: 12 }}>
          <span>客戶：<DocLink t="customers" id={so.customer_id} /></span>
          <span className="muted">下單 {so.date}</span>
          <span className="muted">交期 {so.due_date}</span>
          <span className="muted">金額 {money(so.total)}</span>
        </div>
        <StepsBar p={p} />
      </div>

      <div className="card">
        <div className="card-head"><h2>產品數量</h2></div>
        <Table rows={so.lines} columns={[
          { h: '產品', r: (l) => itemName(l.item_id) },
          { h: '訂購', cls: 'num', r: (l) => qty(l.qty, itemUnit(l.item_id)) },
          { h: '已產出', cls: 'num', r: (l) => qty(L.sum(p.wos.filter((w) => w.product_id === l.item_id), (w) => w.output_qty)) },
          { h: 'QC 合格', cls: 'num', r: (l) => qty(L.sum(p.lots.filter((x) => x.item_id === l.item_id && x.qc_status === 'pass'), (x) => x.qty)) },
          { h: '已出貨', cls: 'num', r: (l) => qty(L.shippedQty(so.id, l.item_id)) },
          { h: '退回', cls: 'num', r: (l) => qty(L.soReturnedQty(so.id, l.item_id)) },
          { h: '未出貨', cls: 'num', r: (l) => qty(L.remainingToShip(so, l.item_id)) },
        ]} />
      </div>

      <div className="card">
        <div className="card-head"><h2>生產工單與用料（含原料批號）</h2></div>
        {p.wos.length === 0 && <div className="empty">尚未開立工單</div>}
        {p.wos.map((w) => (
          <div key={w.id} className="card-pad divider">
            <div className="row" style={{ marginBottom: 8 }}>
              <DocLink t="work_orders" row={w} /> {itemName(w.product_id)} 計畫 {w.plan_qty}
              <Badge s={w.status}>{L.WO_STATUS[w.status]}</Badge>
              <span className="muted small">批號 <LotLink no={w.lot_no} />・產出 {qty(w.output_qty)}・損耗 {qty(w.waste_qty)} kg</span>
            </div>
            <Table rows={L.woNeeds(w)} columns={[
              { h: '原料', r: (n) => itemName(n.item_id) },
              { h: '需求', cls: 'num', r: (n) => qty(n.qty, itemUnit(n.item_id)) },
              { h: '已領料', cls: 'num', r: (n) => qty(L.woIssued(w, n.item_id)) },
              { h: '已投料', cls: 'num', r: (n) => qty(L.woFed(w, n.item_id)) },
              { h: '使用批號', r: (n) => [...new Set((w.feeds || []).filter((f) => f.item_id === n.item_id).map((f) => f.lot_no))].map((no) => <LotLink key={no} no={no} />).reduce((a, b) => (a.length ? [...a, '、', b] : [b]), []) },
            ]} />
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head"><h2>完整歷程</h2></div>
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
