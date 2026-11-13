// 離線用：把網頁本身（HTML、程式、圖示）存在裝置上，展場沒網路也能打開收銀台。
// 資料不經過這裡：雲端資料的離線處理在 src/db/supabase.js（待上傳佇列）。
const CACHE = 'erp-app-v2'

self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './manifest.webmanifest', './icon-192.png'])))
})
// 新版本啟用時清掉舊版的快取
self.addEventListener('activate', (e) =>
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())),
)
// 第一次打開時，程式檔在 service worker 啟用前就下載好了：由網頁把清單傳過來補存
self.addEventListener('message', (e) => {
  const urls = (e.data?.cache || []).filter((u) => new URL(u).origin === self.location.origin)
  if (urls.length) e.waitUntil(caches.open(CACHE).then((c) => c.addAll(urls)).catch(() => {}))
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  // 網頁：先上網拿最新版，沒網路才用存著的
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./', copy))
          return res
        })
        .catch(() => caches.match('./', { ignoreVary: true })),
    )
    return
  }
  // 程式與圖片（檔名含版本）：有存就用存的，沒有就下載後存起來
  e.respondWith(
    caches.match(req, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
