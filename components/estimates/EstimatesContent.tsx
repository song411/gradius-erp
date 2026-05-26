'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { db } from '@/lib/supabase/api'
import { formatKRW, calcProfitRate } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Edit2, Trash2, Eye, Package, FileText, TrendingUp, Send, Clock, CheckCircle, Star, Copy, RotateCcw } from 'lucide-react'
import type { Estimate, EstimateItem, Inquiry } from '@/lib/supabase/types'
import EstimateBuilder from './EstimateBuilder'
import EstimatePreview from './EstimatePreview'

type EstimateRow = Estimate & { inquiries?: Inquiry; estimate_items?: EstimateItem[] }

// ── 탭 정의 ───────────────────────────────────────────────
type TabKey = 'pending_inquiry' | 'in_progress' | 'sent'

const TABS: { key: TabKey; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    key: 'pending_inquiry',
    label: '견적 대기',
    icon: <Clock className="h-4 w-4" />,
    desc: '견적서 미작성 접수 문의',
  },
  {
    key: 'in_progress',
    label: '진행 중',
    icon: <FileText className="h-4 w-4" />,
    desc: '작성된 견적 (미발송 / 검토중)',
  },
  {
    key: 'sent',
    label: '발송 완료',
    icon: <Send className="h-4 w-4" />,
    desc: '고객에게 발송된 견적',
  },
]

