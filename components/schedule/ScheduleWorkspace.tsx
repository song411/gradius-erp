'use client'

// 운영 캘린더 워크스페이스
// ─────────────────────────────────────────────────────────
// 월 이동 · 검색 · 필터 · 조회를 여기서 한 번만 하고, 아래 뷰(달력/표)에 내려준다.
// 뷰를 바꿔도 보고 있던 달과 검색어가 유지되고, 조회가 다시 나가지 않는다.

import { useMemo, useState } from 'react'
import {
  ChevronLeft, ChevronRight, AlertTriangle, Search, X,
  CalendarDays, CalendarRange, Table2, SlidersHorizontal, Check,
} from 'lucide-react'
import type { Inquiry } from '@/lib/supabase/types'
import { Input } from '@/components/ui/input'
import EventDetailPanel from './EventDetailPanel'
import ScheduleMatrixContent from './ScheduleMatrixContent'
import CalendarMonthView, { filterEventsForCalendar } from './CalendarMonthView'
import CalendarWeekView from './CalendarWeekView'
import { useScheduleData } from './useScheduleData'
import { useCalendarNotes } from './useCalendarNotes'
import DayMemoModal from './DayMemoModal'
import { fmt, todayLocal, jobMoney } from './matrixCore'
import {
  compressDates, monthGrid, monthDatesOf, weekOf, addDays, weekStartOf, md,
} from './dateUtils'
import {
  useViewPrefs, LAYERS, PRESETS, DENSITY_LABEL, VIEW_LABEL, LAYERED_VIEWS,
  type Density, type ViewMode,
} from './viewPrefs'

