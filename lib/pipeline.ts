// 체결 전(영업) 구간의 규칙
// ─────────────────────────────────────────────────────────
// 운영 캘린더는 체결된 건만 다룬다. 체결 전 건은 문의 목록과 견적 목록에
// 흩어져 있어서 '견적 보낸 지 며칠 됐는지', '다음에 뭘 하기로 했는지'를
// 한눈에 볼 방법이 없었다. sent_at은 DB에 꼬박꼬박 쌓이는데 그 값을
// 읽어서 질문에 답해 주는 화면이 없었다.
//
// 판정 규칙을 여기 한 곳에 모은다. finance.ts와 같은 이유다 —
// 화면마다 '무응답 6일'이 다르게 나오면 그 숫자는 아무도 믿지 않는다.
//
// 여기 값들은 전부 보기 전용이다. 체결 전 금액은 매출·수익 계산에
// 절대 섞이지 않는다. 그 경계는 finance.ts의 NON_COUNTABLE이 긋는다.

import type { Inquiry, Estimate } from '@/lib/supabase/types'
import { NON_COUNTABLE } from '@/lib/finance'

// ─── ① 보드에 오르는 건 ───────────────────────────────────
/** 체결 전 상태. finance.ts가 '매출로 세지 않는다'고 판정하는 것과 같은 집합이다.
 *  두 곳이 갈라지면 보드에 있는 건이 매출에 잡히거나 그 반대가 된다. */
export function isPreContract(inq: Inquiry | undefined | null): boolean {
  if (!inq) return false
  return (NON_COUNTABLE as readonly string[]).includes(inq.status)
}

/** 없던 일이 된 건 */
export const DEAD_STATUSES = ['미체결', '보류', '취소'] as const

export function isDead(inq: Inquiry): boolean {
  return (DEAD_STATUSES as readonly string[]).includes(inq.status)
}

// ─── ② 단계 ───────────────────────────────────────────────
// 단계는 따로 저장하지 않는다. 이미 있는 데이터(견적 유무, 발송 여부,
// 상태)에서 끌어낸다. 저장하면 실제 데이터와 어긋나는 순간이 반드시 온다.
export type PipelineStage = '접수' | '견적작성' | '발송대기' | '결론'

export const PIPELINE_STAGES: PipelineStage[] = ['접수', '견적작성', '발송대기', '결론']

export const STAGE_DESC: Record<PipelineStage, string> = {
  '접수':     '문의는 들어왔고 견적서는 아직',
  '견적작성': '견적서는 썼고 아직 안 보냄',
  '발송대기': '보냈고 답을 기다리는 중',
  '결론':     '미체결 · 보류 · 취소',
}

export function isSent(est: Estimate): boolean {
  return est.send_status === '발송완료'
}

export function stageOf(inq: Inquiry, ests: Estimate[]): PipelineStage {
  if (isDead(inq))        return '결론'
  if (ests.some(isSent))  return '발송대기'
  if (ests.length > 0)    return '견적작성'
  return '접수'
}

// ─── ③ 멈춰 있는 기간 ─────────────────────────────────────
/** 단계별로 '며칠 지나면 이상한가'.
 *  견적은 빨리 나가야 하니 앞단이 더 타이트하다.
 *  숫자를 바꾸고 싶으면 여기만 고친다. */
export const STALE_RULES: Record<
  PipelineStage,
  { warn: number; alert: number; label: string } | null
> = {
  '접수':     { warn: 2, alert: 4, label: '견적 없음' },
  '견적작성': { warn: 1, alert: 2, label: '미발송' },
  '발송대기': { warn: 3, alert: 5, label: '무응답' },
  '결론':     null,   // 끝난 건은 재촉하지 않는다
}

export type Signal = 'ok' | 'warn' | 'alert'

