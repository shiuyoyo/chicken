// 雲端同步狀態：已同步 / 離線（幾筆待上傳）/ 上傳失敗（主管處理：重試或捨棄）
import { useEffect, useState } from 'react'
import { isCloud, currentBackend } from '../db/store'
import { failedUploads, describeBatch } from '../db/supabase'
import { Modal, ask, toast } from '../ui'

export default function SyncStatus() {
  const [s, setS] = useState(() => (isCloud() ? currentBackend().status() : null))
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!isCloud()) return
    const on = (e) => setS(e.detail)
    window.addEventListener('erp:sync', on)
    return () => window.removeEventListener('erp:sync', on)
  }, [])
  if (!s) return null
  const label = s.failed ? `⚠ ${s.failed} 筆上傳失敗` : s.offline ? `離線中・${s.pending} 筆待上傳` : s.pending ? `上傳中 ${s.pending}` : '已同步'
  const kind = s.failed ? 'bad' : s.offline ? 'warn' : 'ok'
  return (
    <>
      <button className={`badge ${kind}`} onClick={() => setOpen(true)} title="雲端同步狀態">{label}</button>
      {open && <SyncPanel onClose={() => setOpen(false)} status={s} />}
    </>
  )
}

function SyncPanel({ onClose, status }) {
  const [list, setList] = useState(failedUploads())
  const b = currentBackend()
  return (
    <Modal title="雲端同步" onClose={onClose}
      footer={<>
        {list.length > 0 && <button className="btn primary" onClick={async () => { await b.retryFailed(); setList(failedUploads()); toast(failedUploads().length ? '仍有資料上傳失敗' : '已重新上傳') }}>全部重試</button>}
        <button className="btn" onClick={onClose}>關閉</button>
      </>}>
      <div className="stack">
        <p style={{ margin: 0 }}>
          {status.offline ? `目前連不上雲端，這台裝置有 ${status.pending} 筆異動等待上傳；可以繼續使用，連上網路後會自動上傳。` : status.pending ? `正在上傳 ${status.pending} 筆。` : '所有異動都已上傳到雲端。'}
        </p>
        {status.others > 0 && <p className="small" style={{ margin: 0 }}>這台裝置還有 {status.others} 筆是其他同事離線時做的異動，要等他本人在這台裝置登入後才會上傳。</p>}
        {list.length > 0 && (
          <>
            <p className="small muted" style={{ margin: 0 }}>下面這些異動被雲端拒絕（例如離線時賣出的商品，別台已經賣完）。請先處理原因（例如調撥補貨）再按「全部重試」；確定不要的可以捨棄。</p>
            {list.map((x) => (
              <div key={x.id} className="card card-pad stack">
                <b>{describeBatch(x)}</b>
                <span className="small muted">{x.at?.slice(0, 16).replace('T', ' ')}・{x.error}</span>
                <div className="row">
                  <button className="btn sm danger" onClick={async () => { if (await ask('捨棄這筆？捨棄後雲端不會有這筆資料，請確認已另外處理。', { danger: true, confirmText: '捨棄' })) { b.discardFailed(x.id); setList(failedUploads()) } }}>捨棄</button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </Modal>
  )
}
