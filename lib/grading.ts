// 크루 등급·상태 규칙 — 총괄기획서 v2.0 ①④
// ─────────────────────────────────────────────────────────
// 담당자 머릿속에만 있던 "누가 S급이고 요즘 누가 안 나오는지"를 숫자로 옮긴 것.
// 새로 입력받는 값은 없다. 이미 쌓인 평가 점수와 배정 이력에서 계산만 한다.
//
// ★ 규칙은 여기 한 곳에만 둔다. 화면마다 등급 기준이 다르면 실무자가 신뢰를 잃는다.
//   (돈 계산을 lib/finance.ts 한 곳으로 모은 것과 같은 이유)

export type Grade = 'S' | 'A' | 'B' | 'C' | 'X' | '미분류'
export type PoolStatus = '활성' | '잠재' | '관찰' | '비활성'

/** 이 횟수를 채우기 전에는 등급을 매기지 않는다.
 *  한두 번 나온 신입에게 점수 몇 개로 S나 X를 매기면 억울하다. */
export const MIN_WORKS_FOR_GRADE = 3

/** 마지막 투입이 이 개월을 넘기면 '잠재'로 본다 */
export const DORMANT_MONTHS = 6

export const GRADE_DESC: Record<Grade, string> = {
  S: '핵심 인력 — VIP·대형 행사 최우선',
  A: '우수 인력 — 대부분의 행사를 안정적으로',
  B: '일반 인력 — 소규모·단순 행사, 성장 가능',
  C: '관찰 인력 — 재투입 전 확인 필요',
  X: '투입 불가 — 배정 자동 제외',
  '미분류': '수습 — 아직 데이터가 얇아 등급 보류',
}

export const STATUS_DESC: Record<PoolStatus, string> = {
  '활성': `최근 ${DORMANT_MONTHS}개월 안에 투입 — 바로 배정 가능`,
  '잠재': `${DORMANT_MONTHS}개월 넘게 투입 없음 — 다시 연락해볼 대상`,
  '관찰': '점수가 낮거나 현장 이슈가 있던 사람 — 재투입 전 확인',
  '비활성': '본인 중단 또는 배정 제외 대상',
}

/** 평점(5점 만점)을 등급으로 번역한다. 근무 횟수가 얕으면 매기지 않는다. */
export function gradeOf(totalScore: number | null | undefined, workCount: number): Grade {
  const s = totalScore || 0
  if (workCount < MIN_WORKS_FOR_GRADE || s <= 0) return '미분류'
  if (s >= 4.5) return 'S'
  if (s >= 3.8) return 'A'
  if (s >= 3.0) return 'B'
  if (s >= 2.0) return 'C'
  return 'X'
}

export interface StatusInput {
  grade: Grade
  /** 마지막으로 일한 날 (YYYY-MM-DD). 없으면 투입 이력 없음 */
  lastWorkDate?: string
  /** 크루 카드의 추천 등급 (사람이 직접 매긴 값) */
  recommend?: string | null
  /** 평가에서 '재추천 아니오'를 받은 적이 있는지 */
  hasNegativeEval?: boolean
  /** 오늘 (테스트를 위해 주입 가능) */
  today?: string
}

/** 지금 이 사람을 부를 수 있는지. 등급(실력)과는 다른 축이다. */
export function statusOf(input: StatusInput): PoolStatus {
  const { grade, lastWorkDate, recommend, hasNegativeEval } = input

  // 사람이 직접 '보류'를 찍었거나 등급이 X면 부르지 않는다
  if (grade === 'X' || recommend === '보류') return '비활성'
  if (grade === 'C' || hasNegativeEval) return '관찰'
  if (!lastWorkDate) return '잠재'

  const today = input.today || new Date().toISOString().slice(0, 10)
  const cutoff = new Date(today)
  cutoff.setMonth(cutoff.getMonth() - DORMANT_MONTHS)
  return lastWorkDate >= cutoff.toISOString().slice(0, 10) ? '활성' : '잠재'
}

/** 배정 후보로 올려도 되는 상태인지 */
export function isAssignable(status: PoolStatus): boolean {
  return status === '활성' || status === '잠재'
}
