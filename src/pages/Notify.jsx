// LINE / Telegram 通知中心：員工綁定確認、通知規則、發送紀錄、模擬器、連線設定
import { useState } from 'react'
import { all, get, where, backendName } from '../db/store'
import { supabaseConfig } from '../db/supabase'
import * as L from '../logic'
import { Modal, Field, Input, Select, Table, Badge, Tabs, dt, partyName, userOptions, attempt, ask, toast, useTab } from '../ui'

const chBadge = (ch) => <Badge kind={ch === 'line' ? 'ok' : 'info'}>{L.CHANNELS[ch] || ch}</Badge>
const roleName = (id) => get('roles', id)?.name || '—'
const STATUS = {
  queued: ['待發送', 'warn'], sending: ['發送中', 'info'], sent: ['已送出', 'ok'], partial: ['部分失敗', 'warn'], failed: ['失敗', 'bad'],
  no_recipient: ['沒有綁定的收件人', ''], demo: ['示範（不發送）', ''],
}

export default function Notify() {
  const [tab, setTab] = useTab('pending')
  const pending = L.pendingContacts()
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">LINE / Telegram 通知</h1>
        <Badge kind={supabaseConfig() ? 'ok' : 'warn'}>{supabaseConfig() ? '雲端模式：會真的發送' : '本機模式：只在模擬器預覽'}</Badge>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        員工加入公司的 LINE 官方帳號（或 Telegram 機器人）後，自己選職位、輸入姓名；管理員在這裡按「確定」綁定到員工帳號後，跟他職位有關的資料異動就會自動推播給他。
      </p>
      <Tabs value={tab} onChange={setTab} tabs={[['pending', `綁定申請（${pending.length}）`], ['contacts', '已綁定人員'], ['rules', '通知規則'], ['log', '發送紀錄'], ['sim', '模擬器（試用）'], ['setup', '連線設定']]} />
      {tab === 'pending' && <Pending list={pending} />}
      {tab === 'contacts' && <Contacts />}
      {tab === 'rules' && <Rules />}
      {tab === 'log' && <Log />}
      {tab === 'sim' && <Simulator />}
      {tab === 'setup' && <Setup />}
    </div>
  )
}

