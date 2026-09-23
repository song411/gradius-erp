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
import {
  gradeOf, statusOf, isAssignable, MIN_WORKS_FOR_GRADE,
  GRADE_DESC, STATUS_DESC, type Grade, type PoolStatus,
} from '@/lib/grading'
import { parseInquiryText, calcParseConfidence } from '@/lib/inquiryParser'
import { buildEstimateDraft, buildInquiryDraft, buildOutreachDraft, findRole,
  type Draft, type AssignmentRow } from '@/lib/ai/draft'
import type {
  Inquiry, Assignment, Staff, Settlement, Payout,
  Estimate, EstimateItem, EventExpense, Evaluation, Role,
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

/** 어느 테이블을 몇 행, 몇 밀리초에 읽었는지 — 화면에 실시간으로 띄우기 위한 기록 */
export interface ScanRecord { table: string; rows: number; ms: number }

/** 한 번의 질문 동안 같은 테이블을 두 번 읽지 않게 붙잡아 두는 자리 */
export class ErpData {
  private cache = new Map<string, Promise<unknown>>()

  /** 이번 질문에서 실제로 읽은 것들. 캐시에 맞은 두 번째 조회는 남지 않는다. */
  readonly scans: ScanRecord[] = []

  private load<T>(key: string, fn: () => Promise<T[]>): Promise<T[]> {
    if (!this.cache.has(key)) {
      const t0 = Date.now()
      this.cache.set(key, fn().then(rows => {
        this.scans.push({ table: key, rows: rows.length, ms: Date.now() - t0 })
        return rows
      }))
    }
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
  roles() {
    return this.load<Role>('roles', () => fetchAll('roles',
      'id, role_code, role_name, base_price, pay_price, leader_bonus'))
  }
}

/** 이번 질문에서 만들어진 초안들 — 화면에 [이대로 입력] 카드로 띄우기 위해 모아둔다.
 *  도구는 저장하지 않는다. 저장은 사람이 버튼을 눌렀을 때만 일어난다. */
export class DraftBox {
  readonly items: Draft[] = []
  add(d: Draft) { this.items.push(d) }
}

// ─── 공통 헬퍼 ────────────────────────────────────────────

/** 배정이 실제로 일하는 날. 비어 있으면 행사 전 기간이다 (배정 화면과 같은 규칙) */
function workDatesOf(a: Assignment, event: Inquiry | undefined): string[] {
  const picked = a.work_dates
  if (Array.isArray(picked) && picked.length > 0) return picked.map(d => d.slice(0, 10))
  return event ? eventDatesOf(event) : []
}

/** 크루 이름으로 찾는다. 정확히 → 포함 → 한 글자 틀린 것 순.
 *
 *  AI가 한글 이름을 흘리는 일이 실제로 있었다('박민재' → '박및재').
 *  이름은 연락처·계좌·지급과 이어지는 값이라, 못 찾았다고 그 이름 그대로 넣으면
 *  카드도 계좌도 없는 유령 배정이 생긴다. 그래서 못 찾으면 넣지 않고 되묻는다. */
function findStaffByName(list: Staff[], name: string): { hit?: Staff; close: Staff[] } {
  const q = name.trim()
  if (!q) return { close: [] }

  const exact = list.find(s => s.name === q)
  if (exact) return { hit: exact, close: [] }

  const contains = list.filter(s => s.name && (s.name.includes(q) || q.includes(s.name)))
  if (contains.length === 1) return { hit: contains[0], close: [] }
  if (contains.length > 1) return { close: contains }

  // 글자 수가 같고 한 글자만 다른 이름 — 흘린 글자를 잡아낸다
  const close = list.filter(s => {
    if (!s.name || s.name.length !== q.length) return false
    let diff = 0
    for (let i = 0; i < q.length; i++) if (s.name[i] !== q[i]) diff++
    return diff === 1
  })
  return { close }
}

/** 본사 직원은 크루 추천 대상이 아니다.
 *  총괄·현장관리로 현장에 나가므로 배정 이력이 두껍게 쌓여 있어, 거르지 않으면
 *  거래처 경험 점수가 높아 추천 1순위로 올라온다. 실제로 그렇게 올라왔었다. */
function isHeadOffice(s: Staff): boolean {
  return (s.memo || '').includes('[본사]')
    || (s.certifications || []).some(c => c.includes('본사직원'))
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
      '이 행사에 보낼 크루를 추천한다. 먼저 하드 필터(그날 겹침·투입불가 등급·직무)로 거른 뒤, ' +
      '남은 사람을 현장 경험 > 등급 > 기회 균등 > 지역 순으로 점수를 매겨 매칭률과 함께 준다. ' +
      '★1순위는 그 현장을 해본 사람이다(같은 거래처·장소·행사). ' +
      '등급(S/A/B/C/X·미분류)과 상태(활성/잠재/관찰/비활성)도 함께 준다. ' +
      '필요 인원을 알면 그 1.5배를 뽑는다 — 섭외하면 거절이 나오기 때문이다. ' +
      '"누구 보낼까", "인력 추천" 류 질문에 쓴다.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'search_events 가 준 id' },
        keyword: { type: 'string', description: 'id 를 모를 때 쓰는 검색어' },
        job_type: { type: 'string', description: '직무로 좁히기 (경호, 안내, 주차 등)' },
        limit: { type: 'number', description: '몇 명까지. 비우면 필요 인원의 1.5배' },
        include_held: {
          type: 'boolean',
          description: '투입불가·관찰 등급까지 포함할지. 사람이 모자랄 때만 true (기본 false)',
        },
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
  {
    name: 'draft_inquiry',
    description:
      '카톡·문자로 받은 문의 원문을 읽어 문의 접수 초안을 만든다. 저장하지 않는다 — ' +
      '사장님이 화면에서 [이대로 입력]을 눌러야 들어간다. ' +
      '★ text 에 원문을 그대로 넣고, 동시에 당신이 읽어낸 값을 fields 에도 넣으세요. ' +
      "ERP 파서는 '업체:', '행사명:' 처럼 라벨이 붙은 양식만 읽습니다. " +
      '줄글로 온 문의는 파서가 거의 못 읽으니, 그때는 당신이 읽은 fields 가 쓰입니다. ' +
      '날짜는 YYYY-MM-DD 로, 인원은 숫자로 주세요. 확실하지 않은 칸은 비워 두세요 — 지어내면 안 됩니다.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '받은 문의 원문 그대로 (가공하지 말 것)' },
        fields: {
          type: 'object',
          description: '당신이 원문에서 읽어낸 값. 파서가 못 읽은 칸을 이것으로 채운다.',
          properties: {
            company_name: { type: 'string', description: '거래처(업체명)' },
            contact_name: { type: 'string', description: '담당자 성함' },
            phone: { type: 'string', description: '연락처' },
            event_name: { type: 'string', description: '행사명' },
            location: { type: 'string', description: '장소' },
            event_start: { type: 'string', description: '시작일 YYYY-MM-DD' },
            event_end: { type: 'string', description: '종료일 YYYY-MM-DD (당일이면 비움)' },
            event_time: { type: 'string', description: '근무 시간 (예: 09:00 ~ 18:00)' },
            service_type: { type: 'string', description: '직무' },
            required_staff: { type: 'number', description: '필요 인원 (숫자)' },
            pay_detail: { type: 'string', description: '페이 원문 (예: 팀장 18 / 스탭 14)' },
            attire: { type: 'string', description: '복장' },
            meal: { type: 'string', description: '식사' },
            parking: { type: 'string', description: '주차' },
            notes: { type: 'string', description: '특이사항' },
          },
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'draft_assignment',
    description:
      '추천한 크루를 그 행사의 배정표 초안으로 만든다. 저장하지 않는다 — ' +
      '사장님이 [이대로 입력]을 눌러야 들어간다. ' +
      'recommend_staff 로 뽑은 뒤 사장님이 "이 사람들로 해줘" 하면 이것을 쓴다. ' +
      '이름만 주면 크루 카드에서 연락처·계좌를 찾아 채우고, 지급단가는 단가표에서 가져온다. ' +
      '그날 다른 현장에 잡힌 사람이 섞여 있으면 경고가 함께 온다. ' +
      '★ 사장님이 누구를 넣을지 고르기 전에는 부르지 마세요. 추천은 추천일 뿐입니다.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'search_events 가 준 id' },
        keyword: { type: 'string', description: 'id 를 모를 때 쓰는 검색어' },
        staff: {
          type: 'array',
          description: '배정할 사람들',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '크루 이름 (크루 카드에 있는 그대로)' },
              job_type: { type: 'string', description: '맡을 직무. 비우면 문의의 직무' },
              is_leader: { type: 'boolean', description: '팀장이면 true' },
              pay_rate: { type: 'number', description: '지급단가(원/일). 비우면 단가표 값' },
              work_days: {
                type: 'number',
                description: '며칠 일하는지. ★ 사장님이 말한 값만 넣으세요. ' +
                  '모르면 비우세요 — 운영일 수로 멋대로 채우면 지급액이 틀어집니다.',
              },
            },
            required: ['name'],
          },
        },
      },
      required: ['staff'],
    },
  },
  {
    name: 'draft_estimate',
    description:
      '행사 하나에 대한 견적서 초안을 만든다. 단가는 ERP 단가표(roles)에서 가져오고 ' +
      '공급가·부가세·원가·이익률까지 계산한다. 저장하지 않는다 — [이대로 입력]을 눌러야 들어간다. ' +
      '직무 구성(lines)을 주면 그대로, 안 주면 문의의 필요 인원으로 한 줄 만든다. ' +
      '최소 이익률(일반 30%·고난이도 40%)에 못 미치면 경고가 함께 온다. ' +
      '부대비용은 자동으로 만들지 않는다 — 사람이 직접 적는 값이다.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'search_events 가 준 id' },
        keyword: { type: 'string', description: 'id 를 모를 때 쓰는 검색어' },
        hard: { type: 'boolean', description: '고난이도 행사면 true (최소 이익률 40%)' },
        lines: {
          type: 'array',
          description: '직무 구성. 비우면 문의의 필요 인원으로 한 줄.',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', description: '직무 이름 (단가표의 role_name)' },
              quantity: { type: 'number', description: '인원' },
              days: { type: 'number', description: '일수. 비우면 운영일 수' },
              is_leader: { type: 'boolean', description: '팀장이면 true (팀장수당 가산)' },
            },
            required: ['role', 'quantity'],
          },
        },
      },
    },
  },
  {
    name: 'draft_outreach',
    description:
      '추천·배정한 크루에게 보낼 섭외 카톡 문구를 만든다. 행사 날짜·시간·장소·복장·일당을 ' +
      'ERP에서 그대로 꺼내 넣으므로 사람이 다시 옮겨 적지 않아도 된다. ' +
      '보내지는 않는다 — 사장님이 화면에서 복사해 카톡으로 보낸다. ' +
      '★ 추천을 마친 뒤 "섭외 문구도 만들어드릴까요?" 하고 여쭙고, 하라고 하시면 이것을 쓴다. ' +
      '이름을 주면 그 사람 이름이 박힌 문구를 한 명씩 만들어 준다.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'search_events 가 준 id' },
        keyword: { type: 'string', description: 'id 를 모를 때 쓰는 검색어' },
        names: {
          type: 'array',
          description: '문구를 보낼 크루 이름들 (크루 카드에 있는 그대로). 비우면 공통 문구만 만든다.',
          items: { type: 'string' },
        },
        job: { type: 'string', description: '문구에 적을 직무. 비우면 문의의 직무' },
        pay_rate: { type: 'number', description: '일당(원/일). 비우면 단가표의 지급단가' },
        deadline: { type: 'string', description: "회신 기한 (예: '오늘 저녁', '내일 오전')" },
        note: { type: 'string', description: '덧붙일 말 (예: 식사 제공, 주차 지원)' },
      },
    },
  },
]

