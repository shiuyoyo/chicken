# 上線步驟：Supabase + Vercel + 自己的網域

照順序做完約 30–60 分鐘。全部在網頁上點，不需要裝任何程式。

```
員工手機 / 電腦 ──► Vercel（網頁）──► Supabase（登入、資料庫、LINE 通知）
                     ▲
              erp.你的公司.com.tw
```

---

## 一、Supabase：資料庫與登入

### 1. 建立專案
1. 到 <https://supabase.com> 用 GitHub 或 Email 註冊、登入。
2. 按 **New project**：
   - Name：例如 `factory-erp`
   - Database Password：按 Generate，**存到密碼管理器**（之後很少用到，但遺失很麻煩）
   - Region：**Northeast Asia (Tokyo)** 或 **Southeast Asia (Singapore)**，台灣連線比較快
3. 等 1–2 分鐘專案建立完成。

### 2. 建立資料表與權限規則
1. 左側選單 **SQL Editor** → **New query**。
2. 打開本專案的 `supabase/schema.sql`，全部複製貼上，按 **Run**。看到 `Success. No rows returned` 就完成了。
   - 這會建立所有資料表、每個角色的讀寫權限，以及伺服器端的檢查（傳票平衡、關帳、庫存不足、簽核）。
   - 以後系統更新時，重新執行最新的 `schema.sql` 即可，已經有的資料不會被刪。
3. 再開一個 New query，設定**系統擁有者**（換成你自己的 Email，用小寫）：
   ```sql
   insert into erp_private.owners values ('you@company.com');
   ```
   系統擁有者擁有所有權限，可以做第一次設定與還原備份。建議只放 1–2 個老闆或 IT 的 Email。

### 3. 登入設定
左側 **Authentication**：

1. **Sign In / Providers → Email**：確認 **Enable Email provider** 與 **Confirm email** 都是開的（預設就是）。
   沒驗證信箱的帳號看不到任何資料。
2. **URL Configuration**（Vercel 部署好之後再回來填）：
   - **Site URL**：正式網址，例如 `https://erp.你的公司.com.tw`
   - **Redirect URLs**：加入 `https://erp.你的公司.com.tw/**` 和 `https://你的專案.vercel.app/**`
   這兩個沒設好的話，確認信、重設密碼信的連結會跳到錯的地方。
3. **建議：設定寄信服務（SMTP）**。Supabase 內建的寄信每小時只能寄幾封，員工一起註冊會收不到信。
   到 **Authentication → Emails → SMTP Settings** 填入寄信服務（例如 Resend、Brevo、Google Workspace 的 SMTP）。

### 4. 抄下連線資訊
**Project Settings → API**（或 Data API）：

- **Project URL**：`https://xxxx.supabase.co`
- **anon public** key：很長一串 `eyJ...`

anon key 會放在網頁裡，是公開的，沒關係：資料庫只讓登入且開通的員工讀寫。
**不要**用 `service_role` key，那把鑰匙可以略過所有權限。

---

## 二、Vercel：網頁

1. 到 <https://vercel.com> 用 **GitHub** 登入。
2. **Add New… → Project**，選 `shiuyoyo/chicken` 按 **Import**。
   - 如果看不到這個 repo：按 **Adjust GitHub App Permissions**，允許 Vercel 讀取它。
3. 設定：
   - **Framework Preset**：Vite
   - **Root Directory**：`./`
   - **Build Command**：`npm run build`
   - **Output Directory**：`dist`
   - **Environment Variables**（兩個都要）：

     | Name | Value |
     | --- | --- |
     | `VITE_SUPABASE_URL` | 上面的 Project URL |
     | `VITE_SUPABASE_ANON_KEY` | 上面的 anon public key |
4. 按 **Deploy**，約 1 分鐘後得到 `https://xxx.vercel.app`。
5. 正式分支：Vercel 預設部署 `main`。目前程式在 `claude/food-erp` 分支，請先在 GitHub 把它合併到 `main`，
   或到 Vercel 專案 **Settings → Git → Production Branch** 改成 `claude/food-erp`。
   之後每次推送到這個分支，Vercel 會自動重新部署。

> 改了環境變數之後要到 **Deployments** 對最新一次按 **Redeploy** 才會生效。

---

## 三、第一次登入

1. 打開 Vercel 給的網址，按 **「第一次使用？設定密碼」**，輸入**系統擁有者的 Email** 和密碼。
2. 到信箱點確認連結，回到網頁登入。
3. 因為資料庫是空的，會出現三個選項：
   - **載入示範資料**：先給大家試用。示範資料裡的「王老闆」會綁定你的 Email。
   - **上傳這台裝置的本機資料**：如果你之前在這台電腦的瀏覽器裡用過本機版，可以把資料搬上雲端。
   - **從空白開始**：輸入你的姓名，建立一個有全部權限的管理者，開始建自己的主檔。
