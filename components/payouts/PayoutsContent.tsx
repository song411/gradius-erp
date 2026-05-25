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
  Search, Users, Wallet, CheckCircle2, Clock,
  AlertCircle, Plus, PencilLine, Trash2, Building2,
  UserX, Download, ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

// 본사 인원 이름 기반 감지 (이름 OR is_payable=false)
const HQ_NAMES = new Set(['최규성', '송무재', '여지은', '김영찬'])
function isHQ(a: Assignment) {
  return a.is_payable === false || (a.staff_name ? HQ_NAMES.has(a.staff_name) : false)
}

const STATUS_STYLE: Record<string, string> = {
  '대기':     'bg-amber-100 text-amber-700 border border-amber-200',
  '확인완료': 'bg-blue-100 text-blue-700 border border-blue-200',
  '검토완료': 'bg-blue-100 text-blue-700 border border-blue-200',
  '완료':     'bg-green-100 text-green-700 border border-green-200',
  '지급완료': 'bg-green-100 text-green-700 border border-green-200',
  '미지급':   'bg-red-100 text-red-600 border border-red-200',
  '보류':     'bg-gray-100 text-gray-600 border border-gray-200',
}
const STATUS_LABEL: Record<string, string> = {
  '대기': '대기', '확인완료': '검토완료', '검토완료': '검토완료',
  '완료': '입금완료', '지급완료': '입금완료', '미지급': '미지급', '보류': '보류',
}

function isDone(p: Payout) { return p.status === '완료' || p.status === '지급완료' }
function isPending(p: Payout) { return !isDone(p) }

function groupByInquiry(inquiries: Inquiry[], assignments: Assignment[], payouts: Payout[]) {
  return inquiries.map(inq => {
    const inqAssigns     = assignments.filter(a => a.inquiry_id === inq.id)
    const hqAssigns      = inqAssigns.filter(isHQ)
    const payableAssigns = inqAssigns.filter(a => !isHQ(a))
    const payableLeaders = payableAssigns.filter(a => a.role_type !== '팀원')
    const inqPayouts     = payouts.filter(p => p.inquiry_id === inq.id)

    const totalFinal     = inqPayouts.reduce((s, p) => s + (p.final_pay || 0), 0)
    const unregistered   = payableLeaders.filter(a => !inqPayouts.find(p => p.assignment_id === a.id)).length

    // 지급 상태는 외부(유급) 인원의 지급 기록만 기준으로 판단
    // → 본사 인원 지급 기록 무시, 미등록 인원(후보 미확정)도 무시
    const payableLeaderIds = new Set(payableLeaders.map(a => a.id))
    const payablePayouts   = inqPayouts.filter(p => payableLeaderIds.has(p.assignment_id || ''))
    const pendingCount     = payablePayouts.filter(p => p.status === '대기').length
    const confirmedCount   = payablePayouts.filter(p => p.status === '검토완료' || p.status === '확인완료').length
    const paidCount        = payablePayouts.filter(isDone).length

    // 처리 상태 판단
    const isHqOnly = inqAssigns.length > 0 && payableLeaders.length === 0

    // 완료 조건: 등록된 외부 지급 기록이 1건 이상이고 전부 입금완료
    // → 미등록 인원(후보 미확정)은 무시, 본사 인원도 무시
    const allRegisteredPaid = payablePayouts.length > 0 && payablePayouts.every(isDone)
    const allDone           = isHqOnly || allRegisteredPaid
    const needsAction       = !isHqOnly && !allDone

    return {
      inq, inqAssigns, hqAssigns, payableAssigns, payableLeaders, inqPayouts,
      totalFinal, pendingCount, confirmedCount, paidCount, unregistered,
      isHqOnly, allDone, needsAction,
    }
  })
}

type LeftTab = 'pending' | 'done'

