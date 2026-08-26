// 운영 캘린더 공용 계산 로직
// ─────────────────────────────────────────────────────────
// 필요인원·배정 판정 규칙은 인원배정 화면(AssignmentsContent + ScheduleView)과
// 반드시 동일해야 한다. 두 화면에서 숫자가 다르게 보이면 실무자가 신뢰를 잃는다.
// 그래서 규칙을 이 파일 한 곳에 모아 매트릭스와 상세 패널이 함께 쓴다.

import type { Assignment, EstimateItem } from '@/lib/supabase/types'

// ─── 상수 ─────────────────────────────────────────────────
/** 체결 이상 상태만 운영 캘린더에 노출 (대시보드 캘린더와 동일 기준) */
export const CONTRACTED_STATUSES = ['체결', '배정완료', '진행중', '완료', '정산완료']

/** 인력 품목이 아닌 견적 항목 (AssignmentsContent와 동일 목록) */
export const NON_STAFF_TYPES = ['교통비', '숙박비', '식비', '연장수당', '기타', '지원품목', '부대비용']

/** ScheduleView가 project_memos에 스케줄 설정을 저장할 때 쓰는 태그 */
export const CONFIG_TAG = '[스케줄_설정]'

export const DOW = ['일', '월', '화', '수', '목', '금', '토']

// ─── 타입 ─────────────────────────────────────────────────
export interface MemoRecord { id: string; inquiry_id: string; content: string }

export interface ScheduleConfig {
  customJobs: Array<{ jobType: string; required: number; payRate: number }>
  hiddenJobs: string[]
  requiredOverrides: Record<string, number>
  labelOverrides: Record<string, string>
}

export const EMPTY_CONFIG: ScheduleConfig = {
  customJobs: [], hiddenJobs: [], requiredOverrides: {}, labelOverrides: {},
}

/** 행사 1건의 직무 단위 기준값 (날짜 무관) */
export interface JobBase {
  jobType: string
  label: string
  required: number      // 필요 인원 (견적 수량 + 실무자 override)
  billRate: number      // 청구단가 (견적 unit_price)
  planPayRate: number   // 계획 지급단가 (견적 pay_unit_price)
  days: number
  assignments: Assignment[]   // 취소 제외
}

/** 특정 날짜 × 직무 셀 */
export interface JobCell {
  job: JobBase
  pinned: Assignment[]      // work_dates에 이 날짜가 명시된 인력
  allPeriod: Assignment[]   // work_dates 미지정 = 전체기간 투입
  total: number
}

// ─── 포맷 ─────────────────────────────────────────────────
export const pad = (n: number) => String(n).padStart(2, '0')

export const fmt = (n: number | null | undefined) =>
  n ? n.toLocaleString('ko-KR') : '-'

/** 표시용 크루 이름.
 *  일부 레코드는 staff_name에 주민번호가 붙어 저장돼 있다 (예: '이상수010503-3222217').
 *  이름이 크게 노출되는 화면이므로 표시할 때 숫자 부분을 떼어낸다.
 *  저장된 값은 건드리지 않는다 — 화면에서만 가린다. */
export function cleanStaffName(name?: string | null): string {
  const raw = (name ?? '').trim()
  if (!raw) return '(미상)'
  const stripped = raw
    .replace(/\d{6}\s*[-–]\s*\d{6,7}/g, '')   // 900101-1234567 형태
    .replace(/\d{6,}/g, '')                    // 하이픈 없이 붙은 긴 숫자
    .replace(/[-–\s]+$/, '')
    .trim()
  return stripped || '(미상)'
}

/** 오늘 날짜 (로컬 기준 — toISOString은 UTC라 오전에 하루 밀린다) */
export function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** start~end 사이의 모든 날짜를 YYYY-MM-DD로 (양끝 포함) */
export function getDateRange(start: string, end: string): string[] {
  const out: string[] = []
  const d = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  while (d <= e) {
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
    d.setDate(d.getDate() + 1)
  }
  return out
}

