import { useState } from 'react'
import { all, get, where } from '../db/store'
import * as L from '../logic'
import {
  Modal, Field, Input, Select, LineEditor, Table, Badge, PendingBadge, Search, matches, money, qty, itemName, itemUnit, partyName, partyOptions,
  binOptions, itemOptions, DocLink, LotLink, attempt, ask, useOpen, CrudPage, altText,
} from '../ui'

const poBadge = (po) => {
  const s = L.poStatus(po)
  return s === 'pending' ? <PendingBadge /> : s === 'rejected' ? <Badge kind="bad">核准退回</Badge> : <Badge s={s}>{L.PO_STATUS[s]}</Badge>
}

export function PurchaseOrders() {
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const [recv, setRecv] = useState(null)
  const [open, setOpen] = useOpen()
  const canEdit = L.can('purchase', 2)
  const canRecv = L.can('purchase', 2) || L.can('wms', 2)
  const rows = all('purchase_orders')
    .filter((p) => matches(q, p.no, partyName('suppliers', p.supplier_id)))
    .sort((a, b) => String(b.date + b.no).localeCompare(String(a.date + a.no)))
  const save = () => {
    const { id, created_at, updated_at, ...data } = edit
    const po = attempt(() => L.savePurchaseOrder(data, id), '採購單已儲存')
    if (po) setEdit(null)
  }
  const startRecv = (p) =>
    setRecv({ purchase_order_id: p.id, supplier_id: p.supplier_id, lines: p.lines.filter((l) => l.qty > (l.received || 0)).map((l) => ({ item_id: l.item_id, qty: L.round(l.qty - (l.received || 0), 3), price: l.price, supplier_lot: '', exp_date: '', bin_id: L.defaultBin(l.item_id) })) })
  const cur = get('purchase_orders', open)
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">採購單</h1>
        <Search value={q} onChange={setQ} />
        {canRecv && <button className="btn" onClick={() => setRecv({ supplier_id: '', lines: [{ item_id: '', qty: '', price: '', supplier_lot: '', exp_date: '', bin_id: '' }] })}>直接進貨</button>}
        {canEdit && <button className="btn primary" onClick={() => setEdit({ supplier_id: '', sales_order_id: '', date: L.today(), due_date: L.addDays(L.today(), 3), lines: [{ item_id: '', qty: '', price: '' }], note: '' })}>＋ 新採購單</button>}
      </div>
      <p className="muted small" style={{ margin: 0 }}>採購金額超過 {money(L.getSetting('po_approval_amount'))} 需主管核准，核准後才能進貨。</p>
      <div className="card">
        <Table rows={rows} onRow={(p) => setOpen(p.id)} columns={[
          { h: '採購單', r: (p) => <b>{p.no}</b> },
          { h: '供應商', r: (p) => partyName('suppliers', p.supplier_id) },
          { h: '關聯訂單', r: (p) => (p.sales_order_id ? <DocLink t="sales_orders" id={p.sales_order_id} /> : '—') },
          { h: '預計到貨', r: (p) => p.due_date },
          { h: '內容（已收/訂購）', r: (p) => <span className="small">{p.lines.map((l) => `${itemName(l.item_id)} ${l.received || 0}/${l.qty}`).join('、')}</span> },
          { h: '金額', cls: 'num', r: (p) => money(p.total) },
          { h: '狀態', r: poBadge },
          { h: '', r: (p) => canRecv && ['open', 'partial'].includes(L.poStatus(p)) && <button className="btn sm primary" onClick={(e) => { e.stopPropagation(); startRecv(p) }}>進貨</button> },
        ]} />
      </div>
      {cur && (
        <Modal wide title={`採購單 ${cur.no}`} onClose={() => setOpen(null)}
          footer={<>
            {canEdit && ['open', 'pending', 'rejected'].includes(L.poStatus(cur)) && <button className="btn danger" onClick={async () => (await ask('作廢這張採購單？', { danger: true, confirmText: '作廢' })) && attempt(() => L.cancelPurchaseOrder(cur.id), '已作廢')}>作廢</button>}
            {canEdit && L.poStatus(cur) === 'partial' && <button className="btn" onClick={async () => (await ask('結案後不再進貨，確定？')) && attempt(() => L.closePurchaseOrder(cur.id), '已結案')}>結案</button>}
            <span style={{ flex: 1 }} />
            {canEdit && ['open', 'pending', 'rejected', 'partial'].includes(L.poStatus(cur)) && <button className="btn" onClick={() => { setOpen(null); setEdit(JSON.parse(JSON.stringify(cur))) }}>編輯</button>}
            {canRecv && ['open', 'partial'].includes(L.poStatus(cur)) && <button className="btn primary" onClick={() => { setOpen(null); startRecv(cur) }}>進貨</button>}
          </>}>
          <div className="stack">
            <div className="row">{poBadge(cur)}<span>供應商 <b>{partyName('suppliers', cur.supplier_id)}</b></span><span className="muted">採購 {cur.date}・預計 {cur.due_date}</span>{cur.sales_order_id && <span>訂單 <DocLink t="sales_orders" id={cur.sales_order_id} /></span>}</div>
            {L.pendingFor(cur.id) && <div className="notice warn">⏳ 等待核准：{L.pendingFor(cur.id).reason}</div>}
            <Table rows={cur.lines} columns={[
              { h: '品項', r: (l) => itemName(l.item_id) },
              { h: '訂購', cls: 'num', r: (l) => qty(l.qty, itemUnit(l.item_id)) },
              { h: '已收', cls: 'num', r: (l) => qty(l.received || 0) },
              { h: '單價', cls: 'num', r: (l) => money(l.price) },
              { h: '小計', cls: 'num', r: (l) => money(l.qty * l.price) },
            ]} />
            <h3>到貨批號</h3>
            <Table empty="尚未到貨" rows={where('lots', (l) => l.purchase_order_id === cur.id)} columns={[
              { h: '批號', r: (l) => <LotLink no={l.lot_no} /> },
              { h: '品項', r: (l) => itemName(l.item_id) },
              { h: '數量', cls: 'num', r: (l) => qty(l.qty) },
              { h: '廠商批號', r: (l) => l.supplier_lot || '—' },
              { h: '有效期限', r: (l) => l.exp_date },
              { h: 'IQC', r: (l) => <Badge s={l.qc_status}>{l.qc_status === 'pending' ? '待檢' : undefined}</Badge> },
            ]} />
            <div className="small">應付帳款：{where('bills', (b) => b.purchase_order_id === cur.id).map((b) => `${b.no} ${money(b.total)}（未付 ${money(L.billBalance(b))}）`).join('、') || '—'}</div>
          </div>
        </Modal>
      )}
      {edit && (
        <Modal wide title={edit.id ? `編輯 ${edit.no}` : '新增採購單'} onClose={() => setEdit(null)}
          footer={<><button className="btn" onClick={() => setEdit(null)}>取消</button><button className="btn primary" onClick={save}>{L.docTotal(edit.lines) > L.getSetting('po_approval_amount') ? '儲存並送簽核' : '儲存'}（{money(L.docTotal(edit.lines))}）</button></>}>
          <div className="stack">
            <div className="form-grid">
              <Field label="供應商"><Select value={edit.supplier_id} options={partyOptions('suppliers')} onChange={(v) => setEdit({ ...edit, supplier_id: v })} /></Field>
              <Field label="關聯銷售訂單（選填）"><Select value={edit.sales_order_id} options={all('sales_orders').filter((s) => s.status === 'confirmed').map((s) => ({ value: s.id, label: `${s.no} ${partyName('customers', s.customer_id)}` }))} placeholder="無" onChange={(v) => setEdit({ ...edit, sales_order_id: v })} /></Field>
              <Field label="採購日"><Input type="date" value={edit.date} onChange={(v) => setEdit({ ...edit, date: v })} /></Field>
              <Field label="預計到貨"><Input type="date" value={edit.due_date} onChange={(v) => setEdit({ ...edit, due_date: v })} /></Field>
            </div>
            <LineEditor lines={edit.lines} types={['raw', 'pack']} onChange={(lines) => setEdit({ ...edit, lines })} defaultPrice={(id) => L.lastCost(id)} />
            <Field label="備註"><textarea className="input" value={edit.note || ''} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
      {recv && <ReceiveModal data={recv} onClose={() => setRecv(null)} />}
    </div>
  )
}

export function ReceiveModal({ data, onClose }) {
  const [d, setD] = useState({ date: L.today(), note: '', ...data })
  const po = get('purchase_orders', d.purchase_order_id)
  const set = (i, patch) => setD({ ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  const ok = () => {
    const lines = d.lines.filter((l) => l.item_id && l.qty > 0).map((l) => ({ ...l, exp_date: l.exp_date || undefined, bin_id: l.bin_id || undefined }))
    if (attempt(() => L.receiveGoods({ ...d, lines }), '進貨完成：已建立原料批號、入儲位、產生應付帳款')) onClose()
  }
  return (
    <Modal wide title={po ? `進貨：${po.no}` : '直接進貨（無採購單）'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" onClick={ok}>確認入庫（{money(L.docTotal(d.lines))} 未稅）</button></>}>
      <div className="stack">
        <div className="form-grid">
          <Field label="供應商"><Select value={d.supplier_id} disabled={!!po} options={partyOptions('suppliers')} onChange={(v) => setD({ ...d, supplier_id: v })} /></Field>
          <Field label="進貨日"><Input type="date" value={d.date} onChange={(v) => setD({ ...d, date: v })} /></Field>
          <Field label="送貨單號 / 備註"><Input value={d.note} onChange={(v) => setD({ ...d, note: v })} /></Field>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>品項</th><th className="num">數量</th><th className="num">單價</th><th>入庫儲位</th><th>廠商批號</th><th>有效期限</th><th /></tr>
            </thead>
            <tbody>
              {d.lines.map((l, i) => (
                <tr key={i}>
                  <td style={{ minWidth: 170 }}>{po ? itemName(l.item_id) : <Select value={l.item_id} options={itemOptions(['raw', 'pack'])} onChange={(v) => set(i, { item_id: v, price: L.lastCost(v), bin_id: L.defaultBin(v) })} />}
                    {get('items', l.item_id)?.iqc_required && <div className="small tone-warn">需進料檢驗</div>}</td>
                  <td style={{ width: 110 }}><Input type="number" value={l.qty} onChange={(v) => set(i, { qty: v })} /><div className="small muted">{altText(l.item_id, l.qty)}</div></td>
                  <td style={{ width: 100 }}><Input type="number" value={l.price} onChange={(v) => set(i, { price: v })} /></td>
                  <td style={{ minWidth: 150 }}><Select value={l.bin_id} options={binOptions(['storage'])} onChange={(v) => set(i, { bin_id: v })} /></td>
                  <td style={{ width: 120 }}><Input value={l.supplier_lot} onChange={(v) => set(i, { supplier_lot: v })} /></td>
                  <td style={{ width: 150 }}><Input type="date" value={l.exp_date} onChange={(v) => set(i, { exp_date: v })} /></td>
                  <td>{!po && <button className="btn sm ghost danger" aria-label="刪除此列" onClick={() => setD({ ...d, lines: d.lines.filter((_, j) => j !== i) })}>✕</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!po && <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setD({ ...d, lines: [...d.lines, { item_id: '', qty: '', price: '', supplier_lot: '', exp_date: '', bin_id: '' }] })}>＋ 新增一列</button>}
        <p className="muted small" style={{ margin: 0 }}>每一列會建立一個原料批號（R 開頭），之後領料、投料、出貨都會記錄這個批號，可追溯回這家供應商。效期沒填會依品項保存天數自動計算。</p>
      </div>
    </Modal>
  )
}

export function Receiving() {
  const [q, setQ] = useState('')
  const [recv, setRecv] = useState(null)
  const rows = where('lots', (l) => l.kind === 'raw')
    .filter((l) => matches(q, l.lot_no, itemName(l.item_id), partyName('suppliers', l.supplier_id), l.supplier_lot))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">進貨紀錄（原料批號）</h1>
        <Search value={q} onChange={setQ} placeholder="批號 / 品項 / 供應商" />
        {(L.can('purchase', 2) || L.can('wms', 2)) && <button className="btn primary" onClick={() => setRecv({ supplier_id: '', lines: [{ item_id: '', qty: '', price: '', supplier_lot: '', exp_date: '', bin_id: '' }] })}>直接進貨</button>}
      </div>
      <div className="card">
        <Table rows={rows} columns={[
          { h: '批號', r: (l) => <LotLink no={l.lot_no} /> },
          { h: '進貨日', r: (l) => l.mfg_date },
          { h: '品項', r: (l) => itemName(l.item_id) },
          { h: '數量', cls: 'num', r: (l) => qty(l.qty, itemUnit(l.item_id)) },
          { h: '剩餘', cls: 'num', r: (l) => qty(L.lotStock(l.lot_no)) },
          { h: '供應商', r: (l) => partyName('suppliers', l.supplier_id) },
          { h: '廠商批號', r: (l) => l.supplier_lot || '—' },
          { h: '採購單', r: (l) => (l.purchase_order_id ? <DocLink t="purchase_orders" id={l.purchase_order_id} /> : '直接進貨') },
          { h: '有效期限', r: (l) => (L.isExpired(l) ? <Badge kind="bad">{l.exp_date}</Badge> : l.exp_date) },
          { h: 'IQC', r: (l) => <Badge s={l.qc_status}>{l.qc_status === 'pending' ? '待檢' : undefined}</Badge> },
        ]} />
      </div>
      {recv && <ReceiveModal data={recv} onClose={() => setRecv(null)} />}
    </div>
  )
}

export function Suppliers() {
  return (
    <CrudPage
      title="供應商"
      rows={all('suppliers')}
      editable={L.can('purchase', 2)}
      defaults={{ terms_days: 30, rating: 'B' }}
      searchKeys={['code', 'name', 'contact', 'phone']}
      onSave={(d, id) => L.saveMaster('suppliers', d, id)}
      onDelete={(id) => L.deleteMaster('suppliers', id)}
      fields={[
        { k: 'code', label: '編號' }, { k: 'name', label: '名稱' }, { k: 'contact', label: '聯絡人' }, { k: 'phone', label: '電話' },
        { k: 'tax_id', label: '統編' }, { k: 'terms_days', label: '付款天數', type: 'number' },
        { k: 'certs', label: '認證（CAS、HACCP…）' }, { k: 'rating', label: '評等', options: ['A', 'B', 'C'].map((x) => ({ value: x, label: x })) },
        { k: 'address', label: '地址', span: true }, { k: 'note', label: '備註', type: 'textarea', span: true },
      ]}
      columns={[
        { h: '編號', r: (c) => c.code }, { h: '名稱', r: (c) => <b>{c.name}</b> }, { h: '聯絡人', r: (c) => `${c.contact || ''} ${c.phone || ''}` },
        { h: '認證', r: (c) => <span className="small">{c.certs}</span> }, { h: '評等', r: (c) => <Badge kind={c.rating === 'A' ? 'ok' : c.rating === 'C' ? 'bad' : 'info'}>{c.rating}</Badge> },
        { h: 'IQC 合格率', cls: 'num', r: (c) => { const q = where('qc_inspections', (x) => x.kind === 'IQC' && L.lotByNo(x.lot_no)?.supplier_id === c.id); return q.length ? `${Math.round((q.filter((x) => x.result === 'pass').length / q.length) * 100)}%（${q.length}）` : '—' } },
        { h: '未付款', cls: 'num', r: (c) => money(L.sum(where('bills', (b) => b.supplier_id === c.id), L.billBalance)) },
      ]}
    />
  )
}
