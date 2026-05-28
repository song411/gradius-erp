'use client'

import { useState, useMemo } from 'react'
import { db } from '@/lib/supabase/api'
import { formatKRW } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Building2, AlertCircle, CheckCircle2, Clock, Search, Download } from 'lucide-react'
import type { CeoData } from './CeoContent'
import type { Settlement, Inquiry } from '@/lib/supabase/types'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { PeriodFilter, isInPeriodFn, type PeriodState } from './PeriodFilter'

type DepositStatus = '입금완료' | '부분입금' | '미입금'
const DEPOSIT_COLOR: Record<DepositStatus, string> = {
  '미입금':  'bg-red-100 text-red-700',
  '부분입금': 'bg-yellow-100 text-yellow-700',
  '입금완료': 'bg-green-100 text-green-700',
}
const STATUS_ORDER: Record<DepositStatus, number> = {
  '미입금': 0, '부분입금': 1, '입금완료': 2,
}

export default function DepositTab({ data }: { data: CeoData }) {
  const { settlements, inquiries, reload } = data
  const [filter, setFilter]         = useState<'' | DepositStatus>('')
  const [periodState, setPeriodState] = useState<PeriodState>({ period: '전체', customFrom: '', customTo: '' })
  const [search, setSearch]         = useState('')
  const [editId, setEditId]         = useState<string | null>(null)
  const [editAmt, setEditAmt]       = useState('')
  const [saving, setSaving]         = useState(false)

  // 정산 + 문의 조인
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return settlements
      .map(s => ({
        ...s,
        inquiry: inquiries.find(inq => inq.id === s.inquiry_id),
      }))
      .filter(s => !filter || s.deposit_status === filter)
      // 행사일 없으면(날짜 미정) 정산 등록일로 대체
      .filter(s => isInPeriodFn(s.inquiry?.event_start || s.created_at, periodState))
      .filter(s => {
        if (!q) return true
        const company   = (s.company_name || s.inquiry?.company_name || '').toLowerCase()
        const eventName = (s.inquiry?.event_name || '').toLowerCase()
        const siteName  = (s.site_name || '').toLowerCase()
        return company.includes(q) || eventName.includes(q) || siteName.includes(q)
      })
      .sort((a, b) => {
        const ao = STATUS_ORDER[(a.deposit_status as DepositStatus)] ?? 3
        const bo = STATUS_ORDER[(b.deposit_status as DepositStatus)] ?? 3
        return ao - bo
      })
  }, [settlements, inquiries, filter, periodState, search])

  // 필터된 합계
  const filteredBilled   = rows.reduce((acc, s) => acc + (s.invoice_amount || s.supply_price || 0), 0)
  const filteredReceived = rows.reduce((acc, s) => acc + (s.received_amount || 0), 0)
  const filteredBalance  = rows.reduce((acc, s) => acc + Math.max(0, (s.invoice_amount || s.supply_price || 0) - (s.received_amount || 0)), 0)

  // 엑셀 내보내기
  function exportExcel() {
    if (rows.length === 0) { toast.error('내보낼 데이터가 없습니다.'); return }
    const headers = ['업체명', '행사명', '청구금액', '받은금액', '미수금', '입금상태']
    const data = rows.map(s => [
      s.company_name || s.inquiry?.company_name || '-',
      s.inquiry?.event_name || '-',
      s.invoice_amount || s.supply_price || 0,
      s.received_amount || 0,
      Math.max(0, (s.invoice_amount || s.supply_price || 0) - (s.received_amount || 0)),
      s.deposit_status || '-',
    ])
    data.push(['합계', '', filteredBilled, filteredReceived, filteredBalance, ''])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data])
    ws['!cols'] = [{ wch: 16 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '업체입금현황')
    XLSX.writeFile(wb, `업체입금현황_${new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '')}.xlsx`)
    toast.success('엑셀 파일을 다운로드했습니다.')
  }

  // 요약
  const billed = (s: Settlement) => s.invoice_amount || s.supply_price || 0
  const unpaid   = settlements.filter(s => s.deposit_status === '미입금')
  const partial  = settlements.filter(s => s.deposit_status === '부분입금')
  const complete = settlements.filter(s => s.deposit_status === '입금완료')
  // 미입금: 청구금액 합계 (못 받은 총액)
  const totalUnpaid   = unpaid.reduce((acc, r) => acc + billed(r), 0)
  // 부분입금: 실제 받은금액 합계
  const totalPartialReceived = partial.reduce((acc, r) => acc + (r.received_amount || 0), 0)
  // 입금완료: 청구금액 합계 (완납 총액)
  const totalComplete = complete.reduce((acc, r) => acc + billed(r), 0)
  // 전체 실수령액: 모든 정산 건의 received_amount 합산 (청구금액 초과 수령 케이스도 정확히 반영)
  const totalReceived = settlements.reduce((acc, r) => acc + (r.received_amount || 0), 0)

  async function handleSaveAmount(sett: Settlement) {
    const amt = Number(editAmt)
    if (isNaN(amt) || amt < 0) { toast.error('올바른 금액을 입력해주세요.'); return }
    setSaving(true)
    const billedAmt = billed(sett)
    try {
      const newDeposit: DepositStatus =
        amt === 0            ? '미입금' :
        amt >= billedAmt     ? '입금완료' : '부분입금'

      await db.update('settlements', sett.id, {
        received_amount: amt,
        deposit_status:  newDeposit,
      })
      toast.success('입금 정보가 업데이트되었습니다.')
      setEditId(null)
      reload()
    } catch {
      toast.error('저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function handleQuickDeposit(sett: Settlement, pct: number) {
    const amt = Math.round(billed(sett) * pct)
    setSaving(true)
    try {
      const newDeposit: DepositStatus = pct >= 1 ? '입금완료' : '부분입금'
      await db.update('settlements', sett.id, {
        received_amount: amt,
        deposit_status:  newDeposit,
      })
      toast.success(`${pct * 100}% 입금 확인 처리되었습니다.`)
      reload()
    } catch {
      toast.error('처리 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-red-700 mb-1">
            <AlertCircle className="h-4 w-4" />
            <span className="text-xs font-bold">미입금</span>
          </div>
          <p className="text-2xl font-extrabold text-red-700">{unpaid.length}<span className="text-sm font-normal ml-0.5">건</span></p>
          <p className="text-xs text-red-600 font-semibold mt-0.5">{formatKRW(totalUnpaid)}</p>
        </div>
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-yellow-700 mb-1">
            <Clock className="h-4 w-4" />
            <span className="text-xs font-bold">부분입금</span>
          </div>
          <p className="text-2xl font-extrabold text-yellow-700">{partial.length}<span className="text-sm font-normal ml-0.5">건</span></p>
          <p className="text-xs text-yellow-600 font-semibold mt-0.5">수령 {formatKRW(totalPartialReceived)}</p>
        </div>
        <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-green-700 mb-1">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-xs font-bold">입금완료</span>
          </div>
          <p className="text-2xl font-extrabold text-green-700">{complete.length}<span className="text-sm font-normal ml-0.5">건</span></p>
          <p className="text-xs text-green-600 font-semibold mt-0.5">{formatKRW(totalComplete)}</p>
        </div>
        <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-blue-700 mb-1">
            <Building2 className="h-4 w-4" />
            <span className="text-xs font-bold">전체 실수령</span>
          </div>
          <p className="text-2xl font-extrabold text-blue-700">{settlements.length}<span className="text-sm font-normal ml-0.5">건</span></p>
          <p className="text-xs text-blue-600 font-semibold mt-0.5">{formatKRW(totalReceived)}</p>
        </div>
      </div>

      {/* 검색 + 기간 필터 + 엑셀 */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="업체명, 행사명 검색..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          {/* 기간 필터 */}
          <PeriodFilter value={periodState} onChange={setPeriodState} />
          {/* 입금상태 필터 */}
          {(['', '미입금', '부분입금', '입금완료'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-full border-2 font-semibold transition-colors ${filter === f ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
              {f || '전체상태'}
            </button>
          ))}
          <button onClick={exportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-full text-xs font-semibold hover:bg-emerald-700 ml-auto">
            <Download className="h-3.5 w-3.5" />엑셀 내보내기
          </button>
        </div>
        {/* 필터 결과 소계 */}
        <div className="flex items-center gap-4 text-xs text-gray-500 px-1">
          <span>결과 <b className="text-gray-800">{rows.length}건</b></span>
          <span>청구 <b className="text-gray-800">{filteredBilled.toLocaleString()}원</b></span>
          <span>수령 <b className="text-green-700">{filteredReceived.toLocaleString()}원</b></span>
          <span>미수금 <b className="text-red-600">{filteredBalance.toLocaleString()}원</b></span>
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100 border-b-2 border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-700">업체명</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-gray-700">행사명</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-gray-700">행사일</th>
                <th className="text-right px-3 py-3 text-xs font-bold text-gray-700">청구금액</th>
                <th className="text-right px-3 py-3 text-xs font-bold text-gray-700">받은금액</th>
                <th className="text-right px-3 py-3 text-xs font-bold text-gray-700">미수금</th>
                <th className="text-center px-3 py-3 text-xs font-bold text-gray-700">입금상태</th>
                <th className="text-center px-3 py-3 text-xs font-bold text-gray-700">계산서</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-700">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rows.length === 0 && (
                <tr><td colSpan={9} className="text-center py-10 text-gray-500">데이터가 없습니다.</td></tr>
              )}
              {rows.map(s => {
                const balance = s.balance ?? (s.supply_price - s.received_amount)
                const isEditing = editId === s.id
                const eventDate = s.inquiry?.event_start?.slice(0, 10)
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{s.company_name || s.inquiry?.company_name || '-'}</td>
                    <td className="px-3 py-3 text-gray-700 text-sm font-medium max-w-[160px] truncate">{s.inquiry?.event_name || '-'}</td>
                    <td className="px-3 py-3 text-gray-600 text-xs whitespace-nowrap">{eventDate || <span className="text-gray-400">-</span>}</td>
                    <td className="px-3 py-3 text-right font-semibold text-gray-900">{formatKRW(s.invoice_amount || s.supply_price)}</td>
                    <td className="px-3 py-3 text-right">
                      {isEditing ? (
                        <div className="flex items-center gap-1 justify-end">
                          <Input
                            type="number"
                            value={editAmt}
                            onChange={e => setEditAmt(e.target.value)}
                            className="w-32 h-7 text-xs text-right"
                            autoFocus
                          />
                          <Button size="sm" className="h-7 text-xs" onClick={() => handleSaveAmount(s)} disabled={saving}>저장</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditId(null)}>취소</Button>
                        </div>
                      ) : (
                        <button
                          className="text-blue-700 font-semibold hover:underline"
                          onClick={() => { setEditId(s.id); setEditAmt(String(s.received_amount)) }}
                        >
                          {formatKRW(s.received_amount)}
                        </button>
                      )}
                    </td>
                    <td className={`px-3 py-3 text-right font-bold ${balance > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {balance > 0 ? formatKRW(balance) : '-'}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${DEPOSIT_COLOR[s.deposit_status as DepositStatus] || 'bg-gray-100 text-gray-600'}`}>
                        {s.deposit_status || '-'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {s.tax_invoice_issued
                        ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">발행완료</span>
                        : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">미발행</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.deposit_status !== '입금완료' && !isEditing && (
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            size="sm" variant="outline" className="text-xs h-7"
                            onClick={() => handleQuickDeposit(s, 0.5)}
                            disabled={saving}
                          >
                            50%
                          </Button>
                          <Button
                            size="sm" variant="outline" className="text-xs h-7"
                            onClick={() => handleQuickDeposit(s, 1)}
                            disabled={saving}
                          >
                            전액
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
