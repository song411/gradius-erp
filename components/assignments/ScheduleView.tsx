'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { Assignment, Inquiry } from '@/lib/supabase/types'
import { db } from '@/lib/supabase/api'
import { toast } from 'sonner'
import { Plus, CalendarDays } from 'lucide-react'

interface SlotGroup {
  jobType: string
  required: number
  payRate: number
  days: number
  assignments: Assignment[]
}

interface Props {
  inquiry: Inquiry
  slots: SlotGroup[]
  onOpenAssign: (date: string, jobType: string, payRate: number) => void
}

// ── 날짜 유틸 ────────────────────────────────────────────
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

// ── 드롭 가능한 셀 ───────────────────────────────────────
function DroppableCell({
  id, children, className,
}: { id: string; children: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <td
      ref={setNodeRef}
      className={`border border-gray-200 px-2 py-1.5 align-top transition-colors ${
        isOver ? 'bg-blue-50 ring-2 ring-inset ring-blue-400' : ''
      } ${className ?? ''}`}
    >
      {children}
    </td>
  )
}

// ── 배정 칩 ──────────────────────────────────────────────
function AssignChip({ asgn, pinned }: { asgn: Assignment; pinned: boolean }) {
  const COLOR: Record<string, string> = {
    확정:   'bg-green-50 text-green-700 border-green-200',
    배정중: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    후보:   'bg-blue-50  text-blue-600  border-blue-200',
  }
  const cls = pinned
    ? (COLOR[asgn.status] ?? 'bg-gray-50 text-gray-500 border-gray-200')
    : 'bg-white text-gray-400 border-dashed border-gray-200'

  return (
    <div className={`flex items-center gap-1 text-[10px] px-1 py-0.5 rounded border mb-0.5 ${cls}`}>
      <span className="w-3.5 h-3.5 rounded-full bg-blue-100 text-blue-700 text-[8px] font-bold flex items-center justify-center shrink-0">
        {asgn.staff_name?.[0] ?? '?'}
      </span>
      <span className="truncate max-w-[76px]">{asgn.staff_name}</span>
      {!pinned && (
        <span className="text-[9px] text-gray-300 ml-auto shrink-0" title="전기간 배정">전</span>
      )}
    </div>
  )
}

