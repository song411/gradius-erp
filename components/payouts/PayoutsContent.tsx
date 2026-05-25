'use client'

import { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { db } from '@/lib/supabase/api'
import type { Inquiry, Assignment, Payout } from '@/lib/supabase/types'
import { formatKRW, formatDate } from '@/lib/utils'
import PayoutForm from './PayoutForm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Search,
  ChevronRight,
  Users,
  Wallet,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  PencilLine,
  Trash2,
  Building2,
  UserX,
  Download,
} from 'lucide-react'
import { toast } from 'sonner'

// 지급 상태별 스타일
// DB enum: 대기 | 확인완료(→검토완료로 표시) | 완료(→입금완료로 표시) | 미지급
// Supabase에서 ALTER TYPE 실행 후 검토완료/지급완료 직접 사용 가능
const STATUS_STYLE: Record<string, string> = {
  '대기':     'bg-yellow-100 text-yellow-700',
  '확인완료': 'bg-blue-100 text-blue-700',   // 검토완료
  '검토완료': 'bg-blue-100 text-blue-700',
  '완료':     'bg-green-100 text-green-700',  // 입금완료
  '지급완료': 'bg-green-100 text-green-700',
  '미지급':   'bg-red-100 text-red-600',
  '보류':     'bg-gray-100 text-gray-600',
}

// UI 표시용 상태 레이블 (DB값 → 사용자 친화적 표시)
const STATUS_LABEL: Record<string, string> = {
  '대기':     '대기',
  '확인완료': '검토완료',
  '검토완료': '검토완료',
  '완료':     '입금완료',
  '지급완료': '입금완료',
  '미지급':   '미지급',
  '보류':     '보류',
}

// 행사별 집계 (본사 포함 전체)
function groupByInquiry(
  inquiries: Inquiry[],
  assignments: Assignment[],
  payouts: Payout[],
) {
  return inquiries.map(inq => {
    const inqAssigns    = assignments.filter(a => a.inquiry_id === inq.id)
    // 유급 (외부): is_payable이 false가 아닌 것
    const payableAssigns = inqAssigns.filter(a => a.is_payable !== false)
    // 무급 (본사): is_payable === false
    const companyAssigns = inqAssigns.filter(a => a.is_payable === false)
    const inqPayouts    = payouts.filter(p => p.inquiry_id === inq.id)

    const totalFinal    = inqPayouts.reduce((s, p) => s + (p.final_pay || 0), 0)
    const pendingCount   = inqPayouts.filter(p => p.status === '대기').length
    const confirmedCount = inqPayouts.filter(p => p.status === '검토완료' || p.status === '확인완료').length
    const paidCount      = inqPayouts.filter(p => p.status === '완료' || p.status === '지급완료').length
    // 팀원은 미등록 카운트에서 제외 (팀장만 지급 등록 대상)
    const unregistered  = payableAssigns
      .filter(a => a.role_type !== '팀원')
      .filter(a => !inqPayouts.find(p => p.assignment_id === a.id)).length

    return {
      inq, inqAssigns, payableAssigns, companyAssigns, inqPayouts,
      totalFinal, pendingCount, confirmedCount, paidCount, unregistered,
    }
  })
}

