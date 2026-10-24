// 簡易模式：給現場人員用的大按鈕介面。
// 一排一個大框框；可切換「點擊計數」（點一下 +1）或「直接輸入」數字。
import { useState } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { all, get, where, getPref, setPref } from '../db/store'
import {
  receiveGoods, issueMaterials, feedMaterials, recordOutput, shipGoods, saveInspection, poStatus,
  woNeeds, woIssued, woFed, stockOf, shippableLots, lotStock, shippedQty, autoBoxes, PACK_MODES, DEFAULT_CHECKS, WO_STATUS, round,
} from '../logic'
import { attempt, itemName, itemUnit, partyName, qty } from '../ui'

export default function Simple({ UserPicker }) {
  return (
    <div className="simple">
      <Routes>
        <Route path="/" element={<Home UserPicker={UserPicker} />} />
        <Route path="/receive" element={<ReceiveFlow />} />
        <Route path="/material" element={<MaterialFlow />} />
        <Route path="/output" element={<OutputFlow />} />
        <Route path="/ship" element={<ShipFlow />} />
        <Route path="/qc" element={<QCFlow />} />
      </Routes>
    </div>
  )
}

function Top({ title, onBack }) {
  const nav = useNavigate()
  return (
    <div className="simple-top">
      <button onClick={onBack || (() => nav('/simple'))} aria-label="返回">← 返回</button>
      <h1>{title}</h1>
    </div>
  )
}

function Home({ UserPicker }) {
  const nav = useNavigate()
  const style = getPref('simpleInput', 'tap')
  const tiles = [
    ['receive', 'tile-1', '📥', '進貨', '廠商送貨來，點收入庫'],
    ['material', 'tile-2', '🥣', '領料 / 投料', '從倉庫領料、放料下鍋'],
    ['output', 'tile-3', '🍲', '生產產出', '煮好包好了幾包'],
    ['ship', 'tile-4', '🚚', '出貨', '出幾包、幾箱給客戶'],
  ]
  return (
    <>
      <div className="simple-top">
        <h1>🐔 現場作業</h1>
        <UserPicker className="" />
      </div>
      <div className="simple-body">
        {tiles.map(([to, cls, emoji, t, sub]) => (
          <button key={to} className={'big-tile ' + cls} onClick={() => nav('/simple/' + to)}>
            <span className="emoji">{emoji}</span>
            <span>
              {t}
              <span className="sub">{sub}</span>
            </span>
          </button>
        ))}
        <button className="big-tile tile-5" style={{ minHeight: 84, fontSize: 24 }} onClick={() => nav('/simple/qc')}>
          <span className="emoji" style={{ fontSize: 38 }}>🔬</span>
          <span>品管抽檢</span>
        </button>
        <div style={{ fontSize: 17, fontWeight: 700, marginTop: 8 }}>數量輸入方式</div>
        <div className="seg">
          <button className={style === 'tap' ? 'on' : ''} onClick={() => setPref('simpleInput', 'tap')}>👆 點擊計數</button>
          <button className={style === 'type' ? 'on' : ''} onClick={() => setPref('simpleInput', 'type')}>⌨️ 直接輸入</button>
        </div>
        <button className="big-btn" style={{ marginTop: 12 }} onClick={() => nav('/')}>切換到標準模式</button>
      </div>
    </>
  )
}

// ---------- 共用元件 ----------
function Counter({ name, hint, unit, value, onChange }) {
  const style = getPref('simpleInput', 'tap')
  const v = Number(value) || 0
  const set = (n) => onChange(Math.max(0, round(n, 3)))
  return (
    <div className={'counter' + (v > 0 ? ' has' : '')}>
      <div className="name">{name}</div>
      {hint && <div className="hint">{hint}</div>}
      {style === 'tap' ? (
        <>
          <button className="tap" onClick={() => set(v + 1)} aria-label={`${name} 加 1`}>
            {qty(v)}
            <small>{unit}</small>
          </button>
          <div className="ctl">
            <button onClick={() => set(v - 1)}>−1</button>
            <button onClick={() => set(v + 5)}>+5</button>
            <button onClick={() => set(v + 10)}>+10</button>
            <button onClick={() => set(0)}>清0</button>
          </div>
        </>
      ) : (
        <input
          className="big-input"
          type="number"
          inputMode="decimal"
          min="0"
          placeholder={`0 ${unit || ''}`}
          value={value === 0 ? '' : value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        />
      )}
    </div>
  )
}

function Pick({ title, sub, onClick }) {
  return (
    <button className="pick" onClick={onClick}>
      <b>{title}</b>
      {sub && <span>{sub}</span>}
    </button>
  )
}

function Submit({ label, disabled, onClick }) {
  return (
    <div className="simple-submit">
      <button disabled={disabled} onClick={onClick}>
        {label}
      </button>
    </div>
  )
}

function Done({ title, lines, again }) {
  const nav = useNavigate()
  return (
    <div className="simple-body done-screen">
      <div className="ok">✅</div>
      <h2>{title}</h2>
      {lines.map((l, i) => (
        <div key={i} style={{ fontSize: 20 }}>
          {l}
        </div>
      ))}
      <div className="stack" style={{ marginTop: 30 }}>
        <button className="big-btn primary" onClick={again}>
          再做一筆
        </button>
        <button className="big-btn" onClick={() => nav('/simple')}>
          回首頁
        </button>
      </div>
    </div>
  )
}

const summary = (counts) =>
  Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([id, v]) => `${itemName(id)}　${qty(v, itemUnit(id))}`)

