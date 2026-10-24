import { useState } from 'react'
import { all, where } from '../db/store'
import * as L from '../logic'
import { Modal, Field, Input, Table, Badge, Tabs, Search, matches, qty, itemName, itemUnit, partyName, attempt, ask, useTab, LotLink, DocLink } from '../ui'

export default function QC() {
  const [tab, setTab] = useTab('pending')
  const [form, setForm] = useState(null)
  const [q, setQ] = useState('')
  const canEdit = L.can('qc', 2)
  const pending = where('lots', (l) => ['pending', 'fail', 'hold'].includes(l.qc_status) && L.lotStock(l.lot_no) > 0)
  const records = [...all('qc_inspections')].reverse().filter((r) => matches(q, r.no, r.lot_no, itemName(r.item_id), r.inspector))
  const start = (lot) =>
    setForm({
      lot,
      sample_size: lot.kind === 'raw' ? 3 : 5,
      defect_qty: 0,
      checks: (lot.kind === 'raw' ? L.IQC_CHECKS : L.DEFAULT_CHECKS).map((c) => ({ ...c, value: '', pass: true })),
      note: '',
    })
  const lotRows = tab === 'pending' ? pending : [...all('lots')].reverse().filter((l) => matches(q, l.lot_no, itemName(l.item_id)))
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">品管 QC</h1>
        {tab !== 'pending' && <Search value={q} onChange={setQ} placeholder="批號 / 品項" />}
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        成品（L 批號）合格才能出貨、送門市；需要進料檢驗的原料（R 批號）合格才能領料。判定不合格的批號要改判合格，需品管主管核准。
      </p>
      <Tabs value={tab} onChange={setTab} tabs={[['pending', `待處理批號（${pending.length}）`], ['lots', '所有批號'], ['records', '檢驗紀錄']]} />
      {tab !== 'records' && (
        <div className="card">
          <Table empty="沒有待檢批號 ✅" rows={lotRows} columns={[
            { h: '批號', r: (l) => <LotLink no={l.lot_no} /> },
            { h: '類型', r: (l) => (l.kind === 'raw' ? <Badge>進料 IQC</Badge> : <Badge kind="primary">成品 FQC</Badge>) },
            { h: '品項', r: (l) => itemName(l.item_id) },
            { h: '來源', r: (l) => (l.kind === 'raw' ? partyName('suppliers', l.supplier_id) : <DocLink t="work_orders" id={l.work_order_id} />) },
            { h: '數量 / 庫存', cls: 'num', r: (l) => `${qty(l.qty)} / ${qty(L.lotStock(l.lot_no))} ${itemUnit(l.item_id)}` },
            { h: '有效期限', r: (l) => l.exp_date },
            { h: 'QC', r: (l) => <Badge s={l.qc_status}>{l.qc_status === 'pending' ? '待檢' : undefined}</Badge> },
            {
              h: '',
              r: (l) =>
                canEdit && (
                  <span className="row nowrap">
                    <button className="btn sm primary" onClick={() => start(l)}>{l.qc_status === 'pending' ? '檢驗' : '複檢'}</button>
                    {l.qc_status === 'pass' && <button className="btn sm" onClick={async () => { const r = await ask(`暫扣批號 ${l.lot_no}？暫扣後不能出貨或使用。`, { input: true, placeholder: '暫扣原因' }); if (r) attempt(() => L.holdLot(l.lot_no, r), '已暫扣') }}>暫扣</button>}
                    {['fail', 'hold'].includes(l.qc_status) && L.can('qc', 3) && L.lotStock(l.lot_no) > 0 && <button className="btn sm danger" onClick={async () => { const r = await ask(`報廢批號 ${l.lot_no} 的全部庫存 ${L.lotStock(l.lot_no)}？`, { input: true, placeholder: '報廢原因', danger: true, confirmText: '報廢' }); if (r) attempt(() => L.scrapLot(l.lot_no, r), '已報廢') }}>報廢</button>}
                  </span>
                ),
            },
          ]} />
        </div>
      )}
      {tab === 'records' && (
        <div className="card">
          <Table rows={records} onRow={(r) => setForm({ ...r, readonly: true, lot: L.lotByNo(r.lot_no) })} columns={[
            { h: '單號', r: (r) => r.no },
            { h: '類型', r: (r) => (r.kind === 'FQC' ? '成品' : '進料') },
            { h: '批號', r: (r) => <LotLink no={r.lot_no} /> },
            { h: '品項', r: (r) => itemName(r.item_id) },
            { h: '抽樣 / 不良', cls: 'num', r: (r) => `${r.sample_size} / ${r.defect_qty}` },
            { h: '結果', r: (r) => <Badge s={r.result} /> },
            { h: '檢驗員', r: (r) => r.inspector },
            { h: '日期', r: (r) => r.date },
          ]} />
        </div>
      )}
      {form && <InspectModal form={form} setForm={setForm} />}
    </div>
  )
}