function Pending({ list }) {
  const [form, setForm] = useState(null)
  const canEdit = L.can('admin', 2)
  if (!list.length) return <div className="card empty">目前沒有待確認的申請。員工加入官方帳號並填好資料後會出現在這裡。</div>
  const open = (c) => {
    const same = all('users').find((u) => u.name === c.requested_name)
    setForm({ c, mode: same ? 'link' : 'create', user_id: same?.id || '', name: c.requested_name || c.display_name || '', role_id: c.requested_role_id })
  }
  const ok = async () => {
    const { c, mode, user_id, name, role_id } = form
    const r = attempt(() => L.approveContact(c.id, mode === 'create' ? { role_id, create_user: { name } } : { user_id, role_id }))
    if (!r) return
    setForm(null)
    if (r.pin) await ask(`已建立員工「${r.user.name}」（${roleName(r.user.role_id)}）。\n系統登入 PIN：${r.pin}\n請轉告本人，之後可在「使用者與權限」修改。`, { title: '綁定完成', confirmText: '知道了' })
    else toast(`已綁定 ${r.user.name}，確認訊息已送出`)
  }
  return (
    <>
      <div className="grid grid-2">
        {list.map((c) => (
          <div key={c.id} className="card card-pad stack">
            <div className="row">
              <span className="avatar">{(c.display_name || '?').slice(0, 1)}</span>
              <div style={{ flex: 1 }}>
                <b>{c.requested_name || '（未填姓名）'}</b> {chBadge(c.channel)}
                <div className="small muted">{L.CHANNELS[c.channel]} 名稱：{c.display_name || '—'}・申請時間 {dt(c.updated_at)}</div>
              </div>
            </div>
            <div>申請職位：<b>{roleName(c.requested_role_id)}</b>{all('users').some((u) => u.name === c.requested_name) && <span className="small muted">（系統裡已有同名員工）</span>}</div>
            {canEdit && (
              <div className="row">
                <button className="btn primary" onClick={() => open(c)}>確定職位</button>
                <button className="btn danger" onClick={async () => { const r = await ask(`退回「${c.requested_name}」的申請？對方會收到通知。`, { input: true, placeholder: '原因（例如：請用全名）', danger: true, confirmText: '退回' }); if (r) attempt(() => L.rejectContact(c.id, r), '已退回') }}>退回</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {form && (
        <Modal title={`確定職位：${form.c.requested_name || form.c.display_name}`} onClose={() => setForm(null)}
          footer={<><button className="btn" onClick={() => setForm(null)}>取消</button><button className="btn primary" onClick={ok}>確定</button></>}>
          <div className="stack">
            <div className="seg-row">
              <label className="row"><input type="radio" checked={form.mode === 'create'} onChange={() => setForm({ ...form, mode: 'create' })} />建立新員工</label>
              <label className="row"><input type="radio" checked={form.mode === 'link'} onChange={() => setForm({ ...form, mode: 'link' })} />綁定既有員工</label>
            </div>
            <div className="form-grid">
              {form.mode === 'create' ? (
                <Field label="姓名"><Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} /></Field>
              ) : (
                <Field label="員工"><Select value={form.user_id} options={userOptions()} onChange={(v) => setForm({ ...form, user_id: v, role_id: form.role_id || get('users', v)?.role_id })} /></Field>
              )}
              <Field label="職位（可修改）" hint={`員工申請的是「${roleName(form.c.requested_role_id)}」`}>
                <Select value={form.role_id} options={all('roles').map((r) => ({ value: r.id, label: r.name }))} onChange={(v) => setForm({ ...form, role_id: v })} />
              </Field>
            </div>
            <div className="notice">確定後會：{form.mode === 'create' ? '建立員工帳號並產生登入 PIN、' : '把這位員工的職位設為所選職位、'}綁定 {L.CHANNELS[form.c.channel]}，並傳一則確認訊息給他。</div>
            <div className="small muted">這個職位會收到：{L.eventsForUser({ role_id: form.role_id }).join('、') || '（目前沒有）'}</div>
          </div>
        </Modal>
      )}
    </>
  )
}

function Contacts() {
  const canEdit = L.can('admin', 2)
  const rows = where('notify_contacts', (c) => c.status === 'approved')
  const unlinked = all('users').filter((u) => u.active !== false && !L.contactsOf(u.id).length)
  return (
    <>
      <div className="card">
        <Table empty="還沒有人綁定" rows={rows} columns={[
          { h: '員工', r: (c) => <b>{partyName('users', c.user_id)}</b> },
          { h: '職位', r: (c) => roleName(get('users', c.user_id)?.role_id) },
          { h: '管道', r: (c) => <>{chBadge(c.channel)} <span className="small muted">{c.display_name}</span></> },
          { h: '通知', r: (c) => (c.muted ? <Badge kind="warn">已暫停</Badge> : <Badge kind="ok">開啟</Badge>) },
          { h: '會收到', r: (c) => <span className="small">{L.eventsForUser(get('users', c.user_id)).join('、')}</span> },
          { h: '確認', r: (c) => <span className="small muted">{partyName('users', c.approved_by)}<br />{dt(c.approved_at)}</span> },
          {
            h: '',
            r: (c) =>
              canEdit && (
                <span className="row nowrap">
                  <button className="btn sm" onClick={() => attempt(() => L.sendTest(c.user_id), '已送出測試通知')}>測試</button>
                  <button className="btn sm" onClick={() => attempt(() => L.setContactMuted(c.id, !c.muted), c.muted ? '已恢復' : '已暫停')}>{c.muted ? '恢復' : '暫停'}</button>
                  <button className="btn sm danger" onClick={async () => (await ask(`解除 ${partyName('users', c.user_id)} 的 ${L.CHANNELS[c.channel]} 綁定？`, { danger: true })) && attempt(() => L.unlinkContact(c.id), '已解除')}>解除</button>
                </span>
              ),
          },
        ]} />
      </div>
      {unlinked.length > 0 && <p className="small muted">還沒綁定的員工：{unlinked.map((u) => u.name).join('、')}。請他們加入官方帳號後依指示申請。</p>}
    </>
  )
}

function Rules() {
  const canEdit = L.can('admin', 2)
  const roles = all('roles')
  const [rules, setRules] = useState(() => Object.fromEntries(Object.keys(L.NOTIFY_EVENTS).map((e) => [e, L.getRule(e)])))
  const set = (e, patch) => setRules({ ...rules, [e]: { ...rules[e], ...patch } })
  const toggleRole = (e, rid) => {
    const ids = rules[e].role_ids || []
    set(e, { role_ids: ids.includes(rid) ? ids.filter((x) => x !== rid) : [...ids, rid] })
  }
  return (
    <>
      <p className="muted small" style={{ margin: 0 }}>勾選每種事件要通知哪些職位。「負責業務」是指該客戶的負責業務員。做這個動作的人自己不會收到通知。</p>
      <div className="card table-wrap">
        <table className="table matrix">
          <thead>
            <tr><th>事件</th><th>啟用</th>{roles.map((r) => <th key={r.id} className="vert">{r.name}</th>)}<th className="vert">負責業務</th></tr>
          </thead>
          <tbody>
            {Object.entries(L.NOTIFY_EVENTS).map(([e, d]) => (
              <tr key={e}>
                <th>{d.label}{d.fixed && <div className="small muted">{d.who}</div>}</th>
                <td className="center"><input type="checkbox" aria-label={`啟用 ${d.label}`} disabled={!canEdit} checked={rules[e].enabled !== false} onChange={(ev) => set(e, { enabled: ev.target.checked })} /></td>
                {roles.map((r) => (
                  <td key={r.id} className="center">
                    {d.fixed ? <span className="muted">·</span> : <input type="checkbox" aria-label={`${d.label} 通知 ${r.name}`} disabled={!canEdit || rules[e].enabled === false} checked={(rules[e].role_ids || []).includes(r.id)} onChange={() => toggleRole(e, r.id)} />}
                  </td>
                ))}
                <td className="center">{d.fixed ? <span className="muted">·</span> : <input type="checkbox" aria-label={`${d.label} 通知負責業務`} disabled={!canEdit || rules[e].enabled === false} checked={!!rules[e].owner} onChange={(ev) => set(e, { owner: ev.target.checked })} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && <div className="row"><span style={{ flex: 1 }} /><button className="btn primary" onClick={() => attempt(() => L.saveRules(rules), '通知規則已儲存')}>儲存規則</button></div>}
    </>
  )
}

function Log() {
  const [open, setOpen] = useState(null)
  const rows = [...all('notifications')].reverse().slice(0, 300)
  const n = open && get('notifications', open)
  const recipients = (x) => (x.contact_ids?.length ? x.contact_ids.map((id) => get('notify_contacts', id)?.requested_name || get('notify_contacts', id)?.display_name) : (x.user_ids || []).map((id) => partyName('users', id)))
  return (
    <>
      <div className="card">
        <Table empty="還沒有通知" rows={rows} onRow={(x) => setOpen(x.id)} columns={[
          { h: '時間', r: (x) => <span className="small nowrap">{dt(x.created_at)}</span> },
          { h: '事件', r: (x) => <Badge>{L.NOTIFY_EVENTS[x.event]?.label || (x.event === 'contact' ? '綁定結果' : x.event === 'test' ? '測試' : x.event)}</Badge> },
          { h: '標題', r: (x) => x.title },
          { h: '收件人', r: (x) => <span className="small">{recipients(x).join('、')}</span> },
          { h: '狀態', r: (x) => { const [l, k] = STATUS[x.status] || [x.status, '']; return <Badge kind={k}>{l}</Badge> } },
        ]} />
      </div>
      {n && (
        <Modal title={n.title} onClose={() => setOpen(null)}>
          <div className="stack">
            <div className="bubble-preview">{L.formatNotificationPreview(n)}</div>
            <div className="small muted">收件人：{recipients(n).join('、')}</div>
            {(n.results || []).length > 0 && (
              <Table rows={n.results.map((r, i) => ({ id: i, ...r }))} columns={[
                { h: '對象', r: (r) => get('notify_contacts', r.contact_id)?.display_name },
                { h: '管道', r: (r) => chBadge(r.channel) },
                { h: '結果', r: (r) => (r.ok ? <Badge kind="ok">成功</Badge> : <Badge kind="bad">{r.error}</Badge>) },
              ]} />
            )}
          </div>
        </Modal>
      )}
    </>
  )
}

// ---------- 模擬器：在網頁上體驗員工手機上看到的對話 ----------
function Simulator() {
  const contacts = where('notify_contacts', (c) => c.status !== 'replaced')
  const [sel, setSel] = useState(contacts.find((c) => c.status === 'pending')?.id || contacts[0]?.id)
  const [chats, setChats] = useState({}) // contact id → [{ from, text, buttons, at }]
  const [text, setText] = useState('')
  const c = get('notify_contacts', sel)
  const push = (id, msgs) => setChats((s) => ({ ...s, [id]: [...(s[id] || []), ...msgs.map((m) => ({ ...m, at: new Date().toISOString() }))] }))
  const send = async (ev, shown) => {
    push(c.id, [{ from: 'me', text: shown }])
    const outs = await L.simulateIncoming({ channel: c.channel, externalId: c.external_id, displayName: c.display_name, ...ev })
    push(c.id, outs.map((o) => ({ from: 'bot', ...o })))
  }
  const join = async (channel) => {
    const name = await ask(`模擬一位新員工加入${channel === 'line' ? ' LINE 官方帳號' : ' Telegram 機器人'}。\n他的${L.CHANNELS[channel]}顯示名稱是？`, { input: true, placeholder: '例如：小陳' })
    if (!name) return
    const externalId = L.newSimId(channel)
    const outs = await L.simulateIncoming({ kind: 'follow', channel, externalId, displayName: name })
    const nc = where('notify_contacts', (x) => x.external_id === externalId)[0]
    setSel(nc.id)
    push(nc.id, [{ from: 'sys', text: `${name} 加入了官方帳號` }, ...outs.map((o) => ({ from: 'bot', ...o }))])
  }
  // 對話 + 這個人會收到的推播，依時間排序
  const feed = c ? [...(chats[c.id] || []), ...L.notificationsForContact(c).map((n) => ({ from: 'bot', push: true, at: n.created_at, ...L.formatOut(n), status: n.status }))].sort((a, b) => String(a.at).localeCompare(String(b.at))) : []
  return (
    <div className="sim">
      <div className="sim-list">
        <div className="row">
          <button className="btn primary" onClick={() => join('line')}>＋ LINE 新員工</button>
          <button className="btn" onClick={() => join('telegram')}>＋ Telegram</button>
        </div>
        {contacts.map((x) => (
          <button key={x.id} className={'sim-contact' + (x.id === sel ? ' on' : '')} onClick={() => setSel(x.id)}>
            <span className="avatar">{(x.display_name || '?').slice(0, 1)}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b>{x.user_id ? partyName('users', x.user_id) : x.requested_name || x.display_name}</b>
              <span className="small muted">{L.CHANNELS[x.channel]}・{{ approved: '已綁定', pending: '待確認', new: '設定中', rejected: '已退回', blocked: '已封鎖' }[x.status]}</span>
            </span>
          </button>
        ))}
      </div>
      {c ? (
        <div className={'phone ' + c.channel}>
          <div className="phone-top">
            <b>{c.channel === 'line' ? '示範雞肉食品廠（官方帳號）' : '@food_erp_bot'}</b>
            <span className="small">{c.display_name}</span>
          </div>
          <div className="phone-chat" aria-live="polite">
            {feed.length === 0 && <div className="small muted center">還沒有訊息。輸入「設定職位」開始。</div>}
            {feed.map((m, i) =>
              m.from === 'sys' ? (
                <div key={i} className="chat-sys">{m.text}</div>
              ) : (
                <div key={i} className={'chat-row ' + m.from}>
                  <div className="chat-bubble">
                    {m.text}
                    {m.link && <a className="chat-link" href={m.link.url.replace(/^.*#/, '#')}>{m.link.label} →</a>}
                    {m.push && m.status === 'demo' && <div className="chat-meta">示範資料</div>}
                  </div>
                  {m.from === 'bot' && m.buttons?.length > 0 && i === feed.length - 1 && (
                    <div className="chat-quick">
                      {m.buttons.map((b) => <button key={b.data} onClick={() => send({ kind: 'action', data: b.data }, b.label)}>{b.label}</button>)}
                    </div>
                  )}
                </div>
              ),
            )}
          </div>
          <form className="phone-input" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { send({ kind: 'text', text }, text); setText('') } }}>
            <input className="input" id="sim-text" placeholder="輸入訊息，例如：我的職位" value={text} onChange={(e) => setText(e.target.value)} aria-label="輸入訊息" />
            <button className="btn primary" type="submit">送出</button>
          </form>
        </div>
      ) : (
        <div className="card empty">按「＋ LINE 新員工」開始</div>
      )}
      <div className="sim-help small muted">
        試試看：① 按「＋ LINE 新員工」→ 在手機畫面選職位、輸入姓名 ② 到「綁定申請」按確定 ③ 回來看他收到的確認訊息 ④ 用他的職位去做一筆相關的動作（例如廠長開工單），再回來看推播。
      </div>
    </div>
  )
}

function Setup() {
  const cfg = supabaseConfig()
  const base = cfg?.url ? cfg.url.replace(/\/$/, '') + '/functions/v1' : 'https://<你的專案>.supabase.co/functions/v1'
  const [appUrl, setAppUrl] = useState(L.getSetting('app_url') || '')
  const copy = (t) => navigator.clipboard.writeText(t).then(() => toast('已複製'), () => toast('無法複製，請手動選取', 'bad'))
  const Code = ({ children }) => (
    <div className="code-row"><code>{children}</code><button className="btn sm" onClick={() => copy(children)}>複製</button></div>
  )
  return (
    <div className="stack">
      <div className="card card-pad stack">
        <h2>目前狀態</h2>
        <div>資料庫：<b>{backendName()}</b>。{cfg ? '產生通知後會自動呼叫 notify-dispatch 發送。' : '本機模式不會真的發送，請先在「開發者 → 資料庫設定」接上 Supabase。'}</div>
        <div className="row">
          <Field label="系統網址（訊息裡的「開啟系統」連結）"><Input value={appUrl} onChange={setAppUrl} placeholder="https://你的網域/" /></Field>
          <button className="btn" disabled={!L.can('admin', 2)} onClick={() => attempt(() => L.setSetting('app_url', appUrl.trim()), '已儲存')}>儲存</button>
        </div>
      </div>
      <div className="card card-pad stack">
        <h2>LINE 官方帳號</h2>
        <ol className="steps-list">
          <li>到 LINE Developers 建立 Provider 與 <b>Messaging API</b> channel（用你現有的官方帳號）。</li>
          <li>在 Basic settings 複製 <b>Channel secret</b>；在 Messaging API 分頁發行 <b>Channel access token (long-lived)</b>。</li>
          <li>在電腦上用 Supabase CLI 設定金鑰（金鑰只存在 Supabase，不會出現在網頁裡）：
            <Code>supabase secrets set LINE_CHANNEL_SECRET=你的secret LINE_CHANNEL_ACCESS_TOKEN=你的token</Code></li>
          <li>部署函式：
            <Code>supabase functions deploy line-webhook --no-verify-jwt</Code>
            <Code>supabase functions deploy notify-dispatch</Code></li>
          <li>回到 LINE Developers → Messaging API → Webhook URL 填入下面網址，按 Verify，並打開 <b>Use webhook</b>：
            <Code>{`${base}/line-webhook`}</Code></li>
          <li>在 LINE Official Account Manager 把「自動回應訊息」關掉、「Webhook」打開，避免官方帳號自己亂回。</li>
          <li>（選用）建立圖文選單，按鈕文字設成「設定職位」「我的職位」「暫停通知」，員工點了就會觸發對應功能。</li>
        </ol>
      </div>
      <div className="card card-pad stack">
        <h2>Telegram（選用）</h2>
        <ol className="steps-list">
          <li>在 Telegram 找 @BotFather，輸入 /newbot 建立機器人，取得 bot token。</li>
          <li>設定金鑰並部署：
            <Code>supabase secrets set TELEGRAM_BOT_TOKEN=你的token TELEGRAM_WEBHOOK_SECRET=自己取一串亂碼</Code>
            <Code>supabase functions deploy telegram-webhook --no-verify-jwt</Code></li>
          <li>把 webhook 指到 Supabase（在瀏覽器打開這個網址一次即可，記得換成你的值）：
            <Code>{`https://api.telegram.org/bot<TOKEN>/setWebhook?url=${base}/telegram-webhook&secret_token=<同上的亂碼>`}</Code></li>
          <li>員工搜尋你的機器人、按「Start」，流程跟 LINE 一樣。</li>
        </ol>
      </div>
      <div className="card card-pad stack">
        <h2>其他通訊軟體</h2>
        <ul className="steps-list">
          <li><b>WhatsApp</b>：可以接（WhatsApp Business Cloud API）。需要 Meta 商業驗證；主動推播要用事先審核過的「範本訊息」，且每則對話計費。程式架構已預留，加一個轉接檔即可。</li>
          <li><b>WeChat</b>：公眾號的範本訊息需要認證過的「服務號」，台灣公司申請不容易。如果是大陸廠區的同事，建議改用「企業微信」群組機器人（貼一個 webhook 網址就能推播），比較簡單。</li>
        </ul>
      </div>
    </div>
  )
}

