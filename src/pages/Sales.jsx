import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { all, get, where, transaction } from '../db/store'
import * as L from '../logic'
import {
  Modal, Field, Input, Select, LineEditor, Table, Badge, PendingBadge, Search, Tabs, matches, money, qty, itemName, itemUnit, partyName, partyOptions,
  DocLink, LotLink, attempt, ask, toast, useOpen, useTab,
} from '../ui'

const soBadge = (so) => (so.status === 'pending' ? <PendingBadge /> : so.status === 'rejected' ? <Badge kind="bad">核准退回</Badge> : null)

export function SalesOrders() {
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const [q, setQ] = useState('')
  const [open, setOpen] = useOpen()
  const blank = () => ({ customer_id: sp.get('customer') || '', date: L.today(), due_date: L.addDays(L.today(), 7), lines: [{ item_id: '', qty: '', price: '' }], note: '' })
  const [edit, setEdit] = useState(sp.get('new') ? blank() : null)
  const canEdit = L.can('sales', 2)
  const rows = all('sales_orders')
    .filter((s) => matches(q, s.no, partyName('customers', s.customer_id)))
    .sort((a, b) => String(b.date + b.no).localeCompare(String(a.date + a.no)))
  const closeEdit = () => {
    setEdit(null)
    if (sp.get('new')) setSp({}, { replace: true })
  }
  const save = () => {
    const { id, created_at, updated_at, ...data } = edit
    const so = attempt(() => L.saveSalesOrder(data, id))
    if (so) {
      toast(so.status === 'pending' ? `訂單已建立，但需要主管核准：${L.pendingFor(so.id)?.reason}` : '訂單已確認')
      closeEdit()
    }
  }
  const cust = get('customers', edit?.customer_id)
  const checks = edit?.customer_id ? L.orderChecks(edit.customer_id, edit.lines.filter((l) => l.item_id && l.qty > 0), edit.id) : []

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">銷售訂單</h1>
        <Search value={q} onChange={setQ} placeholder="訂單號 / 客戶" />
        {canEdit && <button className="btn primary" onClick={() => setEdit(blank())}>＋ 新訂單</button>}
      </div>
      <div className="card">
        <Table rows={rows} onRow={(r) => setOpen(r.id)} columns={[
          { h: '訂單號', r: (s) => <b>{s.no}</b> },
          { h: '客戶', r: (s) => partyName('customers', s.customer_id) },
          { h: '下單日', r: (s) => s.date },
          { h: '交期', r: (s) => s.due_date },
          { h: '內容', r: (s) => <span className="small">{s.lines.map((l) => `${itemName(l.item_id)}×${l.qty}`).join('、')}</span> },
          { h: '金額', cls: 'num', r: (s) => money(s.total) },
          { h: '狀態', r: (s) => soBadge(s) || <Badge kind={s.status === 'cancelled' ? 'bad' : 'primary'}>{L.orderProgress(s.id).status}</Badge> },
        ]} />
      </div>
      {edit && (
        <Modal wide title={edit.id ? `編輯 ${edit.no}` : '新增銷售訂單'} onClose={closeEdit}
          footer={<><button className="btn" onClick={closeEdit}>取消</button><button className="btn primary" onClick={save}>{checks.length ? '儲存並送簽核' : '儲存'}（{money(L.docTotal(edit.lines))}）</button></>}>
          <div className="stack">
            <div className="form-grid">
              <Field label="客戶"><Select value={edit.customer_id} options={partyOptions('customers', (c) => c.kind !== 'member' && c.status !== '停止往來')} onChange={(v) => setEdit({ ...edit, customer_id: v, lines: edit.lines.map((l) => ({ ...l, price: l.item_id ? L.priceFor(v, l.item_id) : l.price })) })} /></Field>
              <Field label="下單日"><Input type="date" value={edit.date} onChange={(v) => setEdit({ ...edit, date: v })} /></Field>
              <Field label="交期"><Input type="date" value={edit.due_date} onChange={(v) => setEdit({ ...edit, due_date: v })} /></Field>
            </div>
            {cust && (
              <div className="small muted">
                {get('price_lists', cust.price_list_id) ? `套用價格表「${get('price_lists', cust.price_list_id).name}」` : '標準售價'}・
                {cust.credit_limit ? `信用額度 ${money(cust.credit_limit)}，目前曝險 ${money(L.creditExposure(cust.id, edit.id))}` : '信用額度不限'}・
                {cust.min_shelf_days ? `要求剩餘效期 ${cust.min_shelf_days} 天` : ''}
              </div>
            )}
            <LineEditor lines={edit.lines} types={['product']} onChange={(lines) => setEdit({ ...edit, lines })} defaultPrice={(id) => L.priceFor(edit.customer_id, id)} />
            {checks.length > 0 && <div className="notice warn">⚠ 這張訂單需要主管核准：{checks.join('；')}</div>}
            <Field label="備註"><textarea className="input" value={edit.note || ''} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
      {open && get('sales_orders', open) && <OrderActions id={open} onClose={() => setOpen(null)} onEdit={(so) => { setOpen(null); setEdit(JSON.parse(JSON.stringify(so))) }} nav={nav} />}
    </div>
  )
}

function OrderActions({ id, onClose, onEdit, nav }) {
  const so = get('sales_orders', id)
  const sugg = L.purchaseSuggestions(id)
  const wos = where('work_orders', (w) => w.sales_order_id === id && w.status !== 'cancelled')
  const planned = (pid) => L.sum(wos.filter((w) => w.product_id === pid), (w) => w.plan_qty)
  const ap = L.pendingFor(id)
  const active = so.status === 'confirmed'

  const makePOs = () => {
    const bySupplier = {}
    for (const s of sugg) {
      const last = L.lastPurchase(s.item_id)
      const sup = last?.supplier_id || all('suppliers')[0]?.id
      const price = last?.lines.find((l) => l.item_id === s.item_id)?.price ?? get('items', s.item_id)?.cost
      ;(bySupplier[sup] ||= []).push({ item_id: s.item_id, qty: Math.ceil(s.short), price })
    }
    const made = Object.entries(bySupplier).map(([supplier_id, lines]) => L.savePurchaseOrder({ supplier_id, sales_order_id: id, date: L.today(), due_date: L.addDays(L.today(), 3), lines, note: `依訂單 ${so.no} 產生` }))
    return `已產生 ${made.length} 張採購單${made.some((p) => p.status === 'pending') ? '（部分需核准）' : ''}`
  }
  const makeWOs = () => {
    let n = 0
    for (const l of so.lines) {
      const left = L.round(l.qty - planned(l.item_id), 3)
      if (left > 0) {
        L.createWorkOrder({ sales_order_id: id, product_id: l.item_id, plan_qty: left, plan_date: L.addDays(L.today(), 1) })
        n++
      }
    }
    return n ? `已開立 ${n} 張工單` : '工單已足夠'
  }
  const cancel = async () => {
    const reason = await ask(`取消訂單 ${so.no}？`, { input: true, placeholder: '取消原因', danger: true, confirmText: '取消訂單' })
    if (reason) attempt(() => L.cancelSalesOrder(id, reason), '訂單已取消') && onClose()
  }
  const run = (fn) => {
    try {
      toast(transaction(fn))
    } catch (e) {
      toast(e.message, 'bad')
    }
  }

  return (
    <Modal wide title={`${so.no}　${partyName('customers', so.customer_id)}`} onClose={onClose}
      footer={<>
        {L.can('sales', 2) && ['confirmed', 'pending', 'rejected'].includes(so.status) && <button className="btn danger" onClick={cancel}>取消訂單</button>}
        <span style={{ flex: 1 }} />
        {L.can('sales', 2) && ['confirmed', 'pending', 'rejected'].includes(so.status) && <button className="btn" onClick={() => onEdit(so)}>編輯</button>}
        <button className="btn primary" onClick={() => nav('/progress/' + id)}>看完整進度</button>
      </>}>
      <div className="stack">
        {ap && <div className="notice warn">⏳ 等待核准：{ap.reason}</div>}
        {so.status === 'rejected' && <div className="notice bad">主管退回：{where('approvals', (a) => a.ref_id === id && a.status === 'rejected').pop()?.decision_note}。可修改後重新送出。</div>}
        {so.quotation_id && <div className="small">來自報價單 <DocLink t="quotations" id={so.quotation_id} /></div>}
        <Table rows={so.lines} columns={[
          { h: '產品', r: (l) => itemName(l.item_id) },
          { h: '數量', cls: 'num', r: (l) => qty(l.qty, itemUnit(l.item_id)) },
          { h: '單價', cls: 'num', r: (l) => money(l.price) },
          { h: '已開工單', cls: 'num', r: (l) => qty(planned(l.item_id)) },
          { h: '已出貨', cls: 'num', r: (l) => qty(L.shippedQty(id, l.item_id)) },
        ]} />
        {so.note && <div className="muted">備註：{so.note}</div>}
        <div className="card">
          <div className="card-head"><h3 className="grow">① 原料需求（配方 − 可用庫存 − 已訂未到）</h3>
            {L.can('purchase', 2) && <button className="btn sm primary" disabled={!sugg.length || !active} onClick={() => run(makePOs)}>產生採購單</button>}</div>
          <Table empty="原料足夠，不需採購 ✅" rows={sugg} columns={[
            { h: '原料', r: (s) => itemName(s.item_id) },
            { h: '需求', cls: 'num', r: (s) => qty(s.need, itemUnit(s.item_id)) },
            { h: '可用', cls: 'num', r: (s) => qty(s.stock) },
            { h: '已訂未到', cls: 'num', r: (s) => qty(s.onOrder) },
            { h: '缺', cls: 'num', r: (s) => <b>{qty(s.short)}</b> },
          ]} />
        </div>
        <div className="card">
          <div className="card-head"><h3 className="grow">② 生產工單</h3>
            {L.can('production', 2) && <button className="btn sm primary" disabled={!active} onClick={() => run(makeWOs)}>依訂單開工單</button>}</div>
          <Table empty="尚無工單" rows={wos} columns={[
            { h: '工單', r: (w) => <DocLink t="work_orders" row={w} /> },
            { h: '產品', r: (w) => itemName(w.product_id) },
            { h: '計畫', cls: 'num', r: (w) => qty(w.plan_qty) },
            { h: '排程', r: (w) => `${w.plan_date} ${w.line}` },
            { h: '狀態', r: (w) => <Badge s={w.status}>{L.WO_STATUS[w.status]}</Badge> },
          ]} />
        </div>
      </div>
    </Modal>
  )
}

// ---------- 退貨（銷貨退回 / 退回供應商） ----------
export function Returns() {
  const [tab, setTab] = useTab('sales')
  const [form, setForm] = useState(null)
  const [pform, setPform] = useState(null)
  const rows = where('returns', (r) => r.kind === tab).reverse()
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">退貨</h1>
        {L.can('sales', 2) && <button className="btn" onClick={() => setForm({ shipment_id: '', qtys: {}, disposition: 'restock', reason: '' })}>＋ 客戶退貨</button>}
        {L.can('purchase', 2) && <button className="btn" onClick={() => setPform({ lot_no: '', bin_id: '', qty: '', reason: '' })}>＋ 退回供應商</button>}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['sales', '銷貨退回（客戶）'], ['purchase', '進貨退出（供應商）']]} />
      <div className="card">
        <Table rows={rows} columns={[
          { h: '退貨單', r: (r) => <b>{r.no}</b> },
          { h: '日期', r: (r) => r.date },
          { h: tab === 'sales' ? '客戶' : '供應商', r: (r) => (tab === 'sales' ? <DocLink t="customers" id={r.customer_id} /> : partyName('suppliers', r.supplier_id)) },
          { h: '來源', r: (r) => (r.shipment_id ? <DocLink t="shipments" id={r.shipment_id} /> : '') },
          { h: '內容', r: (r) => <span className="small">{r.lines.map((l, i) => <span key={i}>{itemName(l.item_id)}×{l.qty}（<LotLink no={l.lot_no} />）</span>)}</span> },
          { h: '處理', r: (r) => ({ restock: '退回待處理區', scrap: '客戶端銷毀', return: '退回供應商' })[r.disposition] },
          { h: '原因', r: (r) => <span className="small">{r.reason}</span> },
          { h: '金額（含稅）', cls: 'num', r: (r) => money(r.amount + r.tax) },
          { h: '狀態', r: (r) => (r.status === 'pending' ? <PendingBadge /> : r.status === 'done' ? <Badge kind="ok">已完成</Badge> : <Badge s={r.status} />) },
        ]} />
      </div>
      {form && <SalesReturnForm form={form} setForm={setForm} />}
      {pform && <PurchaseReturnForm form={pform} setForm={setPform} />}
    </div>
  )
}

