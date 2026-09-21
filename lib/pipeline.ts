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

/** 계약이 된 건. NON_COUNTABLE(체결 전)의 여집합이므로 목록을 따로 들지 않는다 —
 *  두 벌로 적어두면 상태가 하나 늘어날 때 한쪽만 고쳐져 갈라진다. */
export function isWon(inq: Inquiry): boolean {
  return !isPreContract(inq) && !isDead(inq)
}

// ─── ② 단계 ───────────────────────────────────────────────
// 단계는 따로 저장하지 않는다. 이미 있는 데이터(견적 유무, 발송 여부,
// 상태)에서 끌어낸다. 저장하면 실제 데이터와 어긋나는 순간이 반드시 온다.
export type PipelineStage = '접수' | '견적작성' | '체결 전' | '체결' | '미체결'

export const PIPELINE_STAGES: PipelineStage[] =
  ['접수', '견적작성', '체결 전', '체결', '미체결']

export const STAGE_DESC: Record<PipelineStage, string> = {
  '접수':     '문의는 들어왔고 견적서는 아직',
  '견적작성': '견적서는 썼고 아직 안 보냄',
  '체결 전':  '견적서 발송 완료 건 — 답을 기다리는 중',
  '체결':     '계약이 된 건',
  '미체결':   '미체결 · 보류 · 취소',
}

/** 아직 살아 있는 건 — 집계에서 '진행 중'으로 세는 범위 */
export const LIVE_STAGES: PipelineStage[] = ['접수', '견적작성', '체결 전']

export function isLiveStage(stage: PipelineStage): boolean {
  return LIVE_STAGES.includes(stage)
}

export function isSent(est: Estimate): boolean {
  return est.send_status === '발송완료'
}

export function stageOf(inq: Inquiry, ests: Estimate[]): PipelineStage {
  if (isWon(inq))         return '체결'
  if (isDead(inq))        return '미체결'
  if (ests.some(isSent))  return '체결 전'
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
  '체결 전':  { warn: 3, alert: 5, label: '무응답' },
  '체결':     null,   // 끝난 건은 재촉하지 않는다
  '미체결':   null,
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
  if (stage === '체결 전') {
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

// ─── ④ 적어둔 것 ──────────────────────────────────────────
// 카드가 뼈대만 보여주면 결국 전부 눌러봐야 한다. 무슨 얘기가 오갔는지
// 한 줄이라도 카드에 올려야 목록이 '나열'이 아니라 '현황'이 된다.

/** project_memos에서 카드가 쓰는 만큼만 */
export interface MemoLike {
  inquiry_id: string
  type: string
  content: string
  author?: string | null
  created_at: string
}

/** 접촉 수단은 내용 앞에 [통화] 처럼 붙여 한 컬럼에 담는다 */
export const CONTACT_KINDS = ['통화', '메일·문자', '미팅', '기타'] as const
export type ContactKind = typeof CONTACT_KINDS[number]

/** '[통화] 부재중' → { kind: '통화', body: '부재중' } */
export function splitActivity(content: string): { kind: string; body: string } {
  const m = content.match(/^\[([^\]]+)\]\s*([\s\S]*)$/)
  return m ? { kind: m[1], body: m[2] } : { kind: '기타', body: content }
}

export const ACTIVITY_TYPE = '영업활동'

export interface CardNote {
  /** 어디서 온 글인가 — 카드에 출처를 적어야 오해가 없다.
   *  '문의'는 고객이 보낸 원문이지 우리가 적은 게 아니다. */
  source: '활동' | '상담' | '문의'
  kind: string
  text: string
  author?: string | null
  on?: string
}

/** 문의 원문에 붙은 정리용 태그. 별도 칸으로 이미 빠져 있어 카드에서는 군더더기다.
 *  화면에서만 떼어낸다 — 저장된 값은 건드리지 않는다. */
const NOTE_TAGS = /\[(복장|식사|주차|페이)\s*:[^\]]*\]\s*/g

export function cleanNote(text: string | null | undefined): string {
  return (text ?? '').replace(NOTE_TAGS, '').replace(/\n{2,}/g, '\n').trim()
}

/** 카드에 미리 보여줄 한 줄.
 *
 *  우리가 적은 것 → 상담 기록 → 고객이 보낸 원문 순으로 내려간다.
 *  실측(2026-09-21): 보드 146건 중 영업활동 2건, consult_notes 8건인데
 *  문의 원문은 141건에 있다. 원문까지 내려가지 않으면 카드 대부분이
 *  빈 채로 남아 '그냥 나열'이 된다. 대신 출처를 반드시 같이 적는다. */
