import { all } from '../db/store'
import { SCHEMA, REFS } from '../db/schema'
import { Table, Badge } from '../ui'

// 方塊位置（viewBox 1080 × 650）：三列三欄，箭頭只走方塊之間的空隙
const BOX = {
  crm: { x: 30, y: 30, t: 'CRM 客戶關係', s: ['客戶 / 會員', '商機・互動', '報價單・價格表'], tables: ['customers', 'opportunities', 'quotations'] },
  sales: { x: 400, y: 30, t: '銷售', s: ['銷售訂單', '信用額度・底價', '退貨'], tables: ['sales_orders', 'returns'] },
  acct: { x: 770, y: 30, t: '會計', s: ['應收・應付（自動入帳）', '收付款・傳票', '月結關帳'], tables: ['invoices', 'bills', 'journal'] },
  purchase: { x: 30, y: 245, t: '採購', s: ['採購單', '進貨・供應商', '退回供應商'], tables: ['purchase_orders', 'suppliers'] },
  prod: { x: 400, y: 245, t: '生產', s: ['工單・排程', '領料・投料', '產出成品批號'], tables: ['work_orders'] },
  qc: { x: 770, y: 245, t: '品管 QC', s: ['進料檢驗 IQC', '成品抽檢 FQC', '暫扣・報廢'], tables: ['qc_inspections'] },
  wms: { x: 30, y: 460, t: '倉儲 WMS', s: ['倉庫・儲位・溫層', '批號・效期 FEFO', '調撥・盤點'], tables: ['lots', 'stock_moves', 'transfers'] },
  pos: { x: 400, y: 460, t: '門市 POS', s: ['收銀・會員點數', '作廢（店長）', '日結對帳'], tables: ['pos_sales', 'pos_shifts'] },
  ship: { x: 770, y: 460, t: '出貨', s: ['FEFO 揀貨單', '箱數・貨櫃', '開立發票'], tables: ['shipments'] },
}
const W = 260
const H = 130
// [路徑, 標籤, 標籤位置, 旋轉角度]
const ARROWS = [
  ['M 290 95 L 396 95', '報價轉訂單', [345, 85]],
  ['M 660 95 L 766 95', '信用額度', [713, 85]],
  ['M 530 160 L 530 241', '開工單', [560, 205]],
  ['M 430 160 L 262 245', '缺料 → 採購', [335, 192]],
  ['M 160 375 L 160 456', '進貨建批號', [210, 420]],
  ['M 262 460 L 430 375', '領料（記批號）', [335, 438]],
  ['M 660 310 L 766 310', '成品待檢', [713, 300]],
  ['M 900 375 L 900 456', '合格才放行', [950, 420]],
  ['M 290 525 L 396 525', '補貨到門市', [345, 515]],
  ['M 1030 525 L 1055 525 L 1055 95 L 1034 95', '發票・應收', [1068, 310], 90],
]
export default function SystemMap() {
  const count = (ts) => ts.reduce((s, t) => s + all(t).length, 0)
  const relRows = Object.entries(SCHEMA).flatMap(([t, def]) =>
    Object.keys(def.cols)
      .filter((col) => REFS[col])
      .map((col) => ({ id: t + col, from: t, col, to: REFS[col], n: all(t).filter((r) => r[col]).length })),
  )
  return (
    <div className="stack">
      <div className="page-head"><h1 className="grow">系統關聯圖</h1></div>
      <p className="muted" style={{ margin: 0 }}>
        所有系統共用同一套資料：一張訂單從報價、採購、生產、品管、出貨一路到收款，每一步都記錄來源單據與批號，所以任何一張單都能往前、往後追。
        方塊內的數字是目前的資料筆數。
      </p>
      <div className="card card-pad map-wrap">
        <svg viewBox="0 0 1080 645" className="sysmap" role="img" aria-label="ERP 各系統資料流">
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--primary)" />
            </marker>
          </defs>
          {ARROWS.map(([d, label, [x, y], rot]) => (
            <g key={d}>
              <path d={d} stroke="var(--primary)" strokeWidth="2" fill="none" markerEnd={label ? 'url(#arr)' : undefined} strokeDasharray={label ? undefined : '5 4'} />
              {label && <text x={x} y={y} textAnchor="middle" className="map-label" transform={rot ? `rotate(${rot} ${x} ${y})` : undefined}>{label}</text>}
            </g>
          ))}
          {Object.entries(BOX).map(([k, b]) => (
            <g key={k}>
              <rect x={b.x} y={b.y} width={W} height={H} rx="12" fill="var(--surface)" stroke="var(--border)" strokeWidth="1.5" />
              <text x={b.x + 16} y={b.y + 28} className="map-title">{b.t}</text>
              <text x={b.x + W - 14} y={b.y + 28} className="map-count" textAnchor="end">{count(b.tables).toLocaleString()}</text>
              {b.s.map((s, i) => <text key={i} x={b.x + 16} y={b.y + 56 + i * 22} className="map-sub">{s}</text>)}
            </g>
          ))}
          <rect x="30" y="600" width="1000" height="34" rx="10" fill="var(--primary-soft)" />
          <text x="530" y="622" textAnchor="middle" className="map-band">權限控管 ・ 簽核中心 ・ 操作紀錄 ・ 關帳鎖定 ── 套用在上面每一個系統</text>
        </svg>
      </div>
      <div className="card">
        <div className="card-head"><h2 className="grow">資料表關聯（外鍵）</h2><Badge kind="info">{relRows.length} 個關聯</Badge></div>
        <Table rows={relRows} columns={[
          { h: '資料表', r: (r) => <><b>{SCHEMA[r.from].label}</b> <span className="muted small">{r.from}</span></> },
          { h: '欄位', r: (r) => <code>{r.col}</code> },
          { h: '指向', r: (r) => <>{SCHEMA[r.to].label} <span className="muted small">{r.to}</span></> },
          { h: '已關聯筆數', cls: 'num', r: (r) => r.n },
        ]} />
      </div>
    </div>
  )
}
