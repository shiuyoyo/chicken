import { useState } from 'react'
import { all, get, where } from '../db/store'
import * as L from '../logic'
import {
  Modal, Field, Input, Select, Check, Table, Badge, Tabs, Search, matches, money, qty, dt, itemName, itemUnit, binOptions, itemOptions, attempt, ask, useTab, useOpen, LotLink, DocLink, altText, PrintButton } from '../ui'

export default function Wms() {
  const [tab, setTab] = useTab('stock')
  const canEdit = L.can('wms', 2)
  const [adj, setAdj] = useState(null)
  const [tr, setTr] = useState(null)
  const total = L.stockValue(L.stockRows().filter((r) => r.qty > 0))
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">倉儲管理</h1>
        <span className="muted">庫存總值 <b>{money(total)}</b></span>
        {canEdit && <button className="btn" onClick={() => setTr({ from_bin_id: '', to_bin_id: '', lines: [{ item_id: '', lot_no: '', qty: '' }], reason: '' })}>調撥 / 補貨到門市</button>}
        {canEdit && <button className="btn" onClick={() => setAdj({ item_id: '', bin_id: '', lot_no: '', qty: '', reason: '' })}>庫存調整</button>}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['stock', '庫存（依品項）'], ['bins', '儲位庫存'], ['transfers', '調撥紀錄'], ['stocktake', '盤點'], ['expiry', '效期管理'], ['moves', '異動明細'], ['setup', '倉庫與儲位設定']]} />
      {tab === 'stock' && <StockByItem />}
      {tab === 'bins' && <StockByBin />}
      {tab === 'transfers' && <Transfers />}
      {tab === 'stocktake' && <Stocktakes />}
      {tab === 'expiry' && <Expiry />}
      {tab === 'moves' && <Moves />}
      {tab === 'setup' && <Setup />}
      {adj && <AdjustModal d={adj} setD={setAdj} />}
      {tr && <TransferModal d={tr} setD={setTr} />}
    </div>
  )
}

function StockByItem() {
  const [type, setType] = useState('')
  const [open, setOpen] = useState(null)
  const items = all('items').filter((i) => (!type || i.type === type) && i.active !== false)
  const qcSplit = (id) => {
    const rows = L.stockRows({ item_id: id, kinds: ['storage'] }).filter((r) => r.qty > 0)
    const by = { pass: 0, other: 0, expired: 0 }
    for (const r of rows) {
      const l = L.lotByNo(r.lot_no)
      if (l && L.isExpired(l)) by.expired += r.qty
      else if (!l || l.qc_status === 'pass') by.pass += r.qty
      else by.other += r.qty
    }
    return by
  }
  return (
    <>
      <div className="row">
        {[['', '全部'], ['raw', '原料'], ['pack', '包材'], ['product', '成品']].map(([k, l]) => (
          <button key={k} className={'btn sm' + (type === k ? ' primary' : '')} onClick={() => setType(k)}>{l}</button>
        ))}
      </div>
      <div className="card">
        <Table rows={items} onRow={(i) => setOpen(i.id)} columns={[
          { h: '品項', r: (i) => <><b>{i.name}</b><div className="small muted">{i.code}・{i.temp_zone}</div></> },
          { h: '可用（合格）', cls: 'num', r: (i) => { const s = qcSplit(i.id); return <>{qty(s.pass, i.unit)}<div className="small muted">{altText(i.id, s.pass)}</div></> } },
          { h: '待檢 / 不合格', cls: 'num', r: (i) => qty(qcSplit(i.id).other) },
          { h: '已過期', cls: 'num', r: (i) => { const e = qcSplit(i.id).expired; return e ? <span className="tone-bad">{qty(e)}</span> : '0' } },
          { h: '產線上', cls: 'num', r: (i) => qty(L.lineStock(i.id)) },
          { h: '門市', cls: 'num', r: (i) => qty(L.onHand({ item_id: i.id, kinds: ['store'] })) },
          { h: '待處理區', cls: 'num', r: (i) => qty(L.onHand({ item_id: i.id, kinds: ['quarantine'] })) },
          { h: '安全量', cls: 'num', r: (i) => (i.type === 'product' ? '—' : qty(i.safety_stock)) },
          { h: '', r: (i) => (i.type !== 'product' && i.safety_stock && L.stockOf(i.id) < i.safety_stock ? <Badge kind="bad">低於安全量</Badge> : null) },
        ]} />
      </div>
      {open && (
        <Modal wide title={`${itemName(open)} 庫存分布`} onClose={() => setOpen(null)}>
          <Table rows={L.stockRows({ item_id: open }).filter((r) => r.qty !== 0)} columns={[
            { h: '儲位', r: (r) => L.binLabel(r.bin_id) },
            { h: '批號', r: (r) => <LotLink no={r.lot_no} /> },
            { h: '數量', cls: 'num', r: (r) => qty(r.qty, itemUnit(open)) },
            { h: '有效期限', r: (r) => L.lotByNo(r.lot_no)?.exp_date },
            { h: 'QC', r: (r) => <Badge s={L.lotByNo(r.lot_no)?.qc_status} /> },
            { h: '價值', cls: 'num', r: (r) => money(r.qty * L.lotCost(r.lot_no, r.item_id)) },
          ]} />
        </Modal>
      )}
    </>
  )
}

