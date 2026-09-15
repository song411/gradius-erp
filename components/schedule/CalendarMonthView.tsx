'use client'

// 월 달력 뷰
// ─────────────────────────────────────────────────────────
// 표와 같은 데이터를 "날짜 위에" 올려 보여준다.
// 핵심은 두 가지:
//  1) 여러 날 걸친 행사는 날짜마다 따로 찍지 않고 한 줄 막대로 이어 그린다.
//     (9/2~9/5 행사가 네 칸에 각각 나오면 기간이 읽히지 않는다)
//  2) 막대에 얹을 정보는 사람마다 다르므로 레이어로 고르게 한다.

import { useMemo } from 'react'
import { AlertTriangle, StickyNote, MapPin, Clock, Users } from 'lucide-react'
import type { Inquiry } from '@/lib/supabase/types'
import {
  cleanStaffName, makeCell, coversDate, fmt, jobMoney,
} from './matrixCore'
import { monthGrid, type GridDay } from './dateUtils'
import type { EventBase, ScheduleData } from './useScheduleData'
import {
  DENSITY_MIN_H, type Density, type LayerKey, type ViewPrefs,
} from './viewPrefs'

// ─── 행사 막대 색 ─────────────────────────────────────────
// 상태별로 색을 나눠 "지금 어느 단계인지"가 색만으로 읽히게 한다.
const BAR_TONE: Record<string, { bar: string; dot: string }> = {
  체결:     { bar: 'bg-indigo-50  border-indigo-300  text-indigo-900',  dot: 'bg-indigo-400' },
  배정완료: { bar: 'bg-cyan-50    border-cyan-300    text-cyan-900',    dot: 'bg-cyan-400' },
  진행중:   { bar: 'bg-amber-50   border-amber-300   text-amber-900',   dot: 'bg-amber-400' },
  완료:     { bar: 'bg-green-50   border-green-300   text-green-900',   dot: 'bg-green-400' },
  정산완료: { bar: 'bg-emerald-50 border-emerald-300 text-emerald-900', dot: 'bg-emerald-400' },
}
const BAR_FALLBACK = { bar: 'bg-gray-50 border-gray-300 text-gray-800', dot: 'bg-gray-400' }

/** 밀도별로 한 주에 몇 줄까지 막대를 펼칠지. 넘치면 '+N건'으로 접는다. */
const MAX_LANES: Record<Density, number> = { compact: 3, normal: 5, detail: 99 }

// ─── 구간 통계 ────────────────────────────────────────────
/** 막대 한 개(= 행사의 그 주 구간)에 대한 집계.
 *  구간 안에서 값이 날짜마다 다르면 범위로 보여준다 — 하나만 찍으면 거짓말이 된다. */
interface SegStat {
  reqMin: number; reqMax: number
  filMin: number; filMax: number
  gapDays: number          // 필요보다 사람이 적은 날 수
  conflictDays: number     // 중복배정이 있는 날 수
  crew: string[]           // 구간 내내 동일하면 이름 목록, 아니면 빈 배열
  crewVaries: boolean
  crewCount: number        // 구간에 한 번이라도 등장한 크루 수
}

function segStat(ev: EventBase, dates: string[], conflictDates: Set<string>): SegStat {
  let reqMin = Infinity, reqMax = 0, filMin = Infinity, filMax = 0
  let gapDays = 0, conflictDays = 0
  const perDay: string[] = []
  const all = new Set<string>()

  dates.forEach(d => {
    let req = 0, fil = 0
    const names: string[] = []
    ev.jobs.forEach(job => {
      req += job.required
      const c = makeCell(job, d)
      fil += c.total
      ;[...c.pinned, ...c.allPeriod].forEach(a => {
        const n = cleanStaffName(a.staff_name)
        if (n !== '(미상)') { names.push(n); all.add(n) }
      })
    })
    reqMin = Math.min(reqMin, req); reqMax = Math.max(reqMax, req)
    filMin = Math.min(filMin, fil); filMax = Math.max(filMax, fil)
    if (req > 0 && fil < req) gapDays++
    if (conflictDates.has(d)) conflictDays++
    perDay.push([...new Set(names)].sort().join('|'))
  })

  const crewVaries = new Set(perDay).size > 1
  return {
    reqMin: reqMin === Infinity ? 0 : reqMin, reqMax,
    filMin: filMin === Infinity ? 0 : filMin, filMax,
    gapDays, conflictDays,
    crew: crewVaries ? [] : (perDay[0] ? perDay[0].split('|') : []),
    crewVaries,
    crewCount: all.size,
  }
}

