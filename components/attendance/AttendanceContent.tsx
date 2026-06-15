'use client'

import { useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/supabase/api'
import type { Inquiry, Assignment, Attendance, Evaluation, Staff } from '@/lib/supabase/types'
import type { AttendanceStatus } from '@/lib/supabase/types'
import { formatDate, formatKRW } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Search, CalendarDays, MapPin, Users, CheckCircle2,
  Clock, AlertCircle, ChevronRight, Star,
  ClipboardList, Award, Save, RefreshCw, HelpCircle,
} from 'lucide-react'
import { toast } from 'sonner'

// 행사 날짜 범위 생성 (start ~ end, 최대 31일)
function getDateRange(start?: string, end?: string): string[] {
  if (!start) return []
  const s = new Date(start)
  const e = end ? new Date(end) : s
  const dates: string[] = []
  const curr = new Date(s)
  while (curr <= e && dates.length < 31) {
    dates.push(curr.toISOString().slice(0, 10))
    curr.setDate(curr.getDate() + 1)
  }
  return dates
}

// YYYY-MM-DD → "M/D(요일)" 포맷
function formatDateTab(dateStr: string): string {
  const d = new Date(dateStr)
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
  return `${d.getMonth() + 1}/${d.getDate()}(${day})`
}

// 출석 상태 스타일
const STATUS_STYLE: Record<AttendanceStatus, string> = {
  출석: 'bg-green-500 text-white',
  지각: 'bg-yellow-400 text-white',
  결근: 'bg-red-500 text-white',
  조퇴: 'bg-orange-400 text-white',
  외출: 'bg-blue-400 text-white',
}
const STATUS_IDLE = 'bg-gray-100 text-gray-500 hover:bg-gray-200'

const ALL_STATUSES: AttendanceStatus[] = ['출석', '지각', '결근', '조퇴', '외출']

// 새 평가 항목 정의 (라벨 + 가이드)
interface EvalField {
  key: keyof EvalScores
  label: string
  emoji: string
  guide: string
}

const EVAL_FIELDS: EvalField[] = [
  {
    key: 'attendance_score',
    label: '근태',
    emoji: '📅',
    guide: '집결시간·휴게시간 준수 여부\n5점: 15분 전 도착, 시간 완벽 준수\n4점: 제시간 도착, 전반적으로 양호\n3점: 소폭 지각 또는 짧은 이탈 (업무 지장 없음)\n2점: 지각·이탈로 팀에 영향\n1점: 심각한 지각·무단이탈·조퇴',
  },
  {
    key: 'performance_score',
    label: '직무·서비스',
    emoji: '🎯',
    guide: '업무 수행 능력 + 고객 응대 태도\n5점: 매뉴얼 완벽 숙지, 장비 능숙, 응대 탁월\n4점: 임무 우수, 고객 응대 원활\n3점: 기본 수행, 응대 방식 일부 보완 필요\n2점: 임무 미흡, 상급자 지시 반복 필요\n1점: 임무 불이행 또는 고객 민원 발생',
  },
  {
    key: 'appearance_score',
    label: '외형',
    emoji: '✨',
    guide: '복장·청결도가 현장에 적합한가\n5점: 복장 완벽, 청결 우수, 행사 이미지 완전 부합\n4점: 전반적으로 단정, 소소한 보완만 필요\n3점: 기본은 갖췄으나 일부 흐트러짐\n2점: 복장 불량 또는 청결 문제 눈에 띔\n1점: 현장 이미지에 심각하게 부적합',
  },
  {
    key: 'teamwork_score',
    label: '팀워크·보고',
    emoji: '📡',
    guide: '무전 보고 정확성 및 팀 협업\n5점: 보고 정확·신속, 팀 소통 완벽\n4점: 팀워크 우수, 소통 원활\n3점: 기본 소통 가능, 보고 누락·지연 있음\n2점: 소통 미흡, 무전 응답 지연, 단독행동\n1점: 팀워크 저해, 지시 불이행',
  },
  {
    key: 'adaptability_score',
    label: '상황대응',
    emoji: '⚡',
    guide: '돌발 상황 시 초동 대응 능력\n5점: 즉각 판단·대응, 보고 완벽, 능동적 해결\n4점: 대부분 적절하게 대응\n3점: 기본 대응하나 판단이 느리거나 수동적\n2점: 돌발상황에 당황, 지시 대기만 함\n1점: 상황 대응 불가, 오히려 악화',
  },
]

