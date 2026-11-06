// 크루 평가 저장 규칙 — 한 곳
// ─────────────────────────────────────────────────────────
// 평가는 배정 한 건에 하나. 다섯 항목(0.5~5점, 0.5 단위) 평균이 평점, 평점으로 우수/보통/미흡.
// 저장하면 그 크루의 누적 평점(staff.*_score)을 모든 평가의 평균으로 다시 계산한다.
// 이 평점이 등급(lib/grading.ts)과 가디의 인력 추천에 바로 쓰인다.
//
// ★ 출석부(PC)와 오늘 현장(휴대폰)이 같은 함수를 쓴다. 화면마다 따로 계산하면
//   같은 사람 평점이 화면에 따라 달라진다 — 돈을 lib/finance.ts 한 곳에 모은 것과 같은 이유.

import { db } from '@/lib/supabase/api'
import type { Evaluation, EvalGrade, Staff } from '@/lib/supabase/types'

/** 점수는 0.5 단위(0.5~5). 화면이 어디든 이 함수로 맞춘다 — 3.7 같은 값이 섞이면 평균·등급이 흔들린다 */
export const SCORE_MIN = 0.5
export const SCORE_MAX = 5
export function snapHalf(n: number): number {
  if (!Number.isFinite(n)) return SCORE_MIN
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(n * 2) / 2))
}
/** '전부 몇 점' 한 번에 깔 때 보여 주는 단계 */
export const QUICK_SCORES = [3, 3.5, 4, 4.5, 5] as const

// 다섯 항목 — 짧은 이름은 휴대폰, 긴 이름·기준 문구는 PC 출석부가 쓴다. 문구는 여기 한 벌만.
export const EVAL_FIELDS = [
  {
    key: 'attendance_score', label: '출석', full: '근태', emoji: '📅',
    guide: '집결시간·휴게시간 준수 여부\n5점: 15분 전 도착, 시간 완벽 준수\n4점: 제시간 도착, 전반적으로 양호\n3점: 소폭 지각 또는 짧은 이탈 (업무 지장 없음)\n2점: 지각·이탈로 팀에 영향\n1점: 심각한 지각·무단이탈·조퇴',
  },
  {
    key: 'performance_score', label: '수행', full: '직무·서비스', emoji: '🎯',
    guide: '업무 수행 능력 + 고객 응대 태도\n5점: 매뉴얼 완벽 숙지, 장비 능숙, 응대 탁월\n4점: 임무 우수, 고객 응대 원활\n3점: 기본 수행, 응대 방식 일부 보완 필요\n2점: 임무 미흡, 상급자 지시 반복 필요\n1점: 임무 불이행 또는 고객 민원 발생',
  },
  {
    key: 'appearance_score', label: '용모', full: '외형', emoji: '✨',
    guide: '복장·청결도가 현장에 적합한가\n5점: 복장 완벽, 청결 우수, 행사 이미지 완전 부합\n4점: 전반적으로 단정, 소소한 보완만 필요\n3점: 기본은 갖췄으나 일부 흐트러짐\n2점: 복장 불량 또는 청결 문제 눈에 띔\n1점: 현장 이미지에 심각하게 부적합',
  },
  {
    key: 'teamwork_score', label: '협동', full: '팀워크·보고', emoji: '📡',
    guide: '무전 보고 정확성 및 팀 협업\n5점: 보고 정확·신속, 팀 소통 완벽\n4점: 팀워크 우수, 소통 원활\n3점: 기본 소통 가능, 보고 누락·지연 있음\n2점: 소통 미흡, 무전 응답 지연, 단독행동\n1점: 팀워크 저해, 지시 불이행',
  },
  {
    key: 'adaptability_score', label: '적응', full: '상황대응', emoji: '⚡',
    guide: '돌발 상황 시 초동 대응 능력\n5점: 즉각 판단·대응, 보고 완벽, 능동적 해결\n4점: 대부분 적절하게 대응\n3점: 기본 대응하나 판단이 느리거나 수동적\n2점: 돌발상황에 당황, 지시 대기만 함\n1점: 상황 대응 불가, 오히려 악화',
  },
] as const

/** 점수에 맞는 기준 한 줄. 반 점(3.5)이면 위쪽 정수(4점) 기준을 "조금 못 미침"으로 보여 준다 */
export function guideForScore(guide: string, score: number): string {
  const line = (n: number) => {
    const l = guide.split('\n').find(x => x.trim().startsWith(`${n}점`))
    return l ? l.replace(/^\s*\d점\s*:\s*/, '') : ''
  }
  if (Number.isInteger(score)) return line(score)
  const hi = Math.ceil(score)
  const t = line(hi)
  return t ? `${hi}점(${t})에 조금 못 미침` : ''
}

export type EvalScoreKey = typeof EVAL_FIELDS[number]['key']
export type EvalScores = Record<EvalScoreKey, number>

/** 평점(소수 한 자리)과 등급. 출석부가 원래 쓰던 기준 그대로. */
export function evalTotal(scores: EvalScores): { total: number; grade: EvalGrade } {
  const vals = EVAL_FIELDS.map(f => snapHalf(scores[f.key]))
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length
  const total = Math.round(avg * 10) / 10
  const grade: EvalGrade = total >= 4 ? '우수' : total >= 2.5 ? '보통' : '미흡'
  return { total, grade }
}

export interface SaveEvalInput {
  assignmentId: string
  staffId?: string | null
  staffName?: string | null
  /** 행사명 — 출석부가 평가를 행사별로 찾는 키 */
  siteName: string
  scores: EvalScores
  reRecommend: boolean
  strengths?: string | null
  improvements?: string | null
  evaluator?: string | null
  /** 이 배정에 이미 평가가 있으면 그 id — 새로 쌓지 않고 덮어쓴다 */
  existingId?: string | null
}

