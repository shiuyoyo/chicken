import { useState } from 'react'
import { all, get, update, where } from '../db/store'
import { savePurchaseOrder, receiveGoods, poStatus, today, addDays, docTotal, round } from '../logic'
import { CrudPage, Modal, Field, Input, Select, LineEditor, Table, Badge, Search, matches, money, qty, dt, itemName, itemUnit, partyName, partyOptions, attempt, toast } from '../ui'

export function PurchaseOrders() {
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const [recv, setRecv] = useState(null)
  const rows = all('purchase_orders')
    .filter((p) => matches(q, p.no, partyName('suppliers', p.supplier_id)))
    .sort((a, b) => String(b.date + b.no).localeCompare(String(a.date + a.no)))
  const save = () => {
    if (!edit.supplier_id) return toast('請選擇供應商', 'bad')
    const lines = edit.lines.filter((l) => l.item_id && l.qty > 0)
    if (!lines.length) return toast('請至少輸入一項', 'bad')
    const { id, ...data } = edit
    savePurchaseOrder({ ...data, lines }, id)
    toast('採購單已儲存')
    setEdit(null)
  }
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">採購單</h1>
        <Search value={q} onChange={setQ} />
        <button className="btn" onClick={() => setRecv({ supplier_id: '', lines: [{ item_id: '', qty: '', price: '' }] })}>直接進貨</button>
        <button className="btn primary" onClick={() => setEdit({ supplier_id: '', sales_order_id: '', date: today(), due_date: addDays(today(), 3), lines: [{ item_id: '', qty: '', price: '' }], note: '' })}>＋ 新採購單</button>
      </div>
      <div className="card">
        <Table
          rows={rows}
          columns={[
            { h: '採購單', r: (p) => <b>{p.no}</b> },
            { h: '供應商', r: (p) => partyName('suppliers', p.supplier_id) },
            { h: '關聯訂單', r: (p) => get('sales_orders', p.sales_order_id)?.no || '—' },
            { h: '預計到貨', r: (p) => p.due_date },
            { h: '內容', r: (p) => <span className="small">{p.lines.map((l) => `${itemName(l.item_id)} ${l.received || 0}/${l.qty}`).join('、')}</span> },
            { h: '金額', cls: 'num', r: (p) => money(p.total) },
            { h: '狀態', r: (p) => <Badge s={poStatus(p)} /> },
            {
              h: '',
              r: (p) => (
                <span className="row" style={{ flexWrap: 'nowrap' }}>
                  {['open', 'partial'].includes(poStatus(p)) && (
                    <button className="btn sm primary" onClick={() => setRecv({ purchase_order_id: p.id, supplier_id: p.supplier_id, lines: p.lines.map((l) => ({ item_id: l.item_id, qty: round(Math.max(0, l.qty - (l.received || 0)), 3), price: l.price })) })}>
                      進貨
                    </button>
                  )}
                  <button className="btn sm" onClick={() => setEdit(JSON.parse(JSON.stringify(p)))}>編輯</button>
                </span>
              ),
            },
          ]}
        />
      </div>
      {edit && (
        <Modal wide title={edit.id ? `編輯 ${edit.no}` : '新增採購單'} onClose={() => setEdit(null)}
          footer={<>
            {edit.id && poStatus(edit) === 'open' && <button className="btn danger" onClick={() => { update('purchase_orders', edit.id, { status: 'cancelled' }); setEdit(null) }}>作廢</button>}
            {edit.id && poStatus(edit) === 'partial' && <button className="btn" onClick={() => { update('purchase_orders', edit.id, { status: 'closed' }); setEdit(null) }}>結案（不再進貨）</button>}
            <span style={{ flex: 1 }} />
            <button className="btn" onClick={() => setEdit(null)}>取消</button>
            <button className="btn primary" onClick={save}>儲存（{money(docTotal(edit.lines))}）</button>
          </>}>
          <div className="stack">
            <div className="form-grid">
              <Field label="供應商"><Select value={edit.supplier_id} options={partyOptions('suppliers')} onChange={(v) => setEdit({ ...edit, supplier_id: v })} /></Field>
              <Field label="關聯銷售訂單（選填）"><Select value={edit.sales_order_id} options={all('sales_orders').filter((s) => s.status !== 'cancelled').map((s) => ({ value: s.id, label: `${s.no} ${partyName('customers', s.customer_id)}` }))} placeholder="無" onChange={(v) => setEdit({ ...edit, sales_order_id: v })} /></Field>
              <Field label="採購日"><Input type="date" value={edit.date} onChange={(v) => setEdit({ ...edit, date: v })} /></Field>
              <Field label="預計到貨"><Input type="date" value={edit.due_date} onChange={(v) => setEdit({ ...edit, due_date: v })} /></Field>
            </div>
            <LineEditor lines={edit.lines} types={['raw', 'pack']} onChange={(lines) => setEdit({ ...edit, lines })} defaultPrice={(i) => i?.cost} />
            <Field label="備註"><textarea className="input" value={edit.note || ''} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
      {recv && <ReceiveModal data={recv} onClose={() => setRecv(null)} />}
    </div>
  )
}

function ReceiveModal({ data, onClose }) {
  const [d, setD] = useState({ date: today(), note: '', ...data })
  const po = get('purchase_orders', d.purchase_order_id)
  const ok = () => {
    if (!d.supplier_id) return toast('請選擇供應商', 'bad')
    const lines = d.lines.filter((l) => l.item_id && l.qty > 0)
    if (attempt(() => receiveGoods({ ...d, lines }), '進貨完成，已入庫並產生應付帳款')) onClose()
  }
  return (
    <Modal wide title={po ? `進貨：${po.no}` : '直接進貨（無採購單）'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" onClick={ok}>確認入庫（{money(docTotal(d.lines))} 未稅）</button></>}>
      <div className="stack">
        <div className="form-grid">
          <Field label="供應商"><Select value={d.supplier_id} disabled={!!po} options={partyOptions('suppliers')} onChange={(v) => setD({ ...d, supplier_id: v })} /></Field>
          <Field label="進貨日"><Input type="date" value={d.date} onChange={(v) => setD({ ...d, date: v })} /></Field>
          <Field label="備註（如送貨單號）"><Input value={d.note} onChange={(v) => setD({ ...d, note: v })} /></Field>
        </div>
        <LineEditor lines={d.lines} types={['raw', 'pack']} onChange={(lines) => setD({ ...d, lines })} defaultPrice={(i) => i?.cost} />
      </div>
    </Modal>
  )
}

export function Receiving() {
  const rows = where('stock_moves', (m) => m.type === 'receive').sort((a, b) => String(b.date).localeCompare(String(a.date)))
  return (
    <div className="stack">
      <div className="page-head"><h1 className="grow">進貨紀錄</h1></div>
      <div className="card">
        <Table rows={rows} columns={[
          { h: '時間', r: (m) => dt(m.date) },
          { h: '品項', r: (m) => itemName(m.item_id) },
          { h: '數量', cls: 'num', r: (m) => qty(m.qty, itemUnit(m.item_id)) },
          { h: '單價', cls: 'num', r: (m) => money(m.unit_cost) },
          { h: '採購單', r: (m) => (m.ref_type === 'purchase_orders' ? get('purchase_orders', m.ref_id)?.no : '直接進貨') },
          { h: '供應商', r: (m) => partyName('suppliers', m.ref_type === 'suppliers' ? m.ref_id : get('purchase_orders', m.ref_id)?.supplier_id) },
          { h: '經手', r: (m) => m.user_name },
        ]} />
      </div>
    </div>
  )
}

export function Suppliers() {
  return (
    <CrudPage
      table="suppliers"
      title="供應商"
      defaults={{ terms_days: 30 }}
      searchKeys={['code', 'name', 'contact', 'phone']}
      fields={[
        { k: 'code', label: '編號' }, { k: 'name', label: '名稱' }, { k: 'contact', label: '聯絡人' }, { k: 'phone', label: '電話' },
        { k: 'tax_id', label: '統編' }, { k: 'terms_days', label: '付款天數', type: 'number' }, { k: 'address', label: '地址', span: true },
        { k: 'note', label: '備註', type: 'textarea', span: true },
      ]}
      columns={[
        { h: '編號', r: (c) => c.code }, { h: '名稱', r: (c) => <b>{c.name}</b> }, { h: '聯絡人', r: (c) => c.contact }, { h: '電話', r: (c) => c.phone },
        { h: '未付款', cls: 'num', r: (c) => money(where('bills', (b) => b.supplier_id === c.id).reduce((s, b) => s + b.total - (b.paid || 0), 0)) },
      ]}
    />
  )
}