function StockByBin() {
  const [wh, setWh] = useState(all('warehouses')[0]?.id || '')
  const bins = where('bins', (b) => b.warehouse_id === wh)
  return (
    <>
      <div className="row">
        {all('warehouses').map((w) => (
          <button key={w.id} className={'btn sm' + (wh === w.id ? ' primary' : '')} onClick={() => setWh(w.id)}>
            {w.name}{w.temp_zone ? `（${w.temp_zone}）` : ''}
          </button>
        ))}
      </div>
      <div className="grid grid-2">
        {bins.map((b) => {
          const rows = L.stockRows({ bin_id: b.id }).filter((r) => r.qty > 0)
          return (
            <div key={b.id} className="card">
              <div className="card-head"><h3 className="grow">{b.code}</h3><span className="small muted">{rows.length} 個批號・{money(L.stockValue(rows))}</span></div>
              <Table empty="空儲位" rows={rows} columns={[
                { h: '品項', r: (r) => itemName(r.item_id) },
                { h: '批號', r: (r) => <LotLink no={r.lot_no} /> },
                { h: '數量', cls: 'num', r: (r) => qty(r.qty, itemUnit(r.item_id)) },
                { h: '效期', r: (r) => { const l = L.lotByNo(r.lot_no); return l ? (L.isExpired(l) ? <Badge kind="bad">過期</Badge> : l.exp_date) : '' } },
              ]} />
            </div>
          )
        })}
      </div>
    </>
  )
}

function Transfers() {
  return (
    <div className="card">
      <Table rows={[...all('transfers')].reverse()} columns={[
        { h: '調撥單', r: (t) => t.no },
        { h: '日期', r: (t) => t.date },
        { h: '從', r: (t) => L.binLabel(t.from_bin_id) },
        { h: '到', r: (t) => L.binLabel(t.to_bin_id) },
        { h: '內容', r: (t) => <span className="small">{t.lines.map((l, i) => <span key={i}>{itemName(l.item_id)}×{l.qty}（<LotLink no={l.lot_no} />） </span>)}</span> },
        { h: '原因', r: (t) => t.reason },
        { h: '人員', r: (t) => t.user_name },
        { h: '', r: (t) => <PrintButton sm type="transfer" id={t.id} /> },
      ]} />
    </div>
  )
}

