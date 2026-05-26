'use client'

import { useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/supabase/api'
import {
  STATUS_COLORS, formatKRW, formatDate,
  INQUIRY_STATUS_FLOW, getStatusProgress, calcVAT, calcProfitRate
} from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter, DialogClose
} from '@/components/ui/dialog'
import {
  ArrowLeft, FileText, Users, CreditCard, CheckCircle,
  Plus, Trash2, ChevronRight, AlertCircle, Zap, ArrowRight
} from 'lucide-react'
import Link from 'next/link'
import type { Inquiry, Estimate, EstimateItem, Assignment, Settlement, InquiryStatus } from '@/lib/supabase/types'

// ── 페이 텍스트 추출 (notes에서 [페이: xxx] 파싱) ───────────────
function extractPayDetail(notes: string | null | undefined): string {
  if (!notes) return ''
  const m = notes.match(/\[페이:\s*([^\]]+)\]/)
  return m ? m[1].trim() : ''
}

// ── 상태 단계 표시 ─────────────────────────────────────────────
const FLOW_STEPS = ['접수', '견적', '체결', '배정완료', '진행중', '완료', '정산완료'] as const

export default function InquiryDetail({ id }: { id: string }) {
  const [inquiry, setInquiry] = useState<Inquiry | null>(null)
  const [estimates, setEstimates] = useState<(Estimate & { estimate_items?: EstimateItem[] })[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [settlement, setSettlement] = useState<Settlement | null>(null)
  const [loading, setLoading] = useState(true)

  // 모달 상태
  const [showEstimateModal, setShowEstimateModal] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showSettleModal, setShowSettleModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 견적 폼
  const [estItems, setEstItems] = useState([
    { role_name: '', quantity: 1, days: 1, unit_price: 0, pay_unit_price: 0, spec: '', is_leader: false }
  ])
  const [estForm, setEstForm] = useState({
    site_name: '', manager: '', site_address: '', attire: '',
    meal: '', parking: '', notes: '', extra_cost: 0
  })

  // 배정 폼
  const [assignForm, setAssignForm] = useState({
    staff_name: '', staff_type: '본사', job_type: '', phone: '',
    pay_rate: '', work_days: '', start_date: '', end_date: '',
    bank_name: '', account_number: '', role_type: '서브', memo: ''
  })

  // 정산 폼
  const [settleForm, setSettleForm] = useState({
    supply_price: '', received_amount: '0',
    deposit_status: '미입금', progress: '계약체결',
    dispatch_period: '', tax_invoice_issued: false,
  })

  const load = useCallback(async () => {
    setLoading(true)
    const [inqList, estList, asgnList, setList] = await Promise.all([
      db.list<Inquiry>('inquiries', { filters: { id }, limit: 1 }),
      db.list<Estimate & { estimate_items?: EstimateItem[] }>('estimates', { filters: { inquiry_id: id }, order: 'created_at', asc: false }),
      db.list<Assignment>('assignments', { filters: { inquiry_id: id }, order: 'assigned_at', asc: false }),
      db.list<Settlement>('settlements', { filters: { inquiry_id: id }, limit: 1 }),
    ])
    setInquiry(inqList[0] ?? null)
    setEstimates(estList)
    setAssignments(asgnList)
    setSettlement(setList[0] ?? null)

    // 폼 기본값 세팅
    const inq = inqList[0]
    if (inq) {
      setEstForm(f => ({
        ...f,
        attire: inq.attire || '',
        meal: inq.meal || '',
        parking: inq.parking || '',
      }))
      setSettleForm(f => ({
        ...f,
        dispatch_period: inq.event_start && inq.event_end
          ? `${inq.event_start} ~ ${inq.event_end}`
          : '',
      }))
    }
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  // ── 상태 변경 ─────────────────────────────────────────────────
  async function updateStatus(status: InquiryStatus) {
    if (!inquiry) return
    await db.update('inquiries', id, { status })
    setInquiry(prev => prev ? { ...prev, status } : prev)

    // 체결 시 구글 캘린더 자동 등록
    if (status === '체결') {
      try {
        const res = await fetch('/api/calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_name:   inquiry.event_name,
            company_name: inquiry.company_name,
            event_start:  inquiry.event_start,
            event_end:    inquiry.event_end,
            phone:        inquiry.phone,
            memo:         inquiry.memo,
          }),
        })
        if (res.ok) {
          toast.success('구글 캘린더에 일정이 등록되었습니다.')
        } else {
          const err = await res.json()
          console.error('캘린더 등록 실패:', err)
          toast.warning('체결 완료. 구글 캘린더 등록에 실패했습니다.')
        }
      } catch {
        console.error('캘린더 API 호출 오류')
        toast.warning('체결 완료. 구글 캘린더 등록에 실패했습니다.')
      }
    }
  }

  // ── 견적 저장 ─────────────────────────────────────────────────
  const supplyPrice = estItems.reduce((s, i) => s + i.quantity * i.days * i.unit_price, 0)
  const costPrice   = estItems.reduce((s, i) => s + i.quantity * i.days * i.pay_unit_price, 0)
  const { vat, total } = calcVAT(supplyPrice)
  const profitRate = calcProfitRate(supplyPrice, costPrice + estForm.extra_cost)

  async function handleSaveEstimate() {
    if (!inquiry) return
    if (estItems.every(i => !i.role_name)) { setError('품목을 1개 이상 입력해주세요.'); return }
    setSaving(true); setError('')

    let est: Estimate | null = null
    try {
      const estList = await db.insert<Estimate>('estimates', {
        inquiry_id:   id,
        company_name: inquiry.company_name  ?? undefined,
        event_name:   inquiry.event_name    ?? undefined,
        site_name:    estForm.site_name     || undefined,
        manager:      estForm.manager       || undefined,
        site_address: estForm.site_address  || undefined,
        attire:       estForm.attire        || undefined,
        meal:         estForm.meal          || undefined,
        parking:      estForm.parking       || undefined,
        notes:        estForm.notes         || undefined,
        supply_price: supplyPrice,
        vat,
        total_price:  total,
        cost_price:   costPrice,
        extra_cost:   estForm.extra_cost,
        profit_rate:  profitRate,
      })
      est = estList[0] ?? null
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '견적 저장 실패')
      setSaving(false); return
    }

    if (!est) { setError('견적 저장 실패'); setSaving(false); return }

    await db.insert('estimate_items', estItems.filter(i => i.role_name).map(i => ({
      estimate_id: est!.id, inquiry_id: id,
      role_name: i.role_name, quantity: i.quantity,
      days: i.days, unit_price: i.unit_price,
      pay_unit_price: i.pay_unit_price,
      spec: i.spec || null, is_leader: i.is_leader,
    })))

    // 문의 상태 → 견적
    if (inquiry.status === '접수') await updateStatus('견적')

    setSaving(false); setShowEstimateModal(false)
    load()
  }

  // ── 배정 저장 ─────────────────────────────────────────────────
  async function handleSaveAssign() {
    if (!inquiry) return
    if (!assignForm.staff_name.trim()) { setError('직원명을 입력해주세요.'); return }
    setSaving(true); setError('')

    await db.insert('assignments', {
      inquiry_id:     id,
      event_name:     inquiry.event_name,
      staff_name:     assignForm.staff_name.trim(),
      staff_type:     assignForm.staff_type,
      job_type:       assignForm.job_type    || null,
      phone:          assignForm.phone       || null,
      pay_rate:       Number(assignForm.pay_rate)   || 0,
      work_days:      Number(assignForm.work_days)  || 0,
      start_date:     assignForm.start_date  || inquiry.event_start || null,
      end_date:       assignForm.end_date    || inquiry.event_end   || null,
      bank_name:      assignForm.bank_name   || null,
      account_number: assignForm.account_number || null,
      role_type:      assignForm.role_type,
      status:         '후보',
      memo:           assignForm.memo        || null,
    })

    setSaving(false); setShowAssignModal(false)
    setAssignForm({ staff_name: '', staff_type: '본사', job_type: '', phone: '',
      pay_rate: '', work_days: '', start_date: '', end_date: '',
      bank_name: '', account_number: '', role_type: '서브', memo: '' })
    load()
  }

  // ── 정산 자동 생성 ────────────────────────────────────────────
  async function handleAutoSettle() {
    if (!inquiry) return
    setSaving(true); setError('')

    const confirmedAsgns = assignments.filter(a => a.status === '확정' || a.status === '배정중' || a.status === '후보')
    const payoutAmount = confirmedAsgns.reduce((s, a) => s + (a.total_pay || a.pay_rate * a.work_days), 0)
    const supplyPriceFromEst = estimates[0]?.supply_price || 0
    const vatFromEst = estimates[0]?.vat || 0

    const existingSettles = await db.list<Settlement>('settlements', { filters: { inquiry_id: id }, limit: 1 })
    const existingSettle = existingSettles[0] ?? null
    const supplyVal = Number(settleForm.supply_price) || supplyPriceFromEst
    const updatePayload = {
      payout_amount:   payoutAmount,
      dispatch_period: settleForm.dispatch_period,
      supply_price:    supplyVal,
      vat:             vatFromEst,
      invoice_amount:  supplyVal + vatFromEst,
      received_amount: Number(settleForm.received_amount) || 0,
      deposit_status:  settleForm.deposit_status,
      progress:        settleForm.progress,
      tax_invoice_issued: settleForm.tax_invoice_issued,
    }

    if (existingSettle) {
      await db.update('settlements', existingSettle.id, updatePayload)
    } else {
      await db.insert('settlements', {
        ...updatePayload,
        inquiry_id:     id,
        company_name:   inquiry.company_name,
        site_name:      inquiry.event_name,
        dispatch_period: settleForm.dispatch_period || `${inquiry.event_start} ~ ${inquiry.event_end}`,
        withholding_tax: Math.floor(payoutAmount * 0.033),
      })
      await updateStatus('정산완료')
    }

    setSaving(false); setShowSettleModal(false)
    load()
  }

  // ── 배정 상태 변경 ────────────────────────────────────────────
  async function updateAssignStatus(assignId: string, status: string) {
    await db.update('assignments', assignId, { status })
    if (status === '확정' && inquiry?.status === '체결') {
      await updateStatus('배정완료')
    }
    load()
  }

  async function deleteAssign(assignId: string) {
    if (!confirm('이 배정을 삭제하시겠습니까?')) return
    await db.delete('assignments', assignId)
    load()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  )

  if (!inquiry) return (
    <div className="text-center py-20 text-gray-400">
      <p>문의를 찾을 수 없습니다.</p>
      <Link href="/inquiries">
        <Button variant="outline" className="mt-4"><ArrowLeft className="h-4 w-4" />목록으로</Button>
      </Link>
    </div>
  )

  const payDetail = extractPayDetail(inquiry.notes)
  const progress = getStatusProgress(inquiry.status)
  const confirmedCount = assignments.filter(a => a.status === '확정').length
  const totalPayAmount = assignments.filter(a => a.is_payable !== false).reduce((s, a) => s + (a.total_pay || a.pay_rate * a.work_days), 0)

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* 뒤로가기 */}
      <Link href="/inquiries">
        <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" />문의 목록</Button>
      </Link>

      {/* ── 헤더 카드 ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-bold text-gray-900">{inquiry.event_name}</h2>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[inquiry.status] || 'bg-gray-100 text-gray-600'}`}>
                {inquiry.status}
              </span>
            </div>
            <p className="text-gray-500 mt-1 text-lg">{inquiry.company_name}</p>
            <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-600">
              {inquiry.event_start && (
                <span>📅 {formatDate(inquiry.event_start)}{inquiry.event_end && inquiry.event_end !== inquiry.event_start ? ` ~ ${formatDate(inquiry.event_end)}` : ''}</span>
              )}
              {inquiry.location && <span>📍 {inquiry.location}</span>}
              {inquiry.event_time && <span>🕐 {inquiry.event_time}</span>}
              {inquiry.required_staff && <span>👥 {inquiry.required_staff}명</span>}
              {payDetail && <span className="font-semibold text-blue-700">💰 {payDetail}만원</span>}
            </div>
          </div>

          {/* 상태 변경 드롭다운 */}
          <Select
            value={inquiry.status}
            onChange={e => updateStatus(e.target.value as InquiryStatus)}
            className="w-36 shrink-0"
          >
            {(['접수','견적','체결','배정완료','진행중','완료','정산완료','미체결','보류','취소'] as InquiryStatus[]).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </div>

        {/* 진행 단계 바 */}
        <div className="mt-5">
          <div className="flex items-center gap-1 mb-2 overflow-x-auto pb-1">
            {FLOW_STEPS.map((step, idx) => {
              const isActive = inquiry.status === step
              const isPast = FLOW_STEPS.indexOf(inquiry.status as any) > idx
              return (
                <div key={step} className="flex items-center gap-1 shrink-0">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-all
                    ${isActive ? 'bg-blue-600 text-white shadow-md' : isPast ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}
                    onClick={() => updateStatus(step as InquiryStatus)}
                  >
                    {isPast && <CheckCircle className="h-3 w-3" />}
                    {step}
                  </div>
                  {idx < FLOW_STEPS.length - 1 && (
                    <ArrowRight className="h-3 w-3 text-gray-300 shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2">
            <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {/* ── 액션 버튼 (다음 단계) ── */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => { setError(''); setShowEstimateModal(true) }} variant="outline">
          <FileText className="h-4 w-4" />
          견적 작성
        </Button>
        <Button onClick={() => { setError(''); setShowAssignModal(true) }} variant="outline">
          <Users className="h-4 w-4" />
          인원 배정
        </Button>
        {assignments.length > 0 && (
          <Button onClick={() => { setError(''); setShowSettleModal(true) }}
            className={settlement ? 'bg-green-600 hover:bg-green-700' : ''}>
            <CreditCard className="h-4 w-4" />
            {settlement ? '정산 수정' : '정산 생성'}
          </Button>
        )}
        {inquiry.status === '견적' && (
          <Button onClick={() => updateStatus('체결')} className="bg-indigo-600 hover:bg-indigo-700">
            <CheckCircle className="h-4 w-4" />
            계약 체결
          </Button>
        )}
      </div>

      {/* ── 기본 정보 ── */}
      <Card>
        <CardHeader><CardTitle>문의 기본 정보</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InfoRow label="담당자"    value={inquiry.contact_name} />
            <InfoRow label="연락처"    value={inquiry.phone} />
            <InfoRow label="서비스"    value={inquiry.service_type} />
            <InfoRow label="신규/기존" value={inquiry.relationship} />
            <InfoRow label="복장"      value={inquiry.attire} />
            <InfoRow label="식사"      value={inquiry.meal} />
            <InfoRow label="주차"      value={inquiry.parking} />
            <InfoRow label="페이"      value={payDetail ? `${payDetail}만원` : inquiry.expected_pay ? formatKRW(inquiry.expected_pay) : undefined} />
          </div>
          {inquiry.notes && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs font-medium text-gray-500 mb-1">특이사항</p>
              {/* [페이:...] 태그 제거 후 표시 */}
              <p className="text-sm text-gray-700 whitespace-pre-line">
                {inquiry.notes.replace(/\[페이:[^\]]*\]\n?/, '').trim()}
              </p>
            </div>
          )}
          {inquiry.consult_notes && (
            <div className="mt-3 p-3 bg-blue-50 rounded-lg">
              <p className="text-xs font-medium text-blue-600 mb-1">상담 내용 (내부)</p>
              <p className="text-sm text-gray-700">{inquiry.consult_notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 견적 목록 ── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-purple-600" />
            견적 ({estimates.length}건)
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => setShowEstimateModal(true)}>
            <Plus className="h-3.5 w-3.5" /> 추가
          </Button>
        </CardHeader>
        <CardContent>
          {estimates.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-gray-400 mb-2">아직 견적이 없습니다.</p>
              <Button size="sm" onClick={() => setShowEstimateModal(true)}>
                <FileText className="h-4 w-4" /> 첫 견적 작성
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {estimates.map(est => {
                const rate = est.profit_rate || calcProfitRate(est.supply_price, est.cost_price)
                return (
                  <div key={est.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{est.site_name || inquiry.event_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          품목 {est.estimate_items?.length || 0}개 · 공급가 {formatKRW(est.supply_price)} · 부가세 {formatKRW(est.vat)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-blue-700">{formatKRW(est.total_price)}</p>
                        <p className={`text-xs font-semibold ${rate >= 20 ? 'text-green-600' : rate >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                          수익률 {rate}%
                        </p>
                      </div>
                    </div>
                    {/* 품목 목록 */}
                    {est.estimate_items && est.estimate_items.length > 0 && (
                      <div className="mt-3 border-t border-gray-200 pt-2 space-y-1">
                        {est.estimate_items.map(item => (
                          <div key={item.id} className="flex justify-between text-xs text-gray-600">
                            <span>{item.is_leader ? '👑 ' : ''}{item.role_name} {item.quantity}명 × {item.days}일</span>
                            <span>{formatKRW(item.quantity * item.days * item.unit_price)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 배정 인력 ── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-600" />
            배정 인력 ({assignments.length}명 · 확정 {confirmedCount}명)
          </CardTitle>
          <div className="flex items-center gap-2">
            {totalPayAmount > 0 && (
              <span className="text-sm font-semibold text-blue-700">지급합계 {formatKRW(totalPayAmount)}</span>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowAssignModal(true)}>
              <Plus className="h-3.5 w-3.5" /> 배정
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-gray-400 mb-2">배정된 인력이 없습니다.</p>
              <Button size="sm" onClick={() => setShowAssignModal(true)}>
                <Users className="h-4 w-4" /> 인원 배정
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>직원명</th>
                    <th>역할</th>
                    <th>직무</th>
                    <th>일수</th>
                    <th>단가</th>
                    <th>지급합계</th>
                    <th>상태</th>
                    <th className="text-right">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map(a => (
                    <tr key={a.id}>
                      <td className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">
                            {a.staff_name?.[0] || '?'}
                          </div>
                          {a.staff_name}
                        </div>
                      </td>
                      <td>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${(a as any).role_type === '팀장' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                          {(a as any).role_type || '서브'}
                        </span>
                      </td>
                      <td className="text-gray-600 text-sm">{a.job_type || '-'}</td>
                      <td className="text-center">{a.work_days}일</td>
                      <td>{formatKRW(a.pay_rate)}</td>
                      <td className="font-semibold">{formatKRW(a.total_pay || a.pay_rate * a.work_days)}</td>
                      <td>
                        <Select
                          value={a.status}
                          onChange={e => updateAssignStatus(a.id, e.target.value)}
                          className="w-24 h-7 text-xs"
                        >
                          {['후보','배정중','확정','취소'].map(s => <option key={s} value={s}>{s}</option>)}
                        </Select>
                      </td>
                      <td className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => deleteAssign(a.id)}
                          className="text-red-400 hover:text-red-600 h-7 w-7">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 정산 요약 ── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-green-600" />
            정산 정보
          </CardTitle>
          <Button
            size="sm"
            onClick={() => setShowSettleModal(true)}
            variant={settlement ? 'outline' : 'default'}
          >
            {settlement ? '수정' : <><Zap className="h-3.5 w-3.5" /> 정산 자동 생성</>}
          </Button>
        </CardHeader>
        <CardContent>
          {!settlement ? (
            <div className="text-center py-6 text-gray-400">
              <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">정산이 아직 없습니다.</p>
              {assignments.length > 0 && (
                <Button size="sm" className="mt-3" onClick={() => setShowSettleModal(true)}>
                  <Zap className="h-4 w-4" />
                  배정 데이터로 자동 생성
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <InfoRow label="공급가액" value={formatKRW(settlement.supply_price)} />
              <InfoRow label="부가세"   value={formatKRW(settlement.vat)} />
              <InfoRow label="수금액"   value={formatKRW(settlement.received_amount)} />
              <InfoRow label="잔액"     value={formatKRW(settlement.balance || 0)} />
              <InfoRow label="지급액"   value={formatKRW(settlement.payout_amount)} />
              <InfoRow label="원천세"   value={formatKRW(settlement.withholding_tax)} />
              <InfoRow label="수익"     value={formatKRW(settlement.profit || 0)} />
              <div>
                <p className="text-xs text-gray-400 font-medium">입금 상태</p>
                <span className={`text-sm px-2 py-0.5 rounded-full ${STATUS_COLORS[settlement.deposit_status] || 'bg-gray-100 text-gray-600'}`}>
                  {settlement.deposit_status}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ════════════════════════════════════
          견적 작성 모달
      ════════════════════════════════════ */}
      <Dialog open={showEstimateModal} onClose={() => setShowEstimateModal(false)} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>견적 작성 — {inquiry.event_name}</DialogTitle>
          <DialogClose onClose={() => setShowEstimateModal(false)} />
        </DialogHeader>
        <DialogContent className="space-y-4">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">현장명</label>
              <Input value={estForm.site_name} onChange={e => setEstForm(f => ({ ...f, site_name: e.target.value }))} placeholder={inquiry.location || '현장명'} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">책임자</label>
              <Input value={estForm.manager} onChange={e => setEstForm(f => ({ ...f, manager: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">복장</label>
              <Input value={estForm.attire} onChange={e => setEstForm(f => ({ ...f, attire: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">부대비용 (원)</label>
              <Input type="number" value={estForm.extra_cost} onChange={e => setEstForm(f => ({ ...f, extra_cost: Number(e.target.value) }))} />
            </div>
          </div>

          {/* 품목 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">견적 품목</span>
              <Button variant="outline" size="sm" onClick={() => setEstItems(p => [...p, { role_name: '', quantity: 1, days: 1, unit_price: 0, pay_unit_price: 0, spec: '', is_leader: false }])}>
                <Plus className="h-3.5 w-3.5" /> 품목 추가
              </Button>
            </div>
            <div className="space-y-2">
              {estItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center p-2 bg-gray-50 rounded-lg">
                  <div className="col-span-3">
                    <Input value={item.role_name} onChange={e => setEstItems(p => p.map((x, i) => i === idx ? { ...x, role_name: e.target.value } : x))}
                      placeholder="직군명" className="h-8 text-xs" />
                  </div>
                  <div className="col-span-1">
                    <Input type="number" value={item.quantity} min={1}
                      onChange={e => setEstItems(p => p.map((x, i) => i === idx ? { ...x, quantity: Number(e.target.value) } : x))}
                      className="h-8 text-xs text-center" />
                  </div>
                  <div className="col-span-1">
                    <Input type="number" value={item.days} min={1}
                      onChange={e => setEstItems(p => p.map((x, i) => i === idx ? { ...x, days: Number(e.target.value) } : x))}
                      className="h-8 text-xs text-center" />
                  </div>
                  <div className="col-span-2">
                    <Input type="number" value={item.unit_price} placeholder="매출단가"
                      onChange={e => setEstItems(p => p.map((x, i) => i === idx ? { ...x, unit_price: Number(e.target.value) } : x))}
                      className="h-8 text-xs" />
                  </div>
                  <div className="col-span-2">
                    <Input type="number" value={item.pay_unit_price} placeholder="매입단가"
                      onChange={e => setEstItems(p => p.map((x, i) => i === idx ? { ...x, pay_unit_price: Number(e.target.value) } : x))}
                      className="h-8 text-xs" />
                  </div>
                  <div className="col-span-2">
                    <div className="h-8 flex items-center justify-center text-xs font-semibold text-blue-700 bg-blue-50 rounded px-1">
                      {formatKRW(item.quantity * item.days * item.unit_price)}
                    </div>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    <Button variant="ghost" size="icon" onClick={() => setEstItems(p => p.filter((_, i) => i !== idx))}
                      className="text-red-400 h-8 w-8"><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 금액 요약 */}
          <div className="bg-blue-50 rounded-xl p-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-600">공급가액</span><span className="font-semibold">{formatKRW(supplyPrice)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">매입원가</span><span>{formatKRW(costPrice)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">부가세</span><span>{formatKRW(vat)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">예상수익</span><span className="font-semibold text-green-700">{formatKRW(supplyPrice - costPrice - estForm.extra_cost)}</span></div>
            <div className="flex justify-between col-span-2 border-t border-blue-200 pt-1.5">
              <span className="font-semibold">합계</span>
              <span className="font-bold text-blue-800">{formatKRW(total)}</span>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowEstimateModal(false)}>취소</Button>
          <Button onClick={handleSaveEstimate} disabled={saving}>{saving ? '저장 중...' : '견적 저장'}</Button>
        </DialogFooter>
      </Dialog>

      {/* ════════════════════════════════════
          배정 등록 모달
      ════════════════════════════════════ */}
      <Dialog open={showAssignModal} onClose={() => setShowAssignModal(false)} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>인원 배정 — {inquiry.event_name}</DialogTitle>
          <DialogClose onClose={() => setShowAssignModal(false)} />
        </DialogHeader>
        <DialogContent className="space-y-3">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

          {/* 페이 안내 */}
          {payDetail && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-xs text-yellow-800">
              💰 문의 페이: <strong>{payDetail}만원</strong> — 아래 단가에 반영하세요
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">직원명 *</label>
              <Input value={assignForm.staff_name} onChange={e => setAssignForm(f => ({ ...f, staff_name: e.target.value }))} placeholder="성명" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">역할</label>
              <Select value={assignForm.role_type} onChange={e => setAssignForm(f => ({ ...f, role_type: e.target.value }))}>
                <option value="서브">서브</option>
                <option value="팀장">팀장</option>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">직무</label>
              <Input value={assignForm.job_type} onChange={e => setAssignForm(f => ({ ...f, job_type: e.target.value }))} placeholder="나레이터, 경호원 등" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">연락처</label>
              <Input value={assignForm.phone} onChange={e => setAssignForm(f => ({ ...f, phone: e.target.value }))} placeholder="010-0000-0000" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">일당 (원)</label>
              <Input type="number" value={assignForm.pay_rate} onChange={e => setAssignForm(f => ({ ...f, pay_rate: e.target.value }))}
                placeholder={payDetail ? `팀장/서브 참고: ${payDetail}만원` : '단가'} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">근무 일수</label>
              <Input type="number" value={assignForm.work_days} onChange={e => setAssignForm(f => ({ ...f, work_days: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">시작일</label>
              <Input type="date" value={assignForm.start_date || inquiry.event_start || ''}
                onChange={e => setAssignForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">종료일</label>
              <Input type="date" value={assignForm.end_date || inquiry.event_end || ''}
                onChange={e => setAssignForm(f => ({ ...f, end_date: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">은행</label>
              <Input value={assignForm.bank_name} onChange={e => setAssignForm(f => ({ ...f, bank_name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">계좌번호</label>
              <Input value={assignForm.account_number} onChange={e => setAssignForm(f => ({ ...f, account_number: e.target.value }))} />
            </div>
          </div>

          {assignForm.pay_rate && assignForm.work_days && (
            <div className="bg-blue-50 rounded-lg p-2 text-sm text-blue-800">
              예상 지급액: <strong>{formatKRW(Number(assignForm.pay_rate) * Number(assignForm.work_days))}</strong>
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowAssignModal(false)}>취소</Button>
          <Button onClick={handleSaveAssign} disabled={saving}>{saving ? '저장 중...' : '배정 등록'}</Button>
        </DialogFooter>
      </Dialog>

      {/* ════════════════════════════════════
          정산 생성/수정 모달
      ════════════════════════════════════ */}
      <Dialog open={showSettleModal} onClose={() => setShowSettleModal(false)} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{settlement ? '정산 수정' : '정산 자동 생성'} — {inquiry.event_name}</DialogTitle>
          <DialogClose onClose={() => setShowSettleModal(false)} />
        </DialogHeader>
        <DialogContent className="space-y-4">
          {/* 배정 기반 자동 계산 미리보기 */}
          {assignments.length > 0 && (
            <div className="bg-blue-50 rounded-xl p-3 text-sm">
              <p className="font-semibold text-blue-800 mb-2 flex items-center gap-1">
                <Zap className="h-4 w-4" /> 배정 데이터 자동 계산
              </p>
              {assignments.map(a => (
                <div key={a.id} className="flex justify-between text-xs text-blue-700 py-0.5">
                  <span>{a.staff_name} ({(a as any).role_type || '서브'}) · {a.work_days}일 × {formatKRW(a.pay_rate)}</span>
                  <span className="font-semibold">{formatKRW(a.total_pay || a.pay_rate * a.work_days)}</span>
                </div>
              ))}
              <div className="border-t border-blue-200 mt-2 pt-2 flex justify-between font-semibold">
                <span>총 지급예정액</span>
                <span>{formatKRW(totalPayAmount)}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">공급가액 (원)</label>
              <Input type="number" value={settleForm.supply_price}
                placeholder={estimates[0] ? String(estimates[0].supply_price) : '직접 입력'}
                onChange={e => setSettleForm(f => ({ ...f, supply_price: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">수금액 (원)</label>
              <Input type="number" value={settleForm.received_amount}
                onChange={e => setSettleForm(f => ({ ...f, received_amount: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">입금 상태</label>
              <Select value={settleForm.deposit_status} onChange={e => setSettleForm(f => ({ ...f, deposit_status: e.target.value }))}>
                <option value="미입금">미입금</option>
                <option value="부분입금">부분입금</option>
                <option value="입금완료">입금완료</option>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">진행 상태</label>
              <Select value={settleForm.progress} onChange={e => setSettleForm(f => ({ ...f, progress: e.target.value }))}>
                <option value="계약체결">계약체결</option>
                <option value="행사준비">행사준비</option>
                <option value="행사종료">행사종료</option>
                <option value="정산완료">정산완료</option>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">파견 기간</label>
              <Input value={settleForm.dispatch_period}
                onChange={e => setSettleForm(f => ({ ...f, dispatch_period: e.target.value }))}
                placeholder={`${inquiry.event_start} ~ ${inquiry.event_end}`} />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" id="tax" checked={settleForm.tax_invoice_issued}
                onChange={e => setSettleForm(f => ({ ...f, tax_invoice_issued: e.target.checked }))}
                className="w-4 h-4 rounded" />
              <label htmlFor="tax" className="text-sm cursor-pointer">세금계산서 발행 완료</label>
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowSettleModal(false)}>취소</Button>
          <Button onClick={handleAutoSettle} disabled={saving}>
            {saving ? '저장 중...' : settlement ? '수정 완료' : '정산 생성'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-gray-400 font-medium">{label}</p>
      <p className="text-sm text-gray-800 mt-0.5 font-medium">{value || '-'}</p>
    </div>
  )
}
