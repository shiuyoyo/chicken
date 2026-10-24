import { useState } from 'react'
import { all, where } from '../db/store'
import { saveInspection, DEFAULT_CHECKS, lotStock } from '../logic'
import { Modal, Field, Input, Select, Table, Badge, Tabs, qty, itemName, itemUnit, itemOptions, attempt, toast } from '../ui'

export default function QC() {
  const [tab, setTab] = useState('pending')
  const [form, setForm] = useState(null)
  const pending = where('lots', (l) => l.qc_status === 'pending' || l.qc_status === 'fail')
  const records = [...all('qc_inspections')].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  const start = (lot) =>
    setForm({
      kind: lot ? 'FQC' : 'IQC',
      lot_no: lot?.lot_no || '',
      item_id: lot?.item_id || '',
      work_order_id: lot?.work_order_id || '',
      sample_size: 5,
      defect_qty: 0,
      checks: DEFAULT_CHECKS.map((c) => ({ ...c, value: '', pass: true })),
      note: '',
    })
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">品管 QC</h1>
        <button className="btn" onClick={() => start(null)}>＋ 進料檢驗（IQC）</button>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['pending', `待檢 / 不合格批號（${pending.length}）`], ['all', '所有批號'], ['records', '檢驗紀錄']]} />
      {tab !== 'records' && (
        <div className="card">
          <Table
            empty="沒有待檢批號 ✅"
            rows={tab === 'pending' ? pending : [...all('lots')].reverse()}
            columns={[
              { h: '批號', r: (l) => <b>{l.lot_no}</b> },
              { h: '產品', r: (l) => itemName(l.item_id) },
              { h: '產量', cls: 'num', r: (l) => qty(l.qty, itemUnit(l.item_id)) },
              { h: '庫存', cls: 'num', r: (l) => qty(lotStock(l)) },
              { h: '製造日', r: (l) => l.mfg_date },
              { h: '有效期限', r: (l) => l.exp_date },
              { h: 'QC', r: (l) => <Badge s={l.qc_status} /> },
              { h: '', r: (l) => <button className="btn sm primary" onClick={() => start(l)}>{l.qc_status === 'pending' ? '抽樣檢驗' : '重新檢驗'}</button> },
            ]}
          />
        </div>
      )}
      {tab === 'records' && (
        <div className="card">
          <Table
            rows={records}
            onRow={(r) => setForm({ ...r, readonly: true })}
            columns={[
              { h: '單號', r: (r) => r.no },
              { h: '類型', r: (r) => (r.kind === 'FQC' ? '成品' : '進料') },
              { h: '批號', r: (r) => r.lot_no || '—' },
              { h: '品項', r: (r) => itemName(r.item_id) },
              { h: '抽樣 / 不良', cls: 'num', r: (r) => `${r.sample_size} / ${r.defect_qty}` },
              { h: '結果', r: (r) => <Badge s={r.result} /> },
              { h: '檢驗員', r: (r) => r.inspector },
              { h: '日期', r: (r) => r.date },
            ]}
          />
        </div>
      )}
      {form && <InspectModal form={form} setForm={setForm} />}
    </div>
  )
}

function InspectModal({ form, setForm }) {
  const ro = form.readonly
  const allPass = form.checks.every((c) => c.pass) && !(form.defect_qty > 0)
  const setCheck = (i, patch) => setForm({ ...form, checks: form.checks.map((c, j) => (j === i ? { ...c, ...patch } : c)) })
  const submit = (result) => {
    if (!form.item_id) return toast('請選擇品項', 'bad')
    const { readonly, ...data } = form
    if (attempt(() => saveInspection({ ...data, result }), result === 'pass' ? '判定合格，可以出貨' : '判定不合格，批號已暫扣')) setForm(null)
  }
  return (
    <Modal wide title={ro ? `檢驗紀錄 ${form.no}` : form.kind === 'FQC' ? `成品抽檢：${form.lot_no}` : '進料檢驗'} onClose={() => setForm(null)}
      footer={ro ? <button className="btn" onClick={() => setForm(null)}>關閉</button> : <>
        <span className="muted small" style={{ flex: 1 }}>建議判定：{allPass ? '合格' : '不合格'}</span>
        <button className="btn danger" onClick={() => submit('fail')}>✕ 不合格</button>
        <button className="btn primary" onClick={() => submit('pass')}>✓ 合格</button>
      </>}>
      <div className="stack">
        <div className="form-grid">
          <Field label="品項"><Select disabled={ro || form.kind === 'FQC'} value={form.item_id} options={itemOptions(form.kind === 'FQC' ? ['product'] : ['raw', 'pack'])} onChange={(v) => setForm({ ...form, item_id: v })} /></Field>
          {form.kind === 'IQC' && <Field label="供應商批號 / 送貨單"><Input disabled={ro} value={form.lot_no} onChange={(v) => setForm({ ...form, lot_no: v })} /></Field>}
          <Field label="抽樣數"><Input disabled={ro} type="number" value={form.sample_size} onChange={(v) => setForm({ ...form, sample_size: v })} /></Field>
          <Field label="不良數"><Input disabled={ro} type="number" value={form.defect_qty} onChange={(v) => setForm({ ...form, defect_qty: v })} /></Field>
        </div>
        <Table rows={form.checks} columns={[
          { h: '檢驗項目', r: (c) => <b>{c.name}</b> },
          { h: '標準', r: (c) => <span className="small muted">{c.standard}</span> },
          { h: '實測', r: (c) => <Input disabled={ro} value={c.value} onChange={(v) => setCheck(form.checks.indexOf(c), { value: v })} style={{ width: 110 }} /> },
          { h: '判定', r: (c) => (
            <div className="mode-switch">
              <button disabled={ro} className={c.pass ? 'on' : ''} onClick={() => setCheck(form.checks.indexOf(c), { pass: true })}>OK</button>
              <button disabled={ro} className={!c.pass ? 'on' : ''} onClick={() => setCheck(form.checks.indexOf(c), { pass: false })}>NG</button>
            </div>
          ) },
        ]} />
        <Field label="備註"><textarea disabled={ro} className="input" value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
        {ro && <div>結果：<Badge s={form.result} />　檢驗員 {form.inspector}　{form.date}</div>}
      </div>
    </Modal>
  )
}
