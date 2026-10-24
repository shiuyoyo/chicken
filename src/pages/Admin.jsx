import { useState } from 'react'
import { all, get, where, currentUser } from '../db/store'
import * as L from '../logic'
import { Modal, Field, Input, Select, Check, Table, Badge, Tabs, attempt, ask, useTab } from '../ui'

const LEVEL_KIND = ['', 'info', 'primary', 'ok']

export default function Admin() {
  const [tab, setTab] = useTab('users')
  return (
    <div className="stack">
      <div className="page-head"><h1 className="grow">使用者與權限</h1></div>
      <Tabs value={tab} onChange={setTab} tabs={[['users', '使用者'], ['roles', '角色權限'], ['settings', '系統設定與營運規則']]} />
      {tab === 'users' && <Users />}
      {tab === 'roles' && <Roles />}
      {tab === 'settings' && <Settings />}
    </div>
  )
}

function Users() {
  const [edit, setEdit] = useState(null)
  const canEdit = L.can('admin', 2)
  const save = () => {
    const { id, created_at, updated_at, ...d } = edit
    if (attempt(() => L.saveUser(d, id), '已儲存')) setEdit(null)
  }
  return (
    <>
      {canEdit && <div className="row"><button className="btn primary" onClick={() => setEdit({ name: '', role_id: '', pin: '', active: true })}>＋ 新增使用者</button></div>}
      <div className="card">
        <Table rows={all('users')} onRow={canEdit ? (u) => setEdit({ ...u }) : undefined} columns={[
          { h: '姓名', r: (u) => <b>{u.name}</b> },
          { h: '角色', r: (u) => get('roles', u.role_id)?.name },
          { h: '狀態', r: (u) => (u.active === false ? <Badge kind="bad">停用</Badge> : <Badge kind="ok">啟用</Badge>) },
          { h: '最近操作', r: (u) => <span className="small muted">{all('audit_log').find((a) => a.user_name === u.name)?.at?.slice(0, 16).replace('T', ' ') || '—'}</span> },
        ]} />
      </div>
      {edit && (
        <Modal title={edit.id ? `編輯 ${edit.name}` : '新增使用者'} onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>取消</button><button className="btn primary" onClick={save}>儲存</button></>}>
          <div className="form-grid">
            <Field label="姓名"><Input value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} /></Field>
            <Field label="角色"><Select value={edit.role_id} options={all('roles').map((r) => ({ value: r.id, label: r.name }))} onChange={(v) => setEdit({ ...edit, role_id: v })} /></Field>
            <Field label="登入 PIN（4–6 位數字）"><Input inputMode="numeric" value={edit.pin} onChange={(v) => setEdit({ ...edit, pin: v.replace(/\D/g, '') })} /></Field>
            <Field label="手機"><Input value={edit.phone} onChange={(v) => setEdit({ ...edit, phone: v })} /></Field>
            <Check checked={edit.active !== false} onChange={(v) => setEdit({ ...edit, active: v })} label="啟用" />
          </div>
        </Modal>
      )}
    </>
  )
}