interface EvalScores {
  attendance_score: number
  performance_score: number
  appearance_score: number
  teamwork_score: number
  adaptability_score: number
}

// 별점 + 숫자 입력 통합 컴포넌트
// - 별 클릭: 정수/반개 토글
// - 숫자 입력: 직접 타이핑 (0~5, 0.5 단위 자동 스냅)
function ScoreInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [raw, setRaw] = useState(String(value))
  const [hovered, setHovered] = useState<number | null>(null)

  useEffect(() => { setRaw(String(value)) }, [value])

  // 별 클릭 — 같은 정수 클릭 시 반 개 토글
  function handleStarClick(i: number) {
    const next = value === i ? i - 0.5 : i
    onChange(next)
  }

  // 별 위에서의 표시 값 (호버 중이면 호버 값, 아니면 실제 값)
  const display = hovered ?? value

  function handleNumChange(e: React.ChangeEvent<HTMLInputElement>) {
    setRaw(e.target.value)
    const num = parseFloat(e.target.value)
    if (!isNaN(num)) {
      const snapped = Math.round(Math.min(5, Math.max(0, num)) * 2) / 2
      onChange(snapped)
    }
  }

  function handleNumBlur() { setRaw(String(value)) }

  return (
    <div className="flex items-center gap-2">
      {/* 클릭 가능한 별 */}
      <div className="flex gap-0.5" onMouseLeave={() => setHovered(null)}>
        {[1, 2, 3, 4, 5].map(i => (
          <button
            key={i}
            type="button"
            onClick={() => handleStarClick(i)}
            onMouseEnter={() => setHovered(i)}
            className="focus:outline-none transition-transform hover:scale-110 active:scale-95"
            title={`${i}점`}
          >
            <Star
              className={`h-5 w-5 transition-colors ${
                display >= i
                  ? 'text-yellow-400 fill-yellow-400'
                  : display >= i - 0.5
                  ? 'text-yellow-300 fill-yellow-200'
                  : 'text-gray-200 hover:text-yellow-200'
              }`}
            />
          </button>
        ))}
      </div>

      {/* 숫자 직접 입력 */}
      <input
        type="number"
        value={raw}
        onChange={handleNumChange}
        onBlur={handleNumBlur}
        min={0}
        max={5}
        step={0.5}
        inputMode="decimal"
        className="w-14 h-8 text-center text-sm font-bold border-2 border-gray-200 rounded-lg focus:border-purple-400 focus:outline-none bg-gray-50 focus:bg-white transition-colors"
      />
    </div>
  )
}

// 평가 기준 툴팁
function GuideTooltip({ guide }: { guide: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onTouchStart={() => setShow(v => !v)}
        className="text-gray-300 hover:text-gray-500 focus:outline-none"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {show && (
        <div className="absolute left-5 top-0 z-50 w-56 bg-gray-900 text-white text-[11px] rounded-xl p-3 shadow-xl whitespace-pre-line leading-relaxed">
          {guide}
        </div>
      )}
    </div>
  )
}