/** 3 또는 2~4 형태로. 최소·최대가 같으면 하나만. */
const range = (lo: number, hi: number) => (lo === hi ? `${lo}` : `${lo}~${hi}`)

// ─── 막대 배치 ────────────────────────────────────────────
interface Segment {
  ev: EventBase
  c0: number            // 주 안에서의 시작 열 (0~6)
  c1: number            // 끝 열 (0~6, 포함)
  dates: string[]
  openLeft: boolean     // 지난 주에서 이어짐
  openRight: boolean    // 다음 주로 이어짐
}

/** 한 주에 들어갈 막대를 겹치지 않게 줄(lane)에 배치한다.
 *  같은 행사는 주가 바뀌어도 되도록 같은 줄에 오도록 시작일 순으로 정렬해 채운다. */
function packLanes(segs: Segment[]): Segment[][] {
  const sorted = [...segs].sort((a, b) =>
    a.c0 - b.c0 ||
    (b.c1 - b.c0) - (a.c1 - a.c0) ||
    (a.ev.inq.event_start ?? '').localeCompare(b.ev.inq.event_start ?? '') ||
    (a.ev.inq.event_name ?? '').localeCompare(b.ev.inq.event_name ?? ''),
  )
  const lanes: Segment[][] = []
  sorted.forEach(seg => {
    let lane = lanes.find(l => l.every(s => s.c1 < seg.c0 || s.c0 > seg.c1))
    if (!lane) { lane = []; lanes.push(lane) }
    lane.push(seg)
  })
  return lanes
}

// ═════════════════════════════════════════════════════════
interface Props {
  year: number
  month: number
  data: ScheduleData
  prefs: ViewPrefs
  /** 검색·미충족 필터를 통과한 행사만 그린다 */
  events: EventBase[]
  today: string
  onOpenDetail: (inq: Inquiry) => void
}