function Roles() {
  const [edit, setEdit] = useState(null)
  const canEdit = L.can('admin', 2)
  const mods = Object.entries(L.MODULES)
  const save = () => {
    const { id, created_at, updated_at, ...d } = edit
    if (attempt(() => L.saveRole(d, id), '已儲存')) setEdit(null)
  }
  return (
    <>
      <p className="muted small" style={{ margin: 0 }}>無 = 看不到；檢視 = 只能看；編輯 = 可以新增修改；核准 = 可以簽核該模組的單據（例如大額採購、信用額度、盤差）。</p>
      {canEdit && <div className="row"><button className="btn primary" onClick={() => setEdit({ name: '', perms: {} })}>＋ 新增角色</button></div>}
      <div className="card table-wrap">
        <table className="table matrix">
          <thead>
            <tr><th>角色</th>{mods.map(([k, l]) => <th key={k} className="vert"><span>{l}</span></th>)}<th>人數</th></tr>
          </thead>
          <tbody>
            {all('roles').map((r) => (
              <tr key={r.id} className={canEdit ? 'click' : ''} onClick={() => canEdit && setEdit(JSON.parse(JSON.stringify(r)))}>
                <th>{r.name}</th>
                {mods.map(([k]) => <td key={k} className="center">{r.perms?.[k] ? <Badge kind={LEVEL_KIND[r.perms[k]]}>{L.LEVELS[r.perms[k]]}</Badge> : <span className="muted">·</span>}</td>)}
                <td className="num">{where('users', (u) => u.role_id === r.id).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <Modal wide title={edit.id ? `編輯角色 ${edit.name}` : '新增角色'} onClose={() => setEdit(null)}
          footer={<>{edit.id && <button className="btn danger" onClick={async () => (await ask('刪除這個角色？', { danger: true })) && attempt(() => L.deleteRole(edit.id), '已刪除') && setEdit(null)}>刪除</button>}<span style={{ flex: 1 }} /><button className="btn" onClick={() => setEdit(null)}>取消</button><button className="btn primary" onClick={save}>儲存</button></>}>
          <div className="stack">
            <Field label="角色名稱"><Input value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} /></Field>
            <div className="perm-grid">
              {mods.map(([k, l]) => (
                <div key={k} className="perm-row">
                  <span>{l}</span>
                  <div className="mode-switch">
                    {L.LEVELS.map((lv, i) => (
                      <button key={i} className={(edit.perms?.[k] || 0) === i ? 'on' : ''} onClick={() => setEdit({ ...edit, perms: { ...edit.perms, [k]: i } })}>{lv}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

function Settings() {
  const canEdit = L.can('admin', 2)
  const keys = Object.keys(L.SETTING_LABELS)
  const [vals, setVals] = useState(Object.fromEntries(keys.map((k) => [k, L.getSetting(k)])))
  const [lines, setLines] = useState(L.getSetting('lines'))
  const save = () =>
    attempt(() => {
      for (const k of keys) {
        const def = L.SETTING_DEFAULTS[k]
        const v = typeof def === 'number' ? Number(vals[k]) : vals[k]
        if (typeof def === 'number' && isNaN(v)) L.fail(`${L.SETTING_LABELS[k]} 必須是數字`)
        if (v !== L.getSetting(k)) L.setSetting(k, v)
      }
      L.setSetting('lines', lines.filter((l) => l.name).map((l) => ({ name: l.name, capacity: Number(l.capacity) || 0 })))
    }, '設定已儲存')
  return (
    <div className="stack">
      <div className="card card-pad">
        <div className="form-grid">
          {keys.map((k) =>
            typeof L.SETTING_DEFAULTS[k] === 'boolean' ? (
              <Check key={k} checked={vals[k]} onChange={(v) => setVals({ ...vals, [k]: v })} label={L.SETTING_LABELS[k]} />
            ) : (
              <Field key={k} label={L.SETTING_LABELS[k]}>
                <Input disabled={!canEdit} type={typeof L.SETTING_DEFAULTS[k] === 'number' ? 'number' : 'text'} step="any" value={vals[k]} onChange={(v) => setVals({ ...vals, [k]: v })} />
              </Field>
            ),
          )}
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3 className="grow">產線與每日產能</h3>{canEdit && <button className="btn sm" onClick={() => setLines([...lines, { name: '', capacity: 0 }])}>＋ 產線</button>}</div>
        <div className="card-pad stack">
          {lines.map((l, i) => (
            <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
              <Input disabled={!canEdit} value={l.name} placeholder="產線名稱" onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, name: v } : x)))} />
              <Input disabled={!canEdit} type="number" value={l.capacity} placeholder="每日產能" onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, capacity: v } : x)))} />
              {canEdit && <button className="btn sm ghost danger" aria-label="移除" onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button>}
            </div>
          ))}
        </div>
      </div>
      {canEdit && <div className="row"><span style={{ flex: 1 }} /><button className="btn primary" onClick={save}>儲存設定</button></div>}
      <p className="muted small">目前登入：{currentUser()?.name}</p>
    </div>
  )
}