export default function PayoutsContent() {
  const [inquiries, setInquiries]   = useState<Inquiry[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [payouts, setPayouts]       = useState<Payout[]>([])
  const [loading, setLoading]       = useState(false)

  const [search, setSearch]         = useState('')
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null)

  const [formOpen, setFormOpen]         = useState(false)
  const [formAssignment, setFormAssignment] = useState<Assignment | null>(null)
  const [formPayout, setFormPayout]     = useState<Payout | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [inqList, assignList, payoutList] = await Promise.all([
        db.list<Inquiry>('inquiries', { order: 'event_start', asc: false }),
        db.list<Assignment>('assignments', { order: 'assigned_at', asc: false }),
        db.list<Payout>('payouts', { order: 'created_at', asc: false }),
      ])
      const PAYOUT_STATUSES = ['체결', '배정완료', '진행중', '완료', '정산완료']
      setInquiries(inqList.filter(inq => PAYOUT_STATUSES.includes(inq.status)))
      setAssignments(assignList)
      setPayouts(payoutList)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const grouped = groupByInquiry(inquiries, assignments, payouts)

  const filtered = grouped.filter(({ inq }) => {
    if (!search) return true
    return (inq.company_name || '').includes(search) || (inq.event_name || '').includes(search)
  })

  const selectedGroup   = grouped.find(g => g.inq.id === selectedInquiryId)
  const selectedInquiry = selectedGroup?.inq

  // 유급 배정 (팀원 제외 → 팀장만 지급 등록)
  const payableLeaders  = (selectedGroup?.payableAssigns || []).filter(a => a.role_type !== '팀원')
  // 본사 인원
  const companyAssigns  = selectedGroup?.companyAssigns || []
  const currentPayouts  = selectedGroup?.inqPayouts || []

  // 팀원 목록 조회 (team_code 기준)
  function getTeamMembers(teamCode: string | undefined): Assignment[] {
    if (!teamCode) return []
    return assignments.filter(
      a => a.team_code === teamCode && a.role_type === '팀원' && a.inquiry_id === selectedInquiryId
    )
  }

  // 미등록 유급 인원 (팀원 제외)
  const unregisteredPayable = payableLeaders.filter(
    a => !currentPayouts.find(p => p.assignment_id === a.id)
  )

  // 합계
  const payoutTotalFinal     = currentPayouts.reduce((s, p) => s + (p.final_pay || 0), 0)
  const payoutTotalBase      = currentPayouts.reduce((s, p) => s + (p.subtotal || 0), 0)
  const payoutTotalDeduction = currentPayouts.reduce((s, p) => s + (p.tax_deduction || 0), 0)

  // 일괄 처리 — 대기 → 검토완료 (DB enum 호환: '확인완료' 사용)
  async function handleBulkConfirm() {
    const toConfirm = currentPayouts.filter(p => p.status === '대기')
    if (!toConfirm.length) { toast.info('검토할 대기 지급 건이 없습니다.'); return }
    await Promise.all(toConfirm.map(p => db.update('payouts', p.id, { status: '확인완료' })))
    toast.success(`${toConfirm.length}건 검토 완료`)
    load()
  }

  // 일괄 처리 — 검토완료 → 지급완료 (DB enum 호환: '완료' 사용)
  async function handleBulkPaid() {
    const toPay = currentPayouts.filter(p => p.status === '검토완료' || p.status === '확인완료')
    if (!toPay.length) { toast.info('입금 처리할 검토완료 건이 없습니다.'); return }
    await Promise.all(toPay.map(p => db.update('payouts', p.id, { status: '완료' })))
    toast.success(`${toPay.length}건 입금 완료 처리`)
    load()
  }

  async function handleDelete(payout: Payout) {
    if (!confirm(`${payout.staff_name} 지급 기록을 삭제하겠습니까?`)) return
    await db.delete('payouts', payout.id)
    toast.success('삭제되었습니다.')
    load()
  }

  function openForm(assignment: Assignment, payout: Payout | null = null) {
    setFormAssignment({
      ...assignment,
      inquiry_id: selectedInquiryId || '',
      event_name: selectedInquiry?.event_name || '',
    } as Assignment)
    setFormPayout(payout)
    setFormOpen(true)
  }

  // ── 엑셀 내보내기 (검토완료/확인완료 건만 포함) ──
  function handleExportExcel() {
    // 검토완료(확인완료) 이상 상태만 포함
    const confirmed = currentPayouts.filter(
      p => p.status === '확인완료' || p.status === '검토완료' || p.status === '완료' || p.status === '지급완료'
    )
    if (!confirmed.length) {
      toast.info('내보낼 데이터가 없습니다.\n검토완료 상태 이상의 지급 건만 내보낼 수 있습니다.')
      return
    }

    const eventName = selectedInquiry?.event_name || '행사'
    const dateStr = new Date().toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\. /g, '').replace('.', '')

    // 이미지 예시 형식: 이름 / 은행 / 계좌번호 / 이체금액 / 메모
    const rows = confirmed.map(p => ({
      '이름':     p.staff_name || '',
      '은행':     p.bank_name || '',
      '계좌번호': p.account_number || '',
      '이체금액': p.final_pay || 0,
      '메모':     p.notes || `${eventName} ${p.dispatch_period || ''}`.trim(),
    }))

    // 합계 행
    const totalAmt = rows.reduce((s, r) => s + r['이체금액'], 0)
    rows.push({
      '이름':     `합계 (${rows.length}명)`,
      '은행':     '',
      '계좌번호': '',
      '이체금액': totalAmt,
      '메모':     '',
    })

    const ws = XLSX.utils.json_to_sheet(rows)

    // 열 너비 설정
    ws['!cols'] = [
      { wch: 10 },  // 이름
      { wch: 12 },  // 은행
      { wch: 20 },  // 계좌번호
      { wch: 12 },  // 이체금액
      { wch: 30 },  // 메모
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '이체목록')

    XLSX.writeFile(wb, `이체목록_${eventName}_${dateStr}.xlsx`)
    toast.success(`${confirmed.length}건 엑셀 다운로드 완료`)
  }

  return (
    <div className="flex h-full overflow-hidden bg-gray-50">

      {/* ─── 왼쪽: 행사 목록 ─── */}
      <div className="w-80 shrink-0 border-r bg-white flex flex-col overflow-hidden">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="행사명/의뢰처 검색"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && <p className="text-center text-xs text-gray-400 mt-8">로딩 중...</p>}

          {filtered.map(({ inq, payableAssigns, companyAssigns, inqPayouts, totalFinal, pendingCount, confirmedCount, paidCount, unregistered }) => {
            const isSelected = inq.id === selectedInquiryId
            const allPaid = payableAssigns.filter(a => a.role_type !== '팀원').length > 0
              && paidCount === inqPayouts.length && unregistered === 0
            return (
              <button
                key={inq.id}
                onClick={() => setSelectedInquiryId(inq.id)}
                className={`w-full text-left px-3 py-3 border-b transition-colors ${isSelected ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-gray-50'}`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{inq.event_name || '(행사명 없음)'}</p>
                    <p className="text-xs text-gray-400 truncate">{inq.company_name}</p>
                    <p className="text-xs text-gray-400">{inq.event_start ? formatDate(inq.event_start) : ''}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 shrink-0 mt-0.5" />
                </div>
                <div className="flex gap-1 mt-1.5 flex-wrap">
                  {payableAssigns.filter(a => a.role_type !== '팀원').length > 0 && (
                    <span className="text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                      외부 {payableAssigns.filter(a => a.role_type !== '팀원').length}
                    </span>
                  )}
                  {companyAssigns.length > 0 && (
                    <span className="text-[10px] bg-purple-100 text-purple-600 rounded px-1.5 py-0.5">
                      본사 {companyAssigns.length}
                    </span>
                  )}
                  {unregistered > 0 && (
                    <span className="text-[10px] bg-orange-100 text-orange-600 rounded px-1.5 py-0.5">미등록 {unregistered}</span>
                  )}
                  {pendingCount > 0 && (
                    <span className="text-[10px] bg-yellow-100 text-yellow-700 rounded px-1.5 py-0.5">대기 {pendingCount}</span>
                  )}
                  {confirmedCount > 0 && (
                    <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1.5 py-0.5">검토완료 {confirmedCount}</span>
                  )}
                  {paidCount > 0 && (
                    <span className="text-[10px] bg-green-100 text-green-700 rounded px-1.5 py-0.5">완료 {paidCount}</span>
                  )}
                  {allPaid && <span className="text-[10px] bg-green-200 text-green-800 rounded px-1.5 py-0.5 font-semibold">✓ 전원지급</span>}
                </div>
                {totalFinal > 0 && (
                  <p className="text-xs font-semibold text-blue-700 mt-1">{formatKRW(totalFinal)}</p>
                )}
              </button>
            )
          })}

          {!loading && filtered.length === 0 && (
            <p className="text-center text-xs text-gray-400 mt-12">해당하는 행사가 없습니다.</p>
          )}
        </div>
      </div>

      {/* ─── 오른쪽: 지급 현황 ─── */}
      {selectedInquiry ? (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* 행사 헤더 */}
          <div className="bg-white border-b px-5 py-3 flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-800">{selectedInquiry.event_name || '(행사명 없음)'}</h2>
              <p className="text-xs text-gray-500">
                {selectedInquiry.company_name} · {selectedInquiry.event_start ? formatDate(selectedInquiry.event_start) : ''} · {selectedInquiry.location || ''}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              <Button variant="outline" size="sm" onClick={handleBulkConfirm}
                className="text-blue-600 border-blue-300 text-xs h-7">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />전체 금액검토 완료
              </Button>
              <Button size="sm" onClick={handleBulkPaid}
                className="bg-green-600 hover:bg-green-700 text-xs h-7">
                <Wallet className="h-3.5 w-3.5 mr-1" />전체 입금완료
              </Button>
              {/* 엑셀 내보내기 — 검토완료 이상만 */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                className="text-emerald-700 border-emerald-400 hover:bg-emerald-50 text-xs h-7 font-semibold"
              >
                <Download className="h-3.5 w-3.5 mr-1" />이체목록 엑셀
              </Button>
            </div>
          </div>

          {/* 합계 요약 바 */}
          <div className="bg-white border-b px-5 py-2 flex gap-5 text-sm flex-wrap">
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-gray-400" />
              <span className="text-gray-500">외부</span>
              <span className="font-semibold">{payableLeaders.length}명</span>
            </div>
            {companyAssigns.length > 0 && (
              <div className="flex items-center gap-1.5">
                <UserX className="h-4 w-4 text-purple-400" />
                <span className="text-purple-500">본사</span>
                <span className="font-semibold text-purple-700">{companyAssigns.length}명</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-gray-300">|</div>
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500">소계</span>
              <span className="font-semibold">{formatKRW(payoutTotalBase)}</span>
            </div>
            {payoutTotalDeduction > 0 && (
              <div className="flex items-center gap-1.5 text-red-500">
                <span>공제</span>
                <span className="font-semibold">-{formatKRW(payoutTotalDeduction)}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-blue-700">
              <Wallet className="h-4 w-4" />
              <span>최종 지급</span>
              <span className="font-bold text-base">{formatKRW(payoutTotalFinal)}</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">

            {/* ── 1. 등록된 지급 목록 (유급) ── */}
            {currentPayouts.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 px-1">지급 등록 내역</p>
                {currentPayouts.map(payout => {
                  const assign = assignments.find(a => a.id === payout.assignment_id)
                  const teamMembers = assign?.role_type === '팀장' ? getTeamMembers(assign.team_code) : []
                  return (
                    <div key={payout.id}
                      className="bg-white rounded-lg border p-4 flex items-start gap-3 hover:shadow-sm transition-shadow">

                      {/* 상태 아이콘 */}
                      <div className="mt-0.5 shrink-0">
                        {(payout.status === '완료'     || payout.status === '지급완료') && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                        {(payout.status === '확인완료' || payout.status === '검토완료') && <CheckCircle2 className="h-5 w-5 text-blue-500" />}
                        {payout.status === '대기'                                       && <Clock        className="h-5 w-5 text-yellow-500" />}
                        {(payout.status === '보류'     || payout.status === '미지급')   && <AlertCircle  className="h-5 w-5 text-gray-400" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* 이름 + 상태 배지 */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-gray-800">
                            {assign?.staff_type === '본사' && (
                              <span className="text-purple-600 text-xs font-bold">[본사] </span>
                            )}
                            {assign?.role_type === '팀장' && (
                              <span className="text-indigo-600 text-xs font-bold">[팀장] </span>
                            )}
                            {payout.staff_name}
                          </span>
                          <span className={`text-[10px] rounded px-1.5 py-0.5 ${STATUS_STYLE[payout.status] || 'bg-gray-100 text-gray-500'}`}>
                            {STATUS_LABEL[payout.status] || payout.status}
                          </span>
                          {assign?.job_type && (
                            <span className="text-[10px] text-gray-400">{assign.job_type}</span>
                          )}
                        </div>

                        {/* 팀 구성원 (팀장인 경우) */}
                        {teamMembers.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1 items-center">
                            <span className="text-[10px] text-indigo-500 font-medium">팀원:</span>
                            {teamMembers.map(m => (
                              <span key={m.id}
                                className="text-[10px] bg-indigo-50 text-indigo-600 rounded px-1.5 py-0.5">
                                {m.staff_name}
                                {!m.is_present && <span className="text-gray-400 ml-0.5">(불참)</span>}
                              </span>
                            ))}
                            <span className="text-[10px] text-gray-400">
                              총 {teamMembers.filter(m => m.is_present).length + (assign?.is_present ? 1 : 0)}명 현장
                            </span>
                          </div>
                        )}

                        {/* 지급 항목 상세 */}
                        <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
                          <span>기간: {payout.dispatch_period || '-'}</span>
                          <span>{payout.dispatch_days}일</span>
                          <span>기본급 {formatKRW(payout.base_pay)}</span>
                          {payout.overtime_pay > 0   && <span>야근 {formatKRW(payout.overtime_pay)}</span>}
                          {payout.meal_pay > 0       && <span>식비 {formatKRW(payout.meal_pay)}</span>}
                          {payout.transport_pay > 0  && <span>교통 {formatKRW(payout.transport_pay)}</span>}
                          {payout.bonus > 0          && <span>기타 {formatKRW(payout.bonus)}</span>}
                          {payout.tax_deduction > 0  && (
                            <span className="text-red-400">공제 -{formatKRW(payout.tax_deduction)}</span>
                          )}
                        </div>

                        {/* 계좌 */}
                        {payout.bank_name && (
                          <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                            <Building2 className="h-3 w-3" />
                            {payout.bank_name} {payout.account_number}
                          </div>
                        )}
                        {payout.notes && (
                          <p className="mt-1 text-[10px] text-gray-400 bg-gray-50 rounded px-2 py-0.5">{payout.notes}</p>
                        )}
                      </div>

                      {/* 금액 + 액션 */}
                      <div className="text-right shrink-0">
                        <p className="font-bold text-blue-700">{formatKRW(payout.final_pay)}</p>
                        <div className="flex gap-1 mt-1.5 justify-end items-center">
                          {payout.status !== '지급완료' && (
                            <>
                              <button
                                onClick={() => { if (assign) openForm(assign, payout) }}
                                title="수정"
                                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                              >
                                <PencilLine className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(payout)}
                                title="삭제"
                                className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          {/* 대기 → 검토완료 (DB: '확인완료') */}
                          {payout.status === '대기' && (
                            <button
                              onClick={() => db.update('payouts', payout.id, { status: '확인완료' }).then(load)}
                              className="text-[10px] bg-blue-50 text-blue-600 rounded px-2 py-0.5 hover:bg-blue-100 whitespace-nowrap"
                            >
                              금액검토 완료 →
                            </button>
                          )}
                          {/* 검토완료 → 입금완료 (DB: '완료') */}
                          {(payout.status === '검토완료' || payout.status === '확인완료') && (
                            <button
                              onClick={() => db.update('payouts', payout.id, { status: '완료' }).then(load)}
                              className="text-[10px] bg-green-50 text-green-700 rounded px-2 py-0.5 hover:bg-green-100 whitespace-nowrap font-medium"
                            >
                              입금 완료 →
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── 2. 미등록 유급 인원 ── */}
            {unregisteredPayable.length > 0 && (
              <div className="border border-dashed border-orange-300 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-orange-600 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  지급 미등록 인력 ({unregisteredPayable.length}명) — 지급 등록이 필요합니다
                </p>
                {unregisteredPayable.map(assign => {
                  const teamMembers = assign.role_type === '팀장' ? getTeamMembers(assign.team_code) : []
                  const baseAmt = (assign.pay_rate || 0) * (assign.work_days || 1)
                  return (
                    <div key={assign.id}
                      className="flex items-start justify-between bg-orange-50/50 rounded px-3 py-2 gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {assign.role_type === '팀장' && (
                            <span className="text-[10px] text-indigo-600 font-bold">[팀장]</span>
                          )}
                          <span className="text-sm font-medium text-gray-700">{assign.staff_name}</span>
                          <span className="text-xs text-gray-400">{assign.job_type}</span>
                          <span className="text-xs text-gray-500">
                            {formatKRW(assign.pay_rate)} × {assign.work_days}일 = <strong>{formatKRW(baseAmt)}</strong>
                          </span>
                        </div>
                        {/* 팀원 목록 */}
                        {teamMembers.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1 items-center">
                            <span className="text-[10px] text-indigo-500">팀원:</span>
                            {teamMembers.map(m => (
                              <span key={m.id}
                                className="text-[10px] bg-indigo-50 text-indigo-600 rounded px-1.5 py-0.5">
                                {m.staff_name}
                                {!m.is_present && <span className="text-gray-400 ml-0.5">(불참)</span>}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button size="sm" variant="outline"
                        className="h-7 text-xs border-orange-300 text-orange-600 hover:bg-orange-50 shrink-0"
                        onClick={() => openForm(assign, null)}>
                        <Plus className="h-3.5 w-3.5 mr-1" />지급 등록
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── 3. 본사 인원 (무급 참여 확인) ── */}
            {companyAssigns.length > 0 && (
              <div className="border border-purple-200 rounded-lg p-3 space-y-2 bg-purple-50/30">
                <p className="text-xs font-semibold text-purple-600 flex items-center gap-1">
                  <UserX className="h-3.5 w-3.5" />
                  본사 인원 ({companyAssigns.length}명) — 지급 없음 (내부 참여)
                </p>
                <div className="flex flex-wrap gap-2">
                  {companyAssigns.map(assign => (
                    <div key={assign.id}
                      className="flex items-center gap-1.5 bg-white border border-purple-100 rounded-full px-3 py-1">
                      <span className="text-xs text-purple-700 font-medium">{assign.staff_name}</span>
                      {assign.job_type && (
                        <span className="text-[10px] text-gray-400">{assign.job_type}</span>
                      )}
                      <span className="text-[10px] bg-purple-100 text-purple-600 rounded-full px-1.5">본사</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 배정 자체가 없을 때 */}
            {payableLeaders.length === 0 && companyAssigns.length === 0 && (
              <div className="text-center py-16 text-sm text-gray-400">
                <Users className="h-8 w-8 mx-auto mb-2 text-gray-200" />
                배정된 인력이 없습니다.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
          <div className="text-center">
            <Wallet className="h-12 w-12 mx-auto mb-3 text-gray-200" />
            <p>왼쪽에서 행사를 선택하세요</p>
          </div>
        </div>
      )}

      {/* 지급 등록/수정 폼 */}
      {formOpen && formAssignment && (
        <PayoutForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          assignment={formAssignment}
          payout={formPayout}
          onSaved={load}
        />
      )}
    </div>
  )
}