// ---------- 進貨 ----------
function ReceiveFlow() {
  const [po, setPo] = useState(null) // 採購單 id 或 'none'
  const [supplier, setSupplier] = useState('')
  const [counts, setCounts] = useState({})
  const [done, setDone] = useState(null)
  const reset = () => (setPo(null), setSupplier(''), setCounts({}), setDone(null))
  const openPOs = all('purchase_orders').filter((p) => ['open', 'partial'].includes(poStatus(p)))

  if (done) return <><Top title="進貨" /><Done title="進貨完成" lines={done} again={reset} /></>
  if (!po)
    return (
      <>
        <Top title="進貨：選採購單" />
        <div className="simple-body">
          {openPOs.length === 0 && <div className="hint" style={{ fontSize: 18 }}>目前沒有待到貨的採購單</div>}
          {openPOs.map((p) => (
            <Pick key={p.id} title={partyName('suppliers', p.supplier_id)} sub={`${p.no}｜${p.lines.map((l) => itemName(l.item_id)).join('、')}`} onClick={() => setPo(p.id)} />
          ))}
          <Pick title="➕ 沒有採購單，直接進貨" onClick={() => setPo('none')} />
        </div>
      </>
    )
  if (po === 'none' && !supplier)
    return (
      <>
        <Top title="進貨：選廠商" onBack={() => setPo(null)} />
        <div className="simple-body">
          {all('suppliers').map((s) => <Pick key={s.id} title={s.name} sub={s.phone} onClick={() => setSupplier(s.id)} />)}
        </div>
      </>
    )
  const p = get('purchase_orders', po)
  const rows = p ? p.lines.map((l) => ({ id: l.item_id, hint: `訂 ${qty(l.qty)}，已收 ${qty(l.received || 0)}，還差 ${qty(Math.max(0, l.qty - (l.received || 0)))}` })) : all('items').filter((i) => i.type !== 'product' && i.active !== false).map((i) => ({ id: i.id, hint: `庫存 ${qty(stockOf(i.id))}` }))
  const any = Object.values(counts).some((v) => v > 0)
  return (
    <>
      <Top title={p ? `進貨 ${partyName('suppliers', p.supplier_id)}` : `進貨 ${partyName('suppliers', supplier)}`} onBack={() => (p ? setPo(null) : setSupplier(''))} />
      <div className="simple-body">
        {rows.map((r) => (
          <Counter key={r.id} name={itemName(r.id)} hint={r.hint} unit={itemUnit(r.id)} value={counts[r.id] || 0} onChange={(v) => setCounts({ ...counts, [r.id]: v })} />
        ))}
      </div>
      <Submit label="✓ 確認進貨" disabled={!any} onClick={() => {
        const lines = Object.entries(counts).map(([item_id, q]) => ({ item_id, qty: q }))
        if (attempt(() => receiveGoods({ purchase_order_id: p?.id, supplier_id: p?.supplier_id || supplier, lines }))) setDone(summary(counts))
      }} />
    </>
  )
}

// ---------- 選工單 ----------
function PickWO({ title, filter, onPick }) {
  const wos = all('work_orders').filter((w) => w.status !== 'closed' && filter(w))
  return (
    <>
      <Top title={title} />
      <div className="simple-body">
        {wos.length === 0 && <div style={{ fontSize: 18 }} className="hint">沒有可以操作的工單，請先在標準模式開工單</div>}
        {wos.map((w) => (
          <Pick key={w.id} title={`${itemName(w.product_id)}　${qty(w.plan_qty, itemUnit(w.product_id))}`}
            sub={`${w.no}｜${get('sales_orders', w.sales_order_id) ? partyName('customers', get('sales_orders', w.sales_order_id).customer_id) : '備貨'}｜${WO_STATUS[w.status]}`}
            onClick={() => onPick(w.id)} />
        ))}
      </div>
    </>
  )
}