// ─── 도구 실행 ────────────────────────────────────────────

type ToolInput = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

export async function runTool(
  name: string, input: ToolInput, erp: ErpData, drafts?: DraftBox,
): Promise<string> {
  switch (name) {
    case 'search_events':    return searchEvents(input, erp)
    case 'get_event_detail': return eventDetail(input, erp)
    case 'recommend_staff':  return recommendStaff(input, erp)
    case 'get_staff_detail': return staffDetail(input, erp)
    case 'search_settlements': return searchSettlements(input, erp)
    case 'get_summary':      return summary(input, erp)
    case 'draft_inquiry':    return draftInquiry(input, drafts)
    case 'draft_estimate':   return draftEstimate(input, erp, drafts)
    case 'draft_assignment': return draftAssignment(input, erp, drafts)
    case 'draft_outreach':   return draftOutreach(input, erp, drafts)
    default: return `알 수 없는 도구: ${name}`
  }
}

// ─── 초안 만들기 (저장하지 않는다) ────────────────────────

function draftInquiry(input: ToolInput, drafts?: DraftBox): string {
  const text = str(input.text)
  if (!text) return '문의 원문(text)이 필요합니다.'

  // ERP 파서는 라벨이 붙은 양식만 읽는다. 줄글로 온 문의는 거의 못 읽으므로,
  // 원문을 직접 읽은 AI 가 준 값으로 빈 칸을 메운다. 파서가 읽은 값이 우선이다 —
  // 양식대로 쓴 글이라면 그쪽이 사람이 의도한 그대로이기 때문이다.
  const parsed = parseInquiryText(text) as Record<string, unknown>
  const fromAi = (input.fields && typeof input.fields === 'object')
    ? input.fields as Record<string, unknown> : {}

  const merged: Record<string, unknown> = { ...parsed }
  const filledByAi: string[] = []
  for (const [k, v] of Object.entries(fromAi)) {
    const cur = merged[k]
    const empty = cur === undefined || cur === null || cur === '' || cur === 0
    if (empty && v !== undefined && v !== null && v !== '') {
      merged[k] = v
      filledByAi.push(k)
    }
  }

  const confidence = calcParseConfidence(merged)
  const draft = buildInquiryDraft(merged, confidence)
  drafts?.add(draft)

  const f = draft.fields
  const show = (label: string, key: string) => {
    const v = f[key]
    return `${label}: ${v === undefined || v === null || v === '' ? '(못 읽음)' : v}`
  }

  return [
    `[문의 초안] 읽어낸 확신도 ${confidence}%`,
    show('거래처', 'company_name'),
    show('담당자', 'contact_name'),
    show('연락처', 'phone'),
    show('행사명', 'event_name'),
    show('장소', 'location'),
    show('기간', 'event_start') + ' ~ ' + (f.event_end || '(당일)'),
    show('시간', 'event_time'),
    show('직무', 'service_type'),
    show('인원', 'required_staff'),
    show('페이', 'pay_detail'),
    show('복장', 'attire'),
    show('식사', 'meal'),
    show('주차', 'parking'),
    f.notes ? `특이사항: ${f.notes}` : '',
    '',
    draft.missing.length
      ? `⚠ 비어 있는 칸: ${draft.missing.join(', ')} — 이 값들은 사장님이 채우셔야 합니다.`
      : '✓ 필수 칸이 모두 채워졌습니다.',
    filledByAi.length
      ? `※ 양식 라벨이 없어 ERP 파서가 못 읽은 칸(${filledByAi.join(', ')})은 원문을 직접 읽어 채웠습니다. 사장님 확인이 필요합니다.`
      : '',
    '',
    '※ 아직 저장하지 않았습니다. 화면의 [이대로 입력] 버튼을 눌러야 문의로 등록됩니다.',
    '※ 위 내용을 사장님께 그대로 읽어드리고, 못 읽은 칸이 있으면 무엇인지 짚어주세요.',
  ].filter(Boolean).join('\n')
}

