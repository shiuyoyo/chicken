// 雲端版驗收：Email 登入、第一次設定、員工開通、依權限讀寫（背後是套用 schema.sql 的真 PostgreSQL）。
// 用法：node tests/e2e/cloud.cjs [截圖資料夾]（需要 PostgreSQL；會自己建置 dist-cloud 並啟動預覽）
const { chromium } = require('playwright')
const { execSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const fake = require('./fake-supabase.cjs')

const ROOT = path.join(__dirname, '../..')
const OUT = process.argv[2] || path.join(__dirname, 'out-cloud')
const SB_PORT = 54329
const APP_PORT = 4179
const APP = `http://localhost:${APP_PORT}/`
fs.mkdirSync(OUT, { recursive: true })

const results = []
let page
let n = 0
const errors = []
const shot = async (name) => {
  const f = `${String(++n).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: path.join(OUT, f) })
  return f
}
async function step(id, title, fn) {
  const before = errors.length
  try {
    const d = await fn()
    if (errors.length > before) throw new Error('頁面錯誤：' + errors.slice(before).join(' | '))
    results.push({ id, title, ok: true, detail: d?.detail || d || '', shot: d?.shot })
    console.log(`✅ ${id} ${title}${d ? '：' + (d.detail || d) : ''}`)
  } catch (e) {
    const s = await shot('FAIL-' + id).catch(() => null)
    results.push({ id, title, ok: false, detail: e.message.split('\n')[0], shot: s })
    console.log(`❌ ${id} ${title}：${e.message.split('\n')[0]}`)
  }
}
const btn = (name, o = {}) => page.getByRole('button', { name, ...o })
async function signUp(email, pw = 'password123') {
  await page.goto(APP)
  await btn('第一次使用？設定密碼').click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel(/設定密碼/).fill(pw)
  await btn('建立帳號').click()
}
async function signOut() {
  await page.getByRole('button', { name: '登出' }).first().click()
  await page.getByRole('button', { name: '登入' }).waitFor()
}

;(async () => {
  const sb = fake.start({ port: SB_PORT, schemaFile: path.join(ROOT, 'supabase/schema.sql'), owners: ['owner@test.local'] })
  const anon = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from('{"role":"anon"}').toString('base64url')}.x`
  execSync('npx vite build --outDir dist-cloud --emptyOutDir', { cwd: ROOT, stdio: 'pipe', env: { ...process.env, VITE_SUPABASE_URL: `http://localhost:${SB_PORT}`, VITE_SUPABASE_ANON_KEY: anon } })
  const preview = spawn('npx', ['vite', 'preview', '--outDir', 'dist-cloud', '--port', String(APP_PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' })
  await new Promise((r) => setTimeout(r, 2500))
  const db = (sql) => sb.psql(sql)
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  page = await ctx.newPage()
  page.setDefaultTimeout(15000)
  page.on('pageerror', (e) => errors.push(e.message))

  try {
    await step('C1', '沒登入看不到任何資料，只有登入畫面', async () => {
      await page.goto(APP)
      await btn('登入').waitFor()
      const r = await page.evaluate(async ([u, k]) => {
        const x = await fetch(u + '/rest/v1/items?select=*', { headers: { apikey: k, authorization: 'Bearer ' + k } })
        return { status: x.status, body: await x.json() }
      }, [`http://localhost:${SB_PORT}`, anon])
      if (r.status < 400 && r.body.length !== 0) throw new Error('匿名讀到 ' + r.body.length + ' 筆')
      return { detail: `只用網址和公開金鑰直接查資料庫：${r.status >= 400 ? '被拒絕（' + r.body.message + '）' : '0 筆'}`, shot: await shot('cloud-login') }
    })

    await step('C2', '系統擁有者第一次登入：載入示範資料到雲端，王老闆綁定擁有者 Email', async () => {
      await signUp('owner@test.local')
      await page.getByText('雲端資料庫目前是空的').waitFor()
      const s = await shot('cloud-setup')
      await btn('載入示範資料（先試用）').click()
      await page.locator('.layout').waitFor({ timeout: 60000 })
      const items = db('select count(*) from public.items;')
      const boss = db("select name from public.users where email = 'owner@test.local';")
      if (items !== '20' || boss !== '王老闆') throw new Error(`雲端品項 ${items}、擁有者對應 ${boss}`)
      return { detail: `雲端資料庫有 ${items} 個品項、${db('select count(*) from public.journal;')} 張傳票；登入者是王老闆`, shot: s }
    })

    await step('C3', '重新整理後仍是登入狀態，資料從雲端讀回', async () => {
      await page.reload()
      await page.locator('.layout').waitFor()
      const t = await page.locator('.layout').innerText()
      if (!t.includes('王老闆')) throw new Error('沒有顯示登入者')
      return '自動登入王老闆，資料由雲端載入'
    })

    await step('C4', '管理員幫員工小美填上 Email（開通）', async () => {
      await page.goto(APP + '#/admin')
      await page.locator('tr', { hasText: '小美' }).first().click()
      await page.locator('.modal').getByPlaceholder('name@company.com').fill('Mei@Test.local')
      await page.locator('.modal').getByRole('button', { name: '儲存' }).click()
      await page.locator('.toast', { hasText: '已儲存' }).waitFor()
      await page.waitForTimeout(800)
      const e = db("select email from public.users where name = '小美';")
      if (e !== 'mei@test.local') throw new Error('雲端 email = ' + e)
      await signOut()
      return 'Email 存成小寫 mei@test.local'
    })

    await step('C5', '還沒開通的 Email 可以註冊，但看不到資料', async () => {
      await signUp('stranger@test.local')
      await page.getByText('還沒有開通').waitFor()
      const s = await shot('cloud-pending')
      await btn('登出').click()
      await btn('登入').waitFor()
      return { detail: 'stranger@test.local 顯示「還沒有開通」', shot: s }
    })

    await step('C6', '小美用 Email 登入，在收銀台結帳寫進雲端', async () => {
      await signUp('mei@test.local')
      await page.locator('.layout, .pos').first().waitFor()
      await page.goto(APP + '#/pos')
      const before = db('select count(*) from public.pos_sales;')
      await page.locator('.pos-tile', { hasText: '麻油雞調理包' }).click()
      await page.locator('.pos-cart-toggle').click()
      await page.locator('.pos-cart input[aria-label="收現金額"]').fill('500')
      await page.locator('.pos-cart').getByRole('button', { name: /結帳/ }).click()
      await page.getByText('交易完成').waitFor()
      await page.waitForTimeout(1200)
      const after = db('select count(*) from public.pos_sales;')
      if (Number(after) !== Number(before) + 1) throw new Error(`雲端交易數 ${before} → ${after}`)
      const s = await shot('cloud-pos')
      await btn('下一位客人').click()
      return { detail: `門市交易 ${before} → ${after} 筆，存貨與傳票由伺服器檢查後寫入`, shot: s }
    })

    await step('C7', '小美繞過畫面直接呼叫資料庫：開採購單、改自己權限都被拒絕', async () => {
      const r = await page.evaluate(async (u) => {
        const tok = JSON.parse(localStorage.getItem('sb-localhost-auth-token')).access_token
        const call = (ops) => fetch(u + '/rest/v1/rpc/erp_apply', { method: 'POST', headers: { 'content-type': 'application/json', apikey: 'x', authorization: 'Bearer ' + tok }, body: JSON.stringify({ ops }) }).then(async (x) => ({ status: x.status, body: await x.text() }))
        const po = await call([{ t: 'purchase_orders', op: 'insert', row: { id: 'hackpo', no: 'PO-HACK', status: 'open', lines: [] } }])
        const me = await call([{ t: 'roles', op: 'update', row: { id: 'x', name: 'x', perms: {} } }])
        return { po, me }
      }, `http://localhost:${SB_PORT}`)
      if (r.po.status < 400 || r.me.status < 400) throw new Error(JSON.stringify(r))
      if (db("select count(*) from public.purchase_orders where id = 'hackpo';") !== '0') throw new Error('採購單被寫入了')
      return `採購單：${JSON.parse(r.po.body).message.slice(0, 60)}；改權限：${JSON.parse(r.me.body).message.slice(0, 40)}`
    })

    await step('C8', '傳票、庫存異動在雲端仍然平衡、沒有負庫存', async () => {
      const unbalanced = db("select count(*) from public.journal j where (select sum((l->>'debit')::numeric) - sum((l->>'credit')::numeric) from jsonb_array_elements(j.lines) l) <> 0;")
      const negative = db('select count(*) from (select item_id, bin_id, lot_no, sum(qty) q from public.stock_moves group by 1,2,3 having sum(qty) < -0.0005) x;')
      if (unbalanced !== '0' || negative !== '0') throw new Error(`不平衡 ${unbalanced}、負庫存 ${negative}`)
      return '全部傳票借貸平衡、沒有負庫存'
    })
  } finally {
    await browser.close()
    preview.kill()
    sb.stop()
  }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
  const fails = results.filter((r) => !r.ok)
  console.log(`\n${results.length - fails.length}/${results.length} 通過`)
  process.exit(fails.length ? 1 : 0)
})()
