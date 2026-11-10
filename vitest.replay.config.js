// npm run test:replay：業務規則測試的每一批寫入都送進真的 PostgreSQL 驗證（需要本機 PostgreSQL）
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/{seed,rules,close,notify,forms,bom,retail}.test.js'],
    setupFiles: ['tests/replay/setup.js'],
    testTimeout: 120000,
    hookTimeout: 120000,
    fileParallelism: false,
  },
})