// ── 가용성 메모 패널 ─────────────────────────────────────
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
    <div className="w-56 shrink-0 bg-white border border-gray-200 rounded-xl flex flex-col overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between bg-gray-50">
        <h4 className="text-xs font-semibold text-gray-700">가용성 메모</h4>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-blue-500 hover:underline"
          >편집</button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="text-xs text-gray-400">취소</button>
            <button
              onClick={save}
              disabled={saving}
              className="text-xs text-blue-600 font-semibold hover:underline disabled:opacity-50"
            >저장</button>
          </div>
        )}
      </div>

      {/* 본문 */}
      <div className="flex-1 p-3 flex flex-col gap-2 min-h-0">
        <p className="text-[10px] text-gray-400 shrink-0">
          인력별 가용 날짜·특이사항 메모
        </p>
        {editing ? (
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'홍길동: 월·화·수만 가능\n김철수: 토·일만 가능\n박영희: 7/1 이후 가능'}
            className="flex-1 text-xs border border-gray-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-300"
          />
        ) : (
          <div className="flex-1 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed overflow-y-auto">
            {text || <span className="text-gray-300 italic">메모 없음</span>}
          </div>
        )}
      </div>

      {/* 범례 */}
      <div className="px-4 py-3 border-t border-gray-100 space-y-1.5 bg-gray-50 shrink-0">
        <p className="text-[10px] font-semibold text-gray-500 mb-2">범례</p>
        {[
          { dot: 'bg-green-400',  label: '확정' },
          { dot: 'bg-yellow-400', label: '배정중' },
          { dot: 'bg-orange-400', label: '인원 초과' },
        ].map(({ dot, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${dot} shrink-0`} />
            <span className="text-[10px] text-gray-500">{label}</span>
          </div>
        ))}
        <p className="text-[10px] text-gray-400 pt-1 border-t border-gray-100">
          "전" 표시: 날짜 미지정 인력<br />
          인력을 셀로 드래그 → 해당 날짜 배정
        </p>
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────
export default function ScheduleView({ inquiry, slots, onOpenAssign }: Props) {
  const dates = useMemo(() => {
    if (!inquiry.event_start || !inquiry.event_end) return []
    return getDateRange(inquiry.event_start, inquiry.event_end)
  }, [inquiry.event_start, inquiry.event_end])

  // 인력 슬롯만 표시 (취소가 아닌 배정이 있거나 필요 인원이 있는 그룹)
  const activeSlots = slots.filter(
    g => g.required > 0 || g.assignments.some(a => a.status !== '취소')
  )

  if (!inquiry.event_start || !inquiry.event_end) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 gap-2">
        <CalendarDays className="h-5 w-5 opacity-40" />
        <p className="text-sm">행사 날짜가 설정되지 않았습니다</p>
      </div>
    )
  }

  return (
    <div className="flex gap-3 h-full min-h-0">
      {/* ── 매트릭스 테이블 ── */}
      <div className="flex-1 overflow-auto">
        <table className="text-xs border-collapse">
          <colgroup>
            <col style={{ width: 84 }} />
            {activeSlots.map(s => <col key={s.jobType} style={{ width: 148 }} />)}
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="border border-gray-200 bg-gray-100 px-3 py-2 text-left font-semibold text-gray-600 sticky left-0 z-20">
                날짜
              </th>
              {activeSlots.map(slot => (
                <th key={slot.jobType} className="border border-gray-200 bg-gray-100 px-3 py-2 text-center font-semibold text-gray-700">
                  <div>{slot.jobType}</div>
                  {slot.required > 0 && (
                    <div className="text-[10px] text-gray-400 font-normal">필요 {slot.required}명</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dates.map(date => {
              const { md, dow, weekend } = dateLabel(date)
              return (
                <tr key={date}>
                  {/* 날짜 열 */}
                  <td className={`sticky left-0 border border-gray-200 px-2 py-2 font-medium z-10 ${
                    weekend ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-700'
                  }`}>
                    <div className="font-bold">{md}</div>
                    <div className="text-[10px] text-gray-400">{dow}요일</div>
                  </td>

                  {/* 직무별 셀 */}
                  {activeSlots.map(slot => {
                    // 날짜 지정 배정
                    const pinned = slot.assignments.filter(a =>
                      a.status !== '취소' &&
                      Array.isArray(a.work_dates) && a.work_dates.length > 0 &&
                      a.work_dates.includes(date)
                    )
                    // 전기간 배정 (work_dates 미설정)
                    const allPeriod = slot.assignments.filter(a =>
                      a.status !== '취소' &&
                      (!Array.isArray(a.work_dates) || a.work_dates.length === 0)
                    )
                    const total    = pinned.length + allPeriod.length
                    const required = slot.required
                    const isFull   = required > 0 && total >= required
                    const isShort  = required > 0 && total < required
                    const isOver   = required > 0 && total > required
                    const isEmpty  = total === 0
                    const cellId   = `schedule|${date}|${slot.jobType}`

                    return (
                      <DroppableCell
                        key={slot.jobType}
                        id={cellId}
                        className={weekend ? 'bg-amber-50/20' : ''}
                      >
                        {/* 카운트 뱃지 + 추가 버튼 */}
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            isEmpty  ? 'bg-gray-100 text-gray-400' :
                            isOver   ? 'bg-orange-100 text-orange-700' :
                            isFull   ? 'bg-green-100 text-green-700' :
                            isShort  ? 'bg-yellow-100 text-yellow-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {required > 0 ? `${total} / ${required}` : `${total}명`}
                          </span>
                          <button
                            onClick={() => onOpenAssign(date, slot.jobType, slot.payRate)}
                            className="text-gray-300 hover:text-blue-500 p-0.5 rounded hover:bg-blue-50 transition-colors"
                            title={`${md} ${slot.jobType}에 인력 추가`}
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>

                        {/* 날짜 지정 인력 */}
                        {pinned.map(a => (
                          <AssignChip key={a.id} asgn={a} pinned />
                        ))}

                        {/* 전기간 인력 */}
                        {allPeriod.map(a => (
                          <AssignChip key={a.id} asgn={a} pinned={false} />
                        ))}

                        {/* 빈 셀 드롭 힌트 */}
                        {isEmpty && (
                          <div className="text-[10px] text-gray-200 text-center py-1 border-2 border-dashed border-gray-100 rounded mt-0.5">
                            드래그
                          </div>
                        )}
                      </DroppableCell>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── 가용성 메모 패널 ── */}
      <AvailabilityMemoPanel inquiryId={inquiry.id} />
    </div>
  )
}