function SalesReturnForm({ form, setForm }) {
  const sh = get('shipments', form.shipment_id)
  const ok = () => {
    const lines = (sh?.lines || []).map((l) => ({ item_id: l.item_id, lot_no: l.lot_no, qty: Number(form.qtys[l.lot_no + l.item_id] || 0) }))
    if (attempt(() => L.createSalesReturn({ shipment_id: form.shipment_id, lines, disposition: form.disposition, reason: form.reason }), '退貨已完成')) setForm(null)
  }
  return (
    <Modal wide title="客戶退貨" onClose={() => setForm(null)} footer={<><button className="btn" onClick={() => setForm(null)}>取消</button><button className="btn primary" onClick={ok}>{L.getSetting('return_needs_approval') ? '送出（需核准）' : '確認退貨'}</button></>}>
      <div className="stack">
        <Field label="出貨單"><Select value={form.shipment_id} options={all('shipments').map((s) => ({ value: s.id, label: `${s.no} ${partyName('customers', s.customer_id)} ${s.date}` })).reverse()} onChange={(v) => setForm({ ...form, shipment_id: v, qtys: {} })} /></Field>
        {sh && (
          <Table rows={sh.lines} columns={[
            { h: '品項', r: (l) => itemName(l.item_id) },
            { h: '批號', r: (l) => l.lot_no },
            { h: '出貨', cls: 'num', r: (l) => qty(l.qty) },
            { h: '已退', cls: 'num', r: (l) => qty(L.returnedQty(sh.id, l.item_id, l.lot_no)) },
            { h: '本次退貨', r: (l) => <Input type="number" style={{ width: 90 }} value={form.qtys[l.lot_no + l.item_id] ?? ''} onChange={(v) => setForm({ ...form, qtys: { ...form.qtys, [l.lot_no + l.item_id]: v } })} /> },
          ]} />
        )}
        <div className="form-grid">
          <Field label="處理方式" hint="退回的貨先進「待處理區」，品管複檢後才能調回倉庫">
            <Select placeholder={false} value={form.disposition} options={[{ value: 'restock', label: '收回（進待處理區）' }, { value: 'scrap', label: '客戶端銷毀（不收回）' }]} onChange={(v) => setForm({ ...form, disposition: v })} />
          </Field>
          <Field label="退貨原因"><Input value={form.reason} onChange={(v) => setForm({ ...form, reason: v })} /></Field>
        </div>
      </div>
    </Modal>
  )
}

