// roles/factors/guides -> sim_roles/sim_factors/sim_guides로 id를 유지하며 복사
// 사용법: node --env-file=.env.local scripts/migrate_to_sim_tables.js
// 원본 roles/factors/guides는 건드리지 않는다 (EstimateBuilder는 계속 그 데이터를 그대로 씀)

const { createClient } = require('@supabase/supabase-js')

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function copyTable(from, to, mapRow) {
  const { data, error } = await sb.from(from).select('*')
  if (error) { console.error(`${from} 조회 실패:`, error.message); process.exit(1) }
  if (data.length === 0) { console.log(`${from}: 복사할 행 없음`); return }
  const rows = data.map(mapRow)
  const { error: insertErr } = await sb.from(to).insert(rows)
  if (insertErr) { console.error(`${to} 삽입 실패:`, insertErr.message); process.exit(1) }
  console.log(`${from} -> ${to}: ${rows.length}행 복사`)
}

async function run() {
  await copyTable('roles', 'sim_roles', r => ({
    id: r.id, role_code: r.role_code, role_name: r.role_name,
    base_price: r.base_price, pay_price: r.pay_price, leader_bonus: r.leader_bonus,
    fixed_costs: r.fixed_costs ?? [], is_published: r.is_published ?? false,
    base_hours: r.base_hours ?? 8, overtime_hourly: r.overtime_hourly ?? 0,
    mgmt_rate: r.mgmt_rate ?? 0.06, profit_rate: r.profit_rate ?? 0.10,
  }))

  await copyTable('factors', 'sim_factors', f => ({
    id: f.id, role_id: f.role_id, factor_name: f.factor_name, description: f.description ?? null,
    add_price: f.add_price, add_pay_price: f.add_pay_price,
    level: f.level ?? '기본', alert: f.alert ?? null,
    rule_type: f.rule_type ?? 'flat', rule_params: f.rule_params ?? {},
  }))

  await copyTable('guides', 'sim_guides', g => ({
    id: g.id, role_id: g.role_id, consult_points: g.consult_points ?? null,
    market_avg_price: g.market_avg_price ?? null, competitor_price: g.competitor_price ?? null,
    past_contract_price: g.past_contract_price ?? null,
    label: g.label ?? null, price: g.price ?? null, surveyed_at: g.surveyed_at ?? null,
  }))

  console.log('=== 완료 ===')
}

run().catch(e => { console.error(e); process.exit(1) })
