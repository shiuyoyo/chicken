// 驗收測試用的「假 Supabase」：只實作網頁會用到的登入（GoTrue）與資料（PostgREST）API，
// 背後是真的 PostgreSQL，套用 supabase/schema.sql 的權限規則與觸發器，所以權限檢查跟正式環境一樣。
// 只給本機測試用：不驗證 JWT 簽章、註冊直接視為已驗證信箱。
const http = require('http')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { execFileSync, spawnSync } = require('child_process')

const BIN = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/15/bin'].find((d) => fs.existsSync(path.join(d, 'initdb')))
const asRoot = process.getuid?.() === 0
const runPg = (cmd, args) => (asRoot ? execFileSync('runuser', ['-u', 'postgres', '--', cmd, ...args], { stdio: 'pipe' }) : execFileSync(cmd, args, { stdio: 'pipe' }))

const AUTH_STUB = `
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text unique, password text, email_confirmed_at timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt() ->> 'sub')::uuid $$;
grant usage on schema auth to anon, authenticated; grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
`
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (claims) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.sig`
const claimsOf = (token) => {
  try {
    return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString())
  } catch {
    return null
  }
}
const dq = (s) => `$j$${s}$j$`

function start({ port, schemaFile, owners = [] }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-sb-'))
  if (asRoot) execFileSync('chown', ['postgres', dir])
  const data = path.join(dir, 'data')
  runPg(path.join(BIN, 'initdb'), ['-D', data, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=C'])
  const pgPort = String(30000 + Math.floor(Math.random() * 20000))
  runPg(path.join(BIN, 'pg_ctl'), ['-D', data, '-o', `-p ${pgPort} -k ${dir} -c listen_addresses=''`, '-w', '-l', path.join(dir, 'log'), 'start'])
  const psql = (sql) => {
    const r = spawnSync('psql', ['-h', dir, '-p', pgPort, '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 1 << 28 })
    if (r.status !== 0) {
      const err = new Error(((r.stderr || '').match(/ERROR:\s+(.*)/) || [])[1] || r.stderr)
      err.code = /row-level security|沒有權限|permission denied/.test(err.message) ? '42501' : 'P0001'
      throw err
    }
    return r.stdout.trim()
  }
  psql(AUTH_STUB)
  psql(fs.readFileSync(schemaFile, 'utf8'))
  for (const e of owners) psql(`insert into erp_private.owners values ('${e}');`)
  const as = (claims, sql) =>
    psql(`begin; set local role ${claims?.role === 'authenticated' ? 'authenticated' : 'anon'}; set local "request.jwt.claims" = '${JSON.stringify(claims || { role: 'anon' })}';\n${sql}\ncommit;`)

  const session = (u) => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const user = { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
    return { access_token: jwt({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp }), token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r-' + u.id, user }
  }
  const findUser = (email) => {
    const row = psql(`select row_to_json(u) from auth.users u where lower(email) = lower(${dq(email)});`)
    return row ? JSON.parse(row) : null
  }

  const server = http.createServer(async (req, res) => {
    const send = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' })
      res.end(body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body))
    }
    if (req.method === 'OPTIONS') return send(204)
    let raw = ''
    for await (const c of req) raw += c
    const body = raw ? JSON.parse(raw) : {}
    const url = new URL(req.url, 'http://x')
    const token = (req.headers.authorization || '').replace(/^Bearer /, '')
    const claims = claimsOf(token)
    const who = claims?.role === 'authenticated' ? claims : null
    try {
      // ---- 登入 ----
      if (url.pathname === '/auth/v1/signup') {
        if (findUser(body.email)) return send(422, { code: 'user_already_exists', msg: 'User already registered', message: 'User already registered' })
        const id = crypto.randomUUID()
        psql(`insert into auth.users values ('${id}', lower(${dq(body.email)}), ${dq(body.password)}, now());`)
        return send(200, session({ id, email: body.email.toLowerCase() }))
      }
      if (url.pathname === '/auth/v1/token') {
        const u = url.searchParams.get('grant_type') === 'refresh_token' ? { id: String(body.refresh_token).slice(2) } : findUser(body.email)
        if (u && url.searchParams.get('grant_type') === 'refresh_token') Object.assign(u, JSON.parse(psql(`select row_to_json(u) from auth.users u where id = '${u.id}';`)))
        if (!u || (url.searchParams.get('grant_type') === 'password' && u.password !== body.password)) return send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' })
        return send(200, session(u))
      }
      if (url.pathname === '/auth/v1/user') return who ? send(200, session({ id: who.sub, email: who.email }).user) : send(401, { msg: 'not authenticated' })
      if (url.pathname === '/auth/v1/logout') return send(204)
      if (url.pathname.startsWith('/functions/v1/')) return send(200, {})
      // ---- 資料 ----
      const m = url.pathname.match(/^\/rest\/v1\/(rpc\/)?([a-z_]+)$/)
      if (!m) return send(404, { message: 'not found' })
      if (m[1]) {
        const args = Object.entries(body).map(([k, v]) => `${k} => ${typeof v === 'boolean' ? v : typeof v === 'string' ? dq(v) + '::text' : dq(JSON.stringify(v)) + '::jsonb'}`)
        const out = as(who, `select public.${m[2]}(${args.join(', ')});`)
        return out ? send(200, out) : send(204)
      }
      const offset = Number(url.searchParams.get('offset') || 0)
      const limit = Number(url.searchParams.get('limit') || 1000)
      // PostgREST 的排序參數：order=created_at.asc.nullsfirst,id.asc
      const order = (url.searchParams.get('order') || 'id.asc').split(',').map((o) => {
        const [col, dir = 'asc', nulls] = o.split('.')
        if (!/^[a-z_]+$/.test(col)) throw new Error('bad order')
        return `${col} ${dir === 'desc' ? 'desc' : 'asc'}${nulls === 'nullsfirst' ? ' nulls first' : nulls === 'nullslast' ? ' nulls last' : ''}`
      })
      const out = as(who, `select coalesce(json_agg(x), '[]'::json) from (select * from public.${m[2]} order by ${order.join(', ')} offset ${offset} limit ${limit}) x;`)
      return send(200, out || '[]')
    } catch (e) {
      return send(400, { code: e.code, message: e.message, details: null, hint: null })
    }
  })
  server.listen(port)
  return {
    psql,
    stop: () => {
      server.close()
      try {
        runPg(path.join(BIN, 'pg_ctl'), ['-D', data, '-m', 'immediate', 'stop'])
      } catch {}
      fs.rmSync(dir, { recursive: true, force: true })
    },
  }
}

module.exports = { start }
