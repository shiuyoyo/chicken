import { useState } from 'react'
import { all, get, where, update } from '../db/store'
import { shipGoods, invoiceShipment, shippableLots, lotStock, shippedQty, autoBoxes, PACK_MODES, today, round } from '../logic'
import { Modal, Field, Input, Select, Table, Badge, Search, matches, money, qty, itemName, itemUnit, partyName, attempt, toast } from '../ui'

export default function Shipping() {
  const [q, setQ] = useState('')
  const [form, setForm] = useState(null)
  const [slip, setSlip] = useState(null)
  const rows = all('shipments')
    .filter((s) => matches(q, s.no, partyName('customers', s.customer_id), s.container_no))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">出貨</h1>
        <Search value={q} onChange={setQ} placeholder="出貨單 / 客戶 / 櫃號" />
        <button className="btn primary" onClick={() => setForm({ sales_order_id: '', qtys: {}, pack_mode: '紙箱', boxes: '', container_no: '', carrier: '', note: '', date: today() })}>＋ 新出貨</button>
      </div>
      <div className="card">
        <Table rows={rows} onRow={(s) => setSlip(s.id)} columns={[
          { h: '出貨單', r: (s) => <b>{s.no}</b> },
          { h: '日期', r: (s) => s.date },
          { h: '客戶', r: (s) => partyName('customers', s.customer_id) },
          { h: '訂單', r: (s) => get('sales_orders', s.sales_order_id)?.no },
          { h: '內容', r: (s) => <span className="small">{s.lines.map((l) => `${itemName(l.item_id)}×${l.qty}`).join('、')}</span> },
          { h: '箱數', cls: 'num', r: (s) => s.boxes },
          { h: '包裝 / 櫃號', r: (s) => `${s.pack_mode}${s.container_no ? ' ' + s.container_no : ''}` },
          { h: '狀態', r: (s) => <Badge s={s.status} /> },
          { h: '帳款', r: (s) => (where('invoices', (i) => i.shipment_id === s.id).length ? <Badge s="confirmed">已開帳</Badge> : <Badge kind="warn">未開帳</Badge>) },
        ]} />
      </div>
      {form && <ShipModal form={form} setForm={setForm} />}
      {slip && <SlipModal id={slip} onClose={() => setSlip(null)} />}
    </div>
  )
}

