import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { all } from '../db/store'
import * as L from '../logic'
import { Table, Badge, qty, dt, itemName, itemUnit, partyName, DocLink, LotLink, money, PrintButton } from '../ui'

export default function Trace() {
  const [sp, setSp] = useSearchParams()
  const lotNo = sp.get('lot') || ''
  const [input, setInput] = useState(lotNo)
  const t = lotNo ? L.traceLot(lotNo) : null
  const go = (v) => setSp(v ? { lot: v } : {})
  const recent = [...all('lots')].reverse().slice(0, 12)
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">食品追溯</h1>
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); go(input.trim()) }}>
        <input id="trace-lot" className="input" style={{ maxWidth: 320 }} placeholder="輸入批號，例如 L20261006-001 或 R…" value={input} onChange={(e) => setInput(e.target.value)} list="lot-list" aria-label="批號" />
        <datalist id="lot-list">{all('lots').map((l) => <option key={l.id} value={l.lot_no}>{itemName(l.item_id)}</option>)}</datalist>
        <button className="btn primary" type="submit">追溯</button>
      </form>
      {!lotNo && (
        <div className="card card-pad stack">
          <p style={{ margin: 0 }}>輸入任何批號：成品批號會往上找出用了哪些原料批號、哪家供應商；原料批號會往下找出做成哪些成品、出貨給哪些客戶、門市賣給哪些會員，可直接當作召回名單。</p>
          <div className="row small">最近批號：{recent.map((l) => <button key={l.id} className="btn sm" onClick={() => { setInput(l.lot_no); go(l.lot_no) }}>{l.lot_no}</button>)}</div>
        </div>
      )}
      {lotNo && !t && <div className="card empty">找不到批號 {lotNo}</div>}
      {t && <TraceResult t={t} />}
    </div>
  )
}

