// 돈을 세는 규칙
// ─────────────────────────────────────────────────────────
// 대시보드·CEO 경영현황·CEO 수익보고·정산/청구가 저마다 다른 기준으로 매출과 수익을
// 세고 있었다. 2026-09-16 실측: 같은 '수익'이라는 이름으로 2026년 1,936만원,
// 전체 기간 4,884만원까지 벌어졌다. 화면마다 틀린 곳이 달라서 어느 하나가 정답도 아니었다.
//
// 같은 로직이 세 벌 복붙돼 있던 것이 원인이다. 주석에 '대시보드와 동일 기준'이라고
// 적어두는 방식으로는 갈라지는 것을 막지 못했다 — 실제로 '확인완료' 지급 건에서 이미
// 갈라져 있었다. 규칙을 여기 한 곳에 두고 네 화면이 전부 이것만 보게 한다.
//
// 규칙을 바꿔야 할 일이 생기면 이 파일만 고친다.

import type { Inquiry, Settlement, Payout, EventExpense, Assignment } from '@/lib/supabase/types'

// ─── ① 세는 대상 ──────────────────────────────────────────
/** 아직 일이 되지 않았거나 없던 일이 된 문의. 매출로 세지 않는다. */
export const NON_COUNTABLE = ['접수', '견적', '미체결', '보류', '취소'] as const

export function isCountable(inq: Inquiry | undefined): boolean {
  return !!inq && !NON_COUNTABLE.includes(inq.status as typeof NON_COUNTABLE[number])
}

// ─── ①-2 체결율 ──────────────────────────────────────────
/** 체결율을 세는 한 가지 방법.
 *
 *  분모는 '결정이 난 건'만 본다 — 체결됐거나 미체결로 끝난 것.
 *  아직 접수·견적·보류로 살아 있는 건을 분모에 넣으면, 문의가 많이 들어온 달일수록
 *  체결율이 떨어지는 이상한 숫자가 된다. 아직 진 게 아니기 때문이다.
 *  취소는 '없던 일'이라 양쪽 어디에도 넣지 않는다.
 *
 *  ★ CEO 경영현황이 한때 언제나 100%를 보여줬다. 정산에서 뽑아낸 목록(이미 체결
 *    이상만 남은 것)을 분모로 썼기 때문이다 — 실측 181/181. 분모는 문의에서 센다. */
export interface ContractStats {
  /** 체결 이상 */
  won: number
  /** 미체결로 끝난 것 */
  lost: number
  /** 아직 결정 안 난 것 (접수·견적·보류) */
  pending: number
  /** 분모 = won + lost */
  decided: number
  /** 0~100 */
  rate: number
}

export function contractStats(inquiries: Inquiry[]): ContractStats {
  const won     = inquiries.filter(isCountable).length
  const lost    = inquiries.filter(i => i.status === '미체결').length
  const pending = inquiries.filter(i => ['접수', '견적', '보류'].includes(i.status)).length
  const decided = won + lost
  return { won, lost, pending, decided, rate: decided > 0 ? Math.round((won / decided) * 100) : 0 }
}

// ─── ② 기간 기준 날짜 ─────────────────────────────────────
/** 이 정산을 어느 달·어느 해로 셀 것인가.
 *  행사일이 원칙이지만, 날짜 미정으로 등록된 행사는 행사일이 없다.
 *  그때 정산 등록일로 대신하지 않으면 그 건은 어느 해에도 잡히지 않고 사라진다
 *  (실측: 6건 416만원이 CEO 수익보고에서 통째로 빠져 있었다). */
export function periodRef(inq: Inquiry | undefined, sett: Settlement): string {
  return (inq?.event_start || sett.created_at || '').substring(0, 10)
}

// ─── ③ 지급액 ─────────────────────────────────────────────
/** 지급액을 어디서 알아냈는지. 화면은 이 값으로 '추정 포함'을 표시한다.
 *  추정치를 확정값처럼 보여주는 것이 제일 위험하다 — 틀린 것보다 틀린 줄 모르는 게 나쁘다. */
