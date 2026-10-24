import { useState } from 'react'
import { all, get } from '../db/store'
import { createWorkOrder, woNeeds, woIssued, woFed, issueMaterials, feedMaterials, recordOutput, closeWorkOrder, stockOf, WO_STATUS, round } from '../logic'
import { Modal, Field, Input, Select, Table, Badge, Tabs, Search, matches, qty, dt, itemName, itemUnit, partyName, itemOptions, attempt, toast } from '../ui'

export default function Production() {
  const [q, setQ] = useState('')
  const [show, setShow] = useState('active')
  const [open, setOpen] = useState(null)
  const [create, setCreate] = useState(null)
  const rows = all('work_orders')
    .filter((w) => (show === 'active' ? w.status !== 'closed' : show === 'closed' ? w.status === 'closed' : true))
    .filter((w) => matches(q, w.no, w.lot_no, itemName(w.product_id), get('sales_orders', w.sales_order_id)?.no))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">生產工單</h1>
        <Search value={q} onChange={setQ} placeholder="工單 / 批號 / 產品" />
        <select className="input" style={{ width: 'auto' }} value={show} onChange={(e) => setShow(e.target.value)}>
          <option value="active">進行中</option>
          <option value="closed">已結案</option>
          <option value="all">全部</option>
        </select>
        <button className="btn primary" onClick={() => setCreate({ sales_order_id: '', product_id: '', plan_qty: '' })}>＋ 開工單</button>
      </div>
      <div className="card">
        <Table
          rows={rows}
          onRow={(w) => setOpen(w.id)}
          columns={[
            { h: '工單', r: (w) => <b>{w.no}</b> },
            { h: '訂單', r: (w) => get('sales_orders', w.sales_order_id)?.no || '備貨' },
            { h: '產品', r: (w) => itemName(w.product_id) },
            { h: '批號', r: (w) => w.lot_no },
            { h: '計畫', cls: 'num', r: (w) => qty(w.plan_qty) },
            { h: '產出', cls: 'num', r: (w) => qty(w.output_qty) },
            { h: '狀態', r: (w) => <Badge s={w.status}>{WO_STATUS[w.status]}</Badge> },
          ]}
        />
      </div>
      {create && (
        <Modal title="開立生產工單" onClose={() => setCreate(null)}
          footer={<><button className="btn" onClick={() => setCreate(null)}>取消</button>
            <button className="btn primary" onClick={() => {
              if (!create.product_id || !(create.plan_qty > 0)) return toast('請選產品並輸入數量', 'bad')
              const wo = createWorkOrder(create)
              toast(`已開立 ${wo.no}`)
              setCreate(null)
              setOpen(wo.id)
            }}>開立</button></>}>
          <div className="form-grid">
            <Field label="銷售訂單（選填，空白 = 備貨生產）">
              <Select value={create.sales_order_id} placeholder="備貨生產" options={all('sales_orders').filter((s) => s.status !== 'cancelled').map((s) => ({ value: s.id, label: `${s.no} ${partyName('customers', s.customer_id)}` }))}
                onChange={(v) => {
                  const so = get('sales_orders', v)
                  setCreate({ ...create, sales_order_id: v, product_id: so?.lines[0]?.item_id || create.product_id, plan_qty: so?.lines[0]?.qty || create.plan_qty })
                }} />
            </Field>
            <Field label="產品"><Select value={create.product_id} options={itemOptions(['product'])} onChange={(v) => setCreate({ ...create, product_id: v })} /></Field>
            <Field label="計畫數量"><Input type="number" value={create.plan_qty} onChange={(v) => setCreate({ ...create, plan_qty: v })} /></Field>
          </div>
        </Modal>
      )}
      {open && <WorkOrderModal id={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function WorkOrderModal({ id, onClose }) {
  const wo = get('work_orders', id)
  const [tab, setTab] = useState(wo.status === 'planned' ? 'issue' : wo.status === 'issued' || wo.status === 'cooking' ? 'feed' : 'output')
  const needs = woNeeds(wo)
  const [inputs, setInputs] = useState({})
  const [out, setOut] = useState({ qty: '', waste: '' })
  const product = get('items', wo.product_id)
  const closed = wo.status === 'closed'

  const run = (fn, msg) => {
    const lines = needs.map((n) => ({ item_id: n.item_id, qty: Number(inputs[n.item_id] || 0) }))
    if (attempt(() => fn(wo.id, lines), msg)) setInputs({})
  }
  const fillSuggest = (kind) =>
    setInputs(Object.fromEntries(needs.map((n) => [n.item_id, Math.max(0, round(n.qty - (kind === 'issue' ? woIssued(wo, n.item_id) : woFed(wo, n.item_id)), 3))])))

  return (
    <Modal wide title={`${wo.no}　${product?.name}`} onClose={onClose}
      footer={<>
        {!closed && <button className="btn" onClick={() => confirm('結案後產線剩料會退回倉庫，確定？') && attempt(() => closeWorkOrder(wo.id), '工單已結案')}>工單結案</button>}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onClose}>關閉</button>
      </>}>
      <div className="row" style={{ marginBottom: 12 }}>
        <Badge s={wo.status}>{WO_STATUS[wo.status]}</Badge>
        <span>訂單 {get('sales_orders', wo.sales_order_id)?.no || '備貨'}</span>
        <span>批號 <b>{wo.lot_no}</b></span>
        <span>計畫 {qty(wo.plan_qty, product?.unit)}</span>
        <span>已產出 {qty(wo.output_qty, product?.unit)}</span>
        <span>損耗 {qty(wo.waste_qty, 'kg')}</span>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['issue', '① 領料'], ['feed', '② 投料'], ['output', '③ 產出'], ['log', '紀錄']]} />
      {(tab === 'issue' || tab === 'feed') && (
        <div className="stack">
          <p className="muted small" style={{ margin: 0 }}>
            {tab === 'issue' ? '從倉庫把原料領到產線（倉庫庫存 → 產線）。' : '把產線上的原料放進鍋裡烹煮。產線上不夠時會自動從倉庫補領。'}
          </p>
          <Table rows={needs} columns={[
            { h: '原料', r: (n) => itemName(n.item_id) },
            { h: '配方需求', cls: 'num', r: (n) => qty(n.qty, itemUnit(n.item_id)) },
            { h: tab === 'issue' ? '倉庫庫存' : '產線上', cls: 'num', r: (n) => qty(stockOf(n.item_id, tab === 'issue' ? 'WH' : 'WIP')) },
            { h: '已領', cls: 'num', r: (n) => qty(woIssued(wo, n.item_id)) },
            { h: '已投', cls: 'num', r: (n) => qty(woFed(wo, n.item_id)) },
            { h: '本次數量', r: (n) => <Input type="number" min="0" step="any" disabled={closed} value={inputs[n.item_id] ?? ''} onChange={(v) => setInputs({ ...inputs, [n.item_id]: v })} style={{ width: 100 }} /> },
          ]} />
          {!closed && (
            <div className="row">
              <button className="btn" onClick={() => fillSuggest(tab)}>帶入剩餘需求量</button>
              <span style={{ flex: 1 }} />
              <button className="btn primary" onClick={() => run(tab === 'issue' ? issueMaterials : feedMaterials, tab === 'issue' ? '領料完成' : '投料已記錄')}>
                確認{tab === 'issue' ? '領料' : '投料'}
              </button>
            </div>
          )}
        </div>
      )}
      {tab === 'output' && (
        <div className="stack">
          <p className="muted small" style={{ margin: 0 }}>煮好包裝完成後登記產出數量。成品會進倉庫，但要等 QC 合格才能出貨。</p>
          <div className="form-grid">
            <Field label={`本次產出（${product?.unit}）`}><Input type="number" disabled={closed} value={out.qty} onChange={(v) => setOut({ ...out, qty: v })} /></Field>
            <Field label="損耗（kg，選填）"><Input type="number" disabled={closed} value={out.waste} onChange={(v) => setOut({ ...out, waste: v })} /></Field>
          </div>
          {!closed && (
            <div className="row"><span style={{ flex: 1 }} />
              <button className="btn primary" onClick={() => attempt(() => recordOutput(wo.id, out), '產出已入庫，等待 QC') && setOut({ qty: '', waste: '' })}>確認產出入庫</button>
            </div>
          )}
        </div>
      )}
      {tab === 'log' && (
        <ul className="timeline">
          {[...(wo.feeds || [])].reverse().map((f, i) => (
            <li key={i}><span className="when">{dt(f.at)}</span><span style={{ flex: 1 }}>投料 {itemName(f.item_id)} {qty(f.qty, itemUnit(f.item_id))}</span><span className="muted small">{f.user}</span></li>
          ))}
          {!wo.feeds?.length && <div className="empty">還沒有投料紀錄</div>}
        </ul>
      )}
    </Modal>
  )
}