function Stocktakes() {
  const [open, setOpen] = useOpen()
  const [wh, setWh] = useState('')
  const canEdit = L.can('wms', 2)
  const st = get('stocktakes', open)
  return (
    <>
      {canEdit && (
        <div className="row">
          <select className="input auto" value={wh} onChange={(e) => setWh(e.target.value)} aria-label="選擇倉庫">
            <option value="">選擇倉庫…</option>
            {all('warehouses').filter((w) => ['storage', 'store'].includes(w.kind)).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <button className="btn primary" disabled={!wh} onClick={() => { const s = attempt(() => L.createStocktake(wh), '已產生盤點單'); if (s) setOpen(s.id) }}>產生盤點單</button>
          <span className="muted small">盤差金額超過 {money(L.getSetting('adjust_approval_amount'))} 需主管核准才過帳</span>
        </div>
      )}
      <div className="card">
        <Table rows={[...all('stocktakes')].reverse()} onRow={(s) => setOpen(s.id)} columns={[
          { h: '盤點單', r: (s) => s.no },
          { h: '日期', r: (s) => s.date },
          { h: '倉庫', r: (s) => get('warehouses', s.warehouse_id)?.name },
          { h: '項數', cls: 'num', r: (s) => s.lines.length },
          { h: '盤差', cls: 'num', r: (s) => L.stocktakeDiffs(s).length },
          { h: '狀態', r: (s) => (s.status === 'pending' ? <Badge kind="warn">待核准</Badge> : <Badge s={s.status} />) },
          { h: '人員', r: (s) => s.user_name },
        ]} />
      </div>
      {st && <StocktakeModal st={st} onClose={() => setOpen(null)} />}
    </>
  )
}

function StocktakeModal({ st, onClose }) {
  const [lines, setLines] = useState(st.lines)
  const editable = st.status === 'counting' && L.can('wms', 2)
  const diffs = L.stocktakeDiffs({ ...st, lines })
  const set = (i, v) => setLines(lines.map((l, j) => (j === i ? { ...l, counted_qty: v === '' ? null : Number(v) } : l)))
  return (
    <Modal wide title={`盤點單 ${st.no}　${get('warehouses', st.warehouse_id)?.name}`} onClose={onClose}
      footer={editable ? <>
        <button className="btn" onClick={() => setLines(lines.map((l) => ({ ...l, counted_qty: l.counted_qty ?? l.system_qty })))}>未填的帶入帳面數</button>
        <span style={{ flex: 1 }} />
        <PrintButton type="stocktake" id={st.id} label="盤點表（空白）" />
        <button className="btn" onClick={() => attempt(() => L.saveCount(st.id, lines), '已暫存')}>暫存</button>
        <button className="btn primary" onClick={async () => {
          if (!(await ask(`送出盤點？共 ${diffs.length} 項差異，金額 ${money(L.sum(diffs, (d) => Math.abs(d.value)))}`))) return
          if (attempt(() => { L.saveCount(st.id, lines); return L.submitStocktake(st.id) }, '盤點已過帳')) onClose()
        }}>送出過帳</button>
      </> : <><PrintButton type="stocktake" id={st.id} label="盤點表" /><button className="btn" onClick={onClose}>關閉</button></>}>
      <Table rows={lines.map((l, i) => ({ ...l, i }))} columns={[
        { h: '儲位', r: (l) => L.binLabel(l.bin_id) },
        { h: '品項', r: (l) => itemName(l.item_id) },
        { h: '批號', r: (l) => l.lot_no },
        { h: '帳面', cls: 'num', r: (l) => qty(l.system_qty, itemUnit(l.item_id)) },
        { h: '實盤', r: (l) => (editable ? <Input type="number" style={{ width: 100 }} value={l.counted_qty ?? ''} onChange={(v) => set(l.i, v)} /> : qty(l.counted_qty)) },
        { h: '差異', cls: 'num', r: (l) => { const d = l.counted_qty === null || l.counted_qty === undefined ? null : L.round(l.counted_qty - l.system_qty, 3); return d ? <span className={d < 0 ? 'tone-bad' : 'tone-ok'}>{d > 0 ? '+' : ''}{d}</span> : d === 0 ? '0' : '' } },
      ]} />
    </Modal>
  )
}

function Expiry() {
  const [days, setDays] = useState(L.getSetting('expiry_warn_days'))
  const rows = L.expiringLots(days)
  return (
    <>
      <div className="row"><span>顯示</span><Input type="number" style={{ width: 90 }} value={days} onChange={setDays} /><span>天內到期或已過期的批號（過期批號系統自動禁止使用與出貨）</span></div>
      <div className="card">
        <Table empty="沒有快到期的批號" rows={rows} columns={[
          { h: '批號', r: (l) => <LotLink no={l.lot_no} /> },
          { h: '品項', r: (l) => itemName(l.item_id) },
          { h: '庫存位置', r: (l) => <span className="small">{L.stockRows({ lot_no: l.lot_no }).filter((r) => r.qty > 0).map((r) => `${L.binLabel(r.bin_id)} ${r.qty}`).join('、')}</span> },
          { h: '數量', cls: 'num', r: (l) => qty(L.lotStock(l.lot_no), itemUnit(l.item_id)) },
          { h: '價值', cls: 'num', r: (l) => money(L.lotStock(l.lot_no) * L.lotCost(l.lot_no, l.item_id)) },
          { h: '有效期限', r: (l) => l.exp_date },
          { h: '狀態', r: (l) => (L.isExpired(l) ? <Badge kind="bad">已過期 {-L.daysLeft(l)} 天</Badge> : <Badge kind="warn">剩 {L.daysLeft(l)} 天</Badge>) },
        ]} />
      </div>
    </>
  )
}

function Moves() {
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const rows = all('stock_moves')
    .filter((m) => (!type || m.type === type) && matches(q, itemName(m.item_id), m.lot_no, m.note, m.user_name, L.binLabel(m.bin_id)))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 500)
  return (
    <>
      <div className="row">
        <Search value={q} onChange={setQ} placeholder="品項 / 批號 / 儲位 / 單據" />
        <select className="input auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="異動類型">
          <option value="">全部類型</option>
          {Object.entries(L.MOVE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="card">
        <Table rows={rows} columns={[
          { h: '時間', r: (m) => <span className="nowrap small">{dt(m.date)}</span> },
          { h: '類型', r: (m) => <Badge>{L.MOVE_TYPES[m.type] || m.type}</Badge> },
          { h: '儲位', r: (m) => L.binLabel(m.bin_id) },
          { h: '品項', r: (m) => itemName(m.item_id) },
          { h: '批號', r: (m) => <LotLink no={m.lot_no} /> },
          { h: '數量', cls: 'num', r: (m) => <span className={m.qty < 0 ? 'tone-bad' : 'tone-ok'}>{m.qty > 0 ? '+' : ''}{qty(m.qty, itemUnit(m.item_id))}</span> },
          { h: '單號', r: (m) => (/^(RC|MI|MR|MS|AJ|SC|FD)/.test(m.doc_no || '') ? <PrintButton sm type="doc" id={m.doc_no} label={m.doc_no} /> : m.doc_no) },
          { h: '來源', r: (m) => (m.ref_type && get(m.ref_type, m.ref_id)?.no ? <DocLink t={m.ref_type} id={m.ref_id} /> : m.note) },
          { h: '人員', r: (m) => m.user_name },
        ]} />
      </div>
    </>
  )
}

function Setup() {
  const canEdit = L.can('wms', 2)
  const [w, setW] = useState(null)
  const [b, setB] = useState(null)
  return (
    <>
      <p className="muted small" style={{ margin: 0 }}>倉庫的溫層會檢查入庫品項：冷凍品只能放冷凍倉，以此類推。「產線」是領料後投料前的暫存，「門市」是 POS 可賣的庫存，「待處理區」放客戶退貨等待複檢。</p>
      {canEdit && <div className="row"><button className="btn" onClick={() => setW({ kind: 'storage', temp_zone: '常溫' })}>＋ 倉庫</button><button className="btn" onClick={() => setB({ warehouse_id: '', code: '', active: true })}>＋ 儲位</button></div>}
      <div className="grid grid-2">
        {all('warehouses').map((x) => (
          <div key={x.id} className="card">
            <div className="card-head">
              <h3 className="grow">{x.code} {x.name}</h3>
              <Badge kind="info">{L.WAREHOUSE_KINDS[x.kind]}</Badge>
              {x.temp_zone && <Badge>{x.temp_zone}</Badge>}
              {canEdit && <button className="btn sm" onClick={() => setW(x)}>編輯</button>}
            </div>
            <div className="card-pad row">
              {where('bins', (y) => y.warehouse_id === x.id).map((y) => (
                <button key={y.id} className="btn sm" disabled={!canEdit} onClick={() => setB(y)}>{y.code}{y.active === false ? '（停用）' : ''}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {w && (
        <Modal title={w.id ? `編輯 ${w.name}` : '新增倉庫'} onClose={() => setW(null)} footer={<><button className="btn" onClick={() => setW(null)}>取消</button><button className="btn primary" onClick={() => { const { id, created_at, updated_at, ...d } = w; if (attempt(() => L.saveMaster('warehouses', d, id), '已儲存')) setW(null) }}>儲存</button></>}>
          <div className="form-grid">
            <Field label="代碼"><Input value={w.code} onChange={(v) => setW({ ...w, code: v })} /></Field>
            <Field label="名稱"><Input value={w.name} onChange={(v) => setW({ ...w, name: v })} /></Field>
            <Field label="種類"><Select placeholder={false} value={w.kind} options={Object.entries(L.WAREHOUSE_KINDS).map(([value, label]) => ({ value, label }))} onChange={(v) => setW({ ...w, kind: v })} /></Field>
            <Field label="溫層"><Select value={w.temp_zone} placeholder="不限" options={L.TEMP_ZONES.map((t) => ({ value: t, label: t }))} onChange={(v) => setW({ ...w, temp_zone: v })} /></Field>
          </div>
        </Modal>
      )}
      {b && (
        <Modal title={b.id ? `編輯儲位 ${b.code}` : '新增儲位'} onClose={() => setB(null)} footer={<>{b.id && <button className="btn danger" onClick={() => attempt(() => L.deleteMaster('bins', b.id), '已刪除') && setB(null)}>刪除</button>}<span style={{ flex: 1 }} /><button className="btn" onClick={() => setB(null)}>取消</button><button className="btn primary" onClick={() => { const { id, created_at, updated_at, ...d } = b; if (attempt(() => L.saveMaster('bins', d, id), '已儲存')) setB(null) }}>儲存</button></>}>
          <div className="form-grid">
            <Field label="倉庫"><Select value={b.warehouse_id} options={all('warehouses').map((x) => ({ value: x.id, label: x.name }))} onChange={(v) => setB({ ...b, warehouse_id: v })} /></Field>
            <Field label="儲位代碼"><Input value={b.code} onChange={(v) => setB({ ...b, code: v })} placeholder="例如 F-A03" /></Field>
            <Check checked={b.active !== false} onChange={(v) => setB({ ...b, active: v })} label="啟用" />
          </div>
        </Modal>
      )}
    </>
  )
}

function AdjustModal({ d, setD }) {
  const rows = d.item_id ? L.stockRows({ item_id: d.item_id }).filter((r) => r.qty > 0) : []
  const lots = where('lots', (l) => l.item_id === d.item_id)
  const cur = d.bin_id ? L.onHand({ item_id: d.item_id, bin_id: d.bin_id, lot_no: d.lot_no || '' }) : 0
  const value = Math.abs(Number(d.qty) || 0) * L.lotCost(d.lot_no, d.item_id)
  return (
    <Modal title="庫存調整" onClose={() => setD(null)}
      footer={<><button className="btn" onClick={() => setD(null)}>取消</button><button className="btn primary" onClick={() => attempt(() => L.adjustStock(d), '庫存已調整') && setD(null)}>{value > L.getSetting('adjust_approval_amount') ? '送出簽核' : '確認調整'}</button></>}>
      <div className="form-grid">
        <Field label="品項"><Select value={d.item_id} options={itemOptions()} onChange={(v) => setD({ ...d, item_id: v, bin_id: '', lot_no: '' })} /></Field>
        <Field label="批號"><Select value={d.lot_no} options={lots.map((l) => ({ value: l.lot_no, label: `${l.lot_no}（剩 ${L.lotStock(l.lot_no)}）` }))} onChange={(v) => setD({ ...d, lot_no: v, bin_id: rows.find((r) => r.lot_no === v)?.bin_id || d.bin_id })} /></Field>
        <Field label="儲位"><Select value={d.bin_id} options={binOptions()} onChange={(v) => setD({ ...d, bin_id: v })} /></Field>
        <Field label={`調整數量（減少輸入負數）・目前 ${qty(cur)}`}><Input type="number" value={d.qty} onChange={(v) => setD({ ...d, qty: v })} /></Field>
        <Field label="原因" span><Input value={d.reason} onChange={(v) => setD({ ...d, reason: v })} placeholder="例如：破損、解凍報廢、盤點差異" /></Field>
      </div>
      {value > 0 && <p className="small muted">影響金額約 {money(value)}{value > L.getSetting('adjust_approval_amount') ? '，超過門檻需主管核准' : ''}</p>}
    </Modal>
  )
}

function TransferModal({ d, setD }) {
  const fromRows = d.from_bin_id ? L.stockRows({ bin_id: d.from_bin_id }).filter((r) => r.qty > 0) : []
  const itemsIn = [...new Set(fromRows.map((r) => r.item_id))]
  const set = (i, patch) => setD({ ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  return (
    <Modal wide title="調撥 / 門市補貨" onClose={() => setD(null)}
      footer={<><button className="btn" onClick={() => setD(null)}>取消</button><button className="btn primary" onClick={() => attempt(() => L.transfer({ ...d, lines: d.lines.filter((l) => l.item_id && l.qty > 0) }), '調撥完成') && setD(null)}>確認調撥</button></>}>
      <div className="stack">
        <div className="form-grid">
          <Field label="從儲位"><Select value={d.from_bin_id} options={binOptions()} onChange={(v) => setD({ ...d, from_bin_id: v, lines: [{ item_id: '', lot_no: '', qty: '' }] })} /></Field>
          <Field label="到儲位" hint="送到門市即成為 POS 可賣的庫存；從待處理區放行需 QC 合格"><Select value={d.to_bin_id} options={binOptions()} onChange={(v) => setD({ ...d, to_bin_id: v })} /></Field>
          <Field label="原因"><Input value={d.reason} onChange={(v) => setD({ ...d, reason: v })} placeholder="門市補貨 / 移庫 / 退貨放行" /></Field>
        </div>
        {d.lines.map((l, i) => (
          <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
            <div style={{ flex: 2 }}><Select value={l.item_id} options={itemsIn.map((id) => ({ value: id, label: `${itemName(id)}（${L.onHand({ item_id: id, bin_id: d.from_bin_id })}）` }))} onChange={(v) => set(i, { item_id: v, lot_no: '' })} /></div>
            <div style={{ flex: 2 }}><Select value={l.lot_no} placeholder="自動（先到期先出）" options={fromRows.filter((r) => r.item_id === l.item_id).map((r) => ({ value: r.lot_no, label: `${r.lot_no}（${r.qty}，${L.lotByNo(r.lot_no)?.qc_status || ''}）` }))} onChange={(v) => set(i, { lot_no: v })} /></div>
            <div style={{ flex: 1 }}><Input type="number" placeholder="數量" value={l.qty} onChange={(v) => set(i, { qty: v })} /></div>
            <button className="btn sm ghost danger" aria-label="移除" onClick={() => setD({ ...d, lines: d.lines.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setD({ ...d, lines: [...d.lines, { item_id: '', lot_no: '', qty: '' }] })}>＋ 加一項</button>
      </div>
    </Modal>
  )
}
