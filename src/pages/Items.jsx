import { useState } from 'react'
import { all, where } from '../db/store'
import * as L from '../logic'
import { Modal, Field, Input, Select, Check, Table, Badge, Search, matches, money, qty, itemUnit, itemOptions, binOptions, attempt, ask } from '../ui'

export const ITEM_TYPES = { raw: '原料', pack: '包材', product: '成品' }

export function Items() {
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [edit, setEdit] = useState(null)
  const canEdit = L.can('master', 2)
  const rows = all('items').filter((i) => (!type || i.type === type) && matches(q, i.code, i.name, i.barcode))
  const save = () => {
    const { id, created_at, updated_at, ...data } = edit
    data.bom = (data.bom || []).filter((b) => b.item_id)
    if (attempt(() => L.saveMaster('items', data, id), '已儲存')) setEdit(null)
  }
  const set = (k) => (v) => setEdit({ ...edit, [k]: v })
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">品項與配方</h1>
        <Search value={q} onChange={setQ} placeholder="編號 / 名稱 / 條碼" />
        <select className="input auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="類型">
          <option value="">全部類型</option>
          {Object.entries(ITEM_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {canEdit && <button className="btn primary" onClick={() => setEdit({ type: 'raw', unit: 'kg', temp_zone: '常溫', price: 0, cost: 0, min_price: 0, safety_stock: 0, pack_per_box: 1, shelf_days: 365, bom: [], active: true, alt_unit: '', alt_factor: 0 })}>＋ 新增品項</button>}
      </div>
      <div className="card">
        <Table rows={rows} onRow={(i) => setEdit(JSON.parse(JSON.stringify(i)))} columns={[
          { h: '編號', r: (i) => i.code },
          { h: '名稱', r: (i) => <><b>{i.name}</b>{i.active === false && <Badge kind="bad">停用</Badge>}<div className="small muted">{i.spec}</div></> },
          { h: '類型', r: (i) => <Badge kind={i.type === 'product' ? 'primary' : ''}>{ITEM_TYPES[i.type]}</Badge> },
          { h: '溫層', r: (i) => i.temp_zone },
          { h: '單位', r: (i) => `${i.unit}${i.alt_unit ? `（1${i.alt_unit}=${i.alt_factor}${i.unit}）` : ''}` },
          { h: '預設儲位', r: (i) => <span className="small">{L.binLabel(i.default_bin_id)}</span> },
          { h: '成本', cls: 'num', r: (i) => money(i.type === 'product' ? L.bomCost(i.id) : L.lastCost(i.id)) },
          { h: '售價 / 門市價', cls: 'num', r: (i) => (i.type === 'product' ? `${money(i.price)} / ${i.pos_enabled ? money(i.pos_price) : '—'}` : '—') },
          { h: '規則', r: (i) => <span className="row small">{i.iqc_required && <Badge>需 IQC</Badge>}{i.pos_enabled && <Badge kind="info">門市販售</Badge>}{i.min_price > 0 && <Badge>底價 {i.min_price}</Badge>}</span> },
        ]} />
      </div>
      {edit && (
        <Modal wide title={edit.id ? `編輯 ${edit.name}` : '新增品項'} onClose={() => setEdit(null)}
          footer={canEdit ? <>
            {edit.id && <button className="btn danger" onClick={async () => (await ask('刪除這個品項？', { danger: true })) && attempt(() => L.deleteMaster('items', edit.id), '已刪除') && setEdit(null)}>刪除</button>}
            <Check checked={edit.active !== false} onChange={set('active')} label="啟用" />
            <span style={{ flex: 1 }} />
            <button className="btn" onClick={() => setEdit(null)}>取消</button>
            <button className="btn primary" onClick={save}>儲存</button>
          </> : <button className="btn" onClick={() => setEdit(null)}>關閉</button>}>
          <div className="stack">
            <div className="form-grid">
              <Field label="編號"><Input value={edit.code} onChange={set('code')} /></Field>
              <Field label="名稱"><Input value={edit.name} onChange={set('name')} /></Field>
              <Field label="類型"><Select placeholder={false} value={edit.type} options={Object.entries(ITEM_TYPES).map(([value, label]) => ({ value, label }))} onChange={set('type')} /></Field>
              <Field label="規格"><Input value={edit.spec} onChange={set('spec')} /></Field>
              <Field label="基本單位"><Input value={edit.unit} onChange={set('unit')} placeholder="kg / 包 / 瓶 / 個" /></Field>
              <Field label="包裝單位（選填）" hint="現場可以用箱、捆計數"><Input value={edit.alt_unit} onChange={set('alt_unit')} placeholder="箱" /></Field>
              <Field label={`1 ${edit.alt_unit || '包裝單位'} = 幾 ${edit.unit || '基本單位'}`}><Input type="number" value={edit.alt_factor} onChange={set('alt_factor')} /></Field>
              <Field label="條碼"><Input value={edit.barcode} onChange={set('barcode')} /></Field>
              <Field label="溫層"><Select placeholder={false} value={edit.temp_zone} options={L.TEMP_ZONES.map((t) => ({ value: t, label: t }))} onChange={set('temp_zone')} /></Field>
              <Field label="預設儲位" hint="進貨 / 產出時預設放這裡，會檢查溫層"><Select value={edit.default_bin_id} options={binOptions(['storage'])} onChange={set('default_bin_id')} /></Field>
              <Field label="保存天數"><Input type="number" value={edit.shelf_days} onChange={set('shelf_days')} /></Field>
              {edit.type === 'product' ? (
                <>
                  <Field label="標準售價"><Input type="number" value={edit.price} onChange={set('price')} /></Field>
                  <Field label="最低售價" hint="訂單低於此價需主管核准"><Input type="number" value={edit.min_price} onChange={set('min_price')} /></Field>
                  <Field label="每箱幾包"><Input type="number" value={edit.pack_per_box} onChange={set('pack_per_box')} /></Field>
                  <Field label="門市售價（含稅）"><Input type="number" value={edit.pos_price} onChange={set('pos_price')} /></Field>
                  <Check checked={edit.pos_enabled} onChange={set('pos_enabled')} label="在門市 POS 販售" />
                </>
              ) : (
                <>
                  <Field label="參考進價"><Input type="number" value={edit.cost} onChange={set('cost')} /></Field>
                  <Field label="安全庫存"><Input type="number" value={edit.safety_stock} onChange={set('safety_stock')} /></Field>
                  <Check checked={edit.iqc_required} onChange={set('iqc_required')} label="進貨需進料檢驗（IQC 合格才能領用）" />
                </>
              )}
            </div>
            {edit.type === 'product' && (
              <div className="card">
                <div className="card-head"><h3 className="grow">配方 BOM（每 1 {edit.unit || '單位'} 成品用量）</h3></div>
                <div className="card-pad stack">
                  {(edit.bom || []).map((b, i) => (
                    <div className="row" key={i} style={{ flexWrap: 'nowrap' }}>
                      <div style={{ flex: 1 }}><Select value={b.item_id} options={itemOptions(['raw', 'pack'])} onChange={(v) => setEdit({ ...edit, bom: edit.bom.map((x, j) => (j === i ? { ...x, item_id: v } : x)) })} /></div>
                      <div style={{ width: 110 }}><Input type="number" step="any" value={b.qty} onChange={(v) => setEdit({ ...edit, bom: edit.bom.map((x, j) => (j === i ? { ...x, qty: v } : x)) })} /></div>
                      <span className="small muted" style={{ width: 70 }}>{itemUnit(b.item_id)}・{money((b.qty || 0) * L.lastCost(b.item_id))}</span>
                      <button className="btn sm ghost danger" aria-label="移除" onClick={() => setEdit({ ...edit, bom: edit.bom.filter((_, j) => j !== i) })}>✕</button>
                    </div>
                  ))}
                  <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEdit({ ...edit, bom: [...(edit.bom || []), { item_id: '', qty: '' }] })}>＋ 加原料</button>
                  <div className="muted small">
                    標準成本約 {money(L.sum(edit.bom || [], (b) => (b.qty || 0) * L.lastCost(b.item_id)))} / {edit.unit}
                    {edit.price > 0 && `，毛利率約 ${Math.round((1 - L.sum(edit.bom || [], (b) => (b.qty || 0) * L.lastCost(b.item_id)) / edit.price) * 100)}%`}
                    {edit.id && `・使用中的工單 ${where('work_orders', (w) => w.product_id === edit.id && !['closed', 'cancelled'].includes(w.status)).length} 張`}
                  </div>
                </div>
              </div>
            )}
            {edit.id && <p className="small muted" style={{ margin: 0 }}>目前庫存：倉庫 {qty(L.stockOf(edit.id), edit.unit)}・產線 {qty(L.lineStock(edit.id))}・門市 {qty(L.onHand({ item_id: edit.id, kinds: ['store'] }))}</p>}
          </div>
        </Modal>
      )}
    </div>
  )
}
