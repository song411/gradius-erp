// 크루 평가 저장 규칙 — 한 곳
// ─────────────────────────────────────────────────────────
// 평가는 배정 한 건에 하나. 다섯 항목(1~5점) 평균이 평점, 평점으로 우수/보통/미흡.
// 저장하면 그 크루의 누적 평점(staff.*_score)을 모든 평가의 평균으로 다시 계산한다.
// 이 평점이 등급(lib/grading.ts)과 가디의 인력 추천에 바로 쓰인다.
//
// ★ 출석부(PC)와 오늘 현장(휴대폰)이 같은 함수를 쓴다. 화면마다 따로 계산하면
//   같은 사람 평점이 화면에 따라 달라진다 — 돈을 lib/finance.ts 한 곳에 모은 것과 같은 이유.

import { db } from '@/lib/supabase/api'
import type { Evaluation, EvalGrade } from '@/lib/supabase/types'

export const EVAL_FIELDS = [
  { key: 'attendance_score',   label: '출석' },
  { key: 'performance_score',  label: '수행' },
  { key: 'appearance_score',   label: '용모' },
  { key: 'teamwork_score',     label: '협동' },
  { key: 'adaptability_score', label: '적응' },
] as const

export type EvalScoreKey = typeof EVAL_FIELDS[number]['key']
export type EvalScores = Record<EvalScoreKey, number>

/** 평점(소수 한 자리)과 등급. 출석부가 원래 쓰던 기준 그대로. */
export function evalTotal(scores: EvalScores): { total: number; grade: EvalGrade } {
  const vals = EVAL_FIELDS.map(f => scores[f.key])
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
    ...input.scores,
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
