'use client'

import { useState, useMemo } from 'react'
import { formatKRW } from '@/lib/utils'
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus, Clock, Users, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { CeoData } from './CeoContent'
import type { Inquiry, Settlement, Payout } from '@/lib/supabase/types'
import { PeriodFilter, isInPeriodFn, type PeriodState } from './PeriodFilter'

// 본사 인원 목록
const HQ_NAMES = new Set(['최규성', '송무재', '여지은', '김영찬'])

// 수익률 태그
function ProfitRateTag({ rate }: { rate: number }) {
  const color =
    rate >= 30 ? 'bg-emerald-100 text-emerald-700' :
    rate >= 20 ? 'bg-blue-100 text-blue-700' :
    rate >= 10 ? 'bg-yellow-100 text-yellow-700' :
    rate > 0   ? 'bg-orange-100 text-orange-700' :
                 'bg-red-100 text-red-700'
  const Icon = rate >= 20 ? TrendingUp : rate >= 10 ? Minus : TrendingDown
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>
      <Icon className="h-3 w-3" />{rate}%
    </span>
  )
}

// 본사 인원 전용 태그 (수익률 100%)
function HqRateTag() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap">
      <Users className="h-3 w-3" />본사 100%
    </span>
  )
}

// 지급 대기 태그
function PendingTag() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
      <Clock className="h-3 w-3" />지급 후 표시
    </span>
  )
}

// 지급 케이스 구분
type PayoutCase = 'normal' | 'hq_only' | 'pending' | 'none'

interface ProjectRow {
  inquiry:     Inquiry
  settlement:  Settlement | undefined
  payouts:     Payout[]        // 지급완료 건만
  supplyPrice: number
  totalPayout: number
  profit:      number
  profitRate:  number
  payoutCase:  PayoutCase      // 케이스 구분
  hqNames:     string[]        // 본사 인원 이름 목록
}