/** 평가 한 건 저장(새로 또는 덮어쓰기) + 크루 누적 평점 재계산 */
export async function saveEvaluation(input: SaveEvalInput): Promise<{ total: number; grade: EvalGrade }> {
  const { total, grade } = evalTotal(input.scores)
  const payload = {
    assignment_id: input.assignmentId,
    staff_id: input.staffId || null,
    staff_name: input.staffName || '',
    site_name: input.siteName || '',
    ...Object.fromEntries(EVAL_FIELDS.map(f => [f.key, snapHalf(input.scores[f.key])])),
    total_score: total,
    grade,
    re_recommend: input.reRecommend,
    strengths: input.strengths || null,
    improvements: input.improvements || null,
    evaluator: input.evaluator || null,
    evaluated_at: new Date().toISOString(),
  }
  if (input.existingId) await db.update('evaluations', input.existingId, payload)
  else await db.insert('evaluations', payload)

  if (input.staffId) await recomputeStaffScores(input.staffId)
  return { total, grade }
}

/** 크루의 누적 평점 = 그 사람 평가 전체의 항목별 평균. 평가가 하나도 없으면 손대지 않는다. */
export async function recomputeStaffScores(staffId: string): Promise<void> {
  const evals = await db.list<Evaluation>('evaluations', { filters: { staff_id: staffId }, order: 'evaluated_at', asc: true })
  if (evals.length === 0) return
  const avg = (key: keyof Evaluation) =>
    Math.round(evals.reduce((s, e) => s + (Number(e[key]) || 0), 0) / evals.length * 10) / 10
  await db.update('staff', staffId, {
    attendance_score:   avg('attendance_score'),
    performance_score:  avg('performance_score'),
    appearance_score:   avg('appearance_score'),
    teamwork_score:     avg('teamwork_score'),
    adaptability_score: avg('adaptability_score'),
    total_score:        avg('total_score'),
  })
}

// ─────────────────────────────────────────────────────────
// 현장에서 확인하는 크루 정보(키·몸무게·MBTI 등)
// 평가(evaluations)가 아니라 크루 프로필(staff)에 쓴다. 점수 칸은 절대 같이 쓰지 않는다 —
// 크루 저장이 total_score 를 덮어쓰던 사고가 있었다(2026-09). 그래서 쓸 수 있는 칸을 여기서 못 박는다.

export const PROFILE_FIELDS = [
  { key: 'gender',        label: '성별',   kind: 'pick',   options: ['남', '여'] },
  { key: 'age',           label: '나이',   kind: 'number', unit: '세' },
  { key: 'height',        label: '키',     kind: 'number', unit: 'cm' },
  { key: 'weight',        label: '몸무게', kind: 'number', unit: 'kg' },
  { key: 'mbti',          label: 'MBTI',   kind: 'mbti' },
  { key: 'english_skill', label: '영어',   kind: 'pick',   options: ['하', '중', '상', '원어민'] },
  { key: 'driving',       label: '운전',   kind: 'pick',   options: ['1종', '2종', '없음'] },
  { key: 'region',        label: '지역',   kind: 'text' },
] as const

export type ProfileKey = typeof PROFILE_FIELDS[number]['key']
/** 화면에서 들고 있는 값은 전부 문자열. 저장할 때 숫자로 바꾼다 */
export type ProfileForm = Record<ProfileKey, string>

export function profileFormOf(staff?: Staff | null): ProfileForm {
  const v = (x: unknown) => (x === null || x === undefined ? '' : String(x))
  return {
    gender: v(staff?.gender), age: v(staff?.age), height: v(staff?.height), weight: v(staff?.weight),
    mbti: v(staff?.mbti), english_skill: v(staff?.english_skill), driving: v(staff?.driving), region: v(staff?.region),
  }
}

/** 크루 정보 요약 칩 — "ENFP · 178cm · 70kg" 식. 빈 칸은 뺀다 */
export function profileChips(form: ProfileForm): string[] {
  const out: string[] = []
  if (form.gender) out.push(form.gender)
  if (form.age)    out.push(`${form.age}세`)
  if (form.height) out.push(`${form.height}cm`)
  if (form.weight) out.push(`${form.weight}kg`)
  if (form.mbti)   out.push(form.mbti)
  if (form.english_skill) out.push(`영어 ${form.english_skill}`)
  if (form.driving) out.push(`운전 ${form.driving}`)
  if (form.region)  out.push(form.region)
  return out
}

/** 바뀐 칸만 골라 staff 에 쓸 모양으로. 비운 칸은 건드리지 않는다(현장에서 실수로 지우는 일 방지) */
export function profilePatch(before: ProfileForm, after: ProfileForm): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const f of PROFILE_FIELDS) {
    const a = (after[f.key] || '').trim()
    if (!a || a === (before[f.key] || '').trim()) continue
    if (f.kind === 'number') { const n = Number(a); if (Number.isFinite(n) && n > 0) patch[f.key] = n }
    else if (f.kind === 'mbti') { const m = a.toUpperCase(); if (/^[EI][NS][TF][JP]$/.test(m)) patch[f.key] = m }
    else patch[f.key] = a
  }
  return patch
}

/** 크루 프로필만 저장. PROFILE_FIELDS 밖의 키는 조용히 버린다(점수 칸 보호). 몇 칸 썼는지 돌려준다 */
export async function saveStaffProfile(staffId: string, patch: Record<string, unknown>): Promise<number> {
  const allowed = new Set<string>(PROFILE_FIELDS.map(f => f.key))
  const safe = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.has(k)))
  const n = Object.keys(safe).length
  if (n === 0) return 0
  await db.update('staff', staffId, safe)
  return n
}
