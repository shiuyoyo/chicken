// 門市收銀台：觸控優先。只顯示門市儲位有庫存（QC 合格、未過期）的品項。
import { useState, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { get, currentUser } from '../db/store'
import * as L from '../logic'
import { Modal, Field, Input, Table, Badge, money, qty, dt, itemName, attempt, ask, toast } from '../ui'

export default function Pos() {
  const nav = useNavigate()
  const bins = L.storeBins()
  const [binId, setBinId] = useState(bins[0]?.id || '')
  const shift = L.openShift(binId)
  if (!bins.length) return <div className="content"><h1>尚未設定門市儲位</h1><p>請到倉儲管理新增一個「門市」類型的倉庫與儲位。</p></div>
  return (
    <div className="pos">
      <header className="pos-top">
        <button onClick={() => nav('/')} aria-label="回後台">←</button>
        <h1>🛍️ {L.binLabel(binId)}</h1>
        {bins.length > 1 && (
          <select value={binId} onChange={(e) => setBinId(e.target.value)} aria-label="門市">
            {bins.map((b) => <option key={b.id} value={b.id}>{L.binLabel(b.id)}</option>)}
          </select>
        )}
        <span className="pos-user">{currentUser().name}{shift ? `｜${shift.no}` : ''}</span>
      </header>
      {shift ? <Register shift={shift} /> : <OpenShift binId={binId} />}
    </div>
  )
}

function OpenShift({ binId }) {
  const [cash, setCash] = useState(3000)
  return (
    <div className="pos-center">
      <div className="card card-pad stack" style={{ maxWidth: 420, width: '100%' }}>
        <h2>開班</h2>
        <p className="muted" style={{ margin: 0 }}>輸入收銀機裡的零用金，日結時會用來對帳。</p>
        <Field label="零用金"><Input type="number" value={cash} onChange={setCash} /></Field>
        <button className="big-btn primary" onClick={() => attempt(() => L.startShift({ bin_id: binId, opening_cash: cash }), '已開班，可以開始收銀')}>開始營業</button>
      </div>
    </div>
  )
}

function Register({ shift }) {
  const [cart, setCart] = useState([])
  const [member, setMember] = useState(null)
  const [discount, setDiscount] = useState(0)
  const [method, setMethod] = useState('現金')
  const [received, setReceived] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [panel, setPanel] = useState(null)
  const [showCart, setShowCart] = useState(false)
  const cat = L.posCatalog(shift.bin_id)
  const inCart = (id) => cart.find((c) => c.item_id === id)?.qty || 0
  const add = (id, n = 1) => {
    const avail = cat.find((c) => c.item.id === id)?.avail || 0
    const next = inCart(id) + n
    if (next > avail) return toast(`門市只剩 ${avail}`, 'bad')
    setCart(next <= 0 ? cart.filter((c) => c.item_id !== id) : cart.some((c) => c.item_id === id) ? cart.map((c) => (c.item_id === id ? { ...c, qty: next } : c)) : [...cart, { item_id: id, qty: next }])
  }
  const price = (id) => Number(get('items', id)?.pos_price || 0)
  const subtotal = L.sum(cart, (c) => c.qty * price(c.item_id))
  const total = Math.max(0, subtotal - (Number(discount) || 0))
  const change = method === '現金' && received !== '' ? Number(received) - total : 0
  const checkout = () => {
    const sale = attempt(() => L.posCheckout({ shift_id: shift.id, cart, discount, method, received: method === '現金' ? (received === '' ? total : received) : undefined, customer_id: member?.id || '' }))
    if (sale) {
      setReceipt(sale)
      setCart([])
      setDiscount(0)
      setReceived('')
      setMember(null)
      setShowCart(false)
    }
  }
  const findMember = async () => {
    const phone = await ask('輸入會員手機', { input: true, placeholder: '0912345678' })
    if (!phone) return
    const m = L.findMember(phone)
    if (m) return setMember(m)
    if (await ask(`查無 ${phone}，要幫客人加入會員嗎？`, { confirmText: '加入會員' })) {
      const name = await ask('會員姓名（可空白）', { input: true, required: false })
      const nm = attempt(() => L.quickMember({ name: name || '', phone }), '已加入會員')
      if (nm) setMember(nm)
    }
  }
  return (
    <div className="pos-body">
      <section className="pos-products" aria-label="商品">
        {cat.length === 0 && <div className="empty">門市沒有可賣的商品。請店長到「倉儲管理 → 調撥 / 補貨到門市」補貨。</div>}
        {cat.map(({ item, price: p, avail }) => (
          <button key={item.id} className={'pos-tile' + (inCart(item.id) ? ' in' : '')} onClick={() => add(item.id)}>
            <b>{item.name}</b>
            <span className="pos-price">{money(p)}</span>
            <span className="small">剩 {qty(avail - inCart(item.id))} {item.unit}</span>
            {inCart(item.id) > 0 && <span className="pos-badge">{inCart(item.id)}</span>}
          </button>
        ))}
        <div className="pos-tools">
          <button className="btn" onClick={() => setPanel('sales')}>今日交易 / 作廢</button>
          <button className="btn" onClick={() => setPanel('close')}>日結</button>
        </div>
      </section>
      <button className="pos-cart-toggle" onClick={() => setShowCart(true)}>🛒 {L.sum(cart, (c) => c.qty)} 件｜{money(total)}　結帳 →</button>
      <section className={'pos-cart' + (showCart ? ' open' : '')} aria-label="購物車">
        <div className="row"><h2 style={{ flex: 1 }}>購物車</h2><button className="icon-btn pos-cart-close" onClick={() => setShowCart(false)} aria-label="收起">×</button></div>
        <div className="pos-lines">
          {cart.length === 0 && <div className="muted">點左邊商品加入</div>}
          {cart.map((c) => (
            <div key={c.item_id} className="pos-line">
              <span style={{ flex: 1 }}>{itemName(c.item_id)}<br /><span className="small muted">{money(price(c.item_id))}</span></span>
              <button onClick={() => add(c.item_id, -1)} aria-label="減一">−</button>
              <b>{c.qty}</b>
              <button onClick={() => add(c.item_id, 1)} aria-label="加一">＋</button>
              <span className="num" style={{ width: 70 }}>{money(c.qty * price(c.item_id))}</span>
            </div>
          ))}
        </div>
        <div className="pos-row">
          <span>會員</span>
          {member ? <span className="row"><b>{member.name}</b><span className="small muted">{member.phone}・{member.points || 0} 點</span><button className="btn sm ghost" onClick={() => setMember(null)}>✕</button></span> : <button className="btn sm" onClick={findMember}>輸入手機</button>}
        </div>
        <div className="pos-row">
          <span>折扣</span>
          <span className="row">
            <Input type="number" value={discount} onChange={setDiscount} style={{ width: 90 }} aria-label="折扣金額" />
            <span className="small muted">收銀員上限 {L.getSetting('pos_max_discount') * 100}%</span>
          </span>
        </div>
        <div className="pos-total"><span>應收</span><b>{money(total)}</b></div>
        <div className="pos-methods">
          {L.POS_METHODS.map((m) => <button key={m} className={method === m ? 'on' : ''} onClick={() => setMethod(m)}>{m}</button>)}
        </div>
        {method === '現金' && (
          <div className="stack" style={{ gap: 8 }}>
            <div className="pos-row"><span>收現</span><Input type="number" value={received} placeholder={String(total)} onChange={setReceived} style={{ width: 120 }} aria-label="收現金額" /></div>
            <div className="pos-quick">{[total, 100, 500, 1000].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => <button key={v} onClick={() => setReceived(v)}>{v === total ? '剛好' : money(v)}</button>)}</div>
            {received !== '' && <div className={'pos-row ' + (change < 0 ? 'tone-bad' : '')}><span>找零</span><b>{money(change)}</b></div>}
          </div>
        )}
        <button className="big-btn ok" disabled={!cart.length || (method === '現金' && received !== '' && change < 0)} onClick={checkout}>結帳 {money(total)}</button>
      </section>
      {receipt && (
        <Modal title="交易完成" onClose={() => setReceipt(null)} footer={<button className="btn primary" onClick={() => setReceipt(null)}>下一位客人</button>}>
          <div className="receipt">
            <div className="center"><b>{L.getSetting('company_name')}</b></div>
            <div className="center small">電子發票 {receipt.gui_no}</div>
            <div className="small">{receipt.no}　{dt(receipt.at)}　收銀 {receipt.cashier}</div>
            <hr />
            {receipt.lines.map((l, i) => <div key={i} className="row small"><span style={{ flex: 1 }}>{itemName(l.item_id)} ×{l.qty}</span><span>{money(l.qty * l.price)}</span></div>)}
            {receipt.discount > 0 && <div className="row small"><span style={{ flex: 1 }}>折扣</span><span>-{money(receipt.discount)}</span></div>}
            <hr />
            <div className="row"><b style={{ flex: 1 }}>合計</b><b>{money(receipt.total)}</b></div>
            <div className="row small"><span style={{ flex: 1 }}>{receipt.method}</span><span>{money(receipt.received)}</span></div>
            {receipt.change > 0 && <div className="row big-change"><span style={{ flex: 1 }}>找零</span><b>{money(receipt.change)}</b></div>}
            {receipt.points > 0 && <div className="small">本次累積 {receipt.points} 點</div>}
          </div>
        </Modal>
      )}
      {panel === 'sales' && <SalesPanel shift={shift} onClose={() => setPanel(null)} />}
      {panel === 'close' && <ClosePanel shift={shift} onClose={() => setPanel(null)} />}
    </div>
  )
}

