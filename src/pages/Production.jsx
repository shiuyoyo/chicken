import { useState } from 'react'
import { all, get, where } from '../db/store'
import * as L from '../logic'
import { Modal, Field, Input, Select, Table, Badge, Tabs, Search, matches, money, qty, dt, itemName, itemUnit, partyName, itemOptions, attempt, ask, toast, useOpen, DocLink, LotLink, altText, PrintButton } from '../ui'

const lineOptions = () => (L.getSetting('lines') || []).map((l) => ({ value: l.name, label: `${l.name}（產能 ${l.capacity}/天）` }))

export function Production() {
  const [q, setQ] = useState('')
  const [show, setShow] = useState('active')
  const [open, setOpen] = useOpen()
  const [create, setCreate] = useState(null)
  const canEdit = L.can('production', 2)
  const rows = all('work_orders')
    .filter((w) => (show === 'active' ? !['closed', 'cancelled'].includes(w.status) : show === 'closed' ? ['closed', 'cancelled'].includes(w.status) : true))
    .filter((w) => matches(q, w.no, w.lot_no, itemName(w.product_id), get('sales_orders', w.sales_order_id)?.no))
    .sort((a, b) => String(b.plan_date + b.no).localeCompare(String(a.plan_date + a.no)))
  const warn = create && L.capacityWarning(create)
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">生產工單</h1>
        <Search value={q} onChange={setQ} placeholder="工單 / 批號 / 產品" />
        <select className="input auto" value={show} onChange={(e) => setShow(e.target.value)} aria-label="篩選">
          <option value="active">進行中</option>
          <option value="closed">已結束</option>
          <option value="all">全部</option>
        </select>
        {canEdit && <button className="btn primary" onClick={() => setCreate({ sales_order_id: '', product_id: '', plan_qty: '', plan_date: L.addDays(L.today(), 1), line: L.getSetting('lines')?.[0]?.name })}>＋ 開工單</button>}
      </div>
      <div className="card">
        <Table rows={rows} onRow={(w) => setOpen(w.id)} columns={[
          { h: '工單', r: (w) => <b>{w.no}</b> },
          { h: '排程', r: (w) => <span className="small">{w.plan_date}<br />{w.line}</span> },
          { h: '訂單', r: (w) => (w.sales_order_id ? <DocLink t="sales_orders" id={w.sales_order_id} /> : '備貨') },
          { h: '產品', r: (w) => itemName(w.product_id) },
          { h: '批號', r: (w) => <LotLink no={w.lot_no} /> },
          { h: '計畫 / 產出', cls: 'num', r: (w) => `${qty(w.plan_qty)} / ${qty(w.output_qty)}` },
          { h: '狀態', r: (w) => <Badge s={w.status}>{L.WO_STATUS[w.status]}</Badge> },
        ]} />
      </div>
      {create && (
        <Modal title="開立生產工單" onClose={() => setCreate(null)}
          footer={<><button className="btn" onClick={() => setCreate(null)}>取消</button>
            <button className="btn primary" onClick={() => {
              const wo = attempt(() => L.createWorkOrder(create))
              if (wo) {
                toast(`已開立 ${wo.no}，批號 ${wo.lot_no}`)
                setCreate(null)
                setOpen(wo.id)
              }
            }}>開立</button></>}>
          <div className="form-grid">
            <Field label="銷售訂單（空白 = 備貨生產）" span>
              <Select value={create.sales_order_id} placeholder="備貨生產" options={all('sales_orders').filter((s) => s.status === 'confirmed').map((s) => ({ value: s.id, label: `${s.no} ${partyName('customers', s.customer_id)}（交期 ${s.due_date}）` }))}
                onChange={(v) => {
                  const so = get('sales_orders', v)
                  setCreate({ ...create, sales_order_id: v, product_id: so?.lines[0]?.item_id || create.product_id, plan_qty: so?.lines[0]?.qty || create.plan_qty })
                }} />
            </Field>
            <Field label="產品（成品 / 半成品）"><Select value={create.product_id} options={itemOptions(['product', 'semi'])} onChange={(v) => setCreate({ ...create, product_id: v })} /></Field>
            <Field label="計畫數量"><Input type="number" value={create.plan_qty} onChange={(v) => setCreate({ ...create, plan_qty: v })} /></Field>
            <Field label="生產日"><Input type="date" value={create.plan_date} onChange={(v) => setCreate({ ...create, plan_date: v })} /></Field>
            <Field label="產線"><Select placeholder={false} value={create.line} options={lineOptions()} onChange={(v) => setCreate({ ...create, line: v })} /></Field>
          </div>
          {create.product_id && <p className="small muted">標準成本 {money(L.bomCost(create.product_id))} / {itemUnit(create.product_id)}（配方 × 最近進價）</p>}
          {warn && <div className="notice warn">⚠ {warn}</div>}
        </Modal>
      )}
      {open && get('work_orders', open) && <WorkOrderModal id={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function WorkOrderModal({ id, onClose }) {
  const wo = get('work_orders', id)
  const [tab, setTab] = useState(wo.status === 'planned' ? 'issue' : ['issued', 'cooking'].includes(wo.status) ? 'feed' : 'output')
  const needs = L.woNeeds(wo)
  const [inputs, setInputs] = useState({})
  const [lotPick, setLotPick] = useState({})
  const [out, setOut] = useState({ qty: '', waste: '' })
  const product = get('items', wo.product_id)
  const ended = ['closed', 'cancelled'].includes(wo.status)
  const canEdit = L.can('production', 2) && !ended
  const cost = L.woCostReport(wo)

  const run = (fn, msg) => {
    const lines = needs.map((n) => ({ item_id: n.item_id, qty: Number(inputs[n.item_id] || 0), lot_no: lotPick[n.item_id] || undefined }))
    if (attempt(() => fn(wo.id, lines), msg)) setInputs({})
  }
  const fillSuggest = (kind) =>
    setInputs(Object.fromEntries(needs.map((n) => [n.item_id, Math.max(0, L.round(n.qty - (kind === 'issue' ? L.woIssued(wo, n.item_id) - L.woReturned(wo, n.item_id) : L.woFed(wo, n.item_id)), 3))])))
  const availLots = (itemId) =>
    L.stockRows({ item_id: itemId, kinds: ['storage'] })
      .filter((r) => r.qty > 0)
      .map((r) => ({ ...r, lot: L.lotByNo(r.lot_no) }))
      .filter((r) => r.lot?.qc_status === 'pass' && !L.isExpired(r.lot))
      .sort((a, b) => String(a.lot.exp_date).localeCompare(String(b.lot.exp_date)))

  return (
    <Modal wide title={`${wo.no}　${product?.name}`} onClose={onClose}
      footer={<>
        {canEdit && wo.status === 'planned' && <button className="btn danger" onClick={async () => (await ask('取消這張工單？', { danger: true })) && attempt(() => L.cancelWorkOrder(wo.id), '已取消')}>取消工單</button>}
        {canEdit && wo.status !== 'planned' && <button className="btn" onClick={async () => (await ask('結案後產線剩料會退回原儲位，在製品差額轉損耗。確定結案？')) && attempt(() => L.closeWorkOrder(wo.id), '工單已結案')}>工單結案</button>}
        <PrintButton type="work_order" id={wo.id} label="製令單" />
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={onClose}>關閉</button>
      </>}>
      <div className="row" style={{ marginBottom: 12 }}>
        <Badge s={wo.status}>{L.WO_STATUS[wo.status]}</Badge>
        <span>訂單 {wo.sales_order_id ? <DocLink t="sales_orders" id={wo.sales_order_id} /> : '備貨'}</span>
        <span>批號 <LotLink no={wo.lot_no} /></span>
        <span>{wo.plan_date}・{wo.line}</span>
        <span>計畫 {qty(wo.plan_qty, product?.unit)}・產出 {qty(wo.output_qty, product?.unit)}・損耗 {qty(wo.waste_qty, 'kg')}</span>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['issue', '① 領料'], ['feed', '② 投料'], ['output', '③ 產出'], ['cost', '成本與良率'], ['log', '投料紀錄']]} />
      {(tab === 'issue' || tab === 'feed') && (
        <div className="stack">
          <p className="muted small" style={{ margin: 0 }}>
            {tab === 'issue'
              ? `從倉庫把原料領到產線。系統依「先到期先出」自動挑批號，也可以指定批號。只能領 QC 合格、未過期的料，最多可超過配方 ${L.getSetting('issue_tolerance') * 100}%。`
              : '把產線上的料投入生產（下鍋、上組裝線），系統記錄用了哪些批號（追溯用）。產線上不夠時會自動從倉庫補領。'}
          </p>
          <Table rows={needs} columns={[
            { h: '原料', r: (n) => itemName(n.item_id) },
            { h: '配方需求', cls: 'num', r: (n) => <>{qty(n.qty, itemUnit(n.item_id))}<div className="small muted">{altText(n.item_id, n.qty)}</div></> },
            { h: tab === 'issue' ? '倉庫可用' : '產線上', cls: 'num', r: (n) => qty(tab === 'issue' ? L.stockOf(n.item_id) : L.lineStock(n.item_id)) },
            { h: '已領', cls: 'num', r: (n) => qty(L.woIssued(wo, n.item_id) - L.woReturned(wo, n.item_id)) },
            { h: '已投', cls: 'num', r: (n) => qty(L.woFed(wo, n.item_id)) },
            ...(tab === 'issue' && canEdit ? [{ h: '指定批號', r: (n) => (
              <select className="input" style={{ minWidth: 150 }} value={lotPick[n.item_id] || ''} onChange={(e) => setLotPick({ ...lotPick, [n.item_id]: e.target.value })} aria-label="指定批號">
                <option value="">自動（先到期先出）</option>
                {availLots(n.item_id).map((r) => <option key={r.lot_no + r.bin_id} value={r.lot_no}>{r.lot_no}｜{r.qty}｜到期 {r.lot.exp_date}</option>)}
              </select>
            ) }] : []),
            ...(canEdit ? [{ h: '本次數量', r: (n) => <Input type="number" min="0" step="any" value={inputs[n.item_id] ?? ''} onChange={(v) => setInputs({ ...inputs, [n.item_id]: v })} style={{ width: 100 }} /> }] : []),
          ]} />
          {canEdit && (
            <div className="row">
              <button className="btn" onClick={() => fillSuggest(tab)}>帶入剩餘需求量</button>
              <span style={{ flex: 1 }} />
              <button className="btn primary" onClick={() => run(tab === 'issue' ? L.issueMaterials : L.feedMaterials, tab === 'issue' ? '領料完成' : '投料已記錄')}>確認{tab === 'issue' ? '領料' : '投料'}</button>
            </div>
          )}
        </div>
      )}
      {tab === 'output' && (
        <div className="stack">
          <p className="muted small" style={{ margin: 0 }}>做好後登記產出。{L.ITEM_TYPES[product?.type]}進「{L.binLabel(product?.default_bin_id)}」，{product?.qc_required === false ? '這個品項免 QC，產出直接可用。' : '狀態為待 QC，合格後才能出貨、送門市或給下一層使用。'}</p>
          {canEdit && (
            <>
              <div className="form-grid">
                <Field label={`本次產出（${product?.unit}）`}><Input type="number" value={out.qty} onChange={(v) => setOut({ ...out, qty: v })} /></Field>
                <Field label="損耗（kg，選填）"><Input type="number" value={out.waste} onChange={(v) => setOut({ ...out, waste: v })} /></Field>
              </div>
              <div className="row"><span style={{ flex: 1 }} />
                <button className="btn primary" onClick={() => attempt(() => L.recordOutput(wo.id, out), '產出已入庫，等待 QC') && setOut({ qty: '', waste: '' })}>確認產出入庫</button>
              </div>
            </>
          )}
          <h3>產出批號</h3>
          <Table empty="還沒有產出" rows={L.woLots(wo)} columns={[
            { h: '批號', r: (l) => <LotLink no={l.lot_no} /> },
            { h: '數量', cls: 'num', r: (l) => qty(l.qty) },
            { h: '單位成本', cls: 'num', r: (l) => money(l.unit_cost) },
            { h: '有效期限', r: (l) => l.exp_date },
            { h: 'QC', r: (l) => <Badge s={l.qc_status}>{l.qc_status === 'pending' ? '待檢' : undefined}</Badge> },
            { h: '', r: (l) => <PrintButton sm type="label" id={l.lot_no} label="標籤" params={{ copies: 4 }} /> },
          ]} />
        </div>
      )}
      {tab === 'cost' && (
        <div className="grid grid-kpi">
          <div className="card kpi"><div className="label">投入原料成本</div><div className="value">{money(cost.fed)}</div></div>
          <div className="card kpi"><div className="label">標準成本 / {product?.unit}</div><div className="value">{money(cost.std)}</div></div>
          <div className="card kpi"><div className="label">實際成本 / {product?.unit}</div><div className="value">{cost.actual ? money(cost.actual) : '—'}</div><div className="sub">{cost.actual ? `差異 ${cost.variance > 0 ? '+' : ''}${cost.variance}` : '產出後計算'}</div></div>
          <div className="card kpi"><div className="label">良率（產出 / 計畫）</div><div className="value">{cost.yieldPct}%</div><div className="sub">損耗 {qty(wo.waste_qty, 'kg')}</div></div>
        </div>
      )}
      {tab === 'log' && (
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="small muted">單據：</span>
          {[...new Set(where('stock_moves', (m) => m.ref_id === wo.id && m.doc_no).map((m) => m.doc_no))].map((no) => <PrintButton key={no} sm type="doc" id={no} label={`${L.DOC_TYPES[no.replace(/\d.*$/, '')]} ${no}`} />)}
        </div>
      )}
      {tab === 'log' && (
        <Table empty="還沒有投料紀錄" rows={[...(wo.feeds || [])].reverse()} columns={[
          { h: '時間', r: (f) => dt(f.at) },
          { h: '原料', r: (f) => itemName(f.item_id) },
          { h: '批號', r: (f) => <LotLink no={f.lot_no} /> },
          { h: '數量', cls: 'num', r: (f) => qty(f.qty, itemUnit(f.item_id)) },
          { h: '人員', r: (f) => f.user },
        ]} />
      )}
    </Modal>
  )
}

// ---------- 生產排程：日期 × 產線 ----------
export function Schedule() {
  const [start, setStart] = useState(L.addDays(L.today(), -1))
  const [move, setMove] = useState(null)
  const days = Array.from({ length: 7 }, (_, i) => L.addDays(start, i))
  const lines = L.getSetting('lines') || []
  const wos = all('work_orders').filter((w) => !['cancelled'].includes(w.status))
  const unscheduled = wos.filter((w) => !w.plan_date && w.status !== 'closed')
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">生產排程</h1>
        <button className="btn" onClick={() => setStart(L.addDays(start, -7))}>← 上週</button>
        <button className="btn" onClick={() => setStart(L.addDays(L.today(), -1))}>本週</button>
        <button className="btn" onClick={() => setStart(L.addDays(start, 7))}>下週 →</button>
      </div>
      <div className="table-wrap card">
        <table className="table schedule">
          <thead>
            <tr>
              <th>產線</th>
              {days.map((d) => <th key={d} className={d === L.today() ? 'today' : ''}>{d.slice(5)}</th>)}
            </tr>
          </thead>
          <tbody>
            {lines.map((ln) => (
              <tr key={ln.name}>
                <th>{ln.name}<div className="small muted">產能 {ln.capacity}</div></th>
                {days.map((d) => {
                  const list = wos.filter((w) => w.line === ln.name && w.plan_date === d)
                  const load = L.sum(list.filter((w) => w.status !== 'closed'), (w) => w.plan_qty)
                  const over = load > ln.capacity
                  return (
                    <td key={d} className={(d === L.today() ? 'today ' : '') + (over ? 'over' : '')}>
                      {list.map((w) => (
                        <button key={w.id} className={'sched-card s-' + w.status} onClick={() => L.can('production', 2) && !['closed'].includes(w.status) && setMove({ id: w.id, plan_date: w.plan_date, line: w.line })}>
                          <b>{itemName(w.product_id)}</b>
                          <span>{w.plan_qty}｜{L.WO_STATUS[w.status]}</span>
                        </button>
                      ))}
                      {load > 0 && <div className={'small ' + (over ? 'tone-bad' : 'muted')}>{load}/{ln.capacity}{over ? ' 超載' : ''}</div>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {unscheduled.length > 0 && <div className="muted small">未排程工單：{unscheduled.map((w) => w.no).join('、')}</div>}
      {move && (
        <Modal title={`調整排程 ${get('work_orders', move.id).no}`} onClose={() => setMove(null)}
          footer={<><button className="btn" onClick={() => setMove(null)}>取消</button><button className="btn primary" onClick={() => attempt(() => L.rescheduleWorkOrder(move.id, move), '排程已更新') && setMove(null)}>儲存</button></>}>
          <div className="form-grid">
            <Field label="生產日"><Input type="date" value={move.plan_date} onChange={(v) => setMove({ ...move, plan_date: v })} /></Field>
            <Field label="產線"><Select placeholder={false} value={move.line} options={lineOptions()} onChange={(v) => setMove({ ...move, line: v })} /></Field>
          </div>
          {L.capacityWarning({ ...move, plan_qty: get('work_orders', move.id).plan_qty }, move.id) && <div className="notice warn">⚠ {L.capacityWarning({ ...move, plan_qty: get('work_orders', move.id).plan_qty }, move.id)}</div>}
        </Modal>
      )}
    </div>
  )
}

export { where }
