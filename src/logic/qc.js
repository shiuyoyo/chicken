// 品管：成品抽檢（FQC）、進料檢驗（IQC）。不合格改判合格要主管簽核。
import { all, get, where, insert, update, nextNo, transaction } from '../db/store'
import { fail, need, can, today, userName, requestApproval, registerApproval, isSystem } from './core'
import { lotByNo } from './inventory'

export const DEFAULT_CHECKS = [
  { name: '外觀 / 色澤', standard: '色澤均勻、無異物' },
  { name: '氣味', standard: '無異味' },
  { name: '中心溫度', standard: '≥ 75°C' },
  { name: '重量', standard: '標示重量 ±3%' },
  { name: '包裝密封', standard: '無漏氣、無破損' },
  { name: '標示', standard: '品名、批號、效期正確' },
]
export const IQC_CHECKS = [
  { name: '到貨溫度', standard: '冷凍 ≤ -15°C / 冷藏 ≤ 7°C' },
  { name: '外觀 / 氣味', standard: '無異味、無變色' },
  { name: '包裝完整', standard: '無破損、無污染' },
  { name: '標示與效期', standard: '有效期限 ≥ 2/3' },
  { name: '檢驗報告', standard: '供應商附藥檢 / 微生物報告' },
]
export const QC_STATUS = { pending: '待檢', pass: '合格', fail: '不合格', hold: '暫扣' }

function applyResult(lot, result) {
  update('lots', lot.id, { qc_status: result })
  if (lot.work_order_id) {
    const wo = get('work_orders', lot.work_order_id)
    if (wo && !['closed', 'cancelled'].includes(wo.status)) update('work_orders', wo.id, { status: result === 'pass' ? 'qc_pass' : 'qc_fail' })
  }
}

// data: { lot_no, sample_size, defect_qty, checks, result, note }
export function saveInspection(data) {
  return transaction(() => {
    need('qc', 2)
    const lot = lotByNo(data.lot_no)
    if (!lot) fail('請選擇批號')
    if (!['pass', 'fail'].includes(data.result)) fail('請判定合格或不合格')
    if (data.result === 'pass' && (data.checks || []).some((c) => c.pass === false)) fail('有檢驗項目是 NG，不能判定合格')
    if (data.result === 'pass' && Number(data.defect_qty) > 0) fail('有不良品，不能判定合格')
    const kind = lot.kind === 'raw' ? 'IQC' : 'FQC'
    const qc = insert('qc_inspections', {
      no: nextNo('qc_inspections', 'QC'), kind, date: today(), inspector: userName(), item_id: lot.item_id, work_order_id: lot.work_order_id || '',
      sample_size: Number(data.sample_size || 0), defect_qty: Number(data.defect_qty || 0), checks: data.checks || [], lot_no: lot.lot_no, result: data.result, note: data.note || '',
    })
    // 曾判不合格的批號要改判合格：需品管主管核准
    if (data.result === 'pass' && ['fail', 'hold'].includes(lot.qc_status) && !isSystem() && !can('qc', 3)) {
      requestApproval({ type: 'qc_release', module: 'qc', ref_table: 'lots', ref_id: lot.id, summary: `${lot.lot_no} ${get('items', lot.item_id)?.name} 改判合格`, reason: `前次判定「${lot.qc_status === 'fail' ? '不合格' : '暫扣'}」，複檢 ${qc.no} 合格` })
      return { qc, pending: true }
    }
    applyResult(lot, data.result)
    return { qc, pending: false }
  })
}
registerApproval('qc_release', { approve: (ap) => applyResult(get('lots', ap.ref_id), 'pass') })

export function holdLot(lotNo, reason) {
  need('qc', 2)
  const lot = lotByNo(lotNo)
  if (!reason) fail('請填寫暫扣原因')
  update('lots', lot.id, { qc_status: 'hold', note: `${lot.note || ''} 暫扣：${reason}`.trim() })
}

export const pendingLots = () => where('lots', (l) => l.qc_status === 'pending')
export const qcOfLot = (lotNo) => where('qc_inspections', (q) => q.lot_no === lotNo)
export const allInspections = () => all('qc_inspections')
