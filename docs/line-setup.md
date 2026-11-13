# LINE / Telegram 通知設定

員工加入公司的 LINE 官方帳號（或 Telegram 機器人）後，自己選職位、輸入姓名；
管理員在 ERP「系統 → LINE 通知 → 綁定申請」按「確定」後，跟他職位有關的資料異動就會自動推播。

```
員工手機                     Supabase Edge Functions               ERP（瀏覽器）
加好友 / 選職位 / 打姓名 ──▶ line-webhook ──寫入──▶ notify_contacts ◀── 管理員按「確定」
                                                                       │
                             notify-dispatch ◀──呼叫── 新通知寫入 notifications（資料異動時）
推播訊息 ◀── LINE push API ◀─┘
```

## 前置條件

1. ERP 已改用 Supabase（「開發者 → 資料庫設定」，並執行 `supabase/schema.sql`）。
2. 電腦安裝 [Supabase CLI](https://supabase.com/docs/guides/cli)，並在專案資料夾執行 `supabase link --project-ref <你的專案代碼>`。

## LINE 官方帳號

1. 到 [LINE Developers](https://developers.line.biz/) 建立 Provider，選你現有的官方帳號建立 **Messaging API** channel。
2. Basic settings 複製 **Channel secret**；Messaging API 分頁發行 **Channel access token (long-lived)**。
3. 設定金鑰（只存在 Supabase，不會出現在網頁）並部署：
   ```bash
   supabase secrets set LINE_CHANNEL_SECRET=xxx LINE_CHANNEL_ACCESS_TOKEN=xxx
   supabase functions deploy line-webhook --no-verify-jwt
   supabase functions deploy notify-dispatch
   ```
4. LINE Developers → Messaging API → **Webhook URL** 填 `https://<專案代碼>.supabase.co/functions/v1/line-webhook`，按 Verify，打開 **Use webhook**。
5. LINE Official Account Manager → 回應設定：關閉「自動回應訊息」，開啟「Webhook」。
6. （選用）建立圖文選單，按鈕送出文字「設定職位」「我的職位」「暫停通知」。
7. ERP「系統設定」填上**系統網址**，訊息裡的「開啟系統」才會連到正確位置。

## Telegram（選用）

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=xxx TELEGRAM_WEBHOOK_SECRET=自己取的亂碼
supabase functions deploy telegram-webhook --no-verify-jwt
# 瀏覽器開一次（換成你的值）：
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<專案代碼>.supabase.co/functions/v1/telegram-webhook&secret_token=<亂碼>
```

## 員工可以在 LINE 輸入的指令

| 指令 | 作用 |
| --- | --- |
| 設定職位 / 重新設定 | 重新選擇職位（需要管理員再確認一次） |
| 我的職位 | 查看綁定狀態與職位 |
| 暫停通知 / 恢復通知 | 自己暫停或恢復推播 |

## 會通知哪些事件

在「LINE 通知 → 通知規則」可以勾選每種事件要通知哪些職位。預設：

| 事件 | 預設通知 |
| --- | --- |
| 有單據等你核准 | 該模組有「核准」權限的人 |
| 你送出的申請有結果 | 申請人 |
| 新訂單成立 / 已出貨 / 收到貨款 | 管理者、業務主管、廠長、會計，以及客戶的負責業務 |
| 進貨入庫、進料等待檢驗 | 採購、廠長、品管 |
| 新的生產工單、成品等待 QC、QC 不合格 | 廠長、現場人員、品管、管理者 |
| 原料低於安全庫存 | 採購、廠長 |
| 門市日結、月結關帳 | 管理者、店長、會計 |

做這個動作的人自己不會收到通知。

## 費用與限制

- LINE 官方帳號的推播（push）會計入每月訊息則數；台灣的免費方案（輕用量）每月 200 則，超過要升級方案；實際額度以 LINE 官方公告為準。回覆員工訊息（reply）不計費。
- 通知在資料異動的同一個交易中產生；動作失敗時不會發出通知。
- 發送失敗會記在「發送紀錄」。員工封鎖官方帳號時，LINE 會通知系統，他的狀態變成「已封鎖」、不再推播；解除封鎖後自動恢復。

## 其他通訊軟體

- **WhatsApp**：可以接 WhatsApp Business Cloud API。需要 Meta 商業驗證；主動推播必須使用事先審核的範本訊息，每則對話計費。
  只要在 `supabase/functions/_shared/` 加一個轉接檔（像 `telegram.ts`），在 `handlers.ts` 的 `makeSenders` 註冊即可。
- **WeChat**：公眾號範本訊息需要認證過的服務號，台灣公司申請不易。大陸廠區建議用「企業微信」群組機器人 webhook。

## 測試

```bash
npm test                                 # 收件人規則、綁定流程、發送（vitest）
cd supabase/functions && deno test tests # 模擬 LINE / Telegram 打進 webhook
```
