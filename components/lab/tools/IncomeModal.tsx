'use client'

import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { db } from '@/lib/supabase/api'
import { X, Download, FileText, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import type { Payout, Assignment } from '@/lib/supabase/types'

// ── 타입 ─────────────────────────────────────────────────────────
interface IncomeRow {
  name:         string
  idNumber:     string
  siteName:     string   // 현장명 (어떤 행사인지 구분)
  subtotal:     number   // 일비 (과세소득)
  incomeTax:    number   // 소득세 3%
  localTax:     number   // 지방소득세 0.3%
  finalPay:     number   // 지급액 (실입금)
  paidAt:       string   // 지급일
  teamMembers:  string   // 팀원 이름(주민번호) 목록
}

// 과세소득 계산 (subtotal 필드 없으면 항목 합산으로 폴백)
function calcSubtotal(p: Payout): number {
  if (p.subtotal && p.subtotal > 0) return p.subtotal
  return (p.base_pay || 0) + (p.overtime_pay || 0) + (p.meal_pay || 0) +
         (p.transport_pay || 0) + (p.bonus || 0)
}

function formatDate(str: string) {
  const d = new Date(str)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatKRW(n: number) {
  return n.toLocaleString('ko-KR') + '원'
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────
export default function IncomeModal({ onClose }: { onClose: () => void }) {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [viewAll, setViewAll] = useState(false)   // 전체 보기 토글
  const [rows,  setRows]  = useState<IncomeRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchData() }, [year, month, viewAll])   // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchData() {
    setLoading(true)
    try {
      // 지급완료 전체 조회 (지급완료 + 완료 + 확인완료 모두 포함)
      // - '지급완료': 신버전 ERP 이후 상태값
      // - '완료': 구버전 이전 데이터 상태값
      // - '확인완료': 중간 단계 완료 처리 케이스
      const [payouts, assignments] = await Promise.all([
        db.list<Payout>('payouts', {
          inFilter: { status: ['지급완료', '완료', '확인완료'] },
          order: 'paid_at', asc: true,
        }),
        db.list<Assignment>('assignments', { order: 'assigned_at', asc: true }),
      ])

      // ── 중복 제거: 같은 assignment_id에 완료 payout이 여러 개면 첫 번째만 유지
      // (정상적으로 두 번 입금한 경우는 assignment_id가 다르므로 두 건 모두 유지됨)
      const seenAssignmentIds = new Set<string>()
      const dedupedPayouts = payouts.filter(p => {
        if (!p.assignment_id) return true
        if (seenAssignmentIds.has(p.assignment_id)) return false
        seenAssignmentIds.add(p.assignment_id)
        return true
      })

      // 월별 보기: paid_at(지급일) 기준으로 필터 — 지급일 미입력 건 제외
      // 전체 보기: 완료 상태 전체 표시 (paid_at 유무 무관)
      const monthStr = `${year}-${String(month).padStart(2, '0')}`
      const filtered = viewAll
        ? dedupedPayouts
        : dedupedPayouts.filter(p => p.paid_at && p.paid_at.startsWith(monthStr))

      // assignment 맵 생성
      const assignMap = new Map<string, Assignment>()
      assignments.forEach(a => assignMap.set(a.id, a))

      // 팀코드별 배정 그룹
      const teamMap = new Map<string, Assignment[]>()
      assignments.forEach(a => {
        if (a.team_code && a.inquiry_id) {
          const key = `${a.team_code}__${a.inquiry_id}`
          if (!teamMap.has(key)) teamMap.set(key, [])
          teamMap.get(key)!.push(a)
        }
      })

      const built: IncomeRow[] = filtered.map(p => {
        const subtotal   = calcSubtotal(p)
        const incomeTax  = Math.floor(subtotal * 0.03)
        const localTax   = Math.floor(subtotal * 0.003)

        // 팀원 정보 조회
        let teamMembers = ''
        if (p.assignment_id) {
          const assign = assignMap.get(p.assignment_id)
          if (assign?.team_code && assign?.inquiry_id) {
            const key     = `${assign.team_code}__${assign.inquiry_id}`
            const members = (teamMap.get(key) || []).filter(a => a.id !== p.assignment_id)
            if (members.length > 0) {
              teamMembers = members
                .map(a => `${a.staff_name || ''}${a.id_number ? `(${a.id_number})` : ''}`)
                .join(', ')
            }
          }
        }

        return {
          name:        p.staff_name || '-',
          idNumber:    p.id_number  || '-',
          siteName:    p.site_name  || '-',
          subtotal,
          incomeTax,
          localTax,
          finalPay:    p.final_pay  || 0,
          paidAt:      p.paid_at ? formatDate(p.paid_at) : '-',
          teamMembers,
        }
      })

      setRows(built)
    } catch (e) {
      toast.error('데이터를 불러오지 못했습니다: ' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // 월 이동
  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  // 합계
  const totals = rows.reduce((acc, r) => ({
    subtotal:  acc.subtotal  + r.subtotal,
    incomeTax: acc.incomeTax + r.incomeTax,
    localTax:  acc.localTax  + r.localTax,
    finalPay:  acc.finalPay  + r.finalPay,
  }), { subtotal: 0, incomeTax: 0, localTax: 0, finalPay: 0 })

  // 엑셀 내보내기
  function exportExcel() {
    if (rows.length === 0) { toast.error('내보낼 데이터가 없습니다.'); return }

    const headers = ['이름', '주민번호', '현장명', '일비(과세소득)', '소득세(3%)', '지방소득세(0.3%)', '지급액', '지급일', '팀원 정보']
    const data = rows.map(r => [
      r.name, r.idNumber, r.siteName, r.subtotal, r.incomeTax, r.localTax, r.finalPay, r.paidAt, r.teamMembers,
    ])

    // 합계 행
    data.push(['합계', '', '', totals.subtotal, totals.incomeTax, totals.localTax, totals.finalPay, '', ''])

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data])

    // 컬럼 너비
    ws['!cols'] = [
      { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 40 },
    ]

    // 숫자 포맷 (D~G열, 2행부터)
    for (let ri = 1; ri <= rows.length + 1; ri++) {
      ['D', 'E', 'F', 'G'].forEach(col => {
        const cell = ws[`${col}${ri + 1}`]
        if (cell && typeof cell.v === 'number') cell.z = '#,##0'
      })
    }

    const wb = XLSX.utils.book_new()
    const sheetName = viewAll ? '사업소득대장_전체' : `사업소득대장_${year}${String(month).padStart(2, '0')}`
    const fileName  = viewAll ? '사업소득대장_전체.xlsx' : `사업소득대장_${year}년_${month}월.xlsx`
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    XLSX.writeFile(wb, fileName)
    toast.success('엑셀 파일이 다운로드되었습니다.')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-teal-100 rounded-xl flex items-center justify-center">
              <FileText className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900">사업소득대장</p>
              <p className="text-xs text-gray-400">월별 인건비 지급 내역 · 소득세 신고용</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 월 선택 + 내보내기 */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-3">
            {/* 전체/월별 토글 */}
            <div className="flex bg-gray-200 rounded-lg p-0.5 text-xs font-semibold">
              <button
                onClick={() => setViewAll(false)}
                className={`px-3 py-1 rounded-md transition-all ${!viewAll ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >월별</button>
              <button
                onClick={() => setViewAll(true)}
                className={`px-3 py-1 rounded-md transition-all ${viewAll ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >전체</button>
            </div>
            {/* 월 선택 (월별 모드일 때만) */}
            {!viewAll && (
              <div className="flex items-center gap-1">
                <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-base font-extrabold text-gray-900 min-w-[100px] text-center">
                  {year}년 {month}월
                </span>
                <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
            {viewAll && (
              <span className="text-base font-extrabold text-gray-900">전체 지급 내역</span>
            )}
            {loading && <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              {rows.length}건 · 지급완료 기준
            </span>
            <button
              onClick={exportExcel}
              disabled={rows.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              엑셀 내보내기
            </button>
          </div>
        </div>

        {/* 테이블 */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />불러오는 중...
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <p className="text-3xl mb-3">📭</p>
              <p className="text-gray-400 text-sm">{year}년 {month}월 지급완료 내역이 없습니다.</p>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide sticky top-0 z-10">
                  <th className="px-4 py-2.5 text-left border-b border-gray-100 whitespace-nowrap">이름</th>
                  <th className="px-4 py-2.5 text-left border-b border-gray-100 whitespace-nowrap">주민번호</th>
                  <th className="px-4 py-2.5 text-left border-b border-gray-100 whitespace-nowrap">현장명</th>
                  <th className="px-4 py-2.5 text-right border-b border-gray-100 whitespace-nowrap">일비 (과세소득)</th>
                  <th className="px-4 py-2.5 text-right border-b border-gray-100 whitespace-nowrap">소득세 (3%)</th>
                  <th className="px-4 py-2.5 text-right border-b border-gray-100 whitespace-nowrap">지방소득세 (0.3%)</th>
                  <th className="px-4 py-2.5 text-right border-b border-gray-100 whitespace-nowrap">지급액</th>
                  <th className="px-4 py-2.5 text-center border-b border-gray-100 whitespace-nowrap">지급일</th>
                  <th className="px-4 py-2.5 text-left border-b border-gray-100 whitespace-nowrap">팀원 정보</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{r.name}</td>
                    <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{r.idNumber}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs max-w-[120px] truncate">{r.siteName}</td>
                    <td className="px-4 py-2.5 text-right text-gray-800 font-semibold">{r.subtotal.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-red-500">{r.incomeTax.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-orange-500">{r.localTax.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-teal-700">{r.finalPay.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-center text-gray-500 text-xs">{r.paidAt}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[200px]">
                      {r.teamMembers
                        ? <span className="text-indigo-600">{r.teamMembers}</span>
                        : <span className="text-gray-300">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* 합계 행 */}
              <tfoot>
                <tr className="bg-teal-50 font-bold text-sm border-t-2 border-teal-200">
                  <td className="px-4 py-3 text-teal-800" colSpan={3}>합계 ({rows.length}건)</td>
                  <td className="px-4 py-3 text-right text-gray-800">{totals.subtotal.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-red-600">{totals.incomeTax.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-orange-600">{totals.localTax.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-teal-700">{totals.finalPay.toLocaleString()}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