export type PayoutSource =
  | 'actual'      // 지급 레코드가 있다 (금액 확정)
  | 'settlement'  // 정산에 적힌 예상지급
  | 'assignment'  // 배정 기준 추정 (pay_rate × work_days)
  | 'none'        // 알 수 있는 게 없다

/** 지급이 어디까지 갔나. 금액(발생 기준)과 별개로 '돈이 실제로 나갔는지'를 말한다.
 *  수익 계산은 stage 와 무관하다 — 송금 버튼을 늦게 눌렀다고 회사가 더 번 게 아니다.
 *  이건 화면에서 '이 행사는 정산이 끝났나'를 보여주기 위한 것이다. */
export type PayoutStage =
  | 'paid'       // 전액 송금됨
  | 'partial'    // 일부만 송금됨
  | 'unpaid'     // 금액은 확정, 아직 안 나감
  | 'estimated'  // 지급 기록이 없어 추정
  | 'none'       // 알 수 있는 게 없음

export const PAYOUT_STAGE_LABEL: Record<PayoutStage, string> = {
  paid:      '지급완료',
  partial:   '일부 지급',
  unpaid:    '미지급',
  estimated: '추정',
  none:      '정보 없음',
}

export interface PayoutInfo {
  /** 발생 기준 총액 — 수익 계산에 쓰는 값 */
  amount: number
  source: PayoutSource
  /** 실제 나간 돈 */
  paid: number
  /** 금액은 확정됐지만 아직 안 나간 돈 */
  pending: number
  stage: PayoutStage
}

export const PAYOUT_SOURCE_LABEL: Record<PayoutSource, string> = {
  actual:     '지급 확정',
  settlement: '예상지급(정산 입력값)',
  assignment: '배정 기준 추정',
  none:       '지급 정보 없음',
}

/** 화면에서 '이 숫자 믿어도 되나'를 가르는 기준 */
export const isEstimated = (s: PayoutSource) => s === 'settlement' || s === 'assignment'

// ─── 한 번에 만들어 두고 재사용하는 조회 색인 ──────────────
export interface FinanceIndex {
  /** 발생 기준 합계 (상태 무관) */
  payoutByInquiry:   Map<string, number>
  /** 그중 실제로 나간 것 */
  paidByInquiry:     Map<string, number>
  expenseByInquiry:  Map<string, number>
  estimateByInquiry: Map<string, number>
}

/** 실제로 돈이 나간 것으로 보는 지급 상태 */
const PAID_STATUSES = new Set(['지급완료', '완료'])

