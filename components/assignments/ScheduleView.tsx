'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { Assignment, Inquiry, Staff } from '@/lib/supabase/types'
import { db } from '@/lib/supabase/api'
import { toast } from 'sonner'
import { Plus, Edit2, X } from 'lucide-react'
import { Input } from '@/components/ui/input'

// ─── 타입 ─────────────────────────────────────────────────

interface SlotGroup {
  jobType: string
  required: number
  payRate: number
  days: number
  assignments: Assignment[]
}

interface ScheduleConfig {
  customJobs: Array<{ jobType: string; required: number; payRate: number }>
  hiddenJobs: string[]
  requiredOverrides: Record<string, number>
}

interface JobConfig {
  jobType: string
  required: number
  payRate: number
  isCustom: boolean
}

interface Props {
  inquiry: Inquiry
  slots: SlotGroup[]
  allAssignments: Assignment[]
  onOpenAssign: (date: string, jobType: string, payRate: number) => void
  onRemoveFromDate: (assignment: Assignment, date: string) => void
  companyStaff?: Staff[]
  onQuickAssignCompany?: (date: string, jobType: string, payRate: number, staff: Staff) => void
}

// ─── 날짜 유틸 ────────────────────────────────────────────

const DOW = ['일', '월', '화', '수', '목', '금', '토']

function getDateRange(start: string, end: string): string[] {
  const dates: string[] = []
  const d = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  while (d <= e) {
    dates.push(d.toISOString().split('T')[0])
    d.setDate(d.getDate() + 1)
  }
  return dates
}

function dateLabel(d: string) {
  const dt = new Date(d + 'T00:00:00')
  return {
    md: `${dt.getMonth() + 1}/${dt.getDate()}`,
    dow: DOW[dt.getDay()],
    weekend: dt.getDay() === 0 || dt.getDay() === 6,
  }
}

// ─── 드롭 가능한 셀 ───────────────────────────────────────

function DroppableCell({
  id, children, className,
}: { id: string; children: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <td
      ref={setNodeRef}
      className={`border border-gray-100 p-1.5 align-top transition-colors min-w-[88px] w-[88px] ${
        isOver ? 'bg-blue-50 ring-2 ring-inset ring-blue-400' : ''
      } ${className ?? ''}`}
    >
      {children}
    </td>
  )
}

// ─── 인력 칩 ─────────────────────────────────────────────

