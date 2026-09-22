// AI 비서가 ERP를 들여다보는 창구
// ─────────────────────────────────────────────────────────
// 예전에는 매 질문마다 네 테이블을 통째로 요약해 통으로 넘겼다. 그래서 목록에
// 없는 것은 "확인이 어렵다"는 답밖에 못 했고, 견적·배정·출석은 아예 보이지도
// 않았다. 지금은 질문에 따라 필요한 것만 골라 조회한다.
//
// ★ 이 파일이 지키는 두 가지
//   1. 조회는 반드시 fetchAll 을 거친다. Supabase 는 1000행에서 조용히 자른다.
//   2. 날짜 판정은 matrixCore 의 eventDatesOf 하나만 쓴다. 캘린더·배정 화면과
//      다른 날짜를 말하는 순간 AI 답변은 못 믿을 것이 된다.

import type Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { eventDatesOf, cleanStaffName } from '@/components/schedule/matrixCore'
import { unpaidTotal, dedupeSettlements } from '@/lib/finance'
import type {
  Inquiry, Assignment, Staff, Settlement, Payout,
  Estimate, EstimateItem, EventExpense, Evaluation,
} from '@/lib/supabase/types'

/** Supabase REST 가 한 번에 주는 최대 행 수 */
const PAGE = 1000
/** 이보다 많으면 무언가 잘못된 것이다 */
const MAX_ROWS = 50_000

const won = (n: number) => `${Math.round(n || 0).toLocaleString()}원`
const today = () => new Date().toISOString().slice(0, 10)

