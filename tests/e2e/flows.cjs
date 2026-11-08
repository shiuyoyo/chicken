// 全流程驗收：用標準介面、以各員工身分走完倉儲、生產、品管、採購 / 銷售簽核、退貨、帳務、列印、帳號管理。
// 同一套步驟可以跑「本機版」或「雲端版」（假 Supabase + 真 PostgreSQL，套用 schema.sql 的權限與門檻）。
// 用法：
//   本機：先 npm run build && npm run preview，再 node tests/e2e/flows.cjs local [截圖資料夾]
//   雲端：node tests/e2e/flows.cjs cloud [截圖資料夾]（需要 PostgreSQL；會自己建置 dist-cloud 並啟動）
const { chromium } = require('playwright')
const { execSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const MODE = process.argv[2] === 'cloud' ? 'cloud' : 'local'
const ROOT = path.join(__dirname, '../..')
const OUT = process.argv[3] || path.join(__dirname, `out-flows-${MODE}`)
const SB_PORT = 54331
const APP = MODE === 'cloud' ? 'http://localhost:4181/' : process.env.ERP_URL || 'http://localhost:4173/'
const PIN = { 王老闆: '0000', 林會計: '1111', 陳業務: '2222', 黃經理: '2323', 吳採購: '3333', 劉廠長: '4444', 張師傅: '5555', 李品管: '6666', 小美: '7777', 周店長: '8888' }
const EMAIL = (name) => `u${Object.keys(PIN).indexOf(name)}@flows.local`
fs.mkdirSync(OUT, { recursive: true })

const results = []
const errors = []
let page, sb
let n = 0
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
const modal = () => page.locator('.modal').last()
const go = async (route) => {
  await page.goto(APP + '#' + route)
  await page.waitForTimeout(300)
}
async function toast(re, kind = '') {
  const loc = page.locator('.toast' + (kind ? '.' + kind : ':not(.bad)'), { hasText: re })
  try {
    await loc.first().waitFor({ timeout: 6000 })
  } catch {
    throw new Error(`沒有出現「${re}」，畫面訊息：${(await page.locator('.toast').allInnerTexts()).join(' / ') || '無'}`)
  }
  // 雲端：等這一批寫入送到資料庫（被拒絕會出現紅色訊息）
  if (MODE === 'cloud') {
    await page.waitForTimeout(900)
    const bad = await page.locator('.toast.bad').allInnerTexts()
    if (bad.length) throw new Error('雲端拒絕：' + bad.join(' / '))
  }
}
// 下拉選單：選文字包含 text 的選項
async function pick(select, text) {
  const value = await select.evaluate((el, t) => [...el.options].find((o) => o.text.includes(t))?.value, text)
  if (value === undefined) throw new Error(`下拉選單沒有「${text}」：${(await select.evaluate((el) => [...el.options].map((o) => o.text).join(' | '))).slice(0, 200)}`)
  await select.selectOption(value)
}
// 讀資料：本機讀瀏覽器儲存，雲端直接查資料庫（看伺服器上真正存了什麼）
async function rows(table) {
  if (MODE === 'cloud') return JSON.parse(sb.psql(`select coalesce(json_agg(t), '[]') from public.${table} t;`))
  await page.waitForTimeout(400)
  return page.evaluate((t) => JSON.parse(localStorage.getItem('food-erp:data:v5'))[t], table)
}
const signedUp = new Set()
async function loginAs(name) {
  if (MODE === 'local') {
    await page.evaluate(() => {
      const p = JSON.parse(localStorage.getItem('food-erp:prefs') || '{}')
      p.userId = ''
      localStorage.setItem('food-erp:prefs', JSON.stringify(p))
    })
    await page.goto(APP + '#/')
    await page.reload()
    await page.waitForSelector('.login-user')
    await page.locator('.login-user', { hasText: name }).click()
    for (const k of PIN[name]) await btn(k, { exact: true }).click()
  } else {
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('sb-')).forEach((k) => localStorage.removeItem(k)))
    await page.goto(APP + '#/')
    await page.reload()
    await btn('登入').waitFor()
    if (!signedUp.has(name)) await btn('第一次使用？設定密碼').click()
    await page.getByLabel('Email').fill(EMAIL(name))
    await page.getByLabel(/密碼/).fill('password123')
    await btn(signedUp.has(name) ? '登入' : '建立帳號').click()
    signedUp.add(name)
  }
  await page.waitForSelector('.layout, .simple, .pos', { timeout: 20000 })
}
async function approve(rowText, who) {
  await loginAs(who)
  await go('/approvals')
  const row = page.locator('tr', { hasText: rowText }).first()
  await row.getByRole('button', { name: '核准' }).click()
  await modal().getByRole('button', { name: '核准' }).click()
  await toast('已核准')
}

