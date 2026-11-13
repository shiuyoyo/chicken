// 測試用的暫時 PostgreSQL：模擬 Supabase 的 auth（auth.users、auth.uid()、auth.jwt()）與 anon / authenticated 角色。
// 沒有安裝 PostgreSQL 時，資料庫測試會自動略過。
import { execFileSync, spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const BIN = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/15/bin', '/usr/local/bin', '/usr/bin'].find((d) => fs.existsSync(path.join(d, 'initdb')))
export const hasPostgres = !!BIN && !!spawnSync('which', ['psql']).stdout?.length

const asRoot = process.getuid?.() === 0
const run = (cmd, args, opt = {}) =>
  asRoot ? execFileSync('runuser', ['-u', 'postgres', '--', cmd, ...args], opt) : execFileSync(cmd, args, opt)

export const AUTH_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt() ->> 'sub')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
`

export function startPostgres() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-pg-'))
  if (asRoot) execFileSync('chown', ['postgres', dir])
  const data = path.join(dir, 'data')
  run(path.join(BIN, 'initdb'), ['-D', data, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=C'], { stdio: 'pipe' })
  const port = String(20000 + Math.floor(Math.random() * 20000))
  run(path.join(BIN, 'pg_ctl'), ['-D', data, '-o', `-p ${port} -k ${dir} -c listen_addresses=''`, '-w', '-l', path.join(dir, 'log'), 'start'], { stdio: 'pipe' })
  const psql = (sql) => {
    const r = spawnSync('psql', ['-h', dir, '-p', port, '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', maxBuffer: 1 << 28 })
    if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim())
    return r.stdout.trim()
  }
  const stop = () => {
    try {
      run(path.join(BIN, 'pg_ctl'), ['-D', data, '-m', 'immediate', 'stop'], { stdio: 'pipe' })
    } catch {}
    fs.rmSync(dir, { recursive: true, force: true })
  }
  return { psql, stop }
}

// 以某個登入者身分執行（null = 沒登入的訪客）
export const dollar = (s) => `$j$${s}$j$`
export function asUser(uid, sql) {
  const claims = uid ? { sub: uid, role: 'authenticated' } : { role: 'anon' }
  return `begin; set local role ${uid ? 'authenticated' : 'anon'}; set local "request.jwt.claims" = '${JSON.stringify(claims)}';\n${sql}\ncommit;`
}