export default function ScheduleWorkspace() {
  const today = todayLocal()

  // 뷰가 달라도 "지금 보고 있는 지점"은 하나다. 날짜 하나를 커서로 두고
  // 월 뷰는 그 달을, 주 뷰는 그 주를 그린다. 뷰를 바꿔도 보던 시점이 유지된다.
  const [cursor,      setCursor]      = useState(today)
  const [query,       setQuery]       = useState('')
  const [onlyProblem, setOnlyProblem] = useState(false)
  const [detailInq,   setDetailInq]   = useState<Inquiry | null>(null)
  const [memoDate,    setMemoDate]    = useState<string | null>(null)
  const [tuning,      setTuning]      = useState(false)

  const { prefs, setView, setDensity, toggleLayer, applyPreset } = useViewPrefs()

  const year  = Number(cursor.slice(0, 4))
  const month = Number(cursor.slice(5, 7)) - 1   // 0-indexed
  const isWeek     = prefs.view === 'week'
  const isTable    = prefs.view === 'table'
  const isCalendar = !isTable

  // 화면에 실제로 보이는 날짜 범위. 조회도 이 범위로 한다.
  // 월 뷰의 격자는 앞뒤로 인접 월 며칠을 포함하므로 그 칸에 걸친 행사도 같이 불러온다.
  const { from, to } = useMemo(() => {
    if (isWeek) {
      const w = weekOf(cursor)
      return { from: w[0].date, to: w[6].date }
    }
    const grid = monthGrid(year, month)
    return { from: grid[0][0].date, to: grid[grid.length - 1][6].date }
  }, [isWeek, cursor, year, month])

  const data = useScheduleData(from, to)
  // 날짜 칸에 직접 쓰는 메모 (행사와 무관 — 행사가 없는 날에도 쓸 수 있다)
  const notes = useCalendarNotes(from, to)

  // 표는 '그 달'이 단위다 — 격자 앞뒤의 인접 월 날짜까지 행으로 뿌리면 안 된다
  const tableDates = useMemo(() => monthDatesOf(year, month), [year, month])

  // 달력에 그릴 행사 — 표와 같은 검색어·미충족 필터를 적용한다
  const calEvents = useMemo(
    () => filterEventsForCalendar(data.events, data.rangeDates, query, onlyProblem),
    [data.events, data.rangeDates, query, onlyProblem],
  )

  // ── 요약 ────────────────────────────────────────────────
  // 화면에 보이는 기간에 걸친 (행사 × 직무)를 한 번씩만 센다.
  // 표의 '구간'은 보기 방식일 뿐이므로, 구간 수로 세면 '하루씩 펼치기'만 켜도
  // 같은 기간의 필요 인원이 몇 배로 뛴다. 그래서 직무 기준으로 고정했다.
  // 월 뷰의 격자는 앞뒤로 인접 월 며칠을 포함하므로 그 칸에 보이는 행사도 들어간다
  // (화면에 있는 것은 세는 편이 "왜 안 세지?"보다 헷갈리지 않는다).
  const summary = useMemo(() => {
    let required = 0, filled = 0, gaps = 0, jobCount = 0
    let billTotal = 0, payTotal = 0
    let billOk = 0, payOk = 0, okCount = 0, untrusted = 0

    calEvents.forEach(ev => {
      ev.jobs.forEach(job => {
        jobCount += 1
        required += job.required
        filled   += job.assignments.length
        if (job.required > 0 && job.assignments.length < job.required) gaps += 1
        const m = jobMoney(job)
        billTotal += m.billTotal
        payTotal  += m.payTotal
        if (m.trust === 'ok') { billOk += m.billTotal; payOk += m.payTotal; okCount += 1 }
        else if (m.billTotal > 0) untrusted += 1
      })
    })

    return {
      eventCount: calEvents.length,
      jobCount, required, filled, gaps,
      billTotal, payTotal, untrusted, okCount,
      marginOk: billOk > 0 ? ((billOk - payOk) / billOk) * 100 : null,
    }
  }, [calEvents])

  // ── 이동 ────────────────────────────────────────────────
  // 주 뷰에서는 한 달씩 건너뛰면 쓸 수 없다. 보고 있는 단위만큼 움직인다.
  const step = (dir: -1 | 1) => {
    if (isWeek) { setCursor(c => addDays(c, dir * 7)); return }
    setCursor(c => {
      const y = Number(c.slice(0, 4))
      const m = Number(c.slice(5, 7)) - 1 + dir
      const d = new Date(y, m, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    })
  }
  const goToday = () => setCursor(today)

  const periodLabel = isWeek
    ? `${md(weekStartOf(cursor))} – ${md(addDays(weekStartOf(cursor), 6))}`
    : `${year}년 ${month + 1}월`

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ══ 공용 툴바 ══ */}
      <div className="shrink-0 px-4 py-3 border-b border-gray-200 bg-white space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          {/* 월 이동 */}
          <div className="flex items-center gap-1">
            <button onClick={() => step(-1)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              title={isWeek ? '이전 주' : '이전 달'}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-base font-bold text-gray-900 tabular-nums min-w-[130px] text-center">
              {periodLabel}
            </span>
            <button onClick={() => step(1)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              title={isWeek ? '다음 주' : '다음 달'}>
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={goToday}
              className="ml-1 text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:border-gray-400"
            >
              오늘
            </button>
          </div>

          {/* 뷰 전환 */}
          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
            {(['month', 'week', 'table'] as ViewMode[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                title={v === 'month' ? '한 달 전체를 막대로'
                  : v === 'week' ? '한 주를 날짜별로 — 그 날 어느 직무에 누가 들어가는지'
                  : '기존 표 — 구간별 금액·마진·엑셀'}
                className={`inline-flex items-center gap-1 text-xs px-2.5 py-1.5 font-medium transition
                  ${prefs.view === v
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                {v === 'month' ? <CalendarDays className="h-3.5 w-3.5" />
                  : v === 'week' ? <CalendarRange className="h-3.5 w-3.5" />
                  : <Table2 className="h-3.5 w-3.5" />}
                {VIEW_LABEL[v]}
              </button>
            ))}
          </div>

          {/* 요약 */}
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">
              행사 {summary.eventCount}건 · 직무 {summary.jobCount}건
            </span>
            <span
              className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-medium"
              title={`화면에 보이는 기간(${from} ~ ${to})에 걸친 행사들의 직무를 한 번씩만 센 값입니다. `
                + '표의 구간 수와 달리 보기 방식(하루씩 펼치기 등)에 따라 바뀌지 않습니다. '
                + '월 달력은 격자 앞뒤에 인접 월 며칠이 함께 보이므로 그 칸의 행사도 포함됩니다.'}
            >
              배정 {summary.filled} / 필요 {summary.required}명
            </span>
            {summary.billTotal > 0 && (
              <span
                className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 font-medium tabular-nums"
                title={`화면에 보이는 기간에 걸친 행사들의 직무 ${summary.jobCount}건 금액 합계입니다. `
                  + '금액은 직무 단위(행사 전체 기준)이므로 이 기간에만 발생하는 금액이 아닙니다. '
                  + `마진은 지급액이 다 들어간 ${summary.okCount}건만 모아서 낸 값입니다`
                  + (summary.untrusted > 0
                      ? ` — 미배정이거나 단가가 덜 들어간 ${summary.untrusted}건은 빠져 있습니다.`
                      : '.')}
              >
                청구 {fmt(summary.billTotal)} · 지급 {fmt(summary.payTotal)}
                {summary.marginOk !== null && (
                  <span className="ml-1 text-gray-500">
                    · 마진 {summary.marginOk.toFixed(1)}%
                    <span className="text-gray-400"> ({summary.okCount}건)</span>
                  </span>
                )}
                {summary.untrusted > 0 && (
                  <span className="ml-1 text-amber-600 font-semibold">참고 {summary.untrusted}건</span>
                )}
              </span>
            )}
            {summary.gaps > 0 && (
              <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 font-semibold">
                미충족 {summary.gaps}건
              </span>
            )}
            {data.conflicts.length > 0 && (
              <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 font-semibold inline-flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> 중복배정 {data.conflicts.length}건
              </span>
            )}
          </div>

          {/* 검색 · 필터 */}
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="행사 · 고객사 · 크루 이름"
                className="h-8 pl-7 pr-7 text-xs w-56"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={onlyProblem}
                onChange={e => setOnlyProblem(e.target.checked)}
                className="accent-blue-600"
              />
              미충족만
            </label>
          </div>
        </div>

        {/* ══ 달력 보기 설정 ══ */}
        {LAYERED_VIEWS.includes(prefs.view) && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-400">보기</span>

            {/* 역할 프리셋 */}
            {PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => applyPreset(p.key)}
                title={p.hint}
                className={`text-xs px-2.5 py-1 rounded-full border font-medium transition
                  ${prefs.preset === p.key
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}
              >
                {p.label}
              </button>
            ))}
            {prefs.preset === null && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 font-medium border border-blue-200">
                직접 설정
              </span>
            )}

            {/* 밀도 — 월 뷰에서만 의미가 있다 (주간은 칸이 넓어 늘 상세로 그린다) */}
            <div className={`flex items-center rounded-lg border border-gray-200 overflow-hidden ml-1
              ${isWeek ? 'opacity-40 pointer-events-none' : ''}`}>
              {(['compact', 'normal', 'detail'] as Density[]).map(d => (
                <button
                  key={d}
                  onClick={() => setDensity(d)}
                  title="칸에 넣을 정보가 많으면 밀도를 올리세요"
                  className={`text-xs px-2 py-1 font-medium transition
                    ${prefs.density === d
                      ? 'bg-gray-700 text-white'
                      : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                >
                  {DENSITY_LABEL[d]}
                </button>
              ))}
            </div>

            <button
              onClick={() => setTuning(t => !t)}
              className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition
                ${tuning
                  ? 'bg-gray-100 border-gray-400 text-gray-700'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'}`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              항목 고르기
            </button>

            <span className="text-xs text-gray-400">
              {prefs.layers.length}개 항목 표시 중
            </span>
          </div>
        )}

        {/* 레이어 체크박스 */}
        {LAYERED_VIEWS.includes(prefs.view) && tuning && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {LAYERS.map(l => {
              const on = prefs.layers.includes(l.key)
              return (
                <button
                  key={l.key}
                  onClick={() => toggleLayer(l.key)}
                  title={l.hint}
                  className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition
                    ${on
                      ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold'
                      : 'bg-white border-gray-200 text-gray-400 hover:border-gray-400'}`}
                >
                  {on && <Check className="h-3 w-3" />}
                  {l.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ══ 본문 ══ */}
      {isCalendar ? (
        <div className="flex-1 min-h-0 overflow-auto p-4 space-y-3">
          <ConflictBox conflicts={data.conflicts} busy={data.busy} />

          {notes.missingTable && (
            <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              날짜 메모 기능을 쓰려면 <b>supabase/migrations/012_calendar_notes.sql</b> 을
              Supabase SQL 편집기에서 한 번 실행해 주세요. 그 전까지 달력의 나머지 기능은 정상 동작합니다.
            </div>
          )}

          {data.busy ? (
            <div className="flex items-center justify-center h-40 text-sm text-gray-400">불러오는 중…</div>
          ) : calEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
              <CalendarDays className="h-8 w-8" />
              <p className="text-sm">
                {data.rangeInqs.length === 0
                  ? `${isWeek ? '이 주' : `${month + 1}월`}에 체결된 행사가 없습니다.`
                  : '조건에 맞는 항목이 없습니다.'}
              </p>
            </div>
          ) : isWeek ? (
            <CalendarWeekView
              anchor={cursor}
              data={data}
              prefs={prefs}
              events={calEvents}
              today={today}
              onOpenDetail={setDetailInq}
              notes={notes}
              onOpenDay={setMemoDate}
            />
          ) : (
            <CalendarMonthView
              year={year}
              month={month}
              data={data}
              prefs={prefs}
              events={calEvents}
              today={today}
              onOpenDetail={setDetailInq}
              notes={notes}
              onOpenDay={setMemoDate}
            />
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
            <span className="font-semibold text-gray-500">범례</span>
            <span>
              {isWeek
                ? '카드 하나 = 그 날의 행사 한 건 · 직무별 인원은 그 날짜 기준입니다'
                : '막대 하나 = 행사 한 건 (기간만큼 이어집니다)'}
            </span>
            <span><span className="inline-block w-2 h-2 rounded-sm bg-indigo-400 mr-1" />체결</span>
            <span><span className="inline-block w-2 h-2 rounded-sm bg-cyan-400 mr-1" />배정완료</span>
            <span><span className="inline-block w-2 h-2 rounded-sm bg-amber-400 mr-1" />진행중</span>
            <span><span className="inline-block w-2 h-2 rounded-sm bg-green-400 mr-1" />완료</span>
            <span>왼쪽 빨간 테두리 = 인원 부족 또는 중복배정</span>
            <span>막대를 클릭하면 전체 정보가 열립니다</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="shrink-0 px-4 pt-3">
              <ConflictBox conflicts={data.conflicts} busy={data.busy} />
            </div>
            <ScheduleMatrixContent
              year={year}
              month={month}
              dates={tableDates}
              today={today}
              data={data}
              query={query}
              onlyProblem={onlyProblem}
              onOpenDetail={setDetailInq}
            />
          </div>
        </div>
      )}

      {/* ══ 상세 패널 ══ */}
      {detailInq && (
        <EventDetailPanel inquiry={detailInq} onClose={() => setDetailInq(null)} />
      )}

      {/* ══ 날짜 메모 ══ */}
      {memoDate && (
        <DayMemoModal date={memoDate} api={notes} onClose={() => setMemoDate(null)} />
      )}
    </div>
  )
}

// ─── 중복배정 경고 ────────────────────────────────────────
// 날짜 단위로만 판정할 수 있어 표·달력 어느 쪽에서도 칸 안에 다 담기지 않는다.
// 놓치면 현장에서 사람이 비므로 본문 위에 항상 따로 띄운다.
function ConflictBox({
  conflicts, busy,
}: {
  conflicts: Array<{ name: string; events: string[]; dates: string[] }>
  busy: boolean
}) {
  if (busy || conflicts.length === 0) return null
  return (
    <div className="rounded-xl border-2 border-red-200 bg-red-50 p-3">
      <div className="flex items-center gap-1.5 text-xs font-extrabold text-red-700 mb-2">
        <AlertTriangle className="h-4 w-4" />
        같은 날 두 곳에 배정된 크루 {conflicts.length}건
      </div>
      <div
        className="grid gap-x-3 gap-y-1 text-xs"
        style={{ gridTemplateColumns: 'minmax(0,max-content) minmax(0,max-content) minmax(0,1fr)' }}
      >
        {conflicts.map(cf => (
          <div key={`${cf.name}|${cf.events.join('|')}`} className="contents">
            <span className="font-bold text-red-800 truncate max-w-[160px]" title={cf.name}>
              {cf.name}
            </span>
            <span className="text-red-700 tabular-nums whitespace-nowrap">
              {compressDates(cf.dates)}
            </span>
            <span className="text-red-600 min-w-0">{cf.events.join('  ↔  ')}</span>
          </div>
        ))}
      </div>
      <p className="text-2xs text-red-500 mt-2">
        배정에 근무일(work_dates)이 지정되지 않은 인력은 행사 전체 기간에 투입된 것으로 계산됩니다.
        실제로는 날짜가 갈리는 경우라면 인원배정 화면에서 날짜를 지정해 주세요.
      </p>
    </div>
  )
}
