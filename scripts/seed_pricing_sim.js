// 가디어스 단가 시뮬레이터 시드 스크립트
// 사용법: node --env-file=.env.local scripts/seed_pricing_sim.js
// 기존 roles/factors/guides 행을 모두 지우고 11개 직종 데이터로 새로 채운다.
// (스마트연구소 논의 결과: 기존에 남아있던 테스트/임시 데이터는 무시하고 덮어쓰기로 결정됨)

const { createClient } = require('@supabase/supabase-js')

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ROLES = [
  {
    role_code: 'staff', role_name: '행사 진행요원', base_price: 135000, pay_price: 85000, leader_bonus: 35000,
    fixed_costs: [{ l: '현장 매니저 배치비(안분)', a: 8000 }, { l: '영업배상책임보험 상각', a: 3000 }],
    factors: [
      ['야외 행사 (날씨·체력 소모)', 10000, 7000, '★', null],
      ['8시간 초과 연장 근무', 15000, 10500, '★', null],
      ['야간 투입 (22:00 이후)', 20000, 14000, '★', null],
      ['외국어 커뮤니케이션 필요', 30000, 21000, '★', null],
      ['야외+여름 폭염(35도+) — 2인 교대조 필수', 100000, 70000, '★★', '법적 의무'],
      ['식대 미제공', 10000, 7000, '★', null],
      ['지방 파견 (서울 외)', 30000, 21000, '★', null],
    ],
    guide: { consult_points: '가디어스 13~14만원 · 지킴 스탭팀장 16만원 · G360 12~16.5만원', market_avg_price: 133000, competitor_price: 130000 },
  },
  {
    role_code: 'parking', role_name: '주차/발렛요원', base_price: 148000, pay_price: 92000, leader_bonus: 0,
    fixed_costs: [{ l: '현장 매니저 배치비', a: 8000 }, { l: '보험 상각', a: 3000 }],
    factors: [
      ['야외 주차장 (날씨 노출)', 10000, 7000, '★', null],
      ['발렛 파킹 (차량 직접 운전)', 30000, 21000, '★', null],
      ['고급 차량 발렛 (수입차)', 50000, 35000, '★★', '보험 필수'],
      ['야외+여름 폭염 교대조', 100000, 70000, '★★', '법적 의무'],
      ['야간 투입 (22:00 이후)', 20000, 14000, '★', null],
      ['8시간 초과', 15000, 10500, '★', null],
    ],
    guide: { consult_points: '가디어스 14~15.5만원 · 지킴 15만원 · G360 13~18만원', market_avg_price: 148000, competitor_price: 150000 },
  },
  {
    role_code: 'safety', role_name: '안전요원', base_price: 140000, pay_price: 100000, leader_bonus: 0,
    fixed_costs: [{ l: '현장 매니저 배치비', a: 8000 }, { l: '보험 상각', a: 3000 }],
    factors: [
      ['CPR/AED 자격증 보유자 요구', 18000, 12600, '★', null],
      ['야외 행사 배치', 12000, 8400, '★', null],
      ['수상 안전 자격 보유자 (워터파크·해변)', 35000, 24500, '★★', null],
      ['야외+여름 폭염 교대조', 100000, 70000, '★★', '법적 의무'],
      ['군중 통제·신체 제지 포함 → 경비업 해당', 50000, 35000, '★★', '허가 필요'],
      ['야간 투입 (22:00 이후)', 20000, 14000, '★', null],
      ['위험 현장 (집단민원·충돌 예상)', 80000, 56000, '★★', '고위험'],
    ],
    guide: { consult_points: '가디어스 14~16.5만원 · 지킴 14만원 · G360 12.5만원', market_avg_price: 133000, competitor_price: 140000 },
  },
  {
    role_code: 'promoter', role_name: '프로모터', base_price: 180000, pay_price: 115000, leader_bonus: 0,
    fixed_costs: [{ l: '현장 매니저 배치비', a: 8000 }, { l: '보험 상각', a: 3000 }],
    factors: [
      ['외모·이미지 기준 있음', 15000, 10500, '★', null],
      ['판매 멘트·세일즈 스킬 필요', 30000, 21000, '★★', null],
      ['전문 지식 필요 (제품 설명회)', 45000, 31500, '★★', null],
      ['외국어 커뮤니케이션', 40000, 28000, '★★', null],
      ['8시간 초과 / 야간 투입', 20000, 14000, '★', null],
      ['의상 노출 수위 있음 (사전 협의 필수)', 10000, 7000, '★', '협의 필수'],
      ['야외 행사 (폭염 노출)', 12000, 8400, '★', null],
    ],
    guide: { consult_points: '가디어스 16~18만원 · 지킴 18만원 · G360 18~22만원', market_avg_price: 196000, competitor_price: 180000 },
  },
  {
    role_code: 'narrator', role_name: '나레이터', base_price: 220000, pay_price: 135000, leader_bonus: 0,
    fixed_costs: [{ l: '매니저 배치비', a: 5000 }],
    factors: [
      ['경력 3년 이상 또는 A등급', 80000, 56000, '★', null],
      ['메인 무대 (수백 명 이상)', 80000, 56000, '★', null],
      ['대형 모터쇼·IT전시 메인', 300000, 210000, '★★', null],
      ['영어 나레이션 또는 이중언어', 100000, 70000, '★', null],
      ['스크립트 연구·암기 필요 (기술 제품)', 20000, 14000, '★', null],
      ['사전 미팅 필요', 30000, 21000, '★', null],
    ],
    guide: null, // 원본 comp:null
  },
  {
    role_code: 'mascot', role_name: '인형탈 요원', base_price: 390000, pay_price: 240000, leader_bonus: 0,
    fixed_costs: [{ l: '매니저 배치비(2인 안분)', a: 10000 }],
    factors: [
      ['야외 행사 (온도 상승)', 60000, 42000, '★', null],
      ['여름 야외 (체감 35도+)', 120000, 84000, '★★', '열사병 위험'],
      ['퍼포먼스 동작 연기 포함', 40000, 28000, '★', null],
      ['8시간 이상 운용 (추가 교대팀)', 200000, 140000, '★★', '추가 2인'],
      ['냉각 장비비 (여름 야외)', 20000, 14000, '★', null],
    ],
    guide: { consult_points: '가디어스 19~21만원(1인환산) · 지킴 20만원 · G360 18~24만원 · 2인1조 기준 실 청구는 2배', market_avg_price: 205000, competitor_price: 200000 },
  },
  {
    role_code: 'docent', role_name: '도슨트', base_price: 200000, pay_price: 90000, leader_bonus: 0,
    fixed_costs: [{ l: '사전 현장방문비(안분)', a: 5000 }],
    factors: [
      ['스크립트 자체 연구·작성 필요', 30000, 21000, '★', null],
      ['하루 3회 이상 투어 반복', 20000, 14000, '★', null],
      ['전문 분야 지식 (과학·역사·예술)', 35000, 24500, '★', null],
      ['외국어 도슨트 (영어·중국어)', 100000, 70000, '★★', null],
      ['어린이·교육 대상 해설', 15000, 10500, '★', null],
    ],
    guide: { consult_points: '가디어스 20만원 · 지킴 20만원 · G360 20~40만원 · 시장평균이 높은 이유: 대형전시 고급 도슨트 포함', market_avg_price: 267000, competitor_price: 200000 },
  },
  {
    role_code: 'mc', role_name: 'MC (사회자)', base_price: 350000, pay_price: 200000, leader_bonus: 0,
    fixed_costs: [],
    factors: [
      ['100명 이상 기업 행사·컨퍼런스', 150000, 105000, '★', null],
      ['500명 이상 대형 행사·시상식', 400000, 280000, '★★', null],
      ['사전 대본 작성·기획 참여', 50000, 35000, '★', null],
      ['영어 또는 한영 이중 진행', 150000, 105000, '★', null],
      ['리허설 참가 요청', 50000, 35000, '★', null],
      ['특수 분야 (의학·IT 등 전문 행사)', 80000, 56000, '★', null],
    ],
    guide: null, // 원본 comp:null
  },
  {
    role_code: 'protocol', role_name: '의전도우미', base_price: 250000, pay_price: 145000, leader_bonus: 0,
    fixed_costs: [{ l: '현장 매니저 배치비', a: 8000 }, { l: '보험 상각', a: 3000 }],
    factors: [
      ['유니폼·헤어·메이크업 본인 준비', 20000, 14000, '★', null],
      ['외국어 의전 (영어·중국어)', 60000, 42000, '★', null],
      ['외국어 + VIP 수행 의전', 100000, 70000, '★★', null],
      ['8시간 초과 / 야간 투입', 25000, 17500, '★', null],
      ['하이힐 장시간 착용 환경', 10000, 7000, '★', null],
    ],
    guide: { consult_points: '가디어스 25만원 · 지킴 25만원 · G360 20~26만원 · 가디어스는 시장 상단', market_avg_price: 242000, competitor_price: 250000 },
  },
  {
    role_code: 'driver', role_name: '수행기사', base_price: 215000, pay_price: 140000, leader_bonus: 0,
    fixed_costs: [{ l: 'NDA 법무 관리비', a: 5000 }, { l: '보험 상각', a: 3000 }],
    factors: [
      ['대형 SUV·리무진·고급 외제차', 30000, 21000, '★', null],
      ['10시간 초과 (시간당 추가)', 15000, 10500, '★', null],
      ['1박 2일 이상 장거리 수행', 100000, 70000, '★★', null],
      ['새벽 출발 또는 야간 귀착', 40000, 28000, '★', null],
      ['외국어 커뮤니케이션', 40000, 28000, '★', null],
      ['VIP 보안 수행 (경호 성격 포함)', 80000, 56000, '★★', null],
    ],
    guide: { consult_points: '가디어스 25만원(8H) · G360 수행경호 25~35만원 · 수행기사 단독 공개 데이터 제한적', market_avg_price: 270000, competitor_price: null },
  },
  {
    role_code: 'guard', role_name: '경호원', base_price: 200000, pay_price: 130000, leader_bonus: 0,
    fixed_costs: [{ l: '현장 매니저 배치비', a: 10000 }, { l: '영업배상책임보험', a: 5000 }, { l: 'NDA 법무비', a: 5000 }],
    factors: [
      ['신변보호(개인 경호)', 40000, 28000, '★', '배치 전 신고 필수'],
      ['위험도 B등급(협박·분쟁 이력)', 40000, 28000, '★', null],
      ['위험도 A등급(실질적 위협)', 90000, 63000, '★★', null],
      ['정장 착용 요구(VIP 의전 성격)', 15000, 10500, '★', null],
      ['야간·새벽 투입', 25000, 17500, '★', null],
      ['집단민원현장(충돌 예상)', 100000, 70000, '★★', '48H전 허가'],
      ['배치신고 행정 처리(모든 경호 발생)', 20000, 14000, '기본', null],
      ['결격사유 조회·관리', 5000, 3500, '기본', null],
      ['신임교육 이수 확인·상각', 3000, 2100, '기본', null],
    ],
    guide: { consult_points: '가디어스 18~22만원 · 지킴 신변보호 22만원 · G360 18~30만원 · 수행경호: 지킴 25만원', market_avg_price: 200000, competitor_price: 220000 },
  },
]

