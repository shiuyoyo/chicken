// 表單列印：每一種單據的內容（純資料，畫面在 PrintView.jsx）。
// 單據名稱與欄位參考鼎新 ERP 的慣例：請購單、採購單、進貨單、領料單、退料單、生產入庫單、製令單、
// 報價單、客戶訂單、揀貨單、出貨單（銷貨單）、銷退單、調撥單、盤點表、檢驗單、應收帳款單、對帳單、收付款單、傳票、批號標籤。
import { all, get, where } from '../db/store'
import * as L from '../logic'

const money = (n) => (Number(n) < 0 ? '-' : '') + Math.abs(Math.round(Number(n) || 0)).toLocaleString()
const num = (n) => (Math.round((Number(n) || 0) * 1000) / 1000).toLocaleString()
const item = (id) => get('items', id) || {}
const user = (id) => get('users', id)?.name || ''
const cust = (id) => get('customers', id) || {}
const sup = (id) => get('suppliers', id) || {}
const bin = (id) => L.binLabel(id)
const lot = (no) => L.lotByNo(no) || {}

const partyCustomer = (c) => ({ title: '客戶', lines: [`${c.code || ''} ${c.name || ''}`, c.tax_id && `統編 ${c.tax_id}`, [c.contact, c.phone].filter(Boolean).join(' '), c.address] })
const partySupplier = (s) => ({ title: '供應商', lines: [`${s.code || ''} ${s.name || ''}`, s.tax_id && `統編 ${s.tax_id}`, [s.contact, s.phone].filter(Boolean).join(' '), s.address] })
const amountTotals = (amount) => {
  const tax = L.round(amount * L.taxRate())
  return [['未稅金額', money(amount)], [`營業稅 ${L.taxRate() * 100}%`, money(tax)], ['含稅合計', money(amount + tax)]]
}
const itemCols = (extra = []) => [
  { h: '品號', r: (l) => item(l.item_id).code },
  { h: '品名 / 規格', r: (l) => `${item(l.item_id).name || ''}${item(l.item_id).spec ? '\n' + item(l.item_id).spec : ''}` },
  ...extra,
]