function StaffChip({
  asgn, pinned, editMode, onRemove,
}: {
  asgn: Assignment
  pinned: boolean
  editMode: boolean
  onRemove: () => void
}) {
  const COLOR: Record<string, string> = {
    확정:   'bg-green-50 text-green-800 border-green-200',
    배정중: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    후보:   'bg-blue-50  text-blue-800  border-blue-200',
  }
  const cls = pinned
    ? (COLOR[asgn.status] ?? 'bg-gray-50 text-gray-600 border-gray-200')
    : 'bg-white text-gray-400 border-dashed border-gray-200'

  return (
    <div className={`group flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded border mb-0.5 ${cls}`}>
      <span className="truncate max-w-[62px]">{asgn.staff_name}</span>
      {!pinned && <span className="text-[9px] text-gray-300 ml-0.5 shrink-0">전</span>}
      {editMode && pinned && (
        <button
          onClick={onRemove}
          className="ml-0.5 text-gray-300 hover:text-red-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          title="이 날짜에서 제거"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  )
}

// ─── 가용성 메모 패널 ─────────────────────────────────────

const MEMO_TAG = '[스케줄_가용성]'
interface MemoRecord { id: string; inquiry_id: string; content: string }

function AvailabilityMemoPanel({ inquiryId }: { inquiryId: string }) {
  const [text, setText]       = useState('')
  const [memoId, setMemoId]   = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving]   = useState(false)

  const load = useCallback(async () => {
    try {
      const all = await db.list<MemoRecord>('project_memos', {
        filters: { inquiry_id: inquiryId },
        order: 'created_at', asc: true,
      })
      const rec = all.find(m => m.content?.startsWith(MEMO_TAG))
      if (rec) {
        setMemoId(rec.id)
        setText(rec.content.slice(MEMO_TAG.length + 1))
      }
    } catch {}
  }, [inquiryId])

  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true)
    const content = `${MEMO_TAG}\n${text}`
    try {
      if (memoId) {
        await db.update('project_memos', memoId, { content })
      } else {
        const recs = await db.insert<MemoRecord>('project_memos', { inquiry_id: inquiryId, content })
        if (recs?.[0]?.id) setMemoId(recs[0].id)
      }
      toast.success('메모 저장 완료')
      setEditing(false)
    } catch {
      toast.error('메모 저장 실패')
    }
    setSaving(false)
  }

  return (
    <div className="w-52 shrink-0 bg-white border border-gray-200 rounded-xl flex flex-col overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between bg-gray-50">
        <h4 className="text-xs font-semibold text-gray-700">가용성 메모</h4>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="text-xs text-blue-500 hover:underline">편집</button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="text-xs text-gray-400">취소</button>
            <button onClick={save} disabled={saving} className="text-xs text-blue-600 font-semibold hover:underline disabled:opacity-50">저장</button>
          </div>
        )}
      </div>
      <div className="flex-1 p-3 flex flex-col gap-2 min-h-0">
        <p className="text-[10px] text-gray-400 shrink-0">인력별 가용 날짜·특이사항</p>
        {editing ? (
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'홍길동: 월·화·수만 가능\n김철수: 토·일만 가능\n박영희: 7/1 이후 가능'}
            className="flex-1 text-xs border border-gray-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-300 min-h-[160px]"
          />
        ) : (
          <div className="flex-1 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed overflow-y-auto">
            {text || <span className="text-gray-300 italic">메모 없음</span>}
          </div>
        )}
      </div>
      <div className="px-4 py-3 border-t border-gray-100 space-y-1.5 bg-gray-50 shrink-0">
        <p className="text-[10px] font-semibold text-gray-500 mb-1.5">범례</p>
        {[
          { dot: 'bg-green-400',  label: '확정' },
          { dot: 'bg-yellow-400', label: '배정중' },
          { dot: 'bg-orange-400', label: '초과' },
        ].map(({ dot, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${dot} shrink-0`} />
            <span className="text-[10px] text-gray-500">{label}</span>
          </div>
        ))}
        <p className="text-[10px] text-gray-400 pt-1 border-t border-gray-100">
          "전" = 전기간 배정<br />
          편집 모드에서 × 클릭 → 해당 날짜 제거
        </p>
      </div>
    </div>
  )
}

// ─── 메인 컴포넌트 ────────────────────────────────────────

const CONFIG_TAG = '[스케줄_설정]'

const DEFAULT_CONFIG: ScheduleConfig = {
  customJobs: [],
  hiddenJobs: [],
  requiredOverrides: {},
}

export default function ScheduleView({
  inquiry, slots, allAssignments, onOpenAssign, onRemoveFromDate,
  companyStaff = [], onQuickAssignCompany,
}: Props) {
  const [editMode, setEditMode]   = useState(false)
  const [config, setConfig]       = useState<ScheduleConfig>(DEFAULT_CONFIG)
  const [configId, setConfigId]   = useState<string | null>(null)
  const [addingJob, setAddingJob] = useState(false)
  const [newJobType, setNewJobType]         = useState('')
  const [newJobRequired, setNewJobRequired] = useState('1')
  const [openQuickCell, setOpenQuickCell]   = useState<string | null>(null)

  const dates = useMemo(() => {
    if (!inquiry.event_start || !inquiry.event_end) return []
    return getDateRange(inquiry.event_start, inquiry.event_end)
  }, [inquiry.event_start, inquiry.event_end])

  // ── 스케줄 설정 로드 ────────────────────────────────────
  const loadConfig = useCallback(async () => {
    try {
      const all = await db.list<MemoRecord>('project_memos', {
        filters: { inquiry_id: inquiry.id },
        order: 'created_at', asc: true,
      })
      const rec = all.find(m => m.content?.startsWith(CONFIG_TAG))
      if (rec) {
        setConfigId(rec.id)
        try {
          const p = JSON.parse(rec.content.slice(CONFIG_TAG.length + 1))
          setConfig({
            customJobs:       p.customJobs       ?? [],
            hiddenJobs:       p.hiddenJobs       ?? [],
            requiredOverrides: p.requiredOverrides ?? {},
          })
        } catch {}
      }
    } catch {}
  }, [inquiry.id])

  useEffect(() => { loadConfig() }, [loadConfig])

  // ── 설정 저장 ────────────────────────────────────────────
  async function persistConfig(next: ScheduleConfig) {
    const content = `${CONFIG_TAG}\n${JSON.stringify(next)}`
    try {
      if (configId) {
        await db.update('project_memos', configId, { content })
      } else {
        const recs = await db.insert<MemoRecord>('project_memos', { inquiry_id: inquiry.id, content })
        if (recs?.[0]?.id) setConfigId(recs[0].id)
      }
    } catch { toast.error('설정 저장 실패') }
  }

  // ── 직무 목록 (견적 + 커스텀, 숨김 제외) ─────────────────
  const jobConfigs: JobConfig[] = useMemo(() => {
    const base: JobConfig[] = slots
      .filter(s => !config.hiddenJobs.includes(s.jobType))
      .map(s => ({
        jobType:  s.jobType,
        required: config.requiredOverrides[s.jobType] ?? s.required,
        payRate:  s.payRate,
        isCustom: false,
      }))
    const custom: JobConfig[] = config.customJobs
      .filter(j => !config.hiddenJobs.includes(j.jobType))
      .map(j => ({ ...j, isCustom: true }))
    return [...base, ...custom]
  }, [slots, config])

  // ── 직무 추가 ────────────────────────────────────────────
  async function addCustomJob() {
    if (!newJobType.trim()) return
    const next: ScheduleConfig = {
      ...config,
      customJobs: [
        ...config.customJobs,
        { jobType: newJobType.trim(), required: Math.max(0, Number(newJobRequired) || 1), payRate: 0 },
      ],
    }
    setConfig(next)
    await persistConfig(next)
    setNewJobType('')
    setNewJobRequired('1')
    setAddingJob(false)
    toast.success(`"${newJobType.trim()}" 직무 추가`)
  }

  // ── 직무 숨기기 ──────────────────────────────────────────
  async function hideJob(jobType: string, isCustom: boolean) {
    const next: ScheduleConfig = isCustom
      ? { ...config, customJobs: config.customJobs.filter(j => j.jobType !== jobType) }
      : { ...config, hiddenJobs: [...config.hiddenJobs, jobType] }
    setConfig(next)
    await persistConfig(next)
  }

  // ── 직무 복원 ────────────────────────────────────────────
  async function restoreJob(jobType: string) {
    const next: ScheduleConfig = {
      ...config,
      hiddenJobs: config.hiddenJobs.filter(j => j !== jobType),
    }
    setConfig(next)
    await persistConfig(next)
  }

  // ── 필요 인원 수정 ────────────────────────────────────────
  async function updateRequired(jobType: string, required: number) {
    const next: ScheduleConfig = {
      ...config,
      requiredOverrides: { ...config.requiredOverrides, [jobType]: Math.max(0, required) },
    }
    setConfig(next)
    await persistConfig(next)
  }

  if (!inquiry.event_start || !inquiry.event_end) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400">
        <p className="text-sm">행사 날짜가 설정되지 않았습니다</p>
      </div>
    )
  }

  return (
    <div className="flex gap-3 h-full min-h-0">
      {/* ── 메인 스케줄 테이블 ── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* 툴바 */}
        <div className="flex items-center justify-between mb-2 shrink-0 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs text-gray-400">{dates.length}일 · {jobConfigs.length}개 직무</p>
            {/* 숨긴 직무 복원 칩 */}
            {editMode && config.hiddenJobs.map(j => (
              <button
                key={j}
                onClick={() => restoreJob(j)}
                className="text-[10px] px-1.5 py-0.5 border border-dashed border-gray-300 text-gray-400 rounded hover:border-blue-400 hover:text-blue-500 transition-colors"
              >
                + {j} 복원
              </button>
            ))}
          </div>
          <button
            onClick={() => setEditMode(v => !v)}
            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
              editMode
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
            }`}
          >
            <Edit2 className="h-3 w-3" />
            {editMode ? '편집 완료' : '편집 모드'}
          </button>
        </div>

        {/* 테이블 */}
        <div className="flex-1 overflow-auto rounded-lg border border-gray-200" onClick={() => setOpenQuickCell(null)}>
          <table className="text-xs border-collapse">
            {/* 날짜 헤더 행 */}
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 bg-gray-100 border border-gray-200 px-3 py-2.5 text-left font-semibold text-gray-600 min-w-[112px] w-[112px]">
                  직무
                </th>
                {dates.map(date => {
                  const { md, dow, weekend } = dateLabel(date)
                  return (
                    <th
                      key={date}
                      className={`border border-gray-200 px-1.5 py-2 text-center min-w-[88px] w-[88px] ${
                        weekend ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      <div className="font-bold text-xs">{md}</div>
                      <div className="text-[10px] text-gray-400 font-normal">{dow}</div>
                    </th>
                  )
                })}
              </tr>
            </thead>

            <tbody>
              {jobConfigs.map(jobCfg => {
                const jobAssignments = allAssignments.filter(
                  a => a.status !== '취소' && a.job_type === jobCfg.jobType
                )

                return (
                  <tr key={jobCfg.jobType} className="hover:bg-gray-50/50">
                    {/* 직무 헤더 셀 */}
                    <td className="sticky left-0 z-10 bg-gray-50 border border-gray-200 px-2.5 py-2 align-top min-w-[112px] w-[112px]">
                      <div className="font-semibold text-gray-700">{jobCfg.jobType}</div>
                      {editMode ? (
                        <div className="flex items-center gap-1 mt-1">
                          <input
                            type="number"
                            value={jobCfg.required}
                            onChange={e => updateRequired(jobCfg.jobType, Number(e.target.value))}
                            className="w-9 text-[10px] border border-gray-200 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-blue-300"
                            min={0}
                          />
                          <span className="text-[10px] text-gray-400">명</span>
                          <button
                            onClick={() => hideJob(jobCfg.jobType, jobCfg.isCustom)}
                            className="ml-auto text-gray-300 hover:text-red-400 transition-colors"
                            title="이 직무 숨기기"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        jobCfg.required > 0 && (
                          <div className="text-[10px] text-gray-400 mt-0.5">필요 {jobCfg.required}명</div>
                        )
                      )}
                    </td>

                    {/* 날짜별 셀 */}
                    {dates.map(date => {
                      const pinned = jobAssignments.filter(
                        a => Array.isArray(a.work_dates) && a.work_dates.length > 0 && a.work_dates.includes(date)
                      )
                      const allPeriod = jobAssignments.filter(
                        a => !Array.isArray(a.work_dates) || a.work_dates.length === 0
                      )
                      const total    = pinned.length + allPeriod.length
                      const required = jobCfg.required
                      const isFull   = required > 0 && total >= required
                      const isShort  = required > 0 && total < required
                      const isOver   = required > 0 && total > required
                      const isEmpty  = total === 0
                      const { weekend } = dateLabel(date)
                      const cellId   = `schedule|${date}|${jobCfg.jobType}`

                      return (
                        <DroppableCell
                          key={date}
                          id={cellId}
                          className={weekend ? 'bg-amber-50/20' : ''}
                        >
                          {/* 카운트 뱃지 + 추가 버튼 */}
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-[10px] font-bold px-1 py-0.5 rounded-full leading-none ${
                              isEmpty  ? 'bg-gray-100 text-gray-400' :
                              isOver   ? 'bg-orange-100 text-orange-700' :
                              isFull   ? 'bg-green-100 text-green-700' :
                              isShort  ? 'bg-yellow-100 text-yellow-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {required > 0 ? `${total}/${required}` : `${total}명`}
                            </span>
                            <div className="relative flex items-center gap-0.5">
                              {companyStaff.length > 0 && onQuickAssignCompany && (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setOpenQuickCell(openQuickCell === cellId ? null : cellId)
                                    }}
                                    className="text-[9px] font-bold leading-none px-0.5 py-0.5 rounded text-purple-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                                    title="본사인원 빠른 배정"
                                  >
                                    B
                                  </button>
                                  {openQuickCell === cellId && (
                                    <div
                                      className="absolute right-0 top-5 z-50 bg-white border border-purple-200 rounded-lg shadow-lg py-1 min-w-[72px]"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      {companyStaff.map(s => (
                                        <button
                                          key={s.id}
                                          onClick={() => {
                                            onQuickAssignCompany(date, jobCfg.jobType, jobCfg.payRate, s)
                                            setOpenQuickCell(null)
                                          }}
                                          className="flex w-full items-center gap-1 px-2 py-1 text-[10px] text-purple-700 hover:bg-purple-50 transition-colors whitespace-nowrap"
                                        >
                                          <span className="font-bold text-[9px] text-purple-400">B</span>
                                          {s.name}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}
                              <button
                                onClick={() => onOpenAssign(date, jobCfg.jobType, jobCfg.payRate)}
                                className="text-gray-300 hover:text-blue-500 p-0.5 rounded hover:bg-blue-50 transition-colors"
                                title="인력 추가"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </div>

                          {/* 날짜 지정 인력 */}
                          {pinned.map(a => (
                            <StaffChip
                              key={a.id}
                              asgn={a}
                              pinned
                              editMode={editMode}
                              onRemove={() => onRemoveFromDate(a, date)}
                            />
                          ))}

                          {/* 전기간 인력 */}
                          {allPeriod.map(a => (
                            <StaffChip
                              key={a.id}
                              asgn={a}
                              pinned={false}
                              editMode={editMode}
                              onRemove={() => {}}
                            />
                          ))}

                          {isEmpty && (
                            <div className="text-[10px] text-gray-200 text-center py-1 border border-dashed border-gray-100 rounded">
                              드래그
                            </div>
                          )}
                        </DroppableCell>
                      )
                    })}
                  </tr>
                )
              })}

              {/* 직무 추가 행 (편집 모드) */}
              {editMode && (
                <tr>
                  <td
                    className="sticky left-0 z-10 bg-gray-50 border border-gray-200 px-2.5 py-2"
                    colSpan={dates.length + 1}
                  >
                    {addingJob ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Input
                          value={newJobType}
                          onChange={e => setNewJobType(e.target.value)}
                          placeholder="직무명 (예: 운전기사)"
                          className="h-7 text-xs w-40"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') addCustomJob()
                            if (e.key === 'Escape') setAddingJob(false)
                          }}
                        />
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            value={newJobRequired}
                            onChange={e => setNewJobRequired(e.target.value)}
                            placeholder="인원"
                            className="h-7 text-xs w-16 text-center"
                            min={1}
                          />
                          <span className="text-xs text-gray-400">명 필요</span>
                        </div>
                        <button
                          onClick={addCustomJob}
                          className="text-xs text-blue-600 font-semibold hover:underline"
                        >추가</button>
                        <button
                          onClick={() => { setAddingJob(false); setNewJobType('') }}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >취소</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingJob(true)}
                        className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 hover:underline"
                      >
                        <Plus className="h-3 w-3" />
                        직무 추가
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 가용성 메모 패널 ── */}
      <AvailabilityMemoPanel inquiryId={inquiry.id} />
    </div>
  )
}