/** 배정 상태 중 '이 사람은 그날 잡혀 있다'고 볼 것 */
const BUSY_STATUSES = ['확정', '배정중']

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const supabase = createAdminClient()
  const out: T[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase
      .from(table).select(columns).range(from, from + PAGE - 1)
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`)
    const rows = (data || []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

/** 한 번의 질문 동안 같은 테이블을 두 번 읽지 않게 붙잡아 두는 자리 */
export class ErpData {
  private cache = new Map<string, Promise<unknown>>()

  private load<T>(key: string, fn: () => Promise<T[]>): Promise<T[]> {
    if (!this.cache.has(key)) this.cache.set(key, fn())
    return this.cache.get(key) as Promise<T[]>
  }

  inquiries() {
    return this.load<Inquiry>('inquiries', () => fetchAll('inquiries',
      'id, inquiry_code, company_name, contact_name, phone, event_name, location, ' +
      'event_start, event_end, event_dates, event_time, service_type, required_staff, ' +
      'status, category, attire, meal, parking, notes, memo, consult_notes, ' +
      'next_action, next_action_at, lost_reason, created_at'))
  }
  assignments() {
    return this.load<Assignment>('assignments', () => fetchAll('assignments',
      'id, inquiry_id, event_name, staff_id, staff_name, staff_type, job_type, ' +
      'pay_rate, work_days, work_dates, total_pay, status, role_type, start_date, end_date, memo'))
  }
  staff() {
    return this.load<Staff>('staff', () => fetchAll('staff',
      'id, name, gender, age, region, phone, available_jobs, certifications, ' +
      'recommend, total_score, attendance_score, performance_score, ' +
      'appearance_score, teamwork_score, adaptability_score, memo'))
  }
  settlements() {
    return this.load<Settlement>('settlements', () => fetchAll('settlements',
      'id, inquiry_id, company_name, site_name, dispatch_period, invoice_amount, ' +
      'received_amount, balance, progress, deposit_status, tax_invoice_issued, payout_amount'))
  }
  payouts() {
    return this.load<Payout>('payouts', () => fetchAll('payouts',
      'id, inquiry_id, staff_name, site_name, dispatch_days, final_pay, status, paid_at'))
  }
  evaluations() {
    return this.load<Evaluation>('evaluations', () => fetchAll('evaluations',
      'id, staff_id, staff_name, site_name, total_score, grade, strengths, ' +
      'improvements, re_recommend, evaluated_at'))
  }
  estimates() {
    return this.load<Estimate>('estimates', () => fetchAll('estimates',
      'id, estimate_code, inquiry_id, company_name, event_name, supply_price, vat, ' +
      'total_price, cost_price, extra_cost, expected_profit, profit_rate, ' +
      'send_status, sent_at, is_final, created_at'))
  }
  estimateItems() {
    return this.load<EstimateItem>('estimate_items', () => fetchAll('estimate_items',
      'id, estimate_id, inquiry_id, role_name, quantity, days, quantity_unit, days_unit, ' +
      'unit_price, pay_unit_price, is_leader, item_type, sort_order'))
  }
  expenses() {
    return this.load<EventExpense>('event_expenses', () => fetchAll('event_expenses',
      'id, inquiry_id, category, amount, memo, spent_on'))
  }
}

// ─── 공통 헬퍼 ────────────────────────────────────────────

/** 배정이 실제로 일하는 날. 비어 있으면 행사 전 기간이다 (배정 화면과 같은 규칙) */
function workDatesOf(a: Assignment, event: Inquiry | undefined): string[] {
  const picked = a.work_dates
  if (Array.isArray(picked) && picked.length > 0) return picked.map(d => d.slice(0, 10))
  return event ? eventDatesOf(event) : []
}

/** 크루를 가리키는 하나의 열쇠 — staff_id 가 비어 있는 배정이 많아 이름으로도 잡는다 */
function staffKey(staffId?: string | null, staffName?: string | null): string {
  if (staffId) return `id:${staffId}`
  const n = cleanStaffName(staffName)
  return n ? `name:${n}` : ''
}

/** 키워드로 행사 찾기 — 거래처·행사명·장소·코드를 한꺼번에 본다 */
function matchEvent(i: Inquiry, kw: string): boolean {
  const q = kw.toLowerCase()
  return [i.company_name, i.event_name, i.location, i.inquiry_code]
    .some(v => (v || '').toLowerCase().includes(q))
}

function eventLine(i: Inquiry): string {
  const dates = eventDatesOf(i)
  const span = dates.length === 0 ? '날짜미정'
    : dates.length === 1 ? dates[0]
    : `${dates[0]}~${dates[dates.length - 1]} (운영 ${dates.length}일)`
  return `${i.company_name || '-'} | ${i.event_name || '-'} | ${span} | ${i.status}` +
    ` | ${i.location || '장소미정'} | 필요 ${i.required_staff ?? '?'}명 | id=${i.id}`
}

/** 행사를 찾아 하나로 좁힌다. 못 찾거나 여럿이면 그 사실을 문자열로 돌려준다 */
function resolveEvent(
  list: Inquiry[], eventId?: string, keyword?: string,
): { event: Inquiry } | { error: string } {
  if (eventId) {
    const hit = list.find(i => i.id === eventId)
    return hit ? { event: hit } : { error: `id=${eventId} 인 행사를 찾지 못했습니다.` }
  }
  if (!keyword) return { error: 'event_id 나 keyword 중 하나는 있어야 합니다.' }

  const hits = list.filter(i => matchEvent(i, keyword))
  if (hits.length === 0) return { error: `'${keyword}' 로 찾은 행사가 없습니다.` }
  if (hits.length === 1) return { event: hits[0] }

  // 여럿이면 고르게 한다 — 임의로 하나를 집으면 엉뚱한 행사를 답하게 된다
  const sorted = hits.sort((a, b) => (b.event_start || '').localeCompare(a.event_start || ''))
  return {
    error: `'${keyword}' 로 ${hits.length}건이 나왔습니다. 어느 것인지 물어보거나 ` +
      `event_id 를 지정해 다시 부르세요.\n` +
      sorted.slice(0, 10).map(i => `- ${eventLine(i)}`).join('\n'),
  }
}

// ─── 도구 정의 ────────────────────────────────────────────

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_events',
    description:
      '행사/문의를 찾는다. 거래처명·행사명·장소·문의코드 어디에 걸려도 나온다. ' +
      '기간이나 상태로 좁힐 수 있다. "다음주 행사", "○○사 건" 같은 질문에 먼저 쓴다.',
    input_schema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '거래처·행사명·장소·코드 중 아무 조각' },
        from: { type: 'string', description: '이 날짜부터 (YYYY-MM-DD)' },
        to: { type: 'string', description: '이 날짜까지 (YYYY-MM-DD)' },
        status: { type: 'string', description: '문의 상태 (체결, 견적, 접수 등)' },
        limit: { type: 'number', description: '최대 몇 건 (기본 20)' },
      },
    },
  },
  {
    name: 'get_event_detail',
    description:
      '행사 한 건을 통째로 본다 — 기본정보·운영일·견적·배정 명단·정산·부대비용까지. ' +
      '특정 행사를 콕 집어 물으면 이것을 쓴다.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'search_events 가 준 id' },
        keyword: { type: 'string', description: 'id 를 모를 때 쓰는 검색어' },
      },
    },
  },
  {
    name: 'recommend_staff',
    description:
      '이 행사에 보낼 크루를 추천한다. ★1순위는 그 현장을 해본 사람이다 — ' +
      '같은 거래처·같은 장소·같은 행사를 뛴 이력을 가장 크게 본다. ' +
      '그날 다른 현장에 이미 잡힌 사람은 빼고 준다. ' +
      '"누구 보낼까", "인력 추천" 류 질문에 쓴다.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'search_events 가 준 id' },
        keyword: { type: 'string', description: 'id 를 모를 때 쓰는 검색어' },
        job_type: { type: 'string', description: '직무로 좁히기 (경호, 안내, 주차 등)' },
        limit: { type: 'number', description: '최대 몇 명 (기본 12)' },
      },
    },
  },
  {
    name: 'get_staff_detail',
    description:
      '크루 한 명의 프로필·평점·근무 이력·평가 코멘트를 본다. ' +
      '"김○○ 어떤 사람이야", "저 사람 언제 뭐 했었지" 같은 질문에 쓴다.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: '크루 이름' } },
      required: ['name'],
    },
  },
  {
    name: 'search_settlements',
    description:
      '정산·미수금을 조회한다. 거래처로 좁히거나 미수 발생 건만 볼 수 있다.',
    input_schema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '거래처·현장명 조각' },
        unpaid_only: { type: 'boolean', description: 'true 면 미수 발생 건만' },
        limit: { type: 'number', description: '최대 몇 건 (기본 20)' },
      },
    },
  },
  {
    name: 'get_summary',
    description:
      '전체 현황을 한눈에 — 문의 상태 분포, 매출·미수 합계, 지급 상태, 크루 수. ' +
      '"이번달 매출", "미수금 얼마" 같은 뭉뚱그린 질문에 쓴다. 합계는 전체 기준으로 정확하다.',
    input_schema: {
      type: 'object',
      properties: {
        month: { type: 'string', description: "'YYYY-MM' 형식. 비우면 이번 달" },
      },
    },
  },
]

// ─── 도구 실행 ────────────────────────────────────────────

type ToolInput = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

export async function runTool(name: string, input: ToolInput, erp: ErpData): Promise<string> {
  switch (name) {
    case 'search_events':    return searchEvents(input, erp)
    case 'get_event_detail': return eventDetail(input, erp)
    case 'recommend_staff':  return recommendStaff(input, erp)
    case 'get_staff_detail': return staffDetail(input, erp)
    case 'search_settlements': return searchSettlements(input, erp)
    case 'get_summary':      return summary(input, erp)
    default: return `알 수 없는 도구: ${name}`
  }
}

async function searchEvents(input: ToolInput, erp: ErpData): Promise<string> {
  const kw = str(input.keyword), from = str(input.from), to = str(input.to)
  const status = str(input.status), limit = num(input.limit) ?? 20

  let list = await erp.inquiries()
  if (kw) list = list.filter(i => matchEvent(i, kw))
  if (status) list = list.filter(i => i.status === status)
  if (from || to) {
    list = list.filter(i => {
      const dates = eventDatesOf(i)
      if (dates.length === 0) return false
      return dates.some(d => (!from || d >= from) && (!to || d <= to))
    })
  }

  if (list.length === 0) return '조건에 맞는 행사가 없습니다.'

  const sorted = list.sort((a, b) => (a.event_start || '9999').localeCompare(b.event_start || '9999'))
  const shown = sorted.slice(0, limit)
  const head = `총 ${list.length}건${list.length > shown.length ? ` (아래는 ${shown.length}건)` : ''}`
  return `${head}\n${shown.map(i => `- ${eventLine(i)}`).join('\n')}`
}

async function eventDetail(input: ToolInput, erp: ErpData): Promise<string> {
  const found = resolveEvent(await erp.inquiries(), str(input.event_id), str(input.keyword))
  if ('error' in found) return found.error
  const ev = found.event

  const [assigns, ests, items, setts, exps] = await Promise.all([
    erp.assignments(), erp.estimates(), erp.estimateItems(), erp.settlements(), erp.expenses(),
  ])

  const dates = eventDatesOf(ev)
  const lines: string[] = [
    `[행사] ${ev.company_name || '-'} / ${ev.event_name || '-'}  (id=${ev.id})`,
    `상태 ${ev.status} | 장소 ${ev.location || '-'} | 시간 ${ev.event_time || '-'} | 필요 ${ev.required_staff ?? '?'}명`,
    `운영일 ${dates.length}일: ${dates.join(', ') || '미정'}`,
    `담당 ${ev.contact_name || '-'} ${ev.phone || ''} | 복장 ${ev.attire || '-'} | 식사 ${ev.meal || '-'} | 주차 ${ev.parking || '-'}`,
  ]
  if (ev.notes) lines.push(`특이사항: ${ev.notes}`)
  if (ev.consult_notes) lines.push(`상담메모: ${ev.consult_notes}`)

  // 견적
  const myEsts = ests.filter(e => e.inquiry_id === ev.id)
  if (myEsts.length) {
    const fin = myEsts.find(e => e.is_final) || myEsts[myEsts.length - 1]
    lines.push('', `[견적] ${myEsts.length}건 (아래는 ${fin.is_final ? '최종본' : '최신본'})`,
      `공급가 ${won(fin.supply_price)} / 합계 ${won(fin.total_price)} / 원가 ${won(fin.cost_price)}` +
      ` / 이익률 ${fin.profit_rate != null ? `${fin.profit_rate}%` : '-'}` +
      ` | 발송 ${fin.send_status || '미발송'}${fin.sent_at ? ` (${fin.sent_at.slice(0, 10)})` : ''}`)
    // 견적서에는 사람이 지우지 않고 남겨둔 빈 줄이 섞여 있다. 그대로 읽어 주면
    // AI가 '0명 품목'을 실제 항목인 양 말하게 된다
    const myItems = items.filter(it => it.estimate_id === fin.id)
      .filter(it => {
        const named = (it.role_name || '').trim()
        return (named && named !== '-') || (it.quantity || 0) > 0 || (it.unit_price || 0) > 0
      })
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    myItems.forEach(it => lines.push(
      `  · ${it.role_name || '-'} ${it.quantity}${it.quantity_unit || '명'}` +
      ` × ${it.days}${it.days_unit || '일'} @${won(it.unit_price)}` +
      `${it.pay_unit_price ? ` (지급 ${won(it.pay_unit_price)})` : ''}${it.is_leader ? ' [팀장]' : ''}`))
  }

  // 배정
  const myAsgn = assigns.filter(a => a.inquiry_id === ev.id)
  if (myAsgn.length) {
    const byJob: Record<string, Assignment[]> = {}
    myAsgn.forEach(a => (byJob[a.job_type || '미지정'] ||= []).push(a))
    lines.push('', `[배정] ${myAsgn.length}명`)
    Object.entries(byJob).forEach(([job, arr]) => {
      lines.push(`  ${job} ${arr.length}명: ` + arr.map(a =>
        `${cleanStaffName(a.staff_name) || '?'}${a.role_type === '팀장' ? '(팀장)' : ''}` +
        `[${a.status}]${(a.work_dates?.length ?? 0) > 0 ? ` ${a.work_dates!.length}일` : ''}`).join(', '))
    })
  } else {
    lines.push('', '[배정] 아직 없음')
  }

  // 정산
  const mySett = setts.filter(s => s.inquiry_id === ev.id)
  mySett.forEach(s => lines.push('', `[정산] 청구 ${won(s.invoice_amount)} / 입금 ${won(s.received_amount)}` +
    ` / 잔액 ${won((s.invoice_amount || 0) - (s.received_amount || 0))}` +
    ` | ${s.deposit_status} | ${s.progress} | 세금계산서 ${s.tax_invoice_issued ? '발행' : '미발행'}`))

  // 부대비용 (사람이 직접 적은 것만 존재한다)
  const myExp = exps.filter(x => x.inquiry_id === ev.id)
  if (myExp.length) {
    const total = myExp.reduce((s, x) => s + (x.amount || 0), 0)
    lines.push('', `[부대비용] ${myExp.length}건 합계 ${won(total)}`,
      ...myExp.map(x => `  · ${x.category} ${won(x.amount)}${x.memo ? ` — ${x.memo}` : ''}`))
  }

  return lines.join('\n')
}

async function recommendStaff(input: ToolInput, erp: ErpData): Promise<string> {
  const found = resolveEvent(await erp.inquiries(), str(input.event_id), str(input.keyword))
  if ('error' in found) return found.error
  const ev = found.event

  const jobFilter = str(input.job_type)
  const limit = num(input.limit) ?? 12

  const [inquiries, assigns, staffList, evals] = await Promise.all([
    erp.inquiries(), erp.assignments(), erp.staff(), erp.evaluations(),
  ])

  const targetDates = new Set(eventDatesOf(ev))
  if (targetDates.size === 0) {
    return `'${ev.event_name}' 은 행사일이 정해지지 않아 그날 비는 사람을 가릴 수 없습니다. ` +
      `행사일을 먼저 정해야 제대로 추천할 수 있습니다.`
  }

  const inqById = new Map(inquiries.map(i => [i.id, i]))

  // ① 그날 이미 다른 현장에 잡힌 사람 골라내기
  const busy = new Map<string, string>()   // key → 어느 현장인지
  assigns.forEach(a => {
    if (!a.inquiry_id || a.inquiry_id === ev.id) return
    if (!BUSY_STATUSES.includes(a.status)) return
    const other = inqById.get(a.inquiry_id)
    const days = workDatesOf(a, other)
    if (!days.some(d => targetDates.has(d))) return
    const key = staffKey(a.staff_id, a.staff_name)
    if (key) busy.set(key, other?.event_name || other?.company_name || '다른 현장')
  })

  // ② 이력 쌓기 — 이 행사의 거래처·장소·행사명을 해봤는지
  type Hist = {
    sameClient: number; samePlace: number; sameEvent: number
    total: number; lastDate: string; lastWhere: string
  }
  const hist = new Map<string, Hist>()
  const norm = (s?: string | null) => (s || '').trim().toLowerCase()
  const evClient = norm(ev.company_name), evPlace = norm(ev.location), evName = norm(ev.event_name)

  assigns.forEach(a => {
    if (a.inquiry_id === ev.id) return
    if (a.status === '취소') return
    const key = staffKey(a.staff_id, a.staff_name)
    if (!key) return
    const past = a.inquiry_id ? inqById.get(a.inquiry_id) : undefined
    const h = hist.get(key) || { sameClient: 0, samePlace: 0, sameEvent: 0, total: 0, lastDate: '', lastWhere: '' }
    h.total++
    if (past) {
      if (evClient && norm(past.company_name) === evClient) h.sameClient++
      if (evPlace && norm(past.location) === evPlace) h.samePlace++
      if (evName && norm(past.event_name) === evName) h.sameEvent++
      const d = past.event_start?.slice(0, 10) || ''
      if (d && d > h.lastDate) {
        h.lastDate = d
        h.lastWhere = `${past.company_name || ''} ${past.event_name || ''}`.trim()
      }
    }
    hist.set(key, h)
  })

  // ③ 평가 코멘트 (재추천 여부만 가볍게)
  const noReco = new Set<string>()
  evals.forEach(e => {
    if (e.re_recommend === false) {
      const k = staffKey(e.staff_id, e.staff_name)
      if (k) noReco.add(k)
    }
  })

  // ④ 점수 매기기 — 현장 경험이 평점보다 크게 작용하도록
  type Cand = { s: Staff; key: string; score: number; why: string[] }
  const cands: Cand[] = []

  for (const s of staffList) {
    const key = staffKey(s.id, s.name)
    if (!key || busy.has(key)) continue

    if (jobFilter) {
      const jobs = s.available_jobs || []
      if (jobs.length > 0 && !jobs.some(j => j.includes(jobFilter) || jobFilter.includes(j))) continue
    }

    const h = hist.get(key)
    const why: string[] = []
    let score = 0

    if (h) {
      if (h.sameClient > 0) { score += Math.min(h.sameClient, 3) * 100; why.push(`같은 거래처 ${h.sameClient}회`) }
      if (h.sameEvent > 0)  { score += Math.min(h.sameEvent, 3) * 80;  why.push(`같은 행사 ${h.sameEvent}회`) }
      if (h.samePlace > 0)  { score += Math.min(h.samePlace, 3) * 60;  why.push(`같은 장소 ${h.samePlace}회`) }
      score += Math.min(h.total, 20) * 2
      if (why.length === 0 && h.total > 0) why.push(`총 ${h.total}회 근무`)
    }

    const rating = s.total_score || 0
    score += rating * 10
    if (rating > 0) why.push(`평점 ${rating}`)

    if (s.recommend === '우선투입') { score += 30; why.push('우선투입') }
    if (s.recommend === '보류')     { score -= 60; why.push('⚠ 보류등급') }
    if (noReco.has(key))            { score -= 80; why.push('⚠ 재추천 아니오 이력') }

    if (evPlace && s.region && evPlace.includes(norm(s.region))) { score += 20; why.push(`${s.region} 거주`) }

    if (score <= 0) continue
    cands.push({ s, key, score, why })
  }

  if (cands.length === 0) {
    return `추천할 만한 크루를 찾지 못했습니다. (그날 다른 현장에 잡힌 사람 ${busy.size}명 제외함)`
  }

  cands.sort((a, b) => b.score - a.score)
  const top = cands.slice(0, limit)

  const experienced = top.filter(c => (hist.get(c.key)?.sameClient || 0) > 0
    || (hist.get(c.key)?.sameEvent || 0) > 0 || (hist.get(c.key)?.samePlace || 0) > 0).length

  const lines = [
    `[추천 대상] ${ev.company_name || '-'} / ${ev.event_name || '-'}`,
    `운영일 ${[...targetDates].sort().join(', ')} | 필요 ${ev.required_staff ?? '?'}명` +
      `${jobFilter ? ` | 직무 '${jobFilter}'` : ''}`,
    `그날 다른 현장에 잡힌 ${busy.size}명은 제외했습니다. 후보 ${cands.length}명 중 상위 ${top.length}명.`,
    `이 중 ${experienced}명은 이 현장/거래처 경험이 있습니다.`,
    '',
    '순위 | 이름 | 근거 | 연락처',
  ]
  top.forEach((c, idx) => {
    const h = hist.get(c.key)
    const last = h?.lastDate ? ` (최근 ${h.lastDate} ${h.lastWhere})` : ''
    lines.push(`${idx + 1}. ${c.s.name}(${c.s.gender || '?'}/${c.s.age ?? '?'}세/${c.s.region || '지역미상'})` +
      ` | ${c.why.join(', ')}${last} | ${c.s.phone || '연락처없음'}`)
  })
  lines.push('',
    '※ 순위는 현장 경험을 가장 크게, 그다음 평점을 본 것입니다. 배정은 사람이 정합니다.',
    '※ 겹침은 배정에 적힌 근무일(work_dates) 기준으로 이미 걸렀습니다. 근무일이 비어 있는 배정만 ' +
    '행사 전 기간 근무로 봤습니다. 행사 기간이 길어도 그 사람의 근무일이 아니면 겹치는 것이 아니니, ' +
    '위 목록에 있는 사람은 그날 비어 있다고 보시면 됩니다.')

  return lines.join('\n')
}

async function staffDetail(input: ToolInput, erp: ErpData): Promise<string> {
  const name = str(input.name)
  if (!name) return 'name 이 필요합니다.'

  const [staffList, assigns, inquiries, evals, payouts] = await Promise.all([
    erp.staff(), erp.assignments(), erp.inquiries(), erp.evaluations(), erp.payouts(),
  ])

  const hits = staffList.filter(s => s.name && s.name.includes(name))
  if (hits.length === 0) return `'${name}' 인 크루를 찾지 못했습니다.`
  if (hits.length > 1 && hits.length <= 10) {
    return `'${name}' 로 ${hits.length}명이 나옵니다. 누구인지 정확히 알려주세요.\n` +
      hits.map(s => `- ${s.name}(${s.gender || '?'}/${s.age ?? '?'}세/${s.region || '-'}) 평점 ${s.total_score}`).join('\n')
  }
  const s = hits[0]
  const key = staffKey(s.id, s.name)
  const inqById = new Map(inquiries.map(i => [i.id, i]))

  const lines = [
    `[크루] ${s.name} (${s.gender || '?'}/${s.age ?? '?'}세/${s.region || '지역미상'}) ${s.phone || ''}`,
    `평점 ${s.total_score} [${s.recommend}] — 근태 ${s.attendance_score} 직무 ${s.performance_score}` +
    ` 용모 ${s.appearance_score} 팀워크 ${s.teamwork_score} 적응 ${s.adaptability_score}`,
    `가능직무 ${(s.available_jobs || []).join(', ') || '-'} | 자격 ${(s.certifications || []).join(', ') || '-'}`,
  ]
  if (s.memo) lines.push(`메모: ${s.memo}`)

  const mine = assigns
    .filter(a => staffKey(a.staff_id, a.staff_name) === key && a.status !== '취소')
    .map(a => ({ a, i: a.inquiry_id ? inqById.get(a.inquiry_id) : undefined }))
    .sort((x, y) => (y.i?.event_start || '').localeCompare(x.i?.event_start || ''))

  lines.push('', `[근무 이력] 총 ${mine.length}건 (최근 12건)`)
  mine.slice(0, 12).forEach(({ a, i }) => lines.push(
    `- ${i?.event_start?.slice(0, 10) || '날짜?'} | ${i?.company_name || '-'} | ${i?.event_name || a.event_name || '-'}` +
    ` | ${a.job_type || '-'}${a.role_type === '팀장' ? '(팀장)' : ''} | ${a.status}`))

  const myEvals = evals.filter(e => staffKey(e.staff_id, e.staff_name) === key)
    .sort((x, y) => (y.evaluated_at || '').localeCompare(x.evaluated_at || ''))
  if (myEvals.length) {
    lines.push('', `[평가] ${myEvals.length}건 (최근 5건)`)
    myEvals.slice(0, 5).forEach(e => lines.push(
      `- ${(e.evaluated_at || '').slice(0, 10)} ${e.site_name || '-'} ${e.total_score}점 [${e.grade}]` +
      `${e.re_recommend === false ? ' ⚠재추천 아니오' : ''}` +
      `${e.strengths ? ` 강점: ${e.strengths}` : ''}${e.improvements ? ` 보완: ${e.improvements}` : ''}`))
  }

  const myPay = payouts.filter(p => cleanStaffName(p.staff_name) === cleanStaffName(s.name))
  if (myPay.length) {
    const sum = myPay.reduce((t, p) => t + (p.final_pay || 0), 0)
    const pending = myPay.filter(p => p.status !== '지급완료' && p.status !== '완료')
    lines.push('', `[지급] 총 ${myPay.length}건 ${won(sum)}` +
      (pending.length ? ` | 미완료 ${pending.length}건 ${won(pending.reduce((t, p) => t + (p.final_pay || 0), 0))}` : ''))
  }

  return lines.join('\n')
}

async function searchSettlements(input: ToolInput, erp: ErpData): Promise<string> {
  const kw = str(input.keyword), unpaidOnly = input.unpaid_only === true
  const limit = num(input.limit) ?? 20

  // 한 문의에 정산이 두 건 이상이면 매출이 이중으로 잡힌다 — lib/finance.ts 와 같은 규칙
  let list = dedupeSettlements(await erp.settlements())
  if (kw) {
    const q = kw.toLowerCase()
    list = list.filter(s => [s.company_name, s.site_name].some(v => (v || '').toLowerCase().includes(q)))
  }
  // 미수는 balance 컬럼이 기준이다. 초과입금(음수)은 다른 건의 미수를 상쇄하지 않는다
  const rows = list.map(s => ({ s, owed: Math.max(0, s.balance || 0) }))
  const picked = unpaidOnly ? rows.filter(r => r.owed > 0) : rows
  if (picked.length === 0) return '조건에 맞는 정산 건이 없습니다.'

  const invoice = picked.reduce((t, r) => t + (r.s.invoice_amount || 0), 0)
  const received = picked.reduce((t, r) => t + (r.s.received_amount || 0), 0)
  const shown = picked.sort((a, b) => b.owed - a.owed).slice(0, limit)

  return [
    `${picked.length}건 | 청구 ${won(invoice)} / 입금 ${won(received)} / 미수 ${won(unpaidTotal(picked.map(r => r.s)))}`,
    ...shown.map(({ s, owed }) => `- ${s.company_name || s.site_name || '-'} | 청구 ${won(s.invoice_amount)}` +
      ` | 입금 ${won(s.received_amount)} | 미수 ${won(owed)} | ${s.deposit_status} | ${s.progress}`),
  ].join('\n')
}

async function summary(input: ToolInput, erp: ErpData): Promise<string> {
  const month = str(input.month) || new Date().toISOString().slice(0, 7)

  const [inqs, setts, payouts, staffList] = await Promise.all([
    erp.inquiries(), erp.settlements(), erp.payouts(), erp.staff(),
  ])

  const dist = (rows: object[], col: string, unit = '건') => {
    const m: Record<string, number> = {}
    rows.forEach(row => {
      const raw = (row as Record<string, unknown>)[col]
      const v = raw == null || raw === '' ? '(미지정)' : String(raw)
      m[v] = (m[v] || 0) + 1
    })
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}${unit}`).join(' / ')
  }

  const monthly = inqs.filter(i => eventDatesOf(i).some(d => d.startsWith(month)))
  const undated = inqs.filter(i => !i.event_start).length
  const upcoming = inqs.filter(i => (i.event_start || '') >= today() && i.status !== '취소').length

  // 돈 세는 규칙은 lib/finance.ts 한 곳 — 문의당 첫 정산만, 미수는 balance 기준
  const uniq = dedupeSettlements(setts)
  const invoice = uniq.reduce((t, s) => t + (s.invoice_amount || 0), 0)
  const received = uniq.reduce((t, s) => t + (s.received_amount || 0), 0)
  const owedCount = uniq.filter(s => (s.balance || 0) > 0).length

  const payByStatus: Record<string, { n: number; sum: number }> = {}
  payouts.forEach(p => {
    const k = p.status || '(미지정)'
    const b = payByStatus[k] || (payByStatus[k] = { n: 0, sum: 0 })
    b.n++; b.sum += p.final_pay || 0
  })

  const rated = staffList.filter(s => (s.total_score || 0) > 0)
  const avg = rated.length
    ? (rated.reduce((t, s) => t + (s.total_score || 0), 0) / rated.length).toFixed(2) : 'N/A'

  return [
    `=== 전체 현황 (${today()} 기준) ===`,
    `[문의/행사] 전체 ${inqs.length}건 | ${month} 운영 ${monthly.length}건 | 앞으로 ${upcoming}건 | 행사일 미정 ${undated}건`,
    `상태: ${dist(inqs, 'status')}`,
    `[정산] ${uniq.length}건 | 청구 ${won(invoice)} / 입금 ${won(received)} / 미수 ${won(unpaidTotal(uniq))} (미수 발생 ${owedCount}건)`,
    `입금상태: ${dist(uniq, 'deposit_status')}`,
    `[지급] ${payouts.length}건 | ` + Object.entries(payByStatus)
      .sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `${k} ${v.n}건(${won(v.sum)})`).join(' / '),
    `[크루] ${staffList.length}명 | 평가완료 ${rated.length}명 / 평균 ${avg}점 | 추천등급: ${dist(staffList, 'recommend', '명')}`,
    '',
    '※ 위 합계·건수는 전체를 집계한 정확한 값입니다. 더 자세한 것은 다른 도구로 조회하세요.',
  ].join('\n')
}