// 庫存單據（進貨單、領料單、退料單、生產入庫單、調整單、報廢單、投料單）共用：以 doc_no 找出同一張單的異動
function moveDoc(docNo) {
  const moves = where('stock_moves', (m) => m.doc_no === docNo)
  if (!moves.length) return null
  const prefix = docNo.replace(/\d.*$/, '')
  const title = L.DOC_TYPES[prefix] || '庫存異動單'
  const first = moves[0]
  const wo = first.ref_type === 'work_orders' ? get('work_orders', first.ref_id) : null
  // 領料、退料是「倉庫 ↔ 產線」兩筆，列印只取倉庫那一邊
  const lines = moves.filter((m) => (['MI'].includes(prefix) ? m.qty < 0 : ['MR'].includes(prefix) ? m.qty > 0 : true))
  const base = { title, no: docNo, date: first.doc_date || String(first.date).slice(0, 10) }
  if (prefix === 'RC') {
    const po = first.ref_type === 'purchase_orders' ? get('purchase_orders', first.ref_id) : null
    const s = sup(po?.supplier_id || (first.ref_type === 'suppliers' ? first.ref_id : ''))
    const bill = where('bills', (b) => b.receipt_no === docNo)[0]
    const amount = L.sum(lines, (m) => m.qty * (m.unit_cost || 0))
    return {
      ...base,
      party: partySupplier(s),
      meta: [['採購單號', po?.no || '直接進貨'], ['送貨單 / 備註', first.note && first.note !== po?.no && first.note !== '直接進貨' ? first.note : ''], ['應付帳款', bill?.no || ''], ['經手人', first.user_name]],
      columns: [
        ...itemCols(),
        { h: '本廠批號', r: (m) => m.lot_no },
        { h: '廠商批號', r: (m) => lot(m.lot_no).supplier_lot || '' },
        { h: '有效日期', r: (m) => lot(m.lot_no).exp_date || '' },
        { h: '入庫儲位', r: (m) => bin(m.bin_id) },
        { h: '數量', cls: 'num', r: (m) => num(m.qty) },
        { h: '單位', r: (m) => item(m.item_id).unit },
        { h: '單價', cls: 'num', r: (m) => money(m.unit_cost) },
        { h: '金額', cls: 'num', r: (m) => money(m.qty * m.unit_cost) },
        { h: '檢驗', r: (m) => ({ pass: '合格', pending: '待檢', fail: '不合格' })[lot(m.lot_no).qc_status] || '' },
      ],
      rows: lines,
      totals: amountTotals(amount),
      notes: ['冷凍品到貨溫度須 ≤ -15°C，冷藏品須 ≤ 7°C，不符者拒收。'],
      signatures: ['倉管點收', '品管檢驗', '採購', '主管'],
    }
  }
  const showCost = ['MS', 'AJ', 'SC'].includes(prefix)
  return {
    ...base,
    meta: [
      ...(wo ? [['製令單號', wo.no], ['產品', `${item(wo.product_id).name} ${num(wo.plan_qty)} ${item(wo.product_id).unit}`], ['成品批號', wo.lot_no], ['產線', wo.line]] : []),
      ['說明', prefix === 'AJ' || prefix === 'SC' ? first.note : ''],
      ['經手人', first.user_name],
    ].filter((x) => x[1]),
    columns: [
      ...itemCols(),
      { h: '批號', r: (m) => m.lot_no },
      { h: prefix === 'MI' ? '發料儲位' : prefix === 'MR' ? '退回儲位' : '儲位', r: (m) => bin(m.bin_id) },
      { h: '數量', cls: 'num', r: (m) => num(Math.abs(m.qty)) + (m.qty < 0 && !['MI'].includes(prefix) ? '（減）' : '') },
      { h: '單位', r: (m) => item(m.item_id).unit },
      ...(showCost ? [{ h: '單位成本', cls: 'num', r: (m) => money(m.unit_cost) }, { h: '金額', cls: 'num', r: (m) => money(Math.abs(m.qty) * (m.unit_cost || 0)) }] : []),
    ],
    rows: lines,
    totals: showCost ? [['合計金額', money(L.sum(lines, (m) => Math.abs(m.qty) * (m.unit_cost || 0)))]] : [],
    signatures: prefix === 'MI' ? ['發料（倉管）', '領料（現場）', '主管'] : prefix === 'MS' ? ['繳庫（現場）', '收料（倉管）', '品管'] : ['經辦', '倉管', '主管'],
  }
}

