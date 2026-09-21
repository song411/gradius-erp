'use client'

// 주간 뷰
// ─────────────────────────────────────────────────────────
// 월 달력은 칸이 좁아 레이어를 몇 개만 켜도 답답해진다. 주간은 칸이 7배 넓으므로
// 월 달력이 끝내 못 보여주는 것을 보여준다 — 그 날 어느 직무에 누가 들어가는지.
//
// 월 달력의 막대는 '행사 × 구간' 단위라 여러 날 걸친 행사의 크루가 날마다 다르면
// 이름을 적지 못하고 '날짜별 다름'으로 접어야 했다. 주간 뷰는 날짜 단위로 그리므로
// 그 제약이 없다. 대신 기간이 안 보이니 위에 띠로 기간을 함께 깐다.

import { useMemo } from 'react'
import { AlertTriangle, StickyNote, MapPin, Clock, Plus } from 'lucide-react'
import type { Inquiry } from '@/lib/supabase/types'
import {
  cleanStaffName, makeCell, coversDate, fmt, jobMoney,
  cellState, daySignature, STATE_STYLE, STATUS_CHIP,
} from './matrixCore'
import { md, dowOf, weekOf, type GridDay } from './dateUtils'
import type { EventBase, ScheduleData } from './useScheduleData'
import type { LayerKey, ViewPrefs } from './viewPrefs'
import { colorOf, type CalendarNotesApi } from './useCalendarNotes'

// 월 뷰와 같은 상태색을 쓴다 — 화면을 옮겨도 같은 색이 같은 뜻이어야 한다
const TONE: Record<string, string> = {
  체결:     'border-indigo-300  bg-indigo-50/60',
  배정완료: 'border-cyan-300    bg-cyan-50/60',
  진행중:   'border-amber-300   bg-amber-50/60',
  완료:     'border-green-300   bg-green-50/60',
  정산완료: 'border-emerald-300 bg-emerald-50/60',
}
const TONE_FALLBACK = 'border-gray-300 bg-gray-50/60'

interface Props {
  anchor: string            // 이 날짜가 속한 주를 그린다
  data: ScheduleData
  prefs: ViewPrefs
  events: EventBase[]
  today: string
  onOpenDetail: (inq: Inquiry) => void
  /** 날짜 칸에 직접 쓰는 메모 */
  notes: CalendarNotesApi
  onOpenDay: (date: string) => void
}

export default function CalendarWeekView({
  anchor, data, prefs, events, today, onOpenDetail, notes, onOpenDay,
}: Props) {
  const has = (k: LayerKey) => prefs.layers.includes(k)
  const week = useMemo(() => weekOf(anchor), [anchor])

  // 이 주 내내(7일 전부) 이어지면서 편성도 매일 같은 행사는 날짜 칸에서 빼고
  // 위에 띠 한 줄로 올린다. 그대로 두면 똑같은 카드가 7번 반복되어
  // 정작 그 주에 새로 생긴 일들을 덮어버린다. (장기 상주 행사가 대부분 여기 해당)
  // 편성이 하루라도 달라지면 그 변화가 핵심이므로 날짜 칸에 그대로 남긴다.
  const { standing, perDay } = useMemo(() => {
    const standing: EventBase[] = []
    const perDay: EventBase[] = []
    events.forEach(ev => {
      const coversAll = week.every(d => coversDate(ev.inq, d.date))
      const sameAllWeek = coversAll
        && new Set(week.map(d => daySignature(ev.jobs, d.date))).size === 1
      ;(sameAllWeek ? standing : perDay).push(ev)
    })
    return { standing, perDay }
  }, [events, week])

  return (
    <div className="rounded-xl border-2 border-gray-300 bg-white overflow-hidden">
      {/* 이 주 내내 같은 편성으로 도는 행사 */}
      {standing.length > 0 && (
        <div className="border-b-2 border-gray-300 bg-slate-50/70 px-2 py-1.5 space-y-1">
          <div className="text-2xs font-bold text-gray-600 tracking-wide">
            이 주 내내 · 편성 동일
          </div>
          {standing.map(ev => (
            <StandingBar
              key={ev.inq.id}
              ev={ev}
              date={week[0].date}
              has={has}
              onOpenDetail={onOpenDetail}
            />
          ))}
        </div>
      )}

      <div className="grid grid-cols-7">
        {week.map((d, i) => (
          <DayColumn
            key={d.date}
            day={d}
            col={i}
            events={perDay}
            conflictDates={data.conflictDates}
            isToday={d.date === today}
            has={has}
            onOpenDetail={onOpenDetail}
            notes={notes}
            onOpenDay={onOpenDay}
          />
        ))}
      </div>
    </div>
  )
}

