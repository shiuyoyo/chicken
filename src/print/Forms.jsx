// 表單列印中心：所有可以列印的單據，依類型列出最近的單號
import { useState } from 'react'
import * as L from '../logic'
import { FORMS, recentDocs } from './forms'
import { PrintButton, Search, matches } from '../ui'

const GROUPS = [
  ['業務', ['quotation', 'sales_order', 'return']],
  ['採購', ['requisition', 'purchase_order']],
  ['倉儲 / 生產', ['doc', 'work_order', 'transfer', 'stocktake', 'label']],
  ['品管 / 追溯', ['inspection', 'trace']],
  ['出貨', ['pick_list', 'shipment']],
  ['財務', ['invoice', 'statement', 'payment', 'journal']],
  ['門市', ['pos_receipt']],
]

export default function Forms() {
  const [q, setQ] = useState('')
  const [type, setType] = useState('shipment')
  const allowed = (t) => [FORMS[t].module].flat().some((m) => L.can(m, 1))
  const docs = allowed(type) ? recentDocs(type, 60).filter((d) => matches(q, d.no, d.label)) : []
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">表單列印</h1>
        <Search value={q} onChange={setQ} placeholder="單號 / 對象" />
      </div>
      <p className="muted small" style={{ margin: 0 }}>所有單據都可以印成 A4 或存成 PDF；批號標籤可以一次印多張，標籤上的 QR Code 掃描後就是批號。各單據頁面也有「🖨 列印」按鈕。</p>
      <div className="forms-layout">
        <nav className="forms-types" aria-label="表單類型">
          {GROUPS.map(([g, types]) => {
            const vis = types.filter(allowed)
            if (!vis.length) return null
            return (
              <div key={g}>
                <div className="nav-title">{g}</div>
                {vis.map((t) => (
                  <button key={t} className={'forms-type' + (t === type ? ' on' : '')} onClick={() => setType(t)}>{FORMS[t].label}</button>
                ))}
              </div>
            )
          })}
        </nav>
        <div className="card">
          <div className="card-head"><h3>{FORMS[type].label}</h3></div>
          {docs.length === 0 && <div className="empty">沒有單據</div>}
          <div className="forms-docs">
            {docs.map((d) => (
              <div key={d.id} className="forms-doc">
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{d.no}</b> <span className="small muted">{d.date}</span>
                  <div className="small muted ellipsis">{d.label}</div>
                </span>
                <PrintButton sm type={type} id={d.id} params={type === 'label' ? { copies: 4 } : undefined} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
