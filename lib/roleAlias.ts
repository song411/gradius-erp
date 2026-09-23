// 사람이 부르는 이름 ↔ 단가표 이름
// ─────────────────────────────────────────────────────────
// 단가표(roles)에는 11개 이름뿐인데, 실제 문의·견적에는 훨씬 많은 말이 온다.
// '행사스탭' 은 단가표에 없지만 견적에 54번, 문의에 30번 쓰였다. '신변보호'·'야간경비'·
// '법정동행' 도 다 경호원이다. 매번 "단가표에 없는데 어느 것인가요" 하고 되묻는 것은
// ERP 가 할 일이 아니다 — 한 번 정해두면 다시 묻지 않는다.
//
// ★ 여기 적는 것은 '같은 일을 다르게 부르는 말' 뿐이다.
//   값이 다른 별개 직무(경비지도사 같은)를 억지로 끌어다 붙이면 단가가 틀어진다.
//   그런 것은 단가표에 새로 추가하거나, 과거 실적으로 값을 잡는다.

/** 단가표 이름 → 그 직무를 가리키는 다른 말들 (실제 데이터에서 뽑았다) */
export const ROLE_ALIASES: Record<string, string[]> = {
  '행사 진행요원': [
    '행사스탭', '행사 스탭', '행사스태프', '진행스탭', '진행 스탭', '진행요원',
    '스탭', '스태프', '세팅스탭', '증원스탭', '행사팀원', '리셉션',
    '안내데스크', '안내데스크 스탭', '안내요원', '안내', '행사도우미',
  ],
  '경호원': [
    '신변보호', '개인신변보호', '수행경호', '수행경호원', '행사경호', '행사 경호원',
    '야간경비', '시설경비', '법정동행', '결혼식 경호', '경호', 'vip경호', 'vip 수행경호',
    'vip 수행', '신변경호', '경호요원',
  ],
  '안전요원': [
    '동선안내', '동선 안내', '동선안내 및 통제', '통제', '질서유지', '안전관리', '안전',
  ],
  '주차/발렛요원': ['주차요원', '주차관리', '주차', '발렛', '발렛파킹', '발렛요원'],
  '프로모터': ['판촉스탭', '판촉 프로모터', '판촉', '프로모션', '홍보스탭'],
  '나레이터': ['여성 나레이터', '나레이션', '내레이터'],
  '인형탈 요원': ['인형탈', '마스코트', '탈인형'],
  'MC (사회자)': ['mc', 'mc/진행', '사회자', '레크레이션 mc', '엠씨', '진행mc'],
  '의전도우미': ['의전', '의전요원', '안내도우미', '도우미'],
  '수행기사': ['기사', '운전기사', '수행 기사', '드라이버'],
  '도슨트': ['해설사', '전시해설'],
}

/** 이름을 맞대보기 좋게 다듬는다.
 *
 *  띄어쓰기·가운뎃점 차이를 없애고, **괄호와 대괄호 안은 통째로 버린다.**
 *  실제 견적에는 '주차요원(01/25 (일))', '경호원[개인신변보호]' 처럼 줄바꿈과
 *  날짜나 꼬리표가 이름에 붙어 있어, 그대로 세면 같은 직무가 조각조각 흩어진다. */
export function normRole(s?: string | null): string {
  return (s || '')
    .replace(/\([^)]*\)/g, ' ')      // (01/25 (일)) 같은 꼬리표
    .replace(/\[[^\]]*\]/g, ' ')     // [개인신변보호], [지원]
    .toLowerCase()
    .replace(/[\s·・\-_/]/g, '')
}

/** 별칭 → 단가표 이름. 한 번만 만들어 둔다 */
const LOOKUP: Map<string, string> = (() => {
  const m = new Map<string, string>()
  for (const [canon, aliases] of Object.entries(ROLE_ALIASES)) {
    m.set(normRole(canon), canon)
    for (const a of aliases) m.set(normRole(a), canon)
  }
  return m
})()

/** 사람이 쓴 말을 단가표 이름으로 바꾼다.
 *  바꿨으면 어떤 말을 무엇으로 봤는지 함께 돌려준다 — 사람이 확인할 수 있어야 한다. */
export function resolveRoleName(input?: string | null): { name?: string; renamedFrom?: string } {
  const q = normRole(input)
  if (!q) return {}

  const exact = LOOKUP.get(q)
  if (exact) {
    return normRole(exact) === q ? { name: exact } : { name: exact, renamedFrom: (input || '').trim() }
  }

  // '안내데스크 스탭', 'VIP주차요원' 처럼 말이 붙어 온 경우.
  // 긴 별칭이 먼저고, 길이가 같으면 앞에 나온 쪽이 이긴다 —
  // '주차스탭' 은 '주차' 가 앞에 있으니 주차요원이지 행사스탭이 아니다.
  const hit = [...LOOKUP.entries()]
    .filter(([alias]) => alias.length >= 2 && q.includes(alias))
    .sort((a, b) => (b[0].length - a[0].length) || (q.indexOf(a[0]) - q.indexOf(b[0])))[0]
  if (hit) return { name: hit[1], renamedFrom: (input || '').trim() }

  return {}
}

/** 이 이름을 대표 이름으로 옮긴다. 별칭이 없으면 다듬은 제 이름 그대로.
 *  과거 사례를 셀 때 '행사스탭'·'진행요원'·'세팅스탭' 을 한 덩어리로 묶기 위한 것. */
export function canonRoleKey(name?: string | null): string {
  const hit = resolveRoleName(name)
  return normRole(hit.name ?? name)
}
