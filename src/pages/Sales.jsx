import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { all, get, where, update } from '../db/store'
import { saveSalesOrder, orderProgress, purchaseSuggestions, savePurchaseOrder, createWorkOrder, today, addDays, docTotal, round } from '../logic'
import { CrudPage, Modal, Field, Input, Select, LineEditor, Table, Badge, Search, matches, money, qty, itemName, itemUnit, partyName, partyOptions, attempt, toast } from '../ui'

export function SalesOrders() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const [view, setView] = useState(null)
  const rows = all('sales_orders')
    .filter((s) => matches(q, s.no, partyName('customers', s.customer_id)))
    .sort((a, b) => String(b.date + b.no).localeCompare(String(a.date + a.no)))

  const save = () => {
    if (!edit.customer_id) return toast('請選擇客戶', 'bad')
    const lines = edit.lines.filter((l) => l.item_id && l.qty > 0)
    if (!lines.length) return toast('請至少輸入一項產品', 'bad')
    const { id, ...data } = edit
    saveSalesOrder({ ...data, lines }, id)
    toast('訂單已儲存')
    setEdit(null)
  }
  const blank = () => ({ customer_id: '', date: today(), due_date: addDays(today(), 7), lines: [{ item_id: '', qty: '', price: '' }], note: '' })

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">銷售訂單</h1>
        <Search value={q} onChange={setQ} placeholder="訂單號 / 客戶" />
        <button className="btn primary" onClick={() => setEdit(blank())}>＋ 新訂單</button>
      </div>
      <div className="card">
        <Table
          rows={rows}
          onRow={(r) => setView(r.id)}
          columns={[
            { h: '訂單號', r: (s) => <b>{s.no}</b> },
            { h: '客戶', r: (s) => partyName('customers', s.customer_id) },
            { h: '下單日', r: (s) => s.date },
            { h: '交期', r: (s) => s.due_date },
            { h: '內容', r: (s) => <span className="small">{s.lines.map((l) => `${itemName(l.item_id)}×${l.qty}`).join('、')}</span> },
            { h: '金額', cls: 'num', r: (s) => money(s.total) },
            { h: '進度', r: (s) => (s.status === 'cancelled' ? <Badge s="cancelled" /> : <Badge kind="primary">{orderProgress(s.id).status}</Badge>) },
          ]}
        />
      </div>
      {edit && (
        <Modal
          wide
          title={edit.id ? `編輯 ${edit.no}` : '新增銷售訂單'}
          onClose={() => setEdit(null)}
          footer={<><button className="btn" onClick={() => setEdit(null)}>取消</button><button className="btn primary" onClick={save}>儲存（{money(docTotal(edit.lines))}）</button></>}
        >
          <div className="stack">
            <div className="form-grid">
              <Field label="客戶"><Select value={edit.customer_id} options={partyOptions('customers')} onChange={(v) => setEdit({ ...edit, customer_id: v })} /></Field>
              <Field label="下單日"><Input type="date" value={edit.date} onChange={(v) => setEdit({ ...edit, date: v })} /></Field>
              <Field label="交期"><Input type="date" value={edit.due_date} onChange={(v) => setEdit({ ...edit, due_date: v })} /></Field>
            </div>
            <LineEditor lines={edit.lines} types={['product']} onChange={(lines) => setEdit({ ...edit, lines })} defaultPrice={(i) => i?.price} />
            <Field label="備註"><textarea className="input" value={edit.note || ''} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
      {view && <OrderActions id={view} onClose={() => setView(null)} onEdit={(so) => { setView(null); setEdit(JSON.parse(JSON.stringify(so))) }} nav={nav} />}
    </div>
  )
}

