import { CrudPage } from '../ui'

export default function Users({ UserPicker }) {
  return (
    <div className="stack">
      <div className="card card-pad row">
        <span>這台裝置目前的使用者：</span>
        <UserPicker />
        <span className="muted small">操作紀錄會記錄是誰做的。正式上線接 Supabase 後可改成帳號登入。</span>
      </div>
      <CrudPage
        table="users"
        title="使用者"
        defaults={{ role: '現場', active: true }}
        searchKeys={['name', 'role']}
        fields={[
          { k: 'name', label: '姓名' },
          { k: 'role', label: '角色', options: ['管理者', '會計', '業務', '採購', '現場', '品管', '倉管', '開發者'].map((r) => ({ value: r, label: r })) },
        ]}
        columns={[{ h: '姓名', r: (u) => <b>{u.name}</b> }, { h: '角色', r: (u) => u.role }]}
      />
    </div>
  )
}