export default function PayoutsContent() {
  const [inquiries, setInquiries]     = useState<Inquiry[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [payouts, setPayouts]         = useState<Payout[]>([])
  const [loading, setLoading]         = useState(false)
  const [search, setSearch]           = useState('')
  const [leftTab, setLeftTab]         = useState<LeftTab>('pending')
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [formOpen, setFormOpen]       = useState(false)
  const [formAssignment, setFormAssignment] = useState<Assignment | null>(null)
  const [formPayout, setFormPayout]   = useState<Payout | null>(null)

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
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const grouped = groupByInquiry(inquiries, assignments, payouts)
  const searchFiltered = grouped.filter(({ inq }) =>
    !search || (inq.company_name || '').includes(search) || (inq.event_name || '').includes(search)
  )

  // 탭별 분류
  const pendingGroups = searchFiltered.filter(g => !g.allDone)
  const doneGroups    = searchFiltered.filter(g => g.allDone)
  const activeGroups  = leftTab === 'pending' ? pendingGroups : doneGroups

  const selectedGroup  = grouped.find(g => g.inq.id === selectedId)
  const selectedInquiry = selectedGroup?.inq

  const payableLeaders = (selectedGroup?.payableLeaders || [])
  const hqAssigns      = selectedGroup?.hqAssigns || []
  const currentPayouts = selectedGroup?.inqPayouts || []
  const unregistered   = (selectedGroup?.unregistered || 0)

  function getTeamMembers(teamCode: string | undefined) {
    if (!teamCode) return []
    return assignments.filter(a => a.team_code === teamCode && a.role_type === '팀원' && a.inquiry_id === selectedId)
  }

  const payoutTotalFinal     = currentPayouts.reduce((s, p) => s + (p.final_pay || 0), 0)
  const payoutTotalBase      = currentPayouts.reduce((s, p) => s + (p.subtotal || 0), 0)
  const payoutTotalDeduction = currentPayouts.reduce((s, p) => s + (p.tax_deduction || 0), 0)

  async function handleBulkConfirm() {
    const toConfirm = currentPayouts.filter(p => p.status === '대기')
    if (!toConfirm.length) { toast.info('검토할 대기 지급 건이 없습니다.'); return }
    await Promise.all(toConfirm.map(p => db.update('payouts', p.id, { status: '확인완료' })))
    toast.success(`${toConfirm.length}건 검토 완료`)
    load()
  }

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
    setFormAssignment({ ...assignment, inquiry_id: selectedId || '', event_name: selectedInquiry?.event_name || '' } as Assignment)
    setFormPayout(payout)
    setFormOpen(true)
  }

  function handleExportExcel() {
    const confirmed = currentPayouts.filter(p =>
      p.status === '확인완료' || p.status === '검토완료' || p.status === '완료' || p.status === '지급완료'
    )
    if (!confirmed.length) { toast.info('검토완료 상태 이상의 지급 건만 내보낼 수 있습니다.'); return }
    const eventName = selectedInquiry?.event_name || '행사'
    const dateStr = new Date().toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\. /g, '').replace('.', '')
    const rows = confirmed.map(p => ({
      '이름': p.staff_name || '', '은행': p.bank_name || '',
      '계좌번호': p.account_number || '', '이체금액': p.final_pay || 0,
      '메모': p.notes || `${eventName} ${p.dispatch_period || ''}`.trim(),
    }))
    rows.push({ '이름': `합계 (${rows.length}명)`, '은행': '', '계좌번호': '', '이체금액': rows.reduce((s, r) => s + r['이체금액'], 0), '메모': '' })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 30 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '이체목록')
    XLSX.writeFile(wb, `이체목록_${eventName}_${dateStr}.xlsx`)
    toast.success(`${confirmed.length}건 엑셀 다운로드 완료`)
  }

  return (
    <div className="flex h-full overflow-hidden bg-gray-50">

      {/* ─── 좌측: 행사 목록 패널 (50%) ─── */}
      <div className="w-1/2 shrink-0 border-r-2 border-gray-200 bg-white flex flex-col overflow-hidden shadow-sm">

        {/* 검색 */}
        <div className="p-3 border-b-2 border-gray-200 bg-gray-50">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <Input placeholder="행사명/의뢰처 검색" value={search}
              onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
          </div>
        </div>

        {/* 탭 */}
        <div className="flex border-b-2 border-gray-200">
          <button
            onClick={() => setLeftTab('pending')}
            className={`flex-1 py-2.5 text-xs font-bold transition-colors ${leftTab === 'pending'
              ? 'bg-white text-blue-700 border-b-2 border-blue-500'
              : 'bg-gray-50 text-gray-500 hover:text-gray-700'}`}
          >
            처리 필요
            {pendingGroups.length > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5">{pendingGroups.length}</span>
            )}
          </button>
          <button
            onClick={() => setLeftTab('done')}
            className={`flex-1 py-2.5 text-xs font-bold transition-colors ${leftTab === 'done'
              ? 'bg-white text-green-700 border-b-2 border-green-500'
              : 'bg-gray-50 text-gray-500 hover:text-gray-700'}`}
          >
            지급완료
            {doneGroups.length > 0 && (
              <span className="ml-1.5 bg-green-100 text-green-700 text-[10px] rounded-full px-1.5 py-0.5">{doneGroups.length}</span>
            )}
          </button>
        </div>

        {/* 목록 */}
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="text-center text-xs text-gray-400 mt-8">로딩 중...</p>}

          <AnimatePresence mode="wait">
            <motion.div key={leftTab}
              initial={{ opacity: 0, x: leftTab === 'pending' ? -8 : 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="p-2">
              {activeGroups.length === 0 && !loading && (
                <div className="text-center py-12 text-xs text-gray-400">
                  {leftTab === 'pending' ? '처리 필요한 행사가 없습니다 ✅' : '완료된 행사가 없습니다.'}
                </div>
              )}
              {/* 2열 그리드 */}
              <div className="grid grid-cols-2 gap-2">
                {activeGroups.map(({ inq, hqAssigns: hq, payableLeaders: leaders, inqPayouts, totalFinal, pendingCount, confirmedCount, paidCount, unregistered: unreg, isHqOnly, allDone, needsAction }) => {
                  const isSelected = inq.id === selectedId
                  return (
                    <button key={inq.id} onClick={() => setSelectedId(inq.id)}
                      className={`text-left rounded-xl border-2 p-3 transition-all hover:shadow-md ${
                        isSelected
                          ? 'bg-blue-50 border-blue-400 shadow-sm'
                          : 'bg-white border-gray-200 hover:border-blue-300'
                      }`}>
                      {/* 행사명 + 상태 뱃지 */}
                      <div className="flex items-start justify-between gap-1 mb-1.5">
                        <p className="text-xs font-bold text-gray-800 leading-snug line-clamp-2 flex-1">{inq.event_name || '(행사명 없음)'}</p>
                        {allDone && !isHqOnly && <span className="text-[9px] bg-green-500 text-white rounded-full px-1.5 py-0.5 font-bold shrink-0">완료</span>}
                        {isHqOnly && <span className="text-[9px] bg-purple-500 text-white rounded-full px-1.5 py-0.5 font-bold shrink-0">본사</span>}
                        {needsAction && <span className="text-[9px] bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold shrink-0">처리필요</span>}
                      </div>
                      {/* 의뢰처 */}
                      <p className="text-[10px] text-gray-500 font-medium truncate">{inq.company_name}</p>
                      {/* 날짜 */}
                      {inq.event_start && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {formatDate(inq.event_start)}{inq.event_end && inq.event_end !== inq.event_start ? ` ~ ${formatDate(inq.event_end)}` : ''}
                        </p>
                      )}
                      {/* 장소 */}
                      {inq.location && <p className="text-[10px] text-gray-400 truncate mt-0.5">📍 {inq.location}</p>}

                      {/* 인원 구성 */}
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {isHqOnly && <span className="text-[9px] bg-purple-100 text-purple-700 rounded-full px-1.5 py-0.5">🏢 본사 전원</span>}
                        {leaders.length > 0 && <span className="text-[9px] bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5">외부 {leaders.length}명</span>}
                        {hq.length > 0 && !isHqOnly && <span className="text-[9px] bg-purple-50 text-purple-600 rounded-full px-1.5 py-0.5">본사 {hq.length}</span>}
                      </div>

                      {/* 지급 상태 */}
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {unreg > 0 && <span className="text-[9px] bg-orange-100 text-orange-700 rounded-full px-1.5 py-0.5 font-bold">⚠ {unreg}미등록</span>}
                        {pendingCount > 0 && <span className="text-[9px] bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5">대기 {pendingCount}</span>}
                        {confirmedCount > 0 && <span className="text-[9px] bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5">검토 {confirmedCount}</span>}
                        {paidCount > 0 && <span className="text-[9px] bg-green-100 text-green-700 rounded-full px-1.5 py-0.5">완료 {paidCount}</span>}
                      </div>

                      {/* 금액 */}
                      {totalFinal > 0 && (
                        <p className="text-xs font-extrabold text-blue-600 mt-2">{formatKRW(totalFinal)}</p>
                      )}
                    </button>
                  )
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ─── 우측: 지급 현황 ─── */}
      {selectedInquiry ? (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* 행사 헤더 */}
          <div className="bg-white border-b-2 border-gray-200 px-5 py-3 flex items-start justify-between shadow-sm shrink-0">
            <div>
              <h2 className="text-base font-extrabold text-gray-900">{selectedInquiry.event_name || '(행사명 없음)'}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {selectedInquiry.company_name} · {selectedInquiry.event_start ? formatDate(selectedInquiry.event_start) : ''} · {selectedInquiry.location || ''}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              {!selectedGroup?.isHqOnly && (
                <>
                  <Button variant="outline" size="sm" onClick={handleBulkConfirm}
                    className="text-blue-600 border-blue-300 text-xs h-7 gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />전체 검토완료
                  </Button>
                  <Button size="sm" onClick={handleBulkPaid}
                    className="bg-green-600 hover:bg-green-700 text-xs h-7 gap-1">
                    <Wallet className="h-3.5 w-3.5" />전체 입금완료
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportExcel}
                    className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 text-xs h-7 gap-1 font-semibold">
                    <Download className="h-3.5 w-3.5" />이체목록 엑셀
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* 합계 요약 바 */}
          {!selectedGroup?.isHqOnly && (
            <div className="bg-white border-b border-gray-200 px-5 py-2 flex gap-5 text-sm flex-wrap items-center shrink-0">
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-gray-400" />
                <span className="text-gray-500 text-xs">외부</span>
                <span className="font-bold">{payableLeaders.length}명</span>
              </div>
              {hqAssigns.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <UserX className="h-4 w-4 text-purple-400" />
                  <span className="text-purple-600 text-xs">본사</span>
                  <span className="font-bold text-purple-700">{hqAssigns.length}명</span>
                </div>
              )}
              <div className="w-px h-4 bg-gray-200" />
              {payoutTotalBase > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-gray-500 text-xs">소계</span>
                  <span className="font-semibold text-sm">{formatKRW(payoutTotalBase)}</span>
                </div>
              )}
              {payoutTotalDeduction > 0 && (
                <div className="flex items-center gap-1 text-red-500">
                  <span className="text-xs">공제</span>
                  <span className="font-semibold text-sm">-{formatKRW(payoutTotalDeduction)}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-blue-700">
                <Wallet className="h-4 w-4" />
                <span className="text-xs">최종 지급</span>
                <span className="font-extrabold text-base">{formatKRW(payoutTotalFinal)}</span>
              </div>
            </div>
          )}

          {/* 본사 전원 행사 안내 */}
          {selectedGroup?.isHqOnly && (
            <div className="bg-purple-50 border-b-2 border-purple-200 px-5 py-3 flex items-center gap-3 shrink-0">
              <UserX className="h-5 w-5 text-purple-500 shrink-0" />
              <div>
                <p className="text-sm font-bold text-purple-700">본사 인원 전원 투입 행사</p>
                <p className="text-xs text-purple-500">인력비 지급 없음 · 수익률 100%</p>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-3">

            {/* ── 1. 등록된 지급 목록 ── */}
            {currentPayouts.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-1">지급 등록 내역</p>
                <div className="space-y-2">
                  {currentPayouts.map(payout => {
                    const assign = assignments.find(a => a.id === payout.assignment_id)
                    const teamMembers = assign?.role_type === '팀장' ? getTeamMembers(assign.team_code) : []
                    const done = isDone(payout)
                    return (
                      <div key={payout.id}
                        className={`bg-white rounded-xl border-2 p-4 flex items-start gap-3 transition-shadow hover:shadow-sm ${
                          done ? 'border-green-200' : 'border-gray-200'
                        }`}>
                        <div className="mt-0.5 shrink-0">
                          {done && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                          {(payout.status === '확인완료' || payout.status === '검토완료') && <CheckCircle2 className="h-5 w-5 text-blue-500" />}
                          {payout.status === '대기' && <Clock className="h-5 w-5 text-amber-500" />}
                          {(payout.status === '보류' || payout.status === '미지급') && <AlertCircle className="h-5 w-5 text-gray-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-gray-800">
                              {isHQ(assign!) && <span className="text-purple-600 text-xs">[본사] </span>}
                              {assign?.role_type === '팀장' && <span className="text-indigo-600 text-xs">[팀장] </span>}
                              {payout.staff_name}
                            </span>
                            <span className={`text-[10px] rounded-full px-2 py-0.5 font-semibold ${STATUS_STYLE[payout.status] || 'bg-gray-100 text-gray-500'}`}>
                              {STATUS_LABEL[payout.status] || payout.status}
                            </span>
                            {assign?.job_type && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{assign.job_type}</span>}
                          </div>
                          {teamMembers.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1 items-center">
                              <span className="text-[10px] text-indigo-500 font-semibold">팀원:</span>
                              {teamMembers.map(m => (
                                <span key={m.id} className="text-[10px] bg-indigo-50 text-indigo-600 rounded-full px-2 py-0.5">
                                  {m.staff_name}{!m.is_present && <span className="text-gray-400 ml-0.5">(불참)</span>}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500">
                            <span>📅 {payout.dispatch_period || '-'} ({payout.dispatch_days}일)</span>
                            <span>기본 {formatKRW(payout.base_pay)}</span>
                            {payout.overtime_pay > 0  && <span>야근 +{formatKRW(payout.overtime_pay)}</span>}
                            {payout.meal_pay > 0      && <span>식비 +{formatKRW(payout.meal_pay)}</span>}
                            {payout.transport_pay > 0 && <span>교통 +{formatKRW(payout.transport_pay)}</span>}
                            {payout.bonus > 0         && <span>기타 +{formatKRW(payout.bonus)}</span>}
                            {payout.tax_deduction > 0 && <span className="text-red-400">공제 -{formatKRW(payout.tax_deduction)}</span>}
                          </div>
                          {payout.bank_name && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                              <Building2 className="h-3 w-3" />{payout.bank_name} {payout.account_number}
                            </div>
                          )}
                          {payout.notes && (
                            <p className="mt-1 text-[10px] text-gray-400 bg-gray-50 rounded-lg px-2 py-1">{payout.notes}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-extrabold text-blue-700 text-base">{formatKRW(payout.final_pay)}</p>
                          <div className="flex gap-1 mt-1.5 justify-end items-center">
                            {!done && (
                              <>
                                <button onClick={() => { if (assign) openForm(assign, payout) }}
                                  className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                                  <PencilLine className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => handleDelete(payout)}
                                  className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                            {payout.status === '대기' && (
                              <button onClick={() => db.update('payouts', payout.id, { status: '확인완료' }).then(load)}
                                className="text-[10px] bg-blue-600 text-white rounded-lg px-2.5 py-1 hover:bg-blue-700 whitespace-nowrap font-semibold transition-colors">
                                검토완료 →
                              </button>
                            )}
                            {(payout.status === '검토완료' || payout.status === '확인완료') && (
                              <button onClick={() => db.update('payouts', payout.id, { status: '완료' }).then(load)}
                                className="text-[10px] bg-green-600 text-white rounded-lg px-2.5 py-1 hover:bg-green-700 whitespace-nowrap font-semibold transition-colors">
                                입금완료 →
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── 2. 미등록 유급 인원 ── */}
            {unregistered > 0 && (
              <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4 space-y-2">
                <p className="text-xs font-bold text-orange-700 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" />
                  지급 미등록 인력 ({unregistered}명) — 지급 등록이 필요합니다
                </p>
                {payableLeaders.filter(a => !currentPayouts.find(p => p.assignment_id === a.id)).map(assign => {
                  const teamMembers = assign.role_type === '팀장' ? getTeamMembers(assign.team_code) : []
                  const baseAmt = (assign.pay_rate || 0) * (assign.work_days || 1)
                  return (
                    <div key={assign.id}
                      className="flex items-start justify-between bg-white border border-orange-200 rounded-lg px-3 py-2.5 gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {assign.role_type === '팀장' && <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.5 rounded">[팀장]</span>}
                          <span className="text-sm font-semibold text-gray-800">{assign.staff_name}</span>
                          {assign.job_type && <span className="text-xs text-gray-400">{assign.job_type}</span>}
                          <span className="text-xs text-gray-600">
                            {formatKRW(assign.pay_rate)} × {assign.work_days}일 = <strong className="text-gray-800">{formatKRW(baseAmt)}</strong>
                          </span>
                        </div>
                        {teamMembers.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            <span className="text-[10px] text-indigo-500 font-semibold">팀원:</span>
                            {teamMembers.map(m => (
                              <span key={m.id} className="text-[10px] bg-indigo-50 text-indigo-600 rounded-full px-2 py-0.5">
                                {m.staff_name}{!m.is_present && <span className="text-gray-400 ml-0.5">(불참)</span>}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button size="sm" variant="outline"
                        className="h-7 text-xs border-orange-400 text-orange-600 hover:bg-orange-100 shrink-0 font-semibold"
                        onClick={() => openForm(assign, null)}>
                        <Plus className="h-3.5 w-3.5 mr-1" />지급 등록
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── 3. 본사 인원 (항상 표시) ── */}
            {hqAssigns.length > 0 && (
              <div className={`border-2 rounded-xl p-4 space-y-3 ${selectedGroup?.isHqOnly ? 'border-purple-300 bg-purple-50' : 'border-purple-200 bg-purple-50/40'}`}>
                <p className="text-xs font-bold text-purple-700 flex items-center gap-1.5">
                  <UserX className="h-4 w-4" />
                  본사 인원 ({hqAssigns.length}명) — 지급 없음
                </p>
                <div className="flex flex-wrap gap-2">
                  {hqAssigns.map(assign => (
                    <div key={assign.id}
                      className="flex items-center gap-1.5 bg-white border-2 border-purple-200 rounded-full px-3 py-1.5 shadow-sm">
                      <span className="text-xs font-bold text-purple-700">{assign.staff_name}</span>
                      {assign.job_type && <span className="text-[10px] text-gray-400">{assign.job_type}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 배정 자체가 없을 때 */}
            {payableLeaders.length === 0 && hqAssigns.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <Users className="h-10 w-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">배정된 인력이 없습니다.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <Wallet className="h-14 w-14 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">왼쪽에서 행사를 선택하세요</p>
            <p className="text-xs mt-1 opacity-70">처리 필요 {pendingGroups.length}건 · 완료 {doneGroups.length}건</p>
          </div>
        </div>
      )}

      {formOpen && formAssignment && (
        <PayoutForm open={formOpen} onClose={() => setFormOpen(false)}
          assignment={formAssignment} payout={formPayout} onSaved={load} />
      )}
    </div>
  )
}