// ---------- 領料 / 投料 ----------
function MaterialFlow() {
  const [wo, setWo] = useState(null)
  const [mode, setMode] = useState('issue')
  const [counts, setCounts] = useState({})
  const [done, setDone] = useState(null)
  if (done) return <><Top title="領料 / 投料" /><Done title={mode === 'issue' ? '領料完成' : '投料已記錄'} lines={done} again={() => (setCounts({}), setDone(null))} /></>
  if (!wo) return <PickWO title="領料 / 投料：選工單" filter={(w) => ['planned', 'issued', 'cooking', 'done'].includes(w.status)} onPick={setWo} />
  const w = get('work_orders', wo)
  const any = Object.values(counts).some((v) => v > 0)
  return (
    <>
      <Top title={`${itemName(w.product_id)} ${w.plan_qty}`} onBack={() => (setWo(null), setCounts({}))} />
      <div className="simple-body">
        <div className="seg">
          <button className={mode === 'issue' ? 'on' : ''} onClick={() => (setMode('issue'), setCounts({}))}>📦 領料</button>
          <button className={mode === 'feed' ? 'on' : ''} onClick={() => (setMode('feed'), setCounts({}))}>🥘 投料下鍋</button>
        </div>
        {woNeeds(w).map((n) => {
          const done = mode === 'issue' ? woIssued(w, n.item_id) : woFed(w, n.item_id)
          return (
            <Counter key={n.item_id} name={itemName(n.item_id)} unit={itemUnit(n.item_id)} value={counts[n.item_id] || 0}
              hint={`要 ${qty(n.qty)}，已${mode === 'issue' ? '領' : '投'} ${qty(done)}${mode === 'issue' ? `｜倉庫 ${qty(stockOf(n.item_id))}` : `｜產線上 ${qty(stockOf(n.item_id, 'WIP'))}`}`}
              onChange={(v) => setCounts({ ...counts, [n.item_id]: v })} />
          )
        })}
      </div>
      <Submit label={mode === 'issue' ? '✓ 確認領料' : '✓ 確認投料'} disabled={!any} onClick={() => {
        const lines = Object.entries(counts).map(([item_id, q]) => ({ item_id, qty: q }))
        if (attempt(() => (mode === 'issue' ? issueMaterials : feedMaterials)(w.id, lines))) setDone(summary(counts))
      }} />
    </>
  )
}

// ---------- 生產產出 ----------
function OutputFlow() {
  const [wo, setWo] = useState(null)
  const [n, setN] = useState(0)
  const [waste, setWaste] = useState(0)
  const [done, setDone] = useState(null)
  if (done) return <><Top title="生產產出" /><Done title="產出已入庫" lines={done} again={() => (setN(0), setWaste(0), setDone(null))} /></>
  if (!wo) return <PickWO title="產出：選工單" filter={(w) => w.status !== 'planned'} onPick={setWo} />
  const w = get('work_orders', wo)
  const unit = itemUnit(w.product_id)
  return (
    <>
      <Top title={`${itemName(w.product_id)} 產出`} onBack={() => setWo(null)} />
      <div className="simple-body">
        <Counter name={`做好幾${unit}？`} hint={`計畫 ${qty(w.plan_qty)}，已產出 ${qty(w.output_qty)}｜批號 ${w.lot_no}`} unit={unit} value={n} onChange={setN} />
        <Counter name="損耗（kg）" hint="不良、掉落、試吃等，沒有就跳過" unit="kg" value={waste} onChange={setWaste} />
        <div className="hint" style={{ fontSize: 17 }}>入庫後要等品管抽檢合格才能出貨。</div>
      </div>
      <Submit label="✓ 確認產出" disabled={!(n > 0)} onClick={() => {
        if (attempt(() => recordOutput(w.id, { qty: n, waste }))) setDone([`${itemName(w.product_id)}　${qty(n, unit)}`, `批號 ${w.lot_no}`])
      }} />
    </>
  )
}