export default function AttendanceContent() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [selectedInq, setSelectedInq] = useState<Inquiry | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [attendances, setAttendances] = useState<Attendance[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [activeTab, setActiveTab] = useState<'attendance' | 'evaluation'>('attendance')
  // 다일 행사: 현재 선택된 날짜 (단일 행사면 null → event_start 사용)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // 출석 편집 상태 (assignmentId → 편집 중인 데이터)
  const [editMap, setEditMap] = useState<Record<string, {
    status: AttendanceStatus | null
    clockIn: string
    notes: string
    dirty: boolean
  }>>({})

  // 평가 편집 상태 (assignmentId → 점수 + 크루 정보)
  const [evalMap, setEvalMap] = useState<Record<string, EvalScores & {
    re_recommend: boolean
    strengths: string
    improvements: string
    height: string
    weight: string
    mbti: string
    dirty: boolean
  }>>({})

  // 행사 목록 로드 (배정완료/진행중/완료)
  const loadInquiries = useCallback(async () => {
    setLoading(true)
    const inqs = await db.list<Inquiry>('inquiries', {
      inFilter: { status: ['배정완료', '진행중', '완료'] },
      order: 'event_start', asc: false,
    })
    setInquiries(inqs)
    setLoading(false)
  }, [])

  useEffect(() => { loadInquiries() }, [loadInquiries])

  // 날짜별 editMap 재구성 (날짜 탭 전환 시 or 초기 로드 시)
  const buildEditMap = useCallback((
    asgns: Assignment[],
    atts: Attendance[],
    targetDate: string,
  ) => {
    const newMap: Record<string, { status: AttendanceStatus | null; clockIn: string; notes: string; dirty: boolean }> = {}
    asgns.filter(a => a.status !== '취소').forEach(a => {
      // 해당 날짜의 출석 레코드만 매칭
      const existing = atts.find(at => at.assignment_id === a.id && at.work_date === targetDate)
      newMap[a.id] = {
        status: existing?.status || null,
        clockIn: existing?.clock_in || '',
        notes: existing?.notes || '',
        dirty: false,
      }
    })
    return newMap
  }, [])

  // 행사 선택 시 상세 로드
  const loadDetail = useCallback(async (inq: Inquiry) => {
    setLoadingDetail(true)
    setEditMap({})
    setEvalMap({})

    // 날짜 탭 초기화 (행사 시작일로 설정)
    const initDate = inq.event_start || new Date().toISOString().slice(0, 10)
    setSelectedDate(initDate)

    const [asgns, atts, evals] = await Promise.all([
      db.list<Assignment>('assignments', {
        filters: { inquiry_id: inq.id },
        order: 'assigned_at', asc: true,
      }),
      db.list<Attendance>('attendances', {
        filters: { inquiry_id: inq.id },
        order: 'created_at', asc: true,
      }),
      db.list<Evaluation>('evaluations', {
        filters: { site_name: inq.event_name },
        order: 'evaluated_at', asc: true,
      }),
    ])

    const activeAsgns = asgns.filter(a => a.status !== '취소')
    setAssignments(activeAsgns)
    setAttendances(atts)
    setEvaluations(evals)

    // 시작일 기준으로 editMap 초기화
    setEditMap(buildEditMap(activeAsgns, atts, initDate))

    // 스태프 정보 병렬 로드 (키: staff_id → height/weight/mbti 참조용)
    const staffIds = [...new Set(asgns.filter(a => a.staff_id).map(a => a.staff_id!))]
    const staffList = staffIds.length
      ? await db.list<Staff>('staff', { inFilter: { id: staffIds } })
      : []

    // 기존 평가 데이터로 evalMap 초기화
    const newEvalMap: typeof evalMap = {}
    asgns.filter(a => a.status !== '취소').forEach(a => {
      const existing = evals.find(e => e.assignment_id === a.id)
      const staffInfo = staffList.find(s => s.id === a.staff_id)
      newEvalMap[a.id] = {
        attendance_score: existing?.attendance_score ?? 3,
        performance_score: existing?.performance_score ?? 3,
        appearance_score: existing?.appearance_score ?? 3,
        teamwork_score: existing?.teamwork_score ?? 3,
        adaptability_score: existing?.adaptability_score ?? 3,
        re_recommend: existing?.re_recommend ?? true,
        strengths: existing?.strengths || '',
        improvements: existing?.improvements || '',
        height: staffInfo?.height ? String(staffInfo.height) : '',
        weight: staffInfo?.weight ? String(staffInfo.weight) : '',
        mbti: staffInfo?.mbti || '',
        dirty: false,
      }
    })
    setEvalMap(newEvalMap)
    setLoadingDetail(false)
  }, [])

  useEffect(() => {
    if (selectedInq) loadDetail(selectedInq)
  }, [selectedInq, loadDetail])

  // 날짜 탭 전환 → 해당 날짜 출석 데이터로 editMap 재구성
  function handleDateTabChange(date: string) {
    if (date === selectedDate) return
    setSelectedDate(date)
    setEditMap(buildEditMap(assignments, attendances, date))
  }

  // 출석 상태 변경 (로컬 상태만)
  function handleStatusToggle(assignId: string, status: AttendanceStatus) {
    setEditMap(prev => ({
      ...prev,
      [assignId]: {
        ...prev[assignId],
        status: prev[assignId]?.status === status ? null : status,
        dirty: true,
      },
    }))
  }

  function handleClockIn(assignId: string, value: string) {
    setEditMap(prev => ({ ...prev, [assignId]: { ...prev[assignId], clockIn: value, dirty: true } }))
  }

  function handleNotes(assignId: string, value: string) {
    setEditMap(prev => ({ ...prev, [assignId]: { ...prev[assignId], notes: value, dirty: true } }))
  }

  // 출석 일괄 저장
  async function handleSaveAttendance() {
    if (!selectedInq) return

    // 상태 미선택 인원 수 파악
    const allDirty = Object.entries(editMap).filter(([, v]) => v.dirty)
    const dirtyEntries = allDirty.filter(([, v]) => v.status)
    const skipped = allDirty.length - dirtyEntries.length

    if (!allDirty.length) { toast.info('변경된 출석 정보가 없습니다.'); return }
    if (!dirtyEntries.length) { toast.warning('출석 상태를 선택한 인원이 없습니다.'); return }

    let saved = 0
    const errors: string[] = []

    for (const [assignId, data] of dirtyEntries) {
      if (!data.status) continue
      const asgn = assignments.find(a => a.id === assignId)
      if (!asgn) continue

      const targetDate = selectedDate || selectedInq.event_start || new Date().toISOString().slice(0, 10)
      const existing = attendances.find(a => a.assignment_id === assignId && a.work_date === targetDate)
      const payload = {
        assignment_id: assignId,
        inquiry_id: selectedInq.id,
        staff_name: asgn.staff_name || '',
        work_date: targetDate,
        clock_in: data.clockIn || null,
        daily_pay: asgn.pay_rate || 0,
        status: data.status,
        notes: data.notes || null,
      }
      try {
        if (existing) {
          await db.update('attendances', existing.id, payload)
        } else {
          await db.insert('attendances', payload)
        }
        // assignment.is_present 업데이트
        await db.update('assignments', assignId, {
          is_present: data.status !== '결근',
        })
        saved++
      } catch (e) {
        errors.push(`${asgn.staff_name}: ${(e as Error).message}`)
      }
    }

    // 결과 알림
    if (errors.length > 0) {
      toast.error(`저장 실패 ${errors.length}건\n${errors.slice(0, 3).join('\n')}`)
    }
    if (saved > 0) {
      const skipMsg = skipped > 0 ? ` (상태 미선택 ${skipped}명 제외)` : ''
      toast.success(`출석 ${saved}건 저장 완료${skipMsg}`)
    }

    // dirty 플래그만 초기화 (탭 유지)
    setEditMap(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(k => { next[k] = { ...next[k], dirty: false } })
      return next
    })
    // 전체 출석 데이터 새로고침 (탭은 유지)
    const newAtts = await db.list<Attendance>('attendances', {
      filters: { inquiry_id: selectedInq.id },
      order: 'created_at', asc: true,
    })
    setAttendances(newAtts)
  }

  // 전원 출석 처리
  function handleMarkAllPresent() {
    setEditMap(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(k => {
        next[k] = { ...next[k], status: '출석', dirty: true }
      })
      return next
    })
    toast.info('전원 출석으로 설정했습니다. 저장 버튼을 눌러주세요.')
  }

  // 평가 점수 변경
  function handleEvalChange(assignId: string, field: keyof EvalScores, value: number) {
    setEvalMap(prev => ({ ...prev, [assignId]: { ...prev[assignId], [field]: value, dirty: true } }))
  }

  // 평가 저장 (한 명)
  async function handleSaveEval(asgn: Assignment) {
    if (!selectedInq) return
    const data = evalMap[asgn.id]
    if (!data) return

    const scores = [
      data.attendance_score, data.performance_score,
      data.appearance_score, data.teamwork_score, data.adaptability_score,
    ]
    const avgScore = scores.reduce((s, v) => s + v, 0) / scores.length
    const total = Math.round(avgScore * 10) / 10
    const grade = total >= 4 ? '우수' : total >= 2.5 ? '보통' : '미흡'

    const payload = {
      assignment_id: asgn.id,
      staff_id: asgn.staff_id || null,
      staff_name: asgn.staff_name || '',
      site_name: selectedInq.event_name || '',
      attendance_score: data.attendance_score,
      performance_score: data.performance_score,
      appearance_score: data.appearance_score,
      teamwork_score: data.teamwork_score,
      adaptability_score: data.adaptability_score,
      total_score: total,
      grade,
      re_recommend: data.re_recommend,
      strengths: data.strengths || null,
      improvements: data.improvements || null,
      evaluated_at: new Date().toISOString(),
    }

    try {
      const existing = evaluations.find(e => e.assignment_id === asgn.id)
      if (existing) {
        await db.update('evaluations', existing.id, payload)
      } else {
        await db.insert('evaluations', payload)
      }

      // staff 테이블 점수 + 프로필 정보 갱신 (있는 경우)
      if (asgn.staff_id) {
        // 점수 집계
        const staffEvals = await db.list<Evaluation>('evaluations', {
          filters: { staff_id: asgn.staff_id },
          order: 'evaluated_at', asc: true,
        })
        const staffUpdate: Record<string, unknown> = {}
        if (staffEvals.length > 0) {
          const avg = (key: keyof Evaluation) =>
            Math.round(staffEvals.reduce((s, e) => s + (e[key] as number), 0) / staffEvals.length * 10) / 10
          staffUpdate.attendance_score   = avg('attendance_score')
          staffUpdate.performance_score  = avg('performance_score')
          staffUpdate.appearance_score   = avg('appearance_score')
          staffUpdate.teamwork_score     = avg('teamwork_score')
          staffUpdate.adaptability_score = avg('adaptability_score')
          staffUpdate.total_score        = avg('total_score')
        }
        // 키/몸무게/MBTI 저장 (입력된 경우만)
        if (data.height) staffUpdate.height = parseFloat(data.height)
        if (data.weight) staffUpdate.weight = parseFloat(data.weight)
        if (data.mbti)   staffUpdate.mbti   = data.mbti.toUpperCase()

        if (Object.keys(staffUpdate).length > 0) {
          await db.update('staff', asgn.staff_id, staffUpdate)
        }
      }

      setEvalMap(prev => ({ ...prev, [asgn.id]: { ...prev[asgn.id], dirty: false } }))
      toast.success(`${asgn.staff_name} 평가 저장 완료 (${grade} · ${total}점)`)
      loadDetail(selectedInq)
    } catch (e) {
      toast.error('평가 저장 실패: ' + (e as Error).message)
    }
  }

  const filteredInquiries = inquiries.filter(i =>
    !searchText ||
    (i.company_name || '').includes(searchText) ||
    (i.event_name || '').includes(searchText)
  )

  const dirtyCount = Object.values(editMap).filter(v => v.dirty && v.status).length
  const presentCount = Object.values(editMap).filter(v => v.status === '출석').length
  const absentCount = Object.values(editMap).filter(v => v.status === '결근').length
  const lateCount = Object.values(editMap).filter(v => v.status === '지각').length

  return (
    <div className="flex h-full">

      {/* ── 좌 패널: 행사 목록 ── */}
      <div className="w-72 shrink-0 flex flex-col border-r border-gray-200 bg-white">
        <div className="p-3 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="행사명, 업체명 검색..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <p className="text-xs text-gray-400 mt-1.5">배정완료/진행중/완료 {filteredInquiries.length}건</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-20">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
            </div>
          ) : filteredInquiries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm gap-1">
              <AlertCircle className="h-6 w-6 opacity-40" />
              <p>대상 행사가 없습니다</p>
            </div>
          ) : filteredInquiries.map(inq => {
            const isSelected = selectedInq?.id === inq.id
            return (
              <div
                key={inq.id}
                onClick={() => { setSelectedInq(inq); setActiveTab('attendance') }}
                className={`p-3 cursor-pointer border-b border-gray-100 hover:bg-blue-50 transition-colors ${isSelected ? 'bg-blue-50 border-l-[3px] border-l-blue-500' : ''}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{inq.company_name || '-'}</p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{inq.event_name || '-'}</p>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                    inq.status === '진행중' ? 'bg-blue-100 text-blue-700' :
                    inq.status === '완료' ? 'bg-gray-100 text-gray-500' :
                    'bg-green-100 text-green-700'
                  }`}>{inq.status}</span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                  {inq.event_start && (
                    <span className="flex items-center gap-0.5">
                      <CalendarDays className="h-3 w-3" />{formatDate(inq.event_start)}
                    </span>
                  )}
                  {inq.location && (
                    <span className="flex items-center gap-0.5 truncate">
                      <MapPin className="h-3 w-3" />{inq.location.slice(0, 8)}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── 우 패널: 출석부 / 평가 ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        {!selectedInq ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
            <ClipboardList className="h-12 w-12 opacity-20" />
            <p className="text-base">좌측에서 행사를 선택해주세요</p>
            <p className="text-sm text-gray-300">배정완료·진행중·완료 행사만 표시됩니다</p>
          </div>
        ) : (
          <>
            {/* 헤더 */}
            <div className="bg-white border-b border-gray-200 px-5 py-3">
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                <span>{selectedInq.company_name}</span>
                <ChevronRight className="h-3 w-3" />
                <span className="text-gray-700 font-medium">{selectedInq.event_name}</span>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                {selectedInq.event_start && (
                  <span className="flex items-center gap-1 text-sm text-gray-600">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatDate(selectedInq.event_start)}
                    {selectedInq.event_end && selectedInq.event_end !== selectedInq.event_start
                      ? ` ~ ${formatDate(selectedInq.event_end)}` : ''}
                  </span>
                )}
                {selectedInq.location && (
                  <span className="flex items-center gap-1 text-sm text-gray-600">
                    <MapPin className="h-3.5 w-3.5" />{selectedInq.location}
                  </span>
                )}
                {/* 출석 통계 */}
                {activeTab === 'attendance' && assignments.length > 0 && (
                  <div className="ml-auto flex items-center gap-2 text-xs">
                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">출석 {presentCount}</span>
                    <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">지각 {lateCount}</span>
                    <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">결근 {absentCount}</span>
                    <span className="text-gray-400">/ 총 {assignments.length}명</span>
                  </div>
                )}
              </div>
            </div>

            {/* 메인 탭 (출석체크 / 평가입력) */}
            <div className="bg-white border-b border-gray-200 flex">
              <button
                onClick={() => setActiveTab('attendance')}
                className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'attendance' ? 'border-blue-500 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                <CheckCircle2 className="h-4 w-4" />출석 체크
                {dirtyCount > 0 && (
                  <span className="bg-orange-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{dirtyCount}</span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('evaluation')}
                className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'evaluation' ? 'border-purple-500 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                <Award className="h-4 w-4" />평가 입력
              </button>
            </div>

            {/* 날짜 탭 — 다일 행사(2일 이상)일 때만 표시 */}
            {activeTab === 'attendance' && (() => {
              const dates = getDateRange(selectedInq.event_start, selectedInq.event_end)
              if (dates.length <= 1) return null
              return (
                <div className="bg-gray-50 border-b border-gray-200 flex overflow-x-auto">
                  {dates.map(date => {
                    const isActive = date === selectedDate
                    // 해당 날짜에 출석 기록이 있는지 확인 (저장된 데이터)
                    const hasSaved = attendances.some(a => a.work_date === date)
                    return (
                      <button
                        key={date}
                        onClick={() => handleDateTabChange(date)}
                        className={`flex flex-col items-center px-4 py-2 text-xs font-medium border-b-2 shrink-0 transition-colors ${
                          isActive
                            ? 'border-blue-500 text-blue-700 bg-white'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <span>{formatDateTab(date)}</span>
                        {hasSaved && (
                          <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-green-400" title="출석 기록 있음" />
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })()}

            {/* 콘텐츠 */}
            <div className="flex-1 overflow-y-auto p-4">
              {loadingDetail ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                </div>
              ) : assignments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
                  <Users className="h-8 w-8 opacity-30" />
                  <p className="text-sm">배정된 인원이 없습니다</p>
                </div>
              ) : activeTab === 'attendance' ? (
                /* ── 출석 탭 ── */
                <div className="space-y-2">
                  {/* 액션 버튼 */}
                  <div className="flex items-center gap-2 mb-3">
                    <Button size="sm" variant="outline" onClick={handleMarkAllPresent} className="text-xs h-7">
                      <CheckCircle2 className="h-3.5 w-3.5" />전원 출석
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveAttendance}
                      className="text-xs h-7 bg-blue-600 hover:bg-blue-700"
                      disabled={dirtyCount === 0}
                    >
                      <Save className="h-3.5 w-3.5" />저장 ({dirtyCount}건)
                    </Button>
                    <button
                      onClick={() => loadDetail(selectedInq)}
                      className="text-gray-400 hover:text-gray-600 ml-auto"
                      title="새로고침"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  </div>

                  {/* 출석 목록 */}
                  {assignments.map(asgn => {
                    const edit = editMap[asgn.id] || { status: null, clockIn: '', notes: '', dirty: false }
                    return (
                      <div key={asgn.id} className={`bg-white rounded-xl border px-4 py-3 flex flex-col gap-2 shadow-sm ${edit.dirty ? 'border-orange-300' : 'border-gray-200'}`}>
                        <div className="flex items-center gap-3">
                          {/* 아바타 */}
                          <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 text-sm font-bold flex items-center justify-center shrink-0">
                            {asgn.staff_name?.[0] || '?'}
                          </div>
                          {/* 이름 + 직무 */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {asgn.staff_type === '본사' && (
                                <span className="text-purple-600 font-bold text-[10px]">[본사]</span>
                              )}
                              {asgn.role_type === '팀장' && (
                                <span className="text-indigo-600 font-bold text-[10px] bg-indigo-50 px-1 rounded">팀장</span>
                              )}
                              <span className="text-sm font-semibold">{asgn.staff_name}</span>
                              {asgn.job_type && (
                                <span className="text-[11px] text-gray-400">{asgn.job_type}</span>
                              )}
                            </div>
                            {asgn.pay_rate > 0 && (
                              <p className="text-[11px] text-gray-400 mt-0.5">
                                {formatKRW(asgn.pay_rate)} × {asgn.work_days}일
                              </p>
                            )}
                          </div>

                          {/* 상태 버튼 */}
                          <div className="flex gap-1 flex-wrap justify-end">
                            {ALL_STATUSES.map(s => (
                              <button
                                key={s}
                                onClick={() => handleStatusToggle(asgn.id, s)}
                                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${edit.status === s ? STATUS_STYLE[s] : STATUS_IDLE}`}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 출근 시간 + 메모 */}
                        <div className="flex items-center gap-2 pl-12">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 text-gray-300" />
                            <Input
                              type="time"
                              value={edit.clockIn}
                              onChange={e => handleClockIn(asgn.id, e.target.value)}
                              className="h-6 w-24 text-xs px-1 border-gray-200"
                            />
                          </div>
                          {(edit.status === '지각' || edit.status === '결근' || edit.status === '조퇴') && (
                            <Input
                              value={edit.notes}
                              onChange={e => handleNotes(asgn.id, e.target.value)}
                              placeholder="사유 입력..."
                              className="h-6 flex-1 text-xs px-2 border-orange-200 focus:border-orange-400"
                            />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                /* ── 평가 탭 ── */
                <div className="space-y-4">
                  {/* 안내 배너 */}
                  <div className="flex items-start gap-2.5 bg-purple-50 border border-purple-100 rounded-xl px-3.5 py-2.5">
                    <Award className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-purple-700 leading-relaxed">
                      행사 종료 후 인원별 평가를 입력하세요.<br />
                      저장 시 크루 프로필 점수에 <strong>자동 반영</strong>됩니다.
                    </p>
                  </div>

                  {assignments
                    .filter(a => a.staff_type !== '본사')
                    .map(asgn => {
                      const evalData = evalMap[asgn.id]
                      const existing = evaluations.find(e => e.assignment_id === asgn.id)
                      if (!evalData) return null

                      const avgScore = Math.round(
                        (evalData.attendance_score + evalData.performance_score +
                         evalData.appearance_score + evalData.teamwork_score +
                         evalData.adaptability_score) / 5 * 10
                      ) / 10

                      const gradeColor = avgScore >= 4 ? 'text-green-600 bg-green-50 border-green-200'
                        : avgScore >= 2.5 ? 'text-yellow-700 bg-yellow-50 border-yellow-200'
                        : 'text-red-600 bg-red-50 border-red-200'

                      return (
                        <div
                          key={asgn.id}
                          className={`rounded-2xl border shadow-sm overflow-hidden transition-all ${
                            evalData.dirty
                              ? 'border-purple-300 shadow-purple-100'
                              : 'border-gray-200'
                          }`}
                        >
                          {/* 카드 헤더 */}
                          <div className={`flex items-center gap-3 px-4 py-3 ${evalData.dirty ? 'bg-purple-50' : 'bg-gray-50'} border-b border-gray-100`}>
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 text-white text-sm font-bold flex items-center justify-center shrink-0 shadow-sm">
                              {asgn.staff_name?.[0] || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-gray-800">{asgn.staff_name}</span>
                                {asgn.job_type && (
                                  <span className="text-[10px] bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{asgn.job_type}</span>
                                )}
                              </div>
                              {existing && (
                                <span className="text-[10px] text-purple-500">
                                  이전 평가: {existing.total_score}점 ({existing.grade})
                                </span>
                              )}
                            </div>
                            {/* 현재 평균 점수 뱃지 */}
                            <div className={`px-2.5 py-1 rounded-xl border text-sm font-black ${gradeColor}`}>
                              {avgScore.toFixed(1)}
                            </div>
                          </div>

                          {/* 별점 항목들 */}
                          <div className="bg-white px-4 pt-3 pb-2 space-y-3">
                            {EVAL_FIELDS.map(({ key, label, emoji, guide }) => (
                              <div key={key} className="flex items-center gap-2">
                                <div className="flex items-center gap-1 w-24 shrink-0">
                                  <span className="text-base">{emoji}</span>
                                  <span className="text-xs font-medium text-gray-600">{label}</span>
                                  <GuideTooltip guide={guide} />
                                </div>
                                <ScoreInput
                                  value={evalData[key]}
                                  onChange={v => handleEvalChange(asgn.id, key, v)}
                                />
                              </div>
                            ))}
                          </div>

                          {/* 재투입 여부 */}
                          <div className="bg-white px-4 pt-1 pb-3 border-t border-gray-50">
                            <div className="flex items-center gap-3 mb-2.5">
                              <span className="text-xs font-medium text-gray-500 w-24 shrink-0">재투입 추천</span>
                              <div className="flex gap-1.5">
                                {([true, false] as const).map(v => (
                                  <button
                                    key={String(v)}
                                    onClick={() => setEvalMap(prev => ({
                                      ...prev,
                                      [asgn.id]: { ...prev[asgn.id], re_recommend: v, dirty: true }
                                    }))}
                                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                                      evalData.re_recommend === v
                                        ? v
                                          ? 'bg-green-500 text-white shadow-sm'
                                          : 'bg-red-400 text-white shadow-sm'
                                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                    }`}
                                  >
                                    {v ? '✓ 추천' : '✕ 비추천'}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* 장점 / 개선점 */}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] text-gray-400 mb-0.5 block">장점</label>
                                <Input
                                  value={evalData.strengths}
                                  onChange={e => setEvalMap(prev => ({
                                    ...prev,
                                    [asgn.id]: { ...prev[asgn.id], strengths: e.target.value, dirty: true }
                                  }))}
                                  placeholder="예: 시간 엄수, 의사소통 탁월"
                                  className="h-8 text-xs"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-gray-400 mb-0.5 block">개선점</label>
                                <Input
                                  value={evalData.improvements}
                                  onChange={e => setEvalMap(prev => ({
                                    ...prev,
                                    [asgn.id]: { ...prev[asgn.id], improvements: e.target.value, dirty: true }
                                  }))}
                                  placeholder="예: 보고 누락, 장비 미숙"
                                  className="h-8 text-xs"
                                />
                              </div>
                            </div>
                          </div>

                          {/* 크루 프로필 업데이트 (접이식 아님 - 항상 표시) */}
                          <div className="bg-gradient-to-b from-gray-50 to-white px-4 py-3 border-t border-dashed border-gray-200">
                            <p className="text-[10px] text-gray-400 font-medium mb-2 uppercase tracking-wide">크루 프로필 업데이트</p>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="text-[10px] text-gray-400 mb-0.5 block">키 (cm)</label>
                                <Input
                                  value={evalData.height}
                                  onChange={e => setEvalMap(prev => ({
                                    ...prev,
                                    [asgn.id]: { ...prev[asgn.id], height: e.target.value, dirty: true }
                                  }))}
                                  placeholder="170"
                                  type="number"
                                  className="h-8 text-xs text-center"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-gray-400 mb-0.5 block">몸무게 (kg)</label>
                                <Input
                                  value={evalData.weight}
                                  onChange={e => setEvalMap(prev => ({
                                    ...prev,
                                    [asgn.id]: { ...prev[asgn.id], weight: e.target.value, dirty: true }
                                  }))}
                                  placeholder="65"
                                  type="number"
                                  className="h-8 text-xs text-center"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-gray-400 mb-0.5 block">MBTI</label>
                                <Input
                                  value={evalData.mbti}
                                  onChange={e => setEvalMap(prev => ({
                                    ...prev,
                                    [asgn.id]: { ...prev[asgn.id], mbti: e.target.value.toUpperCase(), dirty: true }
                                  }))}
                                  placeholder="ISTJ"
                                  maxLength={4}
                                  className="h-8 text-xs text-center uppercase"
                                />
                              </div>
                            </div>
                          </div>

                          {/* 저장 버튼 */}
                          <div className="px-4 pb-4 pt-2 bg-white">
                            <Button
                              size="sm"
                              onClick={() => handleSaveEval(asgn)}
                              className={`w-full text-xs h-9 rounded-xl font-semibold transition-all ${
                                evalData.dirty
                                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-md'
                                  : 'bg-gray-100 text-gray-400 cursor-default'
                              }`}
                            >
                              <Save className="h-3.5 w-3.5 mr-1.5" />
                              {existing ? '평가 수정 저장' : '평가 저장'}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