export const FORMS = {
  quotation: {
    label: '報價單', module: 'crm', table: 'quotations',
    build: (id) => {
      const q = get('quotations', id)
      return {
        title: '報價單', no: q.no, date: q.date,
        party: partyCustomer(cust(q.customer_id)),
        meta: [['報價有效期限', q.valid_until], ['業務', user(cust(q.customer_id).owner_id)], ['付款條件', cust(q.customer_id).terms_days ? `月結 ${cust(q.customer_id).terms_days} 天` : '現金']],
        columns: [...itemCols(), { h: '數量', cls: 'num', r: (l) => num(l.qty) }, { h: '單位', r: (l) => item(l.item_id).unit }, { h: '單價', cls: 'num', r: (l) => money(l.price) }, { h: '金額', cls: 'num', r: (l) => money(l.qty * l.price) }],
        rows: q.lines,
        totals: amountTotals(q.total),
        notes: [q.note, '本報價單經客戶簽回即視為訂購確認。'].filter(Boolean),
        signatures: ['業務', '主管', '客戶簽回'],
      }
    },
  },
  sales_order: {
    label: '客戶訂單', module: 'sales', table: 'sales_orders',
    build: (id) => {
      const so = get('sales_orders', id)
      return {
        title: '客戶訂單', no: so.no, date: so.date,
        party: partyCustomer(cust(so.customer_id)),
        meta: [['交貨日期', so.due_date], ['報價單', get('quotations', so.quotation_id)?.no || ''], ['業務', user(cust(so.customer_id).owner_id)], ['狀態', L.SO_STATUS[so.status]]],
        columns: [...itemCols(), { h: '訂購量', cls: 'num', r: (l) => num(l.qty) }, { h: '單位', r: (l) => item(l.item_id).unit }, { h: '單價', cls: 'num', r: (l) => money(l.price) }, { h: '金額', cls: 'num', r: (l) => money(l.qty * l.price) }, { h: '已出貨', cls: 'num', r: (l) => num(L.shippedQty(so.id, l.item_id)) }],
        rows: so.lines,
        totals: amountTotals(so.total),
        notes: [so.note, cust(so.customer_id).min_shelf_days ? `客戶要求剩餘效期 ${cust(so.customer_id).min_shelf_days} 天以上` : ''].filter(Boolean),
        signatures: ['業務', '業務主管', '客戶確認'],
      }
    },
  },
  pick_list: {
    label: '揀貨單', module: 'shipping', table: 'shipments',
    build: (id) => {
      const s = get('shipments', id)
      return {
        title: '揀貨單', no: s.no, date: s.date,
        party: partyCustomer(cust(s.customer_id)),
        meta: [['訂單', get('sales_orders', s.sales_order_id)?.no], ['包裝', `${s.pack_mode}　${s.boxes} 箱`], ['貨櫃 / 車號', s.container_no || ''], ['物流', s.carrier || '']],
        columns: [{ h: '儲位', r: (l) => bin(l.bin_id) }, ...itemCols(), { h: '批號', r: (l) => l.lot_no }, { h: '有效日期', r: (l) => lot(l.lot_no).exp_date }, { h: '數量', cls: 'num', r: (l) => num(l.qty) }, { h: '單位', r: (l) => item(l.item_id).unit }, { h: '箱數', cls: 'num', r: (l) => Math.ceil(l.qty / (item(l.item_id).pack_per_box || 1)) }, { h: '揀貨 ✓', r: () => '☐' }],
        rows: [...s.lines].sort((a, b) => bin(a.bin_id).localeCompare(bin(b.bin_id))),
        notes: ['依儲位順序揀貨；先到期先出，請確認批號與單據相符。'],
        signatures: ['揀貨', '覆核', '倉管主管'],
      }
    },
  },
  shipment: {
    label: '出貨單（銷貨單）', module: 'shipping', table: 'shipments',
    build: (id) => {
      const s = get('shipments', id)
      const inv = where('invoices', (i) => i.shipment_id === s.id)[0]
      const amount = L.sum(s.lines, (l) => l.qty * l.price)
      return {
        title: '出貨單（銷貨單）', no: s.no, date: s.date,
        party: { ...partyCustomer(cust(s.customer_id)), lines: [...partyCustomer(cust(s.customer_id)).lines.slice(0, 3), `送貨地址：${s.address || ''}`] },
        meta: [['訂單', get('sales_orders', s.sales_order_id)?.no], ['發票號碼', inv?.gui_no || '（未開立）'], ['包裝 / 箱數', `${s.pack_mode}　${s.boxes} 箱`], ['貨櫃 / 車號', s.container_no || ''], ['物流', s.carrier || '']],
        columns: [...itemCols(), { h: '批號', r: (l) => l.lot_no }, { h: '有效日期', r: (l) => lot(l.lot_no).exp_date }, { h: '數量', cls: 'num', r: (l) => num(l.qty) }, { h: '單位', r: (l) => item(l.item_id).unit }, { h: '單價', cls: 'num', r: (l) => money(l.price) }, { h: '金額', cls: 'num', r: (l) => money(l.qty * l.price) }],
        rows: s.lines,
        totals: amountTotals(amount),
        notes: ['冷凍食品請保存於 -18°C 以下。貨品如有短少或破損，請於簽收時註明。', s.note].filter(Boolean),
        signatures: ['出貨', '司機', '客戶簽收（日期 / 溫度）'],
      }
    },
  },
  requisition: {
    label: '請購單', module: ['purchase', 'wms', 'production'], table: 'requisitions',
    build: (id) => {
      const r = get('requisitions', id)
      return {
        title: '請購單', no: r.no, date: r.date,
        meta: [['請購人', user(r.requester_id)], ['需要日期', r.need_date], ['原因', r.reason], ['狀態', L.REQ_STATUS[L.reqStatus(r)]]],
        columns: [...itemCols(), { h: '請購量', cls: 'num', r: (l) => num(l.qty) }, { h: '單位', r: (l) => item(l.item_id).unit }, { h: '可用庫存', cls: 'num', r: (l) => num(L.stockOf(l.item_id)) }, { h: '備註', r: (l) => l.note }, { h: '採購單', r: (l) => get('purchase_orders', l.purchase_order_id)?.no || '' }],
        rows: r.lines,
        signatures: ['請購人', '部門主管', '採購'],
      }
    },
  },
  purchase_order: {
    label: '採購單', module: 'purchase', table: 'purchase_orders',
    build: (id) => {
      const p = get('purchase_orders', id)
      return {
        title: '採購單', no: p.no, date: p.date,
        party: partySupplier(sup(p.supplier_id)),
        meta: [['交貨日期', p.due_date], ['交貨地點', L.getSetting('company_address')], ['請購單', get('requisitions', p.requisition_id)?.no || ''], ['付款條件', sup(p.supplier_id).terms_days ? `月結 ${sup(p.supplier_id).terms_days} 天` : '']],
        columns: [...itemCols(), { h: '數量', cls: 'num', r: (l) => num(l.qty) }, { h: '單位', r: (l) => item(l.item_id).unit }, { h: '單價', cls: 'num', r: (l) => money(l.price) }, { h: '金額', cls: 'num', r: (l) => money(l.qty * l.price) }, { h: '已交', cls: 'num', r: (l) => num(l.received || 0) }],
        rows: p.lines,
        totals: amountTotals(p.total),
        notes: [p.note, '交貨時請附出廠檢驗報告；冷凍品須以冷凍車配送。請於送貨單註明本採購單號。'].filter(Boolean),
        signatures: ['採購', '主管', '供應商回簽'],
      }
    },
  },
  doc: { label: '庫存單據（進貨／領料／退料／入庫／調整）', module: ['wms', 'production', 'purchase'], build: (no) => moveDoc(no) },
  work_order: {
    label: '製令單（生產工單）', module: 'production', table: 'work_orders',
    build: (id) => {
      const w = get('work_orders', id)
      const p = item(w.product_id)
      const so = get('sales_orders', w.sales_order_id)
      return {
        title: '製令單', no: w.no, date: w.plan_date,
        meta: [['產品', `${p.code} ${p.name}`], ['規格', p.spec], ['預計產量', `${num(w.plan_qty)} ${p.unit}`], ['成品批號', w.lot_no], ['產線', w.line], ['訂單 / 客戶', so ? `${so.no} ${cust(so.customer_id).name}` : '備貨生產'], ['狀態', L.WO_STATUS[w.status]]],
        columns: [...itemCols(), { h: '單位用量', cls: 'num', r: (n) => num((p.bom || []).find((b) => b.item_id === n.item_id)?.qty) }, { h: '應領量', cls: 'num', r: (n) => num(n.qty) }, { h: '單位', r: (n) => item(n.item_id).unit }, { h: '已領', cls: 'num', r: (n) => num(L.woIssued(w, n.item_id) - L.woReturned(w, n.item_id)) }, { h: '投料批號', r: (n) => [...new Set((w.feeds || []).filter((f) => f.item_id === n.item_id).map((f) => f.lot_no))].join('\n') }],
        rows: L.woNeeds(w),
        extra: { title: '生產紀錄（現場填寫）', rows: [['投料開始時間', ''], ['中心溫度（≥75°C）', ''], ['烹煮完成時間', ''], ['實際產量', w.output_qty ? `${num(w.output_qty)} ${p.unit}` : ''], ['損耗', w.waste_qty ? `${num(w.waste_qty)} kg` : ''], ['異常說明', '']] },
        signatures: ['生管', '現場領班', '品管', '廠長'],
      }
    },
  },
  inspection: {
    label: '檢驗單（IQC / FQC）', module: 'qc', table: 'qc_inspections',
    build: (id) => {
      const q = get('qc_inspections', id)
      const l = lot(q.lot_no)
      return {
        title: q.kind === 'IQC' ? '進料檢驗單' : '成品檢驗報告', no: q.no, date: q.date,
        meta: [['品名', `${item(q.item_id).code} ${item(q.item_id).name}`], ['批號', q.lot_no], [q.kind === 'IQC' ? '供應商' : '製令單', q.kind === 'IQC' ? sup(l.supplier_id).name : get('work_orders', q.work_order_id)?.no], ['批量', `${num(l.qty)} ${item(q.item_id).unit}`], ['抽樣數 / 不良數', `${q.sample_size} / ${q.defect_qty}`], ['有效日期', l.exp_date], ['判定', q.result === 'pass' ? '合格' : '不合格']],
        columns: [{ h: '檢驗項目', r: (c) => c.name }, { h: '標準', r: (c) => c.standard }, { h: '實測值', r: (c) => c.value || '' }, { h: '判定', r: (c) => (c.pass === false ? 'NG' : 'OK') }],
        rows: q.checks || [],
        notes: [q.note].filter(Boolean),
        signatures: [`檢驗員 ${q.inspector}`, '品管主管'],
      }
    },
  },
  transfer: {
    label: '調撥單', module: 'wms', table: 'transfers',
    build: (id) => {
      const t = get('transfers', id)
      return {
        title: '調撥單', no: t.no, date: t.date,
        meta: [['調出儲位', bin(t.from_bin_id)], ['調入儲位', bin(t.to_bin_id)], ['原因', t.reason], ['經手人', t.user_name]],
        columns: [...itemCols(), { h: '批號', r: (l) => l.lot_no }, { h: '有效日期', r: (l) => lot(l.lot_no).exp_date }, { h: '數量', cls: 'num', r: (l) => num(l.qty) }, { h: '單位', r: (l) => item(l.item_id).unit }],
        rows: t.lines,
        signatures: ['調出', '調入', '主管'],
      }
    },
  },
  stocktake: {
    label: '盤點表', module: 'wms', table: 'stocktakes',
    build: (id) => {
      const s = get('stocktakes', id)
      const blank = s.status === 'counting'
      return {
        title: '盤點表', no: s.no, date: s.date,
        meta: [['倉庫', get('warehouses', s.warehouse_id)?.name], ['盤點人', s.user_name], ['狀態', blank ? '盤點中' : '已過帳']],
        columns: [{ h: '儲位', r: (l) => bin(l.bin_id) }, ...itemCols(), { h: '批號', r: (l) => l.lot_no }, { h: '單位', r: (l) => item(l.item_id).unit }, { h: '帳面數', cls: 'num', r: (l) => num(l.system_qty) }, { h: '實盤數', cls: 'num write', r: (l) => (blank || l.counted_qty == null ? '' : num(l.counted_qty)) }, { h: '差異', cls: 'num write', r: (l) => (blank || l.counted_qty == null ? '' : num(l.counted_qty - l.system_qty)) }],
        rows: s.lines,
        notes: blank ? ['請在「實盤數」欄填寫實際點數，完成後輸入系統。'] : [],
        signatures: ['初盤', '複盤', '會計監盤', '主管'],
      }
    },
  },
  return: {
    label: '銷退單 / 進退單', module: ['sales', 'purchase'], table: 'returns',
    build: (id) => {
      const r = get('returns', id)
      const isSales = r.kind === 'sales'
      return {
        title: isSales ? '銷貨退回單' : '進貨退出單', no: r.no, date: r.date,
        party: isSales ? partyCustomer(cust(r.customer_id)) : partySupplier(sup(r.supplier_id)),
        meta: [['原出貨單', get('shipments', r.shipment_id)?.no || ''], ['處理方式', { restock: '收回（待處理區）', scrap: '客戶端銷毀', return: '退回供應商' }[r.disposition]], ['原因', r.reason], ['狀態', { pending: '待核准', done: '已完成', rejected: '退回' }[r.status]]],
        columns: [...itemCols(), { h: '批號', r: (l) => l.lot_no }, { h: '數量', cls: 'num', r: (l) => num(l.qty) }, { h: '單位', r: (l) => item(l.item_id).unit }, { h: '單價', cls: 'num', r: (l) => money(l.price) }, { h: '金額', cls: 'num', r: (l) => money(l.qty * l.price) }],
        rows: r.lines,
        totals: [['未稅金額', money(r.amount)], ['營業稅', money(r.tax)], ['合計', money(r.amount + r.tax)]],
        signatures: isSales ? ['業務', '倉管', '品管', '主管'] : ['採購', '倉管', '供應商簽收'],
      }
    },
  },
  invoice: {
    label: '應收帳款單（請款單）', module: 'accounting', table: 'invoices',
    build: (id) => {
      const i = get('invoices', id)
      const s = get('shipments', i.shipment_id)
      return {
        title: '請款單', no: i.no, date: i.date,
        party: partyCustomer(cust(i.customer_id)),
        meta: [['發票號碼', i.gui_no], ['出貨單', s?.no], ['付款期限', i.due_date], ['已收 / 折讓', `${money(i.paid)} / ${money(i.credited)}`], ['未收金額', money(L.invoiceBalance(i))]],
        columns: [...itemCols(), { h: '批號', r: (l) => l.lot_no }, { h: '數量', cls: 'num', r: (l) => num(l.qty - L.returnedQty(s.id, l.item_id, l.lot_no)) }, { h: '單價', cls: 'num', r: (l) => money(l.price) }, { h: '金額', cls: 'num', r: (l) => money((l.qty - L.returnedQty(s.id, l.item_id, l.lot_no)) * l.price) }],
        rows: s?.lines || [],
        totals: [['未稅金額', money(i.amount)], ['營業稅', money(i.tax)], ['含稅合計', money(i.total)]],
        notes: ['請於付款期限前匯款，匯款後請告知帳號後五碼。'],
        signatures: ['會計', '主管'],
      }
    },
  },
  statement: {
    label: '對帳單（客戶 / 供應商）', module: 'accounting',
    // id = customers:<id> 或 suppliers:<id>；params.from / params.to
    build: (key, { from, to } = {}) => {
      const [t, id] = key.split(':')
      const isAR = t === 'customers'
      from ||= L.today().slice(0, 7) + '-01'
      to ||= L.today()
      const docs = (isAR ? where('invoices', (i) => i.customer_id === id) : where('bills', (b) => b.supplier_id === id)).filter((d) => d.date >= from && d.date <= to)
      const pays = where('payments', (p) => p.party_id === id && p.kind === (isAR ? 'in' : 'out') && p.date >= from && p.date <= to)
      const prior = L.sum((isAR ? where('invoices', (i) => i.customer_id === id) : where('bills', (b) => b.supplier_id === id)).filter((d) => d.date < from), (d) => d.total - (d.credited || 0)) -
        L.sum(where('payments', (p) => p.party_id === id && p.kind === (isAR ? 'in' : 'out') && p.date < from), (p) => p.amount)
      const rows = [
        ...docs.map((d) => ({ date: d.date, no: d.no, memo: isAR ? `出貨 ${get('shipments', d.shipment_id)?.no || ''} 發票 ${d.gui_no || ''}` : d.note, add: d.total, less: d.credited || 0 })),
        ...pays.map((p) => ({ date: p.date, no: p.no, memo: `${isAR ? '收款' : '付款'}（${p.method}）`, add: 0, less: p.amount })),
      ].sort((a, b) => (a.date + a.no).localeCompare(b.date + b.no))
      let bal = prior
      for (const r of rows) r.bal = bal = bal + r.add - r.less
      const party = isAR ? cust(id) : sup(id)
      return {
        title: isAR ? '應收對帳單' : '應付對帳單', no: `${party.code || ''}-${to.replace(/-/g, '').slice(0, 6)}`, date: L.today(),
        party: isAR ? partyCustomer(party) : partySupplier(party),
        meta: [['對帳期間', `${from} ～ ${to}`], ['上期餘額', money(prior)], ['本期應' + (isAR ? '收' : '付'), money(L.sum(rows, (r) => r.add))], ['本期' + (isAR ? '收款' : '付款') + ' / 折讓', money(L.sum(rows, (r) => r.less))]],
        columns: [{ h: '日期', r: (r) => r.date }, { h: '單號', r: (r) => r.no }, { h: '摘要', r: (r) => r.memo }, { h: '增加', cls: 'num', r: (r) => (r.add ? money(r.add) : '') }, { h: '減少', cls: 'num', r: (r) => (r.less ? money(r.less) : '') }, { h: '餘額', cls: 'num', r: (r) => money(r.bal) }],
        rows,
        totals: [['期末餘額', money(bal)]],
        notes: isAR ? ['如對帳有誤，請於收到後 7 日內通知，逾期視為無誤。'] : ['請核對後回傳，以便安排付款。'],
        signatures: ['會計', isAR ? '客戶確認' : '供應商確認'],
      }
    },
  },
  payment: {
    label: '收款單 / 付款單', module: 'accounting', table: 'payments',
    build: (id) => {
      const p = get('payments', id)
      const isIn = p.kind === 'in'
      const doc = isIn ? get('invoices', p.invoice_id) : get('bills', p.bill_id)
      return {
        title: isIn ? '收款單' : '付款單', no: p.no, date: p.date,
        party: isIn ? partyCustomer(cust(p.party_id)) : partySupplier(sup(p.party_id)),
        meta: [['方式', p.method], ['沖銷帳款', doc?.no], ['帳款金額', money(doc?.total)], ['備註', p.note || '']],
        columns: [{ h: '摘要', r: (r) => r.memo }, { h: '金額', cls: 'num', r: (r) => money(r.amount) }],
        rows: [{ memo: `${isIn ? '收取' : '支付'} ${doc?.no || ''} 款項`, amount: p.amount }],
        totals: [['合計', money(p.amount)]],
        signatures: ['出納', '會計', '主管'],
      }
    },
  },
  journal: {
    label: '會計傳票', module: 'accounting', table: 'journal',
    build: (id) => {
      const j = get('journal', id)
      return {
        title: '轉帳傳票', no: j.no, date: j.date,
        meta: [['摘要', j.memo], ['來源', j.ref_type || '手動']],
        columns: [{ h: '科目代號', r: (l) => l.account }, { h: '會計科目', r: (l) => L.ACCOUNTS[l.account] }, { h: '借方金額', cls: 'num', r: (l) => (l.debit ? money(l.debit) : '') }, { h: '貸方金額', cls: 'num', r: (l) => (l.credit ? money(l.credit) : '') }],
        rows: j.lines,
        totals: [['借方合計', money(L.sum(j.lines, (l) => l.debit))], ['貸方合計', money(L.sum(j.lines, (l) => l.credit))]],
        signatures: ['製票', '會計', '主管'],
      }
    },
  },
  label: {
    label: '批號標籤 / 外箱標籤', module: ['wms', 'production', 'qc'], layout: 'label',
    build: (lotNo, { copies = 1 } = {}) => {
      const l = lot(lotNo)
      const i = item(l.item_id)
      return {
        title: i.name, no: l.lot_no, layout: 'label', copies: Math.min(100, Math.max(1, Number(copies) || 1)),
        meta: [['品號', i.code], ['規格', i.spec], ['批號', l.lot_no], [l.kind === 'raw' ? '進貨日' : '製造日', l.mfg_date], ['有效日期', l.exp_date], ['保存方式', i.temp_zone === '冷凍' ? '冷凍 -18°C 以下' : i.temp_zone === '冷藏' ? '冷藏 0–7°C' : '常溫、避免日照'], ['數量', i.pack_per_box > 1 ? `${i.pack_per_box} ${i.unit} / 箱` : `${num(l.qty)} ${i.unit}`], ['品管', ({ pass: '合格', pending: '待檢', fail: '不合格', hold: '暫扣' })[l.qc_status]]],
        qr: `LOT:${l.lot_no}`,
        footer: `${L.getSetting('company_name')}　${L.getSetting('company_phone')}`,
      }
    },
  },
  trace: {
    label: '食品追溯報告', module: 'trace',
    build: (lotNo) => {
      const t = L.traceLot(lotNo)
      const i = t.item
      const up = t.kind === 'raw'
        ? [{ a: '供應商', b: `${t.supplier?.name || ''}（${t.supplier?.certs || ''}）`, c: `廠商批號 ${t.lot.supplier_lot || ''}`, d: t.po?.no || '直接進貨' }]
        : t.materials.map((m) => ({ a: item(m.item_id).name, b: m.lot_no, c: `${num(m.qty)} ${item(m.item_id).unit}`, d: `${m.supplier?.name || ''} ${m.lot?.supplier_lot || ''}` }))
      const down = t.recall.map((r) => ({ a: r.customer?.name || '門市非會員', b: [r.customer?.contact, r.customer?.phone].filter(Boolean).join(' '), c: num(r.qty), d: r.docs.join('、') }))
      return {
        title: '食品追溯報告', no: t.lot.lot_no, date: L.today(),
        meta: [['品名', `${i.code} ${i.name}`], ['批號類型', t.kind === 'raw' ? '原料' : '成品'], ['批量', `${num(t.lot.qty)} ${i.unit}`], ['製造 / 進貨日', t.lot.mfg_date], ['有效日期', t.lot.exp_date], ['品管', ({ pass: '合格', pending: '待檢', fail: '不合格', hold: '暫扣' })[t.lot.qc_status]]],
        sections: [
          { title: t.kind === 'raw' ? '上游來源' : '上游：使用的原料批號與供應商', columns: t.kind === 'raw' ? ['來源', '供應商', '批號', '採購單'] : ['原料', '原料批號', '用量', '供應商 / 廠商批號'], rows: up },
          ...(t.kind === 'raw' ? [{ title: '用在哪些成品批號', columns: ['成品批號', '產品', '工單', '投入量'], rows: t.products.map((p) => ({ a: p.lot.lot_no, b: item(p.lot.item_id).name, c: p.wo.no, d: `${num(p.qty)} ${i.unit}` })) }] : []),
          { title: '下游：流向客戶（召回名單）', columns: ['客戶 / 會員', '聯絡方式', '數量', '單據'], rows: down },
          { title: '公司內現存庫存', columns: ['儲位', '品項', '批號', '數量'], rows: [...(t.onHand || []), ...(t.rawOnHand || [])].filter((r) => r.qty > 0).map((r) => ({ a: bin(r.bin_id), b: item(r.item_id).name, c: r.lot_no, d: num(r.qty) })) },
        ],
        signatures: ['品管', '廠長'],
      }
    },
  },
  pos_receipt: {
    label: '門市收據', module: 'pos', table: 'pos_sales', layout: 'receipt',
    build: (id) => {
      const s = get('pos_sales', id)
      return {
        title: L.getSetting('company_name'), no: s.no, date: String(s.at).slice(0, 16).replace('T', ' '), layout: 'receipt',
        meta: [['電子發票', s.gui_no], ['收銀', s.cashier], ['會員', cust(s.customer_id).name || '']],
        columns: [{ h: '品名', r: (l) => item(l.item_id).name }, { h: '數量', cls: 'num', r: (l) => num(l.qty) }, { h: '金額', cls: 'num', r: (l) => money(l.qty * l.price) }],
        rows: s.lines,
        totals: [...(s.discount ? [['折扣', '-' + money(s.discount)]] : []), ['合計', money(s.total)], [s.method, money(s.received)], ...(s.change ? [['找零', money(s.change)]] : []), ...(s.points ? [['本次累積', `${s.points} 點`]] : [])],
        notes: [s.status === 'void' ? '*** 此筆交易已作廢 ***' : '謝謝光臨，冷凍食品請盡快冷凍保存。'],
      }
    },
  },
}