function PurchaseReturnForm({ form, setForm }) {
  const lots = where('lots', (l) => l.kind === 'raw' && L.lotStock(l.lot_no) > 0)
  const lot = L.lotByNo(form.lot_no)
  const bins = lot ? L.stockRows({ lot_no: lot.lot_no }).filter((r) => r.qty > 0) : []
  const ok = () => attempt(() => L.purchaseReturn(form), '已退回供應商並沖減應付') && setForm(null)
  return (
    <Modal title="退回供應商" onClose={() => setForm(null)} footer={<><button className="btn" onClick={() => setForm(null)}>取消</button><button className="btn primary" onClick={ok}>確認退回</button></>}>
      <div className="form-grid">
        <Field label="原料批號" span><Select value={form.lot_no} options={lots.map((l) => ({ value: l.lot_no, label: `${l.lot_no} ${itemName(l.item_id)}（${partyName('suppliers', l.supplier_id)}，QC ${l.qc_status}）` }))} onChange={(v) => setForm({ ...form, lot_no: v, bin_id: L.stockRows({ lot_no: v }).find((r) => r.qty > 0)?.bin_id || '' })} /></Field>
        <Field label="從哪個儲位"><Select value={form.bin_id} options={bins.map((r) => ({ value: r.bin_id, label: `${L.binLabel(r.bin_id)}（${r.qty}）` }))} onChange={(v) => setForm({ ...form, bin_id: v })} /></Field>
        <Field label={`數量${lot ? `（${itemUnit(lot.item_id)}）` : ''}`}><Input type="number" value={form.qty} onChange={(v) => setForm({ ...form, qty: v })} /></Field>
        <Field label="原因" span><Input value={form.reason} onChange={(v) => setForm({ ...form, reason: v })} placeholder="例如：IQC 不合格、規格不符" /></Field>
      </div>
    </Modal>
  )
}