function pickNote(inq: Inquiry, memos: MemoLike[]): CardNote | null {
  const latestMemo = memos[0]
  if (latestMemo) {
    const { kind, body } = splitActivity(latestMemo.content)
    return {
      source: '활동',
      kind,
      text: body.trim(),
      author: latestMemo.author,
      on: kstDay(latestMemo.created_at),
    }
  }

  const consult = cleanNote(inq.consult_notes)
  if (consult) return { source: '상담', kind: '상담', text: consult }

  const raw = cleanNote(inq.notes)
  if (raw) return { source: '문의', kind: '문의 원문', text: raw }

  return null
}

// ─── ⑤ 언제·무슨 일인가 ──────────────────────────────────
// 수주 판단은 '얼마 남나'보다 '사람을 넣을 수 있나'에서 갈린다.
// 직무·인원·시간·지급단가가 한 줄에 같이 보여야 즉답이 된다.

export interface CardWhen {
  /** 05/05 또는 05/05~05/07 */
  label: string | null
  /** 며칠짜리인가 (하루면 1) */
  days: number
  /** 자유 입력 그대로 — '18:00 ~ 익일 08:00' */
  time: string | null
  /** 밤을 넘기는 일인가. 크루 구하기와 단가가 달라진다 */
  night: boolean
  /** 날짜가 아직 없을 때 대신 적어둔 것 ('10월 예정') */
  memo: string | null
}

/** 밤일인지 가려낸다. event_time은 자유 입력이라 형식을 믿을 수 없다.
 *  확실한 단서만 본다 — 애매하면 밤이 아니라고 한다(거짓 경고가 더 나쁘다). */
export function isNightTime(raw: string | null | undefined): boolean {
  const t = (raw ?? '').trim()
  if (!t) return false
  if (/익일|야간|심야|철야/.test(t)) return true

  const hours = [...t.matchAll(/(\d{1,2})\s*:\s*\d{2}/g)].map(m => Number(m[1]))
  if (hours.length === 0) return false
  const [start, ...rest] = hours
  const end = rest.at(-1)

  // 기준은 '늦게 시작하느냐'가 아니라 '밤을 넘기느냐'다.
  // 시작 시각만 보면 19:00~22:00 같은 저녁 행사가 야간으로 잡힌다(실측 오판).
  if (start <= 4) return true                          // 새벽에 시작
  if (end !== undefined && end < start) return true    // 끝이 시작보다 이르면 자정을 넘긴 것
  return false
}

export function cardWhen(inq: Inquiry): CardWhen {
  const start = inq.event_start ? kstDay(inq.event_start) : null
  const end   = inq.event_end   ? kstDay(inq.event_end)   : null

  // 운영일을 따로 고른 행사는 그 개수가 진짜 일수다 (event_dates_model 참고)
  const picked = Array.isArray(inq.event_dates) ? inq.event_dates.filter(Boolean) : []
  const days = picked.length > 0
    ? picked.length
    : start && end ? Math.max(1, dayDiff(start, end) + 1) : start ? 1 : 0

  const short = (d: string) => d.substring(5).replace('-', '/')
  const label = !start ? null
    : end && end !== start ? `${short(start)}~${short(end)}`
    : short(start)

  return {
    label,
    days,
    time: inq.event_time?.trim() || null,
    night: isNightTime(inq.event_time),
    // 날짜가 없는 건이 30%다. 그때 date_memo까지 안 보면 카드가 '일정 미정'으로만 남는다.
    memo: !start ? (inq.date_memo?.trim() || null) : null,
  }
}

/** 현장 준비물. '미정'만 적힌 칸은 카드에서 뺀다 — 셋 다 미정이면 줄 자체가 군더더기다.
 *  'x'는 없다는 뜻으로 쓰고 있어 읽을 수 있게 바꾼다. */
export function onsiteBits(inq: Inquiry): string[] {
  const norm = (v?: string | null) => {
    const t = (v ?? '').trim()
    if (!t || t === '미정' || t === '-') return null
    if (/^x$/i.test(t)) return '없음'
    // 입력이 한 칸씩 밀린 건이 있다 — 식사에 '주차 :', 주차에 '특이사항:'.
    // 라벨만 남은 값은 내용이 없는 것이니 카드에 올리지 않는다.
    if (/^[^:]{0,10}:$/.test(t)) return null
    return t
  }
  return [
    ['복장', norm(inq.attire)],
    ['식사', norm(inq.meal)],
    ['주차', norm(inq.parking)],
  ].filter(([, v]) => v).map(([k, v]) => `${k} ${v}`)
}

