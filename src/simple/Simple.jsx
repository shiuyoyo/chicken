// 簡易模式：給現場人員用的大按鈕介面。
// 一排一個大框框；數量可切換「點擊計數」（點一下 +1）或「直接輸入」，
// 有包裝單位的品項（例如 1 箱 = 12 kg）可以直接用箱數計。
import { useState } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import { all, get, where, getPref, setPref, currentUser } from '../db/store'
import * as L from '../logic'
import { attempt, itemName, itemUnit, partyName, qty, toast } from '../ui'

export default function Simple() {
  return (
    <div className="simple">
      <Routes>
        <Route path="/" element={<Home />} />
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

const TILES = [
  ['receive', 'tile-1', '📥', '進貨', '廠商送貨來，點收入庫', () => L.can('purchase', 2) || L.can('wms', 2)],
  ['material', 'tile-2', '🥣', '領料 / 投料', '從倉庫領料、放料下鍋', () => L.can('production', 2)],
  ['output', 'tile-3', '🍲', '生產產出', '煮好包好了幾包', () => L.can('production', 2)],
  ['ship', 'tile-4', '🚚', '出貨', '出幾包、幾箱給客戶', () => L.can('shipping', 2)],
]

function Home() {
  const nav = useNavigate()
  const style = getPref('simpleInput', 'tap')
  const me = currentUser()
  const tiles = TILES.filter((t) => t[5]())
  return (
    <>
      <div className="simple-top">
        <h1>🐔 現場作業</h1>
        <span className="simple-user">{me.name}</span>
        <button onClick={L.logout}>換人</button>
      </div>
      <div className="simple-body">
        {tiles.length === 0 && !L.can('qc', 2) && !L.can('pos', 2) && <div className="hint" style={{ fontSize: 18 }}>你的角色沒有現場作業權限。</div>}
        {tiles.map(([to, cls, emoji, t, sub]) => (
          <button key={to} className={'big-tile ' + cls} onClick={() => nav('/simple/' + to)}>
            <span className="emoji" aria-hidden="true">{emoji}</span>
            <span>{t}<span className="sub">{sub}</span></span>
          </button>
        ))}
        {L.can('qc', 2) && (
          <button className="big-tile tile-5 short" onClick={() => nav('/simple/qc')}>
            <span className="emoji" aria-hidden="true">🔬</span><span>品管抽檢</span>
          </button>
        )}
        {L.can('pos', 2) && (
          <button className="big-tile tile-6 short" onClick={() => nav('/pos')}>
            <span className="emoji" aria-hidden="true">🛍️</span><span>門市收銀</span>
          </button>
        )}
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
// value 一律是基本單位（kg、包…）；有包裝單位時可以切換用「箱」計
function Counter({ itemId, name, hint, unit, value, onChange }) {
  const style = getPref('simpleInput', 'tap')
  const item = itemId ? get('items', itemId) : null
  const [useAlt, setUseAlt] = useState(false)
  const f = useAlt && item?.alt_factor ? Number(item.alt_factor) : 1
  const u = useAlt ? item.alt_unit : unit || item?.unit
  const v = Number(value) || 0
  const shown = L.round(v / f, 3)
  const set = (n) => onChange(Math.max(0, L.round(n * f, 3)))
  return (
    <div className={'counter' + (v > 0 ? ' has' : '')}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div className="name">{name || item?.name}</div>
          {hint && <div className="hint">{hint}</div>}
        </div>
        {item?.alt_unit && item.alt_factor > 0 && (
          <div className="unit-switch">
            <button className={!useAlt ? 'on' : ''} onClick={() => setUseAlt(false)}>{item.unit}</button>
            <button className={useAlt ? 'on' : ''} onClick={() => setUseAlt(true)}>{item.alt_unit}</button>
          </div>
        )}
      </div>
      {style === 'tap' ? (
        <>
          <button className="tap" onClick={() => set(shown + 1)} aria-label={`${name || item?.name} 加 1 ${u}`}>
            {qty(shown)}<small>{u}</small>
          </button>
          <div className="ctl">
            <button onClick={() => set(shown - 1)}>−1</button>
            <button onClick={() => set(shown + 5)}>+5</button>
            <button onClick={() => set(shown + 10)}>+10</button>
            <button onClick={() => set(0)}>清0</button>
          </div>
        </>
      ) : (
        <input className="big-input" type="number" inputMode="decimal" min="0" placeholder={`0 ${u || ''}`} value={shown === 0 ? '' : shown} onChange={(e) => set(e.target.value === '' ? 0 : Number(e.target.value))} aria-label={`${name || item?.name} 數量（${u}）`} />
      )}
      {useAlt && v > 0 && <div className="hint" style={{ marginTop: 6 }}>= {qty(v)} {item.unit}</div>}
    </div>
  )
}

function Pick({ title, sub, onClick, badge }) {
  return (
    <button className="pick" onClick={onClick}>
      <b>{title}{badge && <span className="badge warn" style={{ marginLeft: 8, fontSize: 14 }}>{badge}</span>}</b>
      {sub && <span>{sub}</span>}
    </button>
  )
}

function Submit({ label, disabled, onClick }) {
  return (
    <div className="simple-submit">
      <button disabled={disabled} onClick={onClick}>{label}</button>
    </div>
  )
}

function Done({ title, lines, again }) {
  const nav = useNavigate()
  return (
    <div className="simple-body done-screen">
      <div className="ok" aria-hidden="true">✅</div>
      <h2>{title}</h2>
      {lines.map((l, i) => <div key={i} style={{ fontSize: 20 }}>{l}</div>)}
      <div className="stack" style={{ marginTop: 30 }}>
        <button className="big-btn primary" onClick={again}>再做一筆</button>
        <button className="big-btn" onClick={() => nav('/simple')}>回首頁</button>
      </div>
    </div>
  )
}

const summary = (counts) => Object.entries(counts).filter(([, v]) => v > 0).map(([id, v]) => `${itemName(id)}　${qty(v, itemUnit(id))}`)

// ---------- 進貨 ----------
function ReceiveFlow() {
  const [po, setPo] = useState(null)
  const [supplier, setSupplier] = useState('')
  const [counts, setCounts] = useState({})
  const [done, setDone] = useState(null)
  const reset = () => (setPo(null), setSupplier(''), setCounts({}), setDone(null))
  const openPOs = all('purchase_orders').filter((p) => ['open', 'partial', 'pending'].includes(L.poStatus(p)))

  if (done) return <><Top title="進貨" /><Done title="進貨完成" lines={done} again={reset} /></>
  if (!po)
    return (
      <>
        <Top title="進貨：選採購單" />
        <div className="simple-body">
          {openPOs.length === 0 && <div className="hint" style={{ fontSize: 18 }}>目前沒有待到貨的採購單</div>}
          {openPOs.map((p) => (
            <Pick key={p.id} title={partyName('suppliers', p.supplier_id)} badge={L.poStatus(p) === 'pending' ? '待核准' : ''}
              sub={`${p.no}｜${p.lines.map((l) => itemName(l.item_id)).join('、')}`}
              onClick={() => (L.poStatus(p) === 'pending' ? toast('這張採購單還在等主管核准，不能進貨', 'bad') : setPo(p.id))} />
          ))}
          <Pick title="➕ 沒有採購單，直接進貨" onClick={() => setPo('none')} />
        </div>
      </>
    )
  if (po === 'none' && !supplier)
    return (
      <>
        <Top title="進貨：選廠商" onBack={() => setPo(null)} />
        <div className="simple-body">{all('suppliers').map((s) => <Pick key={s.id} title={s.name} sub={s.phone} onClick={() => setSupplier(s.id)} />)}</div>
      </>
    )
  const p = get('purchase_orders', po)
  const rows = p
    ? p.lines.filter((l) => l.qty > (l.received || 0)).map((l) => ({ id: l.item_id, hint: `訂 ${qty(l.qty)}，已收 ${qty(l.received || 0)}，還差 ${qty(L.round(l.qty - (l.received || 0), 3))}` }))
    : all('items').filter((i) => i.type !== 'product' && i.active !== false).map((i) => ({ id: i.id, hint: `可用庫存 ${qty(L.stockOf(i.id))}` }))
  const any = Object.values(counts).some((v) => v > 0)
  return (
    <>
      <Top title={`進貨 ${partyName('suppliers', p?.supplier_id || supplier)}`} onBack={() => (p ? setPo(null) : setSupplier(''))} />
      <div className="simple-body">
        {rows.map((r) => (
          <Counter key={r.id} itemId={r.id} hint={`${r.hint}｜放 ${L.binLabel(get('items', r.id)?.default_bin_id)}${get('items', r.id)?.iqc_required ? '｜需品管檢驗' : ''}`} value={counts[r.id] || 0} onChange={(v) => setCounts({ ...counts, [r.id]: v })} />
        ))}
      </div>
      <Submit label="✓ 確認進貨" disabled={!any} onClick={() => {
        const lines = Object.entries(counts).map(([item_id, q]) => ({ item_id, qty: q }))
        const r = attempt(() => L.receiveGoods({ purchase_order_id: p?.id, supplier_id: p?.supplier_id || supplier, lines }))
        if (r) setDone([...summary(counts), `批號 ${r.lots.map((l) => l.lot_no).join('、')}`, ...(r.lots.some((l) => l.qc_status === 'pending') ? ['⚠ 需品管檢驗合格才能領用'] : [])])
      }} />
    </>
  )
}

function PickWO({ title, filter, onPick }) {
  const wos = L.activeWorkOrders().filter(filter).sort((a, b) => String(a.plan_date).localeCompare(String(b.plan_date)))
  return (
    <>
      <Top title={title} />
      <div className="simple-body">
        {wos.length === 0 && <div style={{ fontSize: 18 }} className="hint">沒有可以操作的工單，請主管先開工單</div>}
        {wos.map((w) => (
          <Pick key={w.id} title={`${itemName(w.product_id)}　${qty(w.plan_qty, itemUnit(w.product_id))}`}
            sub={`${w.plan_date} ${w.line}｜${w.sales_order_id ? partyName('customers', get('sales_orders', w.sales_order_id)?.customer_id) : '備貨'}｜${L.WO_STATUS[w.status]}`}
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
  const fill = () => setCounts(Object.fromEntries(L.woNeeds(w).map((n) => [n.item_id, Math.max(0, L.round(n.qty - (mode === 'issue' ? L.woIssued(w, n.item_id) - L.woReturned(w, n.item_id) : L.woFed(w, n.item_id)), 3))])))
  return (
    <>
      <Top title={`${itemName(w.product_id)} ${w.plan_qty}`} onBack={() => (setWo(null), setCounts({}))} />
      <div className="simple-body">
        <div className="seg">
          <button className={mode === 'issue' ? 'on' : ''} onClick={() => (setMode('issue'), setCounts({}))}>📦 領料</button>
          <button className={mode === 'feed' ? 'on' : ''} onClick={() => (setMode('feed'), setCounts({}))}>🥘 投料下鍋</button>
        </div>
        <button className="big-btn" onClick={fill}>帶入還需要的量</button>
        {L.woNeeds(w).map((n) => {
          const did = mode === 'issue' ? L.woIssued(w, n.item_id) - L.woReturned(w, n.item_id) : L.woFed(w, n.item_id)
          return (
            <Counter key={n.item_id} itemId={n.item_id} value={counts[n.item_id] || 0}
              hint={`要 ${qty(n.qty)}，已${mode === 'issue' ? '領' : '投'} ${qty(did)}${mode === 'issue' ? `｜倉庫可用 ${qty(L.stockOf(n.item_id))}` : `｜產線上 ${qty(L.lineStock(n.item_id))}`}`}
              onChange={(v) => setCounts({ ...counts, [n.item_id]: v })} />
          )
        })}
        <div className="hint" style={{ fontSize: 16 }}>系統自動挑「最早到期」的合格批號並記錄下來。</div>
      </div>
      <Submit label={mode === 'issue' ? '✓ 確認領料' : '✓ 確認投料'} disabled={!any} onClick={() => {
        const lines = Object.entries(counts).map(([item_id, q]) => ({ item_id, qty: q }))
        if (attempt(() => (mode === 'issue' ? L.issueMaterials : L.feedMaterials)(w.id, lines))) setDone(summary(counts))
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
        <Counter itemId={w.product_id} name={`做好幾${unit}？`} hint={`計畫 ${qty(w.plan_qty)}，已產出 ${qty(w.output_qty)}｜批號 ${w.lot_no}`} value={n} onChange={setN} />
        <Counter name="損耗（kg）" unit="kg" hint="不良、掉落、試吃等，沒有就跳過" value={waste} onChange={setWaste} />
        <div className="hint" style={{ fontSize: 17 }}>入庫後要等品管抽檢合格才能出貨。</div>
      </div>
      <Submit label="✓ 確認產出" disabled={!(n > 0)} onClick={() => {
        const lot = attempt(() => L.recordOutput(w.id, { qty: n, waste }))
        if (lot) setDone([`${itemName(w.product_id)}　${qty(n, unit)}`, `批號 ${lot.lot_no}`, `放 ${L.binLabel(get('items', w.product_id)?.default_bin_id)}`])
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
  const open = all('sales_orders').filter((s) => s.status === 'confirmed').sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
  if (!so)
    return (
      <>
        <Top title="出貨：選訂單" />
        <div className="simple-body">
          {open.length === 0 && <div className="hint" style={{ fontSize: 18 }}>沒有待出貨的訂單</div>}
          {open.map((s) => <Pick key={s.id} title={partyName('customers', s.customer_id)} sub={`${s.no}｜交期 ${s.due_date}｜${s.lines.map((l) => `${itemName(l.item_id)}×${l.qty}`).join('、')}`} onClick={() => setSo(s.id)} />)}
        </div>
      </>
    )
  const o = get('sales_orders', so)
  const cust = get('customers', o.customer_id)
  const lines = Object.entries(counts).filter(([, v]) => v > 0).map(([item_id, q]) => ({ item_id, qty: q }))
  const auto = L.autoBoxes(lines)
  let pick = []
  try {
    pick = L.pickList(o.id, lines)
  } catch {}
  return (
    <>
      <Top title={`出貨 ${cust?.name}`} onBack={() => setSo(null)} />
      <div className="simple-body">
        {o.lines.map((l) => {
          const avail = L.sum(L.stockRows({ item_id: l.item_id, kinds: ['storage'] }).filter((r) => { const x = L.lotByNo(r.lot_no); return x?.qc_status === 'pass' && !L.isExpired(x) && L.daysLeft(x) >= (cust?.min_shelf_days || 0) }), (r) => r.qty)
          return (
            <Counter key={l.item_id} itemId={l.item_id} value={counts[l.item_id] || 0}
              hint={`還要出 ${qty(L.remainingToShip(o, l.item_id))}｜可出 ${qty(avail)}`} onChange={(v) => setCounts({ ...counts, [l.item_id]: v })} />
          )
        })}
        {pick.length > 0 && (
          <div className="counter">
            <div className="name">去哪裡拿</div>
            {pick.map((a, i) => <div key={i} style={{ fontSize: 19 }}>📍 {L.binLabel(a.bin_id)}　{itemName(a.item_id)} {qty(a.qty)}（{a.lot_no}）</div>)}
          </div>
        )}
        <Counter name="幾箱？" unit="箱" hint={`不填就自動算：${auto} 箱`} value={boxes} onChange={setBoxes} />
        <div style={{ fontSize: 18, fontWeight: 700 }}>怎麼出？</div>
        <div className="seg" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {L.PACK_MODES.map((p) => <button key={p} className={pack === p ? 'on' : ''} onClick={() => setPack(p)} style={{ fontSize: 17 }}>{p}</button>)}
        </div>
      </div>
      <Submit label={`✓ 確認出貨（${boxes || auto} 箱）`} disabled={!lines.length} onClick={() => {
        if (attempt(() => L.shipGoods({ sales_order_id: o.id, lines, boxes: boxes || auto, pack_mode: pack }))) setDone([...summary(counts), `${boxes || auto} 箱｜${pack}`])
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
          {lots.map((l) => <Pick key={l.id} title={`${itemName(l.item_id)}　${qty(l.qty, itemUnit(l.item_id))}`} sub={`${l.kind === 'raw' ? '進料' : '成品'}｜批號 ${l.lot_no}｜${l.kind === 'raw' ? partyName('suppliers', l.supplier_id) : '製造 ' + l.mfg_date}`} onClick={() => setLotId(l.id)} />)}
        </div>
      </>
    )
  const lot = get('lots', lotId)
  const checks = lot.kind === 'raw' ? L.IQC_CHECKS : L.DEFAULT_CHECKS
  const judge = (result) => {
    const r = attempt(() => L.saveInspection({ lot_no: lot.lot_no, sample_size: lot.kind === 'raw' ? 3 : 5, defect_qty: result === 'pass' ? 0 : 1, checks: checks.map((c) => ({ ...c, value: '', pass: result === 'pass' })), result, note: '簡易模式判定' }))
    if (r) setDone(r.pending ? '已送主管核准' : result === 'pass' ? '判定合格' : '判定不合格，已管制')
  }
  return (
    <>
      <Top title={`抽檢 ${lot.lot_no}`} onBack={() => setLotId(null)} />
      <div className="simple-body">
        <div className="counter">
          <div className="name">{itemName(lot.item_id)}　{qty(lot.qty, itemUnit(lot.item_id))}</div>
          <div className="hint">請依序確認：</div>
          <ul style={{ fontSize: 19, margin: '8px 0 0', paddingLeft: 24 }}>{checks.map((c) => <li key={c.name}>{c.name}：{c.standard}</li>)}</ul>
        </div>
        <button className="big-btn ok" style={{ minHeight: 110, fontSize: 34 }} onClick={() => judge('pass')}>✓ 全部合格</button>
        <button className="big-btn bad" style={{ minHeight: 90, fontSize: 28 }} onClick={() => judge('fail')}>✕ 不合格</button>
      </div>
    </>
  )
}
