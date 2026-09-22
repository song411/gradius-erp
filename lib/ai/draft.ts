// AI가 만드는 '초안' — 저장은 하지 않는다
// ─────────────────────────────────────────────────────────
// AI는 값을 채워 보여주기만 하고, 실제 저장은 사람이 [이대로 입력]을 눌렀을 때
// app/api/ai/apply 가 한다. 잘못 만들어도 누르지 않으면 아무 일도 일어나지 않는다.
// (카톡 파싱 → 확인 → 등록으로 이미 돌아가는 lib/inquiryParser.ts 와 같은 결)

import { calcVAT, calcProfitRate } from '@/lib/utils'
import type { Inquiry, Role } from '@/lib/supabase/types'

/** 지원품목은 청구·원가 계산에서 빼는 항목 (EstimateBuilder 와 같은 규칙) */
export const SUPPORT_TYPES = ['지원품목']

/** 최소 이익률 — 일반 30%, 고난이도 40%. 지급단가는 여기서 역산한다. */
export const MIN_PROFIT_RATE = 30
export const MIN_PROFIT_RATE_HARD = 40

export interface DraftItem {
  role_id?: string
  role_name: string
  quantity: number
  days: number
  unit_price: number       // 청구 단가
  pay_unit_price: number   // 지급 단가
  is_leader: boolean
  item_type: string
  spec?: string
}

export interface InquiryDraft {
  kind: 'inquiry'
  fields: Record<string, unknown>
  /** 파서가 얼마나 확신하는지 (0~100) */
  confidence: number
  /** 비어 있어서 사람이 채워야 하는 칸 */
  missing: string[]
}

export interface EstimateDraft {
  kind: 'estimate'
  inquiry_id: string
  company_name: string
  event_name: string
  items: DraftItem[]
  totals: {
    supply: number; vat: number; total: number
    cost: number; profit: number; profit_rate: number
  }
  warnings: string[]
}

export interface AssignmentRow {
  staff_id?: string
  staff_name: string
  job_type: string
  /** 지급 단가 (원/일) */
  pay_rate: number
  /** 며칠. 날짜를 고른 사람만 work_dates.length 로 따라온다 */
  work_days: number
  /** 어느 날 — 비우면 '기간 전체'로 본다 */
  work_dates?: string[]
  role_type?: string
  phone?: string
  /** 이 사람을 왜 넣었는지 */
  why?: string
  /** 사람이 확인해야 할 것 */
  warn?: string
}

export interface AssignmentDraft {
  kind: 'assignment'
  inquiry_id: string
  company_name: string
  event_name: string
  event_start?: string
  event_end?: string
  rows: AssignmentRow[]
  totals: { people: number; payTotal: number }
  warnings: string[]
}

export type Draft = InquiryDraft | EstimateDraft | AssignmentDraft

// ─── 견적 초안 ────────────────────────────────────────────

const norm = (s?: string | null) => (s || '').trim().toLowerCase()

/** 직무 이름으로 단가표에서 역할을 찾는다. 정확히 같은 것 → 포함 관계 순. */
export function findRole(roles: Role[], name: string): Role | undefined {
  const q = norm(name)
  if (!q) return undefined
  return roles.find(r => norm(r.role_name) === q)
    ?? roles.find(r => norm(r.role_name).includes(q) || q.includes(norm(r.role_name)))
}

export interface BuildEstimateInput {
  inquiry: Inquiry
  roles: Role[]
  /** 사람이 지정한 구성. 비우면 문의의 필요 인원으로 한 줄 만든다. */
  lines?: Array<{ role: string; quantity: number; days?: number; is_leader?: boolean }>
  /** 고난이도 행사인지 — 최소 이익률이 40%가 된다 */
  hard?: boolean
}