// 表單列印中心用：每一種單據最近的單號
export function recentDocs(type, limit = 30) {
  const f = FORMS[type]
  if (type === 'doc') {
    const seen = new Map()
    for (const m of [...all('stock_moves')].reverse()) if (m.doc_no && /^(RC|MI|MR|MS|AJ|SC|FD)/.test(m.doc_no) && !seen.has(m.doc_no)) seen.set(m.doc_no, { id: m.doc_no, no: m.doc_no, date: m.doc_date, label: L.DOC_TYPES[m.doc_no.replace(/\d.*$/, '')] })
    return [...seen.values()].slice(0, limit)
  }
  if (type === 'label' || type === 'trace') return [...all('lots')].reverse().slice(0, limit).map((l) => ({ id: l.lot_no, no: l.lot_no, date: l.mfg_date, label: item(l.item_id).name }))
  if (type === 'statement')
    return [
      ...where('customers', (c) => c.kind !== 'member').map((c) => ({ id: `customers:${c.id}`, no: c.code, label: `客戶 ${c.name}` })),
      ...all('suppliers').map((s) => ({ id: `suppliers:${s.id}`, no: s.code, label: `供應商 ${s.name}` })),
    ]
  return [...all(f.table)].reverse().slice(0, limit).map((r) => ({ id: r.id, no: r.no, date: r.date || String(r.at || '').slice(0, 10), label: r.customer_id ? cust(r.customer_id).name : r.supplier_id ? sup(r.supplier_id).name : r.memo || '' }))
}

export function buildForm(type, id, params) {
  const f = FORMS[type]
  if (!f) return null
  try {
    return f.build(id, params)
  } catch (e) {
    console.error(e)
    return null
  }
}
