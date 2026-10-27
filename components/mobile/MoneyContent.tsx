'use client'

// 돈 한 눈 — 이번 달 매출·수익·입금·미수 네 숫자.
// 계산은 전부 lib/finance.ts. 대시보드·CEO 경영현황과 같은 함수를 같은 순서로 부르므로 숫자가 같다.
// 여기서 더하기 한 줄이라도 따로 하면 어긋난다.

import { useEffect, useState, useCallback, useMemo } from 'react'
import { db } from '@/lib/supabase/api'
import { formatKRW, todayKST } from '@/lib/utils'
import {
  buildFinanceIndex, dedupeSettlements, toRows, countableRows, sumRows, inPeriod, unpaidTotal,
} from '@/lib/finance'
import { MobileHeader, ErrorBox, Tile, Row } from '@/components/mobile/ui'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Inquiry, Settlement, Payout, EventExpense, Assignment } from '@/lib/supabase/types'

function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function MoneyContent() {
  const today = todayKST()
  const [ym, setYm]           = useState(today.slice(0, 7))
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [inquiries, setInquiries]     = useState<Inquiry[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [payouts, setPayouts]         = useState<Payout[]>([])
  const [expenses, setExpenses]       = useState<EventExpense[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [inqs, setts, pays, exps, asgns] = await Promise.all([
        db.list<Inquiry>('inquiries', { order: 'created_at', asc: false }),
        db.list<Settlement>('settlements', { order: 'created_at', asc: false }),
        db.list<Payout>('payouts', { order: 'created_at', asc: false }),
        db.list<EventExpense>('event_expenses', { order: 'created_at', asc: false }).catch(() => [] as EventExpense[]),
        db.list<Assignment>('assignments', { select: 'id,inquiry_id,status,staff_type,staff_name,pay_rate,work_days,is_payable', order: 'assigned_at', asc: false }),
      ])
      setInquiries(inqs); setSettlements(setts); setPayouts(pays); setExpenses(exps); setAssignments(asgns)
    } catch (e) {
      setError((e as Error).message || '불러오지 못했습니다')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const calc = useMemo(() => {
    const inqMap   = new Map(inquiries.map(i => [i.id, i]))
    const index    = buildFinanceIndex(payouts, expenses, assignments)
    const countable = countableRows(toRows(dedupeSettlements(settlements), inqMap, index))
    const monthRows = countable.filter(r => inPeriod(r, ym))
    const month     = sumRows(monthRows)
    const received  = monthRows.reduce((a, r) => a + (r.settlement.received_amount || 0), 0)
    const yearRows  = countable.filter(r => inPeriod(r, ym.slice(0, 4)))
    const year      = sumRows(yearRows)
    const unpaid    = unpaidTotal(settlements)
    // 미수 큰 고객 — 잔액 양수만, 업체별 합
    const byCo = new Map<string, { name: string; sum: number; n: number; phone?: string }>()
    dedupeSettlements(settlements).forEach(s => {
      const b = Math.max(0, s.balance || 0)
      if (b <= 0) return
      const k = s.company_name || '(업체 미상)'
      const g = byCo.get(k) || { name: k, sum: 0, n: 0, phone: s.contact_phone || inqMap.get(s.inquiry_id || '')?.phone }
      g.sum += b; g.n++; byCo.set(k, g)
    })
    const topUnpaid = [...byCo.values()].sort((a, b) => b.sum - a.sum).slice(0, 5)
    // 이번 달 행사 목록 (매출 큰 순)
    const monthList = [...monthRows].sort((a, b) => b.revenue - a.revenue).slice(0, 8)
    return { month, received, year, unpaid, topUnpaid, monthList }
  }, [inquiries, settlements, payouts, expenses, assignments, ym])

  const [y, m] = ym.split('-')
  const isThisMonth = ym === today.slice(0, 7)

  return (
    <div className="max-w-lg mx-auto">
      <MobileHeader kicker="가디어스 · 돈" title="돈 한 눈" onRefresh={load} loading={loading} />
      <div className="px-4 pt-4 space-y-4">
        {error && <ErrorBox message={error} onRetry={load} />}
        {loading && settlements.length === 0 && !error && <p className="text-center text-gray-400 py-16 text-base">불러오는 중…</p>}
        {!loading && !error && (
          <>
            {/* 달 고르기 */}
            <div className="flex items-center justify-between">
              <button onClick={() => setYm(shiftMonth(ym, -1))} className="h-11 w-11 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center active:scale-95"><ChevronLeft className="h-5 w-5" /></button>
              <p className="text-lg font-extrabold text-gray-900">{y}년 {Number(m)}월{isThisMonth && <span className="text-sm text-gray-400 font-semibold ml-1">이번 달</span>}</p>
              <button onClick={() => setYm(shiftMonth(ym, 1))} disabled={isThisMonth} className="h-11 w-11 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center active:scale-95 disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Tile label="매출 (공급가)" value={formatKRW(calc.month.revenue)} sub={`${calc.month.count}건`} />
              <Tile label="수익" value={formatKRW(calc.month.profit)} sub={`${calc.month.profitRate}%${calc.month.estimatedCount > 0 ? ` · 추정 ${calc.month.estimatedCount}건 포함` : ''}`} tone={calc.month.profit < 0 ? 'bad' : 'good'} />
              <Tile label="입금" value={formatKRW(calc.received)} sub="이 달 행사의 입금 합" />
              <Tile label="미수 (전체)" value={formatKRW(calc.unpaid)} sub="달과 무관, 아직 못 받은 잔액" tone={calc.unpaid > 0 ? 'bad' : 'default'} />
            </div>
            {calc.month.pendingAmount > 0 && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">인건비 중 아직 송금 안 한 돈 {formatKRW(calc.month.pendingAmount)}</p>
            )}

            <p className="text-sm text-gray-600 px-1">{y}년 누적 매출 <b className="text-gray-900">{formatKRW(calc.year.revenue)}</b> · 수익 <b className="text-gray-900">{formatKRW(calc.year.profit)}</b> ({calc.year.profitRate}%)</p>

            <section className="rounded-2xl bg-white border-2 border-gray-200 overflow-hidden">
              <p className="px-4 pt-3 pb-2 text-2xs font-bold text-gray-500 tracking-wider">미수 큰 고객</p>
              {calc.topUnpaid.length === 0 ? <p className="px-4 pb-3 text-sm text-gray-400">미수 없음</p>
                : calc.topUnpaid.map(c => <Row key={c.name} title={c.name} desc={`${c.n}건`} right={formatKRW(c.sum)} tone="bad" tel={c.phone} />)}
            </section>

            <section className="rounded-2xl bg-white border-2 border-gray-200 overflow-hidden">
              <p className="px-4 pt-3 pb-2 text-2xs font-bold text-gray-500 tracking-wider">{Number(m)}월 행사 (매출 큰 순)</p>
              {calc.monthList.length === 0 ? <p className="px-4 pb-3 text-sm text-gray-400">이 달에 세는 행사 없음</p>
                : calc.monthList.map(r => (
                  <Row key={r.settlement.id} title={r.inquiry?.event_name || r.settlement.site_name || '(행사 미상)'}
                    desc={`${r.settlement.company_name || ''} · ${r.settlement.deposit_status}${r.payoutStage === 'estimated' ? ' · 지급 추정' : ''}`}
                    right={formatKRW(r.revenue)} tone={(r.settlement.balance || 0) > 0 ? 'warn' : undefined} />
                ))}
              {calc.month.count > calc.monthList.length && <p className="text-2xs text-gray-400 px-4 py-2">외 {calc.month.count - calc.monthList.length}건 — 전체는 PC 대시보드에서</p>}
            </section>
            <p className="text-2xs text-gray-400 px-1">대시보드·CEO 경영현황과 같은 규칙(lib/finance)으로 셉니다. 부가세 제외.</p>
          </>
        )}
      </div>
    </div>
  )
}