async function draftAssignment(input: ToolInput, erp: ErpData, drafts?: DraftBox): Promise<string> {
  const found = resolveEvent(await erp.inquiries(), str(input.event_id), str(input.keyword))
  if ('error' in found) return found.error
  const ev = found.event

  const wanted = Array.isArray(input.staff) ? input.staff : []
  if (wanted.length === 0) return '배정할 사람(staff)이 없습니다.'

  const [staffList, assigns, inquiries, roles] = await Promise.all([
    erp.staff(), erp.assignments(), erp.inquiries(), erp.roles(),
  ])
  const inqById = new Map(inquiries.map(i => [i.id, i]))
  const eventDates = eventDatesOf(ev)
  const targetDates = new Set(eventDates)

  // 그날 다른 현장에 잡힌 사람 — 배정 직전에 한 번 더 본다.
  // 추천을 뽑은 뒤 사장님이 고민하는 사이에 다른 행사가 잡혔을 수 있다.
  const busy = new Map<string, string>()
  assigns.forEach(a => {
    if (!a.inquiry_id || a.inquiry_id === ev.id) return
    if (!BUSY_STATUSES.includes(a.status)) return
    const other = inqById.get(a.inquiry_id)
    if (!workDatesOf(a, other).some(d => targetDates.has(d))) return
    const key = staffKey(a.staff_id, a.staff_name)
    if (key) busy.set(key, other?.event_name || other?.company_name || '다른 현장')
  })

  // 이미 이 행사에 들어가 있는 사람 — 두 번 넣으면 지급이 겹친다
  const already = new Set(
    assigns.filter(a => a.inquiry_id === ev.id && a.status !== '취소')
      .map(a => cleanStaffName(a.staff_name)).filter(Boolean))

  const warnings: string[] = []
  const rows: AssignmentRow[] = []

  for (const raw of wanted) {
    const o = raw as Record<string, unknown>
    const name = String(o.name ?? '').trim()
    if (!name) continue

    if (already.has(cleanStaffName(name))) {
      warnings.push(`${name} 은(는) 이미 이 행사에 배정돼 있어 건너뛰었습니다.`)
      continue
    }

    const { hit: s, close } = findStaffByName(staffList, name)
    if (!s) {
      // 이름 그대로 넣지 않는다 — 카드도 계좌도 없는 유령 배정이 생긴다
      warnings.push(
        close.length
          ? `'${name}' 을(를) 크루 목록에서 못 찾아 넣지 않았습니다. 혹시 이 사람인가요? ` +
            `${close.slice(0, 5).map(c => c.name).join(' / ')} — 정확한 이름으로 다시 불러주세요.`
          : `'${name}' 을(를) 크루 목록에서 못 찾아 넣지 않았습니다. 이름을 확인해주세요.`)
      continue
    }

    const jobType = str(o.job_type) || ev.service_type || '행사스탭'
    const role = findRole(roles, jobType)
    const isLeader = o.is_leader === true

    // 지급단가 — 사장님이 준 값 > 단가표 > 0
    const payRate = typeof o.pay_rate === 'number' && o.pay_rate > 0
      ? o.pay_rate
      : (role?.pay_price ?? 0)
    if (payRate === 0) {
      warnings.push(`${name} 의 지급단가를 못 정했습니다(직무 '${jobType}' 가 단가표에 없음). 0원으로 두었습니다.`)
    }

    // ★ work_days 는 사람이 적는 값이다. 운영일 수로 자동으로 밀면
    //   2일 일한 사람에게 13일치가 잡히고 지급액이 통째로 틀어진다.
    //   말해준 값이 없으면 기존 화면과 같은 기본값 1을 쓴다.
    const givenDays = typeof o.work_days === 'number' && o.work_days > 0 ? o.work_days : undefined
    const workDays = givenDays ?? 1
    if (!givenDays && eventDates.length > 1) {
      warnings.push(
        `${name} 의 근무 일수를 ${eventDates.length}일 행사인데 1일로 두었습니다. ` +
        `며칠 일하는지는 사람마다 달라 자동으로 채우지 않습니다 — 다르면 말씀해주세요.`)
    }

    const conflict = busy.get(staffKey(s.id, s.name))

    rows.push({
      staff_id: s?.id,
      staff_name: s?.name ?? name,
      job_type: jobType,
      pay_rate: payRate,
      work_days: workDays,
      role_type: isLeader ? '팀장' : undefined,
      phone: s?.phone,
      why: role ? `단가표 ${role.role_name}` : undefined,
      warn: [
        conflict ? `그날 '${conflict}' 에 잡혀 있음` : '',
        !s.phone ? '연락처 없음' : '',
      ].filter(Boolean).join(' · ') || undefined,
    })
  }

  if (rows.length === 0) {
    return ['넣을 사람이 없습니다.', ...warnings.map(w => `⚠ ${w}`),
      '', '※ 이름이 하나라도 틀리면 그 사람은 넣지 않습니다. 배정은 연락처·계좌와 이어지는 값이라, ' +
      '비슷한 이름으로 넣으면 지급이 엉뚱한 곳으로 갑니다.'].join('\n')
  }

  const payTotal = rows.reduce((t, r) => t + r.pay_rate * r.work_days, 0)
  const draft = {
    kind: 'assignment' as const,
    inquiry_id: ev.id,
    company_name: ev.company_name || '',
    event_name: ev.event_name || '',
    event_start: ev.event_start ?? undefined,
    event_end: ev.event_end ?? undefined,
    rows,
    totals: { people: rows.length, payTotal },
    warnings,
  }
  drafts?.add(draft)

  const need = ev.required_staff ?? 0
  return [
    `[배정 초안] ${draft.company_name} / ${draft.event_name}`,
    `운영일 ${eventDates.length}일 (${eventDates[0] ?? '미정'}${eventDates.length > 1 ? ` ~ ${eventDates[eventDates.length - 1]}` : ''})` +
      `${need ? ` | 필요 ${need}명` : ''} | 이번에 넣을 사람 ${rows.length}명`,
    '',
    '이름 | 직무 | 지급단가 | 일수 | 지급예정 | 연락처',
    ...rows.map(r =>
      `${r.staff_name}${r.role_type === '팀장' ? '(팀장)' : ''} | ${r.job_type} | ${won(r.pay_rate)} | ` +
      `${r.work_days}일 | ${won(r.pay_rate * r.work_days)} | ${r.phone || '없음'}` +
      (r.warn ? `  ⚠ ${r.warn}` : '')),
    '',
    `지급 예정 합계 ${won(payTotal)}`,
    ...(need && rows.length < need ? [`※ 필요 ${need}명 중 ${rows.length}명입니다. ${need - rows.length}명이 더 필요합니다.`] : []),
    ...(warnings.length ? ['', ...warnings.map(w => `⚠ ${w}`)] : []),
    '',
    "※ 상태는 '배정중' 으로 넣습니다. 확정은 섭외가 끝난 뒤 배정 화면에서 바꾸세요.",
    '※ 아직 저장하지 않았습니다. 화면의 [이대로 입력] 버튼을 눌러야 배정표에 들어갑니다.',
    '※ 근무 일수는 자동으로 채우지 않습니다. 사람마다 다르게 적는 값이라, 멋대로 채우면 지급액이 틀어집니다.',
  ].join('\n')
}