function OrderActions({ id, onClose, onEdit, nav }) {
  const so = get('sales_orders', id)
  const sugg = purchaseSuggestions(id)
  const wos = where('work_orders', (w) => w.sales_order_id === id)
  const planned = (pid) => wos.filter((w) => w.product_id === pid).reduce((s, w) => s + w.plan_qty, 0)

  const makePOs = () => {
    const bySupplier = {}
    for (const s of sugg) {
      // 找這個原料上次跟誰買
      const last = all('purchase_orders').filter((p) => p.lines.some((l) => l.item_id === s.item_id)).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]
      const sup = last?.supplier_id || all('suppliers')[0]?.id
      const price = last?.lines.find((l) => l.item_id === s.item_id)?.price ?? get('items', s.item_id)?.cost
      ;(bySupplier[sup] ||= []).push({ item_id: s.item_id, qty: Math.ceil(s.short), price })
    }
    const made = Object.entries(bySupplier).map(([supplier_id, lines]) => savePurchaseOrder({ supplier_id, sales_order_id: id, date: today(), due_date: addDays(today(), 3), lines, note: `依訂單 ${so.no} 產生` }))
    toast(`已產生 ${made.length} 張採購單`)
  }
  const makeWOs = () => {
    let n = 0
    for (const l of so.lines) {
      const left = round(l.qty - planned(l.item_id), 3)
      if (left > 0) {
        createWorkOrder({ sales_order_id: id, product_id: l.item_id, plan_qty: left })
        n++
      }
    }
    toast(n ? `已開立 ${n} 張工單` : '工單已足夠')
  }

  return (
    <Modal wide title={`${so.no}　${partyName('customers', so.customer_id)}`} onClose={onClose}
      footer={<>
        {so.status !== 'cancelled' && <button className="btn danger" onClick={() => confirm('取消這張訂單？') && (update('sales_orders', id, { status: 'cancelled' }), onClose())}>取消訂單</button>}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => onEdit(so)}>編輯</button>
        <button className="btn primary" onClick={() => nav('/progress/' + id)}>看進度</button>
      </>}>
      <div className="stack">
        <Table rows={so.lines} columns={[
          { h: '產品', r: (l) => itemName(l.item_id) },
          { h: '數量', cls: 'num', r: (l) => qty(l.qty, itemUnit(l.item_id)) },
          { h: '單價', cls: 'num', r: (l) => money(l.price) },
          { h: '已開工單', cls: 'num', r: (l) => qty(planned(l.item_id)) },
        ]} />
        {so.note && <div className="muted">備註：{so.note}</div>}
        <div className="card">
          <div className="card-head"><h3 className="grow">① 原料需求（依配方 − 庫存 − 已訂未到）</h3>
            <button className="btn sm primary" disabled={!sugg.length} onClick={() => attempt(makePOs)}>產生採購單</button></div>
          <Table empty="原料足夠，不需採購 ✅" rows={sugg} columns={[
            { h: '原料', r: (s) => itemName(s.item_id) },
            { h: '需求', cls: 'num', r: (s) => qty(s.need, itemUnit(s.item_id)) },
            { h: '庫存', cls: 'num', r: (s) => qty(s.stock) },
            { h: '缺', cls: 'num', r: (s) => <b>{qty(s.short)}</b> },
          ]} />
        </div>
        <div className="card">
          <div className="card-head"><h3 className="grow">② 生產工單</h3>
            <button className="btn sm primary" onClick={() => attempt(makeWOs)}>依訂單開工單</button>
            <button className="btn sm" onClick={() => nav('/production')}>到生產</button></div>
          <Table empty="尚無工單" rows={wos} columns={[
            { h: '工單', r: (w) => w.no },
            { h: '產品', r: (w) => itemName(w.product_id) },
            { h: '計畫', cls: 'num', r: (w) => qty(w.plan_qty) },
            { h: '狀態', r: (w) => <Badge s={w.status} /> },
          ]} />
        </div>
      </div>
    </Modal>
  )
}

export function Customers() {
  return (
    <CrudPage
      table="customers"
      title="客戶"
      defaults={{ terms_days: 30 }}
      searchKeys={['code', 'name', 'contact', 'phone']}
      fields={[
        { k: 'code', label: '編號' }, { k: 'name', label: '名稱' }, { k: 'contact', label: '聯絡人' }, { k: 'phone', label: '電話' },
        { k: 'tax_id', label: '統編' }, { k: 'terms_days', label: '付款天數', type: 'number' }, { k: 'address', label: '送貨地址', span: true },
        { k: 'note', label: '備註', type: 'textarea', span: true },
      ]}
      columns={[
        { h: '編號', r: (c) => c.code }, { h: '名稱', r: (c) => <b>{c.name}</b> }, { h: '聯絡人', r: (c) => c.contact },
        { h: '電話', r: (c) => c.phone }, { h: '付款', r: (c) => (c.terms_days ? `月結 ${c.terms_days} 天` : '現金') },
        { h: '未收款', cls: 'num', r: (c) => money(where('invoices', (i) => i.customer_id === c.id).reduce((s, i) => s + i.total - (i.paid || 0), 0)) },
      ]}
    />
  )
}