export default function ProfitTab({ data }: { data: CeoData }) {
  const { inquiries, settlements, payouts, assignments } = data
  type RateFilter = '전체' | '30%이상' | '20-30%' | '10-20%' | '10%미만'

  const [openRows, setOpenRows]       = useState<Set<string>>(new Set())
  const [sortKey, setSortKey]         = useState<'profit' | 'rate' | 'supply'>('profit')
  const [search, setSearch]           = useState('')
  const [periodState, setPeriodState] = useState<PeriodState>({ period: '전체', customFrom: '', customTo: '' })
  const [rateFilter, setRateFilter]   = useState<RateFilter>('전체')

  function matchesRateFilter(rate: number): boolean {
    if (rateFilter === '전체') return true
    if (rateFilter === '30%이상') return rate >= 30
    if (rateFilter === '20-30%')  return rate >= 20 && rate < 30
    if (rateFilter === '10-20%')  return rate >= 10 && rate < 20
    if (rateFilter === '10%미만') return rate < 10
    return true
  }

  // 프로젝트별 수익 계산
  const projects: ProjectRow[] = useMemo(() => {
    return inquiries
      .filter(q => !['접수', '견적', '미체결', '보류', '취소'].includes(q.status))
      .map(q => {
        const sett         = settlements.find(s => s.inquiry_id === q.id)
        const donePaouts   = payouts.filter(p => p.inquiry_id === q.id && (p.status === '지급완료' || p.status === '완료'))
        const allPayouts   = payouts.filter(p => p.inquiry_id === q.id)
        const inqAssigns   = assignments.filter(a => a.inquiry_id === q.id)

        const supplyPrice = sett?.supply_price || 0
        const totalPayout = donePaouts.reduce((s, p) => s + p.final_pay, 0)
        const profit      = supplyPrice - totalPayout
        const profitRate  = supplyPrice > 0 ? Math.round((profit / supplyPrice) * 100) : 0

        // 본사 인원만 배정된 경우 판별
        const hqNames     = inqAssigns.filter(a => a.staff_name && HQ_NAMES.has(a.staff_name)).map(a => a.staff_name!)
        const nonHqAssigns = inqAssigns.filter(a => !HQ_NAMES.has(a.staff_name || ''))
        const isHqOnly    = inqAssigns.length > 0 && nonHqAssigns.length === 0

        // 케이스 결정
        let payoutCase: PayoutCase = 'none'
        if (totalPayout > 0) {
          payoutCase = 'normal'
        } else if (isHqOnly) {
          payoutCase = 'hq_only'               // 본사 인원만 → 지급비 없음, 수익률 100%
        } else if (allPayouts.length > 0 || nonHqAssigns.length > 0) {
          payoutCase = 'pending'               // 배정/지급 있지만 아직 미지급완료
        } else {
          payoutCase = 'none'                  // 배정 자체 없음
        }

        return { inquiry: q, settlement: sett, payouts: donePaouts, supplyPrice, totalPayout, profit, profitRate, payoutCase, hqNames }
      })
      .filter(r => r.supplyPrice > 0)
      .sort((a, b) => {
        if (sortKey === 'profit')  return b.profit      - a.profit
        if (sortKey === 'rate')    return b.profitRate  - a.profitRate
        if (sortKey === 'supply')  return b.supplyPrice - a.supplyPrice
        return 0
      })
  }, [inquiries, settlements, payouts, assignments, sortKey])

  // 검색 + 기간 + 수익률 필터
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return projects.filter(r => {
      if (!isInPeriodFn(r.inquiry.event_start, periodState)) return false
      if (!matchesRateFilter(r.profitRate)) return false
      if (!q) return true
      const eventName = (r.inquiry.event_name || '').toLowerCase()
      const company   = (r.inquiry.company_name || '').toLowerCase()
      return eventName.includes(q) || company.includes(q)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, search, periodState, rateFilter])

  // 총계
  const totalSupply = filtered.reduce((s, r) => s + r.supplyPrice, 0)
  const totalPayout = filtered.reduce((s, r) => s + r.totalPayout, 0)
  const totalProfit = filtered.reduce((s, r) => s + r.profit, 0)
  const avgRate     = totalSupply > 0 ? Math.round((totalProfit / totalSupply) * 100) : 0

  function toggleRow(id: string) {
    setOpenRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-5">
      {/* 전체 요약 */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-700 rounded-2xl p-5">
        <p className="text-xs font-semibold text-slate-400 mb-4 uppercase tracking-wider">프로젝트 수익 총계 ({filtered.length}건{search ? ` / 검색 중` : ''})</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="총 공급가액" value={formatKRW(totalSupply)} sub="(VAT 제외)" color="white" />
          <SummaryCard label="총 지급액" value={formatKRW(totalPayout)} sub="지급완료 기준" color="orange" />
          <SummaryCard label="총 순수익" value={formatKRW(totalProfit)} sub="" color="emerald" />
          <SummaryCard label="평균 수익률" value={`${avgRate}%`} sub="" color="purple" />
        </div>
      </div>

      {/* 검색 + 기간 + 수익률 필터 */}
      <div className="space-y-2">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="행사명, 업체명 검색..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <PeriodFilter value={periodState} onChange={setPeriodState} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-bold shrink-0">수익률:</span>
          {(['전체', '30%이상', '20-30%', '10-20%', '10%미만'] as const).map(r => (
            <button key={r} onClick={() => setRateFilter(r)}
              className={`text-xs px-3 py-1.5 rounded-full border-2 font-semibold transition-colors ${rateFilter === r ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-300 hover:border-emerald-400'}`}>
              {r}
            </button>
          ))}
        </div>
        {(search || periodState.period !== '전체' || periodState.customFrom || periodState.customTo || rateFilter !== '전체') && (
          <p className="text-xs text-gray-400 px-1">결과 {filtered.length}건</p>
        )}
      </div>

      {/* 정렬 */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-600 font-bold">정렬:</span>
        {([['profit', '수익액순'], ['rate', '수익률순'], ['supply', '매출액순']] as const).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setSortKey(k)}
            className={`text-xs px-4 py-1.5 rounded-full border-2 font-semibold transition-colors ${
              sortKey === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* 프로젝트 목록 */}
      <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100 border-b-2 border-gray-200">
              <th className="w-8 px-3 py-3" />
              <th className="text-left px-3 py-3 text-xs font-bold text-gray-600">행사명</th>
              <th className="text-left px-3 py-3 text-xs font-bold text-gray-600">업체명</th>
              <th className="text-left px-3 py-3 text-xs font-bold text-gray-600">행사일</th>
              <th className="text-right px-3 py-3 text-xs font-bold text-gray-600">공급가액</th>
              <th className="text-right px-3 py-3 text-xs font-bold text-gray-600">총지급</th>
              <th className="text-right px-3 py-3 text-xs font-bold text-gray-600">순수익</th>
              <th className="text-center px-3 py-3 text-xs font-bold text-gray-600">수익률</th>
              <th className="text-center px-3 py-3 text-xs font-bold text-gray-600">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="py-10 text-center text-gray-400">{search ? `"${search}" 검색 결과가 없습니다.` : '데이터가 없습니다.'}</td></tr>
            )}
            {filtered.map(r => {
              const isOpen = openRows.has(r.inquiry.id)
              return (
                <>
                  <tr
                    key={r.inquiry.id}
                    className={`transition-colors ${r.payoutCase !== 'none' ? 'hover:bg-gray-50 cursor-pointer' : ''}`}
                    onClick={() => r.payoutCase !== 'none' && toggleRow(r.inquiry.id)}
                  >
                    <td className="px-3 py-3 text-gray-400">
                      {r.payoutCase !== 'none' && (
                        isOpen
                          ? <ChevronDown className="h-3.5 w-3.5" />
                          : <ChevronRight className="h-3.5 w-3.5 opacity-40" />
                      )}
                    </td>
                    <td className="px-3 py-3 font-medium text-gray-800 max-w-[160px]">
                      <p className="truncate">{r.inquiry.event_name}</p>
                    </td>
                    <td className="px-3 py-3 text-gray-500 text-xs">{r.inquiry.company_name || '-'}</td>
                    <td className="px-3 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {r.inquiry.event_start?.slice(0, 10) || '-'}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold">{formatKRW(r.supplyPrice)}</td>
                    <td className="px-3 py-3 text-right text-orange-600">
                      {r.payoutCase === 'normal'  && formatKRW(r.totalPayout)}
                      {r.payoutCase === 'hq_only' && <span className="text-slate-400 text-xs">₩0 (본사)</span>}
                      {r.payoutCase === 'pending' && <span className="text-amber-500 text-xs flex items-center justify-end gap-1"><Clock className="h-3 w-3" />지급 전</span>}
                      {r.payoutCase === 'none'    && <span className="text-gray-300 text-xs">배정 없음</span>}
                    </td>
                    <td className={`px-3 py-3 text-right font-bold ${r.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {r.payoutCase === 'normal'  && formatKRW(r.profit)}
                      {r.payoutCase === 'hq_only' && <span className="text-emerald-600 font-bold">{formatKRW(r.supplyPrice)}</span>}
                      {(r.payoutCase === 'pending' || r.payoutCase === 'none') && <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {r.payoutCase === 'normal'  && <ProfitRateTag rate={r.profitRate} />}
                      {r.payoutCase === 'hq_only' && <HqRateTag />}
                      {r.payoutCase === 'pending' && <PendingTag />}
                      {r.payoutCase === 'none'    && <span className="text-gray-300 text-xs">-</span>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        r.inquiry.status === '정산완료' ? 'bg-gray-100 text-gray-500' :
                        r.inquiry.status === '완료'    ? 'bg-blue-100 text-blue-700' :
                        r.inquiry.status === '진행중'  ? 'bg-green-100 text-green-700' :
                                                         'bg-yellow-100 text-yellow-700'
                      }`}>{r.inquiry.status}</span>
                    </td>
                  </tr>

                  {/* 드릴다운: 지급 내역 or 케이스 설명 */}
                  {isOpen && (
                    <tr key={`${r.inquiry.id}-detail`}>
                      <td colSpan={9} className="bg-slate-50 px-8 py-4 border-t border-dashed border-slate-200">
                        {r.payoutCase === 'normal' && (
                          <>
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">지급 내역</p>
                            <div className="flex flex-wrap gap-2">
                              {r.payouts.map(p => (
                                <div key={p.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs">
                                  <p className="font-semibold text-gray-800">{p.staff_name || '이름 없음'}</p>
                                  <p className="text-gray-500">{p.bank_name} {p.account_number}</p>
                                  <p className="text-blue-700 font-bold mt-0.5">{formatKRW(p.final_pay)}</p>
                                </div>
                              ))}
                              <div className="bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-xs flex flex-col justify-center">
                                <p className="text-gray-500">합계 지급</p>
                                <p className="font-bold text-gray-800">{formatKRW(r.totalPayout)}</p>
                              </div>
                            </div>
                          </>
                        )}
                        {r.payoutCase === 'hq_only' && (
                          <div className="flex items-center gap-3">
                            <div className="bg-slate-100 rounded-lg px-3 py-2 flex items-center gap-2">
                              <Users className="h-4 w-4 text-slate-500" />
                              <div>
                                <p className="text-[10px] text-slate-500 font-semibold">본사 인원 투입</p>
                                <p className="text-xs font-bold text-slate-700">{r.hqNames.join(', ')}</p>
                              </div>
                            </div>
                            <p className="text-xs text-emerald-600 font-semibold">지급비 없음 → 수익 = 공급가액 전액</p>
                          </div>
                        )}
                        {r.payoutCase === 'pending' && (
                          <div className="flex items-center gap-2 text-amber-600">
                            <Clock className="h-4 w-4" />
                            <p className="text-xs font-semibold">인력비 지급관리에서 검토완료 후 지급완료 처리 시 수익이 표시됩니다.</p>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
          {/* 총계 행 */}
          <tfoot>
            <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
              <td colSpan={4} className="px-3 py-3 text-sm text-gray-700">합계 ({filtered.length}건)</td>
              <td className="px-3 py-3 text-right text-sm">{formatKRW(totalSupply)}</td>
              <td className="px-3 py-3 text-right text-sm text-orange-600">{formatKRW(totalPayout)}</td>
              <td className="px-3 py-3 text-right text-sm text-emerald-700">{formatKRW(totalProfit)}</td>
              <td className="px-3 py-3 text-center"><ProfitRateTag rate={avgRate} /></td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, sub, color }: {
  label: string; value: string; sub: string; color: string
}) {
  const styles: Record<string, string> = {
    white:   'bg-white/10 text-white',
    orange:  'bg-orange-500/20 border border-orange-500/30 text-orange-200',
    emerald: 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-200',
    purple:  'bg-purple-500/20 border border-purple-500/30 text-purple-200',
  }
  return (
    <div className={`rounded-xl p-4 backdrop-blur-sm ${styles[color]}`}>
      <p className="text-xs opacity-70 mb-1">{label}</p>
      <p className="text-xl font-bold leading-tight">{value}</p>
      {sub && <p className="text-[10px] opacity-50 mt-0.5">{sub}</p>}
    </div>
  )
}
