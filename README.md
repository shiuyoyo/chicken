# 食品工廠 ERP

手機、電腦都能用的食品工廠 ERP（範例：雞肉調理包工廠）。
從接單 → 採購進貨 → 領料 → 投料烹煮 → 產出 → QC 抽檢 → 出貨（箱數／貨櫃）→ 開帳收款，全程可追蹤。

## 系統

| 系統 | 內容 |
| --- | --- |
| 總覽 | 儀表板、**訂單進度**（每張訂單 8 個階段的完成量與歷程） |
| 業務 | 銷售訂單、客戶；依配方自動算原料需求、一鍵產生採購單與工單 |
| 採購 | 採購單、進貨（可部分到貨）、直接進貨、供應商 |
| 生產 | 工單：領料（倉庫→產線）、投料（下鍋）、產出（自動建批號）、結案退料 |
| 品管 QC | 成品抽檢（檢驗項目 OK/NG）、進料檢驗；**QC 合格的批號才能出貨** |
| 出貨 | 依訂單出貨、先進先出分配批號、箱數自動計算、包裝方式／貨櫃號 |
| 庫存 | 原料／成品／批號庫存、安全庫存警示、盤點調整、異動紀錄 |
| 會計 | 應收、應付、收付款、費用、手動傳票、損益表、試算表（進出貨自動產生分錄） |
| 開發者 | 資料表瀏覽、備份／還原、Supabase 設定與建表 SQL、健康檢查、操作紀錄 |

## 兩種介面

- **標準模式**：選單 + 表單，一般字體，適合辦公室與年輕同仁。
- **簡易大按鈕模式**（`#/simple`）：一排一個大框框（進貨／領料投料／生產產出／出貨／品管），
  數量可選「👆 點擊計數」（點一下 +1，另有 −1、+5、+10）或「⌨️ 直接輸入」。

## 開發

```bash
npm install
npm run dev          # 開發（--host，手機在同網段可直接連）
npm run build        # 產生 dist/
npm run build:single # 產生單一 HTML 檔 dist-single/index.html
npm run schema       # 由 src/db/schema.js 重新產生 supabase/schema.sql
```

## 資料庫

預設存在**瀏覽器本機**（localStorage，每台裝置一份，第一次開啟會載入示範資料）。
要讓多台手機共用資料時改用 Supabase：

1. 建立 Supabase 專案，在 SQL Editor 執行 `supabase/schema.sql`
2. 在 App「開發者 → 資料庫設定」填入 Project URL 與 anon key，按「上傳本機資料並切換」
   （或在 `.env` 設定 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`）

> schema.sql 目前的 RLS policy 允許匿名讀寫，只適合試用；正式上線前請加上登入與權限。

## 程式結構

```
src/db/schema.js   資料表定義（本機與 Supabase 共用）
src/db/store.js    讀寫中心（記憶體快取 + 後端）
src/db/local.js    本機儲存後端
src/db/supabase.js Supabase 後端
src/db/seed.js     示範資料
src/logic.js       所有業務邏輯（庫存、生產、QC、出貨、會計分錄、訂單進度）
src/pages/         標準模式各頁
src/simple/        簡易大按鈕模式
```
