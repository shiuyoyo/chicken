import { useState } from 'react'
import { all, get, where } from '../db/store'
import * as L from '../logic'
import { Modal, Table, Badge, Tabs, Kpi, money, qty, dt, itemName, partyName, attempt, ask, useTab, CrudPage, LotLink } from '../ui'

export function PosSales() {
  const [tab, setTab] = useTab('shifts')
  const [open, setOpen] = useState(null)
  const shifts = [...all('pos_shifts')].reverse()
  const sales = [...all('pos_sales')].reverse()
  return (
    <div className="stack">
      <div className="page-head"><h1 className="grow">門市銷售與日結</h1></div>
      <Tabs value={tab} onChange={setTab} tabs={[['shifts', '班別 / 日結'], ['sales', '交易明細'], ['stock', '門市庫存']]} />
      {tab === 'shifts' && (
        <div className="card">
          <Table rows={shifts} onRow={(s) => setOpen(s.id)} columns={[
            { h: '班別', r: (s) => s.no },
            { h: '門市', r: (s) => L.binLabel(s.bin_id) },
            { h: '開班', r: (s) => <span className="small">{s.opened_by}<br />{dt(s.opened_at)}</span> },
            { h: '營業額', cls: 'num', r: (s) => money(L.shiftSummary(s.id).total) },
            { h: '筆數', cls: 'num', r: (s) => L.shiftSummary(s.id).count },
            { h: '應有現金', cls: 'num', r: (s) => money(s.status === 'closed' ? s.expected_cash : L.shiftSummary(s.id).expected) },
            { h: '點收 / 差額', cls: 'num', r: (s) => (s.status === 'closed' ? <>{money(s.counted_cash)} / <span className={s.diff ? 'tone-bad' : ''}>{money(s.diff)}</span></> : '—') },
            { h: '狀態', r: (s) => (s.status === 'open' ? <Badge kind="warn">營業中</Badge> : <Badge kind="ok">已日結</Badge>) },
          ]} />
        </div>
      )}
      {tab === 'sales' && (
        <div className="card">
          <Table rows={sales} columns={[
            { h: '交易', r: (s) => s.no },
            { h: '發票', r: (s) => s.gui_no },
            { h: '時間', r: (s) => <span className="small">{dt(s.at)}</span> },
            { h: '內容', r: (s) => <span className="small">{s.lines.map((l) => `${itemName(l.item_id)}×${l.qty}`).join('、')}</span> },
            { h: '會員', r: (s) => partyName('customers', s.customer_id) },
            { h: '付款', r: (s) => s.method },
            { h: '折扣', cls: 'num', r: (s) => (s.discount ? money(s.discount) : '') },
            { h: '金額', cls: 'num', r: (s) => money(s.total) },
            { h: '收銀', r: (s) => s.cashier },
            { h: '狀態', r: (s) => (s.status === 'void' ? <Badge kind="bad">作廢</Badge> : L.pendingFor(s.id) ? <Badge kind="warn">作廢待核准</Badge> : <Badge kind="ok">完成</Badge>) },
          ]} />
        </div>
      )}
      {tab === 'stock' && (
        <div className="card">
          <Table empty="門市沒有庫存，請到倉儲管理「調撥 / 補貨到門市」" rows={L.storeBins().flatMap((b) => L.storeStock(b.id))} columns={[
            { h: '門市', r: (r) => L.binLabel(r.bin_id) },
            { h: '品項', r: (r) => itemName(r.item_id) },
            { h: '批號', r: (r) => <LotLink no={r.lot_no} /> },
            { h: '數量', cls: 'num', r: (r) => qty(r.qty) },
            { h: '效期', r: (r) => L.lotByNo(r.lot_no)?.exp_date },
            { h: '可賣', r: (r) => { const l = L.lotByNo(r.lot_no); return l?.qc_status === 'pass' && !L.isExpired(l) ? <Badge kind="ok">可賣</Badge> : <Badge kind="bad">不可賣</Badge> } },
          ]} />
        </div>
      )}
      {open && <ShiftModal id={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function ShiftModal({ id, onClose }) {
  const s = L.shiftSummary(id)
  return (
    <Modal wide title={`班別 ${s.shift.no}`} onClose={onClose}>
      <div className="stack">
        <div className="grid grid-kpi">
          <Kpi label="營業額" value={money(s.total)} sub={`${s.count} 筆，作廢 ${s.voids} 筆`} />
          {Object.entries(s.byMethod).map(([m, v]) => <Kpi key={m} label={m} value={money(v)} />)}
          <Kpi label="零用金 + 現金" value={money(s.expected)} sub={s.shift.status === 'closed' ? `點收 ${money(s.shift.counted_cash)}，差 ${money(s.shift.diff)}` : '尚未日結'} />
        </div>
        <Table rows={Object.entries(s.byItem).map(([k, v]) => ({ id: k, k, v }))} columns={[
          { h: '品項', r: (r) => itemName(r.k) },
          { h: '賣出', cls: 'num', r: (r) => qty(r.v) },
        ]} />
      </div>
    </Modal>
  )
}

export function Members() {
  return (
    <CrudPage
      title="會員"
      rows={where('customers', (c) => c.kind === 'member')}
      editable={L.can('pos', 2)}
      defaults={{ kind: 'member', level: 'C', status: '往來中', terms_days: 0, points: 0 }}
      searchKeys={['code', 'name', 'phone']}
      onSave={(d, id) => L.saveCustomer({ ...d, kind: 'member' }, id)}
      onDelete={(id) => L.deleteCustomer(id)}
      fields={[{ k: 'code', label: '會員編號' }, { k: 'name', label: '姓名' }, { k: 'phone', label: '手機' }, { k: 'email', label: 'Email' }, { k: 'points', label: '點數', type: 'number' }, { k: 'note', label: '備註', type: 'textarea', span: true }]}
      columns={[
        { h: '編號', r: (c) => c.code }, { h: '姓名', r: (c) => <b>{c.name}</b> }, { h: '手機', r: (c) => c.phone },
        { h: '點數', cls: 'num', r: (c) => c.points || 0 },
        { h: '消費次數', cls: 'num', r: (c) => where('pos_sales', (s) => s.customer_id === c.id && s.status === 'done').length },
        { h: '累計消費', cls: 'num', r: (c) => money(L.sum(where('pos_sales', (s) => s.customer_id === c.id && s.status === 'done'), (s) => s.total)) },
      ]}
    />
  )
}

export { get, ask, attempt }
