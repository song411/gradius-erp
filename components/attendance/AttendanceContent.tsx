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
  Clock, XCircle, AlertCircle, ChevronRight, Star,
  ClipboardList, Award, Save, RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'

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

// 평가 항목 정의
const EVAL_FIELDS: { key: keyof EvalScores; label: string }[] = [
  { key: 'attendance_score', label: '출결' },
  { key: 'performance_score', label: '업무수행' },
  { key: 'appearance_score', label: '용모복장' },
  { key: 'teamwork_score', label: '팀워크' },
  { key: 'adaptability_score', label: '적응력' },
]

interface EvalScores {
  attendance_score: number
  performance_score: number
  appearance_score: number
  teamwork_score: number
  adaptability_score: number
}

// 별점 컴포넌트 (0~5, 0.5 단위)
function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          onClick={() => onChange(value === i ? i - 0.5 : i)}
          className="focus:outline-none"
          title={`${i}점`}
        >
          <Star
            className={`h-5 w-5 transition-colors ${
              value >= i ? 'text-yellow-400 fill-yellow-400' :
              value >= i - 0.5 ? 'text-yellow-300 fill-yellow-200' :
              'text-gray-200'
            }`}
          />
        </button>
      ))}
      <span className="text-xs text-gray-500 ml-1">{value.toFixed(1)}</span>
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

  // 출석 편집 상태 (assignmentId → 편집 중인 데이터)
  const [editMap, setEditMap] = useState<Record<string, {
    status: AttendanceStatus | null
    clockIn: string
    notes: string
    dirty: boolean
  }>>({})

  // 평가 편집 상태 (assignmentId → 점수)
  const [evalMap, setEvalMap] = useState<Record<string, EvalScores & {
    re_recommend: boolean
    strengths: string
    improvements: string
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

  // 행사 선택 시 상세 로드
  const loadDetail = useCallback(async (inq: Inquiry) => {
    setLoadingDetail(true)
    setEditMap({})
    setEvalMap({})

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

    setAssignments(asgns.filter(a => a.status !== '취소'))
    setAttendances(atts)
    setEvaluations(evals)

    // 기존 출석 데이터로 editMap 초기화
    const newEditMap: typeof editMap = {}
    asgns.filter(a => a.status !== '취소').forEach(a => {
      const existing = atts.find(at => at.assignment_id === a.id)
      newEditMap[a.id] = {
        status: existing?.status || null,
        clockIn: existing?.clock_in || '',
        notes: existing?.notes || '',
        dirty: false,
      }
    })
    setEditMap(newEditMap)

    // 기존 평가 데이터로 evalMap 초기화
    const newEvalMap: typeof evalMap = {}
    asgns.filter(a => a.status !== '취소').forEach(a => {
      const existing = evals.find(e => e.assignment_id === a.id)
      newEvalMap[a.id] = {
        attendance_score: existing?.attendance_score ?? 3,
        performance_score: existing?.performance_score ?? 3,
        appearance_score: existing?.appearance_score ?? 3,
        teamwork_score: existing?.teamwork_score ?? 3,
        adaptability_score: existing?.adaptability_score ?? 3,
        re_recommend: existing?.re_recommend ?? true,
        strengths: existing?.strengths || '',
        improvements: existing?.improvements || '',
        dirty: false,
      }
    })
    setEvalMap(newEvalMap)
    setLoadingDetail(false)
  }, [])

  useEffect(() => {
    if (selectedInq) loadDetail(selectedInq)
  }, [selectedInq, loadDetail])

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
    const dirtyEntries = Object.entries(editMap).filter(([, v]) => v.dirty && v.status)
    if (!dirtyEntries.length) { toast.info('변경된 출석 정보가 없습니다.'); return }

    let saved = 0
    for (const [assignId, data] of dirtyEntries) {
      if (!data.status) continue
      const asgn = assignments.find(a => a.id === assignId)
      if (!asgn) continue

      const existing = attendances.find(a => a.assignment_id === assignId)
      const payload = {
        assignment_id: assignId,
        inquiry_id: selectedInq.id,
        staff_name: asgn.staff_name || '',
        work_date: selectedInq.event_start || new Date().toISOString().slice(0, 10),
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
      } catch {
        // 개별 실패는 계속 진행
      }
    }
    toast.success(`출석 ${saved}건 저장 완료`)
    setEditMap(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(k => { next[k] = { ...next[k], dirty: false } })
      return next
    })
    loadDetail(selectedInq)
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

      // staff 테이블 점수 갱신 (있는 경우)
      if (asgn.staff_id) {
        const staffEvals = await db.list<Evaluation>('evaluations', {
          filters: { staff_id: asgn.staff_id },
        })
        if (staffEvals.length > 0) {
          const avgAttendance  = staffEvals.reduce((s, e) => s + e.attendance_score, 0) / staffEvals.length
          const avgPerformance = staffEvals.reduce((s, e) => s + e.performance_score, 0) / staffEvals.length
          const avgAppearance  = staffEvals.reduce((s, e) => s + e.appearance_score, 0) / staffEvals.length
          const avgTeamwork    = staffEvals.reduce((s, e) => s + e.teamwork_score, 0) / staffEvals.length
          const avgTotal       = staffEvals.reduce((s, e) => s + e.total_score, 0) / staffEvals.length

          await db.update('staff', asgn.staff_id, {
            attendance_score:  Math.round(avgAttendance * 10) / 10,
            performance_score: Math.round(avgPerformance * 10) / 10,
            appearance_score:  Math.round(avgAppearance * 10) / 10,
            teamwork_score:    Math.round(avgTeamwork * 10) / 10,
            total_score:       Math.round(avgTotal * 10) / 10,
          })
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

            {/* 탭 */}
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
                <div className="space-y-3">
                  <p className="text-xs text-gray-400 mb-3">
                    행사 종료 후 인원별 평가를 입력하세요. 저장 시 크루 프로필 점수에 자동 반영됩니다.
                  </p>
                  {assignments
                    .filter(a => a.staff_type !== '본사')
                    .map(asgn => {
                      const evalData = evalMap[asgn.id]
                      const existing = evaluations.find(e => e.assignment_id === asgn.id)
                      if (!evalData) return null
                      const avgScore = (
                        evalData.attendance_score + evalData.performance_score +
                        evalData.appearance_score + evalData.teamwork_score +
                        evalData.adaptability_score
                      ) / 5

                      return (
                        <div key={asgn.id} className={`bg-white rounded-xl border shadow-sm ${evalData.dirty ? 'border-purple-300' : 'border-gray-200'}`}>
                          {/* 카드 헤더 */}
                          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                            <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 text-sm font-bold flex items-center justify-center shrink-0">
                              {asgn.staff_name?.[0] || '?'}
                            </div>
                            <div className="flex-1">
                              <span className="text-sm font-semibold">{asgn.staff_name}</span>
                              {asgn.job_type && <span className="text-xs text-gray-400 ml-1.5">{asgn.job_type}</span>}
                            </div>
                            {existing && (
                              <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                                기존: {existing.total_score}점 ({existing.grade})
                              </span>
                            )}
                            <span className="text-sm font-bold text-purple-700">
                              {avgScore.toFixed(1)}점
                            </span>
                          </div>

                          {/* 평가 항목 */}
                          <div className="px-4 py-3 space-y-2">
                            {EVAL_FIELDS.map(({ key, label }) => (
                              <div key={key} className="flex items-center gap-3">
                                <span className="text-xs text-gray-500 w-14 shrink-0">{label}</span>
                                <StarRating
                                  value={evalData[key]}
                                  onChange={v => handleEvalChange(asgn.id, key, v)}
                                />
                              </div>
                            ))}
                          </div>

                          {/* 재투입 + 장단점 */}
                          <div className="px-4 pb-3 space-y-2">
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-gray-500 w-14 shrink-0">재투입</span>
                              <div className="flex gap-2">
                                {[true, false].map(v => (
                                  <button
                                    key={String(v)}
                                    onClick={() => setEvalMap(prev => ({ ...prev, [asgn.id]: { ...prev[asgn.id], re_recommend: v, dirty: true } }))}
                                    className={`px-3 py-0.5 rounded-full text-xs font-medium transition-colors ${evalData.re_recommend === v
                                      ? v ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                                      : 'bg-gray-100 text-gray-500'
                                    }`}
                                  >
                                    {v ? '추천' : '비추천'}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                value={evalData.strengths}
                                onChange={e => setEvalMap(prev => ({ ...prev, [asgn.id]: { ...prev[asgn.id], strengths: e.target.value, dirty: true } }))}
                                placeholder="장점 (선택)"
                                className="h-7 text-xs"
                              />
                              <Input
                                value={evalData.improvements}
                                onChange={e => setEvalMap(prev => ({ ...prev, [asgn.id]: { ...prev[asgn.id], improvements: e.target.value, dirty: true } }))}
                                placeholder="개선점 (선택)"
                                className="h-7 text-xs"
                              />
                            </div>
                          </div>

                          {/* 저장 버튼 */}
                          <div className="px-4 pb-3">
                            <Button
                              size="sm"
                              onClick={() => handleSaveEval(asgn)}
                              className={`w-full text-xs h-7 ${evalData.dirty ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-400'}`}
                            >
                              <Save className="h-3.5 w-3.5" />
                              {existing ? '평가 수정' : '평가 저장'}
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