export default function EstimatesContent() {
  const [estimates, setEstimates] = useState<EstimateRow[]>([])
  // 견적 없는 접수 문의 (견적 대기)
  const [pendingInquiries, setPendingInquiries] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [activeTab, setActiveTab] = useState<TabKey>('pending_inquiry')

  // 빌더 모달
  const [showBuilder, setShowBuilder] = useState(false)
  const [editTarget, setEditTarget] = useState<EstimateRow | null>(null)
  const [preselectedInquiry, setPreselectedInquiry] = useState<Inquiry | null>(null)
  const [preselectedVersionLabel, setPreselectedVersionLabel] = useState<string>('A안')

  // 미리보기 모달
  const [previewTarget, setPreviewTarget] = useState<EstimateRow | null>(null)

  // 견적에 연결할 모든 문의 (빌더용)
  const [allInquiries, setAllInquiries] = useState<Inquiry[]>([])

  const load = useCallback(async () => {
    setLoading(true)

    const [ests, inqsForEst, allInqs] = await Promise.all([
      // 견적: 문의ID로 품목을 조회하기 위해 inquiry_id도 필요
      db.list<EstimateRow>('estimates', {
        select: '*, inquiries(id, event_name, company_name, status, event_start, event_end, phone, location, event_time, required_staff, memo)',
        order: 'created_at', asc: false,
      }),
      // 견적 대기: '접수' 상태 문의
      db.list<Inquiry>('inquiries', {
        inFilter: { status: ['접수'] },
        order: 'created_at', asc: false,
      }),
      // 빌더용 문의 목록
      db.list<Inquiry>('inquiries', {
        inFilter: { status: ['접수', '견적', '체결'] },
        order: 'created_at', asc: false,
      }),
    ])

    // 견적이 있는 inquiry_id 목록
    const estimatedInqIds = new Set(ests.map(e => e.inquiry_id))

    // 견적 대기 = 접수 상태이면서 아직 견적 없는 것
    const pending = inqsForEst.filter(i => !estimatedInqIds.has(i.id))

    // 각 견적에 해당하는 품목 attach
    // → inquiry_id 기준으로 estimate_items 조회 (마이그레이션 데이터 호환)
    const inqIds = [...new Set(ests.map(e => e.inquiry_id).filter((id): id is string => !!id))]
    let itemsByInqId: Record<string, EstimateItem[]> = {}
    if (inqIds.length > 0) {
      const items = await db.list<EstimateItem>('estimate_items', {
        inFilter: { inquiry_id: inqIds },
        order: 'created_at', asc: true,
      })
      items.forEach(item => {
        const key = item.inquiry_id || ''
        if (!itemsByInqId[key]) itemsByInqId[key] = []
        itemsByInqId[key].push(item)
      })
    }

    // 견적에 estimate_items 붙이기
    const enriched = ests.map(est => ({
      ...est,
      estimate_items: est.inquiry_id ? (itemsByInqId[est.inquiry_id] || []) : [],
    }))

    setEstimates(enriched)
    setPendingInquiries(pending)
    setAllInquiries(allInqs)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete(id: string, companyName?: string) {
    if (!confirm(`"${companyName || '이 견적'}"을 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`)) return
    const tid = toast.loading('견적 삭제 중...')
    try {
      await db.deleteWhere('estimate_items', { estimate_id: id })
      await db.delete('estimates', id)
      toast.success('견적이 삭제되었습니다.', { id: tid })
      load()
    } catch (e) {
      toast.error(`삭제 실패: ${(e as Error).message}`, { id: tid })
    }
  }

  // 최종 견적 확정 — 같은 문의의 다른 견적 is_final=false, 이 견적 is_final=true, 문의 상태 → 체결
  // + settlements 레코드 자동 생성 (없을 경우)
  async function handleMarkFinal(est: EstimateRow) {
    if (!confirm(`"${est.version_label || est.estimate_code || '이 견적'}"을 최종 견적으로 확정하시겠습니까?\n다른 견적의 최종 확정 상태가 해제됩니다.`)) return
    const tid = toast.loading('최종 견적 확정 중...')
    try {
      // 같은 문의의 다른 견적 is_final → false
      const sameGroup = estimates.filter(e => e.inquiry_id === est.inquiry_id && e.id !== est.id)
      await Promise.all(sameGroup.map(e => db.update('estimates', e.id, { is_final: false })))

      // 이 견적 is_final → true
      await db.update('estimates', est.id, { is_final: true })

      // 문의 상태 → 체결
      if (est.inquiry_id) {
        await db.update('inquiries', est.inquiry_id, { status: '체결' })

        // 구글 캘린더 자동 등록
        try {
          const inq = est.inquiries
          const res = await fetch('/api/calendar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event_name:     inq?.event_name     || est.site_name    || '',
              company_name:   inq?.company_name   || est.company_name || '',
              event_start:    inq?.event_start    || null,
              event_end:      inq?.event_end      || null,
              phone:          inq?.phone          || null,
              location:       (inq as any)?.location     || null,
              event_time:     (inq as any)?.event_time   || null,
              required_staff: (inq as any)?.required_staff || null,
              memo:           (inq as any)?.memo          || null,
              supply_price:   est.supply_price    || 0,
              total_price:    est.total_price     || 0,
              version_label:  est.version_label   || 'A안',
            }),
          })
          if (res.ok) {
            toast.success('✅ 구글 캘린더에 일정이 등록되었습니다.')
          } else {
            const err = await res.json()
            toast.error(`캘린더 등록 실패: ${err.error || '알 수 없는 오류'}`)
          }
        } catch (calErr) {
          console.error('캘린더 API 오류:', calErr)
          toast.error('캘린더 등록 중 오류가 발생했습니다.')
        }
      }

      // settlements 레코드 자동 생성 (이미 있으면 스킵)
      if (est.inquiry_id) {
        const existingSettlements = await db.list('settlements', {
          filters: { inquiry_id: est.inquiry_id },
          limit: 1,
        })
        if (existingSettlements.length === 0) {
          const inq = est.inquiries
          const settlementPayload = {
            inquiry_id: est.inquiry_id,
            company_name: est.company_name || inq?.company_name || '',
            site_name: est.site_name || inq?.event_name || '',
            invoice_amount: est.total_price || 0,
            supply_price: est.supply_price || 0,
            vat: est.vat || 0,
            received_amount: 0,
            progress: '계약체결',
            deposit_status: '미입금',
            tax_invoice_issued: false,
            payout_amount: est.cost_price || 0,
            invoice_calc_amount: est.total_price || 0,
            withholding_tax: 0,
          }
          await db.insert('settlements', settlementPayload)
        }
      }

      toast.success(`"${est.version_label || 'A안'}" 견적이 최종 확정되었습니다! 체결관리에 등록되었습니다.`, { id: tid, duration: 5000 })
      load()
    } catch (e) {
      toast.error(`확정 실패: ${(e as Error).message}`, { id: tid })
    }
  }

  // 최종 확정 되돌리기 — is_final=false, 문의 상태 → 견적, settlements 레코드 삭제
  async function handleUnmarkFinal(est: EstimateRow) {
    if (!confirm(`"${est.version_label || est.estimate_code || '이 견적'}"의 최종 확정을 해제하시겠습니까?\n문의 상태가 "견적"으로 되돌아가고, 체결관리에서 해당 레코드가 삭제됩니다.`)) return
    const tid = toast.loading('확정 해제 중...')
    try {
      // is_final → false
      await db.update('estimates', est.id, { is_final: false })

      // 문의 상태 → 견적
      if (est.inquiry_id) {
        await db.update('inquiries', est.inquiry_id, { status: '견적' })
      }

      // settlements 레코드 삭제 (inquiry_id로 연결된 건)
      if (est.inquiry_id) {
        const existing = await db.list<{ id: string }>('settlements', {
          filters: { inquiry_id: est.inquiry_id },
          select: 'id',
          limit: 1,
        })
        if (existing.length > 0) {
          await db.delete('settlements', existing[0].id)
        }
      }

      toast.success('최종 확정이 해제되었습니다. 문의 상태가 "견적"으로 변경되었습니다.', { id: tid, duration: 4000 })
      load()
    } catch (e) {
      toast.error(`해제 실패: ${(e as Error).message}`, { id: tid })
    }
  }

  // 견적 발송 상태 토글
  async function handleToggleSent(est: EstimateRow) {
    const isSent = est.send_status === '발송완료'
    const nextStatus = isSent ? '미발송' : '발송완료'
    const msg = isSent
      ? `"${est.version_label || 'A안'}" 발송 상태를 미발송으로 되돌리겠습니까?`
      : `"${est.version_label || 'A안'}" 견적을 발송완료로 표시하겠습니까?`
    if (!confirm(msg)) return
    try {
      await db.update('estimates', est.id, {
        send_status: nextStatus,
        send_at: nextStatus === '발송완료' ? new Date().toISOString() : null,
      })
      toast.success(nextStatus === '발송완료' ? '발송완료로 표시됐습니다.' : '미발송으로 되돌렸습니다.')
      load()
    } catch {
      toast.error('상태 변경 실패')
    }
  }

  // 저장 완료 후 → 진행 중 탭으로 이동
  function handleSaved() {
    load()
    setActiveTab('in_progress')
  }

  function openCreate(inq?: Inquiry) {
    setEditTarget(null)
    setPreselectedInquiry(inq || null)
    setPreselectedVersionLabel('A안')
    setShowBuilder(true)
  }

  // 기존 문의에 추가 견적 작성 (B안/C안 등)
  function openAddVersion(inq: Inquiry) {
    const existingCount = estimates.filter(e => e.inquiry_id === inq.id).length
    const LABELS = ['A안', 'B안', 'C안', 'D안', 'E안']
    const nextLabel = LABELS[existingCount] || `${existingCount + 1}안`
    setEditTarget(null)
    setPreselectedInquiry(inq)
    setPreselectedVersionLabel(nextLabel)
    setShowBuilder(true)
  }

  function openEdit(est: EstimateRow) {
    setEditTarget(est)
    setPreselectedInquiry(null)
    setShowBuilder(true)
  }

  // ── 탭별 필터링 ──────────────────────────────────────────
  const filteredEsts = estimates.filter(est => {
    const matchSearch = !searchText || [est.company_name, est.event_name, est.inquiries?.event_name]
      .some(v => v?.toLowerCase().includes(searchText.toLowerCase()))
    const isSent = est.send_status === '발송완료'
    if (activeTab === 'in_progress') return matchSearch && !isSent
    if (activeTab === 'sent') return matchSearch && isSent
    return false
  })

  const filteredPending = pendingInquiries.filter(i =>
    !searchText || [i.company_name, i.event_name]
      .some(v => v?.toLowerCase().includes(searchText.toLowerCase()))
  )

  // ── 집계 ─────────────────────────────────────────────────
  const sentCount = estimates.filter(e => e.send_status === '발송완료').length
  const inProgressCount = estimates.filter(e => e.send_status !== '발송완료').length
  const totalSupply = estimates.reduce((s, e) => s + (e.supply_price || 0), 0)

  return (
    <>
      {/* 집계 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <StatCard icon={<Clock className="h-5 w-5" />} label="견적 대기" value={`${pendingInquiries.length}건`} color="orange" />
        <StatCard icon={<FileText className="h-5 w-5" />} label="진행 중" value={`${inProgressCount}건`} color="blue" />
        <StatCard icon={<Send className="h-5 w-5" />} label="발송 완료" value={`${sentCount}건`} color="green" />
        <StatCard icon={<TrendingUp className="h-5 w-5" />} label="총 공급가액" value={formatKRW(totalSupply)} color="purple" />
      </div>

      {/* 검색 바 */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="업체명, 행사명 검색..."
            className="pl-9"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />
        </div>
        {activeTab !== 'pending_inquiry' && (
          <Button onClick={() => openCreate()} className="gap-2">
            <Plus className="h-4 w-4" />
            견적 작성
          </Button>
        )}
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {tab.icon}
            {tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeTab === tab.key ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
            }`}>
              {tab.key === 'pending_inquiry' ? filteredPending.length
                : tab.key === 'in_progress' ? inProgressCount
                : sentCount}
            </span>
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          ) : (
            <>
              {/* ── 탭 1: 견적 대기 (접수된 문의 목록) ── */}
              {activeTab === 'pending_inquiry' && (
                <div className="overflow-x-auto">
                  <table className="erp-table">
                    <thead>
                      <tr>
                        <th>업체명</th>
                        <th>행사명</th>
                        <th>담당자</th>
                        <th>행사일</th>
                        <th>접수일</th>
                        <th className="text-right">액션</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPending.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center text-gray-400 py-12">
                            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-400" />
                            <p>대기 중인 문의가 없습니다.</p>
                          </td>
                        </tr>
                      ) : (
                        filteredPending.map(inq => (
                          <tr key={inq.id} className="hover:bg-orange-50 transition-colors">
                            <td className="font-medium">{inq.company_name || '-'}</td>
                            <td className="text-sm">{inq.event_name || '-'}</td>
                            <td className="text-sm text-gray-600">{inq.contact_name || '-'}</td>
                            <td className="text-sm text-gray-600">{inq.event_start?.slice(0, 10) || '-'}</td>
                            <td className="text-xs text-gray-400">{inq.created_at?.slice(0, 10)}</td>
                            <td className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openCreate(inq)}
                                className="text-blue-600 border-blue-200 hover:bg-blue-50 gap-1"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                견적 작성
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── 탭 2·3: 진행 중 / 발송 완료 견적 목록 (문의별 그룹) ── */}
              {(activeTab === 'in_progress' || activeTab === 'sent') && (
                <EstimateGroupTable
                  estimates={filteredEsts}
                  allEstimates={estimates}
                  onPreview={est => setPreviewTarget(est)}
                  onEdit={openEdit}
                  onDelete={est => handleDelete(est.id, est.company_name || est.event_name)}
                  onMarkFinal={handleMarkFinal}
                  onUnmarkFinal={handleUnmarkFinal}
                  onAddVersion={openAddVersion}
                  onCreate={openCreate}
                  onToggleSent={handleToggleSent}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 스마트 견적 빌더 (풀스크린) */}
      <EstimateBuilder
        open={showBuilder}
        onClose={() => { setShowBuilder(false); setPreselectedInquiry(null) }}
        onSaved={handleSaved}
        inquiries={allInquiries}
        editTarget={editTarget}
        preselectedInquiryId={preselectedInquiry?.id}
        defaultVersionLabel={preselectedVersionLabel}
      />

      {/* 견적서 미리보기 */}
      <EstimatePreview
        open={!!previewTarget}
        onClose={() => setPreviewTarget(null)}
        estimate={previewTarget}
      />
    </>
  )
}

// ── 견적 그룹 테이블 (문의별 그룹핑) ─────────────────────
function EstimateGroupTable({
  estimates, allEstimates,
  onPreview, onEdit, onDelete, onMarkFinal, onUnmarkFinal, onAddVersion, onCreate, onToggleSent,
}: {
  estimates: EstimateRow[]
  allEstimates: EstimateRow[]
  onPreview: (est: EstimateRow) => void
  onEdit: (est: EstimateRow) => void
  onDelete: (est: EstimateRow) => void
  onMarkFinal: (est: EstimateRow) => void
  onUnmarkFinal: (est: EstimateRow) => void
  onAddVersion: (inq: Inquiry) => void
  onCreate: () => void
  onToggleSent: (est: EstimateRow) => void
}) {
  if (estimates.length === 0) {
    return (
      <div className="text-center text-gray-400 py-16">
        <FileText className="h-8 w-8 mx-auto mb-2 opacity-20" />
        <p>견적이 없습니다.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onCreate}>
          견적 작성하기
        </Button>
      </div>
    )
  }

  // 문의 ID 기준으로 그룹핑 (순서 유지)
  const seenGroups: string[] = []
  const groupMap: Record<string, EstimateRow[]> = {}
  for (const est of estimates) {
    const key = est.inquiry_id || est.id
    if (!groupMap[key]) {
      seenGroups.push(key)
      groupMap[key] = []
    }
    groupMap[key].push(est)
  }

  return (
    <div className="divide-y divide-gray-100">
      {seenGroups.map(key => {
        const group = groupMap[key]
        const first = group[0]
        const inq = first.inquiries as unknown as Inquiry | undefined
        const hasFinal = group.some(e => e.is_final)
        const totalForInquiry = allEstimates.filter(e => e.inquiry_id === first.inquiry_id).length

        return (
          <div key={key}>
            {/* 그룹 헤더 */}
            <div className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-slate-50 to-gray-50 border-l-4 border-slate-400">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800 text-sm">{first.company_name || '-'}</span>
                  <span className="text-gray-400 text-xs">/</span>
                  <span className="text-gray-700 text-sm">{first.event_name || inq?.event_name || '-'}</span>
                  {inq?.event_start && (
                    <span className="text-xs text-gray-400">{inq.event_start.slice(0, 10)}</span>
                  )}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 font-medium">
                    {totalForInquiry}개 견적
                  </span>
                  {hasFinal && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold flex items-center gap-1">
                      <Star className="h-3 w-3 fill-amber-500 text-amber-500" />최종 확정됨
                    </span>
                  )}
                </div>
              </div>
              {/* 추가 견적 작성 버튼 */}
              {inq && (
                <Button
                  variant="outline" size="sm"
                  onClick={() => onAddVersion(inq)}
                  className="gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50 shrink-0"
                  title="이 문의에 추가 견적(B안/C안) 작성"
                >
                  <Copy className="h-3.5 w-3.5" />
                  견적 추가
                </Button>
              )}
            </div>

            {/* 해당 그룹의 견적 목록 */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {group.map((est, idx) => {
                    const rate = est.profit_rate || calcProfitRate(est.supply_price, est.cost_price)
                    const items = est.estimate_items || []
                    const isFinal = !!est.is_final
                    const versionLabel = est.version_label || (idx === 0 ? 'A안' : `${idx + 1}안`)

                    return (
                      <tr
                        key={est.id}
                        className={`border-b border-gray-100 transition-colors ${
                          isFinal ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-50'
                        }`}
                      >
                        {/* 버전 라벨 */}
                        <td className="pl-8 pr-2 py-3 w-20">
                          <div className="flex items-center gap-1.5">
                            {isFinal && <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500 shrink-0" />}
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              isFinal
                                ? 'bg-amber-500 text-white'
                                : 'bg-indigo-100 text-indigo-700'
                            }`}>
                              {versionLabel}
                            </span>
                          </div>
                        </td>
                        {/* 견적번호 */}
                        <td className="px-2 py-3 w-36">
                          {est.estimate_code ? (
                            <span className="text-xs font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded whitespace-nowrap">
                              {est.estimate_code}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-300 italic">미발급</span>
                          )}
                        </td>
                        {/* 품목 수 */}
                        <td className="px-2 py-3 w-20 text-center">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                            items.length > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
                          }`}>
                            <Package className="h-3 w-3" />
                            {items.length}
                          </span>
                        </td>
                        {/* 공급가액 */}
                        <td className="px-2 py-3 w-32 text-right font-semibold">{formatKRW(est.supply_price)}</td>
                        {/* 수익률 */}
                        <td className="px-2 py-3 w-20 text-right">
                          <span className={`text-sm font-bold ${
                            rate >= 25 ? 'text-green-600' : rate >= 15 ? 'text-yellow-600' : 'text-red-500'
                          }`}>
                            {rate}%
                          </span>
                        </td>
                        {/* 발송 상태 — 클릭하면 토글 */}
                        <td className="px-2 py-3 w-28">
                          <button
                            onClick={() => onToggleSent(est)}
                            title={est.send_status === '발송완료' ? '클릭하면 미발송으로 되돌리기' : '클릭하면 발송완료로 표시'}
                            className="group flex items-center gap-1"
                          >
                            <SendBadge status={est.send_status} method={est.send_method} />
                            <span className="text-[10px] text-gray-300 group-hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100">
                              {est.send_status === '발송완료' ? '↩' : '✓'}
                            </span>
                          </button>
                        </td>
                        {/* 작성일 */}
                        <td className="px-2 py-3 w-24 text-xs text-gray-400">{est.created_at?.slice(0, 10)}</td>
                        {/* 액션 */}
                        <td className="px-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* 최종 확정 / 되돌리기 버튼 */}
                            {!isFinal ? (
                              <Button
                                variant="outline" size="sm"
                                onClick={() => onMarkFinal(est)}
                                className="gap-1 text-xs text-amber-600 border-amber-300 hover:bg-amber-50 h-7 px-2"
                                title="최종 견적으로 확정"
                              >
                                <Star className="h-3 w-3" />최종 확정
                              </Button>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-amber-600 font-semibold flex items-center gap-1 px-1">
                                  <Star className="h-3 w-3 fill-amber-500" />확정됨
                                </span>
                                <Button
                                  variant="ghost" size="sm"
                                  onClick={() => onUnmarkFinal(est)}
                                  className="gap-1 text-xs text-gray-400 hover:text-red-500 h-7 px-1.5"
                                  title="최종 확정 해제"
                                >
                                  <RotateCcw className="h-3 w-3" />되돌리기
                                </Button>
                              </div>
                            )}
                            <Button
                              variant="ghost" size="icon"
                              onClick={() => onPreview(est)}
                              title="견적서 미리보기"
                              className="text-blue-500 hover:text-blue-700 h-7 w-7"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              onClick={() => onEdit(est)}
                              title="수정"
                              className="h-7 w-7"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              onClick={() => onDelete(est)}
                              className="text-red-400 hover:text-red-600 h-7 w-7"
                              title="삭제"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── 발송 배지 ─────────────────────────────────────────────
function SendBadge({ status, method }: { status?: string | null; method?: string | null }) {
  const s = status || '미발송'
  const colors: Record<string, string> = {
    '발송완료': 'bg-green-100 text-green-700',
    '미발송': 'bg-gray-100 text-gray-500',
    '검토중': 'bg-yellow-100 text-yellow-700',
  }
  return (
    <div>
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[s] || 'bg-gray-100 text-gray-500'}`}>
        {s}
      </span>
      {method && <span className="text-xs text-gray-400 ml-1">({method})</span>}
    </div>
  )
}

// ── KPI 카드 ─────────────────────────────────────────────
function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode
  label: string
  value: string
  color: 'blue' | 'green' | 'purple' | 'orange'
}) {
  const gradients = {
    blue: 'from-blue-600 to-blue-500',
    green: 'from-green-600 to-emerald-500',
    purple: 'from-purple-600 to-purple-500',
    orange: 'from-orange-500 to-amber-400',
  }
  return (
    <div className={`rounded-xl p-5 text-white bg-gradient-to-br ${gradients[color]} shadow-sm`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium opacity-90">{label}</span>
        <div className="opacity-80">{icon}</div>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  )
}
