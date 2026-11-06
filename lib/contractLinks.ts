// 근로계약서 서명 링크 만들기 — 규칙 한 곳
// ─────────────────────────────────────────────────────────
// PC 계약서 화면(/assignments/contract)과 휴대폰 현장 화면(/m/today)이 같은 함수로 링크를 만든다.
// 대기 중인 링크가 있으면 내용만 갱신(주소 유지), 없으면 새로 만든다. 서명 끝난 건은 건드리지 않는다.

import { db } from '@/lib/supabase/api'
import { buildContractFields, makeToken, type ContractFields, type ContractVariant } from '@/lib/laborContract'
import type { Assignment, Inquiry, Staff, LaborContract } from '@/lib/supabase/types'

export interface UpsertLinkInput {
  assignment: Assignment
  inquiry: Inquiry | null
  staff: Staff | null
  variant: ContractVariant
  /** 화면에서 고친 값이 있으면 그것, 없으면 자동 채움 */
  fields?: ContractFields
  /** 이 배정의 최신 링크(취소 제외). 있으면 갱신 판단에 쓴다 */
  latest?: LaborContract | null
  today: string
}

/** 링크 한 개 만들기(또는 갱신). 돌려주는 값은 저장된 줄 */
export async function upsertContractLink(input: UpsertLinkInput): Promise<LaborContract | null> {
  const { assignment: a, inquiry, staff, variant, latest, today } = input
  const fields = input.fields || buildContractFields({ assignment: a, inquiry, staff, variant, today })
  const phone = fields.workerPhone || a.phone || staff?.phone || ''
  const payload = {
    assignment_id: a.id, inquiry_id: inquiry?.id || null, staff_id: a.staff_id || null,
    staff_name: fields.workerName, phone, variant, fields, status: '대기',
  }
  if (latest && latest.status === '대기') {
    const rows = await db.update<LaborContract>('labor_contracts', latest.id, { ...payload, updated_at: new Date().toISOString() })
    return rows[0] || ({ ...latest, ...payload } as unknown as LaborContract)
  }
  const rows = await db.insert<LaborContract>('labor_contracts', { ...payload, token: makeToken() })
  return rows[0] || null
}

/** 배정 목록의 최신 링크 한 벌 (배정 id → 줄). 취소 제외, 최근 것 우선 */
export async function latestLinksByAssignment(assignmentIds: string[]): Promise<Record<string, LaborContract>> {
  if (!assignmentIds.length) return {}
  const rows = await db.list<LaborContract>('labor_contracts', { inFilter: { assignment_id: assignmentIds }, order: 'created_at', asc: false })
  const m: Record<string, LaborContract> = {}
  for (const r of rows) { if (r.assignment_id && !m[r.assignment_id] && r.status !== '취소') m[r.assignment_id] = r }
  return m
}

/** 확정 크루 전원 링크 준비 — 서명 끝난 사람은 두고, 나머지는 만들거나 갱신. 몇 명 만들었는지·몇 명이 이미 서명했는지 */
export async function ensureLinksForCrew(opts: {
  inquiry: Inquiry; assignments: Assignment[]; staffOf: (a: Assignment) => Staff | null; variant: ContractVariant; today: string
}): Promise<{ made: number; signed: number; total: number }> {
  const crew = opts.assignments.filter(a => a.status === '확정')
  const latest = await latestLinksByAssignment(crew.map(a => a.id))
  let made = 0, signed = 0
  for (const a of crew) {
    const l = latest[a.id]
    if (l?.status === '서명완료') { signed++; continue }
    const row = await upsertContractLink({ assignment: a, inquiry: opts.inquiry, staff: opts.staffOf(a), variant: opts.variant, latest: l, today: opts.today })
    if (row) made++
  }
  return { made, signed, total: crew.length }
}