export function buildFinanceIndex(
  payouts: Payout[],
  expenses: EventExpense[],
  assignments: Assignment[],
): FinanceIndex {
  // 지급 레코드는 상태를 가리지 않고 전부 더한다.
  //
  // 예전에는 '지급완료'와 '완료'만 셌다. 그러면 매출은 정산을 등록하는 순간 잡히는데
  // 인건비는 송금 버튼을 누른 순간에야 잡혀서, 수익이 구조적으로 부풀었다.
  // 크루가 일을 했으면 그 인건비는 이미 발생한 비용이다 — 아직 안 보냈을 뿐이지
  // 안 줄 돈이 아니다. 지급 버튼을 눌렀는지는 업무 진행 상태지 회계 사실이 아니다.
  // (실측: '확인완료' 67건 276만원이 어느 화면에서도 비용으로 안 잡히고 있었다.
  //  그중 49건은 paid_at 까지 찍혀 있어 실제로는 돈이 나간 건이었다)
  const payoutByInquiry = new Map<string, number>()
  const paidByInquiry   = new Map<string, number>()
  payouts.forEach(p => {
    if (!p.inquiry_id) return
    const amt = p.final_pay || 0
    payoutByInquiry.set(p.inquiry_id, (payoutByInquiry.get(p.inquiry_id) || 0) + amt)
    if (PAID_STATUSES.has(p.status)) {
      paidByInquiry.set(p.inquiry_id, (paidByInquiry.get(p.inquiry_id) || 0) + amt)
    }
  })

  const expenseByInquiry = new Map<string, number>()
  expenses.forEach(e => {
    if (!e.inquiry_id) return
    expenseByInquiry.set(e.inquiry_id, (expenseByInquiry.get(e.inquiry_id) || 0) + (e.amount || 0))
  })

  // 지급 레코드도 정산 입력값도 없을 때 쓰는 마지막 근거.
  // 취소된 배정과 무급(본사) 인원은 뺀다.
  const estimateByInquiry = new Map<string, number>()
  assignments.forEach(a => {
    if (!a.inquiry_id || a.status === '취소' || a.is_payable === false) return
    const amt = (a.pay_rate || 0) * (a.work_days || 1)
    estimateByInquiry.set(a.inquiry_id, (estimateByInquiry.get(a.inquiry_id) || 0) + amt)
  })

  return { payoutByInquiry, paidByInquiry, expenseByInquiry, estimateByInquiry }
}

/** 이 행사에 나간(나갈) 인건비.
 *
 *  확정 → 정산 입력값 → 배정 추정 순으로 내려간다. 추정끼리의 순서에는 근거가 있다:
 *  정산의 예상지급은 실제와 둘 다 있는 57건 중 13건만 5% 이내로 맞았고,
 *  배정 추정은 134건 중 69건이 맞았다. 둘 다 못 믿지만 덜 못 믿는 쪽을 먼저 둔다.
 *  (배정 추정이 더 정확해 보여도 표본이 다르다 — 정산 입력값은 '사람이 적어둔 값'이라
 *   적어둔 시점 이후 바뀐 것을 반영하지 못한다) */
export function payoutOf(
  index: FinanceIndex,
  inquiryId: string | undefined,
  settlementPayout: number | undefined,
): PayoutInfo {
  const guess = (amount: number, source: PayoutSource): PayoutInfo => ({
    amount, source, paid: 0, pending: 0,
    stage: source === 'none' ? 'none' : 'estimated',
  })

  if (!inquiryId) {
    const fb = settlementPayout || 0
    return fb > 0 ? guess(fb, 'settlement') : guess(0, 'none')
  }

  const actual = index.payoutByInquiry.get(inquiryId)
  if (actual !== undefined && actual > 0) {
    const paid    = index.paidByInquiry.get(inquiryId) || 0
    const pending = actual - paid
    return {
      amount: actual, source: 'actual', paid, pending,
      stage: pending <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
    }
  }

  const fromSett = settlementPayout || 0
  if (fromSett > 0) return guess(fromSett, 'settlement')

  const fromAssign = index.estimateByInquiry.get(inquiryId) || 0
  if (fromAssign > 0) return guess(fromAssign, 'assignment')

  return guess(0, 'none')
}

/** 부대비용은 사람이 직접 적을 때만 생긴다. 등록된 즉시 실제 지출로 본다. */
export function expenseOf(index: FinanceIndex, inquiryId: string | undefined): number {
  return inquiryId ? (index.expenseByInquiry.get(inquiryId) || 0) : 0
}

// ─── ④ 미수금 ─────────────────────────────────────────────
/** 아직 못 받은 잔액의 합.
 *  초과입금(잔액 음수)은 우리 수익이지 받을 돈이 아니므로 다른 건의 미수금을
 *  상쇄하면 안 된다. A사가 더 보냈다고 B사에서 받을 돈이 줄지는 않는다. */
export function unpaidTotal(settlements: Settlement[]): number {
  return settlements.reduce((s, r) => s + Math.max(0, r.balance || 0), 0)
}