// ─── 주 내내 같은 편성인 행사 (한 줄 요약) ────────────────
function StandingBar({
  ev, date, has, onOpenDetail,
}: {
  ev: EventBase
  date: string
  has: (k: LayerKey) => boolean
  onOpenDetail: (inq: Inquiry) => void
}) {
  const inq = ev.inq
  const rows = useMemo(() => ev.jobs.map(job => {
    const cell = makeCell(job, date)
    return { job, cell, state: cellState(cell.total, job.required) }
  }).filter(r => r.job.required > 0 || r.cell.total > 0), [ev.jobs, date])

  const short = rows.filter(r => r.state === 'none' || r.state === 'short').length
  const tone = TONE[inq.status] ?? TONE_FALLBACK

  return (
    <button
      type="button"
      onClick={() => onOpenDetail(inq)}
      title={`${inq.event_name || '(무제)'} · 이 주 7일 내내 같은 인원으로 돌아갑니다\n클릭하면 상세가 열립니다`}
      className={`w-full text-left rounded-lg border px-2 py-1 ${tone}
        ${short > 0 && has('warn') ? 'border-l-4 border-l-red-400' : ''}
        hover:brightness-95 transition`}
    >
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <span className="text-xs font-bold text-gray-900 truncate max-w-[220px]">
          {inq.event_name || inq.company_name || '(무제)'}
        </span>
        <span className="text-2xs text-gray-600 tabular-nums shrink-0">
          {inq.event_start?.substring(5, 10)}
          {inq.event_end && inq.event_end !== inq.event_start
            ? `–${inq.event_end.substring(5, 10)}` : ''}
        </span>
        {has('site') && inq.location && (
          <span className="text-2xs text-gray-500 inline-flex items-center gap-0.5 shrink-0">
            <MapPin className="h-2.5 w-2.5" />{inq.location}
          </span>
        )}
        {has('memo') && ev.memoCount > 0 && <StickyNote className="h-3 w-3 text-amber-500 shrink-0" />}

        {/* 직무별 현황을 가로로 늘어놓는다 — 한 줄이므로 세로로 쌓지 않는다 */}
        {has('staffing') && (
          <span className="ml-auto flex items-center gap-1 flex-wrap justify-end">
            {rows.map(({ job, cell, state }) => (
              <span
                key={job.jobType}
                className={`text-2xs px-1 py-px rounded border whitespace-nowrap ${STATE_STYLE[state].chip}`}
                title={`${job.label} — ${STATE_STYLE[state].label(cell.total, job.required)}`}
              >
                {job.label} {cell.total}/{job.required || '-'}
              </span>
            ))}
          </span>
        )}
      </div>
    </button>
  )
}