/** KST 달력 날짜(YYYY-MM-DD).
 *  'sv-SE' 로캘이 YYYY-MM-DD를 그대로 준다. 타임스탬프를 시각째로 빼면
 *  어제 저녁에 보낸 건이 '0일'로 나온다 — 사람은 그걸 1일로 센다. */
export function kstDay(value: string | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return new Date(value).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

export function today(): string {
  return kstDay(new Date())
}

/** a에서 b까지 며칠 (둘 다 YYYY-MM-DD) */
export function dayDiff(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000
  )
}

/** 여러 날짜 중 가장 나중 것 */
function latest(days: Array<string | null | undefined>): string | null {
  const ok = days.filter(Boolean) as string[]
  return ok.length ? ok.sort().at(-1)! : null
}

/** 이 단계에서 시계가 언제부터 돌기 시작했나.
 *
 *  approx=true는 '기준 날짜를 추측했다'는 뜻이다. 실측 결과 발송완료로
 *  표시됐는데 sent_at이 비어 있는 견적이 있었다(옛날 데이터). 그대로 두면
 *  시계가 아예 안 돌아서 제일 오래 방치된 건이 조용히 묻힌다. 견적을 마지막
 *  손본 날로 대신 세되, 추측이라는 사실은 화면에 반드시 표시한다. */
function stallFrom(
  stage: PipelineStage, inq: Inquiry, ests: Estimate[],
): { from: string | null; approx: boolean } {
  if (stage === '접수') {
    return { from: inq.created_at ? kstDay(inq.created_at) : null, approx: false }
  }
  if (stage === '견적작성') {
    return { from: latest(ests.map(e => kstDay(e.updated_at || e.created_at))), approx: false }
  }
  if (stage === '발송대기') {
    const sent = ests.filter(isSent)
    // 여러 안(A안/B안)을 보냈으면 마지막으로 보낸 때부터 센다
    const real = latest(sent.map(e => (e.sent_at ? kstDay(e.sent_at) : null)))
    if (real) return { from: real, approx: false }
    const guess = latest(sent.map(e => kstDay(e.updated_at || e.created_at)))
    return { from: guess, approx: !!guess }
  }
  return { from: null, approx: false }
}

function signalFor(stage: PipelineStage, days: number | null): Signal {
  const rule = STALE_RULES[stage]
  if (!rule || days == null) return 'ok'
  if (days >= rule.alert) return 'alert'
  if (days >= rule.warn)  return 'warn'
  return 'ok'
}

// ─── ④ 카드 ───────────────────────────────────────────────
export interface PipelineCard {
  inq: Inquiry
  stage: PipelineStage
  estimates: Estimate[]
  /** 최종 확정본이 있으면 그것, 없으면 가장 최근 견적 */
  headline: Estimate | null
  amount: number
  /** 이 단계에 머문 일수 */
  stalledDays: number | null
  /** 그 일수의 기준 날짜가 추측인가 (sent_at이 비어 있던 건) */
  approxDate: boolean
  signal: Signal
  /** '발송 6일째 무응답' 같은 한 줄 */
  stallText: string | null
  /** 다음 할 일 기한이 지났나 */
  overdue: boolean
  /** 행사일까지 남은 일수 (지났으면 음수) */
  dday: number | null
  /** 행사일이 이미 지났는데 아직 체결 전 — 사실상 정리 대상 */
  expired: boolean
  /** 결론 난 날 (없으면 null) */
  concludedOn: string | null
}

const STALL_VERB: Record<PipelineStage, string> = {
  '접수': '접수', '견적작성': '작성', '발송대기': '발송', '결론': '',
}