// ─── ⑤ 정산 중복 제거 ─────────────────────────────────────
/** 한 문의에 정산이 두 건 이상이면 매출이 이중으로 잡힌다. 문의당 첫 건만 쓴다. */
export function dedupeSettlements(settlements: Settlement[]): Settlement[] {
  const m = new Map<string, Settlement>()
  settlements.forEach(s => {
    if (s.inquiry_id && !m.has(s.inquiry_id)) m.set(s.inquiry_id, s)
  })
  return Array.from(m.values())
}

// ─── 집계 ────────────────────────────────────────────────
export interface MoneyTotals {
  count:         number
  revenue:       number   // 공급가액 (VAT 제외)
  payout:        number   // 인건비
  expense:       number   // 부대비용
  profit:        number   // revenue - payout - expense
  profitRate:    number   // %
  /** 지급액에 추정이 섞인 건수·금액 — 화면에 그대로 밝힌다 */
  estimatedCount:  number
  estimatedAmount: number
  /** 지급액을 전혀 모르는 건수 */
  unknownCount:  number
  /** payout 의 내역: 실제 나간 돈 / 금액만 확정 / 추정.
   *  셋을 더하면 payout 이 된다. 수익은 payout 전체로 계산한다 — 이건 표시용이다. */
  paidAmount:    number
  pendingAmount: number
}

export interface SettlementRow {
  settlement: Settlement
  inquiry?:   Inquiry
  revenue:    number
  payout:     number
  payoutSource: PayoutSource
  payoutStage:  PayoutStage
  /** 실제 나간 돈 / 금액만 확정된 돈 */
  paid:       number
  pending:    number
  expense:    number
  profit:     number
}

/** 정산 목록을 화면이 쓰는 행으로. 세는 대상 필터는 호출하는 쪽에서 건다. */
export function toRows(
  settlements: Settlement[],
  inqMap: Map<string, Inquiry>,
  index: FinanceIndex,
): SettlementRow[] {
  return settlements.map(s => {
    const inquiry = s.inquiry_id ? inqMap.get(s.inquiry_id) : undefined
    const revenue = s.supply_price || 0
    const p       = payoutOf(index, s.inquiry_id, s.payout_amount)
    const expense = expenseOf(index, s.inquiry_id)
    return {
      settlement: s, inquiry, revenue,
      payout: p.amount, payoutSource: p.source, payoutStage: p.stage,
      paid: p.paid, pending: p.pending,
      expense, profit: revenue - p.amount - expense,
    }
  })
}

export function sumRows(rows: SettlementRow[]): MoneyTotals {
  const revenue = rows.reduce((a, r) => a + r.revenue, 0)
  const payout  = rows.reduce((a, r) => a + r.payout, 0)
  const expense = rows.reduce((a, r) => a + r.expense, 0)
  const profit  = revenue - payout - expense
  const est     = rows.filter(r => isEstimated(r.payoutSource))
  return {
    count: rows.length,
    revenue, payout, expense, profit,
    profitRate: revenue > 0 ? Math.round((profit / revenue) * 100) : 0,
    estimatedCount:  est.length,
    estimatedAmount: est.reduce((a, r) => a + r.payout, 0),
    unknownCount:    rows.filter(r => r.payoutSource === 'none').length,
    paidAmount:      rows.reduce((a, r) => a + r.paid, 0),
    pendingAmount:   rows.reduce((a, r) => a + r.pending, 0),
  }
}

/** 세는 대상만 남긴다 — 취소·보류 등 제외, 공급가 0 제외. */
export function countableRows(rows: SettlementRow[]): SettlementRow[] {
  return rows.filter(r => isCountable(r.inquiry) && r.revenue > 0)
}

/** 기간(YYYY 또는 YYYY-MM)으로 자른다. */
export function inPeriod(row: SettlementRow, prefix: string): boolean {
  return periodRef(row.inquiry, row.settlement).startsWith(prefix)
}
