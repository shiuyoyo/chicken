import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { all, get, where } from '../db/store'
import * as L from '../logic'
import {
  Modal, Field, Input, Select, Check, Table, Badge, Tabs, Kpi, Search, matches, money, qty, dt, itemName, itemUnit, partyName, partyOptions,
  userOptions, itemOptions, LineEditor, DocLink, attempt, ask, toast, useTab, useOpen, CrudPage, PrintButton } from '../ui'

const levelKind = { VIP: 'primary', A: 'ok', B: 'info', C: '' }

// ---------- 客戶列表 ----------
export function Customers() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const [q, setQ] = useState('')
  const [level, setLevel] = useState('')
  const [owner, setOwner] = useState('')
  const [edit, setEdit] = useState(sp.get('new') ? blankCustomer() : null)
  const canEdit = L.can('crm', 2)
  const rows = all('customers')
    .filter((c) => c.kind !== 'member')
    .filter((c) => (!level || c.level === level) && (!owner || c.owner_id === owner) && matches(q, c.code, c.name, c.contact, c.phone, c.tags))
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">客戶</h1>
        <Search value={q} onChange={setQ} placeholder="名稱 / 聯絡人 / 電話 / 標籤" />
        <select className="input auto" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="等級">
          <option value="">全部等級</option>
          {L.CUSTOMER_LEVELS.map((l) => <option key={l}>{l}</option>)}
        </select>
        <select className="input auto" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="負責業務">
          <option value="">全部業務</option>
          {userOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {canEdit && <button className="btn primary" onClick={() => setEdit(blankCustomer())}>＋ 新增客戶</button>}
      </div>
      <div className="card">
        <Table rows={rows} onRow={(c) => nav('/customers/' + c.id)} columns={[
          { h: '編號', r: (c) => c.code },
          { h: '名稱', r: (c) => <b>{c.name}</b> },
          { h: '等級', r: (c) => <Badge kind={levelKind[c.level]}>{c.level}</Badge> },
          { h: '狀態', r: (c) => <Badge kind={c.status === '往來中' ? 'ok' : c.status === '停止往來' ? 'bad' : 'warn'}>{c.status}</Badge> },
          { h: '業務', r: (c) => partyName('users', c.owner_id) },
          { h: '聯絡人', r: (c) => <span className="small">{c.contact}<br />{c.phone}</span> },
          { h: '未收款', cls: 'num', r: (c) => money(L.arOutstanding(c.id)) },
          { h: '信用額度', cls: 'num', r: (c) => (c.credit_limit ? <CreditBar c={c} /> : <span className="muted">不限</span>) },
        ]} />
      </div>
      {edit && <CustomerForm data={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

const blankCustomer = () => ({ kind: 'company', status: '往來中', level: 'B', terms_days: 30, credit_limit: 0, min_shelf_days: 0, contacts: [], owner_id: '', price_list_id: '' })

function CreditBar({ c }) {
  const used = L.creditExposure(c.id)
  const pct = Math.min(100, Math.round((used / c.credit_limit) * 100))
  return (
    <div title={`已用 ${money(used)} / ${money(c.credit_limit)}`}>
      <div className="small">{money(c.credit_limit)}</div>
      <div className="progress"><i style={{ width: pct + '%', background: pct > 90 ? 'var(--bad)' : pct > 70 ? 'var(--warn)' : undefined }} /></div>
    </div>
  )
}

function CustomerForm({ data, onClose }) {
  const [d, setD] = useState(JSON.parse(JSON.stringify(data)))
  const set = (k) => (v) => setD({ ...d, [k]: v })
  const save = () => {
    const { id, created_at, updated_at, ...row } = d
    if (attempt(() => L.saveCustomer(row, id), '已儲存')) onClose()
  }
  const setContact = (i, patch) => setD({ ...d, contacts: d.contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)) })
  return (
    <Modal wide title={d.id ? `編輯 ${d.name}` : '新增客戶'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" onClick={save}>儲存</button></>}>
      <div className="stack">
        <div className="form-grid">
          <Field label="編號"><Input value={d.code} onChange={set('code')} /></Field>
          <Field label="名稱"><Input value={d.name} onChange={set('name')} /></Field>
          <Field label="等級"><Select placeholder={false} value={d.level} options={L.CUSTOMER_LEVELS.map((x) => ({ value: x, label: x }))} onChange={set('level')} /></Field>
          <Field label="狀態"><Select placeholder={false} value={d.status} options={L.CUSTOMER_STATUS.map((x) => ({ value: x, label: x }))} onChange={set('status')} /></Field>
          <Field label="負責業務"><Select value={d.owner_id} options={userOptions()} onChange={set('owner_id')} /></Field>
          <Field label="來源"><Input value={d.source} onChange={set('source')} placeholder="展覽 / 轉介紹 / 網站…" /></Field>
          <Field label="主要聯絡人"><Input value={d.contact} onChange={set('contact')} /></Field>
          <Field label="電話"><Input value={d.phone} onChange={set('phone')} /></Field>
          <Field label="Email"><Input value={d.email} onChange={set('email')} /></Field>
          <Field label="統編"><Input value={d.tax_id} onChange={set('tax_id')} /></Field>
          <Field label="付款天數"><Input type="number" value={d.terms_days} onChange={set('terms_days')} /></Field>
          <Field label="信用額度（0 = 不限）" hint="未收款 + 未開帳訂單超過額度時，新訂單需主管核准"><Input type="number" value={d.credit_limit} onChange={set('credit_limit')} /></Field>
          <Field label="價格表"><Select value={d.price_list_id} placeholder="標準售價" options={partyOptions('price_lists')} onChange={set('price_list_id')} /></Field>
          <Field label="要求剩餘效期（天）" hint="出貨只挑剩餘效期足夠的批號"><Input type="number" value={d.min_shelf_days} onChange={set('min_shelf_days')} /></Field>
          <Field label="標籤"><Input value={d.tags} onChange={set('tags')} placeholder="例如：團膳、北區" /></Field>
          <Field label="送貨地址" span><Input value={d.address} onChange={set('address')} /></Field>
          <Field label="備註" span><textarea className="input" value={d.note || ''} onChange={(e) => set('note')(e.target.value)} /></Field>
        </div>
        <div className="card">
          <div className="card-head"><h3 className="grow">聯絡人</h3><button className="btn sm" onClick={() => setD({ ...d, contacts: [...(d.contacts || []), { name: '', title: '', phone: '' }] })}>＋ 加聯絡人</button></div>
          <div className="card-pad stack">
            {(d.contacts || []).length === 0 && <span className="muted small">還沒有其他聯絡人</span>}
            {(d.contacts || []).map((c, i) => (
              <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
                <Input value={c.name} placeholder="姓名" onChange={(v) => setContact(i, { name: v })} />
                <Input value={c.title} placeholder="職稱" onChange={(v) => setContact(i, { title: v })} />
                <Input value={c.phone} placeholder="電話 / LINE" onChange={(v) => setContact(i, { phone: v })} />
                <button className="btn sm ghost danger" aria-label="移除" onClick={() => setD({ ...d, contacts: d.contacts.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ---------- 客戶 360 ----------
export function Customer360() {
  const { id } = useParams()
  const nav = useNavigate()
  const [tab, setTab] = useTab('overview')
  const [edit, setEdit] = useState(null)
  const [act, setAct] = useState(null)
  const x = L.customer360(id)
  if (!x) return <div className="empty">找不到客戶</div>
  const { c } = x
  const canEdit = L.can('crm', 2)
  return (
    <div className="stack">
      <div className="page-head">
        <button className="btn" onClick={() => nav('/customers')}>← 客戶</button>
        <h1 className="grow">{c.name}</h1>
        <Badge kind={levelKind[c.level]}>{c.level}</Badge>
        <Badge kind={c.status === '往來中' ? 'ok' : 'warn'}>{c.status}</Badge>
        {canEdit && <button className="btn" onClick={() => setEdit(c)}>編輯</button>}
        {canEdit && <button className="btn" onClick={() => setAct({ customer_id: c.id, type: '電話', date: L.today() })}>＋ 互動紀錄</button>}
        {L.can('accounting', 1) && <PrintButton type="statement" id={`customers:${c.id}`} label="對帳單" />}
        {L.can('sales', 2) && <button className="btn primary" onClick={() => nav(`/sales?new=1&customer=${c.id}`)}>＋ 下訂單</button>}
      </div>
      <div className="grid grid-kpi">
        <Kpi label="累計營收（未稅）" value={money(x.revenue)} sub={`毛利 ${money(x.revenue - x.cost)}`} />
        <Kpi label="未收款" value={money(x.ar)} sub={c.credit_limit ? `信用曝險 ${money(x.exposure)} / ${money(c.credit_limit)}` : '信用額度不限'} tone={c.credit_limit && x.exposure > c.credit_limit ? 'bad' : ''} />
        <Kpi label="下單頻率" value={x.avgInterval ? `${x.avgInterval} 天` : '—'} sub={x.last ? `最近 ${x.last}` : '尚未下單'} />
        <Kpi label="預計回購" value={x.nextExpected || '—'} sub={x.overdueReorder ? '⚠ 已超過，該聯繫了' : ''} tone={x.overdueReorder ? 'warn' : ''} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        ['overview', '概況'], ['activities', `互動（${x.activities.length}）`], ['opps', `商機（${x.opportunities.length}）`], ['quotes', `報價（${x.quotations.length}）`],
        ['orders', `訂單（${x.orders.length}）`], ['ar', '帳款'], ['returns', `退貨（${x.returns.length}）`],
      ]} />
      {tab === 'overview' && (
        <div className="grid grid-2">
          <div className="card card-pad stack">
            <h3>基本資料</h3>
            <dl className="dl">
              <dt>負責業務</dt><dd>{partyName('users', c.owner_id)}</dd>
              <dt>聯絡人</dt><dd>{c.contact} {c.phone}</dd>
              <dt>地址</dt><dd>{c.address || '—'}</dd>
              <dt>付款條件</dt><dd>{c.terms_days ? `月結 ${c.terms_days} 天` : '現金'}</dd>
              <dt>價格表</dt><dd>{get('price_lists', c.price_list_id)?.name || '標準售價'}</dd>
              <dt>效期要求</dt><dd>{c.min_shelf_days ? `剩餘 ${c.min_shelf_days} 天以上` : '無'}</dd>
              <dt>來源 / 標籤</dt><dd>{[c.source, c.tags].filter(Boolean).join('｜') || '—'}</dd>
            </dl>
            {(c.contacts || []).length > 0 && (
              <>
                <h3>其他聯絡人</h3>
                {c.contacts.map((p, i) => <div key={i} className="small">{p.name}（{p.title}）{p.phone}</div>)}
              </>
            )}
          </div>
          <div className="card">
            <div className="card-head"><h3>常買品項</h3></div>
            <Table empty="尚無交易" rows={x.topItems.map(([id, n]) => ({ id, n }))} columns={[
              { h: '品項', r: (r) => itemName(r.id) },
              { h: '數量', cls: 'num', r: (r) => qty(r.n, itemUnit(r.id)) },
              { h: '目前價格', cls: 'num', r: (r) => money(L.priceFor(c.id, r.id)) },
            ]} />
          </div>
        </div>
      )}
      {tab === 'activities' && <ActivityTable rows={x.activities} onEdit={setAct} />}
      {tab === 'opps' && <OppTable rows={x.opportunities} />}
      {tab === 'quotes' && (
        <div className="card">
          <Table rows={x.quotations} columns={[
            { h: '報價單', r: (q) => <DocLink t="quotations" row={q} /> },
            { h: '日期', r: (q) => q.date },
            { h: '有效至', r: (q) => q.valid_until },
            { h: '金額', cls: 'num', r: (q) => money(q.total) },
            { h: '狀態', r: (q) => <Badge s={L.quoteStatus(q)} /> },
          ]} />
        </div>
      )}
      {tab === 'orders' && (
        <div className="card">
          <Table rows={[...x.orders].reverse()} onRow={(o) => nav('/progress/' + o.id)} columns={[
            { h: '訂單', r: (o) => <DocLink t="sales_orders" row={o} /> },
            { h: '日期', r: (o) => o.date },
            { h: '內容', r: (o) => <span className="small">{o.lines.map((l) => `${itemName(l.item_id)}×${l.qty}`).join('、')}</span> },
            { h: '金額', cls: 'num', r: (o) => money(o.total) },
            { h: '進度', r: (o) => <Badge kind="primary">{L.orderProgress(o.id).status}</Badge> },
          ]} />
        </div>
      )}
      {tab === 'ar' && (
        <div className="card">
          <Table rows={x.invoices} columns={[
            { h: '帳款', r: (i) => i.no },
            { h: '發票', r: (i) => i.gui_no },
            { h: '日期', r: (i) => i.date },
            { h: '到期', r: (i) => i.due_date },
            { h: '金額', cls: 'num', r: (i) => money(i.total) },
            { h: '已收 / 折讓', cls: 'num', r: (i) => `${money(i.paid)} / ${money(i.credited)}` },
            { h: '未收', cls: 'num', r: (i) => money(L.invoiceBalance(i)) },
          ]} />
        </div>
      )}
      {tab === 'returns' && (
        <div className="card">
          <Table rows={x.returns} columns={[
            { h: '退貨單', r: (r) => r.no },
            { h: '日期', r: (r) => r.date },
            { h: '原因', r: (r) => r.reason },
            { h: '金額', cls: 'num', r: (r) => money(r.amount + r.tax) },
            { h: '狀態', r: (r) => (r.status === 'pending' ? <Badge kind="warn">待核准</Badge> : <Badge s={r.status} />) },
          ]} />
        </div>
      )}
      {edit && <CustomerForm data={edit} onClose={() => setEdit(null)} />}
      {act && <ActivityForm data={act} onClose={() => setAct(null)} />}
    </div>
  )
}

function ActivityTable({ rows, onEdit }) {
  return (
    <div className="card">
      <Table rows={rows} onRow={L.can('crm', 2) ? onEdit : undefined} columns={[
        { h: '日期', r: (a) => a.date },
        { h: '客戶', r: (a) => <DocLink t="customers" id={a.customer_id} /> },
        { h: '方式', r: (a) => <Badge>{a.type}</Badge> },
        { h: '內容', r: (a) => a.summary },
        { h: '下一步', r: (a) => (a.next_action ? <span className="small">{a.next_action}（{a.next_date}）{a.done ? ' ✓' : ''}</span> : '') },
        { h: '記錄人', r: (a) => partyName('users', a.user_id) },
      ]} />
    </div>
  )
}

function ActivityForm({ data, onClose }) {
  const [d, setD] = useState({ ...data })
  const set = (k) => (v) => setD({ ...d, [k]: v })
  const save = () => {
    const { id, created_at, updated_at, ...row } = d
    if (attempt(() => L.logActivity(row, id), '已記錄')) onClose()
  }
  return (
    <Modal title={d.id ? '編輯互動紀錄' : '新增互動紀錄'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" onClick={save}>儲存</button></>}>
      <div className="form-grid">
        <Field label="客戶"><Select value={d.customer_id} options={partyOptions('customers', (c) => c.kind !== 'member')} onChange={set('customer_id')} /></Field>
        <Field label="方式"><Select placeholder={false} value={d.type} options={L.ACTIVITY_TYPES.map((x) => ({ value: x, label: x }))} onChange={set('type')} /></Field>
        <Field label="日期"><Input type="date" value={d.date} onChange={set('date')} /></Field>
        <Field label="內容" span><textarea className="input" value={d.summary || ''} onChange={(e) => set('summary')(e.target.value)} /></Field>
        <Field label="下一步"><Input value={d.next_action} onChange={set('next_action')} /></Field>
        <Field label="下一步日期"><Input type="date" value={d.next_date} onChange={set('next_date')} /></Field>
        {d.id && <Check checked={d.done} onChange={set('done')} label="下一步已完成" />}
      </div>
    </Modal>
  )
}

function OppTable({ rows, onEdit }) {
  return (
    <div className="card">
      <Table rows={rows} onRow={onEdit} columns={[
        { h: '商機', r: (o) => <b>{o.title}</b> },
        { h: '客戶', r: (o) => <DocLink t="customers" id={o.customer_id} /> },
        { h: '階段', r: (o) => <Badge kind={o.stage === '成交' ? 'ok' : o.stage === '失敗' ? 'bad' : 'info'}>{o.stage}</Badge> },
        { h: '金額', cls: 'num', r: (o) => money(o.amount) },
        { h: '機率', cls: 'num', r: (o) => `${o.probability}%` },
        { h: '預計成交', r: (o) => o.expected_date },
        { h: '負責', r: (o) => partyName('users', o.owner_id) },
      ]} />
    </div>
  )
}

function OppForm({ data, onClose }) {
  const [d, setD] = useState({ ...data })
  const set = (k) => (v) => setD({ ...d, [k]: v })
  const save = () => {
    const { id, created_at, updated_at, ...row } = d
    if (attempt(() => L.saveOpportunity(row, id), '已儲存')) onClose()
  }
  return (
    <Modal title={d.id ? '編輯商機' : '新增商機'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" onClick={save}>儲存</button></>}>
      <div className="form-grid">
        <Field label="客戶"><Select value={d.customer_id} options={partyOptions('customers', (c) => c.kind !== 'member')} onChange={set('customer_id')} /></Field>
        <Field label="商機名稱"><Input value={d.title} onChange={set('title')} /></Field>
        <Field label="階段"><Select placeholder={false} value={d.stage} options={L.OPP_STAGES.map((x) => ({ value: x, label: x }))} onChange={(v) => setD({ ...d, stage: v, probability: L.STAGE_PROB[v] })} /></Field>
        <Field label="預估金額"><Input type="number" value={d.amount} onChange={set('amount')} /></Field>
        <Field label="成交機率 %"><Input type="number" value={d.probability} onChange={set('probability')} /></Field>
        <Field label="預計成交日"><Input type="date" value={d.expected_date} onChange={set('expected_date')} /></Field>
        <Field label="負責業務"><Select value={d.owner_id} options={userOptions()} onChange={set('owner_id')} /></Field>
        {d.stage === '失敗' && <Field label="失敗原因"><Input value={d.lost_reason} onChange={set('lost_reason')} /></Field>}
        <Field label="備註" span><textarea className="input" value={d.note || ''} onChange={(e) => set('note')(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

// ---------- 業務活動（待辦 / 互動 / 商機看板） ----------
export function CrmWork() {
  const [tab, setTab] = useTab('todo')
  const [act, setAct] = useState(null)
  const [opp, setOpp] = useState(null)
  const canEdit = L.can('crm', 2)
  const due = L.dueFollowups()
  const upcoming = where('activities', (a) => !a.done && a.next_date && a.next_date > L.today()).sort((a, b) => a.next_date.localeCompare(b.next_date))
  const pipe = L.pipeline()
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">業務活動與商機</h1>
        {canEdit && <button className="btn" onClick={() => setAct({ type: '電話', date: L.today() })}>＋ 互動紀錄</button>}
        {canEdit && <button className="btn primary" onClick={() => setOpp({ stage: '接洽', probability: 10, amount: 0 })}>＋ 商機</button>}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['todo', `待辦（${due.length}）`], ['log', '互動紀錄'], ['pipeline', '商機管道'], ['reorder', '回購提醒']]} />
      {tab === 'todo' && (
        <div className="grid grid-2">
          <div className="card">
            <div className="card-head"><h3>今天以前要做</h3></div>
            <Table empty="沒有到期的待辦 👍" rows={due} columns={[
              { h: '日期', r: (a) => (a.next_date < L.today() ? <Badge kind="bad">{a.next_date}</Badge> : <Badge kind="warn">今天</Badge>) },
              { h: '客戶', r: (a) => <DocLink t="customers" id={a.customer_id} /> },
              { h: '待辦', r: (a) => a.next_action },
              { h: '', r: (a) => canEdit && <button className="btn sm" onClick={() => attempt(() => L.completeActivity(a.id), '已完成')}>完成</button> },
            ]} />
          </div>
          <div className="card">
            <div className="card-head"><h3>接下來</h3></div>
            <Table empty="沒有排定的待辦" rows={upcoming} columns={[
              { h: '日期', r: (a) => a.next_date },
              { h: '客戶', r: (a) => <DocLink t="customers" id={a.customer_id} /> },
              { h: '待辦', r: (a) => a.next_action },
            ]} />
          </div>
        </div>
      )}
      {tab === 'log' && <ActivityTable rows={[...all('activities')].sort((a, b) => String(b.date).localeCompare(String(a.date)))} onEdit={setAct} />}
      {tab === 'pipeline' && (
        <>
          <div className="kanban">
            {pipe.map((col) => (
              <div key={col.stage} className="kanban-col">
                <div className="kanban-head">
                  <b>{col.stage}</b>
                  <span className="small muted">{col.list.length} 件｜{money(col.amount)}</span>
                </div>
                {col.list.map((o) => (
                  <button key={o.id} className="kanban-card" onClick={() => canEdit && setOpp(o)}>
                    <b>{o.title}</b>
                    <span className="small">{partyName('customers', o.customer_id)}</span>
                    <span className="small muted">{money(o.amount)}・{o.probability}%・{o.expected_date}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="muted small">加權預估營收：{money(L.sum(pipe.filter((p) => !['成交', '失敗'].includes(p.stage)), (p) => p.weighted))}</div>
        </>
      )}
      {tab === 'reorder' && (
        <div className="card">
          <Table empty="沒有該回購的客戶" rows={L.reorderReminders().map((x) => ({ id: x.c.id, ...x }))} columns={[
            { h: '客戶', r: (x) => <DocLink t="customers" row={x.c} /> },
            { h: '平均下單間隔', cls: 'num', r: (x) => `${x.avgInterval} 天` },
            { h: '最近下單', r: (x) => x.last },
            { h: '預計回購', r: (x) => <Badge kind="warn">{x.nextExpected}</Badge> },
            { h: '業務', r: (x) => partyName('users', x.c.owner_id) },
          ]} />
        </div>
      )}
      {act && <ActivityForm data={act} onClose={() => setAct(null)} />}
      {opp && <OppForm data={opp} onClose={() => setOpp(null)} />}
    </div>
  )
}

// ---------- 報價單 ----------
export function Quotations() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useOpen()
  const [edit, setEdit] = useState(null)
  const canEdit = L.can('crm', 2)
  const rows = all('quotations').filter((x) => matches(q, x.no, partyName('customers', x.customer_id))).reverse()
  const cur = get('quotations', open)
  const save = () => {
    const { id, created_at, updated_at, ...row } = edit
    if (attempt(() => L.saveQuotation(row, id), '已儲存')) setEdit(null)
  }
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">報價單</h1>
        <Search value={q} onChange={setQ} />
        {canEdit && <button className="btn primary" onClick={() => setEdit({ customer_id: '', date: L.today(), valid_until: L.addDays(L.today(), 14), lines: [{ item_id: '', qty: '', price: '' }], note: '' })}>＋ 新報價</button>}
      </div>
      <div className="card">
        <Table rows={rows} onRow={(x) => setOpen(x.id)} columns={[
          { h: '報價單', r: (x) => <b>{x.no}</b> },
          { h: '客戶', r: (x) => partyName('customers', x.customer_id) },
          { h: '日期', r: (x) => x.date },
          { h: '有效至', r: (x) => x.valid_until },
          { h: '內容', r: (x) => <span className="small">{x.lines.map((l) => `${itemName(l.item_id)}×${l.qty}`).join('、')}</span> },
          { h: '金額', cls: 'num', r: (x) => money(x.total) },
          { h: '狀態', r: (x) => <Badge s={L.quoteStatus(x)} /> },
        ]} />
      </div>
      {cur && (
        <Modal wide title={`報價單 ${cur.no}`} onClose={() => setOpen(null)}
          footer={<>
            {canEdit && ['draft', 'sent'].includes(L.quoteStatus(cur)) && <button className="btn" onClick={() => attempt(() => L.saveQuotation({ ...cur, status: 'sent' }, cur.id), '已標記送出')}>標記已送出</button>}
            {canEdit && ['draft', 'sent'].includes(L.quoteStatus(cur)) && <button className="btn danger" onClick={() => attempt(() => L.saveQuotation({ ...cur, status: 'rejected' }, cur.id), '已標記拒絕')}>客戶拒絕</button>}
            <span style={{ flex: 1 }} />
            {canEdit && cur.status !== 'converted' && <button className="btn" onClick={() => { setOpen(null); setEdit(JSON.parse(JSON.stringify(cur))) }}>編輯</button>}
            {L.can('sales', 2) && !['converted', 'rejected', 'expired'].includes(L.quoteStatus(cur)) && (
              <button className="btn primary" onClick={() => { const so = attempt(() => L.convertQuotation(cur.id), '已轉成銷售訂單'); if (so) nav('/progress/' + so.id) }}>轉成訂單</button>
            )}
            {cur.sales_order_id && <DocLink t="sales_orders" id={cur.sales_order_id}>查看訂單</DocLink>}
            <PrintButton type="quotation" id={cur.id} />
          </>}>
          <div className="stack">
            <div className="row"><span>客戶：<DocLink t="customers" id={cur.customer_id} /></span><span className="muted">報價日 {cur.date}，有效至 {cur.valid_until}</span><Badge s={L.quoteStatus(cur)} /></div>
            {cur.opportunity_id && <div className="small">商機：{get('opportunities', cur.opportunity_id)?.title}</div>}
            <Table rows={cur.lines} columns={[
              { h: '品項', r: (l) => itemName(l.item_id) },
              { h: '數量', cls: 'num', r: (l) => qty(l.qty, itemUnit(l.item_id)) },
              { h: '報價', cls: 'num', r: (l) => money(l.price) },
              { h: '標準價', cls: 'num', r: (l) => money(get('items', l.item_id)?.price) },
              { h: '小計', cls: 'num', r: (l) => money(l.qty * l.price) },
            ]} />
            <div className="right"><b>合計 {money(cur.total)}</b>（未稅）</div>
            {cur.note && <div className="muted">備註：{cur.note}</div>}
          </div>
        </Modal>
      )}
      {edit && (
        <Modal wide title={edit.id ? `編輯 ${edit.no}` : '新增報價單'} onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>取消</button><button className="btn primary" onClick={save}>儲存</button></>}>
          <div className="stack">
            <div className="form-grid">
              <Field label="客戶"><Select value={edit.customer_id} options={partyOptions('customers', (c) => c.kind !== 'member')} onChange={(v) => setEdit({ ...edit, customer_id: v })} /></Field>
              <Field label="商機（選填）"><Select value={edit.opportunity_id} placeholder="無" options={where('opportunities', (o) => !edit.customer_id || o.customer_id === edit.customer_id).map((o) => ({ value: o.id, label: o.title }))} onChange={(v) => setEdit({ ...edit, opportunity_id: v })} /></Field>
              <Field label="報價日"><Input type="date" value={edit.date} onChange={(v) => setEdit({ ...edit, date: v })} /></Field>
              <Field label="有效至"><Input type="date" value={edit.valid_until} onChange={(v) => setEdit({ ...edit, valid_until: v })} /></Field>
            </div>
            <LineEditor lines={edit.lines} types={['product']} onChange={(lines) => setEdit({ ...edit, lines })} defaultPrice={(id) => L.priceFor(edit.customer_id, id)} />
            <Field label="備註（付款、運送條件）"><textarea className="input" value={edit.note || ''} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ---------- 價格表 ----------
export function PriceLists() {
  const canEdit = L.can('crm', 2)
  const [edit, setEdit] = useState(null)
  const save = () => {
    const { id, created_at, updated_at, ...row } = edit
    row.lines = row.lines.filter((l) => l.item_id && l.price > 0)
    if (attempt(() => L.saveMaster('price_lists', row, id), '已儲存')) setEdit(null)
  }
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">價格表</h1>
        {canEdit && <button className="btn primary" onClick={() => setEdit({ name: '', lines: [], note: '' })}>＋ 新價格表</button>}
      </div>
      <p className="muted" style={{ margin: 0 }}>客戶綁定價格表後，下訂單與報價會自動帶入這裡的價格；沒列的品項用標準售價。</p>
      {all('price_lists').map((pl) => (
        <div key={pl.id} className="card">
          <div className="card-head">
            <h3 className="grow">{pl.name}</h3>
            <span className="small muted">使用客戶：{where('customers', (c) => c.price_list_id === pl.id).map((c) => c.name).join('、') || '無'}</span>
            {canEdit && <button className="btn sm" onClick={() => setEdit(JSON.parse(JSON.stringify(pl)))}>編輯</button>}
          </div>
          <Table rows={pl.lines} columns={[
            { h: '品項', r: (l) => itemName(l.item_id) },
            { h: '標準售價', cls: 'num', r: (l) => money(get('items', l.item_id)?.price) },
            { h: '價格表', cls: 'num', r: (l) => <b>{money(l.price)}</b> },
            { h: '最低售價', cls: 'num', r: (l) => money(get('items', l.item_id)?.min_price) },
          ]} />
        </div>
      ))}
      {edit && (
        <Modal title={edit.id ? `編輯 ${edit.name}` : '新價格表'} onClose={() => setEdit(null)}
          footer={<>{edit.id && <button className="btn danger" onClick={async () => (await ask('刪除這個價格表？', { danger: true })) && attempt(() => L.deleteMaster('price_lists', edit.id), '已刪除') && setEdit(null)}>刪除</button>}<span style={{ flex: 1 }} /><button className="btn" onClick={() => setEdit(null)}>取消</button><button className="btn primary" onClick={save}>儲存</button></>}>
          <div className="stack">
            <Field label="名稱"><Input value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} /></Field>
            {edit.lines.map((l, i) => (
              <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
                <div style={{ flex: 2 }}><Select value={l.item_id} options={itemOptions(['product'])} onChange={(v) => setEdit({ ...edit, lines: edit.lines.map((x, j) => (j === i ? { ...x, item_id: v } : x)) })} /></div>
                <div style={{ flex: 1 }}><Input type="number" value={l.price} onChange={(v) => setEdit({ ...edit, lines: edit.lines.map((x, j) => (j === i ? { ...x, price: v } : x)) })} /></div>
                <button className="btn sm ghost danger" aria-label="移除" onClick={() => setEdit({ ...edit, lines: edit.lines.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEdit({ ...edit, lines: [...edit.lines, { item_id: '', price: '' }] })}>＋ 加品項</button>
            <Field label="備註"><Input value={edit.note} onChange={(v) => setEdit({ ...edit, note: v })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  )
}

export { CrudPage, toast, dt }
