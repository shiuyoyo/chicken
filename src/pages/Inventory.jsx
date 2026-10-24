import { useState } from 'react'
import { all, get, insert, update, remove, where } from '../db/store'
import { stockOf, avgCost, adjustStock, lotStock, round } from '../logic'
import { Modal, Field, Input, Select, Table, Badge, Tabs, Search, matches, money, qty, dt, itemName, itemUnit, itemOptions, attempt, toast } from '../ui'

export const ITEM_TYPES = { raw: '原料', pack: '包材', product: '成品' }

export function Items() {
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [edit, setEdit] = useState(null)
  const rows = all('items').filter((i) => (!type || i.type === type) && matches(q, i.code, i.name))
  const save = () => {
    if (!edit.name) return toast('請輸入名稱', 'bad')
    const { id, ...data } = edit
    data.bom = (data.bom || []).filter((b) => b.item_id && b.qty > 0)
    if (id) update('items', id, data)
    else insert('items', data)
    toast('已儲存')
    setEdit(null)
  }
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">品項與配方</h1>
        <Search value={q} onChange={setQ} />
        <select className="input" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">全部類型</option>
          {Object.entries(ITEM_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn primary" onClick={() => setEdit({ type: 'raw', unit: 'kg', price: 0, cost: 0, safety_stock: 0, pack_per_box: 1, shelf_days: 0, bom: [], active: true })}>＋ 新增品項</button>
      </div>
      <div className="card">
        <Table rows={rows} onRow={(i) => setEdit(JSON.parse(JSON.stringify(i)))} columns={[
          { h: '編號', r: (i) => i.code },
          { h: '名稱', r: (i) => <b>{i.name}</b> },
          { h: '類型', r: (i) => <Badge kind={i.type === 'product' ? 'primary' : ''}>{ITEM_TYPES[i.type]}</Badge> },
          { h: '規格', r: (i) => <span className="small muted">{i.spec}</span> },
          { h: '單位', r: (i) => i.unit },
          { h: '成本', cls: 'num', r: (i) => money(i.type === 'product' ? i.cost : avgCost(i.id)) },
          { h: '售價', cls: 'num', r: (i) => (i.type === 'product' ? money(i.price) : '—') },
          { h: '配方', r: (i) => (i.type === 'product' ? `${i.bom?.length || 0} 項` : '') },
        ]} />
      </div>
      {edit && (
        <Modal wide title={edit.id ? `編輯 ${edit.name}` : '新增品項'} onClose={() => setEdit(null)}
          footer={<>
            {edit.id && <button className="btn danger" onClick={() => {
              if (where('stock_moves', (m) => m.item_id === edit.id).length) return toast('這個品項已有庫存異動，不能刪除；可改為停用', 'bad')
              if (confirm('確定刪除？')) { remove('items', edit.id); setEdit(null) }
            }}>刪除</button>}
            <label className="row small"><input type="checkbox" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />啟用</label>
            <span style={{ flex: 1 }} />
            <button className="btn" onClick={() => setEdit(null)}>取消</button>
            <button className="btn primary" onClick={save}>儲存</button>
          </>}>
          <div className="stack">
            <div className="form-grid">
              <Field label="編號"><Input value={edit.code} onChange={(v) => setEdit({ ...edit, code: v })} /></Field>
              <Field label="名稱"><Input value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} /></Field>
              <Field label="類型"><Select placeholder={false} value={edit.type} options={Object.entries(ITEM_TYPES).map(([value, label]) => ({ value, label }))} onChange={(v) => setEdit({ ...edit, type: v })} /></Field>
              <Field label="單位"><Input value={edit.unit} onChange={(v) => setEdit({ ...edit, unit: v })} placeholder="kg / 包 / 瓶 / 個" /></Field>
              <Field label="規格"><Input value={edit.spec} onChange={(v) => setEdit({ ...edit, spec: v })} /></Field>
              <Field label={edit.type === 'product' ? '標準成本' : '參考進價'}><Input type="number" value={edit.cost} onChange={(v) => setEdit({ ...edit, cost: v })} /></Field>
              {edit.type === 'product' ? (
                <>
                  <Field label="售價"><Input type="number" value={edit.price} onChange={(v) => setEdit({ ...edit, price: v })} /></Field>
                  <Field label="每箱幾包"><Input type="number" value={edit.pack_per_box} onChange={(v) => setEdit({ ...edit, pack_per_box: v })} /></Field>
                  <Field label="保存天數"><Input type="number" value={edit.shelf_days} onChange={(v) => setEdit({ ...edit, shelf_days: v })} /></Field>
                </>
              ) : (
                <Field label="安全庫存"><Input type="number" value={edit.safety_stock} onChange={(v) => setEdit({ ...edit, safety_stock: v })} /></Field>
              )}
            </div>
            {edit.type === 'product' && (
              <div className="card">
                <div className="card-head"><h3>配方（每 1 {edit.unit || '單位'} 成品需要）</h3></div>
                <div className="card-pad">
                  {(edit.bom || []).map((b, i) => (
                    <div className="row" key={i} style={{ marginBottom: 6, flexWrap: 'nowrap' }}>
                      <div style={{ flex: 1 }}><Select value={b.item_id} options={itemOptions(['raw', 'pack'])} onChange={(v) => setEdit({ ...edit, bom: edit.bom.map((x, j) => (j === i ? { ...x, item_id: v } : x)) })} /></div>
                      <div style={{ width: 110 }}><Input type="number" step="any" value={b.qty} onChange={(v) => setEdit({ ...edit, bom: edit.bom.map((x, j) => (j === i ? { ...x, qty: v } : x)) })} /></div>
                      <span className="small muted" style={{ width: 36 }}>{itemUnit(b.item_id)}</span>
                      <button className="btn sm ghost danger" onClick={() => setEdit({ ...edit, bom: edit.bom.filter((_, j) => j !== i) })}>✕</button>
                    </div>
                  ))}
                  <button className="btn sm" onClick={() => setEdit({ ...edit, bom: [...(edit.bom || []), { item_id: '', qty: '' }] })}>＋ 加原料</button>
                  <div className="muted small" style={{ marginTop: 8 }}>
                    原料成本約 {money((edit.bom || []).reduce((s, b) => s + (b.qty || 0) * avgCost(b.item_id), 0))} / {edit.unit}
                  </div>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

export function Inventory() {
  const [tab, setTab] = useState('raw')
  const [adj, setAdj] = useState(null)
  const items = all('items').filter((i) => (tab === 'raw' ? i.type !== 'product' : i.type === 'product'))
  const lots = all('lots').filter((l) => lotStock(l) > 0)
  const total = all('items').reduce((s, i) => s + (stockOf(i.id) + stockOf(i.id, 'WIP')) * (i.type === 'product' ? lotsValue(i.id) : avgCost(i.id)), 0)
  function lotsValue(id) {
    const ls = all('lots').filter((l) => l.item_id === id)
    const q = ls.reduce((s, l) => s + lotStock(l), 0)
    return q ? ls.reduce((s, l) => s + lotStock(l) * (l.unit_cost || 0), 0) / q : get('items', id)?.cost || 0
  }
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">庫存</h1>
        <span className="muted">庫存總值約 <b>{money(total)}</b></span>
        <button className="btn" onClick={() => setAdj({ item_id: '', qty: '', note: '盤點調整' })}>庫存調整 / 盤點</button>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['raw', '原料與包材'], ['product', '成品'], ['lots', '成品批號']]} />
      {tab !== 'lots' && (
        <div className="card">
          <Table rows={items} columns={[
            { h: '品項', r: (i) => <b>{i.name}</b> },
            { h: '倉庫', cls: 'num', r: (i) => qty(stockOf(i.id), i.unit) },
            { h: '產線上', cls: 'num', r: (i) => qty(stockOf(i.id, 'WIP')) },
            ...(tab === 'raw'
              ? [
                  { h: '安全量', cls: 'num', r: (i) => qty(i.safety_stock) },
                  { h: '平均成本', cls: 'num', r: (i) => money(avgCost(i.id)) },
                  { h: '', r: (i) => (i.safety_stock && stockOf(i.id) < i.safety_stock ? <Badge kind="bad">不足</Badge> : <Badge kind="ok">正常</Badge>) },
                ]
              : [
                  { h: 'QC 合格可出', cls: 'num', r: (i) => qty(all('lots').filter((l) => l.item_id === i.id && l.qc_status === 'pass').reduce((s, l) => s + lotStock(l), 0)) },
                  { h: '待檢', cls: 'num', r: (i) => qty(all('lots').filter((l) => l.item_id === i.id && l.qc_status === 'pending').reduce((s, l) => s + lotStock(l), 0)) },
                  { h: '平均成本', cls: 'num', r: (i) => money(lotsValue(i.id)) },
                ]),
          ]} />
        </div>
      )}
      {tab === 'lots' && (
        <div className="card">
          <Table rows={lots} empty="沒有成品庫存" columns={[
            { h: '批號', r: (l) => <b>{l.lot_no}</b> },
            { h: '產品', r: (l) => itemName(l.item_id) },
            { h: '庫存', cls: 'num', r: (l) => qty(lotStock(l), itemUnit(l.item_id)) },
            { h: '單位成本', cls: 'num', r: (l) => money(l.unit_cost) },
            { h: '製造日', r: (l) => l.mfg_date },
            { h: '有效期限', r: (l) => l.exp_date },
            { h: 'QC', r: (l) => <Badge s={l.qc_status} /> },
          ]} />
        </div>
      )}
      {adj && (
        <Modal title="庫存調整" onClose={() => setAdj(null)}
          footer={<><button className="btn" onClick={() => setAdj(null)}>取消</button><button className="btn primary" onClick={() => {
            if (!adj.item_id || !adj.qty) return toast('請選品項並輸入數量', 'bad')
            if (attempt(() => adjustStock(adj), '庫存已調整')) setAdj(null)
          }}>確認</button></>}>
          <div className="form-grid">
            <Field label="品項"><Select value={adj.item_id} options={itemOptions()} onChange={(v) => setAdj({ ...adj, item_id: v, lot_no: '' })} /></Field>
            {get('items', adj.item_id)?.type === 'product' && (
              <Field label="批號"><Select value={adj.lot_no} options={all('lots').filter((l) => l.item_id === adj.item_id).map((l) => ({ value: l.lot_no, label: `${l.lot_no}（${lotStock(l)}）` }))} onChange={(v) => setAdj({ ...adj, lot_no: v })} /></Field>
            )}
            <Field label={`調整數量（減少請輸入負數）現有 ${qty(stockOf(adj.item_id))}`}><Input type="number" value={adj.qty} onChange={(v) => setAdj({ ...adj, qty: v })} /></Field>
            <Field label="原因"><Input value={adj.note} onChange={(v) => setAdj({ ...adj, note: v })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  )
}

const MOVE_TYPES = { receive: '進貨', issue: '領料', feed: '投料', output: '產出', ship: '出貨', adjust: '調整', return: '退料' }

export function Moves() {
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const rows = all('stock_moves')
    .filter((m) => (!type || m.type === type) && matches(q, itemName(m.item_id), m.lot_no, m.note, m.user_name))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 500)
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">庫存異動</h1>
        <Search value={q} onChange={setQ} />
        <select className="input" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">全部</option>
          {Object.entries(MOVE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="card">
        <Table rows={rows} columns={[
          { h: '時間', r: (m) => <span className="nowrap">{dt(m.date)}</span> },
          { h: '類型', r: (m) => <Badge>{MOVE_TYPES[m.type] || m.type}</Badge> },
          { h: '位置', r: (m) => (m.loc === 'WIP' ? '產線' : '倉庫') },
          { h: '品項', r: (m) => itemName(m.item_id) },
          { h: '數量', cls: 'num', r: (m) => <span style={{ color: m.qty < 0 ? 'var(--bad)' : 'var(--ok)' }}>{m.qty > 0 ? '+' : ''}{qty(m.qty, itemUnit(m.item_id))}</span> },
          { h: '批號', r: (m) => m.lot_no || '' },
          { h: '單據', r: (m) => m.note },
          { h: '經手', r: (m) => m.user_name },
        ]} />
      </div>
    </div>
  )
}
