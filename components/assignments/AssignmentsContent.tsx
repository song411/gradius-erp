'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { db } from '@/lib/supabase/api'
import type { Inquiry, Assignment, EstimateItem, Estimate, Staff } from '@/lib/supabase/types'
import { formatKRW, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import {
  Search, UserPlus, CheckCircle2, Clock, XCircle, ChevronRight,
  Users, CalendarDays, MapPin, Briefcase, Trash2, AlertCircle, UserX, Edit2, Sparkles,
  PanelLeftClose, PanelLeftOpen, GripVertical
} from 'lucide-react'
import StaffSearchModal from './StaffSearchModal'
import TeamAssignModal, { type TeamAssignData } from './TeamAssignModal'
import StaffRecommendModal from './StaffRecommendModal'
import ProjectMemoPanel from '@/components/memos/ProjectMemoPanel'
import CrewProfileCard from '@/components/staff/CrewProfileCard'
import ScheduleView from './ScheduleView'
import { toast } from 'sonner'
import { DndContext, DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

// 본사 인원 ID 목록 (certifications에 '본사직원' 포함)
const COMPANY_STAFF_NAMES = ['최규성', '송무재', '여지은', '김영찬']

// 배정 상태 색상
const STATUS_COLOR: Record<string, string> = {
  확정:   'bg-green-100 text-green-700',
  배정중: 'bg-yellow-100 text-yellow-700',
  후보:   'bg-blue-100 text-blue-700',
  취소:   'bg-gray-100 text-gray-500',
}
const STATUS_ICON: Record<string, React.ReactNode> = {
  확정:   <CheckCircle2 className="h-3.5 w-3.5" />,
  배정중: <Clock className="h-3.5 w-3.5" />,
  후보:   <Clock className="h-3.5 w-3.5" />,
  취소:   <XCircle className="h-3.5 w-3.5" />,
}

// ── 구간 타입: 단가 × 일수 쌍 ──────────────────────────
interface PaySegment { rate: number; days: number }

function parseSegments(memo?: string | null): PaySegment[] | null {
  if (!memo) return null
  try {
    const p = JSON.parse(memo)
    if (Array.isArray(p.segments) && p.segments.length > 0) return p.segments
  } catch {}
  return null
}

function segmentTotal(segs: PaySegment[]) {
  return segs.reduce((s, seg) => s + (seg.rate || 0) * (seg.days || 1), 0)
}

// 팀 내역 파싱 (팀장 assignment의 memo)
interface TeamBreakdownItem { name: string; role: string; rate: number; days: number; pay: number }
function parseTeamBreakdown(memo?: string | null): TeamBreakdownItem[] | null {
  if (!memo) return null
  try {
    const p = JSON.parse(memo)
    if (Array.isArray(p.team_breakdown) && p.team_breakdown.length > 0) return p.team_breakdown
  } catch {}
  return null
}

// ── 인라인 단가 수정 ─────────────────────────────────
function PayRateEditor({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(value))
  if (editing) {
    return (
      <span className="flex items-center gap-1">
        <Input
          type="number"
          value={val}
          onChange={e => setVal(e.target.value)}
          className="w-24 h-6 text-xs px-1"
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') { onSave(Number(val)); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
        />
        <button onClick={() => { onSave(Number(val)); setEditing(false) }} className="text-xs text-blue-600 font-medium">저장</button>
      </span>
    )
  }
  return (
    <span
      className="cursor-pointer hover:underline text-xs text-gray-700 flex items-center gap-0.5"
      onClick={() => { setVal(String(value)); setEditing(true) }}
      title="클릭하여 단가 수정"
    >
      {formatKRW(value)}
      <Edit2 className="h-2.5 w-2.5 text-gray-400" />
    </span>
  )
}

// ── 인라인 일수 수정 ─────────────────────────────────
function DaysEditor({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(value))
  if (editing) {
    return (
      <span className="flex items-center gap-1">
        <Input
          type="number"
          value={val}
          onChange={e => setVal(e.target.value)}
          className="w-14 h-6 text-xs px-1"
          autoFocus
          min={1}
          onKeyDown={e => {
            if (e.key === 'Enter') { onSave(Math.max(1, Number(val))); setEditing(false) }
            if (e.key === 'Escape') setEditing(false)
          }}
        />
        <span className="text-xs text-gray-500">일</span>
        <button onClick={() => { onSave(Math.max(1, Number(val))); setEditing(false) }} className="text-xs text-blue-600 font-medium">저장</button>
      </span>
    )
  }
  return (
    <span
      className="cursor-pointer hover:underline text-xs text-gray-700 flex items-center gap-0.5"
      onClick={() => { setVal(String(value)); setEditing(true) }}
      title="클릭하여 일수 수정"
    >
      {value}일
      <Edit2 className="h-2.5 w-2.5 text-gray-400" />
    </span>
  )
}

// ── 구간별 단가 설정 에디터 ──────────────────────────
function PaySegmentsEditor({
  initialSegments, totalDays,
  onSave, onCancel,
}: {
  initialSegments: PaySegment[]
  totalDays: number
  onSave: (segs: PaySegment[]) => void
  onCancel: () => void
}) {
  const [segs, setSegs] = useState<PaySegment[]>(
    initialSegments.length > 0 ? initialSegments : [{ rate: 0, days: totalDays }]
  )

  function update(i: number, field: keyof PaySegment, v: number) {
    setSegs(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: v } : s))
  }
  function addSeg() { setSegs(prev => [...prev, { rate: 0, days: 1 }]) }
  function removeSeg(i: number) { setSegs(prev => prev.filter((_, idx) => idx !== i)) }

  const total = segmentTotal(segs)
  const days  = segs.reduce((s, seg) => s + (seg.days || 1), 0)

  return (
    <div className="mt-1.5 bg-indigo-50 rounded-lg p-2 space-y-1.5 border border-indigo-200">
      <p className="text-[10px] font-semibold text-indigo-700 mb-1">구간별 단가 설정</p>
      {segs.map((seg, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500 w-8 shrink-0">{i + 1}구간</span>
          <Input
            type="number"
            value={seg.rate || ''}
            onChange={e => update(i, 'rate', Number(e.target.value))}
            placeholder="단가"
            className="w-24 h-6 text-xs px-1"
          />
          <span className="text-[10px] text-gray-400">원 ×</span>
          <Input
            type="number"
            value={seg.days || ''}
            onChange={e => update(i, 'days', Math.max(1, Number(e.target.value)))}
            placeholder="일수"
            className="w-12 h-6 text-xs px-1"
            min={1}
          />
          <span className="text-[10px] text-gray-400">일 =</span>
          <span className="text-[10px] font-semibold text-indigo-700 w-16 shrink-0">
            {formatKRW(seg.rate * seg.days)}
          </span>
          {segs.length > 1 && (
            <button onClick={() => removeSeg(i)} className="text-red-400 hover:text-red-600 text-[10px]">✕</button>
          )}
        </div>
      ))}
      <button onClick={addSeg} className="text-[10px] text-indigo-600 hover:underline">+ 구간 추가</button>
      <div className="border-t border-indigo-200 pt-1 flex items-center justify-between">
        <span className="text-[10px] text-gray-500">합계: {days}일 / {formatKRW(total)}</span>
        <div className="flex gap-1">
          <button onClick={onCancel} className="text-[10px] text-gray-400 hover:text-gray-600 px-1.5 py-0.5 border rounded">취소</button>
          <button
            onClick={() => onSave(segs)}
            className="text-[10px] text-white bg-indigo-600 hover:bg-indigo-700 px-2 py-0.5 rounded font-medium"
          >저장</button>
        </div>
      </div>
    </div>
  )
}