// ---------- 出貨 ----------
function ShipFlow() {
  const [so, setSo] = useState(null)
  const [counts, setCounts] = useState({})
  const [boxes, setBoxes] = useState(0)
  const [pack, setPack] = useState('紙箱')
  const [done, setDone] = useState(null)
  const reset = () => (setSo(null), setCounts({}), setBoxes(0), setDone(null))
  if (done) return <><Top title="出貨" /><Done title="已出貨" lines={done} again={reset} /></>
  const open = all('sales_orders').filter((s) => s.status !== 'cancelled' && s.lines.some((l) => shippedQty(s.id, l.item_id) < l.qty))
  if (!so)
    return (
      <>
        <Top title="出貨：選訂單" />
        <div className="simple-body">
          {open.length === 0 && <div className="hint" style={{ fontSize: 18 }}>沒有待出貨的訂單</div>}
          {open.map((s) => (
            <Pick key={s.id} title={partyName('customers', s.customer_id)} sub={`${s.no}｜交期 ${s.due_date}｜${s.lines.map((l) => `${itemName(l.item_id)}×${l.qty}`).join('、')}`} onClick={() => setSo(s.id)} />
          ))}
        </div>
      </>
    )
  const o = get('sales_orders', so)
  const lines = Object.entries(counts).filter(([, v]) => v > 0).map(([item_id, q]) => ({ item_id, qty: q }))
  const auto = autoBoxes(lines)
  return (
    <>
      <Top title={`出貨 ${partyName('customers', o.customer_id)}`} onBack={() => setSo(null)} />
      <div className="simple-body">
        {o.lines.map((l) => {
          const avail = shippableLots(l.item_id).reduce((s, lot) => s + lotStock(lot), 0)
          const left = l.qty - shippedQty(o.id, l.item_id)
          return (
            <Counter key={l.item_id} name={itemName(l.item_id)} unit={itemUnit(l.item_id)} value={counts[l.item_id] || 0}
              hint={`還要出 ${qty(left)}｜QC 合格可出 ${qty(avail)}`} onChange={(v) => setCounts({ ...counts, [l.item_id]: v })} />
          )
        })}
        <Counter name="幾箱？" hint={`不填就自動算：${auto} 箱`} unit="箱" value={boxes} onChange={setBoxes} />
        <div style={{ fontSize: 18, fontWeight: 700 }}>怎麼出？</div>
        <div className="seg" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {PACK_MODES.slice(0, 5).map((p) => (
            <button key={p} className={pack === p ? 'on' : ''} onClick={() => setPack(p)} style={{ fontSize: 17 }}>{p}</button>
          ))}
        </div>
      </div>
      <Submit label={`✓ 確認出貨（${boxes || auto} 箱）`} disabled={!lines.length} onClick={() => {
        if (attempt(() => shipGoods({ sales_order_id: o.id, lines, boxes: boxes || auto, pack_mode: pack })))
          setDone([...summary(counts), `${boxes || auto} 箱｜${pack}`])
      }} />
    </>
  )
}

// ---------- 品管抽檢 ----------
function QCFlow() {
  const [lotId, setLotId] = useState(null)
  const [done, setDone] = useState(null)
  if (done) return <><Top title="品管抽檢" /><Done title={done} lines={[]} again={() => (setLotId(null), setDone(null))} /></>
  const lots = where('lots', (l) => l.qc_status === 'pending')
  if (!lotId)
    return (
      <>
        <Top title="品管：選批號" />
        <div className="simple-body">
          {lots.length === 0 && <div className="hint" style={{ fontSize: 18 }}>沒有待檢批號 👍</div>}
          {lots.map((l) => <Pick key={l.id} title={`${itemName(l.item_id)}　${qty(l.qty, itemUnit(l.item_id))}`} sub={`批號 ${l.lot_no}｜製造 ${l.mfg_date}`} onClick={() => setLotId(l.id)} />)}
        </div>
      </>
    )
  const lot = get('lots', lotId)
  const judge = (result) =>
    attempt(() =>
      saveInspection({
        kind: 'FQC', lot_no: lot.lot_no, item_id: lot.item_id, work_order_id: lot.work_order_id, sample_size: 5, defect_qty: result === 'pass' ? 0 : 1,
        checks: DEFAULT_CHECKS.map((c) => ({ ...c, value: '', pass: result === 'pass' })), result, note: '簡易模式判定',
      }),
    ) && setDone(result === 'pass' ? '判定合格，可以出貨' : '判定不合格，已暫扣')
  return (
    <>
      <Top title={`抽檢 ${lot.lot_no}`} onBack={() => setLotId(null)} />
      <div className="simple-body">
        <div className="counter">
          <div className="name">{itemName(lot.item_id)}　{qty(lot.qty, itemUnit(lot.item_id))}</div>
          <div className="hint">請依序確認：</div>
          <ul style={{ fontSize: 19, margin: '8px 0 0', paddingLeft: 24 }}>
            {DEFAULT_CHECKS.map((c) => <li key={c.name}>{c.name}：{c.standard}</li>)}
          </ul>
        </div>
        <button className="big-btn ok" style={{ minHeight: 110, fontSize: 34 }} onClick={() => judge('pass')}>✓ 合格</button>
        <button className="big-btn bad" style={{ minHeight: 90, fontSize: 28 }} onClick={() => judge('fail')}>✕ 不合格</button>
      </div>
    </>
  )
}