function InspectModal({ form, setForm }) {
  const ro = form.readonly
  const lot = form.lot
  const allPass = form.checks.every((c) => c.pass) && !(form.defect_qty > 0)
  const setCheck = (i, patch) => setForm({ ...form, checks: form.checks.map((c, j) => (j === i ? { ...c, ...patch } : c)) })
  const submit = (result) => {
    const { readonly, lot: _l, ...data } = form
    if (attempt(() => L.saveInspection({ ...data, lot_no: lot.lot_no, result }), result === 'pass' ? '判定合格' : '判定不合格，批號已管制')) setForm(null)
  }
  return (
    <Modal wide title={ro ? `檢驗紀錄 ${form.no}` : `${lot.kind === 'raw' ? '進料檢驗' : '成品抽檢'}：${lot.lot_no}`} onClose={() => setForm(null)}
      footer={ro ? <button className="btn" onClick={() => setForm(null)}>關閉</button> : <>
        <span className="muted small" style={{ flex: 1 }}>建議判定：{allPass ? '合格' : '不合格'}</span>
        <button className="btn danger" onClick={() => submit('fail')}>✕ 不合格</button>
        <button className="btn primary" disabled={!allPass} onClick={() => submit('pass')}>✓ 合格</button>
      </>}>
      <div className="stack">
        <div className="row">
          <b>{itemName(lot?.item_id)}</b>
          <span className="muted">數量 {qty(lot?.qty, itemUnit(lot?.item_id))}</span>
          {lot?.kind === 'raw' && <span className="muted">供應商 {partyName('suppliers', lot.supplier_id)}・廠商批號 {lot.supplier_lot || '—'}</span>}
          <span className="muted">效期 {lot?.exp_date}</span>
        </div>
        <div className="form-grid">
          <Field label="抽樣數"><Input disabled={ro} type="number" value={form.sample_size} onChange={(v) => setForm({ ...form, sample_size: v })} /></Field>
          <Field label="不良數"><Input disabled={ro} type="number" value={form.defect_qty} onChange={(v) => setForm({ ...form, defect_qty: v })} /></Field>
        </div>
        <Table rows={form.checks.map((c, i) => ({ ...c, i }))} columns={[
          { h: '檢驗項目', r: (c) => <b>{c.name}</b> },
          { h: '標準', r: (c) => <span className="small muted">{c.standard}</span> },
          { h: '實測', r: (c) => <Input disabled={ro} value={c.value} onChange={(v) => setCheck(c.i, { value: v })} style={{ width: 110 }} /> },
          { h: '判定', r: (c) => (
            <div className="mode-switch">
              <button disabled={ro} className={c.pass ? 'on' : ''} onClick={() => setCheck(c.i, { pass: true })}>OK</button>
              <button disabled={ro} className={!c.pass ? 'on bad' : ''} onClick={() => setCheck(c.i, { pass: false })}>NG</button>
            </div>
          ) },
        ]} />
        <Field label="備註"><textarea disabled={ro} className="input" value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
        {ro && <div>結果：<Badge s={form.result} />　檢驗員 {form.inspector}　{form.date}</div>}
      </div>
    </Modal>
  )
}
