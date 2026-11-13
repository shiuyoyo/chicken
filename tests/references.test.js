// 頁面用 L.xxx 取用業務邏輯，打包工具檢查不到拼錯的名稱，這裡逐一確認都存在
import { it, expect } from 'vitest'
import * as L from '../src/logic'
import * as UI from '../src/ui.jsx'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
it('頁面引用的 logic / ui 名稱都存在', () => {
  const files = []
  const walk = (d) => fs.readdirSync(d).forEach((f) => { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : /\.jsx?$/.test(f) && files.push(p) })
  walk(fileURLToPath(new URL('../src', import.meta.url)))
  const missing = new Set()
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8')
    for (const m of s.matchAll(/\bL\.([A-Za-z_]\w*)/g)) if (!(m[1] in L)) missing.add(`${path.basename(f)}: L.${m[1]}`)
    // named imports from ../ui
    for (const m of s.matchAll(/import \{([^}]+)\} from '\.\.?\/(?:\.\.\/)?ui'/g)) for (const n of m[1].split(',').map((x) => x.trim()).filter(Boolean)) if (!(n in UI)) missing.add(`${path.basename(f)}: ui.${n}`)
  }
  expect([...missing]).toEqual([])
})