async function run() {
  console.log('=== 기존 데이터 삭제 ===')
  for (const table of ['factors', 'guides', 'roles']) {
    const { error, count } = await sb.from(table).delete({ count: 'exact' }).not('id', 'is', null)
    if (error) { console.error(`${table} 삭제 실패:`, error.message); process.exit(1) }
    console.log(`${table}: ${count}행 삭제`)
  }

  console.log('=== 11개 직종 시드 삽입 ===')
  for (const job of ROLES) {
    const { data: roleRows, error: roleErr } = await sb.from('roles').insert({
      role_code: job.role_code,
      role_name: job.role_name,
      base_price: job.base_price,
      pay_price: job.pay_price,
      leader_bonus: job.leader_bonus,
      fixed_costs: job.fixed_costs,
      is_published: false,
    }).select()
    if (roleErr) { console.error(`${job.role_code} role 삽입 실패:`, roleErr.message); process.exit(1) }
    const roleId = roleRows[0].id

    const factorRows = job.factors.map(([factor_name, add_price, add_pay_price, level, alert]) => ({
      role_id: roleId, factor_name, add_price, add_pay_price, level, alert,
    }))
    const { error: factorErr } = await sb.from('factors').insert(factorRows)
    if (factorErr) { console.error(`${job.role_code} factors 삽입 실패:`, factorErr.message); process.exit(1) }

    if (job.guide) {
      const { error: guideErr } = await sb.from('guides').insert({ role_id: roleId, ...job.guide })
      if (guideErr) { console.error(`${job.role_code} guide 삽입 실패:`, guideErr.message); process.exit(1) }
    }

    console.log(`✓ ${job.role_name} (${job.role_code}) — factors ${factorRows.length}개${job.guide ? ' + guide' : ''}`)
  }

  console.log('=== 완료 ===')
}

run().catch(e => { console.error(e); process.exit(1) })