// 한 그룹(품목)의 배정 행 목록
interface SlotGroup {
  jobType: string
  required: number       // 견적 수량
  payRate: number        // 견적 단가
  days: number
  assignments: Assignment[]
}

// ── 드래그 가능한 스태프 카드 ──────────────────────────
function DraggableStaffCard({ staff }: { staff: Staff }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `staff-${staff.id}`,
    data: { staff },
  })
  const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }
  const RECOMMEND_COLOR: Record<string, string> = {
    '우선투입': 'border-emerald-300 bg-emerald-50',
    '일반':    'border-blue-200 bg-white',
    '보류':    'border-orange-200 bg-orange-50',
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border cursor-grab active:cursor-grabbing select-none ${RECOMMEND_COLOR[staff.recommend] || 'border-gray-200 bg-white'}`}
      {...listeners}
      {...attributes}
    >
      <GripVertical className="h-3.5 w-3.5 text-gray-300 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-800 truncate">{staff.name}</p>
        <p className="text-[10px] text-gray-400 truncate">
          {Array.isArray(staff.available_jobs) ? staff.available_jobs.slice(0, 2).join('·') : ''}
        </p>
      </div>
    </div>
  )
}

// ── 드롭 가능한 슬롯 영역 ─────────────────────────────
function DroppableSlot({ jobType, children }: { jobType: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${jobType}` })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border-2 transition-colors ${isOver ? 'border-blue-400 bg-blue-50/40' : 'border-transparent'}`}
    >
      {children}
    </div>
  )
}

export default function AssignmentsContent() {
  const [inquiries, setInquiries]     = useState<Inquiry[]>([])
  const [selectedInq, setSelectedInq] = useState<Inquiry | null>(null)
  const [showRecommend, setShowRecommend] = useState(false)
  const [slots, setSlots]             = useState<SlotGroup[]>([])
  const [allAssignments, setAllAssignments] = useState<Assignment[]>([])
  const [loading, setLoading]         = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [searchText, setSearchText]   = useState('')

  // 본사 인원 staff 목록 (빠른 배정 버튼용)
  const [companyStaff, setCompanyStaff] = useState<Staff[]>([])

  // 스탭 검색 모달
  const [modalOpen, setModalOpen]     = useState(false)
  const [modalJobType, setModalJobType]   = useState('')
  const [modalPayRate, setModalPayRate]   = useState(0)
  const [modalDays, setModalDays]         = useState(1)

  // 팀 배정 모달
  const [teamModalOpen, setTeamModalOpen]   = useState(false)
  const [teamModalJobType, setTeamModalJobType] = useState('')
  const [teamModalPayRate, setTeamModalPayRate] = useState(0)
  const [teamModalDays, setTeamModalDays]       = useState(1)

  // 배정 수 요약 (문의ID -> 배정수 map)
  const [assignCountMap, setAssignCountMap] = useState<Record<string, number>>({})

  // 구간 편집 중인 배정 ID
  const [editingSegmentsId, setEditingSegmentsId] = useState<string | null>(null)

  // 크루 프로필 모달
  const [profileStaff, setProfileStaff] = useState<Staff | null>(null)

  // 스태프 드래그 패널
  const [showStaffPanel, setShowStaffPanel] = useState(false)
  const [allStaff, setAllStaff] = useState<Staff[]>([])
  const [staffPanelSearch, setStaffPanelSearch] = useState('')

  // 뷰 모드: 배정뷰 / 스케줄뷰
  const [viewMode, setViewMode] = useState<'assignment' | 'schedule'>('assignment')

  // 스케줄뷰에서 배정 시 특정 날짜를 work_dates에 포함시키기 위한 ref
  const scheduleAssignDateRef = useRef<string | null>(null)

  // 본사 인원 로드
  const loadCompanyStaff = useCallback(async () => {
    const all = await db.list<Staff>('staff', { order: 'name', asc: true })
    const company = all.filter(s =>
      Array.isArray(s.certifications) && s.certifications.includes('본사직원')
    )
    setCompanyStaff(company)
    setAllStaff(all)
  }, [])

  // 문의 목록 로드
  const loadInquiries = useCallback(async () => {
    setLoading(true)
    const [inqs, asgns] = await Promise.all([
      db.list<Inquiry>('inquiries', {
        inFilter: { status: ['체결', '배정완료', '진행중'] },
        order: 'event_start', asc: true,
      }),
      db.list<Assignment>('assignments', {
        select: 'inquiry_id,status',
        order: 'assigned_at', asc: false,
      }),
    ])
    setInquiries(inqs)

    // 배정 수 요약
    const countMap: Record<string, number> = {}
    asgns.forEach(a => {
      if (a.inquiry_id && a.status !== '취소') {
        countMap[a.inquiry_id] = (countMap[a.inquiry_id] || 0) + 1
      }
    })
    setAssignCountMap(countMap)
    setLoading(false)
  }, [])

  useEffect(() => { loadInquiries() }, [loadInquiries])
  useEffect(() => { loadCompanyStaff() }, [loadCompanyStaff])

  // 문의 선택 → 상세 로드 (견적 품목 + 기존 배정)
  const loadDetail = useCallback(async (inq: Inquiry) => {
    setLoadingDetail(true)
    setSlots([])
    setAllAssignments([])

    // 1. 최종 확정 견적 조회 (is_final = true)
    const estimates = await db.list<Estimate>('estimates', {
      filters: { inquiry_id: inq.id, is_final: 'true' },
      order: 'created_at', asc: false,
    })

    let estimateItems: EstimateItem[] = []
    if (estimates.length > 0) {
      const finalEst = estimates[0]
      estimateItems = await db.list<EstimateItem>('estimate_items', {
        filters: { estimate_id: finalEst.id },
        order: 'created_at', asc: true,
      })
    }

    // 2. 기존 배정 조회
    const assignments = await db.list<Assignment>('assignments', {
      filters: { inquiry_id: inq.id },
      order: 'assigned_at', asc: true,
    })
    setAllAssignments(assignments)

    // 3. 슬롯 그룹 생성
    // 견적 품목 기반 그룹 (인력 품목만 - item_type 인력 또는 단가>0)
    const groupMap: Record<string, SlotGroup> = {}

    const NON_STAFF_TYPES = ['교통비', '숙박비', '식비', '연장수당', '기타', '지원품목', '부대비용']
    // 견적 품목에서 그룹 생성 (인력 품목만)
    estimateItems
      .filter(item => !NON_STAFF_TYPES.includes(item.item_type || '') && item.unit_price > 0)
      .forEach(item => {
        const key = item.role_name || '기타'
        if (!groupMap[key]) {
          groupMap[key] = {
            jobType: key,
            required: item.quantity,
            payRate: item.pay_unit_price || 0,
            days: item.days || 1,
            assignments: [],
          }
        } else {
          groupMap[key].required += item.quantity
        }
      })

    // 기존 배정을 그룹에 배치
    assignments.forEach(a => {
      const key = a.job_type || '기타'
      if (!groupMap[key]) {
        // 견적에 없는 직무 → 별도 그룹 생성
        groupMap[key] = {
          jobType: key,
          required: 0,
          payRate: a.pay_rate || 0,
          days: a.work_days || 1,
          assignments: [],
        }
      }
      groupMap[key].assignments.push(a)
    })

    // 견적 없는 그룹 마지막에 추가
    const slotList = Object.values(groupMap)
    // 견적 있는 그룹 먼저, 그 다음 없는 그룹
    slotList.sort((a, b) => (b.required - a.required))

    setSlots(slotList)
    setLoadingDetail(false)
  }, [])

  useEffect(() => {
    if (selectedInq) loadDetail(selectedInq)
  }, [selectedInq, loadDetail])

  // 배정 추가 (일반 배정뷰용)
  async function handleAssign(
    staff: Staff | null,
    staffName: string,
    staffType: string,
    payRate: number,
    jobType: string,
    days: number,
  ) {
    if (!selectedInq) return
    const scheduleDate = scheduleAssignDateRef.current
    scheduleAssignDateRef.current = null

    // 스케줄뷰에서 호출된 경우 → 자동합산 로직으로 분기
    if (scheduleDate) {
      await handleScheduleDateAssign(scheduleDate, staff, staffName, staffType, payRate, jobType)
      return
    }

    const payload: Record<string, unknown> = {
      inquiry_id: selectedInq.id,
      event_name: selectedInq.event_name,
      staff_id: staff?.id || null,
      staff_name: staffName,
      staff_type: staffType,
      job_type: jobType,
      phone: staff?.phone || null,
      bank_name: staff?.bank_name || null,
      account_number: staff?.account_number || null,
      id_number: staff?.id_number || null,
      pay_rate: payRate,
      work_days: days,
      status: '배정중' as const,
      is_payable: staffType !== '본사',
      is_present: true,
      start_date: selectedInq.event_start || null,
      end_date: selectedInq.event_end || null,
    }
    try {
      await db.insert('assignments', payload)
      toast.success(`${staffName} 배정 완료`)
      loadDetail(selectedInq)
      loadInquiries()
    } catch (e) {
      toast.error('배정 실패: ' + (e as Error).message)
    }
  }

  // 스케줄뷰 자동합산 배정
  async function handleScheduleDateAssign(
    date: string,
    staff: Staff | null,
    staffName: string,
    staffType: string,
    payRate: number,
    jobType: string,
  ) {
    if (!selectedInq) return

    // DB에서 최신 배정 목록을 직접 조회 (stale state 사용 시 연속 배정 시 중복 레코드 생성 방지)
    const freshAssignments = await db.list<Assignment>('assignments', {
      filters: { inquiry_id: selectedInq.id },
      order: 'assigned_at', asc: true,
    })

    const existing = freshAssignments.find(a =>
      a.status !== '취소' &&
      a.job_type === jobType &&
      (staff?.id ? a.staff_id === staff.id : a.staff_name === staffName)
    )

    if (existing) {
      // 충돌 체크: 구간 설정 또는 팀 배정이면 새 레코드로
      const hasSegments = parseSegments(existing.memo)
      const isTeamRole  = !!existing.role_type
      if (hasSegments || isTeamRole) {
        await createScheduleAssignment(date, staff, staffName, staffType, payRate, jobType)
        return
      }

      // 중복 날짜 체크
      const prevDates = Array.isArray(existing.work_dates) ? existing.work_dates : []
      if (prevDates.includes(date)) {
        toast.info(`${staffName}은 이미 ${date}에 배정되어 있습니다`)
        return
      }

      // 날짜 추가 (합산)
      const newDates = [...prevDates, date].sort()
      await db.update('assignments', existing.id, {
        work_dates: newDates,
        work_days:  newDates.length,
      })
      toast.success(`${staffName} → ${date} 추가 (총 ${newDates.length}일)`)
      loadDetail(selectedInq)
      loadInquiries()
    } else {
      await createScheduleAssignment(date, staff, staffName, staffType, payRate, jobType)
    }
  }

  // 스케줄뷰 신규 레코드 생성
  async function createScheduleAssignment(
    date: string,
    staff: Staff | null,
    staffName: string,
    staffType: string,
    payRate: number,
    jobType: string,
  ) {
    if (!selectedInq) return
    try {
      await db.insert('assignments', {
        inquiry_id:     selectedInq.id,
        event_name:     selectedInq.event_name,
        staff_id:       staff?.id || null,
        staff_name:     staffName,
        staff_type:     staffType,
        job_type:       jobType,
        phone:          staff?.phone || null,
        bank_name:      staff?.bank_name || null,
        account_number: staff?.account_number || null,
        id_number:      staff?.id_number || null,
        pay_rate:       payRate,
        work_days:      1,
        status:         '배정중' as const,
        is_payable:     staffType !== '본사',
        is_present:     true,
        start_date:     selectedInq.event_start || null,
        end_date:       selectedInq.event_end || null,
        work_dates:     [date],
      } as Record<string, unknown>)
      toast.success(`${staffName} → ${date} 배정 완료`)
      loadDetail(selectedInq)
      loadInquiries()
    } catch (e) {
      toast.error('배정 실패: ' + (e as Error).message)
    }
  }

  // 스케줄뷰: 특정 날짜에서 인력 제거
  async function handleRemoveFromDate(asgn: Assignment, date: string) {
    if (!selectedInq) return
    const prevDates = Array.isArray(asgn.work_dates) ? asgn.work_dates : []
    const newDates  = prevDates.filter(d => d !== date)

    if (newDates.length === 0) {
      if (!confirm(`${asgn.staff_name}의 마지막 날짜입니다. 배정을 삭제하시겠습니까?`)) return
      await db.delete('assignments', asgn.id)
      toast.success('배정 삭제 완료')
    } else {
      await db.update('assignments', asgn.id, {
        work_dates: newDates,
        work_days:  newDates.length,
      })
      toast.success(`${asgn.staff_name} ${date} 제거 (남은 ${newDates.length}일)`)
    }
    loadDetail(selectedInq)
    loadInquiries()
  }

  // 배정 상태 변경
  async function handleStatusChange(asgn: Assignment, status: string) {
    await db.update('assignments', asgn.id, { status })
    if (status === '확정' && selectedInq) {
      await db.update('inquiries', selectedInq.id, { status: '배정완료' })
    }
    toast.success('상태 변경 완료')
    loadDetail(selectedInq!)
    loadInquiries()
  }

  // 배정중 전체 일괄 확정
  async function handleBulkConfirm() {
    if (!selectedInq) return
    const targets = slots.flatMap(g => g.assignments).filter(a => a.status === '배정중')
    if (targets.length === 0) return
    await Promise.all(targets.map(a => db.update('assignments', a.id, { status: '확정' })))
    await db.update('inquiries', selectedInq.id, { status: '배정완료' })
    toast.success(`${targets.length}명 배정확정 완료`)
    loadDetail(selectedInq)
    loadInquiries()
  }

  // 단가 수정
  async function handlePayRateUpdate(asgn: Assignment, payRate: number) {
    await db.update('assignments', asgn.id, { pay_rate: payRate })
    toast.success('단가 수정 완료')
    loadDetail(selectedInq!)
  }

  // 일수 수정
  async function handleWorkDaysUpdate(asgn: Assignment, days: number) {
    await db.update('assignments', asgn.id, { work_days: days })
    toast.success(`${asgn.staff_name} 참여 일수 → ${days}일`)
    loadDetail(selectedInq!)
  }

  // 구간별 단가 저장 (memo에 JSON 보관)
  // pay_rate = 구간 합산 총액, work_days = 1 로 저장
  // → pay_rate × work_days = 정확한 총 지급액 (지급관리 자동계산과 호환)
  async function handlePaySegmentsUpdate(asgn: Assignment, segs: PaySegment[]) {
    const totalPay  = segmentTotal(segs)
    const totalDays = segs.reduce((s, seg) => s + (seg.days || 1), 0)
    const memoJson  = JSON.stringify({ segments: segs, total_days: totalDays })
    await db.update('assignments', asgn.id, {
      pay_rate:  totalPay,  // 총 지급액 → PayoutForm autoBase = totalPay × 1 = 정확
      work_days: 1,         // 지급관리 계산 단순화
      memo:      memoJson,
    })
    toast.success('구간별 단가 저장 완료')
    loadDetail(selectedInq!)
  }

  // 배정 삭제
  async function handleDelete(asgn: Assignment) {
    if (!confirm(`${asgn.staff_name} 배정을 삭제하시겠습니까?`)) return
    await db.delete('assignments', asgn.id)
    toast.success('배정 삭제 완료')
    loadDetail(selectedInq!)
    loadInquiries()
  }

  // 드래그앤드롭 배정
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || !selectedInq) return
    const staff = active.data.current?.staff as Staff | undefined
    if (!staff) return

    const overId = String(over.id)

    // 스케줄뷰 셀 드롭: "schedule|{date}|{jobType}"
    if (overId.startsWith('schedule|')) {
      const firstPipe  = overId.indexOf('|')
      const secondPipe = overId.indexOf('|', firstPipe + 1)
      const date    = overId.slice(firstPipe + 1, secondPipe)
      const jobType = overId.slice(secondPipe + 1)
      const group   = slots.find(g => g.jobType === jobType)
      await handleScheduleDateAssign(date, staff, staff.name, '외부', group?.payRate || 0, jobType)
      return
    }

    // 기존 배정뷰 슬롯 드롭
    const slotJobType = overId.replace('slot-', '')
    const group = slots.find(g => g.jobType === slotJobType)
    await handleAssign(staff, staff.name, '외부', group?.payRate || 0, slotJobType, group?.days || 1)
  }

  // 본사 인원 즉시 배정
  async function handleCompanyQuickAssign(staff: Staff, jobType: string) {
    if (!selectedInq) return
    const payload = {
      inquiry_id: selectedInq.id,
      event_name: selectedInq.event_name,
      staff_id: staff.id,
      staff_name: staff.name,
      staff_type: '본사',
      job_type: jobType || '현장관리',
      phone: staff.phone || null,
      pay_rate: 0,
      work_days: 1,
      status: '확정' as const,
      is_payable: false,
      is_present: true,
      start_date: selectedInq.event_start || null,
      end_date: selectedInq.event_end || null,
    }
    try {
      await db.insert('assignments', payload)
      toast.success(`[본사] ${staff.name} 배정 완료`)
      loadDetail(selectedInq)
      loadInquiries()
    } catch (e) {
      toast.error('배정 실패: ' + (e as Error).message)
    }
  }

  // 팀 배정 처리
  async function handleTeamAssign(data: TeamAssignData) {
    if (!selectedInq) return
    const teamCode = `TEAM-${Date.now().toString(36).toUpperCase()}`
    try {
      // 팀 전체 개별 내역을 memo에 JSON으로 저장 (사업소득대장 등 추후 활용)
      const teamBreakdown = [
        ...(data.leaderPresent ? [{
          name: data.leader.name,
          role: '팀장',
          rate: data.leaderRate,
          days: data.leaderDays,
          pay: data.leaderRate * data.leaderDays,
        }] : []),
        ...data.members.map(m => ({
          name: m.name,
          role: '팀원',
          rate: m.rate,
          days: m.days,
          pay: m.rate * m.days,
        })),
      ]
      const teamMemoJson = JSON.stringify({ team_breakdown: teamBreakdown })

      // 팀장 배정: pay_rate = 합산 총액, work_days = 1 (지급관리 자동계산 호환)
      await db.insert('assignments', {
        inquiry_id: selectedInq.id,
        event_name: selectedInq.event_name,
        staff_id: data.leader.id,
        staff_name: data.leader.name,
        staff_type: data.leader.certifications?.includes('본사직원') ? '본사' : '외부',
        job_type: data.leaderJobType,
        phone: data.leader.phone || null,
        bank_name: data.leader.bank_name || null,
        account_number: data.leader.account_number || null,
        id_number: data.leader.id_number || null,
        pay_rate: data.totalPayRate,  // 합산 총액
        work_days: 1,                 // 총액 이미 반영 → 1로 고정
        status: '배정중' as const,
        is_payable: !data.leader.certifications?.includes('본사직원'),
        is_present: data.leaderPresent,
        team_code: teamCode,
        role_type: '팀장',
        start_date: selectedInq.event_start || null,
        end_date: selectedInq.event_end || null,
        memo: teamMemoJson,
      })

      // 하위 멤버 배정 (지급은 팀장 일괄 → is_payable=false, 개별 일수/단가는 memo에 보관)
      for (const member of data.members) {
        if (!member.name.trim()) continue
        await db.insert('assignments', {
          inquiry_id: selectedInq.id,
          event_name: selectedInq.event_name,
          staff_id: null,
          staff_name: member.name.trim(),
          staff_type: '외부',
          job_type: data.leaderJobType,
          pay_rate: 0,
          work_days: member.days,  // 개별 참여 일수 저장
          status: '배정중' as const,
          is_payable: false,
          is_present: true,
          team_code: teamCode,
          role_type: '팀원',
          start_date: selectedInq.event_start || null,
          end_date: selectedInq.event_end || null,
          // 개별 단가/일수/금액 → 사업소득대장용
          memo: JSON.stringify({ individual_rate: member.rate, individual_days: member.days, individual_pay: member.rate * member.days, team_leader: data.leader.name }),
        })
      }
      toast.success(`팀 배정 완료: ${data.leader.name} 팀장 + 멤버 ${data.members.length}명 (합산 ${formatKRW(data.totalPayRate)})`)
      loadDetail(selectedInq)
      loadInquiries()
    } catch (e) {
      toast.error('팀 배정 실패: ' + (e as Error).message)
    }
  }

  function openModal(jobType: string, payRate: number, days: number) {
    setModalJobType(jobType)
    setModalPayRate(payRate)
    setModalDays(days)
    setModalOpen(true)
  }

  function openTeamModal(jobType: string, payRate: number, days: number) {
    setTeamModalJobType(jobType)
    setTeamModalPayRate(payRate)
    setTeamModalDays(days)
    setTeamModalOpen(true)
  }

  // 문의 목록 필터
  const filteredInquiries = inquiries.filter(i =>
    !searchText ||
    (i.company_name || '').includes(searchText) ||
    (i.event_name || '').includes(searchText)
  )

  // 배정 완료 인원 / 필요 인원 계산
  const totalRequired = slots.reduce((s, g) => s + g.required, 0)
  const totalAssigned = slots.reduce((s, g) => s + g.assignments.filter(a => a.status !== '취소').length, 0)

  const filteredStaff = allStaff.filter(s =>
    !staffPanelSearch || s.name.includes(staffPanelSearch) ||
    (Array.isArray(s.available_jobs) && s.available_jobs.some(j => j.includes(staffPanelSearch)))
  )

  return (
    <DndContext onDragEnd={handleDragEnd}>
    <div className="flex h-full">
      {/* ── 좌 패널: 문의 목록 ── */}
      <div className="w-80 shrink-0 flex flex-col border-r border-gray-200 bg-white">
        <div className="p-3 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="업체명, 행사명 검색..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">체결/배정완료/진행중 {filteredInquiries.length}건</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-20">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
            </div>
          ) : filteredInquiries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm gap-1">
              <AlertCircle className="h-6 w-6 opacity-40" />
              <p>배정 대상 문의가 없습니다</p>
            </div>
          ) : (
            filteredInquiries.map(inq => {
              const isSelected = selectedInq?.id === inq.id
              const count = assignCountMap[inq.id] || 0
              return (
                <div
                  key={inq.id}
                  onClick={() => setSelectedInq(inq)}
                  className={`p-3 cursor-pointer border-b border-gray-100 hover:bg-blue-50 transition-colors ${isSelected ? 'bg-blue-50 border-l-[3px] border-l-blue-500' : ''}`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{inq.company_name || '-'}</p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{inq.event_name || '-'}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        inq.status === '배정완료' ? 'bg-green-100 text-green-700' :
                        inq.status === '진행중' ? 'bg-blue-100 text-blue-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>{inq.status}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                    {inq.event_start && (
                      <span className="flex items-center gap-0.5">
                        <CalendarDays className="h-3 w-3" />
                        {formatDate(inq.event_start)}
                      </span>
                    )}
                    {inq.location && (
                      <span className="flex items-center gap-0.5 truncate">
                        <MapPin className="h-3 w-3" />
                        {inq.location.slice(0, 8)}
                      </span>
                    )}
                    <span className="flex items-center gap-0.5 ml-auto font-medium text-blue-600">
                      <Users className="h-3 w-3" />{count}명 배정
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── 스태프 드래그 패널 ── */}
      {showStaffPanel && (
        <div className="w-52 shrink-0 flex flex-col border-r border-gray-200 bg-white">
          <div className="p-2.5 border-b border-gray-100 flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
              <Input
                placeholder="이름·직무 검색"
                value={staffPanelSearch}
                onChange={e => setStaffPanelSearch(e.target.value)}
                className="pl-6 h-7 text-xs"
              />
            </div>
            <button onClick={() => setShowStaffPanel(false)} className="text-gray-400 hover:text-gray-600 shrink-0">
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
          <p className="text-[10px] text-gray-400 px-2.5 py-1.5 bg-indigo-50 border-b border-indigo-100">
            슬롯으로 드래그해서 배정
          </p>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {filteredStaff.map(s => (
              <DraggableStaffCard key={s.id} staff={s} />
            ))}
          </div>
        </div>
      )}

      {/* ── 우 패널: 배정 현황 ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        {!selectedInq ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
            <Users className="h-12 w-12 opacity-20" />
            <p className="text-base">좌측에서 배정할 행사를 선택해주세요</p>
            <p className="text-sm text-gray-300">체결 완료된 문의만 표시됩니다</p>
          </div>
        ) : (
          <>
            {/* 헤더 */}
            <div className="bg-white border-b border-gray-200 px-5 py-3">
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                <span>{selectedInq.company_name}</span>
                <ChevronRight className="h-3 w-3" />
                <span className="text-gray-600 font-medium">{selectedInq.event_name}</span>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                {selectedInq.event_start && (
                  <span className="flex items-center gap-1 text-sm text-gray-600">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatDate(selectedInq.event_start)}
                    {selectedInq.event_end && selectedInq.event_end !== selectedInq.event_start
                      ? ` ~ ${formatDate(selectedInq.event_end)}`
                      : ''}
                  </span>
                )}
                {selectedInq.location && (
                  <span className="flex items-center gap-1 text-sm text-gray-600">
                    <MapPin className="h-3.5 w-3.5" />{selectedInq.location}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {/* 뷰 탭 */}
                  <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs mr-1">
                    <button
                      onClick={() => setViewMode('assignment')}
                      className={`px-2.5 py-1 font-medium transition-colors ${
                        viewMode === 'assignment'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-500 hover:bg-gray-50'
                      }`}
                    >배정뷰</button>
                    <button
                      onClick={() => setViewMode('schedule')}
                      className={`px-2.5 py-1 font-medium transition-colors border-l border-gray-200 ${
                        viewMode === 'schedule'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-500 hover:bg-gray-50'
                      }`}
                    >스케줄뷰</button>
                  </div>
                  <span className="text-sm text-gray-500">
                    배정 {totalAssigned} / {totalRequired > 0 ? `필요 ${totalRequired}` : '자유 배정'}명
                  </span>
                  {totalRequired > 0 && totalAssigned >= totalRequired && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                      ✅ 배정 완료
                    </span>
                  )}
                  {(() => {
                    const pendingCount = slots.flatMap(g => g.assignments).filter(a => a.status === '배정중').length
                    return pendingCount > 0 ? (
                      <Button size="sm" variant="outline" onClick={handleBulkConfirm} className="h-7 text-xs border-green-400 text-green-700 hover:bg-green-50">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        전체 배정확정 ({pendingCount}명)
                      </Button>
                    ) : null
                  })()}
                  <Button size="sm" onClick={() => openModal('', 0, 1)} className="h-7 text-xs">
                    <UserPlus className="h-3.5 w-3.5" />
                    인력 추가
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openTeamModal('', 0, 1)} className="h-7 text-xs border-blue-300 text-blue-600 hover:bg-blue-50">
                    <Users className="h-3.5 w-3.5" />
                    팀 배정
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowRecommend(true)} className="h-7 text-xs border-indigo-300 text-indigo-600 hover:bg-indigo-50">
                    <Sparkles className="h-3.5 w-3.5" />
                    추천 인력
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowStaffPanel(v => !v)}
                    className={`h-7 text-xs ${showStaffPanel ? 'border-violet-400 text-violet-600 bg-violet-50' : 'border-gray-300 text-gray-600'}`}
                    title="스태프 드래그 패널"
                  >
                    {showStaffPanel ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
                    드래그 배정
                  </Button>
                </div>
              </div>
            </div>

            {/* 인원추천 메모 배너 */}
            {viewMode === 'assignment' && <ProjectMemoPanel inquiryId={selectedInq.id} compact />}

            {/* 스케줄뷰 */}
            {viewMode === 'schedule' && !loadingDetail && (
              <div className="flex-1 overflow-hidden p-4">
                <ScheduleView
                  inquiry={selectedInq}
                  slots={slots}
                  allAssignments={allAssignments}
                  onOpenAssign={(date, jobType, payRate) => {
                    scheduleAssignDateRef.current = date
                    openModal(jobType, payRate, 1)
                  }}
                  onRemoveFromDate={handleRemoveFromDate}
                />
              </div>
            )}

            {/* 배정뷰 슬롯 목록 */}
            {viewMode === 'assignment' && <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingDetail ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                </div>
              ) : slots.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
                  <AlertCircle className="h-8 w-8 opacity-30" />
                  <p className="text-sm">배정 기록이 없습니다</p>
                  <p className="text-xs text-gray-300">확정된 견적이 없거나, 아직 배정이 등록되지 않았습니다</p>
                  <Button size="sm" variant="outline" onClick={() => openModal('', 0, 1)} className="mt-2 text-xs">
                    <UserPlus className="h-3.5 w-3.5" /> 첫 인력 추가
                  </Button>
                </div>
              ) : (
                slots.map(group => {
                  const activeCount = group.assignments.filter(a => a.status !== '취소').length
                  const isFull = group.required > 0 && activeCount >= group.required
                  const isOver = group.required > 0 && activeCount > group.required
                  return (
                    <DroppableSlot key={group.jobType} jobType={group.jobType}>
                    <Card className="overflow-hidden">
                      {/* 그룹 헤더 */}
                      <div className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 ${isFull ? 'bg-green-50' : 'bg-gray-50'}`}>
                        <Briefcase className="h-4 w-4 text-gray-500 shrink-0" />
                        <span className="font-semibold text-gray-800 text-sm">{group.jobType}</span>
                        {group.required > 0 && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            isOver ? 'bg-orange-100 text-orange-700' :
                            isFull ? 'bg-green-100 text-green-700' :
                            'bg-gray-200 text-gray-600'
                          }`}>
                            {activeCount} / {group.required}명
                          </span>
                        )}
                        {group.payRate > 0 && (
                          <span className="text-xs text-gray-400">견적단가 {formatKRW(group.payRate)}</span>
                        )}
                        <div className="ml-auto flex items-center gap-1 flex-wrap justify-end">
                          {/* 본사 인원 빠른 배정 버튼 */}
                          {companyStaff.map(s => (
                            <button
                              key={s.id}
                              onClick={() => handleCompanyQuickAssign(s, group.jobType)}
                              className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-white border border-purple-200 rounded-full text-[10px] font-medium text-purple-700 hover:bg-purple-50 hover:border-purple-400 transition-colors"
                              title={`[본사] ${s.name} 즉시 배정 (지급 없음)`}
                            >
                              <span className="font-bold">B</span>{s.name}
                            </button>
                          ))}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs"
                            onClick={() => openModal(group.jobType, group.payRate, group.days)}
                          >
                            <UserPlus className="h-3 w-3" /> 추가
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs border-blue-200 text-blue-600 hover:bg-blue-50"
                            onClick={() => openTeamModal(group.jobType, group.payRate, group.days)}
                            title="프리팀 배정"
                          >
                            <Users className="h-3 w-3" /> 팀
                          </Button>
                        </div>
                      </div>

                      {/* 배정 목록 */}
                      <div className="divide-y divide-gray-100">
                        {group.assignments.length === 0 ? (
                          <div className="px-4 py-3 text-xs text-gray-400 text-center">
                            배정된 인력이 없습니다. 추가 버튼을 눌러주세요.
                          </div>
                        ) : (
                          group.assignments.map(asgn => (
                            <div key={asgn.id} className={`flex items-center gap-3 px-4 py-2.5 ${asgn.status === '취소' ? 'opacity-40' : ''}`}>
                              {/* 아바타 - 클릭 시 프로필 */}
                              <button
                                onClick={() => {
                                  const found = allStaff.find(s => s.id === asgn.staff_id) || allStaff.find(s => s.name === asgn.staff_name)
                                  if (found) setProfileStaff(found)
                                }}
                                className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0 hover:ring-2 hover:ring-blue-400 hover:scale-110 transition-all"
                                title={`${asgn.staff_name} 프로필 보기`}
                              >
                                {asgn.staff_name?.[0] || '?'}
                              </button>

                              {/* 이름 + 구분 */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-sm font-medium">
                                    {asgn.staff_type === '본사' && (
                                      <span className="text-purple-600 font-bold text-xs">[본사] </span>
                                    )}
                                    {asgn.staff_name}
                                  </span>
                                  {/* 팀장/팀원 뱃지 */}
                                  {asgn.role_type === '팀장' && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold">팀장</span>
                                  )}
                                  {asgn.role_type === '팀원' && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">팀원</span>
                                  )}
                                  {/* 현장 불참 뱃지 */}
                                  {!asgn.is_present && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 flex items-center gap-0.5 font-medium">
                                      <UserX className="h-2.5 w-2.5" />현장불참
                                    </span>
                                  )}
                                  {asgn.staff_type !== '본사' && asgn.role_type !== '팀장' && asgn.role_type !== '팀원' && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-600">외부</span>
                                  )}
                                </div>
                                {/* 단가 × 일수 표시 (팀내역 / 구간 / 단순) */}
                                {(() => {
                                  const teamBreakdown = asgn.role_type === '팀장' ? parseTeamBreakdown(asgn.memo) : null
                                  const segs = !teamBreakdown ? parseSegments(asgn.memo) : null
                                  const isEditing = editingSegmentsId === asgn.id

                                  // 팀장 → 팀 내역 표시
                                  if (teamBreakdown) {
                                    return (
                                      <div className="mt-1 text-[11px] text-gray-500 space-y-0.5">
                                        {teamBreakdown.map((item, i) => (
                                          <div key={i} className="flex items-center gap-1">
                                            <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${item.role === '팀장' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                                              {item.role}
                                            </span>
                                            <span className="text-gray-600">{item.name}</span>
                                            <span className="text-gray-400">{formatKRW(item.rate)}×{item.days}일</span>
                                            <span className="font-medium text-gray-700">= {formatKRW(item.pay)}</span>
                                          </div>
                                        ))}
                                        <div className="flex items-center gap-1 pt-0.5 border-t border-gray-100">
                                          <span className="text-blue-700 font-semibold">합산 지급: {formatKRW(asgn.pay_rate)}</span>
                                        </div>
                                      </div>
                                    )
                                  }

                                  // 구간 편집 중
                                  if (isEditing) {
                                    return (
                                      <PaySegmentsEditor
                                        initialSegments={segs ?? [{ rate: asgn.pay_rate, days: asgn.work_days }]}
                                        totalDays={asgn.work_days || 1}
                                        onSave={async newSegs => {
                                          await handlePaySegmentsUpdate(asgn, newSegs)
                                          setEditingSegmentsId(null)
                                        }}
                                        onCancel={() => setEditingSegmentsId(null)}
                                      />
                                    )
                                  }

                                  // 구간 모드
                                  if (segs) {
                                    return (
                                      <div className="mt-0.5 text-[11px] text-gray-500">
                                        <div className="flex items-center gap-1 flex-wrap">
                                          {segs.map((seg, i) => (
                                            <span key={i} className="flex items-center gap-0.5">
                                              {i > 0 && <span className="text-gray-300">+</span>}
                                              <span className="bg-indigo-50 text-indigo-700 px-1 py-0.5 rounded text-[10px] font-medium">
                                                {formatKRW(seg.rate)}×{seg.days}일
                                              </span>
                                            </span>
                                          ))}
                                          <span className="font-semibold text-gray-700">= {formatKRW(segmentTotal(segs))}</span>
                                          <button
                                            onClick={() => setEditingSegmentsId(asgn.id)}
                                            className="text-[10px] text-indigo-500 hover:underline ml-0.5"
                                          >수정</button>
                                        </div>
                                      </div>
                                    )
                                  }

                                  // 단순 모드
                                  return (
                                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400 flex-wrap">
                                      <PayRateEditor
                                        value={asgn.pay_rate}
                                        onSave={v => handlePayRateUpdate(asgn, v)}
                                      />
                                      <span className="text-gray-300">×</span>
                                      <DaysEditor
                                        value={asgn.work_days || 1}
                                        onSave={v => handleWorkDaysUpdate(asgn, v)}
                                      />
                                      <span className="font-medium text-gray-600">= {formatKRW((asgn.pay_rate || 0) * (asgn.work_days || 1))}</span>
                                      <button
                                        onClick={() => setEditingSegmentsId(asgn.id)}
                                        className="text-[10px] text-indigo-400 hover:text-indigo-600 hover:underline border border-indigo-200 px-1 py-0.5 rounded"
                                        title="날짜별 다른 단가 설정"
                                      >구간설정</button>
                                    </div>
                                  )
                                })()}
                              </div>

                              {/* 상태 */}
                              <Select
                                value={asgn.status}
                                onChange={e => handleStatusChange(asgn, e.target.value)}
                                className="w-24 h-7 text-xs"
                              >
                                <option value="후보">후보</option>
                                <option value="배정중">배정중</option>
                                <option value="확정">확정</option>
                                <option value="취소">취소</option>
                              </Select>

                              {/* 상태 뱃지 */}
                              <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[asgn.status] || ''}`}>
                                {STATUS_ICON[asgn.status]}
                                {asgn.status}
                              </span>

                              {/* 삭제 */}
                              <button
                                onClick={() => handleDelete(asgn)}
                                className="text-gray-300 hover:text-red-400 transition-colors"
                                title="배정 삭제"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </Card>
                    </DroppableSlot>
                  )
                })
              )}
            </div>}

            {/* 하단: 지급 합계 */}
            {allAssignments.length > 0 && (
              <div className="bg-white border-t border-gray-200 px-5 py-2.5 flex items-center gap-6 text-sm">
                <div>
                  <span className="text-gray-500">배정 인원: </span>
                  <span className="font-semibold">{allAssignments.filter(a => a.status !== '취소').length}명</span>
                </div>
                <div>
                  <span className="text-gray-500">예상 지급: </span>
                  <span className="font-semibold text-blue-700">
                    {formatKRW(
                      allAssignments
                        .filter(a => a.status !== '취소' && a.is_payable)
                        .reduce((s, a) => {
                          const segs = parseSegments(a.memo)
                          return s + (segs ? segmentTotal(segs) : (a.pay_rate || 0) * (a.work_days || 1))
                        }, 0)
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">확정: </span>
                  <span className="font-semibold text-green-700">{allAssignments.filter(a => a.status === '확정').length}명</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 스탭 검색 모달 */}
      <StaffSearchModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        jobType={modalJobType}
        defaultPayRate={modalPayRate}
        defaultDays={modalDays}
        onAssign={handleAssign}
      />

      {/* 팀 배정 모달 */}
      <TeamAssignModal
        open={teamModalOpen}
        onClose={() => setTeamModalOpen(false)}
        defaultJobType={teamModalJobType}
        defaultPayRate={teamModalPayRate}
        onAssign={handleTeamAssign}
      />

      {/* 추천 인력 모달 */}
      {showRecommend && selectedInq && (
        <StaffRecommendModal
          inquiry={selectedInq}
          onClose={() => setShowRecommend(false)}
          onSelect={(staff) => {
            setShowRecommend(false)
            // 추천 인력 선택 → 기본값으로 배정 추가 (이름·직종 자동완성, 단가는 기본 0으로 추가 후 수정 가능)
            handleAssign(staff, staff.name, '외부', 0, '', 1)
          }}
        />
      )}
      {/* 크루 프로필 모달 */}
      {profileStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setProfileStaff(null)} />
          <div className="relative z-10 w-full max-w-sm">
            <CrewProfileCard staff={profileStaff} onClose={() => setProfileStaff(null)} onEdit={() => {}} />
          </div>
        </div>
      )}
    </div>
    </DndContext>
  )
}
