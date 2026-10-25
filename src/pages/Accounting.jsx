import { useState } from 'react'
import { all, get } from '../db/store'
import * as L from '../logic'
import { Modal, Field, Input, Select, Table, Badge, Tabs, Kpi, money, partyName, attempt, ask, useTab, DocLink, PrintButton } from '../ui'

const acctOptions = (prefix) =>
  Object.entries(L.ACCOUNTS)
    .filter(([k]) => !prefix || prefix.some((p) => k.startsWith(p)))
    .map(([value, n]) => ({ value, label: `${value} ${n}` }))

export default function Accounting() {
  const [tab, setTab] = useTab('ar')
  const [pay, setPay] = useState(null)
  const [exp, setExp] = useState(null)
  const [jv, setJv] = useState(null)
  const month = L.today().slice(0, 7)
  const [from, setFrom] = useState(month + '-01')
  const [to, setTo] = useState(L.today())
  const canEdit = L.can('accounting', 2)
  const cash = L.accountBalance(1100)
  const arTotal = L.sum(all('invoices'), L.invoiceBalance)
  const apTotal = L.sum(all('bills'), L.billBalance)
  const pl = L.profitAndLoss(from, to)

  const aging = (due, bal) => {
    if (bal <= 0) return <Badge s="paid" />
    const d = L.daysBetween(due, L.today())
    return d > 0 ? <Badge kind="bad">逾期 {d} 天</Badge> : <span className="muted small">{-d} 天後到期</span>
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">會計</h1>
        {canEdit && <button className="btn" onClick={() => setJv({ date: L.today(), memo: '', lines: [{ account: '', debit: '', credit: '' }, { account: '', debit: '', credit: '' }] })}>手動傳票</button>}
        {canEdit && <button className="btn primary" onClick={() => setExp({ account: '6900', amount: '', memo: '', date: L.today() })}>＋ 記一筆費用</button>}
      </div>
      <div className="grid grid-kpi">
        <Kpi label="現金及銀行" value={money(cash)} sub={`刷卡/行動支付待撥 ${money(L.accountBalance(1130))}`} />
        <Kpi label="應收未收" value={money(arTotal)} />
        <Kpi label="應付未付" value={money(apTotal)} />
        <Kpi label="已關帳至" value={L.getSetting('closed_until') || '未關帳'} sub="關帳期間不能再異動" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['ar', '應收帳款'], ['ap', '應付帳款'], ['pay', '收付款紀錄'], ['pl', '損益表'], ['tb', '試算表'], ['jv', '傳票'], ['close', '月結關帳']]} />

      {(tab === 'ar' || tab === 'ap') && <AgingTable kind={tab} />}
      {tab === 'ar' && (
        <div className="card">
          <Table rows={[...all('invoices')].reverse()} columns={[
            { h: '帳款', r: (i) => <b>{i.no}</b> },
            { h: '發票號碼', r: (i) => i.gui_no },
            { h: '客戶', r: (i) => <DocLink t="customers" id={i.customer_id} /> },
            { h: '出貨單', r: (i) => <DocLink t="shipments" id={i.shipment_id} /> },
            { h: '日期', r: (i) => i.date },
            { h: '含稅金額', cls: 'num', r: (i) => money(i.total) },
            { h: '已收 / 折讓', cls: 'num', r: (i) => `${money(i.paid)} / ${money(i.credited)}` },
            { h: '未收', cls: 'num', r: (i) => money(L.invoiceBalance(i)) },
            { h: '到期', r: (i) => aging(i.due_date, L.invoiceBalance(i)) },
            { h: '列印', r: (i) => <PrintButton sm type="invoice" id={i.id} label="請款單" /> },
            { h: '', r: (i) => canEdit && L.invoiceBalance(i) > 0 && <button className="btn sm primary" onClick={() => setPay({ kind: 'in', id: i.id, amount: L.invoiceBalance(i), method: '匯款', date: L.today() })}>收款</button> },
          ]} />
        </div>
      )}
      {tab === 'ap' && (
        <div className="card">
          <Table rows={[...all('bills')].reverse()} columns={[
            { h: '帳款', r: (i) => <b>{i.no}</b> },
            { h: '供應商', r: (i) => partyName('suppliers', i.supplier_id) },
            { h: '說明', r: (i) => <span className="small">{i.note}</span> },
            { h: '日期', r: (i) => i.date },
            { h: '含稅金額', cls: 'num', r: (i) => money(i.total) },
            { h: '已付 / 折讓', cls: 'num', r: (i) => `${money(i.paid)} / ${money(i.credited)}` },
            { h: '未付', cls: 'num', r: (i) => money(L.billBalance(i)) },
            { h: '到期', r: (i) => aging(i.due_date, L.billBalance(i)) },
            { h: '', r: (i) => canEdit && L.billBalance(i) > 0 && <button className="btn sm primary" onClick={() => setPay({ kind: 'out', id: i.id, amount: L.billBalance(i), method: '匯款', date: L.today() })}>付款</button> },
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
            { h: '', r: (p) => <PrintButton sm type="payment" id={p.id} /> },
          ]} />
        </div>
      )}
      {(tab === 'pl' || tab === 'tb') && (
        <div className="row">
          <Field label="期間起"><Input type="date" value={from} onChange={setFrom} /></Field>
          <Field label="期間迄"><Input type="date" value={to} onChange={setTo} /></Field>
          <button className="btn sm" onClick={() => { setFrom(''); setTo('') }}>全部期間</button>
        </div>
      )}
      {tab === 'pl' && (
        <div className="card">
          <table className="table">
            <tbody>
              <tr><td>銷貨收入</td><td className="num">{money(pl.gross_sales)}</td></tr>
              {pl.returns ? <tr><td>　減：銷貨退回及折讓</td><td className="num">{money(pl.returns)}</td></tr> : null}
              <tr className="strong"><td>營業收入淨額</td><td className="num">{money(pl.revenue)}</td></tr>
              {pl.costs.map((x) => <tr key={x.k}><td>　減：{L.ACCOUNTS[x.k]}</td><td className="num">{money(x.v)}</td></tr>)}
              <tr className="strong"><td>營業毛利（毛利率 {pl.revenue ? Math.round((pl.gross / pl.revenue) * 100) : 0}%）</td><td className="num">{money(pl.gross)}</td></tr>
              {pl.expenses.map((x) => <tr key={x.k}><td>　減：{L.ACCOUNTS[x.k]}</td><td className="num">{money(x.v)}</td></tr>)}
              {pl.other ? <tr><td>　加：其他收入</td><td className="num">{money(pl.other)}</td></tr> : null}
              <tr className="strong"><td>本期淨利</td><td className={'num ' + (pl.net < 0 ? 'tone-bad' : 'tone-ok')}>{money(pl.net)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
      {tab === 'tb' && <TrialBalance from={from} to={to} />}
      {tab === 'jv' && (
        <div className="card">
          <Table rows={[...all('journal')].sort((a, b) => String(b.date + b.no).localeCompare(String(a.date + a.no))).slice(0, 300)} columns={[
            { h: '傳票', r: (j) => j.no },
            { h: '日期', r: (j) => j.date },
            { h: '摘要', r: (j) => j.memo },
            { h: '', r: (j) => <PrintButton sm type="journal" id={j.id} /> },
            { h: '分錄', r: (j) => <div className="small">{j.lines.map((l, i) => <div key={i}>{l.debit ? '借' : '　貸'} {l.account} {L.ACCOUNTS[l.account]}　{money(l.debit || l.credit)}</div>)}</div> },
          ]} />
        </div>
      )}
      {tab === 'close' && <ClosePeriod />}

      {pay && (
        <Modal title={pay.kind === 'in' ? '登記收款' : '登記付款'} onClose={() => setPay(null)}
          footer={<><button className="btn" onClick={() => setPay(null)}>取消</button><button className="btn primary" onClick={() => {
            const fn = pay.kind === 'in' ? () => L.receivePayment({ invoice_id: pay.id, amount: pay.amount, method: pay.method, date: pay.date, note: pay.note }) : () => L.payBill({ bill_id: pay.id, amount: pay.amount, method: pay.method, date: pay.date, note: pay.note })
            if (attempt(fn, '已登記')) setPay(null)
          }}>確認</button></>}>
          <div className="form-grid">
            <Field label="金額"><Input type="number" value={pay.amount} onChange={(v) => setPay({ ...pay, amount: v })} /></Field>
            <Field label="方式"><Select placeholder={false} value={pay.method} options={L.PAY_METHODS.map((m) => ({ value: m, label: m }))} onChange={(v) => setPay({ ...pay, method: v })} /></Field>
            <Field label="日期"><Input type="date" value={pay.date} onChange={(v) => setPay({ ...pay, date: v })} /></Field>
            <Field label="備註"><Input value={pay.note} onChange={(v) => setPay({ ...pay, note: v })} /></Field>
          </div>
        </Modal>
      )}
      {exp && (
        <Modal title="記一筆費用（現金支出）" onClose={() => setExp(null)}
          footer={<><button className="btn" onClick={() => setExp(null)}>取消</button><button className="btn primary" onClick={() => attempt(() => L.recordExpense(exp), '已記帳') && setExp(null)}>確認</button></>}>
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

function AgingTable({ kind }) {
  const rows = L.aging(kind)
  if (!rows.length) return null
  return (
    <div className="card">
      <div className="card-head"><h3>{kind === 'ar' ? '應收' : '應付'}帳齡分析</h3></div>
      <Table rows={rows.map((r) => ({ id: r.party, ...r }))} columns={[
        { h: kind === 'ar' ? '客戶' : '供應商', r: (r) => (kind === 'ar' ? <DocLink t="customers" id={r.party} /> : partyName('suppliers', r.party)) },
        ...L.AGING_BUCKETS.map((b, i) => ({ h: b, cls: 'num', r: (r) => (r.buckets[i] ? <span className={i >= 2 ? 'tone-bad' : ''}>{money(r.buckets[i])}</span> : '') })),
        { h: '合計', cls: 'num', r: (r) => <b>{money(r.total)}</b> },
        { h: '', r: (r) => <PrintButton sm type="statement" id={`${kind === 'ar' ? 'customers' : 'suppliers'}:${r.party}`} label="對帳單" /> },
      ]} />
    </div>
  )
}

function TrialBalance({ from, to }) {
  const b = L.balances(from || undefined, to || undefined)
  const rows = Object.keys(b).sort().map((k) => ({ id: k, k, ...b[k] }))
  const d = L.sum(rows, (r) => r.debit)
  const c = L.sum(rows, (r) => r.credit)
  return (
    <div className="card">
      <Table rows={rows} columns={[
        { h: '科目', r: (r) => `${r.k} ${L.ACCOUNTS[r.k] || ''}` },
        { h: '類別', r: (r) => L.accountType(r.k) },
        { h: '借方', cls: 'num', r: (r) => money(r.debit) },
        { h: '貸方', cls: 'num', r: (r) => money(r.credit) },
        { h: '餘額', cls: 'num', r: (r) => money(r.debit - r.credit) },
      ]} foot={<tr><th colSpan={2}>合計 {L.round(d) === L.round(c) ? '✅ 平衡' : '❌ 不平衡'}</th><th className="num">{money(d)}</th><th className="num">{money(c)}</th><th /></tr>} />
    </div>
  )
}

function ClosePeriod() {
  const last = new Date()
  last.setDate(0)
  const def = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
  const [until, setUntil] = useState(def)
  const checks = L.closingChecks(until)
  const blocked = checks.some((c) => c.block && !c.ok)
  return (
    <div className="stack">
      <div className="card card-pad stack">
        <p style={{ margin: 0 }}>關帳後，關帳日（含）以前的日期不能再新增任何會影響帳務的單據（進貨、出貨、收付款、費用、調整…），確保報表不會被事後修改。需要會計主管權限；重新開帳需管理者。</p>
        <div className="row">
          <Field label="關帳到"><Input type="date" value={until} onChange={setUntil} /></Field>
          <span className="muted">目前已關帳至：<b>{L.getSetting('closed_until') || '未關帳'}</b></span>
        </div>
        <Table rows={checks.map((c, i) => ({ id: i, ...c }))} columns={[
          { h: '檢查項目', r: (c) => c.name },
          { h: '結果', r: (c) => (c.ok ? <Badge kind="ok">通過</Badge> : <Badge kind={c.block ? 'bad' : 'warn'}>{c.block ? '未通過' : '提醒'}</Badge>) },
          { h: '說明', r: (c) => c.detail },
        ]} />
        <div className="row">
          <button className="btn primary" disabled={blocked || !L.can('accounting', 3)} onClick={async () => (await ask(`確定關帳到 ${until}？`)) && attempt(() => L.closePeriod(until), `已關帳至 ${until}`)}>執行關帳</button>
          {L.getSetting('closed_until') && L.can('admin', 3) && <button className="btn danger" onClick={async () => (await ask('重新開帳會讓已關帳期間可以再異動，確定？', { danger: true })) && attempt(() => L.reopenPeriod(''), '已重新開帳')}>重新開帳</button>}
          {!L.can('accounting', 3) && <span className="muted small">需要會計核准權限</span>}
        </div>
      </div>
    </div>
  )
}

function JournalModal({ jv, setJv }) {
  const d = L.round(L.sum(jv.lines, (l) => l.debit))
  const c = L.round(L.sum(jv.lines, (l) => l.credit))
  const set = (i, patch) => setJv({ ...jv, lines: jv.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  return (
    <Modal wide title="手動傳票" onClose={() => setJv(null)}
      footer={<>
        <span className={d === c ? 'muted' : 'badge bad'} style={{ flex: 1 }}>借 {money(d)} / 貸 {money(c)}{d !== c && '　借貸不平衡'}</span>
        <button className="btn" onClick={() => setJv(null)}>取消</button>
        <button className="btn primary" disabled={d !== c || !d} onClick={() => attempt(() => L.manualJournal({ ...jv, lines: jv.lines.filter((l) => l.account) }), '傳票已建立') && setJv(null)}>建立</button>
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
