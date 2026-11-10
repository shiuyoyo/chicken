// 雲端版入口：Email + 密碼登入（Supabase Auth），登入後才載入資料。
// 第一次使用（資料庫是空的）時，系統擁有者可以載入示範資料、上傳這台裝置的本機資料，或從空白開始。
import { useEffect, useState } from 'react'
import { initStore, importAll, currentBackend, setPref, getPref, all, insert, update, transaction, reloadAll } from '../db/store'
import { readLocalData } from '../db/local'
import { supabaseClient, friendlyError, isNetworkError } from '../db/supabase'
import { seedDemo } from '../db/seed'
import { MODULES } from '../logic'
import App from '../App'

const redirectTo = () => location.origin + location.pathname

export default function CloudGate() {
  const sb = supabaseClient()
  const [phase, setPhase] = useState('checking')
  const [who, setWho] = useState(null)
  const [err, setErr] = useState('')

  const enter = async () => {
    setPhase('loading')
    setErr('')
    try {
      // supabase 的查詢物件只能 await（沒有 .catch），網路錯誤用 try 接
      let w, error
      if (navigator.onLine === false && getPref('cloudWho')) error = new TypeError('Failed to fetch')
      else
        try {
          ;({ data: w, error } = await sb.rpc('erp_whoami'))
        } catch (e) {
          error = e
        }
      // 斷線（例如展場）：用這台裝置上次登入時的身分繼續
      if (error && isNetworkError(error) && getPref('cloudWho')) ({ data: w, error } = { data: getPref('cloudWho'), error: null })
      if (error) throw new Error(/erp_whoami/.test(error.message) ? '雲端資料庫還沒有建立資料表，請先在 Supabase 的 SQL Editor 執行 supabase/schema.sql' : friendlyError(error.message))
      setPref('cloudWho', w)
      setWho(w)
      if (!w.owner && !w.user_id) return setPhase('pending')
      const empty = await initStore()
      if (w.user_id) {
        setPref('userId', w.user_id)
        return setPhase('ready')
      }
      setPhase(empty ? 'setup' : 'pick')
    } catch (e) {
      setErr(e.message)
      setPhase('error')
    }
  }

  useEffect(() => {
    const { data: sub } = sb.auth.onAuthStateChange((ev) => {
      if (ev === 'PASSWORD_RECOVERY') setPhase('recovery')
    })
    sb.auth.getSession().then(({ data }) => {
      // 從重設密碼信回來時，onAuthStateChange 會切到 recovery，這裡不要蓋掉
      setPhase((p) => (p === 'recovery' ? p : data.session ? (enter(), 'loading') : 'signin'))
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // 定時同步其他裝置的異動（沒有待上傳、沒有斷線時才重新載入）
  useEffect(() => {
    if (phase !== 'ready') return
    const t = setInterval(() => {
      const b = currentBackend()
      if (document.visibilityState === 'visible' && b.idle?.()) reloadAll().catch(() => {})
    }, 60000)
    return () => clearInterval(t)
  }, [phase])

  if (phase === 'ready') return <App />
  const signOut = async () => {
    await sb.auth.signOut()
    location.reload()
  }
  return (
    <div className="login">
      <div className="login-card">
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-logo">🏭</div>
          <div>
            <h1 style={{ fontSize: 20 }}>工廠 ERP</h1>
            <div className="muted small">雲端版・用公司 Email 登入</div>
          </div>
        </div>
        {(phase === 'checking' || phase === 'loading') && <p className="muted">載入中…</p>}
        {phase === 'signin' && <SignIn sb={sb} onDone={enter} />}
        {phase === 'recovery' && <NewPassword sb={sb} onDone={enter} />}
        {phase === 'pending' && (
          <div className="stack">
            <p style={{ margin: 0 }}>你的帳號 <b>{who?.email}</b> 已經登入，但還沒有開通。</p>
            <p className="muted small" style={{ margin: 0 }}>請管理員到「使用者與權限」，在你的員工資料填上這個 Email，然後再重新整理。</p>
            <div className="row"><button className="btn primary" onClick={enter}>重新檢查</button><button className="btn" onClick={signOut}>登出</button></div>
          </div>
        )}
        {phase === 'setup' && <FirstSetup email={who?.email} onDone={enter} />}
        {phase === 'pick' && <PickIdentity email={who?.email} onDone={enter} />}
        {phase === 'error' && (
          <div className="stack">
            <p className="tone-bad" style={{ margin: 0 }}>{err}</p>
            <div className="row">
              <button className="btn primary" onClick={enter}>再試一次</button>
              <button className="btn" onClick={signOut}>登出</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SignIn({ sb, onDone }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    try {
      if (mode === 'login') {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pw })
        if (error) throw new Error(/Invalid login/i.test(error.message) ? 'Email 或密碼不正確' : /not confirmed/i.test(error.message) ? '請先到信箱點確認連結' : error.message)
        return onDone()
      }
      if (mode === 'signup') {
        if (pw.length < 8) throw new Error('密碼至少 8 個字')
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password: pw, options: { emailRedirectTo: redirectTo() } })
        if (error) throw new Error(error.message)
        if (data.session) return onDone()
        setMsg('已寄出確認信，請到信箱點連結後再回來登入。')
      }
      if (mode === 'forgot') {
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo() })
        if (error) throw new Error(error.message)
        setMsg('已寄出重設密碼信，請到信箱點連結。')
      }
    } catch (e2) {
      setMsg('❌ ' + e2.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="stack" onSubmit={go}>
      <label className="field"><span className="field-label">Email</span><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      {mode !== 'forgot' && (
        <label className="field"><span className="field-label">{mode === 'signup' ? '設定密碼（至少 8 個字）' : '密碼'}</span><input className="input" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required value={pw} onChange={(e) => setPw(e.target.value)} /></label>
      )}
      <button className="btn primary" disabled={busy}>{{ login: '登入', signup: '建立帳號', forgot: '寄重設密碼信' }[mode]}</button>
      {msg && <p className="small" style={{ margin: 0 }}>{msg}</p>}
      <div className="row small">
        {mode !== 'login' && <button type="button" className="btn sm ghost" onClick={() => setMode('login')}>回到登入</button>}
        {mode !== 'signup' && <button type="button" className="btn sm ghost" onClick={() => setMode('signup')}>第一次使用？設定密碼</button>}
        {mode !== 'forgot' && <button type="button" className="btn sm ghost" onClick={() => setMode('forgot')}>忘記密碼</button>}
      </div>
      {mode === 'signup' && <p className="muted small" style={{ margin: 0 }}>請用管理員幫你登記的公司 Email。建立後要到信箱點確認連結，管理員確認你的員工資料後就能使用。</p>}
    </form>
  )
}

function NewPassword({ sb, onDone }) {
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')
  const go = async (e) => {
    e.preventDefault()
    if (pw.length < 8) return setMsg('密碼至少 8 個字')
    const { error } = await sb.auth.updateUser({ password: pw })
    if (error) return setMsg('❌ ' + error.message)
    onDone()
  }
  return (
    <form className="stack" onSubmit={go}>
      <label className="field"><span className="field-label">設定新密碼（至少 8 個字）</span><input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
      <button className="btn primary">儲存新密碼</button>
      {msg && <p className="small" style={{ margin: 0 }}>{msg}</p>}
    </form>
  )
}

// 第一次使用：資料庫是空的，只有系統擁有者會看到
function FirstSetup({ email, onDone }) {
  const local = readLocalData()
  const localCount = local ? Object.values(local).reduce((n, rows) => n + (Array.isArray(rows) ? rows.length : 0), 0) : 0
  const [name, setName] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const run = (label, fn) => async () => {
    setBusy(label)
    setErr('')
    try {
      await fn()
      await onDone()
    } catch (e) {
      setErr(e.message)
      setBusy('')
    }
  }
  const cloud = currentBackend()
  // 示範資料先在記憶體裡跑完再一次上傳，「王老闆」會綁定你的 Email
  const demo = run('demo', () => seedDemo({ ownerEmail: email }))
  const fromLocal = run('local', async () => {
    await importAll(local)
  })
  const blank = run('blank', async () => {
    if (!name.trim()) throw new Error('請輸入你的姓名')
    transaction(() => {
      const role = insert('roles', { name: '管理者', perms: Object.fromEntries(Object.keys(MODULES).map((m) => [m, 3])) })
      insert('users', { name: name.trim(), role_id: role.id, email, active: true, pin: '' })
    })
    await cloud.flushed()
  })
  return (
    <div className="stack">
      <p style={{ margin: 0 }}>歡迎！雲端資料庫目前是空的。你是系統擁有者（{email}），請選擇要怎麼開始：</p>
      <button className="btn primary" disabled={!!busy} onClick={demo}>{busy === 'demo' ? '上傳中…' : '載入示範資料（先試用）'}</button>
      {localCount > 0 && <button className="btn" disabled={!!busy} onClick={fromLocal}>{busy === 'local' ? '上傳中…' : `上傳這台裝置的本機資料（${localCount} 筆）`}</button>}
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input className="input" placeholder="你的姓名" value={name} onChange={(e) => setName(e.target.value)} aria-label="你的姓名" />
        <button className="btn" disabled={!!busy} onClick={blank}>從空白開始</button>
      </div>
      <p className="muted small" style={{ margin: 0 }}>示範資料裡的「王老闆」會綁定你的 Email。之後到「使用者與權限」幫每位員工填上 Email，他們就能用自己的 Email 登入。</p>
      {err && <p className="tone-bad small" style={{ margin: 0 }}>{err}</p>}
    </div>
  )
}

// 系統擁有者第一次登入、資料庫已經有資料：選擇自己是哪一位員工
function PickIdentity({ email, onDone }) {
  const [err, setErr] = useState('')
  const roles = all('roles')
  const users = all('users').filter((u) => u.active !== false && !u.email)
  const admins = users.filter((u) => Number(roles.find((r) => r.id === u.role_id)?.perms?.admin || 0) >= 3)
  const pick = async (u) => {
    try {
      // 一般的修改：一樣經過伺服器權限檢查（系統擁有者有全部權限）
      update('users', u.id, { email })
      await currentBackend().flushed()
      onDone()
    } catch (e) {
      setErr(e.message)
    }
  }
  return (
    <div className="stack">
      <p style={{ margin: 0 }}>你是系統擁有者（{email}）。請選擇你在系統裡是哪一位，之後就用這個 Email 登入：</p>
      <div className="login-users">
        {(admins.length ? admins : users).map((u) => (
          <button key={u.id} className="login-user" onClick={() => pick(u)}>
            <span className="avatar">{u.name.slice(0, 1)}</span>
            <b>{u.name}</b>
            <span className="muted small">{roles.find((r) => r.id === u.role_id)?.name}</span>
          </button>
        ))}
      </div>
      {!users.length && <p className="muted small">沒有可以綁定的員工（都已經有 Email）。請在 SQL Editor 把某位員工的 email 改成你的。</p>}
      {err && <p className="tone-bad small" style={{ margin: 0 }}>{err}</p>}
    </div>
  )
}