function TraceResult({ t }) {
  const { lot, item } = t
  return (
    <>
      <div className="card card-pad">
        <div className="row">
          <h2>{lot.lot_no}</h2>
          <PrintButton sm type="trace" id={lot.lot_no} label="追溯報告" />
          <PrintButton sm type="label" id={lot.lot_no} label="標籤" params={{ copies: 4 }} />
          <Badge kind={lot.kind === 'raw' ? '' : 'primary'}>{lot.kind === 'raw' ? '原料批號' : '成品批號'}</Badge>
          <b>{item?.name}</b>
          <Badge s={lot.qc_status}>{lot.qc_status === 'pending' ? '待檢' : undefined}</Badge>
          <span className="muted">數量 {qty(lot.qty, item?.unit)}・製造 / 進貨 {lot.mfg_date}・效期 {lot.exp_date}{L.isExpired(lot) ? '（已過期）' : ''}</span>
        </div>
      </div>

      <div className="trace-flow">
        <div className="card">
          <div className="card-head"><h3>⬆ 上游來源</h3></div>
          <div className="card-pad stack">
            {t.kind === 'raw' ? (
              <dl className="dl">
                <dt>供應商</dt><dd>{t.supplier?.name}（{t.supplier?.certs || '無認證資料'}）</dd>
                <dt>廠商批號</dt><dd>{lot.supplier_lot || '—'}</dd>
                <dt>採購單</dt><dd>{t.po ? <DocLink t="purchase_orders" row={t.po} /> : '直接進貨'}</dd>
                <dt>進貨單價</dt><dd>{money(lot.unit_cost)} / {item?.unit}</dd>
              </dl>
            ) : (
              <>
                <div className="small">工單 <DocLink t="work_orders" row={t.wo} />・訂單 {t.so ? <DocLink t="sales_orders" row={t.so} /> : '備貨'}・產線 {t.wo?.line}</div>
                <Table empty="沒有投料紀錄" rows={t.materials} columns={[
                  { h: '原料', r: (m) => itemName(m.item_id) },
                  { h: '原料批號', r: (m) => <LotLink no={m.lot_no} /> },
                  { h: '用量', cls: 'num', r: (m) => qty(m.qty, itemUnit(m.item_id)) },
                  { h: '供應商', r: (m) => m.supplier?.name || '—' },
                  { h: '廠商批號', r: (m) => m.lot?.supplier_lot || '—' },
                  { h: 'IQC', r: (m) => <Badge s={m.lot?.qc_status} /> },
                ]} />
              </>
            )}
            <h3>QC 紀錄</h3>
            <Table empty="沒有檢驗紀錄" rows={t.qc} columns={[
              { h: '單號', r: (q) => q.no },
              { h: '日期', r: (q) => q.date },
              { h: '結果', r: (q) => <Badge s={q.result} /> },
              { h: '檢驗員', r: (q) => q.inspector },
              { h: '備註', r: (q) => q.note },
            ]} />
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>⬇ 下游去向</h3></div>
          <div className="card-pad stack">
            {t.kind === 'raw' && (
              <>
                <h3>用在哪些成品批號</h3>
                <Table empty="還沒有被使用" rows={t.products} columns={[
                  { h: '成品批號', r: (p) => <LotLink no={p.lot.lot_no} /> },
                  { h: '產品', r: (p) => itemName(p.lot.item_id) },
                  { h: '工單', r: (p) => <DocLink t="work_orders" row={p.wo} /> },
                  { h: '投入量', cls: 'num', r: (p) => qty(p.qty, item?.unit) },
                ]} />
              </>
            )}
            <h3>出貨給客戶</h3>
            <Table empty="沒有出貨" rows={t.shipments} columns={[
              { h: '出貨單', r: (s) => <DocLink t="shipments" row={s.shipment} /> },
              { h: '日期', r: (s) => s.shipment.date },
              { h: '客戶', r: (s) => <DocLink t="customers" row={s.customer} /> },
              { h: '批號', r: (s) => s.lot_no },
              { h: '數量', cls: 'num', r: (s) => qty(s.qty, itemUnit(s.item_id)) },
            ]} />
            <h3>門市銷售</h3>
            <Table empty="沒有門市銷售" rows={t.pos} columns={[
              { h: '交易', r: (s) => s.sale.no },
              { h: '時間', r: (s) => dt(s.sale.at) },
              { h: '會員', r: (s) => s.customer?.name || '非會員' },
              { h: '數量', cls: 'num', r: (s) => qty(s.qty, itemUnit(s.item_id)) },
            ]} />
          </div>
        </div>
      </div>

      <div className="card recall">
        <div className="card-head"><h3 className="grow">🚨 召回名單</h3><span className="small muted">如果這個批號有食安問題，需要通知的對象</span></div>
        <Table empty="尚未流到客戶手上" rows={t.recall.map((r, i) => ({ id: i, ...r }))} columns={[
          { h: '客戶 / 會員', r: (r) => (r.customer ? <DocLink t="customers" row={r.customer} /> : '門市非會員（無法聯絡）') },
          { h: '聯絡', r: (r) => r.customer ? `${r.customer.contact || ''} ${r.customer.phone || ''}` : '' },
          { h: '數量', cls: 'num', r: (r) => qty(r.qty) },
          { h: '單據', r: (r) => <span className="small">{r.docs.join('、')}</span> },
        ]} />
        <div className="card-pad small">
          還在公司內的庫存：
          {[...(t.onHand || []), ...(t.rawOnHand || [])].filter((r) => r.qty > 0).map((r, i) => <span key={i}>　{L.binLabel(r.bin_id)} {itemName(r.item_id)} {qty(r.qty)}（{r.lot_no}）</span>)}
          {![...(t.onHand || []), ...(t.rawOnHand || [])].some((r) => r.qty > 0) && '　無'}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>批號異動歷程</h3></div>
        <Table rows={t.moves} columns={[
          { h: '時間', r: (m) => <span className="small nowrap">{dt(m.date)}</span> },
          { h: '類型', r: (m) => <Badge>{L.MOVE_TYPES[m.type]}</Badge> },
          { h: '儲位', r: (m) => L.binLabel(m.bin_id) },
          { h: '數量', cls: 'num', r: (m) => <span className={m.qty < 0 ? 'tone-bad' : 'tone-ok'}>{m.qty > 0 ? '+' : ''}{qty(m.qty)}</span> },
          { h: '單據', r: (m) => m.note },
          { h: '人員', r: (m) => m.user_name },
        ]} />
      </div>
    </>
  )
}

export { partyName }
