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

export type Draft = InquiryDraft | EstimateDraft | AssignmentDraft | OutreachDraft

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

// ─── 섭외 문구 초안 ───────────────────────────────────────
//
// 추천만 받아서는 일이 끝나지 않는다. 그 사람들에게 보낼 말을 또 손으로 써야 한다.
// 그래서 행사 정보(날짜·시간·장소·복장·일당)를 ERP에서 그대로 꺼내 문구로 만든다.
// ★ 문구는 사람이 복사해서 보낸다 — 여기서 카톡이 나가지 않는다.

export interface OutreachPerson {
  name: string
  phone?: string
  /** 그 사람 이름이 박힌 문구 — 그대로 복사해 보내면 된다 */
  text: string
}

export interface OutreachDraft {
  kind: 'outreach'
  company_name: string
  event_name: string
  /** 이름 자리를 비워둔 공통 문구 (단톡방·여러 명에게 한 번에) */
  message: string
  people: OutreachPerson[]
  notes: string[]
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

/** 앞말의 받침에 따라 조사를 고른다 ('복장이' / '주차가') */
function josa(word: string, withBatchim: string, without: string): string {
  const last = word.charCodeAt(word.length - 1)
  const isHangul = last >= 0xac00 && last <= 0xd7a3
  if (!isHangul) return without
  return (last - 0xac00) % 28 === 0 ? without : withBatchim
}

/** 'YYYY-MM-DD' → '9월 25일 (목)'. UTC 로 새면 날짜가 하루 밀린다 */
function fmtDay(s: string): string {
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, (m || 1) - 1, d || 1)
  return `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${WEEKDAY[dt.getDay()]})`
}

/** 근무일을 사람이 읽는 한 줄로. 길면 처음~끝으로 접는다 */
function fmtDays(dates: string[]): string {
  if (dates.length === 0) return ''
  if (dates.length <= 3) {
    return dates.map(fmtDay).join(', ') + (dates.length > 1 ? ` · 총 ${dates.length}일` : '')
  }
  return `${fmtDay(dates[0])} ~ ${fmtDay(dates[dates.length - 1])} 중 ${dates.length}일`
}

export interface BuildOutreachInput {
  inquiry: Inquiry
  /** 실제 운영일 (eventDatesOf 로 뽑은 것) */
  dates: string[]
  people: Array<{ name: string; phone?: string }>
  /** 직무 — 문구에 적는 이름 */
  job: string
  /** 일당(원/일). 0 이면 금액 줄을 빼고 주의로 알린다 */
  payRate: number
  /** 회신 기한 같은 덧말 */
  deadline?: string
  /** 사장님이 덧붙인 말 */
  note?: string
}

export function buildOutreachDraft(input: BuildOutreachInput): OutreachDraft {
  const { inquiry: iq, dates, job, payRate, deadline, note } = input
  const notes: string[] = []

  const body: string[] = []
  const title = [iq.event_name, job].filter(Boolean).join(' · ')
  if (title) body.push(`[${title}]`)
  const dayLine = fmtDays(dates)
  if (dayLine) body.push(`📅 ${dayLine}`)
  else notes.push('행사 날짜가 비어 있어 문구에 넣지 못했습니다. 문의 화면에서 날짜부터 채우세요.')
  if (iq.event_time) body.push(`⏰ ${iq.event_time}`)
  else notes.push('근무 시간이 비어 있습니다. 시간 없이 섭외하면 반드시 다시 묻는 말이 옵니다.')
  if (iq.location) body.push(`📍 ${iq.location}`)
  // '미정' 은 아예 적지 않는다. 적어 보내면 "그럼 뭔데요" 하고 되묻는 말이 온다.
  const known = (v?: string | null): boolean => {
    const t = (v || '').trim()
    return t !== '' && t !== '미정'
  }
  if (known(iq.attire)) body.push(`👔 복장: ${iq.attire}`)
  if (known(iq.meal)) body.push(`🍚 식사: ${iq.meal}`)
  if (known(iq.parking)) body.push(`🚗 주차: ${iq.parking}`)
  const undecided = ['복장', '식사', '주차'].filter((_, i) => !known([iq.attire, iq.meal, iq.parking][i]))
  if (undecided.length) {
    const list = undecided.join('·')
    notes.push(`${list}${josa(list, '이', '가')} 미정이라 문구에서 뺐습니다. 정해지면 넣어 보내세요.`)
  }

  // ★ 일당(원/일)만 적는다. 총액은 사람마다 근무 일수가 달라 여기서 셈하지 않는다 —
  //   멋대로 곱해서 보내면 받는 사람이 그 금액을 약속으로 읽는다.
  if (payRate > 0) body.push(`💰 일당 ${payRate.toLocaleString()}원`)
  else notes.push(`'${job}' 의 지급단가를 단가표에서 못 찾아 금액 줄을 뺐습니다. 금액은 직접 적어 보내세요.`)

  if (note) body.push('', note)

  const tail = deadline
    ? `가능하시면 ${deadline.replace(/\s*까지$/, '')}까지 답장 부탁드립니다 :)`
    : '가능하시면 답장 부탁드립니다 :)'

  const compose = (who: string) => [
    `안녕하세요 ${who}, 가디어스입니다 :)`,
    '아래 현장 가능하신지 여쭤봅니다!',
    '',
    ...body,
    '',
    tail,
  ].join('\n')

  const people: OutreachPerson[] = input.people.map(p => ({
    name: p.name,
    phone: p.phone,
    text: compose(`${p.name}님`),
  }))

  const noPhone = people.filter(p => !p.phone).map(p => p.name)
  if (noPhone.length) {
    notes.push(`연락처가 없는 사람: ${noPhone.join(', ')} — 크루 카드에서 번호를 확인하세요.`)
  }

  return {
    kind: 'outreach',
    company_name: iq.company_name || '',
    event_name: iq.event_name || '',
    message: compose('○○님'),
    people,
    notes,
  }
}
