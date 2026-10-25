// 驗收測試：用真的瀏覽器、以不同員工身分操作介面，走完一張訂單的完整流程。
// 用法：先 `npm run build && npm run preview`，再 `node tests/e2e/acceptance.cjs [截圖資料夾]`
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const BASE = process.env.ERP_URL || 'http://localhost:4173/'
const OUT = process.argv[2] || path.join(__dirname, 'out')
fs.mkdirSync(OUT, { recursive: true })

const results = []
let page
let shotN = 0
const errors = []

async function shot(name) {
  const file = `${String(++shotN).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: path.join(OUT, file) })
  return file
}
async function step(id, title, fn) {
  const t0 = Date.now()
  const before = errors.length
  try {
    const detail = await fn()
    if (errors.length > before) throw new Error('頁面錯誤：' + errors.slice(before).join(' | '))
    results.push({ id, title, ok: true, detail: detail?.detail || detail || '', shot: detail?.shot, ms: Date.now() - t0 })
    console.log(`✅ ${id} ${title}${detail?.detail || typeof detail === 'string' ? '：' + (detail?.detail || detail) : ''}`)
  } catch (e) {
    const s = await shot('FAIL-' + id).catch(() => null)
    results.push({ id, title, ok: false, detail: e.message.split('\n')[0], shot: s, ms: Date.now() - t0 })
    console.log(`❌ ${id} ${title}：${e.message.split('\n')[0]}`)
  }
}
const go = async (route) => {
  await page.goto(BASE + '#' + route)
  await page.waitForTimeout(250)
}
async function loginAs(name, pin) {
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('food-erp:prefs') || '{}')
    p.userId = ''
    localStorage.setItem('food-erp:prefs', JSON.stringify(p))
  })
  await page.goto(BASE + '#/')
  await page.reload()
  await page.waitForSelector('.login-user')
  await page.locator('.login-user', { hasText: name }).click()
  for (const k of pin) await page.getByRole('button', { name: k, exact: true }).click()
  await page.waitForSelector('.layout, .simple, .pos')
}
// 等待提示訊息；kind = 'bad' 代表預期是錯誤訊息
async function toast(re, kind = '') {
  const loc = page.locator('.toast' + (kind ? '.' + kind : ':not(.bad)'), { hasText: re })
  try {
    await loc.first().waitFor({ timeout: 4000 })
  } catch {
    const all = await page.locator('.toast').allInnerTexts()
    throw new Error(`沒有出現「${re}」，畫面訊息：${all.join(' / ') || '無'}`)
  }
  return (await loc.first().innerText()).trim()
}
async function noBadToast() {
  await page.waitForTimeout(200)
  const bad = await page.locator('.toast.bad').allInnerTexts()
  if (bad.length) throw new Error('出現錯誤訊息：' + bad.join(' / '))
}
// 本機儲存會延遲約 150ms 合併寫入，讀之前稍等
const db = async () => {
  await page.waitForTimeout(400)
  return page.evaluate(() => JSON.parse(localStorage.getItem('food-erp:data:v4')))
}
const btn = (name, opt = {}) => page.getByRole('button', { name, ...opt })
const modal = () => page.locator('.modal').last()

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  page = await ctx.newPage()
  page.setDefaultTimeout(8000)
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)))
  await page.goto(BASE)
  await page.waitForSelector('.login-user', { timeout: 15000 })
  let soId, sanbeiLot

  await step('A1', '登入畫面列出員工、PIN 錯誤會被拒絕', async () => {
    await page.locator('.login-user', { hasText: '陳業務' }).click()
    for (const k of '9999') await btn(k, { exact: true }).click()
    await toast('PIN 碼錯誤', 'bad')
    await btn('← 換人').click()
    return { detail: '輸入錯誤 PIN 顯示「PIN 碼錯誤」', shot: await shot('login') }
  })

  await step('B1', '業務：報價單轉成銷售訂單（CRM → 銷售）', async () => {
    await loginAs('陳業務', '2222')
    await go('/quotes')
    await page.locator('tr.click', { hasText: '山海餐酒館' }).click()
    await modal().getByRole('button', { name: '轉成訂單' }).click()
    await toast('已轉成銷售訂單')
    const d = await db()
    const so = d.sales_orders.find((s) => s.quotation_id)
    soId = so.id
    if (so.status !== 'confirmed') throw new Error('訂單狀態 ' + so.status)
    return { detail: `${so.no} 已確認，三杯雞 200 + 麻油雞 200`, shot: await shot('quote-to-order') }
  })

  await step('B2', '業務：門市人員權限不足不能下單（權限控管）', async () => {
    await loginAs('小美', '7777')
    await go('/sales')
    await page.getByText('你沒有「銷售」的權限').waitFor()
    const nav = await page.locator('.nav a').allInnerTexts()
    if (nav.some((t) => t.includes('會計'))) throw new Error('門市人員看得到會計選單')
    return { detail: `小美只看得到：${nav.map((t) => t.replace(/[^\p{Script=Han}A-Za-z ]/gu, '').trim()).join('、')}`, shot: await shot('no-access') }
  })

  await step('C1', '廠長：依訂單算缺料、產生採購單、開工單（銷售 → 採購 / 生產）', async () => {
    await loginAs('劉廠長', '4444')
    await go('/sales?open=' + soId)
    const m = modal()
    const card = m.locator('.card', { hasText: '原料需求' })
    await card.locator('table').waitFor()
    const short = await card.innerText()
    if (!short.includes('老薑') || !short.includes('黑麻油')) throw new Error('缺料清單不正確：' + short)
    await m.getByRole('button', { name: '產生採購單' }).click()
    await toast('已產生 1 張採購單')
    await m.getByRole('button', { name: '依訂單開工單' }).click()
    await toast('已開立 2 張工單')
    const s = await shot('order-actions')
    return { detail: '缺老薑（過期的不算可用）與黑麻油 → 產生採購單；開立 2 張工單', shot: s }
  })

  await step('D1', '現場（大按鈕）：進貨點收，直接輸入數量', async () => {
    await loginAs('張師傅', '5555')
    await go('/simple')
    await btn('⌨️ 直接輸入').click()
    await go('/simple/receive')
    await page.locator('.pick', { hasText: '黑麻油' }).click()
    // 依每一列提示的「還差 X」輸入實收數量
    const counters = page.locator('.counter')
    const n = await counters.count()
    for (let i = 0; i < n; i++) {
      const hint = await counters.nth(i).locator('.hint').first().innerText()
      await counters.nth(i).locator('.big-input').fill(hint.match(/還差 ([\d.]+)/)[1])
    }
    const s = await shot('simple-receive')
    await btn('✓ 確認進貨').click()
    await page.locator('.done-screen').waitFor()
    const txt = await page.locator('.done-screen').innerText()
    if (!/批號 R/.test(txt)) throw new Error('沒有建立原料批號')
    return { detail: txt.split('\n').filter(Boolean).slice(1, 4).join('｜'), shot: s }
  })

  for (const [prod, code] of [['三杯雞調理包', 'F001'], ['麻油雞調理包', 'F002']]) {
    await step('D2-' + code, `現場（大按鈕）：${prod} 領料 → 投料 → 產出`, async () => {
      await go('/simple')
      await go('/simple/material')
      await page.locator('.pick', { hasText: `${prod}　200` }).first().click()
      await btn('帶入還需要的量').click()
      await btn('✓ 確認領料').click()
      await page.locator('.done-screen').waitFor()
      await btn('再做一筆').click()
      await btn('🥘 投料下鍋').click()
      await btn('帶入還需要的量').click()
      const s = await shot('simple-feed-' + code)
      await btn('✓ 確認投料').click()
      await page.locator('.done-screen').waitFor()
      await go('/simple')
      await go('/simple/output')
      await page.locator('.pick', { hasText: `${prod}　200` }).first().click()
      await page.locator('.big-input').first().fill('200')
      await btn('✓ 確認產出').click()
      await page.locator('.done-screen').waitFor()
      const txt = await page.locator('.done-screen').innerText()
      const lot = txt.match(/L\d{8}-\d{3}(-\d+)?/)?.[0]
      if (code === 'F001') sanbeiLot = lot
      return { detail: `產出 200 包，批號 ${lot}，進成品冷凍庫待 QC`, shot: s }
    })
  }

  await step('E1', '出貨前 QC 未過：系統擋下出貨', async () => {
    await go('/simple')
    await go('/simple/ship')
    await page.locator('.pick', { hasText: '山海餐酒館' }).click()
    await page.locator('.big-input').first().fill('200')
    await btn(/確認出貨/).click()
    const t = await toast('QC', 'bad')
    return { detail: t }
  })

  await step('E2', '品管（大按鈕）：抽檢判定合格', async () => {
    await loginAs('李品管', '6666')
    await go('/simple/qc')
    for (let i = 0; i < 2; i++) {
      await go('/simple')
      await go('/simple/qc')
      await page.locator('.pick', { hasText: '200 包' }).first().click()
      if (i === 0) await shot('simple-qc')
      await btn('✓ 全部合格').click()
      await page.locator('.done-screen').waitFor()
    }
    const d = await db()
    const passed = d.lots.filter((l) => l.qty === 200 && l.qc_status === 'pass' && l.kind === 'product').length
    if (passed !== 2) throw new Error('合格批號數 ' + passed)
    return '兩個成品批號判定合格'
  })

  await step('F1', '現場（大按鈕）：出貨 200+200 包、系統算箱數、顯示揀貨儲位', async () => {
    await loginAs('張師傅', '5555')
    await go('/simple/ship')
    await page.locator('.pick', { hasText: '山海餐酒館' }).click()
    const inputs = page.locator('.big-input')
    await inputs.nth(0).fill('200')
    await inputs.nth(1).fill('200')
    await page.getByText('去哪裡拿').waitFor()
    await btn('冷凍貨櫃').click()
    const s = await shot('simple-ship')
    const label = await btn(/確認出貨/).innerText()
    if (!label.includes('20 箱')) throw new Error('箱數不是 20：' + label)
    await btn(/確認出貨/).click()
    await page.locator('.done-screen').waitFor()
    return { detail: '400 包 = 20 箱（每箱 20 包），冷凍貨櫃，依先到期先出揀貨', shot: s }
  })

  await step('G1', '會計：開立發票與應收、登記收款（出貨 → 會計）', async () => {
    await loginAs('林會計', '1111')
    await go('/shipping')
    await page.locator('tr.click', { hasText: '山海餐酒館' }).click()
    await modal().getByRole('button', { name: '開立發票 / 應收' }).click()
    await toast('已開立發票')
    await page.keyboard.press('Escape')
    await go('/accounting?tab=ar')
    await page.locator('tr', { hasText: '山海餐酒館' }).getByRole('button', { name: '收款' }).click()
    await modal().getByRole('button', { name: '確認' }).click()
    await toast('已登記')
    const d = await db()
    const inv = d.invoices.find((i) => i.sales_order_id === soId)
    if (inv.paid !== inv.total) throw new Error('未收齊')
    return { detail: `發票 ${inv.gui_no}，含稅 $${inv.total.toLocaleString()} 已收齊`, shot: await shot('accounting-ar') }
  })

  await step('G2', '訂單進度：8 個階段全部完成、歷程含批號', async () => {
    await go('/progress/' + soId)
    await page.getByText('已完成').first().waitFor()
    const s = await shot('progress-done')
    const steps = await page.locator('.step.done').count()
    if (steps !== 8) throw new Error(`完成階段 ${steps}/8`)
    return { detail: '接單→原料進貨→領料→投料→產出→QC→出貨→收款 全部完成', shot: s }
  })

  await step('H1', '簽核：業務主管核准超過信用額度的訂單', async () => {
    await loginAs('黃經理', '2323')
    await go('/approvals')
    const row = page.locator('tr', { hasText: '小吃便當店' })
    await row.getByRole('button', { name: '核准' }).click()
    await modal().getByRole('button', { name: '核准' }).click()
    await toast('已核准')
    return { detail: '小吃便當店 SO 超過信用額度 2 萬 → 核准後變「已確認」', shot: await shot('approvals') }
  })

  await step('H2', '簽核：申請人不能核准自己的申請', async () => {
    await loginAs('吳採購', '3333')
    await go('/approvals?tab=sent')
    await page.getByText('等待採購 主管'.replace(' ', '')).first().waitFor()
    const n = await btn('核准', { exact: true }).count()
    if (n) throw new Error('申請人看到核准按鈕')
    return '吳採購只看得到自己送出的採購單「等待主管」，沒有核准按鈕'
  })

  await step('H3', '簽核：廠長核准大額採購與庫存報廢', async () => {
    await loginAs('劉廠長', '4444')
    await go('/approvals')
    for (const t of ['鴻運禽肉行', '去骨雞腿肉']) {
      await page.locator('tr', { hasText: t }).getByRole('button', { name: '核准' }).click()
      await modal().getByRole('button', { name: '核准' }).click()
      await toast('已核准')
      await page.waitForTimeout(300)
    }
    return '採購單 $64,000 與 24 kg 雞腿肉報廢都已生效'
  })

  await step('I1', '門市 POS：店長核准作廢、收銀員結帳（會員、找零）', async () => {
    await loginAs('周店長', '8888')
    await go('/approvals')
    await page.locator('tr', { hasText: 'POS' }).getByRole('button', { name: '核准' }).click()
    await modal().getByRole('button', { name: '核准' }).click()
    await toast('已核准')
    await loginAs('小美', '7777')
    await go('/pos')
    await page.locator('.pos-tile', { hasText: '麻油雞調理包' }).click()
    await page.locator('.pos-tile', { hasText: '麻油雞調理包' }).click()
    await page.locator('.pos-cart-toggle').click()
    await btn('輸入手機').click()
    await modal().locator('textarea').fill('0988-123-456')
    await modal().getByRole('button', { name: '確定' }).click()
    await page.locator('.pos-cart').getByText('王小姐').waitFor()
    await page.locator('.pos-cart input[aria-label="收現金額"]').fill('500')
    const s = await shot('pos-cart')
    await page.locator('.pos-cart').getByRole('button', { name: /結帳/ }).click()
    await page.getByText('交易完成').waitFor()
    const r = await modal().innerText()
    if (!r.includes('$162')) throw new Error('找零不正確：' + r)
    await shot('pos-receipt')
    await btn('下一位客人').click()
    return { detail: '2 包麻油雞 $338，收 $500 找 $162，會員王小姐累積 3 點，開立電子發票', shot: s }
  })

  await step('I2', '門市 POS：日結對帳', async () => {
    await btn('日結').click()
    const expected = await modal().locator('dd b').innerText()
    await modal().locator('input').fill(expected.replace(/[$,]/g, ''))
    await modal().getByText('現金相符').waitFor()
    await modal().getByRole('button', { name: '確認日結' }).click()
    await toast('日結完成')
    return `應有現金 ${expected}，點收相符`
  })

  await step('J1', '食品追溯：新成品批號往上追到原料與供應商、往下追到客戶（召回名單）', async () => {
    await loginAs('李品管', '6666')
    await go('/trace?lot=' + sanbeiLot)
    await page.locator('.recall').getByText('山海餐酒館').waitFor()
    const up = await page.locator('.trace-flow .card').first().innerText()
    if (!up.includes('鴻運禽肉行')) throw new Error('上游沒有雞肉供應商')
    return { detail: `${sanbeiLot} ← 去骨雞腿肉（鴻運禽肉行 HY-…）→ 山海餐酒館`, shot: await shot('trace') }
  })

  await step('K1', '會計：月結關帳後，不能再補登關帳期間的費用', async () => {
    await loginAs('林會計', '1111')
    await go('/accounting?tab=close')
    const until = await page.evaluate(() => {
      const d = new Date()
      d.setDate(d.getDate() - 2)
      return d.toISOString().slice(0, 10)
    })
    await page.locator('input[type=date]').first().fill(until)
    await btn('執行關帳').click()
    await modal().getByRole('button', { name: '確定' }).click()
    await toast('已關帳')
    await go('/accounting')
    await btn('＋ 記一筆費用').click()
    const m = modal()
    await m.locator('input[type=number]').fill('500')
    await m.locator('input[type=date]').fill(until)
    await m.locator('input').last().fill('補登測試')
    await m.getByRole('button', { name: '確認' }).click()
    const t = await toast('已關帳', 'bad')
    return { detail: `關帳至 ${until}；補登被拒：「${t}」` }
  })

  await step('L1', '開發者：資料健康檢查（借貸平衡、無負庫存、所有關聯完整）', async () => {
    await loginAs('王老闆', '0000')
    await go('/dev?tab=check')
    await page.getByText('一切正常').first().waitFor()
    const info = await page.locator('.card-pad.small.muted').first().innerText()
    return { detail: info, shot: await shot('health') }
  })

  await step('L2', '經營報表：銷售毛利含批發與門市', async () => {
    await go('/reports')
    await page.getByText('門市通路').waitFor()
    await page.getByText('批發通路').waitFor()
    return { shot: await shot('reports'), detail: '依產品、客戶、通路、月份的銷售額與毛利' }
  })

  await step('M1', 'LINE：新員工加入官方帳號，自己選職位、輸入姓名', async () => {
    await go('/notify?tab=sim')
    await btn('＋ LINE 新員工').click()
    await modal().locator('textarea').fill('小陳')
    await modal().getByRole('button', { name: '確定' }).click()
    const phone = page.locator('.phone')
    await phone.getByText('請選擇你在公司的職位').waitFor()
    await phone.locator('.chat-quick').getByRole('button', { name: '現場人員' }).click()
    await phone.getByText('請輸入你的姓名').waitFor()
    await page.locator('#sim-text').fill('陳小明')
    await phone.getByRole('button', { name: '送出' }).click()
    await phone.getByText('已送出申請').waitFor()
    return { detail: '加好友 → 按「現場人員」→ 輸入「陳小明」→ 送出申請，等管理員確認', shot: await shot('line-register') }
  })

  await step('M2', 'LINE：管理員在後台確定職位，建立員工帳號', async () => {
    await go('/notify?tab=pending')
    const card = page.locator('.card', { hasText: '陳小明' })
    await card.getByRole('button', { name: '確定職位' }).click()
    await modal().getByText('這個職位會收到').waitFor()
    const s = await shot('line-approve')
    await modal().getByRole('button', { name: '確定' }).click()
    await page.getByText('綁定完成').waitFor()
    const msg = await modal().innerText()
    const pin = msg.match(/PIN：(\d{4})/)?.[1]
    await modal().getByRole('button', { name: '知道了' }).click()
    const d = await db()
    const c = d.notify_contacts.find((x) => x.requested_name === '陳小明')
    const u = d.users.find((x) => x.id === c.user_id)
    if (c.status !== 'approved' || !u) throw new Error('沒有綁定成功')
    return { detail: `建立員工「${u.name}」，職位現場人員，登入 PIN ${pin}`, shot: s }
  })

  await step('M3', 'LINE：員工收到確認訊息；開新工單時自動收到推播', async () => {
    await go('/production')
    await btn('＋ 開工單').click()
    const m = modal()
    await m.locator('select').nth(1).selectOption({ label: 'F001 三杯雞調理包（包）' })
    await m.locator('input[type=number]').fill('50')
    await m.getByRole('button', { name: '開立' }).click()
    await toast('已開立')
    await page.keyboard.press('Escape')
    await go('/notify?tab=sim')
    await page.locator('.sim-contact', { hasText: '陳小明' }).click()
    const phone = page.locator('.phone')
    await phone.getByText('管理員已確認你的職位').waitFor()
    await phone.getByText('新工單').waitFor()
    const d = await db()
    const n = d.notifications.filter((x) => x.event === 'wo_created').at(-1)
    const me = d.users.find((x) => x.name === '陳小明')
    if (!n.user_ids.includes(me.id)) throw new Error('新工單通知沒有送給現場人員')
    if (n.user_ids.includes(d.users.find((x) => x.name === '王老闆').id)) throw new Error('開單的人自己也收到通知')
    return { detail: '陳小明收到「管理員已確認你的職位」與「新工單」推播（含開啟系統連結）；開單的王老闆自己不會收到', shot: await shot('line-push') }
  })

  await step('M4', 'LINE：員工在 LINE 輸入「暫停通知」', async () => {
    await page.locator('#sim-text').fill('暫停通知')
    await page.locator('.phone').getByRole('button', { name: '送出' }).click()
    await page.locator('.phone').getByText('已暫停通知').waitFor()
    await go('/notify?tab=contacts')
    await page.locator('tr', { hasText: '陳小明' }).getByText('已暫停').waitFor()
    return { detail: '後台「已綁定人員」同步顯示已暫停', shot: await shot('line-contacts') }
  })

  await step('N1', '請購單：現場提出請購 → 採購轉成採購單（鼎新流程）', async () => {
    await loginAs('張師傅', '5555')
    await go('/requisitions')
    await btn('＋ 新請購單').click()
    const m = modal()
    await m.locator('select').first().selectOption({ label: 'R007 醬油（瓶）' })
    await m.locator('input[type=number]').first().fill('24')
    await m.locator('input').nth(2).fill('下週大單備料')
    await m.getByRole('button', { name: '送出' }).click()
    await toast('請購單已送出')
    await loginAs('吳採購', '3333')
    await go('/requisitions')
    await page.locator('tr.click', { hasText: '下週大單備料' }).click()
    const s = await shot('requisition')
    await modal().getByRole('button', { name: '轉成採購單' }).click()
    await toast('已轉成 1 張採購單')
    const d = await db()
    const rq = d.requisitions.find((r) => r.reason === '下週大單備料')
    const po = d.purchase_orders.find((p) => p.requisition_id === rq.id)
    if (!po) throw new Error('沒有產生採購單')
    return { detail: `請購單 ${rq.no} → 採購單 ${po.no}（醬油 24 瓶，向上次的供應商採購）`, shot: s }
  })

  await step('N2', '表單列印：出貨單、製令單、進貨單、批號標籤都能產生 A4 / 標籤版面', async () => {
    await loginAs('王老闆', '0000')
    await go('/shipping')
    await page.locator('tr.click').first().click()
    await modal().getByRole('link', { name: /出貨單/ }).click()
    await page.locator('.pf-title', { hasText: '出貨單（銷貨單）' }).waitFor()
    const t = await page.locator('.pf-totals').innerText()
    if (!/含稅合計/.test(t)) throw new Error('沒有金額合計')
    const s = await shot('print-shipment')
    await go('/forms')
    for (const [type, title] of [['製令單（生產工單）', '製令單'], ['庫存單據（進貨／領料／退料／入庫／調整）', '單']]) {
      await go('/forms')
      await page.locator('.forms-type', { hasText: type }).click()
      await page.locator('.forms-doc').first().getByRole('link').click()
      await page.locator('.pf-title', { hasText: title }).first().waitFor()
    }
    await go('/forms')
    await page.locator('.forms-type', { hasText: '批號標籤' }).click()
    await page.locator('.forms-doc').first().getByRole('link').click()
    await page.locator('.pf-label-card').first().waitFor()
    const n = await page.locator('.pf-label-card').count()
    if (n !== 4) throw new Error('標籤張數 ' + n)
    if (!(await page.locator('.pf-label-card svg.qr').count())) throw new Error('標籤沒有 QR Code')
    return { detail: '出貨單含未稅、稅額、含稅合計與客戶簽收欄；製令單、進貨單可開啟；批號標籤一次 4 張含 QR Code', shot: s }
  })

  await browser.close()
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2))
  const fails = results.filter((r) => !r.ok)
  console.log(`\n${results.length - fails.length}/${results.length} 通過`)
  process.exit(fails.length ? 1 : 0)
})()
