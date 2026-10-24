// 共用介面元件
import { useEffect, useState } from 'react'
import { all, get, insert, update, remove } from './db/store'

export const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString()
export const qty = (n, unit = '') => `${(Math.round((Number(n) || 0) * 1000) / 1000).toLocaleString()}${unit ? ' ' + unit : ''}`
export const dt = (s) => (s ? String(s).replace('T', ' ').slice(0, 16) : '')
export const itemName = (id) => get('items', id)?.name || '—'
export const itemUnit = (id) => get('items', id)?.unit || ''
export const partyName = (t, id) => get(t, id)?.name || '—'

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
      setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), 2800)
    }
    const onErr = (e) => pushToast({ msg: '雲端寫入失敗：' + e.detail, kind: 'bad', id: Math.random() })
    window.addEventListener('erp:backend-error', onErr)
    return () => window.removeEventListener('erp:backend-error', onErr)
  }, [])
  return (
    <div className="toast-wrap">
      {list.map((t) => (
        <div key={t.id} className={'toast ' + t.kind}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}

// 包住會丟錯誤的動作：成功顯示訊息，失敗顯示原因
export function attempt(fn, okMsg) {
  try {
    const r = fn()
    if (okMsg) toast(okMsg)
    return r ?? true
  } catch (e) {
    toast(e.message || String(e), 'bad')
    return false
  }
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

export function Field({ label, children, span }) {
  return (
    <label className="field" style={span ? { gridColumn: '1 / -1' } : undefined}>
      <span>{label}</span>
      {children}
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
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export const itemOptions = (types) =>
  all('items')
    .filter((i) => i.active !== false && (!types || types.includes(i.type)))
    .map((i) => ({ value: i.id, label: `${i.code} ${i.name}（${i.unit}）` }))
export const partyOptions = (t) => all(t).map((p) => ({ value: p.id, label: `${p.code} ${p.name}` }))

const BADGE = {
  // 共用狀態
  draft: ['草稿', ''], confirmed: ['已確認', 'info'], cancelled: ['已取消', 'bad'], closed: ['已結案', ''],
  open: ['未到貨', 'warn'], partial: ['部分', 'warn'], received: ['已到齊', 'ok'],
  planned: ['待領料', 'warn'], issued: ['已領料', 'info'], cooking: ['烹煮中', 'primary'], done: ['待 QC', 'warn'],
  qc_pass: ['QC 合格', 'ok'], qc_fail: ['QC 不合格', 'bad'],
  pending: ['待檢', 'warn'], pass: ['合格', 'ok'], fail: ['不合格', 'bad'], hold: ['暫扣', 'warn'],
  unpaid: ['未付', 'warn'], paid: ['已結清', 'ok'], shipped: ['已出貨', 'info'], delivered: ['已送達', 'ok'],
}
export function Badge({ s, children, kind }) {
  const [label, k] = BADGE[s] || [children ?? s, kind ?? '']
  return <span className={'badge ' + (kind ?? k)}>{children ?? label}</span>
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map(([k, label]) => (
        <button key={k} className={value === k ? 'active' : ''} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  )
}

export function Kpi({ label, value, sub }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}

// columns: [{ h: 標題, r: row => 內容, cls }]
export function Table({ columns, rows, onRow, empty = '沒有資料' }) {
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
      </table>
    </div>
  )
}

export function Search({ value, onChange, placeholder = '搜尋…' }) {
  return <input className="input" style={{ maxWidth: 260 }} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
}
export const matches = (q, ...fields) => !q || fields.some((f) => String(f ?? '').toLowerCase().includes(q.toLowerCase()))

// 單據明細編輯器：品項 + 數量 + 單價
export function LineEditor({ lines, onChange, types, withPrice = true, priceKey = 'price', defaultPrice }) {
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
                <Select
                  value={l.item_id}
                  options={itemOptions(types)}
                  onChange={(v) => set(i, { item_id: v, [priceKey]: defaultPrice ? defaultPrice(get('items', v)) : l[priceKey] })}
                />
              </td>
              <td style={{ width: 120 }}>
                <Input type="number" min="0" step="any" value={l.qty} onChange={(v) => set(i, { qty: v })} />
              </td>
              {withPrice && (
                <td style={{ width: 120 }}>
                  <Input type="number" min="0" step="any" value={l[priceKey]} onChange={(v) => set(i, { [priceKey]: v })} />
                </td>
              )}
              {withPrice && <td className="num">{money((l.qty || 0) * (l[priceKey] || 0))}</td>}
              <td style={{ width: 40 }}>
                <button className="btn sm ghost danger" onClick={() => onChange(lines.filter((_, j) => j !== i))} aria-label="刪除此列">
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn sm" style={{ marginTop: 8 }} onClick={() => onChange([...lines, { item_id: '', qty: '', [priceKey]: '' }])}>
        ＋ 新增一列
      </button>
    </div>
  )
}

// 主檔通用維護頁（客戶、供應商、使用者…）
// fields: [{ k, label, type?, options?, span? }]
export function CrudPage({ table, title, fields, columns, defaults = {}, searchKeys = ['code', 'name'], extraActions }) {
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null)
  const rows = all(table).filter((r) => matches(q, ...searchKeys.map((k) => r[k])))
  const save = () => {
    const { id, ...data } = editing
    if (id) update(table, id, data)
    else insert(table, data)
    toast('已儲存')
    setEditing(null)
  }
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">{title}</h1>
        <Search value={q} onChange={setQ} />
        <button className="btn primary" onClick={() => setEditing({ ...defaults })}>
          ＋ 新增
        </button>
      </div>
      <div className="card">
        <Table columns={columns} rows={rows} onRow={(r) => setEditing({ ...r })} />
      </div>
      {editing && (
        <Modal
          title={(editing.id ? '編輯' : '新增') + title}
          onClose={() => setEditing(null)}
          footer={
            <>
              {editing.id && (
                <button
                  className="btn danger"
                  onClick={() => {
                    if (confirm('確定刪除？')) {
                      remove(table, editing.id)
                      setEditing(null)
                    }
                  }}
                >
                  刪除
                </button>
              )}
              {extraActions?.(editing)}
              <span style={{ flex: 1 }} />
              <button className="btn" onClick={() => setEditing(null)}>
                取消
              </button>
              <button className="btn primary" onClick={save}>
                儲存
              </button>
            </>
          }
        >
          <div className="form-grid">
            {fields.map((f) => (
              <Field key={f.k} label={f.label} span={f.span}>
                {f.options ? (
                  <Select value={editing[f.k]} options={f.options} onChange={(v) => setEditing({ ...editing, [f.k]: v })} />
                ) : f.type === 'textarea' ? (
                  <textarea className="input" value={editing[f.k] ?? ''} onChange={(e) => setEditing({ ...editing, [f.k]: e.target.value })} />
                ) : (
                  <Input type={f.type} value={editing[f.k]} onChange={(v) => setEditing({ ...editing, [f.k]: v })} />
                )}
              </Field>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}
