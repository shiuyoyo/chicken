import { all, currentUser } from '../db/store'
import * as L from '../logic'
import { Table, Badge, Tabs, useTab, money, dt, partyName, DocLink, attempt, ask } from '../ui'

export default function Approvals() {
  const [tab, setTab] = useTab('mine')
  const me = currentUser()
  const pending = L.pendingApprovals()
  const mine = pending.filter((a) => L.canDecide(a))
  const sent = all('approvals').filter((a) => a.requested_by === me.id).reverse()
  const history = all('approvals').filter((a) => a.status !== 'pending').reverse()
  const rows = { mine, all: pending, sent, history }[tab]

  const decide = async (a, ok) => {
    const note = ok ? await ask(`核准「${a.summary}」？\n原因：${a.reason}`, { input: true, required: false, placeholder: '備註（選填）', confirmText: '核准' }) : await ask(`退回「${a.summary}」`, { input: true, placeholder: '請填寫退回原因', confirmText: '退回', danger: true })
    if (note === null) return
    attempt(() => L.decideApproval(a.id, ok, note), ok ? '已核准並生效' : '已退回')
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">簽核中心</h1>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        超過門檻的採購、超過信用額度或低於最低售價的訂單、大額庫存調整、盤差、銷貨退回、POS 作廢、QC 改判都會送到這裡。申請人不能核准自己的申請。
      </p>
      <Tabs value={tab} onChange={setTab} tabs={[['mine', `待我核准（${mine.length}）`], ['all', `全部待簽（${pending.length}）`], ['sent', '我送出的'], ['history', '已處理']]} />
      <div className="card">
        <Table
          empty={tab === 'mine' ? '沒有待你核准的單據 👍' : '沒有資料'}
          rows={rows}
          columns={[
            { h: '單號', r: (a) => a.no },
            { h: '類型', r: (a) => <Badge kind="info">{L.APPROVAL_TYPES[a.type]}</Badge> },
            { h: '內容', r: (a) => (a.ref_table && a.ref_table !== 'items' ? <DocLink t={a.ref_table} id={a.ref_id}>{a.summary}</DocLink> : a.summary) },
            { h: '原因', r: (a) => <span className="small">{a.reason}</span> },
            { h: '金額', cls: 'num', r: (a) => (a.amount ? money(a.amount) : '') },
            { h: '申請', r: (a) => <span className="small">{partyName('users', a.requested_by)}<br />{dt(a.created_at)}</span> },
            {
              h: tab === 'history' || tab === 'sent' ? '結果' : '',
              r: (a) =>
                a.status === 'pending' ? (
                  L.canDecide(a) ? (
                    <span className="row nowrap">
                      <button className="btn sm primary" onClick={() => decide(a, true)}>核准</button>
                      <button className="btn sm danger" onClick={() => decide(a, false)}>退回</button>
                    </span>
                  ) : (
                    <Badge kind="warn">等待{L.MODULES[a.module]}主管</Badge>
                  )
                ) : (
                  <span className="small">
                    <Badge s={a.status} /> {partyName('users', a.decided_by)} {a.decision_note && `：${a.decision_note}`}
                  </span>
                ),
            },
          ]}
        />
      </div>
    </div>
  )
}