// ─── ⑥ 카드 ───────────────────────────────────────────────
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
  /** 카드에 미리 보여줄 최근 기록 한 줄 */
  lastNote: CardNote | null
  /** 이 건에 쌓인 영업활동 기록 수 */
  noteCount: number
  /** 언제 하는 일인가 */
  when: CardWhen
  /** 최신 견적의 수익률 (%). 견적이 없으면 null */
  profitRate: number | null
  /** 현장 준비물 — 복장·식사·주차 중 실제로 정해진 것만 */
  onsite: string[]
}

const STALL_VERB: Record<PipelineStage, string> = {
  '접수': '접수', '견적작성': '작성', '체결 전': '발송', '체결': '', '미체결': '',
}

export function buildCard(
  inq: Inquiry, allEstimates: Estimate[], memos: MemoLike[] = [],
): PipelineCard {
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
    // 체결·미체결 모두 '언제 끝났나'가 필요하다. 최근 것만 펼치고
    // 이번 달 승률을 세는 기준이 이 날짜다.
    concludedOn: isLiveStage(stage) ? null : kstDay(inq.updated_at || inq.created_at),
    lastNote: pickNote(inq, memos),
    noteCount: memos.length,
    when: cardWhen(inq),
    // 43.18% 같은 소수점은 카드에서 읽히지 않는다. 판단에도 소수점은 필요 없다.
    profitRate: headline?.profit_rate != null ? Math.round(headline.profit_rate) : null,
    onsite: onsiteBits(inq),
  }
}

/** 보드에 올릴 카드 전부.
 *
 *  체결된 건도 올린다. 실패만 쌓이는 화면은 아무도 매일 열지 않는다 —
 *  딴 건이 보여야 보드가 성과판 노릇을 한다. 대신 금액 집계에서는
 *  살아 있는 단계만 센다(isLiveStage). 체결 금액이 '진행 중 견적 합계'에
 *  섞이면 그 숫자는 아무 뜻도 없어진다. */
