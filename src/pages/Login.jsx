import { useState } from 'react'
import { all, get } from '../db/store'
import { login, getSetting } from '../logic'
import { attempt } from '../ui'
import { DEMO_USERS } from '../db/seed'

export default function Login() {
  const [userId, setUserId] = useState('')
  const [pin, setPin] = useState('')
  const users = all('users').filter((u) => u.active !== false)
  const u = get('users', userId)
  const press = (k) => {
    if (k === '⌫') return setPin(pin.slice(0, -1))
    const next = (pin + k).slice(0, 6)
    setPin(next)
    if (next.length === String(u?.pin || '').length && next.length >= 4) {
      if (!attempt(() => login(userId, next))) setPin('')
    }
  }
  const demo = DEMO_USERS.some(([n]) => users.some((x) => x.name === n))
  return (
    <div className="login">
      <div className="login-card">
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-logo">🐔</div>
          <div>
            <h1 style={{ fontSize: 20 }}>{getSetting('company_name')}</h1>
            <div className="muted small">食品工廠 ERP・請選擇你的名字並輸入 PIN</div>
          </div>
        </div>
        {!u ? (
          <div className="login-users">
            {users.map((x) => (
              <button key={x.id} className="login-user" onClick={() => setUserId(x.id)}>
                <span className="avatar">{x.name.slice(0, 1)}</span>
                <b>{x.name}</b>
                <span className="muted small">{get('roles', x.role_id)?.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="stack" style={{ alignItems: 'center' }}>
            <div className="row">
              <span className="avatar big">{u.name.slice(0, 1)}</span>
              <div>
                <b style={{ fontSize: 20 }}>{u.name}</b>
                <div className="muted">{get('roles', u.role_id)?.name}</div>
              </div>
            </div>
            <div className="pin-dots" aria-label={`已輸入 ${pin.length} 碼`}>
              {Array.from({ length: Math.max(4, String(u.pin || '').length) }).map((_, i) => (
                <i key={i} className={i < pin.length ? 'on' : ''} />
              ))}
            </div>
            <div className="keypad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) =>
                k ? (
                  <button key={i} onClick={() => press(k)} aria-label={k === '⌫' ? '刪除' : k}>
                    {k}
                  </button>
                ) : (
                  <span key={i} />
                ),
              )}
            </div>
            <button className="btn ghost" onClick={() => (setUserId(''), setPin(''))}>
              ← 換人
            </button>
          </div>
        )}
        {demo && (
          <details className="small muted">
            <summary>示範帳號 PIN</summary>
            <div className="demo-pins">
              {DEMO_USERS.map(([n, r, p]) => (
                <span key={n}>
                  {n}（{r}）<b>{p}</b>
                </span>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