export function buildCard(inq: Inquiry, allEstimates: Estimate[]): PipelineCard {
  const ests = allEstimates.filter(e => e.inquiry_id === inq.id)
  const stage = stageOf(inq, ests)
  const dead = isDead(inq)

  const { from, approx } = stallFrom(stage, inq, ests)
  const stalledDays = from ? Math.max(0, dayDiff(from, today())) : null
  const rule = STALE_RULES[stage]

  const headline =
    ests.find(e => e.is_final) ??
    [...ests].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')).at(-1) ??
    null

  const eventDay = inq.event_start ? kstDay(inq.event_start) : null
  const dday = eventDay ? dayDiff(today(), eventDay) : null

  // 행사가 이미 끝났는데 체결 전이면 무응답 일수보다 이쪽이 먼저다.
  // 상태를 자동으로 바꾸지는 않는다 — 닫는 건 사람이 사유와 함께 할 일이다.
  const expired = !dead && dday != null && dday < 0

  const signal: Signal = expired ? 'alert' : signalFor(stage, stalledDays)

  const stallText = expired
    ? `행사일이 ${-dday!}일 지남 — 정리 필요`
    : rule && stalledDays != null
      ? `${STALL_VERB[stage]} ${stalledDays}일째 ${rule.label}${approx ? ' (추정)' : ''}`
      : null

  return {
    inq,
    stage,
    estimates: ests,
    headline,
    amount: headline?.total_price ?? 0,
    stalledDays,
    approxDate: approx,
    signal,
    stallText,
    overdue: !!inq.next_action_at && dayDiff(kstDay(inq.next_action_at), today()) > 0,
    dday,
    expired,
    concludedOn: dead ? kstDay(inq.updated_at || inq.created_at) : null,
  }
}

/** 보드에 올릴 카드 전부. 체결된 건은 여기서 빠진다 (운영 캘린더 몫). */
export function buildBoard(inquiries: Inquiry[], estimates: Estimate[]): PipelineCard[] {
  return inquiries.filter(isPreContract).map(inq => buildCard(inq, estimates))
}

/** 급한 것이 위로. 기한 지난 할 일 → 신호등 → 오래 멈춘 순.
 *  결론 칸만은 최근에 끝난 것이 위로 온다 — 거기선 '오래됨'이 급한 게 아니다. */
export function sortCards(cards: PipelineCard[]): PipelineCard[] {
  const rank: Record<Signal, number> = { alert: 0, warn: 1, ok: 2 }
  return [...cards].sort((a, b) => {
    if (a.concludedOn && b.concludedOn) return b.concludedOn.localeCompare(a.concludedOn)
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
    if (rank[a.signal] !== rank[b.signal]) return rank[a.signal] - rank[b.signal]
    return (b.stalledDays ?? -1) - (a.stalledDays ?? -1)
  })
}

/** 오늘까지 하기로 한 일 (지난 것 포함) */
export function dueToday(cards: PipelineCard[]): PipelineCard[] {
  const t = today()
  return cards
    .filter(c => !isDead(c.inq) && c.inq.next_action_at && dayDiff(kstDay(c.inq.next_action_at), t) >= 0)
    .sort((a, b) => (a.inq.next_action_at || '').localeCompare(b.inq.next_action_at || ''))
}

// ─── ⑤ 결론 칸 ────────────────────────────────────────────
/** 끝난 건은 계속 쌓인다 (실측 2026-09-21 기준 108건). 전부 펼치면
 *  결론 칸이 화면을 뒤덮어 살아 있는 세 칸이 안 읽힌다. 최근 것만 펼친다. */
export const RECENT_CONCLUDED_DAYS = 30

export function isRecentlyConcluded(card: PipelineCard, t = today()): boolean {
  if (!card.concludedOn) return true
  return dayDiff(card.concludedOn, t) <= RECENT_CONCLUDED_DAYS
}

// ─── ⑥ 미체결 사유 ────────────────────────────────────────
/** 왜 졌는지를 남겨두면 다음 견적의 근거가 된다.
 *  자유 입력만 두면 아무도 안 적는다 — 고르게 만든다. */
export const LOST_REASONS = [
  '가격', '일정 불가', '경쟁사', '고객 내부취소', '무응답', '기타',
] as const

export type LostReason = typeof LOST_REASONS[number]
