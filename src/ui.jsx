// 共用介面元件
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { all, get, findBy } from './db/store'
import { can, binLabel, lotByNo, round } from './logic'

export const money = (n) => (Number(n) < 0 ? '-$' : '$') + Math.abs(Math.round(Number(n) || 0)).toLocaleString()
export const qty = (n, unit = '') => `${(Math.round((Number(n) || 0) * 1000) / 1000).toLocaleString()}${unit ? ' ' + unit : ''}`
export const dt = (s) => (s ? String(s).replace('T', ' ').slice(0, 16) : '')
export const itemName = (id) => get('items', id)?.name || '—'
export const itemUnit = (id) => get('items', id)?.unit || ''
export const partyName = (t, id) => get(t, id)?.name || '—'
export const userLabel = (id) => get('users', id)?.name || '—'
// 包裝單位換算顯示，例如 30 kg →「2.5 箱」
export const altText = (itemId, n) => {
  const i = get('items', itemId)
  if (!i?.alt_unit || !i.alt_factor || !n) return ''
  return `≈ ${round(n / i.alt_factor, 1)} ${i.alt_unit}`
}

// ---- 提示訊息 ----
let pushToast = () => {}
export function toast(msg, kind = '') {
  pushToast({ msg, kind, id: Math.random() })
}
export function Toasts() {
  const [list, setList] = useState([])
  useEffect(() => {
    pushToast = (t) => {
      setList((l) => [...l, t])
      setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), t.kind === 'bad' ? 5000 : 2800)
    }
    const onErr = (e) => pushToast({ msg: '雲端寫入失敗：' + e.detail, kind: 'bad', id: Math.random() })
    window.addEventListener('erp:backend-error', onErr)
    return () => window.removeEventListener('erp:backend-error', onErr)
  }, [])
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={'toast ' + t.kind}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}

// 執行會丟錯的動作：成功顯示訊息，失敗顯示原因。邏輯層已自帶交易還原。
export function attempt(fn, okMsg) {
  try {
    const r = fn()
    if (r?.pending) toast('已送出簽核，等主管核准後生效')
    else if (okMsg) toast(okMsg)
    return r ?? true
  } catch (e) {
    toast(e.message || String(e), 'bad')
    return false
  }
}

// ---- 頁內確認框（取代 confirm / prompt） ----
let pushAsk = () => {}
export const ask = (message, opt = {}) => new Promise((resolve) => pushAsk({ message, ...opt, resolve }))
export function AskHost() {
  const [q, setQ] = useState(null)
  const [text, setText] = useState('')
  useEffect(() => {
    pushAsk = (x) => {
      setText('')
      setQ(x)
    }
  }, [])
  if (!q) return null
  const close = (v) => {
    q.resolve(v)
    setQ(null)
  }
  return (
    <Modal
      title={q.title || '請確認'}
      onClose={() => close(q.input ? null : false)}
      footer={
        <>
          <button className="btn" onClick={() => close(q.input ? null : false)}>
            取消
          </button>
          <button
            className={'btn ' + (q.danger ? 'danger-fill' : 'primary')}
            disabled={q.input && q.required !== false && !text.trim()}
            onClick={() => close(q.input ? text.trim() : true)}
          >
            {q.confirmText || '確定'}
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0, whiteSpace: 'pre-wrap' }}>{q.message}</p>
      {q.input && <textarea id="ask-input" className="input" autoFocus placeholder={q.placeholder || ''} value={text} onChange={(e) => setText(e.target.value)} />}
    </Modal>
  )
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="關閉">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, children, span, hint }) {
  return (
    <label className="field" style={span ? { gridColumn: '1 / -1' } : undefined}>
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  )
}