export function buildEstimateDraft(input: BuildEstimateInput): EstimateDraft | { error: string } {
  const { inquiry, roles, hard } = input
  const warnings: string[] = []

  // 며칠짜리 행사인지 — 운영일이 곧 견적 일수의 출발점
  const dates = Array.isArray(inquiry.event_dates) && inquiry.event_dates.length > 0
    ? inquiry.event_dates
    : undefined
  const defaultDays = dates
    ? dates.length
    : inquiry.event_start && inquiry.event_end
      ? Math.max(1, Math.round(
          (new Date(inquiry.event_end).getTime() - new Date(inquiry.event_start).getTime())
          / 86400000) + 1)
      : 1

  let lines = input.lines
  if (!lines || lines.length === 0) {
    const n = inquiry.required_staff ?? 0
    if (n <= 0) {
      return { error: '필요 인원이 비어 있어 견적 품목을 만들 수 없습니다. 직무와 인원을 알려주세요.' }
    }
    const job = inquiry.service_type || '행사스탭'
    lines = [{ role: job, quantity: n, days: defaultDays }]
    warnings.push(`직무 구성을 따로 주지 않아 '${job}' ${n}명 한 줄로 잡았습니다. 실제 편성이 다르면 알려주세요.`)
  }

  const items: DraftItem[] = []
  for (const l of lines) {
    const role = findRole(roles, l.role)
    if (!role) {
      warnings.push(`단가표에 '${l.role}' 이(가) 없어 단가를 0으로 두었습니다. 견적 화면에서 직무를 고르셔야 합니다.`)
    }
    const base = (role?.base_price ?? 0) + (l.is_leader ? (role?.leader_bonus ?? 0) : 0)
    items.push({
      role_id: role?.id,
      role_name: role?.role_name ?? l.role,
      quantity: Math.max(1, l.quantity),
      days: Math.max(1, l.days ?? defaultDays),
      unit_price: base,
      pay_unit_price: role?.pay_price ?? 0,
      is_leader: l.is_leader === true,
      item_type: '인력',
    })
  }

  const billable = items.filter(it => !SUPPORT_TYPES.includes(it.item_type))
  const supply = billable.reduce((s, it) => s + it.quantity * it.days * it.unit_price, 0)
  const cost = billable.reduce((s, it) => s + it.quantity * it.days * it.pay_unit_price, 0)
  const { vat, total } = calcVAT(supply)
  const rate = calcProfitRate(supply, cost)

  const floor = hard ? MIN_PROFIT_RATE_HARD : MIN_PROFIT_RATE
  if (supply > 0 && rate < floor) {
    warnings.push(
      `이익률이 ${rate}% 로 최소 기준 ${floor}% 에 못 미칩니다. ` +
      `청구단가를 올리거나 지급단가를 낮춰야 합니다.`)
  }
  if (supply === 0) warnings.push('청구 금액이 0원입니다. 단가표에서 직무를 못 찾았을 수 있습니다.')

  // 부대비용은 사람이 직접 적을 때만 생긴다 — 견적에서 자동으로 만들지 않는다
  return {
    kind: 'estimate',
    inquiry_id: inquiry.id,
    company_name: inquiry.company_name || '',
    event_name: inquiry.event_name || '',
    items,
    totals: { supply, vat, total, cost, profit: supply - cost, profit_rate: rate },
    warnings,
  }
}

// ─── 문의 초안 ────────────────────────────────────────────

/** 사람이 꼭 채워야 하는 칸 — 비면 배정도 견적도 못 간다 */
const REQUIRED_FIELDS: Array<[string, string]> = [
  ['company_name', '거래처'],
  ['event_name', '행사명'],
  ['event_start', '행사 시작일'],
  ['location', '장소'],
  ['required_staff', '필요 인원'],
]

export function buildInquiryDraft(
  parsed: Record<string, unknown>, confidence: number,
): InquiryDraft {
  const fields: Record<string, unknown> = { ...parsed, status: '접수' }

  // 페이 원문은 notes 맨 앞에 남긴다 (문의 화면이 저장하는 방식과 같게)
  const payDetail = typeof parsed.pay_detail === 'string' ? parsed.pay_detail.trim() : ''
  const notes = typeof parsed.notes === 'string' ? parsed.notes.trim() : ''
  fields.notes = [payDetail ? `[페이: ${payDetail}]` : '', notes].filter(Boolean).join('\n')

  const missing = REQUIRED_FIELDS
    .filter(([k]) => {
      const v = fields[k]
      return v === undefined || v === null || v === '' || v === 0
    })
    .map(([, label]) => label)

  return { kind: 'inquiry', fields, confidence, missing }
}