export function buildBoard(
  inquiries: Inquiry[], estimates: Estimate[], memos: MemoLike[] = [],
): PipelineCard[] {
  // 문의별로 한 번만 갈라둔다. 카드마다 전체를 훑으면 건수 × 메모수가 된다.
  const byInq = new Map<string, MemoLike[]>()
  for (const m of memos) {
    if (m.type !== ACTIVITY_TYPE) continue
    const list = byInq.get(m.inquiry_id)
    if (list) list.push(m)
    else byInq.set(m.inquiry_id, [m])
  }
  // 최신이 앞으로 (조회 순서를 믿지 않는다)
  byInq.forEach(list => list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')))

  return inquiries.map(inq => buildCard(inq, estimates, byInq.get(inq.id) ?? []))
}

// ─── 정렬 ─────────────────────────────────────────────────
// 아침에 훑을 때와 이번 주 행사를 챙길 때는 보고 싶은 순서가 다르다.
// 하나만 고집하면 다른 용도에서는 목록을 위에서 아래로 다 읽어야 한다.
export type SortKey = 'urgent' | 'event' | 'stalled' | 'amount' | 'recent'

export const SORT_MODES: Array<{ key: SortKey; label: string; hint: string }> = [
  { key: 'urgent',  label: '급한 순',       hint: '기한 지난 할 일 → 신호등 → 오래 멈춘 순' },
  { key: 'event',   label: '행사일 임박순',  hint: '행사가 가까운 것부터. 지난 행사는 뒤로' },
  { key: 'stalled', label: '오래 멈춘 순',   hint: '답이 없는 지 오래된 것부터' },
  { key: 'amount',  label: '금액 큰 순',     hint: '견적 금액이 큰 것부터' },
  { key: 'recent',  label: '최근 접수순',    hint: '새로 들어온 문의부터' },
]

const SIGNAL_RANK: Record<Signal, number> = { alert: 0, warn: 1, ok: 2 }

/** 급한 것이 위로. 끝난 건(체결·미체결)은 최근 것이 위로 온다 —
 *  거기선 '오래됨'이 급한 게 아니다. */
function urgentCmp(a: PipelineCard, b: PipelineCard): number {
  if (a.concludedOn && b.concludedOn) return b.concludedOn.localeCompare(a.concludedOn)
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
  if (SIGNAL_RANK[a.signal] !== SIGNAL_RANK[b.signal]) {
    return SIGNAL_RANK[a.signal] - SIGNAL_RANK[b.signal]
  }
  return (b.stalledDays ?? -1) - (a.stalledDays ?? -1)
}

/** 행사일 정렬 자리. 앞으로 올 행사가 먼저, 지난 행사는 뒤로, 날짜 없는 건 맨 뒤.
 *  지난 행사끼리는 최근에 지난 것부터 — 오래될수록 볼 일이 없다.
 *  날짜가 없어도 date_memo('10월 예정')는 있을 수 있지만 정렬에는 쓸 수 없다. */
function eventRank(c: PipelineCard): [number, number] {
  if (c.dday == null) return [2, 0]
  if (c.dday >= 0)    return [0, c.dday]
  return [1, -c.dday]
}

export function sortCards(cards: PipelineCard[], key: SortKey = 'urgent'): PipelineCard[] {
  const out = [...cards]
  switch (key) {
    case 'event':
      return out.sort((a, b) => {
        const [ga, va] = eventRank(a)
        const [gb, vb] = eventRank(b)
        return ga !== gb ? ga - gb : va !== vb ? va - vb : urgentCmp(a, b)
      })
    case 'stalled':
      return out.sort((a, b) =>
        (b.stalledDays ?? -1) - (a.stalledDays ?? -1) || urgentCmp(a, b))
    case 'amount':
      return out.sort((a, b) => b.amount - a.amount || urgentCmp(a, b))
    case 'recent':
      return out.sort((a, b) =>
        (b.inq.created_at || '').localeCompare(a.inq.created_at || '') || urgentCmp(a, b))
    default:
      return out.sort(urgentCmp)
  }
}

/** 오늘까지 하기로 한 일 (지난 것 포함) */
export function dueToday(cards: PipelineCard[]): PipelineCard[] {
  const t = today()
  return cards
    .filter(c => isLiveStage(c.stage) && c.inq.next_action_at && dayDiff(kstDay(c.inq.next_action_at), t) >= 0)
    .sort((a, b) => (a.inq.next_action_at || '').localeCompare(b.inq.next_action_at || ''))
}

// ─── ⑦ 끝난 건 ────────────────────────────────────────────
/** 끝난 건은 계속 쌓인다 (실측 2026-09-21: 체결 178건, 미체결 111건).
 *  전부 펼치면 살아 있는 칸이 안 읽힌다. 최근 것만 펼친다. */
export const RECENT_CONCLUDED_DAYS = 30

/** 이번 달 성적. 주간 회의에서 제일 먼저 묻는 숫자다. */
export function winRate(cards: PipelineCard[], days = RECENT_CONCLUDED_DAYS) {
  const t = today()
  const recent = cards.filter(c => c.concludedOn && dayDiff(c.concludedOn, t) <= days)
  const won  = recent.filter(c => c.stage === '체결')
  const lost = recent.filter(c => c.stage === '미체결')
  const total = won.length + lost.length
  return {
    won:  won.length,
    lost: lost.length,
    wonAmount: won.reduce((s, c) => s + c.amount, 0),
    rate: total > 0 ? Math.round((won.length / total) * 100) : null,
  }
}

/** 좁은 카드에서 149,797,000원은 읽히지 않는다. 읽을 수 있는 자리까지만 줄인다.
 *  반올림한 값이므로 정확한 금액이 필요한 화면에서는 쓰지 않는다. */
export function shortKRW(v: number | null | undefined): string {
  const n = Math.round(v ?? 0)
  if (n === 0) return '0원'
  if (n >= 100_000_000) {
    const eok = Math.floor(n / 100_000_000)
    const man = Math.round((n % 100_000_000) / 10_000)
    return man > 0 ? `${eok}억 ${man.toLocaleString('ko-KR')}만` : `${eok}억`
  }
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString('ko-KR')}만`
  return `${n.toLocaleString('ko-KR')}원`
}

export function isRecentlyConcluded(card: PipelineCard, t = today()): boolean {
  if (!card.concludedOn) return true
  return dayDiff(card.concludedOn, t) <= RECENT_CONCLUDED_DAYS
}

// ─── ⑧ 미체결 사유 ────────────────────────────────────────
/** 왜 졌는지를 남겨두면 다음 견적의 근거가 된다.
 *  자유 입력만 두면 아무도 안 적는다 — 고르게 만든다. */
export const LOST_REASONS = [
  '가격', '일정 불가', '경쟁사', '고객 내부취소', '무응답', '기타',
] as const

export type LostReason = typeof LOST_REASONS[number]
