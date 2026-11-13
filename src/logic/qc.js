// 品管：成品抽檢（FQC）、進料檢驗（IQC）。不合格改判合格要主管簽核。
import { all, get, where, insert, update, nextNo, transaction } from '../db/store'
import { fail, need, can, today, userName, requestApproval, registerApproval, isSystem } from './core'
import { notify } from './notify'
import { lotByNo } from './inventory'
import { QC_TEMPLATE_DEFAULTS, checksFor, ITEM_TYPES } from './bom'

// 檢驗項目改由範本決定（設定 → 檢驗範本，品項可指定用哪一套），這兩個保留給舊程式相容
export const DEFAULT_CHECKS = QC_TEMPLATE_DEFAULTS['食品成品']
export const IQC_CHECKS = QC_TEMPLATE_DEFAULTS['食品進料']
// 某批號該用哪些檢驗項目
export const checksForLot = (lot) => checksFor(get('items', lot?.item_id), lot?.kind === 'raw' ? 'IQC' : 'FQC')
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
    if (data.result === 'fail') {
      const item = get('items', lot.item_id)
      notify('qc_failed', {
        title: `QC 不合格：${item?.name}`,
        lines: [`批號 ${lot.lot_no}（${kind === 'IQC' ? '進料' : ITEM_TYPES[item?.type] || '成品'}）`, `數量 ${lot.qty} ${item?.unit || ''}`, data.note && `說明：${data.note}`, '已管制，不能使用或出貨'],
        link: `/trace?lot=${lot.lot_no}`,
      })
    }
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
