// 資料表定義：本機儲存與 Supabase 共用這一份。
// 欄位型別只用於產生 Supabase SQL（scripts/gen-schema.mjs、開發者頁面）。
// 每張表都自動有 id (text pk)、created_at、updated_at。
// 欄位名稱以 _id 結尾者是關聯（外鍵），REFS 列出對應的表，供關聯圖與檢查使用。

export const SCHEMA = {
  // ---------- 系統 / 權限 ----------
  roles: { label: '角色與權限', group: '系統', cols: { name: 'text', perms: 'jsonb', note: 'text' } },
  users: { label: '使用者', group: '系統', cols: { name: 'text', role_id: 'text', pin: 'text', active: 'boolean', phone: 'text' } },
  settings: { label: '系統設定', group: '系統', cols: { key: 'text', value: 'jsonb' } },
  approvals: {
    label: '簽核',
    group: '系統',
    cols: {
      no: 'text', type: 'text', module: 'text', ref_table: 'text', ref_id: 'text', summary: 'text', amount: 'numeric', reason: 'text',
      payload: 'jsonb', status: 'text', requested_by: 'text', decided_by: 'text', decided_at: 'timestamptz', decision_note: 'text',
    },
  },
  notify_contacts: {
    label: '通知綁定（LINE / Telegram）',
    group: '通知',
    cols: {
      channel: 'text', external_id: 'text', display_name: 'text', picture_url: 'text', state: 'text', status: 'text',
      requested_role_id: 'text', requested_name: 'text', user_id: 'text', muted: 'boolean', approved_by: 'text', approved_at: 'timestamptz', note: 'text',
    },
  },
  notifications: {
    label: '通知發送紀錄',
    group: '通知',
    cols: {
      event: 'text', title: 'text', body: 'text', link: 'text', user_ids: 'jsonb', contact_ids: 'jsonb', status: 'text', results: 'jsonb', sent_at: 'timestamptz',
    },
  },
  audit_log: { label: '操作紀錄', group: '系統', cols: { at: 'timestamptz', user_name: 'text', action: 'text', table_name: 'text', row_id: 'text', summary: 'text' } },

  // ---------- 主檔 ----------
  items: {
    label: '品項（原料/包材/成品）',
    group: '主檔',
    cols: {
      code: 'text', name: 'text', type: 'text', unit: 'text', spec: 'text', barcode: 'text',
      alt_unit: 'text', alt_factor: 'numeric', price: 'numeric', min_price: 'numeric', cost: 'numeric',
      safety_stock: 'numeric', pack_per_box: 'numeric', shelf_days: 'integer', temp_zone: 'text', default_bin_id: 'text',
      iqc_required: 'boolean', pos_enabled: 'boolean', pos_price: 'numeric', bom: 'jsonb', active: 'boolean',
    },
  },
  warehouses: { label: '倉庫', group: '倉儲', cols: { code: 'text', name: 'text', kind: 'text', temp_zone: 'text', note: 'text' } },
  bins: { label: '儲位', group: '倉儲', cols: { code: 'text', warehouse_id: 'text', name: 'text', capacity: 'numeric', active: 'boolean' } },

  // ---------- CRM ----------
  customers: {
    label: '客戶 / 會員',
    group: 'CRM',
    cols: {
      code: 'text', name: 'text', kind: 'text', level: 'text', status: 'text', contact: 'text', phone: 'text', email: 'text',
      address: 'text', tax_id: 'text', terms_days: 'integer', credit_limit: 'numeric', min_shelf_days: 'integer',
      price_list_id: 'text', owner_id: 'text', source: 'text', tags: 'text', contacts: 'jsonb', points: 'numeric', note: 'text',
    },
  },
  price_lists: { label: '價格表', group: 'CRM', cols: { name: 'text', lines: 'jsonb', note: 'text' } },
  activities: {
    label: '客戶互動紀錄',
    group: 'CRM',
    cols: { customer_id: 'text', opportunity_id: 'text', type: 'text', date: 'date', summary: 'text', next_action: 'text', next_date: 'date', done: 'boolean', user_id: 'text' },
  },
  opportunities: {
    label: '商機',
    group: 'CRM',
    cols: { customer_id: 'text', title: 'text', stage: 'text', amount: 'numeric', probability: 'numeric', expected_date: 'date', owner_id: 'text', lost_reason: 'text', note: 'text' },
  },
  quotations: {
    label: '報價單',
    group: 'CRM',
    cols: { no: 'text', customer_id: 'text', opportunity_id: 'text', sales_order_id: 'text', date: 'date', valid_until: 'date', status: 'text', lines: 'jsonb', total: 'numeric', note: 'text' },
  },

  // ---------- 供應鏈 ----------
  suppliers: {
    label: '供應商',
    group: '採購',
    cols: { code: 'text', name: 'text', contact: 'text', phone: 'text', address: 'text', tax_id: 'text', terms_days: 'integer', certs: 'text', rating: 'text', note: 'text' },
  },
  sales_orders: {
    label: '銷售訂單',
    group: '銷售',
    cols: { no: 'text', customer_id: 'text', quotation_id: 'text', date: 'date', due_date: 'date', status: 'text', lines: 'jsonb', total: 'numeric', approved_total: 'numeric', note: 'text' },
  },
  purchase_orders: {
    label: '採購單',
    group: '採購',
    cols: { no: 'text', supplier_id: 'text', sales_order_id: 'text', date: 'date', due_date: 'date', status: 'text', lines: 'jsonb', total: 'numeric', approved_total: 'numeric', note: 'text' },
  },
  work_orders: {
    label: '生產工單',
    group: '生產',
    cols: {
      no: 'text', sales_order_id: 'text', product_id: 'text', plan_qty: 'numeric', plan_date: 'date', line: 'text', status: 'text', lot_no: 'text',
      feeds: 'jsonb', output_qty: 'numeric', waste_qty: 'numeric', std_cost: 'numeric', start_at: 'timestamptz', end_at: 'timestamptz', note: 'text',
    },
  },
  lots: {
    label: '批號（原料/成品）',
    group: '倉儲',
    cols: {
      lot_no: 'text', kind: 'text', item_id: 'text', supplier_id: 'text', supplier_lot: 'text', purchase_order_id: 'text', work_order_id: 'text',
      qty: 'numeric', unit_cost: 'numeric', qc_status: 'text', mfg_date: 'date', exp_date: 'date', note: 'text',
    },
  },
  stock_moves: {
    label: '庫存異動',
    group: '倉儲',
    cols: {
      date: 'timestamptz', doc_date: 'date', item_id: 'text', lot_no: 'text', bin_id: 'text', from_bin_id: 'text', qty: 'numeric', type: 'text',
      unit_cost: 'numeric', ref_type: 'text', ref_id: 'text', note: 'text', user_name: 'text',
    },
  },
  transfers: {
    label: '調撥單',
    group: '倉儲',
    cols: { no: 'text', date: 'date', from_bin_id: 'text', to_bin_id: 'text', lines: 'jsonb', reason: 'text', user_name: 'text' },
  },
  stocktakes: {
    label: '盤點單',
    group: '倉儲',
    cols: { no: 'text', date: 'date', warehouse_id: 'text', status: 'text', lines: 'jsonb', note: 'text', user_name: 'text' },
  },
  qc_inspections: {
    label: 'QC 檢驗',
    group: '品管',
    cols: {
      no: 'text', kind: 'text', lot_no: 'text', item_id: 'text', work_order_id: 'text', date: 'date',
      sample_size: 'numeric', defect_qty: 'numeric', checks: 'jsonb', result: 'text', inspector: 'text', note: 'text',
    },
  },
  shipments: {
    label: '出貨單',
    group: '出貨',
    cols: {
      no: 'text', sales_order_id: 'text', customer_id: 'text', date: 'date', lines: 'jsonb', boxes: 'numeric',
      pack_mode: 'text', container_no: 'text', carrier: 'text', address: 'text', status: 'text', note: 'text',
    },
  },
  returns: {
    label: '退貨單',
    group: '銷售',
    cols: {
      no: 'text', kind: 'text', customer_id: 'text', supplier_id: 'text', shipment_id: 'text', invoice_id: 'text', bill_id: 'text',
      date: 'date', lines: 'jsonb', disposition: 'text', reason: 'text', amount: 'numeric', tax: 'numeric', status: 'text',
    },
  },

  // ---------- POS ----------
  pos_shifts: {
    label: 'POS 班別',
    group: 'POS',
    cols: {
      no: 'text', bin_id: 'text', opened_by: 'text', opened_at: 'timestamptz', opening_cash: 'numeric', closed_by: 'text', closed_at: 'timestamptz',
      expected_cash: 'numeric', counted_cash: 'numeric', diff: 'numeric', status: 'text', note: 'text',
    },
  },
  pos_sales: {
    label: 'POS 銷售',
    group: 'POS',
    cols: {
      no: 'text', gui_no: 'text', shift_id: 'text', customer_id: 'text', date: 'date', at: 'timestamptz', lines: 'jsonb', discount: 'numeric',
      total: 'numeric', tax: 'numeric', method: 'text', received: 'numeric', change: 'numeric', points: 'numeric', cashier: 'text', status: 'text',
    },
  },

  // ---------- 會計 ----------
  invoices: {
    label: '應收（發票）',
    group: '會計',
    cols: {
      no: 'text', gui_no: 'text', customer_id: 'text', sales_order_id: 'text', shipment_id: 'text', date: 'date', due_date: 'date',
      amount: 'numeric', tax: 'numeric', total: 'numeric', paid: 'numeric', credited: 'numeric', status: 'text',
    },
  },
  bills: {
    label: '應付（進貨帳款）',
    group: '會計',
    cols: {
      no: 'text', supplier_id: 'text', purchase_order_id: 'text', date: 'date', due_date: 'date',
      amount: 'numeric', tax: 'numeric', total: 'numeric', paid: 'numeric', credited: 'numeric', status: 'text', note: 'text',
    },
  },
  payments: {
    label: '收付款',
    group: '會計',
    cols: { no: 'text', kind: 'text', invoice_id: 'text', bill_id: 'text', party_id: 'text', date: 'date', amount: 'numeric', method: 'text', note: 'text' },
  },
  journal: { label: '會計傳票', group: '會計', cols: { no: 'text', date: 'date', memo: 'text', lines: 'jsonb', ref_type: 'text', ref_id: 'text' } },
}