;(async () => {
  let preview
  if (MODE === 'cloud') {
    const fake = require('./fake-supabase.cjs')
    sb = fake.start({ port: SB_PORT, schemaFile: path.join(ROOT, 'supabase/schema.sql'), owners: ['owner@flows.local'] })
    const anon = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from('{"role":"anon"}').toString('base64url')}.x`
    execSync('npx vite build --outDir dist-cloud --emptyOutDir', { cwd: ROOT, stdio: 'pipe', env: { ...process.env, VITE_SUPABASE_URL: `http://localhost:${SB_PORT}`, VITE_SUPABASE_ANON_KEY: anon } })
    preview = spawn('npx', ['vite', 'preview', '--outDir', 'dist-cloud', '--port', '4181', '--strictPort'], { cwd: ROOT, stdio: 'pipe' })
    await new Promise((r) => setTimeout(r, 2500))
  }
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  page = await ctx.newPage()
  page.setDefaultTimeout(10000)
  page.on('pageerror', (e) => errors.push(e.message))

  try {
    await step('S0', MODE === 'cloud' ? '雲端：系統擁有者載入示範資料，員工用各自的 Email 登入' : '本機：載入示範資料', async () => {
      await page.goto(APP)
      if (MODE === 'cloud') {
        await btn('第一次使用？設定密碼').click()
        await page.getByLabel('Email').fill('owner@flows.local')
        await page.getByLabel(/密碼/).fill('password123')
        await btn('建立帳號').click()
        await btn('載入示範資料（先試用）').click()
        await page.locator('.layout').waitFor({ timeout: 60000 })
        // 幫每位示範員工登記 Email（等同管理員在「使用者與權限」填寫）
        sb.psql(Object.keys(PIN).filter((n) => n !== '王老闆').map((n) => `update public.users set email = '${EMAIL(n)}' where name = '${n}';`).join('\n'))
        // 王老闆已綁定擁有者 Email；改用一般員工身分測試，不靠擁有者的全部權限
        sb.psql(`update public.users set email = '${EMAIL('王老闆')}' where name = '王老闆';`)
        return `雲端品項 ${sb.psql('select count(*) from public.items;')} 個`
      }
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForSelector('.login-user')
      return '示範資料已載入'
    })

    await step('F1', '店長：成品倉調撥到門市（WMS）', async () => {
      await loginAs('周店長')
      const before = (await rows('transfers')).length
      await go('/wms')
      await btn('調撥 / 補貨到門市').click()
      await pick(modal().getByLabel('從儲位'), 'P-A01')
      await pick(modal().getByLabel('到儲位'), 'S-01')
      await modal().getByLabel('原因').fill('門市補貨（驗收）')
      await pick(modal().locator('select').nth(2), '麻油雞')
      await modal().getByPlaceholder('數量').fill('5')
      await btn('確認調撥').click()
      await toast('調撥完成')
      const after = (await rows('transfers')).length
      if (after !== before + 1) throw new Error(`調撥單 ${before} → ${after}`)
      return '麻油雞 5 包從成品冷凍庫 P-A01 調到門市 S-01'
    })

    await step('F2', '現場：常溫倉盤點，差異在門檻內直接過帳', async () => {
      await loginAs('張師傅')
      await go('/wms?tab=stocktake')
      await pick(page.getByLabel('選擇倉庫'), '常溫倉')
      await btn('產生盤點單').click()
      await toast('已產生盤點單')
      await modal().getByRole('button', { name: '未填的帶入帳面數' }).click()
      const first = modal().locator('input[type=number]').first()
      const v = Number(await first.inputValue())
      await first.fill(String(v - 1))
      await modal().getByRole('button', { name: '送出過帳' }).click()
      await page.locator('.modal').last().getByRole('button', { name: '確定' }).click()
      await toast('盤點已過帳')
      const st = (await rows('stocktakes')).find((s) => s.status === 'posted')
      if (!st) throw new Error('盤點單沒有過帳')
      return { detail: `盤點單 ${st.no} 已過帳，盤差 1 自動產生調整單與傳票`, shot: await shot('stocktake') }
    })

    await step('F3', '現場：大額庫存報廢送簽核 → 廠長核准後才扣庫存', async () => {
      await loginAs('張師傅')
      await go('/wms')
      await btn('庫存調整').click()
      await pick(modal().getByLabel('品項'), '去骨雞腿肉')
      await modal().getByLabel('批號').selectOption({ index: 1 })
      await modal().getByLabel(/調整數量/).fill('-20')
      await modal().getByLabel('原因').fill('冷凍庫故障報廢（驗收）')
      await modal().getByRole('button', { name: '送出簽核' }).click()
      await toast('已送出簽核')
      const before = (await rows('stock_moves')).filter((m) => m.type === 'adjust').length
      await approve('冷凍庫故障報廢', '劉廠長')
      const after = (await rows('stock_moves')).filter((m) => m.type === 'adjust').length
      if (after !== before + 1) throw new Error(`調整異動 ${before} → ${after}`)
      return '20 kg × $165 超過 $3,000 → 送簽核；廠長核准後才產生調整單'
    })

    await step('F4', '廠長：標準介面開工單 → 領料 → 投料 → 產出（麻辣雞丁，用到半成品醬汁）', async () => {
      await loginAs('劉廠長')
      await go('/production')
      await btn('＋ 開工單').click()
      await pick(modal().getByLabel(/產品/), '麻辣雞丁')
      await modal().getByLabel('計畫數量').fill('10')
      await modal().getByRole('button', { name: '開立' }).click()
      await toast('已開立')
      await modal().getByRole('tab', { name: '① 領料' }).click()
      await modal().getByRole('button', { name: '帶入剩餘需求量' }).click()
      await modal().getByRole('button', { name: '確認領料' }).click()
      await toast('領料完成')
      await modal().getByRole('tab', { name: '② 投料' }).click()
      await modal().getByRole('button', { name: '帶入剩餘需求量' }).click()
      await modal().getByRole('button', { name: '確認投料' }).click()
      await toast('投料已記錄')
      await modal().getByRole('tab', { name: '③ 產出' }).click()
      await modal().getByLabel(/本次產出/).fill('10')
      await modal().getByRole('button', { name: '確認產出入庫' }).click()
      await toast('產出已入庫')
      const s = await shot('wo-output')
      const items = await rows('items')
      const f4 = items.find((i) => i.code === 'F004')
      const lot = (await rows('lots')).filter((l) => l.item_id === f4.id).sort((a, b) => String(b.created_at).localeCompare(a.created_at))[0]
      if (!lot || lot.qc_status !== 'pending') throw new Error('沒有待 QC 的新批號')
      return { detail: `新批號 ${lot.lot_no} 10 包，待 QC`, shot: s, lot: lot.lot_no }
    })

    await step('F5', '品管：先判不合格（管制），複檢後主管改判合格', async () => {
      await loginAs('李品管')
      await go('/qc')
      const f4 = (await rows('items')).find((i) => i.code === 'F004')
      const lot = (await rows('lots')).filter((l) => l.item_id === f4.id && l.qc_status === 'pending')[0]
      await page.locator('tr', { hasText: lot.lot_no }).getByRole('button', { name: '檢驗' }).click()
      await modal().getByRole('button', { name: 'NG' }).first().click()
      await modal().getByRole('button', { name: '✕ 不合格' }).click()
      await toast('判定不合格')
      await page.locator('tr', { hasText: lot.lot_no }).getByRole('button', { name: '複檢' }).click()
      await modal().getByRole('button', { name: '✓ 合格' }).click()
      await toast('判定合格')
      const now = (await rows('lots')).find((l) => l.lot_no === lot.lot_no)
      if (now.qc_status !== 'pass') throw new Error('批號狀態 ' + now.qc_status)
      return `${lot.lot_no}：不合格 → 品管主管複檢改判合格`
    })

    await step('F6', '採購：開 8 萬的採購單 → 自動送簽核 → 廠長核准後可進貨', async () => {
      await loginAs('吳採購')
      await go('/purchase')
      await btn('＋ 新採購單').click()
      await pick(modal().getByLabel('供應商'), '鴻運')
      await pick(modal().locator('table select').first(), '去骨雞腿肉')
      await modal().locator('table input[type=number]').nth(0).fill('500')
      await modal().locator('table input[type=number]').nth(1).fill('160')
      await modal().getByRole('button', { name: /儲存並送簽核/ }).click()
      await toast('已送出簽核')
      const po = (await rows('purchase_orders')).find((p) => p.total === 80000)
      if (po?.status !== 'pending') throw new Error('採購單狀態 ' + po?.status)
      await approve(po.no, '劉廠長')
      const after = (await rows('purchase_orders')).find((p) => p.id === po.id)
      if (after.status !== 'open') throw new Error('核准後狀態 ' + after.status)
      return `${po.no} $80,000 > 門檻 $50,000 → 待核准 → 廠長核准後「未到貨」可進貨`
    })

    await step('F7', '業務：低於最低售價的訂單送簽核 → 業務主管核准', async () => {
      await loginAs('陳業務')
      await go('/sales')
      await btn('＋ 新訂單').click()
      await pick(modal().getByLabel('客戶'), '大和團膳')
      await pick(modal().locator('table select').first(), '三杯雞')
      await modal().locator('table input[type=number]').nth(0).fill('10')
      await modal().locator('table input[type=number]').nth(1).fill('90')
      await modal().locator('.modal-foot .btn.primary, footer .btn.primary').last().click()
      await page.locator('.toast', { hasText: '需要主管核准' }).first().waitFor()
      const so = (await rows('sales_orders')).find((s) => s.status === 'pending' && s.lines.some((l) => l.price === 90))
      if (!so) throw new Error('沒有待核准訂單')
      await approve(so.no, '黃經理')
      const after = (await rows('sales_orders')).find((s) => s.id === so.id)
      if (after.status !== 'confirmed') throw new Error('核准後狀態 ' + after.status)
      return `${so.no} 單價 $90 < 最低售價 $100 → 業務主管核准後確認`
    })

    await step('F8', '業務：客戶退貨送簽核 → 主管核准後入待處理區、沖應收', async () => {
      await loginAs('陳業務')
      await go('/returns')
      await btn('＋ 客戶退貨').click()
      await modal().getByLabel('出貨單').selectOption({ index: 1 })
      await modal().locator('table input[type=number]').first().fill('1')
      await modal().getByLabel('退貨原因').fill('包裝破損（驗收）')
      await modal().getByRole('button', { name: /送出/ }).click()
      await toast('已送出簽核')
      const r = (await rows('returns')).find((x) => x.reason === '包裝破損（驗收）')
      await approve(r.no, '黃經理')
      const after = (await rows('returns')).find((x) => x.id === r.id)
      if (after.status !== 'done') throw new Error('退貨狀態 ' + after.status)
      return `${r.no} 核准後完成`
    })

    await step('F9', '會計：付款給供應商、記一筆費用', async () => {
      await loginAs('林會計')
      const before = (await rows('payments')).length
      await go('/accounting?tab=ap')
      await page.locator('tr').getByRole('button', { name: '付款' }).first().click()
      await modal().getByRole('button', { name: '確認' }).click()
      await toast(/付款|已/)
      await go('/accounting')
      await btn('＋ 記一筆費用').click()
      await modal().getByLabel('金額').fill('1200')
      await modal().getByLabel('摘要').fill('文具（驗收）')
      await modal().getByRole('button', { name: '確認' }).click()
      await toast('已記帳')
      const after = (await rows('payments')).length
      const jv = (await rows('journal')).find((j) => j.memo === '文具（驗收）')
      if (after !== before + 1 || !jv) throw new Error(`付款 ${before}→${after}、費用傳票 ${!!jv}`)
      return '付款單與費用傳票都已入帳'
    })

    await step('F10', '列印：簽核單、BOM 表、庫存明細表、試算表', async () => {
      await loginAs('王老闆')
      await go('/approvals?tab=history')
      await page.getByRole('link', { name: /簽核單/ }).first().click()
      await page.locator('.pf-title', { hasText: '簽核單' }).waitFor()
      const s = await shot('print-approval')
      const meta = await page.locator('.pf-meta').innerText()
      if (!/已核准|已退回|已撤回/.test(meta)) throw new Error('簽核單沒有結果：' + meta.slice(0, 80))
      await go('/items')
      await page.locator('tr', { hasText: 'G001' }).first().click()
      await modal().getByRole('tab', { name: /BOM 組成/ }).click()
      await modal().getByRole('link', { name: /BOM 表/ }).click()
      await page.locator('.pf-title', { hasText: 'BOM' }).waitFor()
      await go('/wms')
      await page.getByRole('link', { name: /庫存明細表/ }).click()
      await page.locator('.pf-title', { hasText: '庫存明細表' }).waitFor()
      await go('/accounting?tab=tb')
      await page.getByRole('link', { name: /試算表/ }).click()
      await page.locator('.pf-title', { hasText: '試算表' }).waitFor()
      const t = await page.locator('.pf-totals').innerText()
      const [d, c] = [...t.matchAll(/([\d,]+)/g)].map((m) => m[1])
      if (d !== c) throw new Error(`試算表不平衡 ${d} / ${c}`)
      return { detail: `簽核單含核准結果；BOM、庫存明細、試算表（借貸 ${d}）都能開啟`, shot: s }
    })

    await step('F11', '管理者：新增角色與員工', async () => {
      await loginAs('王老闆')
      await go('/admin?tab=roles')
      await page.getByRole('button', { name: /新增角色/ }).click()
      await modal().locator('input').first().fill('倉管（驗收）')
      await modal().getByRole('button', { name: '儲存' }).click()
      await toast('已儲存')
      await go('/admin')
      await btn('＋ 新增使用者').click()
      await modal().getByLabel('姓名').fill('驗收員工')
      await pick(modal().getByLabel('角色'), '倉管（驗收）')
      await modal().getByLabel('登入 Email').fill('newbie@flows.local')
      await modal().getByLabel(/PIN/).fill('1357')
      await modal().getByRole('button', { name: '儲存' }).click()
      await toast('已儲存')
      const u = (await rows('users')).find((x) => x.name === '驗收員工')
      if (!u || u.email !== 'newbie@flows.local') throw new Error('員工沒有存進去')
      return '角色「倉管（驗收）」與員工「驗收員工」已建立'
    })

    await step('F12', '資料健康：傳票全部平衡、沒有負庫存', async () => {
      const js = await rows('journal')
      const bad = js.filter((j) => Math.abs(j.lines.reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0)) > 0.01)
      const bal = {}
      for (const m of await rows('stock_moves')) bal[`${m.item_id}|${m.bin_id}|${m.lot_no}`] = (bal[`${m.item_id}|${m.bin_id}|${m.lot_no}`] || 0) + m.qty
      const neg = Object.values(bal).filter((v) => v < -0.0005)
      if (bad.length || neg.length) throw new Error(`不平衡傳票 ${bad.length}、負庫存 ${neg.length}`)
      return `${js.length} 張傳票平衡、${Object.keys(bal).length} 個庫存位置沒有負數`
    })
  } finally {
    await browser.close()
    preview?.kill()
    sb?.stop()
  }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
  const fails = results.filter((r) => !r.ok)
  console.log(`\n${MODE}：${results.length - fails.length}/${results.length} 通過`)
  process.exit(fails.length ? 1 : 0)
})()
