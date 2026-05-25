'use client'

import { useState, useMemo } from 'react'
import { formatKRW } from '@/lib/utils'
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { CeoData } from './CeoContent'
import type { Inquiry, Settlement, Payout } from '@/lib/supabase/types'

// 수익률 색상
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

interface ProjectRow {
  inquiry:     Inquiry
  settlement:  Settlement | undefined
  payouts:     Payout[]
  supplyPrice: number
  totalPayout: number
  profit:      number
  profitRate:  number
}

export default function ProfitTab({ data }: { data: CeoData }) {
  const { inquiries, settlements, payouts } = data
  const [openRows, setOpenRows] = useState<Set<string>>(new Set())
  const [sortKey, setSortKey]   = useState<'profit' | 'rate' | 'supply'>('profit')

  // 프로젝트별 수익 계산
  const projects: ProjectRow[] = useMemo(() => {
    return inquiries
      .filter(q => !['접수', '견적', '미체결', '보류', '취소'].includes(q.status))
      .map(q => {
        const sett      = settlements.find(s => s.inquiry_id === q.id)
        const inqPayouts = payouts.filter(p => p.inquiry_id === q.id && (p.status === '지급완료' || p.status === '완료'))
        const supplyPrice = sett?.supply_price || 0
        const totalPayout = inqPayouts.reduce((s, p) => s + p.final_pay, 0)
        const profit      = supplyPrice - totalPayout
        const profitRate  = supplyPrice > 0 ? Math.round((profit / supplyPrice) * 100) : 0

        return { inquiry: q, settlement: sett, payouts: inqPayouts, supplyPrice, totalPayout, profit, profitRate }
      })
      .filter(r => r.supplyPrice > 0)
      .sort((a, b) => {
        if (sortKey === 'profit')  return b.profit      - a.profit
        if (sortKey === 'rate')    return b.profitRate  - a.profitRate
        if (sortKey === 'supply')  return b.supplyPrice - a.supplyPrice
        return 0
      })
  }, [inquiries, settlements, payouts, sortKey])

  // 총계
  const totalSupply = projects.reduce((s, r) => s + r.supplyPrice, 0)
  const totalPayout = projects.reduce((s, r) => s + r.totalPayout, 0)
  const totalProfit = projects.reduce((s, r) => s + r.profit, 0)
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
        <p className="text-xs font-semibold text-slate-400 mb-4 uppercase tracking-wider">프로젝트 수익 총계 ({projects.length}건)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="총 공급가액" value={formatKRW(totalSupply)} sub="(VAT 제외)" color="white" />
          <SummaryCard label="총 지급액" value={formatKRW(totalPayout)} sub="지급완료 기준" color="orange" />
          <SummaryCard label="총 순수익" value={formatKRW(totalProfit)} sub="" color="emerald" />
          <SummaryCard label="평균 수익률" value={`${avgRate}%`} sub="" color="purple" />
        </div>
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
            {projects.length === 0 && (
              <tr><td colSpan={9} className="py-10 text-center text-gray-400">데이터가 없습니다.</td></tr>
            )}
            {projects.map(r => {
              const isOpen = openRows.has(r.inquiry.id)
              return (
                <>
                  <tr
                    key={r.inquiry.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => r.payouts.length > 0 && toggleRow(r.inquiry.id)}
                  >
                    <td className="px-3 py-3 text-gray-400">
                      {r.payouts.length > 0 && (
                        isOpen
                          ? <ChevronDown className="h-3.5 w-3.5" />
                          : <ChevronRight className="h-3.5 w-3.5" />
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
                      {r.totalPayout > 0 ? formatKRW(r.totalPayout) : <span className="text-gray-300 text-xs">미입력</span>}
                    </td>
                    <td className={`px-3 py-3 text-right font-bold ${r.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {r.totalPayout > 0 ? formatKRW(r.profit) : '-'}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {r.totalPayout > 0 ? <ProfitRateTag rate={r.profitRate} /> : <span className="text-gray-300 text-xs">-</span>}
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

                  {/* 드릴다운: 지급 내역 */}
                  {isOpen && r.payouts.length > 0 && (
                    <tr key={`${r.inquiry.id}-detail`}>
                      <td colSpan={9} className="bg-slate-50 px-8 py-3">
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
              <td colSpan={4} className="px-3 py-3 text-sm text-gray-700">합계 ({projects.length}건)</td>
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
