import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { all, get, exportAll, importAll, clearAll, backendName, currentUser } from '../db/store'
import { SCHEMA, TABLES, REFS, schemaSQL } from '../db/schema'
import { supabaseConfig, setSupabaseConfig, supabaseBackend } from '../db/supabase'
import { seedDemo } from '../db/seed'
import * as L from '../logic'
import { Field, Input, Table, Badge, dt, toast, Search, matches, ask, useTab, Tabs } from '../ui'

export default function Developer() {
  const [tab, setTab] = useTab('data')
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">開發者系統</h1>
        <Badge kind="primary">目前資料庫：{backendName()}</Badge>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['data', '資料表'], ['check', '健康檢查'], ['backup', '備份 / 還原'], ['db', '資料庫設定'], ['log', '操作紀錄']]} />
      {tab === 'data' && <DataBrowser />}
      {tab === 'check' && <HealthCheck />}
      {tab === 'backup' && <Backup />}
      {tab === 'db' && <DbSettings />}
      {tab === 'log' && <AuditLog />}
    </div>
  )
}

function DataBrowser() {
  const [t, setT] = useState('sales_orders')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null)
  const rows = all(t).filter((r) => !q || matches(q, JSON.stringify(r)))
  const cols = Object.keys(SCHEMA[t].cols).slice(0, 6)
  const refs = sel ? Object.entries(sel).filter(([k, v]) => REFS[k] && v) : []
  return (
    <div className="stack">
      <div className="row">
        <select className="input auto" value={t} onChange={(e) => { setT(e.target.value); setSel(null) }} aria-label="資料表">
          {TABLES.map((x) => <option key={x} value={x}>{x}（{SCHEMA[x].label}）{all(x).length}</option>)}
        </select>
        <Search value={q} onChange={setQ} />
        <span className="muted small">{rows.length} 筆</span>
      </div>
      <div className="card">
        <Table rows={rows.slice(0, 200)} onRow={setSel} columns={[
          { h: 'id', r: (r) => <code className="small">{r.id.slice(0, 8)}</code> },
          ...cols.map((c) => ({ h: c, r: (r) => <span className="small">{typeof r[c] === 'object' ? JSON.stringify(r[c])?.slice(0, 50) : String(r[c] ?? '')}</span> })),
        ]} />
      </div>
      {sel && (
        <div className="card card-pad stack">
          <div className="row"><b style={{ flex: 1 }}>{t} / {sel.id}</b><button className="btn sm" onClick={() => setSel(null)}>關閉</button></div>
          {refs.length > 0 && (
            <div className="small">關聯：{refs.map(([k, v]) => <span key={k} className="badge info" style={{ marginRight: 6 }}>{k} → {REFS[k]}：{get(REFS[k], v)?.no || get(REFS[k], v)?.name || get(REFS[k], v)?.code || (get(REFS[k], v) ? v.slice(0, 8) : '⚠ 找不到')}</span>)}</div>
          )}
          <pre className="small code">{JSON.stringify(sel, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}

function HealthCheck() {
  const issues = []
  for (const j of all('journal')) {
    const d = L.round(L.sum(j.lines, (l) => l.debit))
    const c = L.round(L.sum(j.lines, (l) => l.credit))
    if (d !== c) issues.push({ kind: '傳票借貸不平', text: `${j.no} 借 ${d} 貸 ${c}` })
  }
  for (const r of L.stockRows()) if (r.qty < 0) issues.push({ kind: '負庫存', text: `${get('items', r.item_id)?.name} ${L.binLabel(r.bin_id)} ${r.lot_no} ${r.qty}` })
  // 外鍵完整性：每個 _id 欄位都要指到存在的資料
  let refCount = 0
  for (const t of TABLES) {
    for (const row of all(t)) {
      for (const [k, v] of Object.entries(row)) {
        if (!REFS[k] || !v || (t === 'stock_moves' && k === 'ref_id')) continue
        refCount++
        if (!get(REFS[k], v)) issues.push({ kind: '關聯斷裂', text: `${t}.${k} = ${v} 在 ${REFS[k]} 找不到` })
      }
    }
  }
  for (const s of all('shipments'))
    for (const l of s.lines) {
      const lot = L.lotByNo(l.lot_no)
      if (!lot) issues.push({ kind: '出貨批號不存在', text: `${s.no} ${l.lot_no}` })
    }
  const checks = L.closingChecks(L.today())
  const counts = TABLES.map((t) => ({ id: t, t, n: all(t).length }))
  const size = new Blob([JSON.stringify(exportAll())]).size
  return (
    <div className="stack">
      <div className="grid grid-2">
        <div className="card">
          <div className="card-head"><h2 className="grow">資料一致性</h2>{issues.length ? <Badge kind="bad">{issues.length} 個問題</Badge> : <Badge kind="ok">一切正常</Badge>}</div>
          <div className="card-pad small muted">檢查了 {refCount.toLocaleString()} 個關聯欄位、{all('journal').length} 張傳票、{L.stockRows().length} 筆庫存</div>
          <Table empty="沒有發現問題 ✅" rows={issues.map((x, i) => ({ id: i, ...x }))} columns={[{ h: '類型', r: (r) => r.kind }, { h: '內容', r: (r) => r.text }]} />
        </div>
        <div className="card">
          <div className="card-head"><h2>帳務檢查</h2></div>
          <Table rows={checks.map((c, i) => ({ id: i, ...c }))} columns={[{ h: '項目', r: (c) => c.name }, { h: '', r: (c) => (c.ok ? <Badge kind="ok">OK</Badge> : <Badge kind="warn">注意</Badge>) }, { h: '說明', r: (c) => <span className="small">{c.detail}</span> }]} />
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h2 className="grow">資料量</h2><span className="muted small">約 {(size / 1024).toFixed(0)} KB（本機儲存上限約 5 MB，接近時請改用 Supabase）</span></div>
        <Table rows={counts} columns={[{ h: '資料表', r: (r) => `${r.t}` }, { h: '說明', r: (r) => SCHEMA[r.t].label }, { h: '分類', r: (r) => SCHEMA[r.t].group }, { h: '筆數', cls: 'num', r: (r) => r.n }]} />
      </div>
    </div>
  )
}

function Backup() {
  const [text, setText] = useState('')
  const json = () => JSON.stringify(exportAll())
  const download = () => {
    try {
      const blob = new Blob([json()], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `erp-backup-${L.today()}.json`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      toast('這個環境不允許下載，請改用「複製備份文字」', 'bad')
    }
  }
  const restore = async (txt) => {
    try {
      const data = JSON.parse(txt)
      if (!(await ask('還原會覆蓋目前所有資料，確定？', { danger: true, confirmText: '還原' }))) return
      await importAll(data)
      toast('已還原')
    } catch (err) {
      toast('格式錯誤：' + err.message, 'bad')
    }
  }
  return (
    <div className="grid grid-2">
      <div className="card card-pad stack">
        <h2>備份</h2>
        <p className="muted" style={{ margin: 0 }}>本機儲存模式下資料只在這台裝置的瀏覽器裡，請定期備份。</p>
        <div className="row">
          <button className="btn primary" onClick={download}>下載備份檔</button>
          <button className="btn" onClick={() => navigator.clipboard.writeText(json()).then(() => toast('已複製備份文字'), () => setText(json()))}>複製備份文字</button>
        </div>
      </div>
      <div className="card card-pad stack">
        <h2>還原</h2>
        <input type="file" accept="application/json" aria-label="選擇備份檔" onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(restore); e.target.value = '' }} />
        <textarea className="input" placeholder="或貼上備份文字" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn" disabled={!text} onClick={() => restore(text)}>從文字還原</button>
      </div>
      <div className="card card-pad stack">
        <h2>示範資料</h2>
        <p className="muted" style={{ margin: 0 }}>清空並重新載入示範工廠（三杯雞、麻油雞、舒肥雞胸，含各種待簽核單據）。會登出。</p>
        <button className="btn" onClick={async () => (await ask('會清除所有資料並重新載入示範資料，確定？', { danger: true })) && (await seedDemo(), toast('已重新載入示範資料'))}>重設為示範資料</button>
      </div>
      <div className="card card-pad stack">
        <h2>清空資料</h2>
        <p className="muted" style={{ margin: 0 }}>刪除所有資料，從零開始。會保留你目前的帳號與管理者角色，避免被鎖在外面。</p>
        <button className="btn danger" onClick={async () => {
          if ((await ask('輸入「清空」確認刪除所有資料', { input: true, danger: true })) !== '清空') return
          const user = currentUser()
          const role = get('roles', user?.role_id)
          await clearAll()
          await importAll({ users: user ? [user] : [], roles: role ? [role] : [] })
          toast('資料已清空')
        }}>清空所有資料</button>
      </div>
    </div>
  )
}

function DbSettings() {
  const cur = supabaseConfig()
  const [url, setUrl] = useState(cur?.url || '')
  const [key, setKey] = useState(cur?.from === 'settings' ? cur.key : '')
  const [msg, setMsg] = useState('')
  const sql = schemaSQL()
  const test = async () => {
    setMsg('連線測試中…')
    try {
      const sb = createClient(url, key)
      const missing = []
      for (const t of TABLES) {
        const { error } = await sb.from(t).select('id').limit(1)
        if (error) missing.push(`${t}：${error.message}`)
      }
      setMsg(missing.length ? '連上了，但有資料表有問題（請先執行下方 SQL）：\n' + missing.join('\n') : '✅ 連線成功，所有資料表都在')
      return !missing.length
    } catch (e) {
      setMsg('❌ ' + e.message)
      return false
    }
  }
  const switchTo = async (migrate) => {
    if (!(await test())) return
    if (migrate) {
      if (!(await ask('會把這台裝置的資料上傳到 Supabase（覆蓋雲端資料），確定？'))) return
      await supabaseBackend({ url, key }).replaceAll(exportAll())
    }
    setSupabaseConfig({ url, key })
    location.reload()
  }
  return (
    <div className="stack">
      <div className="card card-pad stack">
        <h2>Supabase 雲端資料庫</h2>
        <p className="muted" style={{ margin: 0 }}>目前使用：<b>{backendName()}</b>{cur?.from === 'env' && '（由 .env 設定）'}。改用 Supabase 後，所有手機、電腦會看到同一份資料。</p>
        <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
          <li>到 supabase.com 建立專案</li>
          <li>SQL Editor 貼上下方 SQL 執行，建立 {TABLES.length} 張資料表與索引</li>
          <li>Project Settings → API 複製 Project URL 與 anon key 貼到下面</li>
          <li>按「上傳本機資料並切換」</li>
        </ol>
        <div className="form-grid">
          <Field label="Project URL"><Input value={url} onChange={setUrl} placeholder="https://xxxx.supabase.co" /></Field>
          <Field label="anon public key"><Input value={key} onChange={setKey} placeholder="eyJhbGciOi..." /></Field>
        </div>
        <div className="row">
          <button className="btn" disabled={!url || !key} onClick={test}>測試連線</button>
          <button className="btn primary" disabled={!url || !key} onClick={() => switchTo(true)}>上傳本機資料並切換</button>
          <button className="btn" disabled={!url || !key} onClick={() => switchTo(false)}>直接切換</button>
          {cur?.from === 'settings' && <button className="btn danger" onClick={() => { setSupabaseConfig(null); location.reload() }}>改回本機儲存</button>}
        </div>
        {msg && <pre className="small" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{msg}</pre>}
      </div>
      <div className="card">
        <div className="card-head"><h2 className="grow">建表 SQL</h2><button className="btn sm" onClick={() => navigator.clipboard.writeText(sql).then(() => toast('已複製'), () => toast('無法複製，請手動選取', 'bad'))}>複製</button></div>
        <pre className="small card-pad code">{sql}</pre>
      </div>
    </div>
  )
}

function AuditLog() {
  const [q, setQ] = useState('')
  const rows = all('audit_log').filter((r) => matches(q, r.user_name, r.table_name, r.summary, r.action)).slice(0, 500)
  return (
    <div className="stack">
      <Search value={q} onChange={setQ} placeholder="人員 / 資料表 / 內容" />
      <div className="card">
        <Table rows={rows} columns={[
          { h: '時間', r: (r) => <span className="nowrap small">{dt(r.at)}</span> },
          { h: '使用者', r: (r) => r.user_name },
          { h: '動作', r: (r) => r.action },
          { h: '資料表', r: (r) => SCHEMA[r.table_name]?.label || r.table_name },
          { h: '內容', r: (r) => r.summary },
        ]} />
      </div>
    </div>
  )
}
