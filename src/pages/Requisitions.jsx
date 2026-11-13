// 請購單：現場、倉管、廠長提出需求 → 採購轉成採購單（鼎新流程：請購 → 採購 → 進貨）
import { useState } from 'react'
import { all, get } from '../db/store'
import * as L from '../logic'
import { Modal, Field, Input, Select, LineEditor, Table, Badge, Search, matches, qty, itemName, itemUnit, partyName, partyOptions, attempt, ask, toast, useOpen, DocLink, PrintButton } from '../ui'

const reqBadge = (r) => {
  const s = L.reqStatus(r)
  return <Badge kind={{ open: 'warn', partial: 'info', converted: 'ok', cancelled: 'bad' }[s]}>{L.REQ_STATUS[s]}</Badge>
}

export default function Requisitions() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useOpen()
  const [edit, setEdit] = useState(null)
  const canAsk = L.can('purchase', 2) || L.can('wms', 2) || L.can('production', 2)
  const rows = all('requisitions')
    .filter((r) => matches(q, r.no, partyName('users', r.requester_id), r.reason))
    .sort((a, b) => String(b.date + b.no).localeCompare(String(a.date + a.no)))
  const cur = get('requisitions', open)
  const save = () => {
    const { id, created_at, updated_at, ...data } = edit
    if (attempt(() => L.saveRequisition(data, id), '請購單已送出，採購會收到通知')) setEdit(null)
  }
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">請購單</h1>
        <Search value={q} onChange={setQ} />
        {canAsk && <button className="btn" onClick={() => { const r = attempt(() => L.lowStockRequisition(), '已依安全庫存產生請購單'); if (r) setOpen(r.id) }}>依安全庫存產生</button>}
        {canAsk && <button className="btn primary" onClick={() => setEdit({ date: L.today(), need_date: L.addDays(L.today(), 3), lines: [{ item_id: '', qty: '' }], reason: '' })}>＋ 新請購單</button>}
      </div>
      <p className="muted small" style={{ margin: 0 }}>現場、倉管或廠長發現要買東西時開請購單，採購確認供應商後一鍵轉成採購單。</p>
      <div className="card">
        <Table rows={rows} onRow={(r) => setOpen(r.id)} columns={[
          { h: '請購單', r: (r) => <b>{r.no}</b> },
          { h: '日期', r: (r) => r.date },
          { h: '需要日期', r: (r) => r.need_date },
          { h: '請購人', r: (r) => partyName('users', r.requester_id) },
          { h: '內容', r: (r) => <span className="small">{r.lines.map((l) => `${itemName(l.item_id)} ${l.qty}`).join('、')}</span> },
          { h: '原因', r: (r) => <span className="small">{r.reason}</span> },
          { h: '狀態', r: reqBadge },
        ]} />
      </div>
      {cur && <ReqModal r={cur} onClose={() => setOpen(null)} onEdit={() => { setOpen(null); setEdit(JSON.parse(JSON.stringify(cur))) }} />}
      {edit && (
        <Modal wide title={edit.id ? `編輯 ${edit.no}` : '新請購單'} onClose={() => setEdit(null)}
          footer={<><button className="btn" onClick={() => setEdit(null)}>取消</button><button className="btn primary" onClick={save}>送出</button></>}>
          <div className="stack">
            <div className="form-grid">
              <Field label="請購日"><Input type="date" value={edit.date} onChange={(v) => setEdit({ ...edit, date: v })} /></Field>
              <Field label="需要日期"><Input type="date" value={edit.need_date} onChange={(v) => setEdit({ ...edit, need_date: v })} /></Field>
              <Field label="原因"><Input value={edit.reason} onChange={(v) => setEdit({ ...edit, reason: v })} placeholder="例如：中秋檔期備料" /></Field>
            </div>
            <LineEditor lines={edit.lines} types={['raw', 'pack']} withPrice={false} onChange={(lines) => setEdit({ ...edit, lines })} />
          </div>
        </Modal>
      )}
    </div>
  )
}

function ReqModal({ r, onClose, onEdit }) {
  const st = L.reqStatus(r)
  const [sup, setSup] = useState(() => Object.fromEntries(r.lines.map((l) => [l.item_id, L.lastPurchase(l.item_id)?.supplier_id || ''])))
  const canBuy = L.can('purchase', 2) && ['open', 'partial'].includes(st)
  const canAsk = L.can('purchase', 2) || L.can('wms', 2) || L.can('production', 2)
  return (
    <Modal wide title={`請購單 ${r.no}`} onClose={onClose}
      footer={<>
        {canAsk && st === 'open' && <button className="btn danger" onClick={async () => (await ask('取消這張請購單？', { danger: true })) && attempt(() => L.cancelRequisition(r.id), '已取消') && onClose()}>取消請購</button>}
        {canAsk && st === 'open' && <button className="btn" onClick={onEdit}>編輯</button>}
        <PrintButton type="requisition" id={r.id} />
        <span style={{ flex: 1 }} />
        {canBuy && <button className="btn primary" onClick={() => { const pos = attempt(() => L.convertRequisition(r.id, sup)); if (pos) toast(`已轉成 ${pos.length} 張採購單：${pos.map((p) => p.no).join('、')}`) }}>轉成採購單</button>}
      </>}>
      <div className="stack">
        <div className="row">{reqBadge(r)}<span>請購人 <b>{partyName('users', r.requester_id)}</b></span><span className="muted">{r.date}・需要 {r.need_date}</span></div>
        {r.reason && <div>原因：{r.reason}</div>}
        <Table rows={r.lines.map((l, i) => ({ ...l, id: i }))} columns={[
          { h: '品項', r: (l) => itemName(l.item_id) },
          { h: '請購量', cls: 'num', r: (l) => qty(l.qty, itemUnit(l.item_id)) },
          { h: '可用庫存', cls: 'num', r: (l) => qty(L.stockOf(l.item_id)) },
          { h: '已訂未到', cls: 'num', r: (l) => qty(L.openPOQty(l.item_id)) },
          { h: '備註', r: (l) => <span className="small">{l.note}</span> },
          { h: canBuy ? '供應商' : '採購單', r: (l) => (l.purchase_order_id ? <DocLink t="purchase_orders" id={l.purchase_order_id} /> : canBuy ? <Select value={sup[l.item_id]} options={partyOptions('suppliers')} onChange={(v) => setSup({ ...sup, [l.item_id]: v })} /> : '—') },
        ]} />
      </div>
    </Modal>
  )
}