function SalesPanel({ shift, onClose }) {
  const sales = [...L.shiftSales(shift.id)].reverse()
  const voidIt = async (s) => {
    const reason = await ask(`作廢 ${s.no}（${money(s.total)}）？${L.can('pos', 3) ? '' : '\n收銀員作廢需要店長核准。'}`, { input: true, placeholder: '作廢原因', danger: true, confirmText: '作廢' })
    if (reason) attempt(() => L.voidSale(s.id, reason), '已作廢，庫存已回補')
  }
  return (
    <Modal wide title={`今日交易 ${shift.no}`} onClose={onClose}>
      <Table empty="還沒有交易" rows={sales} columns={[
        { h: '時間', r: (s) => dt(s.at).slice(11) },
        { h: '內容', r: (s) => <span className="small">{s.lines.map((l) => `${itemName(l.item_id)}×${l.qty}`).join('、')}</span> },
        { h: '付款', r: (s) => s.method },
        { h: '金額', cls: 'num', r: (s) => money(s.total) },
        { h: '', r: (s) => (s.status === 'void' ? <Badge kind="bad">已作廢</Badge> : L.pendingFor(s.id) ? <Badge kind="warn">作廢待核准</Badge> : <button className="btn sm danger" onClick={() => voidIt(s)}>作廢</button>) },
      ]} />
    </Modal>
  )
}