async function draftEstimate(input: ToolInput, erp: ErpData, drafts?: DraftBox): Promise<string> {
  const found = resolveEvent(await erp.inquiries(), str(input.event_id), str(input.keyword))
  if ('error' in found) return found.error

  const roles = await erp.roles()
  const rawLines = Array.isArray(input.lines) ? input.lines : undefined
  const lines = rawLines?.map(l => {
    const o = l as Record<string, unknown>
    return {
      role: String(o.role ?? ''),
      quantity: Number(o.quantity ?? 0),
      days: o.days === undefined ? undefined : Number(o.days),
      is_leader: o.is_leader === true,
    }
  }).filter(l => l.role && l.quantity > 0)

  const built = buildEstimateDraft({
    inquiry: found.event, roles, lines, hard: input.hard === true,
  })
  if ('error' in built) {
    return built.error + `\n\n참고 — 단가표에 있는 직무: ${roles.map(r => r.role_name).join(', ')}`
  }
  drafts?.add(built)

  const t = built.totals
  return [
    `[견적 초안] ${built.company_name} / ${built.event_name}`,
    '',
    '품목 | 인원 | 일수 | 청구단가 | 지급단가 | 소계',
    ...built.items.map(it =>
      `${it.role_name}${it.is_leader ? '(팀장)' : ''} | ${it.quantity}명 | ${it.days}일 | ` +
      `${won(it.unit_price)} | ${won(it.pay_unit_price)} | ${won(it.quantity * it.days * it.unit_price)}`),
    '',
    `공급가 ${won(t.supply)} / 부가세 ${won(t.vat)} / 합계 ${won(t.total)}`,
    `원가(지급) ${won(t.cost)} / 예상이익 ${won(t.profit)} / 이익률 ${t.profit_rate}%`,
    ...(built.warnings.length ? ['', ...built.warnings.map(w => `⚠ ${w}`)] : []),
    ...(built.items.some(it => it.unit_price === 0)
      ? [`단가표에 있는 직무: ${roles.map(r => r.role_name).join(' / ')}`,
         '→ 이 중에서 고른 뒤 lines 로 다시 불러 주세요.']
      : []),
    '',
    '※ 아직 저장하지 않았습니다. 화면의 [이대로 입력] 버튼을 눌러야 견적서로 등록됩니다.',
    '※ 부대비용(교통·숙박·식비)은 사람이 직접 적는 값이라 초안에 넣지 않았습니다.',
  ].join('\n')
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
  const needRaw = num(input.limit)
  const includeHeld = input.include_held === true

  const [inquiries, assigns, staffList, evals] = await Promise.all([
    erp.inquiries(), erp.assignments(), erp.staff(), erp.evaluations(),
  ])

  const targetDates = new Set(eventDatesOf(ev))
  if (targetDates.size === 0) {
    return `'${ev.event_name}' 은 행사일이 정해지지 않아 그날 비는 사람을 가릴 수 없습니다. ` +
      `행사일을 먼저 정해야 제대로 추천할 수 있습니다.`
  }

  const today = new Date().toISOString().slice(0, 10)
  const inqById = new Map(inquiries.map(i => [i.id, i]))
  const norm = (s?: string | null) => (s || '').trim().toLowerCase()
  const evClient = norm(ev.company_name), evPlace = norm(ev.location), evName = norm(ev.event_name)

  // ── ① 그날 다른 현장에 잡힌 사람 ──────────────────────
  const busy = new Map<string, string>()
  assigns.forEach(a => {
    if (!a.inquiry_id || a.inquiry_id === ev.id) return
    if (!BUSY_STATUSES.includes(a.status)) return
    const other = inqById.get(a.inquiry_id)
    if (!workDatesOf(a, other).some(d => targetDates.has(d))) return
    const key = staffKey(a.staff_id, a.staff_name)
    if (key) busy.set(key, other?.event_name || other?.company_name || '다른 현장')
  })

  // ── ② 근무 이력 쌓기 ──────────────────────────────────
  type Hist = {
    sameClient: number; samePlace: number; sameEvent: number
    total: number; recent90: number
    lastDate: string; lastWhere: string
  }
  const hist = new Map<string, Hist>()
  const d90 = new Date(); d90.setDate(d90.getDate() - 90)
  const since90 = d90.toISOString().slice(0, 10)

  assigns.forEach(a => {
    if (a.inquiry_id === ev.id || a.status === '취소') return
    const key = staffKey(a.staff_id, a.staff_name)
    if (!key) return
    const past = a.inquiry_id ? inqById.get(a.inquiry_id) : undefined
    const h = hist.get(key) || {
      sameClient: 0, samePlace: 0, sameEvent: 0, total: 0, recent90: 0, lastDate: '', lastWhere: '',
    }
    h.total++
    if (past) {
      if (evClient && norm(past.company_name) === evClient) h.sameClient++
      if (evPlace && norm(past.location) === evPlace) h.samePlace++
      if (evName && norm(past.event_name) === evName) h.sameEvent++
      const d = past.event_start?.slice(0, 10) || ''
      if (d && d <= today && d >= since90) h.recent90++
      if (d && d > h.lastDate) {
        h.lastDate = d
        h.lastWhere = `${past.company_name || ''} ${past.event_name || ''}`.trim()
      }
    }
    hist.set(key, h)
  })

  // ── ③ 재추천 아니오 이력 ──────────────────────────────
  const noReco = new Set<string>()
  evals.forEach(e => {
    if (e.re_recommend === false) {
      const k = staffKey(e.staff_id, e.staff_name)
      if (k) noReco.add(k)
    }
  })

  // ── ④ 하드 필터 → 소프트 점수 ─────────────────────────
  // 꼭 필요한 조건은 '있다/없다'로 거르고, 나머지는 '얼마나 잘 맞나'로 순위를 낸다.
  // 이 둘을 섞으면 안 맞는 사람이 점수로 올라온다.
  type Cand = {
    s: Staff; key: string; grade: Grade; status: PoolStatus
    score: number; why: string[]; warn: string[]; h?: Hist
  }
  const cands: Cand[] = []
  const cut = { busy: 0, notAssignable: 0, job: 0, headOffice: 0, noBasis: 0 }

  for (const s of staffList) {
    const key = staffKey(s.id, s.name)
    if (!key) continue

    const h = hist.get(key)
    const grade = gradeOf(s.total_score, h?.total ?? 0)
    const status = statusOf({
      grade, lastWorkDate: h?.lastDate, recommend: s.recommend,
      hasNegativeEval: noReco.has(key), today,
    })

    // 하드 필터
    if (isHeadOffice(s)) { cut.headOffice++; continue }
    if (busy.has(key)) { cut.busy++; continue }
    if (!includeHeld && !isAssignable(status)) { cut.notAssignable++; continue }
    if (jobFilter) {
      const jobs = s.available_jobs || []
      if (jobs.length > 0 && !jobs.some(j => j.includes(jobFilter) || jobFilter.includes(j))) {
        cut.job++; continue
      }
    }

    // 소프트 점수
    const why: string[] = []
    const warn: string[] = []
    let score = 0

    if (h) {
      if (h.sameClient > 0) { score += Math.min(h.sameClient, 4) * 100; why.push(`${ev.company_name} ${h.sameClient}회`) }
      if (h.sameEvent > 0)  { score += Math.min(h.sameEvent, 3) * 80;  why.push(`같은 행사 ${h.sameEvent}회`) }
      if (h.samePlace > 0 && norm(ev.location) !== evClient) {
        score += Math.min(h.samePlace, 3) * 60; why.push(`같은 장소 ${h.samePlace}회`)
      }
      score += Math.min(h.total, 20) * 3
      if (why.length === 0 && h.total > 0) why.push(`총 ${h.total}회`)
    }

    // 품질 — 평점을 직접 쓴다.
    // 등급(S/A/B)은 사람이 읽기 위한 라벨일 뿐이다. 등급 계단으로 점수를 주면
    // 배정 2회라 '미분류'가 된 평점 4.4가, 'B' 3.1보다 낮게 평가되는 뒤집힘이 생긴다.
    // 실제로 우리 데이터는 평점 보유자의 81%가 배정 3회 미만이라 이 뒤집힘이 흔하다.
    // 대신 데이터가 얇으면 신뢰도를 깎는다 — 무시하지도, 그대로 믿지도 않는다.
    const rating = s.total_score || 0
    const thin = (h?.total ?? 0) < MIN_WORKS_FOR_GRADE
    score += rating * 18 * (thin ? 0.7 : 1)
    why.push(`${grade}등급${rating ? `(${rating})` : ''}`)

    // 기회 균등 — 최근 90일에 덜 나간 사람을 조금 올린다.
    // 잘하는 사람만 계속 부르면 나머지가 조용히 이탈한다.
    if (h && h.total >= MIN_WORKS_FOR_GRADE && h.recent90 === 0) {
      score += 35; why.push('최근 한산')
    }

    // 적합성 — 지역
    if (evPlace && s.region) {
      const mine = norm(s.region).split(/[,·/]/).map(x => x.trim()).filter(Boolean)
      if (mine.some(r => r && (evPlace.includes(r) || r.includes('전국')))) {
        score += 40; why.push(`${s.region} 거주`)
      }
    }

    if (status === '잠재') warn.push('6개월+ 미투입')
    if (s.recommend === '우선투입') { score += 25; why.push('우선투입') }
    if (noReco.has(key)) warn.push('재추천 아니오 이력')
    if (!s.phone) warn.push('연락처 없음')

    if (score <= 0) { cut.noBasis++; continue }
    cands.push({ s, key, grade, status, score, why, warn, h })
  }

  if (cands.length === 0) {
    return '조건을 통과한 크루가 없습니다. ' +
      `(그날 잡힘 ${cut.busy}명 / 투입불가·관찰 ${cut.notAssignable}명 / 직무 불일치 ${cut.job}명 제외)`
  }

  cands.sort((a, b) => b.score - a.score)

  // 필요 인원의 1.5배를 기본으로 뽑는다 — 섭외하면 거절이 나오기 때문
  const need = ev.required_staff ?? 0
  const limit = needRaw ?? Math.min(Math.max(need > 0 ? Math.ceil(need * 1.5) : 12, 8), 40)
  const top = cands.slice(0, limit)

  // 매칭률 — 보여줄 목록 안에서 최저~최고를 60~99%로 펼친다.
  // 1등 대비 비율로 하면 1등 점수가 튈 때 나머지가 전부 하한에 뭉개진다
  // (실제로 7위부터 40위까지 전부 55%로 붙어 버렸다).
  const hi = Math.max(...top.map(c => c.score))
  const lo = Math.min(...top.map(c => c.score))
  const rate = (sc: number) =>
    hi === lo ? 90 : Math.round(60 + ((sc - lo) / (hi - lo)) * 39)

  // ── ⑤ 출력 ───────────────────────────────────────────
  const dates = [...targetDates].sort()
  const need1 = dates.length === 1 ? dates[0] : `${dates[0]}~${dates[dates.length - 1]} (${dates.length}일)`

  const lines: string[] = [
    `[추천 대상] ${ev.company_name || '-'} / ${ev.event_name || '-'}`,
    `운영일 ${need1} | 필요 ${need || '?'}명${jobFilter ? ` | 직무 '${jobFilter}'` : ''}`,
    `현장 ${ev.location || '-'}${ev.event_time ? ` | 시간 ${ev.event_time}` : ''}${ev.attire ? ` | 복장 ${ev.attire}` : ''}`,
    '',
    '[거른 과정]',
    `전체 크루 ${staffList.length}명`,
    `  ↓ 본사 직원                   -${cut.headOffice}명`,
    `  ↓ 그날 다른 현장에 잡힘        -${cut.busy}명`,
    `  ↓ 투입불가·관찰 등급          -${cut.notAssignable}명`,
    ...(jobFilter ? [`  ↓ 직무 '${jobFilter}' 안 맞음   -${cut.job}명`] : []),
    `  ↓ 근무이력·평점 둘 다 없음     -${cut.noBasis}명`,
    `조건 통과 ${cands.length}명 → 상위 ${top.length}명 추천` +
      (need > 0 && !needRaw ? ` (필요 ${need}명의 1.5배)` : ''),
    '',
  ]

  // 등급 분포
  const dist: Record<string, number> = {}
  top.forEach(c => { dist[c.grade] = (dist[c.grade] || 0) + 1 })
  lines.push('[추천 명단의 등급 분포] ' +
    (['S', 'A', 'B', '미분류', 'C'] as Grade[])
      .filter(g => dist[g]).map(g => `${g} ${dist[g]}명`).join(' / '))

  const experienced = top.filter(c => (c.h?.sameClient || 0) + (c.h?.sameEvent || 0) + (c.h?.samePlace || 0) > 0).length
  lines.push(`이 중 ${experienced}명은 이 현장/거래처를 해본 사람입니다.`, '')

  lines.push('[추천 명단] 순위 | 매칭률 | 이름 | 등급·상태 | 근거 | 연락처')
  top.forEach((c, idx) => {
    const last = c.h?.lastDate ? ` · 최근 ${c.h.lastDate} ${c.h.lastWhere}` : ' · 근무이력 없음'
    const warnTxt = c.warn.length ? `  ⚠ ${c.warn.join(', ')}` : ''
    lines.push(
      `${idx + 1}. ${rate(c.score)}% | ${c.s.name}(${c.s.gender || '?'}/${c.s.age ?? '?'}세/${c.s.region || '지역미상'})` +
      ` | ${c.grade}·${c.status} | ${c.why.join(' · ')}${last} | ${c.s.phone || '없음'}${warnTxt}`,
    )
  })

  lines.push('',
    '※ 순위 규칙: 먼저 하드 필터(그날 겹침·투입불가·직무)로 거르고, 남은 사람을 ' +
    '현장 경험 > 평점 > 기회 균등 > 지역 순으로 점수를 매겼습니다. 매칭률은 이 목록 안에서 최저~최고를 펼친 상대값이라, 다른 행사의 %와 비교하면 안 됩니다.',
    '※ 겹침은 배정에 적힌 근무일(work_dates) 기준으로 이미 걸렀습니다. 근무일이 비어 있는 배정만 ' +
    '행사 전 기간 근무로 봤습니다. 행사 기간이 길어도 그 사람의 근무일이 아니면 겹치는 것이 아니니, ' +
    '위 목록에 있는 사람은 그날 비어 있다고 보시면 됩니다.',
    '※ 배정은 사람이 정합니다. ⚠ 가 붙은 사람을 윗자리에 올릴 때는 그 사실을 함께 밝히세요.')

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

  const mine = assigns
    .filter(a => staffKey(a.staff_id, a.staff_name) === key && a.status !== '취소')
    .map(a => ({ a, i: a.inquiry_id ? inqById.get(a.inquiry_id) : undefined }))
    .sort((x, y) => (y.i?.event_start || '').localeCompare(x.i?.event_start || ''))

  const myEvalsAll = evals.filter(e => staffKey(e.staff_id, e.staff_name) === key)
  const hasNegative = myEvalsAll.some(e => e.re_recommend === false)
  const lastWork = mine.map(m => m.i?.event_start?.slice(0, 10) || '')
    .filter(d => d && d <= today()).sort().pop()
  const grade = gradeOf(s.total_score, mine.length)
  const status = statusOf({ grade, lastWorkDate: lastWork, recommend: s.recommend, hasNegativeEval: hasNegative })

  const lines = [
    `[크루] ${s.name} (${s.gender || '?'}/${s.age ?? '?'}세/${s.region || '지역미상'}) ${s.phone || ''}`,
    `등급 ${grade} — ${GRADE_DESC[grade]}`,
    `상태 ${status} — ${STATUS_DESC[status]}`,
    `평점 ${s.total_score} [${s.recommend}] — 근태 ${s.attendance_score} 직무 ${s.performance_score}` +
    ` 용모 ${s.appearance_score} 팀워크 ${s.teamwork_score} 적응 ${s.adaptability_score}`,
    `가능직무 ${(s.available_jobs || []).join(', ') || '-'} | 자격 ${(s.certifications || []).join(', ') || '-'}`,
  ]
  if (mine.length < MIN_WORKS_FOR_GRADE) {
    lines.push(`※ 근무 ${mine.length}회로 ${MIN_WORKS_FOR_GRADE}회 미만이라 등급을 매기지 않았습니다(수습).`)
  }
  if (s.memo) lines.push(`메모: ${s.memo}`)

  lines.push('', `[근무 이력] 총 ${mine.length}건 (최근 12건)`)
  mine.slice(0, 12).forEach(({ a, i }) => lines.push(
    `- ${i?.event_start?.slice(0, 10) || '날짜?'} | ${i?.company_name || '-'} | ${i?.event_name || a.event_name || '-'}` +
    ` | ${a.job_type || '-'}${a.role_type === '팀장' ? '(팀장)' : ''} | ${a.status}`))

  const myEvals = [...myEvalsAll]
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

  // 풀 건강 — 등급·상태 분포. 매달 엑셀로 세지 않아도 되게.
  const assigns = await erp.assignments()
  const worked = new Map<string, { n: number; last: string }>()
  const inqById2 = new Map(inqs.map(i => [i.id, i]))
  assigns.forEach(a => {
    if (a.status === '취소') return
    const k = staffKey(a.staff_id, a.staff_name)
    if (!k) return
    const d = (a.inquiry_id ? inqById2.get(a.inquiry_id)?.event_start : '')?.slice(0, 10) || ''
    const cur = worked.get(k) || { n: 0, last: '' }
    cur.n++
    if (d && d <= today() && d > cur.last) cur.last = d
    worked.set(k, cur)
  })
  const gradeDist: Record<string, number> = {}
  const statusDist: Record<string, number> = {}
  staffList.forEach(s => {
    const k = staffKey(s.id, s.name)
    const w = worked.get(k)
    const g = gradeOf(s.total_score, w?.n ?? 0)
    const st = statusOf({ grade: g, lastWorkDate: w?.last, recommend: s.recommend })
    gradeDist[g] = (gradeDist[g] || 0) + 1
    statusDist[st] = (statusDist[st] || 0) + 1
  })
  const activeRate = Math.round(((statusDist['활성'] || 0) / Math.max(1, staffList.length)) * 100)
  const saRate = Math.round((((gradeDist['S'] || 0) + (gradeDist['A'] || 0)) / Math.max(1, staffList.length)) * 100)

  return [
    `=== 전체 현황 (${today()} 기준) ===`,
    `[문의/행사] 전체 ${inqs.length}건 | ${month} 운영 ${monthly.length}건 | 앞으로 ${upcoming}건 | 행사일 미정 ${undated}건`,
    `상태: ${dist(inqs, 'status')}`,
    `[정산] ${uniq.length}건 | 청구 ${won(invoice)} / 입금 ${won(received)} / 미수 ${won(unpaidTotal(uniq))} (미수 발생 ${owedCount}건)`,
    `입금상태: ${dist(uniq, 'deposit_status')}`,
    `[지급] ${payouts.length}건 | ` + Object.entries(payByStatus)
      .sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `${k} ${v.n}건(${won(v.sum)})`).join(' / '),
    `[크루] ${staffList.length}명 | 평가완료 ${rated.length}명 / 평균 ${avg}점`,
    `등급: ${(['S', 'A', 'B', 'C', 'X', '미분류'] as Grade[])
      .filter(g => gradeDist[g]).map(g => `${g} ${gradeDist[g]}명`).join(' / ')}`,
    `상태: ${(['활성', '잠재', '관찰', '비활성'] as PoolStatus[])
      .filter(s => statusDist[s]).map(s => `${s} ${statusDist[s]}명`).join(' / ')}`,
    `풀 건강: 활성률 ${activeRate}% · S·A 비율 ${saRate}%`,
    '',
    '※ 위 합계·건수는 전체를 집계한 정확한 값입니다. 더 자세한 것은 다른 도구로 조회하세요.',
    `※ 등급은 평점을 번역한 것입니다(S 4.5↑ / A 3.8↑ / B 3.0↑ / C 2.0↑ / X 2.0미만). ` +
    `근무 ${MIN_WORKS_FOR_GRADE}회 미만은 '미분류(수습)'로 두고 매기지 않습니다.`,
  ].join('\n')
}

