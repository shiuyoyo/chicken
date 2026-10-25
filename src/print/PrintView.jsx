// 列印頁：A4 單據、批號標籤、門市收據。用瀏覽器「列印」即可印出或存成 PDF。
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import QRCode from 'qrcode'
import { currentUser } from '../db/store'
import * as L from '../logic'
import { FORMS, buildForm } from './forms'
import { NoAccess } from '../ui'

function QR({ text, size = 120 }) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const n = qr.modules.size
  const cells = []
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.data[y * n + x]) cells.push(`M${x + 2},${y + 2}h1v1h-1z`)
  return (
    <svg className="qr" width={size} height={size} viewBox={`0 0 ${n + 4} ${n + 4}`} role="img" aria-label={`QR Code ${text}`}>
      <rect width={n + 4} height={n + 4} fill="#fff" />
      <path d={cells.join('')} fill="#000" />
    </svg>
  )
}

const Lines = ({ text }) => String(text ?? '').split('\n').map((t, i) => <div key={i}>{t}</div>)

function A4({ f }) {
  return (
    <div className={'pf-page' + ((f.rows?.length || 0) + L.sum(f.sections || [], (x) => x.rows.length) > 18 ? ' long' : '')}>
      <header className="pf-head">
        <div className="pf-company">
          <b>{L.getSetting('company_name')}</b>
          <div>{L.getSetting('company_address')}</div>
          <div>電話 {L.getSetting('company_phone')}　統編 {L.getSetting('company_tax_id')}</div>
        </div>
        <h1 className="pf-title">{f.title}</h1>
        <div className="pf-docno">
          <div>單號 <b>{f.no}</b></div>
          <div>日期 {f.date}</div>
        </div>
      </header>
      {(f.party || f.meta?.length) && (
        <section className="pf-info">
          {f.party && (
            <div className="pf-party">
              <div className="pf-label">{f.party.title}</div>
              {f.party.lines.filter(Boolean).map((l, i) => <div key={i} className={i === 0 ? 'strong' : ''}>{l}</div>)}
            </div>
          )}
          <dl className="pf-meta">
            {(f.meta || []).map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v || ''}</dd></div>
            ))}
          </dl>
        </section>
      )}
      {f.columns && (
        <table className="pf-table">
          <thead>
            <tr><th className="pf-idx">#</th>{f.columns.map((c) => <th key={c.h} className={c.cls}>{c.h}</th>)}</tr>
          </thead>
          <tbody>
            {f.rows.map((r, i) => (
              <tr key={i}><td className="pf-idx">{i + 1}</td>{f.columns.map((c) => <td key={c.h} className={c.cls}><Lines text={c.r(r)} /></td>)}</tr>
            ))}
            {f.rows.length === 0 && <tr><td colSpan={f.columns.length + 1} className="pf-empty">（無資料）</td></tr>}
          </tbody>
        </table>
      )}
      {(f.sections || []).map((s) => (
        <section key={s.title} className="pf-section">
          <h2>{s.title}</h2>
          <table className="pf-table">
            <thead><tr>{s.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {s.rows.map((r, i) => <tr key={i}>{['a', 'b', 'c', 'd'].map((k) => <td key={k}>{r[k]}</td>)}</tr>)}
              {s.rows.length === 0 && <tr><td colSpan={s.columns.length} className="pf-empty">（無）</td></tr>}
            </tbody>
          </table>
        </section>
      ))}
      {f.extra && (
        <section className="pf-section">
          <h2>{f.extra.title}</h2>
          <table className="pf-table pf-form">
            <tbody>{f.extra.rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody>
          </table>
        </section>
      )}
      <div className="pf-bottom">
        <div className="pf-notes">{(f.notes || []).filter(Boolean).map((n, i) => <p key={i}>※ {n}</p>)}</div>
        {f.totals?.length > 0 && (
          <table className="pf-totals">
            <tbody>{f.totals.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody>
          </table>
        )}
      </div>
      {f.signatures && (
        <div className="pf-sign">
          {f.signatures.map((s) => <div key={s}><span>{s}</span></div>)}
        </div>
      )}
      <footer className="pf-foot">列印：{currentUser()?.name}　{new Date().toLocaleString('zh-TW', { hour12: false })}</footer>
    </div>
  )
}

function Label({ f }) {
  return (
    <div className="pf-labels">
      {Array.from({ length: f.copies }).map((_, i) => (
        <div key={i} className="pf-label-card">
          <div className="pf-label-main">
            <b className="pf-label-name">{f.title}</b>
            <dl>
              {f.meta.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
            <div className="pf-label-foot">{f.footer}</div>
          </div>
          <QR text={f.qr} size={110} />
        </div>
      ))}
    </div>
  )
}

function Receipt({ f }) {
  return (
    <div className="pf-receipt">
      <b className="center">{f.title}</b>
      <div className="center">{L.getSetting('company_address')}</div>
      <div>{f.no}　{f.date}</div>
      {f.meta.filter(([, v]) => v).map(([k, v]) => <div key={k}>{k}：{v}</div>)}
      <hr />
      {f.rows.map((r, i) => <div key={i} className="pf-r-line"><span>{f.columns[0].r(r)} ×{f.columns[1].r(r)}</span><span>{f.columns[2].r(r)}</span></div>)}
      <hr />
      {f.totals.map(([k, v]) => <div key={k} className="pf-r-line"><span>{k}</span><b>{v}</b></div>)}
      <hr />
      {f.notes.map((n) => <div key={n} className="center">{n}</div>)}
    </div>
  )
}

export default function PrintView() {
  const { type, id } = useParams()
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()
  const def = FORMS[type]
  if (!def) return <div className="content">沒有這種表單</div>
  const mods = [def.module].flat()
  if (!mods.some((m) => L.can(m, 1))) return <div className="content"><NoAccess mod={mods.map((m) => L.MODULES[m]).join(' / ')} /></div>
  const params = Object.fromEntries(sp.entries())
  const f = buildForm(type, decodeURIComponent(id), params)
  const set = (k, v) => {
    const n = new URLSearchParams(sp)
    n.set(k, v)
    setSp(n, { replace: true })
  }
  return (
    <div className={'print-root layout-' + (f?.layout || 'a4')}>
      <div className="print-bar no-print">
        <button className="btn" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/forms'))}>← 返回</button>
        <b style={{ flex: 1 }}>{def.label}</b>
        {type === 'label' && (
          <label className="row small">張數 <input className="input" style={{ width: 70 }} type="number" min="1" max="100" value={params.copies || 1} onChange={(e) => set('copies', e.target.value)} /></label>
        )}
        {type === 'statement' && (
          <>
            <input className="input auto" type="date" aria-label="起" value={params.from || L.today().slice(0, 7) + '-01'} onChange={(e) => set('from', e.target.value)} />
            <span>～</span>
            <input className="input auto" type="date" aria-label="迄" value={params.to || L.today()} onChange={(e) => set('to', e.target.value)} />
          </>
        )}
        <button className="btn primary" onClick={() => window.print()}>🖨 列印 / 存 PDF</button>
      </div>
      {!f ? <div className="content empty">找不到這張單據</div> : f.layout === 'label' ? <Label f={f} /> : f.layout === 'receipt' ? <Receipt f={f} /> : <A4 f={f} />}
    </div>
  )
}