// ─── 하루 ─────────────────────────────────────────────────
function DayColumn({
  day, col, events, conflictDates, isToday, has, onOpenDetail, notes, onOpenDay,
}: {
  day: GridDay
  col: number
  events: EventBase[]
  conflictDates: Set<string>
  isToday: boolean
  has: (k: LayerKey) => boolean
  onOpenDetail: (inq: Inquiry) => void
  notes: CalendarNotesApi
  onOpenDay: (date: string) => void
}) {
  const date = day.date
  // 이 날에 걸친 행사만. 시작일이 빠른 순으로 둬야 여러 날 행사가 위에 온다.
  const todays = useMemo(
    () => events
      .filter(ev => coversDate(ev.inq, date))
      .sort((a, b) =>
        (a.inq.event_start ?? '').localeCompare(b.inq.event_start ?? '') ||
        (a.inq.event_name ?? '').localeCompare(b.inq.event_name ?? '')),
    [events, date],
  )

  const conflict = has('warn') && conflictDates.has(date)
  const weekend  = col === 0 || col === 6

  return (
    <div
      className={`border-l border-gray-300 first:border-l-0 min-h-[400px] flex flex-col
        ${weekend ? 'bg-slate-50/40' : ''}
        ${conflict ? 'bg-red-50/40' : ''}
        ${isToday ? 'ring-2 ring-inset ring-blue-400' : ''}`}
    >
      {/* 날짜 머리 */}
      <div
        className={`sticky top-0 z-10 px-2 py-1.5 border-b-2 border-gray-300 backdrop-blur
          flex items-center gap-1.5 ${isToday ? 'bg-blue-600/95' : 'bg-white/95'}`}
      >
        <span
          className={`text-sm font-extrabold tabular-nums
            ${isToday ? 'text-white'
              : col === 0 ? 'text-red-500'
              : col === 6 ? 'text-blue-500' : 'text-gray-800'}`}
        >
          {md(date)}
        </span>
        <span className={`text-xs font-medium ${isToday ? 'text-blue-100' : 'text-gray-600'}`}>
          {dowOf(date)}
        </span>
        {conflict && <AlertTriangle className="h-3.5 w-3.5 text-red-500 ml-auto" />}
        <button
          type="button"
          onClick={() => onOpenDay(date)}
          title="이 날에 메모 쓰기"
          className={`ml-auto shrink-0 transition
            ${isToday ? 'text-blue-100 hover:text-white' : 'text-gray-500 hover:text-blue-600'}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 날짜 메모 — 행사보다 위에 둔다. 행사가 없는 날에도 보여야 한다 */}
      {(notes.byDate.get(date) ?? []).length > 0 && (
        <div className="px-1.5 pt-1.5 space-y-1">
          {(notes.byDate.get(date) ?? []).map(n => (
            <button
              key={n.id}
              type="button"
              onClick={() => onOpenDay(date)}
              title={`${n.content}${n.author ? ` — ${n.author}` : ''}`}
              className={`w-full text-left text-2xs leading-tight px-1.5 py-1 rounded border
                hover:brightness-95 transition ${colorOf(n.color).chip}`}
            >
              <span className="line-clamp-2 whitespace-pre-wrap break-words">{n.content}</span>
            </button>
          ))}
        </div>
      )}

      {/* 그 날의 행사들 */}
      <div className="flex-1 p-1.5 space-y-1.5">
        {todays.length === 0 ? (
          <p className="text-xs text-gray-400 text-center pt-4">-</p>
        ) : (
          todays.map(ev => (
            <DayEventCard
              key={ev.inq.id}
              ev={ev}
              date={date}
              has={has}
              onOpenDetail={onOpenDetail}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ─── 하루 × 행사 카드 ─────────────────────────────────────
function DayEventCard({
  ev, date, has, onOpenDetail,
}: {
  ev: EventBase
  date: string
  has: (k: LayerKey) => boolean
  onOpenDetail: (inq: Inquiry) => void
}) {
  const inq = ev.inq
  const start = inq.event_start?.substring(0, 10) ?? date
  const end   = inq.event_end?.substring(0, 10) || start
  const multi = end > start

  // 이 날짜 기준 직무별 셀 — 여기가 주간 뷰의 존재 이유다.
  // 필요 인원이 0이고 배정도 없는 직무는 그 날 안 쓰는 직무이므로 감춘다.
  const rows = useMemo(() => ev.jobs.map(job => {
    const cell = makeCell(job, date)
    return { job, cell, state: cellState(cell.total, job.required) }
  }).filter(r => r.job.required > 0 || r.cell.total > 0), [ev.jobs, date])

  const money = useMemo(
    () => (has('money') ? ev.jobs.reduce((s, j) => s + jobMoney(j).billTotal, 0) : 0),
    [ev.jobs, has],
  )

  const shortJobs = rows.filter(r => r.state === 'none' || r.state === 'short').length
  const tone = TONE[inq.status] ?? TONE_FALLBACK

  return (
    <div className={`rounded-lg border ${tone} ${shortJobs > 0 && has('warn') ? 'border-l-4 border-l-red-400' : ''}`}>
      {/* 머리 — 행사명 (클릭하면 상세) */}
      <button
        type="button"
        onClick={() => onOpenDetail(inq)}
        className="w-full text-left px-2 pt-1.5 pb-1 min-w-0 hover:brightness-95 transition"
        title={`${inq.event_name || '(무제)'}\n클릭하면 상세가 열립니다`}
      >
        <div className="flex items-start gap-1 min-w-0">
          <span className="text-xs font-bold leading-tight text-gray-900 truncate min-w-0">
            {inq.event_name || inq.company_name || '(무제)'}
          </span>
          {has('memo') && ev.memoCount > 0 && (
            <StickyNote className="h-3 w-3 text-amber-500 shrink-0 mt-px" />
          )}
        </div>


        {/* 여러 날 행사는 전체 기간을 적어준다 — 주간 뷰는 기간이 안 보이므로 */}
        {multi && (
          <div className="text-2xs text-gray-500 tabular-nums mt-0.5">
            {md(start)}–{md(end)} 중
          </div>
        )}

        {has('company') && inq.company_name && (
          <div className="text-2xs text-gray-600 truncate mt-0.5">{inq.company_name}</div>
        )}

        {(has('site') || has('money')) && (
          <div className="flex flex-wrap items-center gap-x-1.5 text-2xs text-gray-600 mt-0.5">
            {has('site') && inq.event_time && (
              <span className="inline-flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />{inq.event_time}
              </span>
            )}
            {has('site') && inq.location && (
              <span className="inline-flex items-center gap-0.5 truncate min-w-0">
                <MapPin className="h-2.5 w-2.5 shrink-0" />{inq.location}
              </span>
            )}
            {has('money') && money > 0 && (
              <span className="tabular-nums font-semibold text-gray-800">{fmt(money)}</span>
            )}
          </div>
        )}

        {has('onsite') && (inq.attire || inq.meal || inq.parking) && (
          <div className="text-2xs text-gray-600 truncate mt-0.5">
            {[inq.attire, inq.meal, inq.parking].filter(Boolean).join(' · ')}
          </div>
        )}
      </button>

      {/* 직무별 배정 — 그 날짜 기준 */}
      {has('staffing') && rows.length > 0 && (
        <div className="px-2 pb-1.5 space-y-1">
          {rows.map(({ job, cell, state }) => {
            const sty = STATE_STYLE[state]
            return (
              <div key={job.jobType} className="border-t border-black/10 pt-1">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-2xs font-semibold text-gray-800 truncate min-w-0">
                    {job.label}
                  </span>
                  <span
                    className={`ml-auto shrink-0 text-2xs font-bold px-1 py-px rounded border ${sty.chip}`}
                    title={sty.label(cell.total, job.required)}
                  >
                    {cell.total}/{job.required || '-'}
                  </span>
                </div>

                {/* 크루 이름 — 주간 뷰는 날짜 단위라 정확히 그 날 사람만 나온다.
                    근무일을 지정한 사람과 '전 일정'으로 자동으로 뜬 사람을 구분한다 —
                    안 그러면 9/25 칸의 4명이 그 날 확정된 건지 퍼져 보이는 건지 알 수 없다.
                    점선 표기는 표 뷰(ScheduleMatrixContent)와 같은 것을 쓴다. */}
                {has('crew') && cell.total > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                    {[
                      ...cell.pinned.map(a => ({ a, whole: false })),
                      ...cell.allPeriod.map(a => ({ a, whole: true })),
                    ].map(({ a, whole }) => (
                      <span
                        key={a.id}
                        className={`text-2xs leading-none px-1 py-0.5 rounded border
                          ${whole
                            ? 'bg-white text-gray-500 border-dashed border-gray-400'
                            : (STATUS_CHIP[a.status] ?? 'bg-white text-gray-700 border-gray-300')}`}
                        title={[
                          cleanStaffName(a.staff_name), a.status,
                          whole ? '전체기간 투입(날짜 미지정)' : null,
                          a.role_type ?? null,
                          `지급 ${fmt(a.pay_rate)}원`,
                          a.is_payable === false ? '무급' : null,
                          a.phone ?? null,
                        ].filter(Boolean).join(' · ')}
                      >
                        {a.role_type === '팀장' && <span className="text-indigo-600 font-bold">팀</span>}
                        {cleanStaffName(a.staff_name)}
                        {a.is_payable === false && <span className="text-purple-500">무</span>}
                      </span>
                    ))}
                  </div>
                )}

                {has('warn') && (state === 'none' || state === 'short') && (
                  <div className="text-2xs text-red-600 font-semibold mt-0.5">
                    {sty.label(cell.total, job.required)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