export default function CalendarMonthView({
  year, month, data, prefs, events, today, onOpenDetail,
}: Props) {
  const { conflictDates } = data
  const has = (k: LayerKey) => prefs.layers.includes(k)
  const weeks = useMemo(() => monthGrid(year, month), [year, month])
  const minH = DENSITY_MIN_H[prefs.density]
  const maxLanes = MAX_LANES[prefs.density]

  return (
    <div className="rounded-xl border-2 border-gray-200 bg-white overflow-hidden">
      {/* ── 요일 머리 ── */}
      <div className="grid grid-cols-7 border-b-2 border-gray-300 bg-gray-100">
        {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
          <div
            key={d}
            className={`text-center text-[11px] font-bold py-1.5 tracking-wide
              ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-600'}`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* ── 주 단위 ── */}
      {weeks.map((week, wi) => (
        <WeekRow
          key={week[0].date}
          week={week}
          isLast={wi === weeks.length - 1}
          events={events}
          conflictDates={conflictDates}
          today={today}
          minH={minH}
          maxLanes={maxLanes}
          density={prefs.density}
          has={has}
          onOpenDetail={onOpenDetail}
        />
      ))}
    </div>
  )
}

// ─── 한 주 ────────────────────────────────────────────────
function WeekRow({
  week, isLast, events, conflictDates, today, minH, maxLanes, density, has, onOpenDetail,
}: {
  week: GridDay[]
  isLast: boolean
  events: EventBase[]
  conflictDates: Set<string>
  today: string
  minH: number
  maxLanes: number
  density: Density
  has: (k: LayerKey) => boolean
  onOpenDetail: (inq: Inquiry) => void
}) {
  const from = week[0].date
  const to   = week[6].date

  // 이 주에 걸친 행사를 막대 구간으로 바꾼다
  const segments = useMemo<Segment[]>(() => {
    const out: Segment[] = []
    events.forEach(ev => {
      const s = ev.inq.event_start?.substring(0, 10) ?? ''
      if (!s) return
      const e = ev.inq.event_end?.substring(0, 10) || s
      if (e < from || s > to) return
      const c0 = week.findIndex(d => d.date >= s)
      const c1 = week.reduce((acc, d, i) => (d.date <= e ? i : acc), -1)
      if (c0 < 0 || c1 < 0 || c1 < c0) return
      out.push({
        ev, c0, c1,
        dates: week.slice(c0, c1 + 1).map(d => d.date),
        openLeft:  s < from,
        openRight: e > to,
      })
    })
    return out
  }, [events, week, from, to])

  const lanes    = useMemo(() => packLanes(segments), [segments])
  const shown    = lanes.slice(0, maxLanes)
  const hidden   = lanes.slice(maxLanes)
  // 접힌 막대가 어느 날짜에 걸쳐 있는지 — 날짜별로 '+N건'을 정확히 세기 위해
  const overflowPerCol = useMemo(() => {
    const n = Array(7).fill(0)
    hidden.forEach(lane => lane.forEach(seg => {
      for (let i = seg.c0; i <= seg.c1; i++) n[i]++
    }))
    return n
  }, [hidden])

  // 그리드 행: 1행 = 날짜 숫자, 2행~ = 막대 줄, 마지막 = 여백(+N건)
  const rows = `auto repeat(${Math.max(shown.length, 1)}, auto) 1fr`

  return (
    <div
      className={`grid grid-cols-7 ${isLast ? '' : 'border-b border-gray-200'}`}
      style={{ gridTemplateRows: rows, minHeight: minH }}
    >
      {/* 날짜 칸 배경 — 모든 행을 가로질러 세로선과 음영을 깐다 */}
      {week.map((d, i) => {
        const isToday   = d.date === today
        const weekend   = i === 0 || i === 6
        const conflict  = has('warn') && conflictDates.has(d.date)
        return (
          <div
            key={`bg-${d.date}`}
            style={{ gridColumn: i + 1, gridRow: '1 / -1' }}
            className={`border-l border-gray-100 first:border-l-0
              ${!d.inMonth ? 'bg-gray-50/70' : weekend ? 'bg-slate-50/50' : ''}
              ${conflict ? 'bg-red-50/60' : ''}
              ${isToday ? 'ring-2 ring-inset ring-blue-400' : ''}`}
          />
        )
      })}

      {/* 날짜 숫자 */}
      {week.map((d, i) => {
        const isToday = d.date === today
        const conflict = has('warn') && conflictDates.has(d.date)
        return (
          <div
            key={`num-${d.date}`}
            style={{ gridColumn: i + 1, gridRow: 1 }}
            className="relative z-10 px-1.5 pt-1.5 pb-1 flex items-center gap-1"
          >
            <span
              className={`text-[11px] font-bold tabular-nums w-5 h-5 flex items-center justify-center rounded-full
                ${isToday ? 'bg-blue-600 text-white'
                  : !d.inMonth ? 'text-gray-300'
                  : i === 0 ? 'text-red-500'
                  : i === 6 ? 'text-blue-500' : 'text-gray-700'}`}
            >
              {d.day}
            </span>
            {conflict && (
              <AlertTriangle
                className="h-3 w-3 text-red-500 shrink-0"
                aria-label="중복배정"
              />
            )}
          </div>
        )
      })}

      {/* 행사 막대 */}
      {shown.map((lane, li) =>
        lane.map(seg => (
          <EventBar
            key={`${seg.ev.inq.id}-${seg.c0}`}
            seg={seg}
            row={li + 2}
            conflictDates={conflictDates}
            density={density}
            has={has}
            onOpenDetail={onOpenDetail}
          />
        )),
      )}

      {/* 접힌 막대 안내 */}
      {hidden.length > 0 && week.map((d, i) =>
        overflowPerCol[i] > 0 ? (
          <div
            key={`more-${d.date}`}
            style={{ gridColumn: i + 1, gridRow: shown.length + 2 }}
            className="relative z-10 px-1.5 pb-1 self-end"
          >
            <span className="text-[10px] text-gray-400 font-medium">
              +{overflowPerCol[i]}건
            </span>
          </div>
        ) : null,
      )}
    </div>
  )
}

// ─── 행사 막대 하나 ───────────────────────────────────────
function EventBar({
  seg, row, conflictDates, density, has, onOpenDetail,
}: {
  seg: Segment
  row: number
  conflictDates: Set<string>
  density: Density
  has: (k: LayerKey) => boolean
  onOpenDetail: (inq: Inquiry) => void
}) {
  const { ev } = seg
  const inq = ev.inq
  const st = useMemo(
    () => segStat(ev, seg.dates, conflictDates),
    [ev, seg.dates, conflictDates],
  )

  const tone = BAR_TONE[inq.status] ?? BAR_FALLBACK
  const short = st.gapDays > 0
  const clash = st.conflictDays > 0
  const warn  = has('warn') && (short || clash)

  // 행사 전체 금액 (구간 금액이 아니다 — 견적은 행사 단위로만 존재한다)
  const money = useMemo(() => {
    if (!has('money')) return null
    return ev.jobs.reduce((s, j) => s + jobMoney(j).billTotal, 0)
  }, [ev.jobs, has])

  const title = [
    inq.event_name || '(무제)',
    inq.company_name ? `고객사 ${inq.company_name}` : null,
    `기간 ${inq.event_start?.substring(0, 10)}${
      inq.event_end && inq.event_end !== inq.event_start ? ` ~ ${inq.event_end.substring(0, 10)}` : ''}`,
    `상태 ${inq.status}`,
    st.reqMax > 0 ? `배정 ${range(st.filMin, st.filMax)} / 필요 ${range(st.reqMin, st.reqMax)}명` : null,
    short ? `인원 부족한 날 ${st.gapDays}일` : null,
    clash ? `중복배정 있는 날 ${st.conflictDays}일` : null,
    st.crewCount > 0 ? `크루 ${st.crewCount}명${st.crewVaries ? ' (날짜별 다름)' : ''}` : null,
    inq.location ? `장소 ${inq.location}` : null,
    inq.event_time ? `시간 ${inq.event_time}` : null,
    money ? `청구 ${fmt(money)}원 (행사 전체)` : null,
    ev.memoCount > 0 && ev.latestMemo ? `메모 ${ev.latestMemo}` : null,
    '클릭하면 상세가 열립니다',
  ].filter(Boolean).join('\n')

  // 밀도에 따라 막대 안에 몇 줄까지 넣을지
  const showMeta = density !== 'compact'
  const showCrew = density === 'detail' && has('crew') && st.crewCount > 0

  return (
    <div
      style={{ gridColumn: `${seg.c0 + 1} / ${seg.c1 + 2}` , gridRow: row }}
      className="relative z-10 px-1 pb-0.5 min-w-0"
    >
      <button
        type="button"
        onClick={() => onOpenDetail(inq)}
        title={title}
        className={`w-full text-left border px-1.5 py-1 min-w-0 transition
          hover:brightness-95 hover:shadow-sm cursor-pointer
          ${tone.bar}
          ${warn ? 'border-red-400 border-l-4' : ''}
          ${seg.openLeft  ? 'rounded-l-none border-l-0' : 'rounded-l'}
          ${seg.openRight ? 'rounded-r-none border-r-0' : 'rounded-r'}`}
      >
        {/* 1줄: 행사명 + 배정/경고 */}
        <div className="flex items-center gap-1 min-w-0">
          {seg.openLeft && <span className="text-[9px] opacity-50 shrink-0">◀</span>}
          {has('status') && (
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${tone.dot}`} />
          )}
          <span className="text-[11px] font-bold truncate leading-tight min-w-0">
            {inq.event_name || inq.company_name || '(무제)'}
          </span>

          {has('staffing') && st.reqMax > 0 && (
            // 사람 아이콘을 반드시 함께 둔다 — 이 앱은 날짜도 '9/3'으로 쓰기 때문에
            // 숫자만 있으면 '9/2'가 인원(9명/2명)인지 9월 2일인지 구분되지 않는다.
            <span
              className={`ml-auto shrink-0 inline-flex items-center gap-0.5 text-[10px] font-bold tabular-nums px-1 rounded
                ${short ? 'bg-red-100 text-red-700' : 'bg-white/70 text-gray-600'}`}
              title={`배정 ${range(st.filMin, st.filMax)}명 / 필요 ${range(st.reqMin, st.reqMax)}명`}
            >
              <Users className="h-2.5 w-2.5 shrink-0" />
              {range(st.filMin, st.filMax)}/{range(st.reqMin, st.reqMax)}
            </span>
          )}
          {warn && clash && (
            <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
          )}
          {has('memo') && ev.memoCount > 0 && (
            <StickyNote className="h-3 w-3 text-amber-500 shrink-0" />
          )}
          {seg.openRight && <span className="text-[9px] opacity-50 shrink-0 ml-auto">▶</span>}
        </div>

        {/* 2줄: 고객사 · 금액 · 장소 · 시간 */}
        {showMeta && (
          <div className="flex items-center gap-1.5 min-w-0 mt-0.5 text-[10px] opacity-75">
            {has('company') && inq.company_name && (
              <span className="truncate min-w-0">{inq.company_name}</span>
            )}
            {has('money') && !!money && (
              <span className="shrink-0 tabular-nums font-semibold">{fmt(money)}</span>
            )}
            {has('site') && inq.location && (
              <span className="inline-flex items-center gap-0.5 truncate min-w-0">
                <MapPin className="h-2.5 w-2.5 shrink-0" />{inq.location}
              </span>
            )}
            {has('site') && inq.event_time && (
              <span className="inline-flex items-center gap-0.5 shrink-0">
                <Clock className="h-2.5 w-2.5" />{inq.event_time}
              </span>
            )}
          </div>
        )}

        {/* 3줄: 현장 준비물 */}
        {showMeta && has('onsite') && (inq.attire || inq.meal || inq.parking) && (
          <div className="text-[10px] opacity-60 truncate mt-0.5">
            {[inq.attire, inq.meal, inq.parking].filter(Boolean).join(' · ')}
          </div>
        )}

        {/* 4줄: 크루 이름 — 구간 내내 같을 때만 이름을 적는다 */}
        {showCrew && (
          st.crewVaries ? (
            <div className="mt-0.5 text-[10px] opacity-60 inline-flex items-center gap-0.5">
              <Users className="h-2.5 w-2.5" />크루 {st.crewCount}명 · 날짜별 다름
            </div>
          ) : (
            <div className="mt-0.5 flex flex-wrap gap-0.5">
              {st.crew.slice(0, 6).map(n => (
                <span
                  key={n}
                  className="text-[9px] leading-none px-1 py-0.5 rounded bg-white/70 border border-current/20"
                >
                  {n}
                </span>
              ))}
              {st.crew.length > 6 && (
                <span className="text-[9px] opacity-60">+{st.crew.length - 6}</span>
              )}
            </div>
          )
        )}
      </button>
    </div>
  )
}

/** 표 뷰와 같은 필터를 달력에도 걸기 위한 헬퍼.
 *  검색어는 행사·고객사·크루 이름에, 미충족 필터는 그 달에 한 번이라도
 *  사람이 모자란 날이 있는 행사에 걸린다. */
export function filterEventsForCalendar(
  events: EventBase[], monthDates: string[], query: string, onlyProblem: boolean,
): EventBase[] {
  const q = query.trim().toLowerCase()
  return events.filter(ev => {
    if (onlyProblem) {
      const short = monthDates.some(d => {
        if (!coversDate(ev.inq.event_start, ev.inq.event_end, d)) return false
        return ev.jobs.some(job => job.required > 0 && makeCell(job, d).total < job.required)
      })
      if (!short) return false
    }
    if (!q) return true
    const hay = [
      ev.inq.event_name, ev.inq.company_name, ev.inq.location,
      ...ev.jobs.flatMap(j => j.assignments.map(a => cleanStaffName(a.staff_name))),
    ].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(q)
  })
}