export const TABLES = Object.keys(SCHEMA)

// 關聯（外鍵）對照：欄位名 → 指向的表
export const REFS = {
  role_id: 'roles', customer_id: 'customers', supplier_id: 'suppliers', item_id: 'items', product_id: 'items',
  sales_order_id: 'sales_orders', purchase_order_id: 'purchase_orders', work_order_id: 'work_orders', quotation_id: 'quotations',
  opportunity_id: 'opportunities', shipment_id: 'shipments', invoice_id: 'invoices', bill_id: 'bills', warehouse_id: 'warehouses',
  bin_id: 'bins', default_bin_id: 'bins', from_bin_id: 'bins', to_bin_id: 'bins', price_list_id: 'price_lists', owner_id: 'users',
  user_id: 'users', shift_id: 'pos_shifts', requested_role_id: 'roles', approved_by: 'users',
}

export function schemaSQL() {
  const out = ['-- 食品工廠 ERP：Supabase / Postgres schema（由 src/db/schema.js 產生）', '']
  for (const [t, def] of Object.entries(SCHEMA)) {
    const cols = Object.entries(def.cols).map(([c, type]) => `  ${c} ${type}`)
    out.push(
      `-- ${def.label}`,
      `create table if not exists public.${t} (`,
      `  id text primary key,`,
      ...cols.map((c) => c + ','),
      `  created_at timestamptz default now(),`,
      `  updated_at timestamptz default now()`,
      `);`,
    )
    for (const c of Object.keys(def.cols)) if (REFS[c]) out.push(`create index if not exists ${t}_${c}_idx on public.${t} (${c});`)
    if (t === 'notify_contacts') out.push(`create unique index if not exists notify_contacts_channel_ext_idx on public.${t} (channel, external_id);`)
    if (t === 'notifications') out.push(`create index if not exists notifications_status_idx on public.${t} (status, created_at);`)
    out.push(
      `alter table public.${t} enable row level security;`,
      `-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。`,
      `drop policy if exists "${t}_all" on public.${t};`,
      `create policy "${t}_all" on public.${t} for all using (true) with check (true);`,
      '',
    )
  }
  return out.join('\n')
}
