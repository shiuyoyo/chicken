# 串接清單：還沒接上的外部服務

系統本身都做好了；下面這些要用你自己的帳號申請或設定，才能在正式環境運作。
照順序做，前面的是後面的前提。

> **金鑰、密碼不要貼在聊天或程式裡。** 都填在各服務的後台、Supabase 的 Secrets，或 ERP 的「系統設定」。

## 總覽

| # | 項目 | 要不要寫程式 | 你要做的 | 大約時間 | 不做會怎樣 |
| --- | --- | --- | --- | --- | --- |
| 1 | Supabase（雲端資料庫、登入） | 不用 | 建專案、貼 SQL、設系統擁有者 | 15 分鐘 | 只能用本機版（每台各自一份資料） |
| 2 | 寄信服務（SMTP） | 不用 | 申請 Resend 等，填到 Supabase | 15 分鐘 | 員工多時收不到確認信、重設密碼信 |
| 3 | Vercel（網頁） | 不用 | 匯入 GitHub、填 2 個環境變數 | 10 分鐘 | 沒有網址可以開 |
| 4 | 第一次登入、開通員工 | 不用 | 載入資料、幫員工填 Email | 10 分鐘 | 員工登不進去 |
| 5 | 自己的網域 | 不用 | 買網域、設一筆 DNS | 10 分鐘＋生效時間 | 用 xxx.vercel.app 網址也能用 |
| 6 | LINE 官方帳號通知 | 不用（已寫好） | 申請 Messaging API、部署 Edge Functions | 30 分鐘 | 沒有 LINE 推播 |
| 7 | 電子發票：字軌與 QR Code 金鑰 | 不用 | 填到「系統設定」 | 10 分鐘 | QR Code 驗證欄位印 *，手機 App 掃了驗證失敗 |
| 8 | **電子發票上傳財政部** | **要，我來寫** | 選加值中心、申請測試帳號 | 看加值中心審核 | **開出去的發票沒有上傳，不符合法規** |
| 9 | 周邊設備（掃描槍、發票機、點陣印表機） | 不用 | 裝驅動、設紙張 | 每台 10 分鐘 | 不能嗶、不能印 |
| — | 刷卡機、LINE Pay 收款（選用） | 要 | 跟收單銀行 / LINE Pay 申請 | — | 收銀台只記錄付款方式，不會自動扣款 |
| — | 物流託運單（選用） | 要 | 跟物流公司申請 API | — | 出貨單手動填物流與單號 |

---

## 1. Supabase（雲端資料庫、登入）

