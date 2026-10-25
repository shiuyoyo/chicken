import { useState } from 'react'
import { all, get, where } from '../db/store'
import * as L from '../logic'
import { Modal, Field, Input, Select, Check, Table, Badge, Tabs, Search, matches, money, qty, itemName, itemUnit, itemOptions, binOptions, attempt, ask, toast } from '../ui'

export const ITEM_TYPES = L.ITEM_TYPES
const TYPE_BADGE = { product: 'primary', semi: 'info', raw: '', pack: '' }
const cost = (i) => (L.isMade(i) && i.bom?.length ? L.bomCost(i.id) : L.lastCost(i.id))

export function Items() {
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [cat, setCat] = useState('')
  const [edit, setEdit] = useState(null)
  const [tab, setTab] = useState('basic')
  const [variant, setVariant] = useState(null)
  const canEdit = L.can('master', 2)
  const cats = [...new Set(all('items').map((i) => i.category).filter(Boolean))]
  const rows = all('items').filter((i) => (!type || i.type === type) && (!cat || i.category === cat) && matches(q, i.code, i.name, i.barcode, i.category, i.variant_value))
  const open = (i) => {
    setTab('basic')
    setEdit(JSON.parse(JSON.stringify(i)))
  }
  const save = () => {
    const { id, created_at, updated_at, ...data } = edit
    data.bom = L.isMade(data) ? (data.bom || []).filter((b) => b.item_id) : []
    if (attempt(() => L.saveMaster('items', data, id), '已儲存')) setEdit(null)
  }
  const set = (k) => (v) => setEdit({ ...edit, [k]: v })
  const made = L.isMade(edit)
  const bomCostNow = L.sum(edit?.bom || [], (b) => (b.qty || 0) * (b.item_id ? cost(get('items', b.item_id)) : 0))
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">品項與 BOM</h1>
        <Search value={q} onChange={setQ} placeholder="編號 / 名稱 / 條碼 / 分類" />
        <select className="input auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="類型">
          <option value="">全部類型</option>
          {Object.entries(ITEM_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {cats.length > 0 && (
          <select className="input auto" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="分類">
            <option value="">全部分類</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {canEdit && <button className="btn primary" onClick={() => open({ type: 'raw', unit: '個', temp_zone: '', price: 0, cost: 0, min_price: 0, safety_stock: 0, pack_per_box: 1, shelf_days: 365, bom: [], active: true, alt_unit: '', alt_factor: 0, category: '' })}>＋ 新增品項</button>}
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        不限食品：成品、半成品都可以當別的品項的零件（例如醬汁 → 調理包 → 禮盒、零件 → 組件 → 整機）。同一種東西有不同口味、顏色、尺寸時，用「變化款」各自開一個料號，庫存、批號、成本分開算。
      </p>
      <div className="card">
        <Table rows={rows} onRow={open} columns={[
          { h: '料號', r: (i) => i.code },
          { h: '名稱', r: (i) => <><b>{i.name}</b>{i.active === false && <Badge kind="bad">停用</Badge>}<div className="small muted">{[i.category, i.spec].filter(Boolean).join('・')}</div></> },
          { h: '類型', r: (i) => <Badge kind={TYPE_BADGE[i.type]}>{ITEM_TYPES[i.type]}</Badge> },
          { h: '系列 / 變化', r: (i) => (i.family_code ? <span className="small">{i.family_code}{i.variant_value && <> ・<b>{i.variant_attr}：{i.variant_value}</b></>}</span> : '—') },
          { h: '單位', r: (i) => `${i.unit}${i.alt_unit ? `（1${i.alt_unit}=${i.alt_factor}${i.unit}）` : ''}` },
          { h: '預設儲位', r: (i) => <span className="small">{L.binLabel(i.default_bin_id)}{i.temp_zone && <span className="muted">・{i.temp_zone}</span>}</span> },
          { h: '成本', cls: 'num', r: (i) => money(cost(i)) },
          { h: '售價 / 門市價', cls: 'num', r: (i) => (L.isMade(i) && i.price > 0 ? `${money(i.price)} / ${i.pos_enabled ? money(i.pos_price) : '—'}` : '—') },
          { h: '規則', r: (i) => <span className="row small">
            {i.bom?.length > 0 && <Badge>BOM {i.bom.length} 項{i.bom.some((b) => L.isMade(get('items', b.item_id))) ? '・多階' : ''}</Badge>}
            {i.iqc_required && <Badge>需 IQC</Badge>}
            {L.isMade(i) && i.qc_required === false && <Badge>免 QC</Badge>}
            {i.exp_rule === 'min_component' && <Badge>效期取組件</Badge>}
            {i.pos_enabled && <Badge kind="info">門市販售</Badge>}
            {i.min_price > 0 && <Badge>底價 {i.min_price}</Badge>}
          </span> },
        ]} />
      </div>
      {edit && (
        <Modal wide title={edit.id ? `編輯 ${edit.code} ${edit.name}` : '新增品項'} onClose={() => setEdit(null)}
          footer={canEdit ? <>
            {edit.id && <button className="btn danger" onClick={async () => (await ask('刪除這個品項？', { danger: true })) && attempt(() => L.deleteMaster('items', edit.id), '已刪除') && setEdit(null)}>刪除</button>}
            {edit.id && <button className="btn" onClick={() => setVariant({ base: edit, attr: edit.variant_attr || '口味', values: '' })}>建立變化款</button>}
            <Check checked={edit.active !== false} onChange={set('active')} label="啟用" />
            <span style={{ flex: 1 }} />
            <button className="btn" onClick={() => setEdit(null)}>取消</button>
            <button className="btn primary" onClick={save}>儲存</button>
          </> : <button className="btn" onClick={() => setEdit(null)}>關閉</button>}>
          <div className="stack">
            <Tabs value={tab} onChange={setTab} tabs={[
              ['basic', '基本資料'],
              ...(made ? [['bom', `BOM 組成${edit.bom?.length ? `（${edit.bom.length}）` : ''}`], ['tree', '多階展開']] : []),
              ...(edit.id ? [['used', `用在哪裡（${L.whereUsed(edit.id).length}）`]] : []),
              ...(edit.family_code ? [['family', `同系列（${L.familyOf(edit).length}）`]] : []),
            ]} />
            {tab === 'basic' && (
              <div className="form-grid">
                <Field label="料號"><Input value={edit.code} onChange={set('code')} /></Field>
                <Field label="名稱"><Input value={edit.name} onChange={set('name')} /></Field>
                <Field label="類型"><Select placeholder={false} value={edit.type} options={Object.entries(ITEM_TYPES).map(([value, label]) => ({ value, label }))} onChange={set('type')} /></Field>
                <Field label="分類" hint="自由輸入，例如：調味料、螺絲、禮盒"><Input value={edit.category} onChange={set('category')} list="item-cats" /></Field>
                <datalist id="item-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
                <Field label="規格"><Input value={edit.spec} onChange={set('spec')} /></Field>
                <Field label="基本單位"><Input value={edit.unit} onChange={set('unit')} placeholder="kg / 包 / 瓶 / 個 / 組" /></Field>
                <Field label="包裝單位（選填）" hint="現場可以用箱、捆計數"><Input value={edit.alt_unit} onChange={set('alt_unit')} placeholder="箱" /></Field>
                <Field label={`1 ${edit.alt_unit || '包裝單位'} = 幾 ${edit.unit || '基本單位'}`}><Input type="number" value={edit.alt_factor} onChange={set('alt_factor')} /></Field>
                <Field label="條碼"><Input value={edit.barcode} onChange={set('barcode')} /></Field>
                <Field label="系列代號（選填）" hint="同一系列的變化款填一樣的代號"><Input value={edit.family_code} onChange={set('family_code')} /></Field>
                {edit.family_code && <Field label="變化屬性"><Input value={edit.variant_attr} onChange={set('variant_attr')} placeholder="口味 / 顏色 / 尺寸" /></Field>}
                {edit.family_code && <Field label="這個料號的選項"><Input value={edit.variant_value} onChange={set('variant_value')} placeholder="甘味 / 薄鹽" /></Field>}
                <Field label="溫層（選填）" hint="不需要溫控的留空"><Select value={edit.temp_zone} placeholder="不需要" options={L.TEMP_ZONES.map((t) => ({ value: t, label: t }))} onChange={set('temp_zone')} /></Field>
                <Field label="預設儲位" hint="進貨 / 產出時預設放這裡，有溫層會檢查"><Select value={edit.default_bin_id} options={binOptions(['storage'])} onChange={set('default_bin_id')} /></Field>
                <Field label="效期規則"><Select placeholder={false} value={edit.exp_rule || 'shelf'} options={Object.entries(L.EXP_RULES).filter(([k]) => made || k !== 'min_component').map(([value, label]) => ({ value, label }))} onChange={set('exp_rule')} /></Field>
                {(edit.exp_rule || 'shelf') !== 'none' && <Field label="保存天數"><Input type="number" value={edit.shelf_days} onChange={set('shelf_days')} /></Field>}
                {made ? (
                  <>
                    <Field label="標準售價"><Input type="number" value={edit.price} onChange={set('price')} /></Field>
                    <Field label="最低售價" hint="訂單低於此價需主管核准"><Input type="number" value={edit.min_price} onChange={set('min_price')} /></Field>
                    <Field label="每箱幾個"><Input type="number" value={edit.pack_per_box} onChange={set('pack_per_box')} /></Field>
                    <Field label="門市售價（含稅）"><Input type="number" value={edit.pos_price} onChange={set('pos_price')} /></Field>
                    <Field label="檢驗範本"><Select value={edit.qc_template} placeholder="依預設（食品成品）" options={Object.keys(L.qcTemplates()).map((k) => ({ value: k, label: k }))} onChange={set('qc_template')} /></Field>
                    <Check checked={edit.qc_required !== false} onChange={(v) => setEdit({ ...edit, qc_required: v })} label="產出後要 QC 合格才能出貨 / 被領用" />
                    <Check checked={edit.pos_enabled} onChange={set('pos_enabled')} label="在門市 POS 販售" />
                  </>
                ) : (
                  <>
                    <Field label="參考進價"><Input type="number" value={edit.cost} onChange={set('cost')} /></Field>
                    <Field label="安全庫存"><Input type="number" value={edit.safety_stock} onChange={set('safety_stock')} /></Field>
                    <Field label="進料檢驗範本"><Select value={edit.qc_template} placeholder="依預設（食品進料）" options={Object.keys(L.qcTemplates()).map((k) => ({ value: k, label: k }))} onChange={set('qc_template')} /></Field>
                    <Check checked={edit.iqc_required} onChange={set('iqc_required')} label="進貨需進料檢驗（IQC 合格才能領用）" />
                  </>
                )}
              </div>
            )}
            {tab === 'bom' && made && (
              <div className="stack">
                <p className="small muted" style={{ margin: 0 }}>每 1 {edit.unit || '單位'} 用量。可以選原料、包材 / 零件，也可以選半成品或其他成品（組裝、禮盒）。</p>
                {(edit.bom || []).map((b, i) => (
                  <div className="row" key={i} style={{ flexWrap: 'nowrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}><Select value={b.item_id} options={itemOptions().filter((o) => o.value !== edit.id)} onChange={(v) => setEdit({ ...edit, bom: edit.bom.map((x, j) => (j === i ? { ...x, item_id: v } : x)) })} /></div>
                    <div style={{ width: 90 }}><Input type="number" step="any" value={b.qty} onChange={(v) => setEdit({ ...edit, bom: edit.bom.map((x, j) => (j === i ? { ...x, qty: v } : x)) })} /></div>
                    <span className="small muted" style={{ width: 84 }}>{itemUnit(b.item_id)}{b.item_id && L.isMade(get('items', b.item_id)) && <Badge kind="info">自製</Badge>}<br />{money((b.qty || 0) * (b.item_id ? cost(get('items', b.item_id)) : 0))}</span>
                    <button className="btn sm ghost danger" aria-label="移除" onClick={() => setEdit({ ...edit, bom: edit.bom.filter((_, j) => j !== i) })}>✕</button>
                  </div>
                ))}
                <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEdit({ ...edit, bom: [...(edit.bom || []), { item_id: '', qty: '' }] })}>＋ 加用料</button>
                <div className="muted small">
                  標準成本約 {money(bomCostNow)} / {edit.unit}
                  {edit.price > 0 && `，毛利率約 ${Math.round((1 - bomCostNow / edit.price) * 100)}%`}
                  {edit.id && `・使用中的工單 ${where('work_orders', (w) => w.product_id === edit.id && !['closed', 'cancelled'].includes(w.status)).length} 張`}
                </div>
              </div>
            )}
            {tab === 'tree' && made && <BomTree item={edit} />}
            {tab === 'used' && edit.id && (
              <Table empty="沒有被其他品項使用" rows={L.whereUsed(edit.id)} columns={[
                { h: '層級', r: (u) => (u.level ? `間接（第 ${u.level + 1} 層）` : '直接') },
                { h: '用在', r: (u) => <span style={{ paddingLeft: u.level * 16 }}>{u.level > 0 && '└ '}{get('items', u.item_id)?.code} {itemName(u.item_id)}</span> },
                { h: '類型', r: (u) => ITEM_TYPES[get('items', u.item_id)?.type] },
                { h: '每單位用量', cls: 'num', r: (u) => u.per },
              ]} />
            )}
            {tab === 'family' && edit.family_code && (
              <Table rows={L.familyOf(edit)} onRow={(i) => i.id !== edit.id && open(i)} columns={[
                { h: '料號', r: (i) => <b>{i.code}</b> },
                { h: '名稱', r: (i) => i.name },
                { h: edit.variant_attr || '選項', r: (i) => i.variant_value || '—' },
                { h: '可用庫存', cls: 'num', r: (i) => qty(L.stockOf(i.id), i.unit) },
                { h: '成本', cls: 'num', r: (i) => money(cost(i)) },
              ]} />
            )}
            {edit.id && <p className="small muted" style={{ margin: 0 }}>目前庫存：倉庫 {qty(L.stockOf(edit.id), edit.unit)}・產線 {qty(L.lineStock(edit.id))}・門市 {qty(L.onHand({ item_id: edit.id, kinds: ['store'] }))}{made && L.openWOQty(edit.id) > 0 && `・生產中 ${qty(L.openWOQty(edit.id))}`}</p>}
          </div>
        </Modal>
      )}
      {variant && (
        <Modal title={`建立變化款：${variant.base.name}`} onClose={() => setVariant(null)}
          footer={<>
            <button className="btn" onClick={() => setVariant(null)}>取消</button>
            <button className="btn primary" onClick={() => {
              const r = attempt(() => L.createVariants(variant.base.id, variant.attr, variant.values.split(/[,，、\n]/)))
              if (r) {
                toast(`已建立 ${r.length} 個料號：${r.map((x) => x.code).join('、')}`)
                setVariant(null)
                setEdit(null)
              }
            }}>建立</button>
          </>}>
          <div className="stack">
            <p className="small muted" style={{ margin: 0 }}>例如同一款醬油有甘味、薄鹽兩種口味，會各自開一個料號（{variant.base.code}-01、-02…），複製這個品項的單位、儲位、BOM、售價，之後可以各自修改。</p>
            <Field label="屬性名稱"><Input value={variant.attr} onChange={(v) => setVariant({ ...variant, attr: v })} placeholder="口味 / 顏色 / 尺寸" /></Field>
            <Field label="選項（用逗號或頓號分開）"><Input value={variant.values} onChange={(v) => setVariant({ ...variant, values: v })} placeholder="甘味、薄鹽" /></Field>
          </div>
        </Modal>
      )}
    </div>
  )
}

// 多階展開：一路展開到外購料，下面彙總總用量與目前庫存
function BomTree({ item }) {
  const [n, setN] = useState(1)
  const tree = item.id ? L.bomTree(item.id, Number(n) || 1) : []
  const flat = L.flattenTree(tree)
  const leaf = {}
  for (const x of flat) if (!x.children.length) leaf[x.item_id] = L.round((leaf[x.item_id] || 0) + x.qty, 4)
  if (!item.id) return <p className="muted">先儲存品項才能展開。</p>
  return (
    <div className="stack">
      <div className="row"><span>做</span><div style={{ width: 100 }}><Input type="number" value={n} onChange={setN} /></div><span>{item.unit}，需要：</span></div>
      <Table empty="還沒有設定 BOM" rows={flat} columns={[
        { h: '階', r: (x) => x.level + 1 },
        { h: '品項', r: (x) => <span style={{ paddingLeft: x.level * 18 }}>{x.level > 0 && '└ '}<b>{get('items', x.item_id)?.code}</b> {itemName(x.item_id)}{x.children.length > 0 && <> <Badge kind="info">{ITEM_TYPES[get('items', x.item_id)?.type]}</Badge></>}</span> },
        { h: '每單位', cls: 'num', r: (x) => x.per },
        { h: '總用量', cls: 'num', r: (x) => qty(x.qty, itemUnit(x.item_id)) },
        { h: '可用庫存', cls: 'num', r: (x) => qty(L.stockOf(x.item_id)) },
      ]} />
      <h4 style={{ margin: 0 }}>外購料彙總（不扣半成品庫存）</h4>
      <Table rows={Object.entries(leaf).map(([item_id, q]) => ({ item_id, q }))} columns={[
        { h: '品項', r: (x) => itemName(x.item_id) },
        { h: '需要', cls: 'num', r: (x) => qty(x.q, itemUnit(x.item_id)) },
        { h: '可用庫存', cls: 'num', r: (x) => { const s = L.stockOf(x.item_id); return <span className={s < x.q ? 'tone-bad' : ''}>{qty(s)}</span> } },
      ]} />
    </div>
  )
}
