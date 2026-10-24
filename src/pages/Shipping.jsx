import { useState } from 'react'
import { all, get, where } from '../db/store'
import * as L from '../logic'
import { Modal, Field, Input, Select, Table, Badge, Search, matches, money, qty, itemName, itemUnit, partyName, attempt, useOpen, DocLink, LotLink } from '../ui'

export default function Shipping() {
  const [q, setQ] = useState('')
  const [form, setForm] = useState(null)
  const [open, setOpen] = useOpen()
  const rows = all('shipments')
    .filter((s) => matches(q, s.no, partyName('customers', s.customer_id), s.container_no))
    .sort((a, b) => String(b.date + b.no).localeCompare(String(a.date + a.no)))
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">出貨</h1>
        <Search value={q} onChange={setQ} placeholder="出貨單 / 客戶 / 櫃號" />
        {L.can('shipping', 2) && <button className="btn primary" onClick={() => setForm({ sales_order_id: '', qtys: {}, pack_mode: '紙箱', boxes: '', container_no: '', carrier: '', note: '', date: L.today() })}>＋ 新出貨</button>}
      </div>
      <div className="card">
        <Table rows={rows} onRow={(s) => setOpen(s.id)} columns={[
          { h: '出貨單', r: (s) => <b>{s.no}</b> },
          { h: '日期', r: (s) => s.date },
          { h: '客戶', r: (s) => partyName('customers', s.customer_id) },
          { h: '訂單', r: (s) => <DocLink t="sales_orders" id={s.sales_order_id} /> },
          { h: '內容', r: (s) => <span className="small">{s.lines.map((l) => `${itemName(l.item_id)}×${l.qty}`).join('、')}</span> },
          { h: '箱數', cls: 'num', r: (s) => s.boxes },
          { h: '包裝 / 櫃號', r: (s) => `${s.pack_mode}${s.container_no ? ' ' + s.container_no : ''}` },
          { h: '狀態', r: (s) => <Badge s={s.status} /> },
          { h: '帳款', r: (s) => { const i = where('invoices', (x) => x.shipment_id === s.id)[0]; return i ? <span className="small">{i.gui_no}</span> : <Badge kind="warn">未開帳</Badge> } },
        ]} />
      </div>
      {form && <ShipModal form={form} setForm={setForm} />}
      {open && get('shipments', open) && <SlipModal id={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function ShipModal({ form, setForm }) {
  const so = get('sales_orders', form.sales_order_id)
  const cust = get('customers', so?.customer_id)
  const openOrders = all('sales_orders').filter((s) => s.status === 'confirmed')
  const avail = (itemId) =>
    L.sum(
      L.stockRows({ item_id: itemId, kinds: ['storage'] }).filter((r) => {
        const l = L.lotByNo(r.lot_no)
        return r.qty > 0 && l?.qc_status === 'pass' && !L.isExpired(l) && L.daysLeft(l) >= (cust?.min_shelf_days || 0)
      }),
      (r) => r.qty,
    )
  const lines = (so?.lines || []).map((l) => ({ ...l, left: L.remainingToShip(so, l.item_id), avail: avail(l.item_id) }))
  const chosen = lines.map((l) => ({ item_id: l.item_id, qty: Number(form.qtys[l.item_id] || 0) })).filter((l) => l.qty > 0)
  let pick = []
  let pickErr = ''
  try {
    pick = so ? L.pickList(so.id, chosen) : []
  } catch (e) {
    pickErr = e.message
  }
  const ok = () => attempt(() => L.shipGoods({ ...form, lines: chosen }), '已出貨，庫存已扣除') && setForm(null)
  return (
    <Modal wide title="新增出貨" onClose={() => setForm(null)}
      footer={<><button className="btn" onClick={() => setForm(null)}>取消</button><button className="btn primary" disabled={!chosen.length || !!pickErr} onClick={ok}>確認出貨（{form.boxes || L.autoBoxes(chosen)} 箱）</button></>}>
      <div className="stack">
        <Field label="銷售訂單（只列已確認的訂單）">
          <Select value={form.sales_order_id} options={openOrders.map((s) => ({ value: s.id, label: `${s.no} ${partyName('customers', s.customer_id)}（交期 ${s.due_date}）` }))}
            onChange={(v) => {
              const o = get('sales_orders', v)
              const c = get('customers', o?.customer_id)
              const qtys = Object.fromEntries((o?.lines || []).map((l) => [l.item_id, Math.max(0, Math.min(L.remainingToShip(o, l.item_id), L.sum(L.stockRows({ item_id: l.item_id, kinds: ['storage'] }).filter((r) => { const x = L.lotByNo(r.lot_no); return x?.qc_status === 'pass' && !L.isExpired(x) && L.daysLeft(x) >= (c?.min_shelf_days || 0) }), (r) => r.qty)))]))
              setForm({ ...form, sales_order_id: v, qtys })
            }} />
        </Field>
        {so && (
          <>
            <div className="muted small">送貨地址：{cust?.address}{cust?.min_shelf_days ? `｜客戶要求剩餘效期 ≥ ${cust.min_shelf_days} 天` : ''}</div>
            <Table rows={lines} columns={[
              { h: '產品', r: (l) => itemName(l.item_id) },
              { h: '訂購', cls: 'num', r: (l) => qty(l.qty) },
              { h: '待出', cls: 'num', r: (l) => qty(l.left) },
              { h: '可出（合格 + 效期符合）', cls: 'num', r: (l) => (l.avail ? qty(l.avail) : <Badge kind="warn">無</Badge>) },
              { h: '本次出貨', r: (l) => <Input type="number" min="0" style={{ width: 100 }} value={form.qtys[l.item_id] ?? ''} onChange={(v) => setForm({ ...form, qtys: { ...form.qtys, [l.item_id]: v } })} /> },
              { h: '箱數', cls: 'num', r: (l) => Math.ceil((form.qtys[l.item_id] || 0) / (get('items', l.item_id)?.pack_per_box || 1)) },
            ]} />
            <div className="card">
              <div className="card-head"><h3>揀貨單（先到期先出）</h3></div>
              {pickErr ? <div className="card-pad notice bad">{pickErr}</div> : (
                <Table empty="輸入數量後顯示揀貨位置" rows={pick} columns={[
                  { h: '儲位', r: (a) => <b>{L.binLabel(a.bin_id)}</b> },
                  { h: '產品', r: (a) => itemName(a.item_id) },
                  { h: '批號', r: (a) => a.lot_no },
                  { h: '有效期限', r: (a) => L.lotByNo(a.lot_no)?.exp_date },
                  { h: '數量', cls: 'num', r: (a) => qty(a.qty, itemUnit(a.item_id)) },
                ]} />
              )}
            </div>
            <div className="form-grid">
              <Field label="包裝方式"><Select placeholder={false} value={form.pack_mode} options={L.PACK_MODES.map((p) => ({ value: p, label: p }))} onChange={(v) => setForm({ ...form, pack_mode: v })} /></Field>
              <Field label={`總箱數（自動 ${L.autoBoxes(chosen)}）`}><Input type="number" value={form.boxes} placeholder={String(L.autoBoxes(chosen))} onChange={(v) => setForm({ ...form, boxes: v })} /></Field>
              <Field label="貨櫃 / 車號"><Input value={form.container_no} onChange={(v) => setForm({ ...form, container_no: v })} /></Field>
              <Field label="物流 / 司機"><Input value={form.carrier} onChange={(v) => setForm({ ...form, carrier: v })} /></Field>
              <Field label="出貨日"><Input type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} /></Field>
              <Field label="備註"><Input value={form.note} onChange={(v) => setForm({ ...form, note: v })} /></Field>
            </div>
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
        {s.status === 'shipped' && L.can('shipping', 2) && <button className="btn" onClick={() => attempt(() => L.markDelivered(s.id), '已標記送達')}>標記已送達</button>}
        {!inv && (L.can('accounting', 2) || L.can('shipping', 2)) && <button className="btn primary" onClick={() => attempt(() => L.invoiceShipment(s.id), '已開立發票與應收帳款')}>開立發票 / 應收</button>}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onClose}>關閉</button>
      </>}>
      <div className="stack">
        <div className="form-grid">
          <div><div className="muted small">客戶</div><b>{cust?.name}</b><div className="small">{cust?.contact} {cust?.phone}</div></div>
          <div><div className="muted small">送貨地址</div>{s.address}</div>
          <div><div className="muted small">出貨日 / 訂單</div>{s.date}　<DocLink t="sales_orders" id={s.sales_order_id} /></div>
          <div><div className="muted small">包裝 / 箱數</div>{s.pack_mode}　{s.boxes} 箱</div>
          <div><div className="muted small">貨櫃 / 車號</div>{s.container_no || '—'}</div>
          <div><div className="muted small">物流</div>{s.carrier || '—'}</div>
        </div>
        <Table rows={s.lines} columns={[
          { h: '產品', r: (l) => itemName(l.item_id) },
          { h: '批號', r: (l) => <LotLink no={l.lot_no} /> },
          { h: '揀貨儲位', r: (l) => L.binLabel(l.bin_id) },
          { h: '數量', cls: 'num', r: (l) => qty(l.qty, itemUnit(l.item_id)) },
          { h: '已退', cls: 'num', r: (l) => qty(L.returnedQty(s.id, l.item_id, l.lot_no)) },
          { h: '單價', cls: 'num', r: (l) => money(l.price) },
          { h: '金額', cls: 'num', r: (l) => money(l.qty * l.price) },
        ]} />
        {inv && <div>發票 <b>{inv.gui_no}</b>・帳款 {inv.no}：{money(inv.total)}（含稅），未收 {money(L.invoiceBalance(inv))} <Badge s={inv.status} /></div>}
      </div>
    </Modal>
  )
}
