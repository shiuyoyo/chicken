import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { all, exportAll, importAll, clearAll, backendName } from '../db/store'
import { SCHEMA, TABLES, schemaSQL } from '../db/schema'
import { supabaseConfig, setSupabaseConfig, supabaseBackend } from '../db/supabase'
import { seedDemo } from '../db/seed'
import { stockOf, round } from '../logic'
import { Field, Input, Table, Tabs, Badge, dt, itemName, toast, Search, matches } from '../ui'

export default function Developer() {
  const [tab, setTab] = useState('data')
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="grow">開發者系統</h1>
        <Badge kind="primary">目前資料庫：{backendName()}</Badge>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[['data', '資料表'], ['backup', '備份 / 還原'], ['db', '資料庫設定'], ['check', '健康檢查'], ['log', '操作紀錄']]} />
      {tab === 'data' && <DataBrowser />}
      {tab === 'backup' && <Backup />}
      {tab === 'db' && <DbSettings />}
      {tab === 'check' && <HealthCheck />}
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
  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div className="row">
        <select className="input" style={{ width: 'auto' }} value={t} onChange={(e) => { setT(e.target.value); setSel(null) }}>
          {TABLES.map((x) => <option key={x} value={x}>{x}（{SCHEMA[x].label}）{all(x).length}</option>)}
        </select>
        <Search value={q} onChange={setQ} />
        <span className="muted small">{rows.length} 筆</span>
      </div>
      <div className="card">
        <Table rows={rows.slice(0, 200)} onRow={setSel} columns={[
          { h: 'id', r: (r) => <code className="small">{r.id.slice(0, 8)}</code> },
          ...cols.map((c) => ({ h: c, r: (r) => <span className="small">{typeof r[c] === 'object' ? JSON.stringify(r[c])?.slice(0, 60) : String(r[c] ?? '')}</span> })),
        ]} />
      </div>
      {sel && (
        <div className="card card-pad">
          <div className="row" style={{ marginBottom: 8 }}><b className="grow" style={{ flex: 1 }}>{t} / {sel.id}</b><button className="btn sm" onClick={() => setSel(null)}>關閉</button></div>
          <pre className="small" style={{ overflow: 'auto', maxHeight: 400, margin: 0 }}>{JSON.stringify(sel, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}

function Backup() {
  const download = () => {
    const blob = new Blob([JSON.stringify(exportAll(), null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `erp-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const upload = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    f.text().then(async (txt) => {
      try {
        const data = JSON.parse(txt)
        if (!confirm('還原會覆蓋目前所有資料，確定？')) return
        await importAll(data)
        toast('已還原')
      } catch (err) {
        toast('檔案格式錯誤：' + err.message, 'bad')
      }
    })
    e.target.value = ''
  }
  return (
    <div className="grid grid-2">
      <div className="card card-pad stack">
        <h2>備份</h2>
        <p className="muted" style={{ margin: 0 }}>把所有資料下載成 JSON 檔。本機儲存模式下資料只存在這台裝置的瀏覽器裡，建議定期備份。</p>
        <button className="btn primary" onClick={download}>下載備份檔</button>
      </div>
      <div className="card card-pad stack">
        <h2>還原</h2>
        <p className="muted" style={{ margin: 0 }}>從備份檔還原（會覆蓋目前資料）。也可用來把資料搬到另一台裝置。</p>
        <input type="file" accept="application/json" onChange={upload} />
      </div>
      <div className="card card-pad stack">
        <h2>示範資料</h2>
        <p className="muted" style={{ margin: 0 }}>清空並重新載入示範工廠資料（三杯雞、麻油雞…）。</p>
        <button className="btn" onClick={async () => confirm('會清除所有資料並重新載入示範資料，確定？') && (await seedDemo(), toast('已重新載入示範資料'))}>重設為示範資料</button>
      </div>
      <div className="card card-pad stack">
        <h2>清空資料</h2>
        <p className="muted" style={{ margin: 0 }}>刪除所有資料，從零開始建立自己的工廠。</p>
        <button className="btn danger" onClick={async () => prompt('輸入「清空」確認') === '清空' && (await clearAll(), toast('資料已清空'))}>清空所有資料</button>
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
      if (!confirm('會把這台裝置目前的資料上傳到 Supabase（覆蓋雲端資料），確定？')) return
      await supabaseBackend({ url, key }).replaceAll(exportAll())
    }
    setSupabaseConfig({ url, key })
    location.reload()
  }
  return (
    <div className="stack">
      <div className="card card-pad stack">
        <h2>Supabase 雲端資料庫</h2>
        <p className="muted" style={{ margin: 0 }}>
          目前使用：<b>{backendName()}</b>{cur?.from === 'env' && '（由 .env 設定）'}。改用 Supabase 後，所有手機、電腦都會看到同一份資料。
        </p>
        <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
          <li>到 supabase.com 建立專案</li>
          <li>SQL Editor 貼上下方 SQL 執行，建立資料表</li>
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
          <button className="btn" disabled={!url || !key} onClick={() => switchTo(false)}>直接切換（用雲端現有資料）</button>
          {cur?.from === 'settings' && <button className="btn danger" onClick={() => { setSupabaseConfig(null); location.reload() }}>改回本機儲存</button>}
        </div>
        {msg && <pre className="small" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{msg}</pre>}
      </div>
      <div className="card">
        <div className="card-head"><h2 className="grow">建表 SQL</h2><button className="btn sm" onClick={() => navigator.clipboard.writeText(sql).then(() => toast('已複製'))}>複製</button></div>
        <pre className="small card-pad" style={{ overflow: 'auto', maxHeight: 360, margin: 0 }}>{sql}</pre>
      </div>
    </div>
  )
}

function HealthCheck() {
  const issues = []
  for (const j of all('journal')) {
    const d = round(j.lines.reduce((s, l) => s + (l.debit || 0), 0))
    const c = round(j.lines.reduce((s, l) => s + (l.credit || 0), 0))
    if (d !== c) issues.push({ id: j.id, kind: '傳票借貸不平', text: `${j.no} 借 ${d} 貸 ${c}` })
  }
  for (const i of all('items')) {
    for (const loc of ['WH', 'WIP']) {
      const s = stockOf(i.id, loc)
      if (s < 0) issues.push({ id: i.id + loc, kind: '負庫存', text: `${i.name} ${loc === 'WH' ? '倉庫' : '產線'} ${s}` })
    }
  }
  for (const s of all('shipments'))
    for (const l of s.lines) {
      const lot = all('lots').find((x) => x.lot_no === l.lot_no)
      if (lot && lot.qc_status !== 'pass') issues.push({ id: s.id + l.lot_no, kind: '出貨批號非合格', text: `${s.no} ${l.lot_no}（後來被判 ${lot.qc_status}）` })
    }
  const counts = TABLES.map((t) => ({ id: t, t, n: all(t).length }))
  const size = new Blob([JSON.stringify(exportAll())]).size
  return (
    <div className="grid grid-2">
      <div className="card">
        <div className="card-head"><h2 className="grow">資料檢查</h2>{issues.length ? <Badge kind="bad">{issues.length} 個問題</Badge> : <Badge kind="ok">一切正常</Badge>}</div>
        <Table empty="沒有發現問題 ✅" rows={issues} columns={[{ h: '類型', r: (r) => r.kind }, { h: '內容', r: (r) => r.text }]} />
      </div>
      <div className="card">
        <div className="card-head"><h2 className="grow">資料量</h2><span className="muted small">約 {(size / 1024).toFixed(0)} KB</span></div>
        <Table rows={counts} columns={[{ h: '資料表', r: (r) => `${r.t}（${SCHEMA[r.t].label}）` }, { h: '筆數', cls: 'num', r: (r) => r.n }]} />
        <div className="card-pad muted small">本機儲存上限約 5 MB，接近時請切換到 Supabase。</div>
      </div>
    </div>
  )
}

function AuditLog() {
  const [q, setQ] = useState('')
  const rows = all('audit_log').filter((r) => matches(q, r.user_name, r.table_name, r.summary, r.action)).slice(0, 500)
  return (
    <div className="stack">
      <Search value={q} onChange={setQ} />
      <div className="card">
        <Table rows={rows} columns={[
          { h: '時間', r: (r) => <span className="nowrap">{dt(r.at)}</span> },
          { h: '使用者', r: (r) => r.user_name },
          { h: '動作', r: (r) => r.action },
          { h: '資料表', r: (r) => SCHEMA[r.table_name]?.label || r.table_name },
          { h: '內容', r: (r) => r.summary || (r.table_name === 'stock_moves' ? itemName(all('stock_moves').find((m) => m.id === r.row_id)?.item_id) : '') },
        ]} />
      </div>
    </div>
  )
}