照 [deploy.md 第一節](deploy.md#一supabase資料庫與登入) 做。重點：

1. supabase.com 建專案，區域選 **Tokyo** 或 **Singapore**。
2. SQL Editor 貼上 `supabase/schema.sql` 全部內容，按 Run。
3. 再執行一行，設定系統擁有者（換成你的 Email、小寫）：
   ```sql
   insert into erp_private.owners values ('you@company.com');
   ```
4. Authentication → Email：確認「Confirm email」是開的。
5. Project Settings → API：抄下 **Project URL** 和 **anon public key**（第 3 步要用）。

**系統更新時**：重新執行最新的 `supabase/schema.sql` 即可，資料不會被刪。

---

## 2. 寄信服務（SMTP）

Supabase 內建寄信一小時只能寄幾封，員工一起註冊會收不到確認信。

1. 申請寄信服務，例如 [Resend](https://resend.com)（免費額度每月 3,000 封）。
2. 照它的說明驗證你的網域（加幾筆 DNS），取得 SMTP 帳號密碼。
3. Supabase → Authentication → Emails → **SMTP Settings** 填入：主機、埠、帳號、密碼、寄件人（例如 `erp@你的公司.com.tw`）。
4. （選用）Authentication → Emails → Templates：把確認信、重設密碼信改成中文。

---

## 3. Vercel（網頁）

照 [deploy.md 第二節](deploy.md#二vercel網頁)：

1. vercel.com 用 GitHub 登入 → Add New → Project → 匯入 `shiuyoyo/chicken`。
2. Framework 選 Vite，Build `npm run build`，Output `dist`。
3. Environment Variables：
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon public key
4. 程式在 `claude/food-erp` 分支：先在 GitHub 合併到 `main`，或在 Vercel → Settings → Git 把 Production Branch 改成 `claude/food-erp`。
5. Deploy。

---

## 4. 第一次登入、開通員工

1. 打開 Vercel 網址 → 「第一次使用？設定密碼」→ 用**系統擁有者 Email** 註冊 → 收信確認 → 登入。
2. 選「載入示範資料」（先試用）或「從空白開始」。
3. 「使用者與權限」幫每位員工填 **Email**、選角色。
4. 通知員工：打開網址 →「第一次使用？設定密碼」→ 用那個 Email 設密碼 → 收信確認 → 登入。
5. 回 Supabase → Authentication → URL Configuration：**Site URL** 填網址，**Redirect URLs** 加 `https://你的網址/**`。

---

## 5. 自己的網域

照 [deploy.md 第四節](deploy.md#四自己的網域)：Vercel → Settings → Domains 加 `erp.你的公司.com.tw` → 照畫面在買網域的地方加一筆 CNAME →
生效後回 Supabase 的 URL Configuration 改成新網域，ERP「LINE 通知 → 連線設定 → 系統網址」也改成新網域。

---

## 6. LINE 官方帳號通知

程式已經寫好，照 [line-setup.md](line-setup.md) 做。你需要：

1. 電腦安裝 [Supabase CLI](https://supabase.com/docs/guides/cli)，在專案資料夾執行 `supabase login`、`supabase link --project-ref <專案代碼>`。
2. [LINE Developers](https://developers.line.biz/)：用現有官方帳號建立 **Messaging API** channel，取得 **Channel secret** 和 **Channel access token**。
3. 設定金鑰並部署（金鑰只存在 Supabase）：
   ```bash
   supabase secrets set LINE_CHANNEL_SECRET=xxx LINE_CHANNEL_ACCESS_TOKEN=xxx
   supabase functions deploy line-webhook --no-verify-jwt
   supabase functions deploy notify-dispatch
   ```
4. LINE Developers 填 Webhook URL：`https://<專案代碼>.supabase.co/functions/v1/line-webhook` → Verify → 開啟 Use webhook。
5. LINE Official Account Manager → 回應設定：關閉自動回應、開啟 Webhook。
6. 用自己的手機加官方帳號測試：選職位 → ERP「LINE 通知 → 綁定申請」按確定 → 開一張工單看有沒有收到。

---

## 7. 電子發票：字軌與 QR Code 金鑰

ERP「使用者與權限 → 系統設定」填：

| 欄位 | 填什麼 | 哪裡來 |
| --- | --- | --- |
| 公司統編 | 8 碼 | 印在證明聯「賣方」 |
| 發票字軌 | 例如 `AB` | 國稅局 / 財政部電子發票整合服務平台配發的字軌（每兩個月一組） |
| 下一張發票號碼 | 配發號碼的第一張，例如 `12345000` | 同上 |
| 電子發票 QR Code 金鑰 | 32 碼英數 | 財政部電子發票整合服務平台的營業人帳號裡取得（QR Code 加密用金鑰）；如果改用加值中心開立，依加值中心的說明 |
| 收銀機每班保留發票號碼數 | 預設 100 | 展場每台平板開班時先保留的號碼數 |

**每兩個月**換新字軌時要回來更新「發票字軌」和「下一張發票號碼」。

---

## 8. 電子發票上傳財政部（**還沒寫程式，要你先決定**）

現在系統會：依字軌編號、印出符合格式的證明聯（條碼、QR Code 都驗證過）。
**還不會**：把發票資料上傳財政部（法規要求開立後 48 小時內上傳）、作廢 / 折讓上傳、載具（手機條碼）、捐贈碼。

**你要先做的決定：用哪一家加值服務中心**

| 選項 | 說明 |
| --- | --- |
| 綠界 ECPay 電子發票 | 有測試環境、文件完整、常見；可以和綠界金流一起用 |
| 藍新 ezPay 電子發票 | 有測試環境；和藍新金流一起用方便 |
| 其他加值中心（光貿、關網…） | 依合約 |
| 財政部 Turnkey | 免月費，但要自己架一台常開的電腦跑上傳程式，維護較麻煩，不建議 |

**選供應商時一定要問：「能不能自己管理字軌、離線開立後再補上傳？」**
展場離線收銀需要這個功能；如果只能連線即時取號，展場斷網時就不能開發票。

**決定後給我這些（金鑰不要貼在聊天）：**
1. 供應商名稱，以及他們的 API 文件網址。
2. 申請**測試環境**帳號（通常是商店代號 MerchantID、HashKey、HashIV）。
3. 金鑰我會請你填在 Supabase 的 Secrets（`supabase secrets set ...`），不會出現在網頁或程式碼裡。

我會做：開立 / 作廢 / 折讓上傳（Supabase Edge Function，從伺服器送）、上傳失敗自動重試、上傳狀態顯示在發票清單、收銀台的手機載具與捐贈碼欄位，並用測試環境驗證。

---

## 9. 周邊設備

照 [hardware.md](hardware.md)：

- **掃描槍**：USB / 藍牙鍵盤模式，設定「Enter 結尾」。品項要填條碼。
- **發票機**：58mm 熱感出單機，裝驅動、紙張設 58mm；收銀機的 Chrome 加 `--kiosk-printing` 就不會跳列印視窗。
- **點陣印表機**：裝驅動、自訂紙張 241 × 140mm（中一刀），列印時選「中一刀三聯單」。
- **展場平板**：雲端版 + https 網址；出發前每台先上線打開一次、設收銀機代號、開班。

---

## 建議今天就做的順序

1. Supabase（第 1 節）
2. 寄信服務（第 2 節）
3. Vercel（第 3 節）
4. 第一次登入、開通自己和一位員工試試（第 4 節）
5. 系統設定：公司資料、字軌、QR 金鑰（第 7 節）
6. LINE（第 6 節）
7. 網域（第 5 節，DNS 要時間生效，可以先設著）
8. 跟加值中心申請電子發票測試帳號（第 8 節），拿到後告訴我
