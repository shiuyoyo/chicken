// 掃碼銷貨：選客戶 → 掃描槍嗶商品 → 一鍵產生訂單、出貨單（銷貨單）、應收 / 發票，可直接列印
import { useState } from 'react'
import { all, get, getPref, setPref } from '../db/store'
import * as L from '../logic'
import { Field, Input, Select, Check, Table, Badge, money, itemName, itemUnit, partyOptions, attempt, toast, ScanBox, useScanner, PrintButton } from '../ui'

export default function QuickSale() {
  const [customer, setCustomer] = useState(getPref('quickSaleCustomer', ''))
  const [lines, setLines] = useState([])
  const [pack, setPack] = useState('紙箱')
  const [invoice, setInvoice] = useState(true)
  const [done, setDone] = useState(null)
  const canRun = L.can('sales', 2) && L.can('shipping', 2)
  const date = L.today()
  const priceOf = (id) => (customer ? L.priceFor(customer, id, date) : get('items', id)?.price || 0)
  const scan = (code) => {
    const it = L.itemByCode(code)
    if (!it) return toast(`找不到條碼 / 料號「${code}」`, 'bad')
    if (!['product', 'semi'].includes(it.type)) return toast(`${it.name} 不是可銷售的品項`, 'bad')
    setDone(null)
    setLines((ls) => (ls.some((l) => l.item_id === it.id) ? ls.map((l) => (l.item_id === it.id ? { ...l, qty: l.qty + 1 } : l)) : [...ls, { item_id: it.id, qty: 1, price: priceOf(it.id) }]))
  }
  useScanner(scan, canRun)
  const pickCustomer = (v) => {
    setCustomer(v)
    setPref('quickSaleCustomer', v)
    setLines((ls) => ls.map((l) => ({ ...l, price: v ? L.priceFor(v, l.item_id, date) : l.price })))
  }
  const amount = L.sum(lines, (l) => l.qty * l.price)
  const tax = L.round(amount * L.taxRate())
  const run = () => {
    if (!customer) return toast('請先選客戶', 'bad')
    const r = attempt(() => L.quickSale({ customer_id: customer, lines, pack_mode: pack, invoice, date }))
    if (!r) return
    if (r.pending) {
      setDone({ so: r.so, pending: true })
    } else {
      toast(`已完成：${r.shipment.no}${r.invoice ? `，發票 ${r.invoice.gui_no}` : ''}`)
      setDone(r)
    }
    setLines([])
  }
  const stock = (id) => L.stockOf(id)
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">掃碼銷貨</h1>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        選好客戶後用掃描槍嗶商品（嗶同一個會加 1），確認後一次產生訂單、出貨單（銷貨單）、應收帳款與發票，並從倉庫依先到期先出扣庫存。價格自動帶客戶價格表與進行中的促銷活動。
      </p>
      {!canRun && <div className="notice warn">需要「銷售」與「出貨」的編輯權限</div>}
      <div className="form-grid">
        <Field label="客戶"><Select value={customer} options={partyOptions('customers', (c) => c.kind !== 'member' && c.status !== '停止往來')} onChange={pickCustomer} /></Field>
        <Field label="包裝"><Select placeholder={false} value={pack} options={L.PACK_MODES.map((m) => ({ value: m, label: m }))} onChange={setPack} /></Field>
        <Check checked={invoice} onChange={setInvoice} label="同時開立應收與發票" />
      </div>
      <ScanBox onCode={scan} />
      <div className="card">
        <Table empty="還沒有掃描商品" rows={lines.map((l, i) => ({ ...l, i }))} columns={[
          { h: '品項', r: (l) => <><b>{itemName(l.item_id)}</b><div className="small muted">{get('items', l.item_id)?.code}・可用庫存 {stock(l.item_id)}</div></> },
          { h: '單價', cls: 'num', r: (l) => <>{money(l.price)}{l.price < (get('items', l.item_id)?.price || 0) && <> <Badge kind="ok">特價</Badge></>}</> },
          { h: '數量', r: (l) => <Input type="number" style={{ width: 90 }} value={l.qty} onChange={(v) => setLines(lines.map((x, j) => (j === l.i ? { ...x, qty: Number(v) || 0 } : x)))} /> },
          { h: '單位', r: (l) => itemUnit(l.item_id) },
          { h: '小計', cls: 'num', r: (l) => money(l.qty * l.price) },
          { h: '', r: (l) => <button className="btn sm ghost danger" aria-label="移除" onClick={() => setLines(lines.filter((_, j) => j !== l.i))}>✕</button> },
        ]} />
        <div className="card-pad row" style={{ justifyContent: 'flex-end' }}>
          <span className="muted">未稅 {money(amount)}　稅 {money(tax)}</span>
          <b style={{ fontSize: 20 }}>合計 {money(amount + tax)}</b>
          <button className="btn primary" disabled={!lines.length || !canRun} onClick={run}>建立銷貨單</button>
        </div>
      </div>
      {done && !done.pending && (
        <div className="card card-pad stack">
          <b>✅ 已建立：訂單 {done.so.no}、出貨單 {done.shipment.no}{done.invoice && `、應收 ${done.invoice.no}（發票 ${done.invoice.gui_no}）`}</b>
          <div className="row">
            <PrintButton type="shipment" id={done.shipment.id} label="銷貨單 A4" />
            <PrintButton type="shipment" id={done.shipment.id} label="三聯單（點陣）" params={{ paper: 'dm' }} />
            {done.invoice && <PrintButton type="einvoice" id={`invoices:${done.invoice.id}`} label="電子發票證明聯" />}
            <PrintButton type="ship_label" id={done.shipment.id} label="出貨嘜頭" />
          </div>
        </div>
      )}
      {done?.pending && <div className="notice warn">訂單 {done.so.no} 需要主管核准（{L.pendingFor(done.so.id)?.reason}），核准後到「出貨」出貨。</div>}
      <p className="small muted">客戶清單裡沒有的散客，可以先建一個「現場散客」客戶。共 {all('customers').filter((c) => c.kind !== 'member').length} 個客戶。</p>
    </div>
  )
}