export function Input({ value, onChange, type = 'text', ...rest }) {
  return (
    <input
      className="input"
      type={type}
      value={value ?? ''}
      onChange={(e) => onChange(type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
      {...rest}
    />
  )
}

export function Select({ value, onChange, options, placeholder = '請選擇', ...rest }) {
  return (
    <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      {placeholder !== false && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Check({ checked, onChange, label }) {
  return (
    <label className="row small" style={{ gap: 6 }}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

export const itemOptions = (types) =>
  all('items')
    .filter((i) => i.active !== false && (!types || types.includes(i.type)))
    .map((i) => ({ value: i.id, label: `${i.code} ${i.name}（${i.unit}）` }))
export const partyOptions = (t, filter = () => true) => all(t).filter(filter).map((p) => ({ value: p.id, label: `${p.code || ''} ${p.name}`.trim() }))
export const binOptions = (kinds) =>
  all('bins')
    .filter((b) => b.active !== false && (!kinds || kinds.includes(get('warehouses', b.warehouse_id)?.kind)))
    .map((b) => ({ value: b.id, label: binLabel(b.id) }))
export const userOptions = () => all('users').filter((u) => u.active !== false).map((u) => ({ value: u.id, label: u.name }))

const BADGE = {
  draft: ['草稿', ''], confirmed: ['已確認', 'info'], cancelled: ['已取消', 'bad'], closed: ['已結案', ''], rejected: ['退回', 'bad'],
  open: ['未到貨', 'warn'], partial: ['部分', 'warn'], received: ['已到齊', 'ok'], approved: ['已核准', 'ok'], superseded: ['已失效', ''],
  planned: ['待領料', 'warn'], issued: ['已領料', 'info'], cooking: ['烹煮中', 'primary'], done: ['完成', 'ok'],
  qc_pass: ['QC 合格', 'ok'], qc_fail: ['QC 不合格', 'bad'],
  pass: ['合格', 'ok'], fail: ['不合格', 'bad'], hold: ['暫扣', 'warn'],
  unpaid: ['未付', 'warn'], paid: ['已結清', 'ok'], shipped: ['已出貨', 'info'], delivered: ['已送達', 'ok'],
  counting: ['盤點中', 'warn'], posted: ['已過帳', 'ok'], void: ['已作廢', 'bad'], sent: ['已送出', 'info'], accepted: ['客戶接受', 'ok'],
  converted: ['已轉訂單', 'ok'], expired: ['已過期', 'bad'],
}
export function Badge({ s, children, kind }) {
  const [label, k] = BADGE[s] || [children ?? s, kind ?? '']
  return <span className={'badge ' + (kind ?? k)}>{children ?? label}</span>
}
// pending 在不同單據意思不同，獨立處理
export const PendingBadge = () => <span className="badge warn">待核准</span>

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'active' : ''} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  )
}

// 分頁狀態記在網址上，方便分享與返回
export function useTab(def) {
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || def
  const setTab = (t) => {
    const n = new URLSearchParams(sp)
    n.set('tab', t)
    n.delete('open')
    setSp(n, { replace: true })
  }
  return [tab, setTab]
}
export function useOpen() {
  const [sp, setSp] = useSearchParams()
  const id = sp.get('open')
  const set = (v) => {
    const n = new URLSearchParams(sp)
    if (v) n.set('open', v)
    else n.delete('open')
    setSp(n, { replace: !v })
  }
  return [id, set]
}

export function Kpi({ label, value, sub, to, tone }) {
  const body = (
    <>
      <div className="label">{label}</div>
      <div className={'value' + (tone ? ' tone-' + tone : '')}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </>
  )
  return to ? (
    <Link to={to} className="card kpi kpi-link">
      {body}
    </Link>
  ) : (
    <div className="card kpi">{body}</div>
  )
}

// columns: [{ h: 標題, r: row => 內容, cls }]
export function Table({ columns, rows, onRow, empty = '沒有資料', foot }) {
  if (!rows.length) return <div className="empty">{empty}</div>
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} className={c.cls}>
                {c.h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r.id || ri} className={onRow ? 'click' : ''} onClick={onRow ? () => onRow(r) : undefined}>
              {columns.map((c, i) => (
                <td key={i} className={c.cls}>
                  {c.r(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {foot && <tfoot>{foot}</tfoot>}
      </table>
    </div>
  )
}

export function Search({ value, onChange, placeholder = '搜尋…' }) {
  return <input className="input search" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
}
export const matches = (q, ...fields) => !q || fields.some((f) => String(f ?? '').toLowerCase().includes(q.toLowerCase()))

// 單據明細編輯器：品項 + 數量 + 單價
export function LineEditor({ lines, onChange, types, withPrice = true, defaultPrice, readOnly }) {
  const set = (i, patch) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>品項</th>
            <th className="num">數量</th>
            {withPrice && <th className="num">單價</th>}
            {withPrice && <th className="num">小計</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td style={{ minWidth: 200 }}>
                <Select disabled={readOnly} value={l.item_id} options={itemOptions(types)} onChange={(v) => set(i, { item_id: v, price: defaultPrice ? defaultPrice(v) : l.price })} />
              </td>
              <td style={{ width: 130 }}>
                <Input disabled={readOnly} type="number" min="0" step="any" value={l.qty} onChange={(v) => set(i, { qty: v })} />
                {l.item_id && l.qty ? <div className="small muted">{altText(l.item_id, l.qty)}</div> : null}
              </td>
              {withPrice && (
                <td style={{ width: 120 }}>
                  <Input disabled={readOnly} type="number" min="0" step="any" value={l.price} onChange={(v) => set(i, { price: v })} />
                </td>
              )}
              {withPrice && <td className="num">{money((l.qty || 0) * (l.price || 0))}</td>}
              <td style={{ width: 40 }}>
                {!readOnly && (
                  <button className="btn sm ghost danger" onClick={() => onChange(lines.filter((_, j) => j !== i))} aria-label="刪除此列">
                    ✕
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && (
        <button className="btn sm" style={{ marginTop: 8 }} onClick={() => onChange([...lines, { item_id: '', qty: '', price: '' }])}>
          ＋ 新增一列
        </button>
      )}
    </div>
  )
}

// 權限
export const useCan = (mod, lvl = 1) => can(mod, lvl)
export function NoAccess({ mod }) {
  return (
    <div className="card empty">
      🔒 你沒有「{mod}」的權限。需要的話請管理者到「使用者與權限」調整。
    </div>
  )
}

// 單據連結：任何畫面都能點過去看關聯單據
const DOC_ROUTES = {
  sales_orders: (r) => `/sales?open=${r.id}`,
  purchase_orders: (r) => `/purchase?open=${r.id}`,
  work_orders: (r) => `/production?open=${r.id}`,
  shipments: (r) => `/shipping?open=${r.id}`,
  invoices: () => `/accounting?tab=ar`,
  bills: () => `/accounting?tab=ap`,
  quotations: (r) => `/quotes?open=${r.id}`,
  customers: (r) => `/customers/${r.id}`,
  returns: () => `/returns`,
  lots: (r) => `/trace?lot=${r.lot_no}`,
  pos_sales: () => `/pos-sales`,
  transfers: () => `/wms?tab=transfers`,
  stocktakes: (r) => `/wms?tab=stocktake&open=${r.id}`,
  approvals: () => `/approvals`,
  opportunities: () => `/crm?tab=pipeline`,
}
export function DocLink({ t, id, row, children }) {
  const r = row || get(t, id)
  if (!r) return <span className="muted">—</span>
  const to = DOC_ROUTES[t]?.(r)
  const label = children ?? (r.no || r.lot_no || r.name || r.title)
  return to ? (
    <Link className="doc-link" to={to} onClick={(e) => e.stopPropagation()}>
      {label}
    </Link>
  ) : (
    <span>{label}</span>
  )
}
export const LotLink = ({ no }) => (no ? <DocLink t="lots" row={lotByNo(no) || { lot_no: no }} /> : <span className="muted">—</span>)

// 主檔通用維護頁
// fields: [{ k, label, type?, options?, span? }]
export function CrudPage({ title, rows, fields, columns, defaults = {}, onSave, onDelete, editable = true, searchKeys = ['code', 'name'], extra }) {
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null)
  const list = rows.filter((r) => matches(q, ...searchKeys.map((k) => r[k])))
  const save = () => {
    const { id, created_at, updated_at, ...data } = editing
    if (attempt(() => onSave(data, id), '已儲存')) setEditing(null)
  }
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">{title}</h1>
        <Search value={q} onChange={setQ} />
        {extra}
        {editable && (
          <button className="btn primary" onClick={() => setEditing({ ...defaults })}>
            ＋ 新增
          </button>
        )}
      </div>
      <div className="card">
        <Table columns={columns} rows={list} onRow={(r) => setEditing(JSON.parse(JSON.stringify(r)))} />
      </div>
      {editing && (
        <Modal
          title={(editing.id ? '編輯' : '新增') + title}
          onClose={() => setEditing(null)}
          footer={
            editable ? (
              <>
                {editing.id && onDelete && (
                  <button
                    className="btn danger"
                    onClick={async () => {
                      if (await ask('確定刪除？', { danger: true, confirmText: '刪除' })) if (attempt(() => onDelete(editing.id), '已刪除')) setEditing(null)
                    }}
                  >
                    刪除
                  </button>
                )}
                <span style={{ flex: 1 }} />
                <button className="btn" onClick={() => setEditing(null)}>
                  取消
                </button>
                <button className="btn primary" onClick={save}>
                  儲存
                </button>
              </>
            ) : (
              <button className="btn" onClick={() => setEditing(null)}>
                關閉
              </button>
            )
          }
        >
          <div className="form-grid">
            {fields.map((f) => (
              <Field key={f.k} label={f.label} span={f.span} hint={f.hint}>
                {f.options ? (
                  <Select disabled={!editable} value={editing[f.k]} options={typeof f.options === 'function' ? f.options() : f.options} onChange={(v) => setEditing({ ...editing, [f.k]: v })} />
                ) : f.type === 'textarea' ? (
                  <textarea disabled={!editable} className="input" value={editing[f.k] ?? ''} onChange={(e) => setEditing({ ...editing, [f.k]: e.target.value })} />
                ) : f.type === 'checkbox' ? (
                  <Check checked={editing[f.k]} onChange={(v) => setEditing({ ...editing, [f.k]: v })} label={f.checkLabel || '是'} />
                ) : (
                  <Input disabled={!editable} type={f.type} value={editing[f.k]} onChange={(v) => setEditing({ ...editing, [f.k]: v })} />
                )}
              </Field>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

export { findBy }
