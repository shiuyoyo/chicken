import { useState } from 'react'
import { all, get } from '../db/store'
import { ACCOUNTS, accountType, balances, receivePayment, payBill, recordExpense, postJournal, today, round } from '../logic'
import { Modal, Field, Input, Select, Table, Badge, Tabs, Kpi, money, partyName, attempt, toast } from '../ui'

const acctOptions = (prefix) =>
  Object.entries(ACCOUNTS)
    .filter(([k]) => !prefix || prefix.some((p) => k.startsWith(p)))
    .map(([value, n]) => ({ value, label: `${value} ${n}` }))

export default function Accounting() {
  const [tab, setTab] = useState('ar')
  const [pay, setPay] = useState(null)
  const [exp, setExp] = useState(null)
  const [jv, setJv] = useState(null)
  const month = today().slice(0, 7)
  const [from, setFrom] = useState(month + '-01')
  const [to, setTo] = useState(today())

  const aging = (due) => {
    const d = Math.floor((new Date(today()) - new Date(due)) / 86400000)
    return d > 0 ? <Badge kind="bad">逾期 {d} 天</Badge> : <span className="muted small">{-d} 天後到期</span>
  }
  const arOpen = all('invoices').filter((i) => i.status !== 'paid')
  const apOpen = all('bills').filter((b) => b.status !== 'paid')
  const b = balances(from, to)
  const net = (code) => (b[code]?.debit || 0) - (b[code]?.credit || 0)
  const revenue = -net(4100)
  const cogs = Object.keys(ACCOUNTS).filter((k) => k.startsWith('5')).reduce((s, k) => s + net(k), 0)
  const opex = Object.keys(ACCOUNTS).filter((k) => k.startsWith('6')).reduce((s, k) => s + net(k), 0)
  const bAll = balances()
  const cash = (bAll[1100]?.debit || 0) - (bAll[1100]?.credit || 0)

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">會計</h1>
        <button className="btn" onClick={() => setJv({ date: today(), memo: '', lines: [{ account: '', debit: '', credit: '' }, { account: '', debit: '', credit: '' }] })}>手動傳票</button>
        <button className="btn primary" onClick={() => setExp({ account: '6900', amount: '', memo: '', date: today() })}>＋ 記一筆費用</button>
      </div>
      <div className="grid grid-kpi">
        <Kpi label="現金及銀行" value={money(cash)} />
        <Kpi label="應收未收" value={money(arOpen.reduce((s, i) => s + i.total - (i.paid || 0), 0))} sub={`${arOpen.length} 筆`} />
        <Kpi label="應付未付" value={money(apOpen.reduce((s, i) => s + i.total - (i.paid || 0), 0))} sub={`${apOpen.length} 筆`} />
        <Kpi label="期間淨利" value={money(revenue - cogs - opex)} sub={`${from} ~ ${to}`} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['ar', '應收帳款'], ['ap', '應付帳款'], ['pay', '收付款紀錄'], ['pl', '損益表'], ['tb', '試算表'], ['jv', '傳票']]} />

      {tab === 'ar' && (
        <div className="card">
          <Table rows={[...all('invoices')].reverse()} columns={[
            { h: '單號', r: (i) => <b>{i.no}</b> },
            { h: '客戶', r: (i) => partyName('customers', i.customer_id) },
            { h: '出貨單', r: (i) => get('shipments', i.shipment_id)?.no },
            { h: '日期', r: (i) => i.date },
            { h: '含稅金額', cls: 'num', r: (i) => money(i.total) },
            { h: '已收', cls: 'num', r: (i) => money(i.paid) },
            { h: '到期', r: (i) => (i.status === 'paid' ? <Badge s="paid" /> : aging(i.due_date)) },
            { h: '', r: (i) => i.status !== 'paid' && <button className="btn sm primary" onClick={() => setPay({ kind: 'in', id: i.id, amount: round(i.total - (i.paid || 0)), method: '匯款', date: today() })}>收款</button> },
          ]} />
        </div>
      )}
      {tab === 'ap' && (
        <div className="card">
          <Table rows={[...all('bills')].reverse()} columns={[
            { h: '單號', r: (i) => <b>{i.no}</b> },
            { h: '供應商', r: (i) => partyName('suppliers', i.supplier_id) },
            { h: '說明', r: (i) => <span className="small">{i.note}</span> },
            { h: '日期', r: (i) => i.date },
            { h: '含稅金額', cls: 'num', r: (i) => money(i.total) },
            { h: '已付', cls: 'num', r: (i) => money(i.paid) },
            { h: '到期', r: (i) => (i.status === 'paid' ? <Badge s="paid" /> : aging(i.due_date)) },
            { h: '', r: (i) => i.status !== 'paid' && <button className="btn sm primary" onClick={() => setPay({ kind: 'out', id: i.id, amount: round(i.total - (i.paid || 0)), method: '匯款', date: today() })}>付款</button> },
          ]} />
        </div>
      )}
      {tab === 'pay' && (
        <div className="card">
          <Table rows={[...all('payments')].reverse()} columns={[
            { h: '單號', r: (p) => p.no },
            { h: '收/付', r: (p) => (p.kind === 'in' ? <Badge kind="ok">收款</Badge> : <Badge kind="warn">付款</Badge>) },
            { h: '對象', r: (p) => partyName(p.kind === 'in' ? 'customers' : 'suppliers', p.party_id) },
            { h: '帳款', r: (p) => (p.kind === 'in' ? get('invoices', p.invoice_id)?.no : get('bills', p.bill_id)?.no) },
            { h: '日期', r: (p) => p.date },
            { h: '方式', r: (p) => p.method },
            { h: '金額', cls: 'num', r: (p) => money(p.amount) },
          ]} />
        </div>
      )}
      {(tab === 'pl' || tab === 'tb') && (
        <div className="row">
          <Field label="期間起"><Input type="date" value={from} onChange={setFrom} /></Field>
          <Field label="期間迄"><Input type="date" value={to} onChange={setTo} /></Field>
        </div>
      )}
      {tab === 'pl' && (
        <div className="card">
          <table className="table">
            <tbody>
              <tr><td><b>銷貨收入</b></td><td className="num">{money(revenue)}</td></tr>
              {Object.keys(ACCOUNTS).filter((k) => k.startsWith('5') && net(k)).map((k) => <tr key={k}><td>　減：{ACCOUNTS[k]}</td><td className="num">{money(net(k))}</td></tr>)}
              <tr><td><b>銷貨毛利</b>（毛利率 {revenue ? Math.round(((revenue - cogs) / revenue) * 100) : 0}%）</td><td className="num"><b>{money(revenue - cogs)}</b></td></tr>
              {Object.keys(ACCOUNTS).filter((k) => k.startsWith('6') && net(k)).map((k) => <tr key={k}><td>　減：{ACCOUNTS[k]}</td><td className="num">{money(net(k))}</td></tr>)}
              <tr><td><b>本期淨利</b></td><td className="num"><b style={{ color: revenue - cogs - opex < 0 ? 'var(--bad)' : 'var(--ok)' }}>{money(revenue - cogs - opex)}</b></td></tr>
            </tbody>
          </table>
        </div>
      )}
      {tab === 'tb' && (
        <div className="card">
          <Table rows={Object.keys(b).sort().map((k) => ({ id: k, k, ...b[k] }))} columns={[
            { h: '科目', r: (r) => `${r.k} ${ACCOUNTS[r.k] || ''}` },
            { h: '類別', r: (r) => accountType(r.k) },
            { h: '借方', cls: 'num', r: (r) => money(r.debit) },
            { h: '貸方', cls: 'num', r: (r) => money(r.credit) },
            { h: '餘額', cls: 'num', r: (r) => money(r.debit - r.credit) },
          ]} />
          <div className="card-pad right muted small">
            借方合計 {money(Object.values(b).reduce((s, x) => s + x.debit, 0))}　貸方合計 {money(Object.values(b).reduce((s, x) => s + x.credit, 0))}
          </div>
        </div>
      )}
      {tab === 'jv' && (
        <div className="card">
          <Table rows={[...all('journal')].reverse().slice(0, 300)} columns={[
            { h: '傳票', r: (j) => j.no },
            { h: '日期', r: (j) => j.date },
            { h: '摘要', r: (j) => j.memo },
            { h: '分錄', r: (j) => <div className="small">{j.lines.map((l, i) => <div key={i}>{l.debit ? '借' : '　貸'} {l.account} {ACCOUNTS[l.account]}　{money(l.debit || l.credit)}</div>)}</div> },
          ]} />
        </div>
      )}

      {pay && (
        <Modal title={pay.kind === 'in' ? '登記收款' : '登記付款'} onClose={() => setPay(null)}
          footer={<><button className="btn" onClick={() => setPay(null)}>取消</button><button className="btn primary" onClick={() => {
            const fn = pay.kind === 'in' ? () => receivePayment({ invoice_id: pay.id, ...pay }) : () => payBill({ bill_id: pay.id, ...pay })
            if (attempt(fn, '已登記')) setPay(null)
          }}>確認</button></>}>
          <div className="form-grid">
            <Field label="金額"><Input type="number" value={pay.amount} onChange={(v) => setPay({ ...pay, amount: v })} /></Field>
            <Field label="方式"><Select placeholder={false} value={pay.method} options={['匯款', '現金', '支票', '信用卡'].map((m) => ({ value: m, label: m }))} onChange={(v) => setPay({ ...pay, method: v })} /></Field>
            <Field label="日期"><Input type="date" value={pay.date} onChange={(v) => setPay({ ...pay, date: v })} /></Field>
            <Field label="備註"><Input value={pay.note} onChange={(v) => setPay({ ...pay, note: v })} /></Field>
          </div>
        </Modal>
      )}
      {exp && (
        <Modal title="記一筆費用（現金支出）" onClose={() => setExp(null)}
          footer={<><button className="btn" onClick={() => setExp(null)}>取消</button><button className="btn primary" onClick={() => {
            if (!(exp.amount > 0)) return toast('請輸入金額', 'bad')
            if (attempt(() => recordExpense(exp), '已記帳')) setExp(null)
          }}>確認</button></>}>
          <div className="form-grid">
            <Field label="費用科目"><Select placeholder={false} value={exp.account} options={acctOptions(['6'])} onChange={(v) => setExp({ ...exp, account: v })} /></Field>
            <Field label="金額"><Input type="number" value={exp.amount} onChange={(v) => setExp({ ...exp, amount: v })} /></Field>
            <Field label="日期"><Input type="date" value={exp.date} onChange={(v) => setExp({ ...exp, date: v })} /></Field>
            <Field label="摘要"><Input value={exp.memo} onChange={(v) => setExp({ ...exp, memo: v })} /></Field>
          </div>
        </Modal>
      )}
      {jv && <JournalModal jv={jv} setJv={setJv} />}
    </div>
  )
}