// ─── 스케줄 설정 파싱 ─────────────────────────────────────
/** project_memos 레코드 목록에서 행사별 스케줄 설정을 뽑아낸다.
 *  필요인원 override / 직무명 변경 / 숨긴 직무가 모두 여기 들어 있으므로,
 *  견적 quantity만 읽으면 실무자가 손으로 고친 값이 무시된다. */
export function parseConfigs(memos: MemoRecord[]): Map<string, ScheduleConfig> {
  const out = new Map<string, ScheduleConfig>()
  memos.forEach(m => {
    if (!m.content?.startsWith(CONFIG_TAG)) return
    try {
      const p = JSON.parse(m.content.slice(CONFIG_TAG.length + 1))
      out.set(m.inquiry_id, {
        customJobs:        p.customJobs        ?? [],
        hiddenJobs:        p.hiddenJobs        ?? [],
        requiredOverrides: p.requiredOverrides ?? {},
        labelOverrides:    p.labelOverrides    ?? {},
      })
    } catch { /* 설정 파싱 실패는 기본값으로 진행 */ }
  })
  return out
}

// ─── 직무 목록 구성 ───────────────────────────────────────
/** 견적 품목 + 기존 배정 + 실무자 설정을 합쳐 직무 목록을 만든다.
 *  AssignmentsContent의 슬롯 생성 + ScheduleView의 override 적용을 그대로 재현. */
export function buildJobs(
  items: EstimateItem[],
  assigns: Assignment[],
  cfg: ScheduleConfig,
): JobBase[] {
  const map = new Map<string, JobBase>()

  items
    .filter(it => !NON_STAFF_TYPES.includes(it.item_type || '') && it.unit_price > 0)
    .forEach(it => {
      const key = it.role_name || '기타'
      const cur = map.get(key)
      if (cur) {
        cur.required += it.quantity
      } else {
        map.set(key, {
          jobType: key,
          label: key,
          required: it.quantity,
          billRate: it.unit_price,
          planPayRate: it.pay_unit_price || 0,
          days: it.days || 1,
          assignments: [],
        })
      }
    })

  // 견적에 없는 직무로 배정된 인력도 별도 그룹으로 노출
  assigns.forEach(a => {
    const key = a.job_type || '기타'
    let g = map.get(key)
    if (!g) {
      g = {
        jobType: key, label: key, required: 0,
        billRate: 0, planPayRate: a.pay_rate || 0,
        days: a.work_days || 1, assignments: [],
      }
      map.set(key, g)
    }
    g.assignments.push(a)
  })

  // 실무자가 직접 추가한 직무
  cfg.customJobs.forEach(cj => {
    if (map.has(cj.jobType)) return
    map.set(cj.jobType, {
      jobType: cj.jobType, label: cj.jobType, required: cj.required,
      billRate: 0, planPayRate: cj.payRate, days: 1, assignments: [],
    })
  })

  return [...map.values()]
    .filter(g => !cfg.hiddenJobs.includes(g.jobType))
    .map(g => ({
      ...g,
      label:    cfg.labelOverrides[g.jobType] ?? g.jobType,
      required: cfg.requiredOverrides[g.jobType] ?? g.required,
    }))
    .sort((a, b) => b.required - a.required || a.jobType.localeCompare(b.jobType))
}

// ─── 날짜 판정 ────────────────────────────────────────────
/** ScheduleView와 동일한 규칙: work_dates가 비어 있으면 전체기간 투입으로 본다.
 *  이 fallback을 빼먹으면 날짜별 배정 인원 수가 실제보다 적게 나온다. */
export function splitByDate(assigns: Assignment[], date: string) {
  const pinned: Assignment[] = []
  const allPeriod: Assignment[] = []
  assigns.forEach(a => {
    const dates = a.work_dates
    const hasDates = Array.isArray(dates) && dates.length > 0
    if (!hasDates) allPeriod.push(a)
    else if (dates.includes(date)) pinned.push(a)
  })
  return { pinned, allPeriod }
}