/** 섭외 문구 초안 — 보내지 않는다. 사장님이 복사해서 카톡으로 보낸다. */
async function draftOutreach(input: ToolInput, erp: ErpData, drafts?: DraftBox): Promise<string> {
  const found = resolveEvent(await erp.inquiries(), str(input.event_id), str(input.keyword))
  if ('error' in found) return found.error
  const ev = found.event

  const [staffList, assigns, roles, items] = await Promise.all([
    erp.staff(), erp.assignments(), erp.roles(), erp.estimateItems(),
  ])

  const job = str(input.job) || ev.service_type || '행사스탭'
  const role = findRole(roles, job)
  const norm = (v?: string | null) => (v || '').trim().toLowerCase()

  // 일당 — 사장님이 준 값 > 이 행사 배정의 단가 > 견적에 적힌 지급단가 > 단가표.
  // 견적까지 보는 이유: 단가표에 없는 이름('보안요원' 처럼 부르는 말)으로 견적이 나가 있는 일이
  // 흔하다. 그때 금액 줄을 통째로 빼면, 견적서에는 있는 숫자를 사람이 다시 찾아 적게 된다.
  //
  // ★ 반드시 '같은 직무' 인 것만 본다. 문구에 적히는 금액은 받는 사람에게 약속으로 읽힌다.
  //   다른 직무의 단가를 끌어다 적느니 금액 줄을 비우는 편이 낫다.
  const sameJob = (v?: string | null) => {
    const a = norm(v), b = norm(job)
    return !!a && !!b && (a === b || a.includes(b) || b.includes(a))
  }
  const fromAssign = assigns.find(a =>
    a.inquiry_id === ev.id && a.status !== '취소' && (a.pay_rate ?? 0) > 0 && sameJob(a.job_type))
  const fromItem = items.find(it =>
    it.inquiry_id === ev.id && (it.pay_unit_price ?? 0) > 0 && sameJob(it.role_name))

  const given = num(input.pay_rate)
  const payRate = given && given > 0 ? given
    : (fromAssign?.pay_rate ?? fromItem?.pay_unit_price ?? role?.pay_price ?? 0)
  const paySource = given && given > 0 ? '사장님이 알려주신 금액'
    : fromAssign ? '이 행사 배정에 적힌 지급단가'
    : fromItem ? '이 행사 견적서의 지급단가'
    : role ? '단가표의 지급단가'
    : ''

  // 이름은 반드시 크루 카드에서 찾는다. 못 찾은 이름으로 문구를 만들면
  // 엉뚱한 사람에게 "○○님" 하고 보내게 된다 (AI가 한글 이름을 흘린 적이 있다).
  const wanted = Array.isArray(input.names) ? input.names.map(String) : []
  const people: Array<{ name: string; phone?: string }> = []
  const misses: string[] = []
  for (const raw of wanted) {
    const name = raw.trim()
    if (!name) continue
    const { hit, close } = findStaffByName(staffList, name)
    if (!hit) {
      misses.push(close.length
        ? `'${name}' 을(를) 크루 목록에서 못 찾았습니다. 혹시 ${close.slice(0, 5).map(c => c.name).join(' / ')} 인가요?`
        : `'${name}' 을(를) 크루 목록에서 못 찾아 문구를 만들지 않았습니다.`)
      continue
    }
    if (people.some(p => p.name === hit.name)) continue
    people.push({ name: hit.name, phone: hit.phone ?? undefined })
  }

  const draft = buildOutreachDraft({
    inquiry: ev,
    dates: eventDatesOf(ev),
    people,
    job,
    payRate,
    deadline: str(input.deadline),
    note: str(input.note),
  })
  draft.notes.push(...misses)
  // 어디서 온 금액인지 밝힌다 — 문구에 적힌 돈은 받는 사람에게 약속으로 읽힌다
  if (payRate > 0 && paySource) draft.notes.push(`일당 ${won(payRate)}은 ${paySource}입니다.`)
  drafts?.add(draft)

  return [
    `[섭외 문구 초안] ${draft.company_name} / ${draft.event_name} · ${job}`,
    people.length ? `보낼 사람 ${people.length}명: ${people.map(p => `${p.name}(${p.phone || '번호없음'})`).join(', ')}`
                  : '이름을 주지 않아 공통 문구만 만들었습니다.',
    '',
    '--- 문구 ---',
    draft.message,
    '--- 끝 ---',
    ...(draft.notes.length ? ['', ...draft.notes.map(n => `⚠ ${n}`)] : []),
    '',
    '※ 보내지 않았습니다. 화면의 카드에서 [복사]를 눌러 카톡에 붙여넣으세요.',
    '※ 이름이 박힌 문구는 사람마다 따로 만들어 카드에 있습니다.',
    '※ 금액은 하루치(일당)만 적었습니다. 총액은 사람마다 근무 일수가 달라 적지 않습니다.',
  ].join('\n')
}