4. 到 **使用者與權限**，幫每位員工填上**登入 Email**、選好角色。
5. 通知員工：打開網址 → 「第一次使用？設定密碼」→ 用那個 Email 設密碼 → 收信確認 → 登入。
   - 用沒登記的 Email 註冊的人，只會看到「還沒有開通」，看不到任何資料。
   - 員工離職：在「使用者與權限」把他**停用**，他立刻就讀寫不到任何資料。

---

## 四、自己的網域

1. **買網域**（還沒有的話）：`.com.tw` 可以在 Gandi、PChome 買網址、Hinet 等；`.com` 可以在 Cloudflare、Namecheap。
   建議用子網域給 ERP，例如 `erp.你的公司.com.tw`，主網域留給公司官網。
2. Vercel 專案 → **Settings → Domains** → 輸入 `erp.你的公司.com.tw` → **Add**。
3. Vercel 會顯示要設定的 DNS 紀錄。子網域通常是一筆：

   | 類型 | 名稱 | 值 |
   | --- | --- | --- |
   | CNAME | `erp` | Vercel 顯示的值（例如 `cname.vercel-dns.com` 或一串專屬的 `….vercel-dns-0xx.com`） |

   如果要用主網域本身（`你的公司.com.tw`，沒有前綴），Vercel 會要求設定 **A 紀錄**，值照它畫面上顯示的填。
4. 到買網域的地方（或 Cloudflare）找 **DNS 設定 / DNS 管理**，新增上面那筆紀錄。
   - 用 Cloudflare 的話，這筆紀錄的雲朵先設成 **DNS only（灰色）**，讓 Vercel 自己發 HTTPS 憑證。
5. 回到 Vercel，幾分鐘到幾小時內會變成 **Valid Configuration**，HTTPS 自動處理。
6. 網域生效後：
   - 回 Supabase **Authentication → URL Configuration**，把 **Site URL** 改成新網域，Redirect URLs 加上新網域（見一、3）。
   - 在 ERP 的 **LINE 通知 → 連線設定 → 系統網址** 填上新網域，通知裡的「開啟系統」連結就會指向它。

---

## 五、LINE 通知（要用再做）

照 [line-setup.md](line-setup.md) 部署 Edge Functions、設定 LINE 金鑰與 Webhook 網址。
Webhook 網址是 Supabase 的網址（`https://xxxx.supabase.co/functions/v1/line-webhook`），跟你的網域無關，換網域不用改。

---

## 安全性：伺服器上檢查了什麼

雲端版所有讀寫都要先登入，資料庫依登入者的角色檢查，就算有人繞過畫面直接呼叫資料庫也一樣：

| 規則 | 伺服器端 |
| --- | --- |
| 沒登入、信箱沒驗證、Email 沒登記在員工資料裡 | 讀不到、寫不進任何資料 |
| 員工被停用 | 立刻讀不到、寫不進 |
| 寫入權限 | 每張表依模組權限（編輯以上）檢查，例如門市人員不能開採購單、只有管理者能改使用者與角色 |
| 會計傳票 | 借貸必須平衡；不能修改、刪除（要開沖銷傳票）；不能記在已關帳期間 |
| 庫存異動 | 不能修改、刪除；不能扣成負數；不能記在已關帳期間 |
| 關帳 | 只有會計核准權能關帳；重新開帳要系統管理核准權 |
| 簽核 | 申請人一定是自己；核准要有該模組核准權；不能核准自己的申請；處理過的不能再改 |
| 操作紀錄 | 人員姓名、時間由伺服器填，不能冒名；不能修改、刪除 |
| 簽核門檻 | 採購單超過金額門檻、訂單低於最低售價或超過客戶信用額度、庫存調整 / 盤差超過金額、銷貨退回、門市作廢、QC 改判合格，都要有核准紀錄才能生效 |
| 數量與金額上限 | 進貨不能超過可超收比例、領料不能超過 BOM 需求的可超領比例、出貨不能超過訂單、收付款不能超過未收 / 未付金額、門市折扣不能超過上限（店長除外）、報廢要核准權 |
| 一個動作的多筆異動 | 在同一個資料庫交易裡，一筆被拒絕就整批取消 |
| 整份覆蓋 / 還原備份 | 只有系統擁有者 |

門檻的金額與比例都讀「系統設定」裡的值，在畫面上改了設定，伺服器會照新的值檢查。

另外：所有開通的員工都**讀得到**全部資料（例如門市人員讀得到應收帳款），因為很多畫面要跨模組計算（庫存、成本、進度）。
寫入才依權限限制。

## 費用參考

| 項目 | 免費方案 | 正式使用建議 |
| --- | --- | --- |
| Vercel | Hobby 免費（個人 / 非商業） | 公司商業使用條款上要用 Pro，每人每月約 US$20 |
| Supabase | 免費：500 MB 資料庫，**一週沒人使用會暫停** | Pro 每月約 US$25（不會暫停、每日備份） |
| 網域 | — | `.com.tw` 每年約台幣 800 元上下，`.com` 約 US$10–15 |
| 寄信（SMTP） | Resend、Brevo 等都有免費額度 | 員工不多時免費額度通常夠用 |
