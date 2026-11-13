// 離線開啟：網頁伺服器整個關掉（等同展場沒網路）後重新整理，網頁仍然打得開（service worker 快取）。
// 用法：npm run build && node tests/e2e/offline-app.cjs
const { chromium } = require('playwright')
const { spawn } = require('child_process')
const path = require('path')
const PORT = 4177
;(async () => {
  const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: path.join(__dirname, '../..'), stdio: 'ignore', detached: true })
  await new Promise((r) => setTimeout(r, 2500))
  const b = await chromium.launch()
  const p = await (await b.newContext()).newPage()
  let ok = false
  try {
    await p.goto(`http://localhost:${PORT}/`)
    await p.waitForSelector('.login-user', { timeout: 15000 })
    await p.evaluate(() => navigator.serviceWorker.ready)
    await p.waitForTimeout(1500)
    process.kill(-srv.pid)
    await new Promise((r) => setTimeout(r, 1000))
    await p.reload()
    await p.waitForSelector('.login-user', { timeout: 10000 })
    ok = true
    console.log('✅ 網頁伺服器關掉後重新整理，網頁照樣打開（離線可用）')
  } catch (e) {
    console.log('❌ 離線開啟失敗：', e.message.split('\n')[0])
  } finally {
    await b.close()
    try {
      process.kill(-srv.pid)
    } catch {}
  }
  process.exit(ok ? 0 : 1)
})()
