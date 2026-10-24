// 資料表定義：本機儲存與 Supabase 共用這一份。
// 欄位型別只用於產生 Supabase SQL（scripts/gen-schema.mjs、開發者頁面）。
// 每張表都自動有 id (text pk)、created_at、updated_at。

export const SCHEMA = {
  users: { label: '使用者', cols: { name: 'text', role: 'text', pin: 'text', active: 'boolean' } },
  items: {
    label: '品項（原料/包材/成品）',
    cols: {
      code: 'text', name: 'text', type: 'text', unit: 'text', spec: 'text',
      price: 'numeric', cost: 'numeric', safety_stock: 'numeric', pack_per_box: 'numeric',
      shelf_days: 'integer', bom: 'jsonb', active: 'boolean',
    },
  },
  customers: {
    label: '客戶',
    cols: { code: 'text', name: 'text', contact: 'text', phone: 'text', address: 'text', tax_id: 'text', terms_days: 'integer', note: 'text' },
  },
  suppliers: {
    label: '供應商',
    cols: { code: 'text', name: 'text', contact: 'text', phone: 'text', address: 'text', tax_id: 'text', terms_days: 'integer', note: 'text' },
  },
  sales_orders: {
    label: '銷售訂單',
    cols: { no: 'text', customer_id: 'text', date: 'date', due_date: 'date', status: 'text', lines: 'jsonb', total: 'numeric', note: 'text' },
  },
  purchase_orders: {
    label: '採購單',
    cols: { no: 'text', supplier_id: 'text', sales_order_id: 'text', date: 'date', due_date: 'date', status: 'text', lines: 'jsonb', total: 'numeric', note: 'text' },
  },
  work_orders: {
    label: '生產工單',
    cols: {
      no: 'text', sales_order_id: 'text', product_id: 'text', plan_qty: 'numeric', status: 'text', lot_no: 'text',
      feeds: 'jsonb', output_qty: 'numeric', waste_qty: 'numeric', start_at: 'timestamptz', end_at: 'timestamptz', note: 'text',
    },
  },
  lots: {
    label: '批號',
    cols: { lot_no: 'text', item_id: 'text', work_order_id: 'text', qty: 'numeric', unit_cost: 'numeric', qc_status: 'text', mfg_date: 'date', exp_date: 'date' },
  },
  stock_moves: {
    label: '庫存異動',
    cols: {
      date: 'timestamptz', item_id: 'text', qty: 'numeric', loc: 'text', type: 'text', lot_no: 'text',
      unit_cost: 'numeric', ref_type: 'text', ref_id: 'text', note: 'text', user_name: 'text',
    },
  },
  qc_inspections: {
    label: 'QC 檢驗',
    cols: {
      no: 'text', kind: 'text', lot_no: 'text', item_id: 'text', work_order_id: 'text', date: 'date',
      sample_size: 'numeric', defect_qty: 'numeric', checks: 'jsonb', result: 'text', inspector: 'text', note: 'text',
    },
  },
  shipments: {
    label: '出貨單',
    cols: {
      no: 'text', sales_order_id: 'text', customer_id: 'text', date: 'date', lines: 'jsonb', boxes: 'numeric',
      pack_mode: 'text', container_no: 'text', carrier: 'text', address: 'text', status: 'text', note: 'text',
    },
  },
  invoices: {
    label: '應收（發票）',
    cols: {
      no: 'text', customer_id: 'text', sales_order_id: 'text', shipment_id: 'text', date: 'date', due_date: 'date',
      amount: 'numeric', tax: 'numeric', total: 'numeric', paid: 'numeric', status: 'text',
    },
  },
  bills: {
    label: '應付（進貨帳款）',
    cols: {
      no: 'text', supplier_id: 'text', purchase_order_id: 'text', date: 'date', due_date: 'date',
      amount: 'numeric', tax: 'numeric', total: 'numeric', paid: 'numeric', status: 'text', note: 'text',
    },
  },
  payments: {
    label: '收付款',
    cols: { no: 'text', kind: 'text', invoice_id: 'text', bill_id: 'text', party_id: 'text', date: 'date', amount: 'numeric', method: 'text', note: 'text' },
  },
  journal: {
    label: '會計傳票',
    cols: { no: 'text', date: 'date', memo: 'text', lines: 'jsonb', ref_type: 'text', ref_id: 'text' },
  },
  audit_log: {
    label: '操作紀錄',
    cols: { at: 'timestamptz', user_name: 'text', action: 'text', table_name: 'text', row_id: 'text', summary: 'text' },
  },
}

export const TABLES = Object.keys(SCHEMA)

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
      `alter table public.${t} enable row level security;`,
      `-- 試用階段：允許匿名讀寫。正式上線前請改成依登入使用者的 policy。`,
      `drop policy if exists "${t}_all" on public.${t};`,
      `create policy "${t}_all" on public.${t} for all using (true) with check (true);`,
      '',
    )
  }
  return out.join('\n')
}