function ShipModal({ form, setForm }) {
  const so = get('sales_orders', form.sales_order_id)
  const openOrders = all('sales_orders').filter((s) => s.status !== 'cancelled' && s.lines.some((l) => shippedQty(s.id, l.item_id) < l.qty))
  const lines = (so?.lines || []).map((l) => ({
    ...l,
    shipped: shippedQty(so.id, l.item_id),
    avail: round(shippableLots(l.item_id).reduce((s, lot) => s + lotStock(lot), 0), 3),
  }))
  const chosen = lines.map((l) => ({ item_id: l.item_id, qty: Number(form.qtys[l.item_id] || 0) })).filter((l) => l.qty > 0)
  const ok = () => {
    if (!so) return toast('請選擇訂單', 'bad')
    if (attempt(() => shipGoods({ ...form, lines: chosen }), '已出貨')) setForm(null)
  }
  return (
    <Modal wide title="新增出貨" onClose={() => setForm(null)}
      footer={<><button className="btn" onClick={() => setForm(null)}>取消</button><button className="btn primary" disabled={!chosen.length} onClick={ok}>確認出貨</button></>}>
      <div className="stack">
        <Field label="銷售訂單">
          <Select value={form.sales_order_id} options={openOrders.map((s) => ({ value: s.id, label: `${s.no} ${partyName('customers', s.customer_id)}（交期 ${s.due_date}）` }))}
            onChange={(v) => {
              const o = get('sales_orders', v)
              const qtys = Object.fromEntries((o?.lines || []).map((l) => {
                const avail = shippableLots(l.item_id).reduce((s, lot) => s + lotStock(lot), 0)
                return [l.item_id, Math.max(0, Math.min(l.qty - shippedQty(v, l.item_id), avail))]
              }))
              setForm({ ...form, sales_order_id: v, qtys })
            }} />
        </Field>
        {so && (
          <>
            <div className="muted small">送貨地址：{get('customers', so.customer_id)?.address}</div>
            <Table rows={lines} columns={[
              { h: '產品', r: (l) => itemName(l.item_id) },
              { h: '訂購', cls: 'num', r: (l) => qty(l.qty) },
              { h: '已出', cls: 'num', r: (l) => qty(l.shipped) },
              { h: 'QC 合格可出', cls: 'num', r: (l) => (l.avail ? qty(l.avail) : <Badge kind="warn">無</Badge>) },
              { h: '本次出貨', r: (l) => <Input type="number" min="0" style={{ width: 100 }} value={form.qtys[l.item_id] ?? ''} onChange={(v) => setForm({ ...form, qtys: { ...form.qtys, [l.item_id]: v } })} /> },
              { h: '箱數', cls: 'num', r: (l) => Math.ceil((form.qtys[l.item_id] || 0) / (get('items', l.item_id)?.pack_per_box || 1)) },
            ]} />
            <div className="form-grid">
              <Field label="包裝方式"><Select value={form.pack_mode} placeholder={false} options={PACK_MODES.map((p) => ({ value: p, label: p }))} onChange={(v) => setForm({ ...form, pack_mode: v })} /></Field>
              <Field label={`總箱數（自動 ${autoBoxes(chosen)}）`}><Input type="number" value={form.boxes} placeholder={String(autoBoxes(chosen))} onChange={(v) => setForm({ ...form, boxes: v })} /></Field>
              <Field label="貨櫃 / 車號"><Input value={form.container_no} onChange={(v) => setForm({ ...form, container_no: v })} /></Field>
              <Field label="物流 / 司機"><Input value={form.carrier} onChange={(v) => setForm({ ...form, carrier: v })} /></Field>
              <Field label="出貨日"><Input type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} /></Field>
              <Field label="備註"><Input value={form.note} onChange={(v) => setForm({ ...form, note: v })} /></Field>
            </div>
            <div className="muted small">批號會依製造日先進先出自動分配，只會出 QC 合格的批號。</div>
          </>
        )}
      </div>
    </Modal>
  )
}

function SlipModal({ id, onClose }) {
  const s = get('shipments', id)
  const cust = get('customers', s.customer_id)
  const inv = where('invoices', (i) => i.shipment_id === s.id)[0]
  return (
    <Modal wide title={`出貨單 ${s.no}`} onClose={onClose}
      footer={<>
        {s.status === 'shipped' && <button className="btn" onClick={() => update('shipments', s.id, { status: 'delivered' })}>標記已送達</button>}
        {!inv && <button className="btn primary" onClick={() => attempt(() => invoiceShipment(s.id), '已開立應收帳款')}>開立應收帳款</button>}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => print()}>列印</button>
        <button className="btn" onClick={onClose}>關閉</button>
      </>}>
      <div className="stack">
        <div className="form-grid">
          <div><div className="muted small">客戶</div><b>{cust?.name}</b><div className="small">{cust?.contact} {cust?.phone}</div></div>
          <div><div className="muted small">送貨地址</div>{s.address}</div>
          <div><div className="muted small">出貨日 / 訂單</div>{s.date}　{get('sales_orders', s.sales_order_id)?.no}</div>
          <div><div className="muted small">包裝 / 箱數</div>{s.pack_mode}　{s.boxes} 箱</div>
          <div><div className="muted small">貨櫃 / 車號</div>{s.container_no || '—'}</div>
          <div><div className="muted small">物流</div>{s.carrier || '—'}</div>
        </div>
        <Table rows={s.lines} columns={[
          { h: '產品', r: (l) => itemName(l.item_id) },
          { h: '批號', r: (l) => l.lot_no },
          { h: '數量', cls: 'num', r: (l) => qty(l.qty, itemUnit(l.item_id)) },
          { h: '單價', cls: 'num', r: (l) => money(l.price) },
          { h: '金額', cls: 'num', r: (l) => money(l.qty * l.price) },
        ]} />
        {inv && <div>應收帳款 {inv.no}：{money(inv.total)}（含稅）<Badge s={inv.status} /></div>}
      </div>
    </Modal>
  )
}