export function makeCell(job: JobBase, date: string): JobCell {
  const { pinned, allPeriod } = splitByDate(job.assignments, date)
  return { job, pinned, allPeriod, total: pinned.length + allPeriod.length }
}

/** 행사가 이 날짜에 걸쳐 있는지 (event_end가 없으면 당일 행사) */
export function coversDate(
  start: string | undefined, end: string | undefined, date: string,
): boolean {
  const s = start?.substring(0, 10) ?? ''
  if (!s) return false
  const e = end?.substring(0, 10) || s
  return s <= date && date <= e
}

// ─── 충족 상태 ────────────────────────────────────────────
export type CellState = 'none' | 'short' | 'full' | 'over' | 'extra' | 'empty'

export function cellState(total: number, required: number): CellState {
  if (required > 0 && total === 0) return 'none'
  if (total === 0)                 return 'empty'
  if (required === 0)              return 'extra'
  if (total > required)            return 'over'
  if (total < required)            return 'short'
  return 'full'
}

export const STATE_STYLE: Record<CellState, {
  chip: string
  label: (total: number, required: number) => string
}> = {
  none:  { chip: 'bg-red-100 text-red-700 border-red-200',          label: (_t, r) => `미배정 · ${r}명 필요` },
  short: { chip: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: (t, r)  => `${r - t}명 부족` },
  full:  { chip: 'bg-green-100 text-green-700 border-green-200',    label: ()      => '충족' },
  over:  { chip: 'bg-orange-100 text-orange-700 border-orange-200', label: (t, r)  => `${t - r}명 초과` },
  extra: { chip: 'bg-blue-100 text-blue-700 border-blue-200',       label: ()      => '견적 외' },
  empty: { chip: 'bg-gray-100 text-gray-400 border-gray-200',       label: ()      => '-' },
}

export const STATUS_CHIP: Record<string, string> = {
  확정:   'bg-green-50 text-green-800 border-green-200',
  배정중: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  후보:   'bg-blue-50 text-blue-800 border-blue-200',
}

// ─── 단가 / 마진 ──────────────────────────────────────────
/** 셀에 실제 투입된 인력의 지급단가.
 *  같은 직무에 서로 다른 단가가 섞여 있으면 mixed=true ("혼재"로 표시). */
export function actualPayRate(c: JobCell) {
  const rates = [...c.pinned, ...c.allPeriod].map(a => a.pay_rate || 0).filter(r => r > 0)
  const uniq  = [...new Set(rates)].sort((a, b) => a - b)
  const avg   = rates.length ? rates.reduce((s, r) => s + r, 0) / rates.length : 0
  if (uniq.length === 0) return { value: 0, mixed: false, list: uniq, avg: c.job.planPayRate }
  if (uniq.length === 1) return { value: uniq[0], mixed: false, list: uniq, avg }
  return { value: 0, mixed: true, list: uniq, avg }
}

export function marginRate(bill: number, pay: number): number | null {
  if (!bill) return null
  return ((bill - pay) / bill) * 100
}

/** 실제 지급단가가 청구단가를 넘는 경우.
 *  손해 행사라는 뜻이 아니다. 정상 케이스가 여러 가지 있다:
 *   - 팀 단위 일괄지급 — 팀장 한 명에게 팀 전체 금액이 잡힌다
 *   - 여러 날 근무분이 한 건에 총액으로 들어가고 work_days가 1로 남은 경우
 *  이걸 마진 -500% 같은 값으로 찍으면 실무자가 화면 전체를 못 믿게 되므로,
 *  적자로 단정하지 않고 "확인필요"로만 표시한다. */
export function payRateSuspicious(
  billRate: number, act: ReturnType<typeof actualPayRate>,
): boolean {
  if (!billRate) return false
  if (act.mixed) return act.list.some(v => v > billRate)
  return act.value > billRate
}