function JournalModal({ jv, setJv }) {
  const d = round(jv.lines.reduce((s, l) => s + Number(l.debit || 0), 0))
  const c = round(jv.lines.reduce((s, l) => s + Number(l.credit || 0), 0))
  const set = (i, patch) => setJv({ ...jv, lines: jv.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  return (
    <Modal wide title="手動傳票" onClose={() => setJv(null)}
      footer={<>
        <span className={d === c ? 'muted' : 'badge bad'} style={{ flex: 1 }}>借 {money(d)} / 貸 {money(c)}{d !== c && '　借貸不平衡'}</span>
        <button className="btn" onClick={() => setJv(null)}>取消</button>
        <button className="btn primary" disabled={d !== c || !d} onClick={() => {
          postJournal({ ...jv, lines: jv.lines.filter((l) => l.account).map((l) => ({ account: Number(l.account), debit: l.debit, credit: l.credit })), ref_type: 'manual' })
          toast('傳票已建立')
          setJv(null)
        }}>建立</button>
      </>}>
      <div className="stack">
        <div className="form-grid">
          <Field label="日期"><Input type="date" value={jv.date} onChange={(v) => setJv({ ...jv, date: v })} /></Field>
          <Field label="摘要"><Input value={jv.memo} onChange={(v) => setJv({ ...jv, memo: v })} /></Field>
        </div>
        {jv.lines.map((l, i) => (
          <div className="row" key={i} style={{ flexWrap: 'nowrap' }}>
            <div style={{ flex: 2 }}><Select value={l.account} options={acctOptions()} onChange={(v) => set(i, { account: v })} /></div>
            <div style={{ flex: 1 }}><Input type="number" placeholder="借方" value={l.debit} onChange={(v) => set(i, { debit: v })} /></div>
            <div style={{ flex: 1 }}><Input type="number" placeholder="貸方" value={l.credit} onChange={(v) => set(i, { credit: v })} /></div>
          </div>
        ))}
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setJv({ ...jv, lines: [...jv.lines, { account: '', debit: '', credit: '' }] })}>＋ 加一列</button>
      </div>
    </Modal>
  )
}