function ClosePanel({ shift, onClose }) {
  const s = L.shiftSummary(shift.id)
  const [counted, setCounted] = useState('')
  const diff = counted === '' ? null : Number(counted) - s.expected
  return (
    <Modal title={`日結 ${shift.no}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" disabled={counted === ''} onClick={() => attempt(() => L.closeShift(shift.id, counted), '日結完成') && onClose()}>確認日結</button></>}>
      <div className="stack">
        <dl className="dl">
          <dt>交易筆數</dt><dd>{s.count}（作廢 {s.voids}）</dd>
          <dt>營業額</dt><dd>{money(s.total)}</dd>
          {Object.entries(s.byMethod).map(([m, v]) => <Fragment key={m}><dt>{m}</dt><dd>{money(v)}</dd></Fragment>)}
          <dt>零用金</dt><dd>{money(shift.opening_cash)}</dd>
          <dt>抽屜應有現金</dt><dd><b>{money(s.expected)}</b></dd>
        </dl>
        <Field label="實際點收現金"><Input type="number" value={counted} onChange={setCounted} autoFocus /></Field>
        {diff !== null && <div className={diff ? 'notice warn' : 'notice ok'}>{diff === 0 ? '✓ 現金相符' : `現金${diff > 0 ? '多' : '少'} ${money(Math.abs(diff))}，會記入「現金短溢」`}</div>}
      </div>
    </Modal>
  )
}
