// 資料庫重播：每個業務規則測試跑完後，把它做過的每一批寫入，用當時操作的員工身分送進真的 PostgreSQL
// （套用 supabase/schema.sql 的權限、門檻與觸發器）。任何一批被伺服器拒絕，這個測試就失敗。
// 用來確認：畫面上允許的正常操作，雲端版伺服器也都會接受。
import { beforeAll, afterAll, afterEach } from 'vitest'
import { randomUUID } from 'crypto'
import { schemaSQL, TABLES } from '../../src/db/schema'
import { toDbRow } from '../../src/db/supabase'
import { startPostgres, AUTH_STUB, asUser, dollar } from '../pg'

let pg
const owner = randomUUID()
const uuidOf = new Map()
globalThis.__replay = {
  batches: [],
  reset() {
    this.batches = []
  },
}

beforeAll(() => {
  pg = startPostgres()
  pg.psql(AUTH_STUB)
  pg.psql(schemaSQL())
  pg.psql(`insert into auth.users values ('${owner}', 'owner@t.local', now()); insert into erp_private.owners values ('owner@t.local');`)
}, 120000)
afterAll(() => pg?.stop())

afterEach(() => {
  const { batches } = globalThis.__replay
  if (!batches.length) return
  // 每個測試從空的資料庫開始
  pg.psql(`truncate ${TABLES.map((t) => 'public.' + t).join(', ')}; delete from auth.users where id <> '${owner}';`)
  uuidOf.clear()
  const email = (id) => `${String(id).toLowerCase()}@t.local`
  const sql = []
  for (const b of batches) {
    if (b.by && !uuidOf.has(b.by)) {
      uuidOf.set(b.by, randomUUID())
      sql.push(`insert into auth.users values ('${uuidOf.get(b.by)}', '${email(b.by)}', now());`)
    }
    const ops = b.ops.map(({ t, op, row }) => ({ t, op, row: op === 'delete' ? { id: row.id } : toDbRow(t, t === 'users' ? { ...row, email: email(row.id) } : row) }))
    sql.push(asUser(b.by ? uuidOf.get(b.by) : owner, `select public.erp_apply(${dollar(JSON.stringify(ops))}::jsonb);`))
  }
  try {
    pg.psql(sql.join('\n'))
  } catch (e) {
    throw new Error('雲端伺服器拒絕了一筆正常操作：' + e.message.split('\n').slice(0, 3).join(' | '))
  }
}, 120000)
