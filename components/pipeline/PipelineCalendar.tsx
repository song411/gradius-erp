'use client'

// 영업 보드 — 캘린더형 보기
// ─────────────────────────────────────────────────────────
// 목록은 '어느 건이 급한가'에 답하지만 '그 날 사람을 넣을 수 있나'에는
// 답하지 못한다. 수주해도 인원을 못 만들면 딴 게 아니다.
//
// 그래서 체결 전 건을 행사일 위에 얹고, 같은 칸에 그날 이미 확정된
// 인원을 함께 적는다. 실측(2026-09-21): 10/02에 체결 4건 10명이 이미
// 나가 있는데 케이씨투 15명짜리가 아직 체결 전이다. 따면 25명을
// 만들어야 한다는 뜻인데, 목록만 봐서는 알 수 없었다.
//
// 날짜를 읽는 규칙은 운영 캘린더와 같아야 한다. 띄엄띄엄 하는 행사는
// event_dates에 실제 운영일이 들어 있으므로 eventDatesOf로만 읽는다
// (직접 event_start~event_end를 펼치면 쉬는 날에도 행사가 찍힌다).

import { useMemo, useState } from 'react'
import { eventDatesOf } from '@/components/schedule/matrixCore'
import { monthGrid, dowOf } from '@/components/schedule/dateUtils'
import { isLiveStage, shortKRW, today, type PipelineCard } from '@/lib/pipeline'
import { ChevronLeft, ChevronRight, Users } from 'lucide-react'

const DOW_LABEL = ['일', '월', '화', '수', '목', '금', '토']

/** 한 칸에 보여줄 칩 수.
 *  장기 행사(예: 3주짜리 상주 건)는 매일 칸에 찍히므로, 다른 건이 몇 개만
 *  겹쳐도 칸이 한없이 길어진다. 넘치는 건은 수만 알리고 접는다. */
const MAX_CHIPS = 4

interface DayCell {
  /** 이 날 행사가 잡힌 체결 전 건 (지금 탭에 해당하는 것) */
  cards: PipelineCard[]
  /** 그날 이미 확정된 행사 수와 인원 — 인력 경합의 바닥값 */
  wonEvents: number
  wonStaff: number
}

interface Props {
  /** 달력에 칩으로 올릴 카드 (지금 탭 기준) */
  cards: PipelineCard[]
  /** 확정 인원을 세기 위한 전체 카드 — 탭·기간 필터를 타면 안 된다 */
  allCards: PipelineCard[]
  onOpen: (id: string) => void
}

export default function PipelineCalendar({ cards, allCards, onOpen }: Props) {
  const t = today()
  const [ym, setYm] = useState(() => ({
    y: Number(t.slice(0, 4)),
    m: Number(t.slice(5, 7)) - 1,
  }))

  const weeks = useMemo(() => monthGrid(ym.y, ym.m), [ym])

  const byDate = useMemo(() => {
    const map = new Map<string, DayCell>()
    const touch = (d: string) => {
      let cell = map.get(d)
      if (!cell) { cell = { cards: [], wonEvents: 0, wonStaff: 0 }; map.set(d, cell) }
      return cell
    }

    // 이미 확정된 건 — 그날의 바닥 인원
    allCards.filter(c => c.stage === '체결').forEach(c => {
      eventDatesOf(c.inq).forEach(d => {
        const cell = touch(d)
        cell.wonEvents += 1
        cell.wonStaff += c.inq.required_staff || 0
      })
    })

    // 아직 안 잡힌 건
    cards.forEach(c => {
      eventDatesOf(c.inq).forEach(d => touch(d).cards.push(c))
    })

    return map
  }, [cards, allCards])

  /** 날짜가 없어 달력에 올릴 수 없는 건 — 없는 셈 치면 조용히 사라진다 */
  const undated = useMemo(
    () => cards.filter(c => eventDatesOf(c.inq).length === 0),
    [cards],
  )

  function move(delta: number) {
    setYm(({ y, m }) => {
      const n = m + delta
      return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 }
    })
  }

  return (
    <section>
      {/* 월 이동 */}
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={() => move(-1)}
          className="rounded-lg border border-gray-300 bg-white p-1.5 text-gray-600 hover:bg-gray-50"
          title="이전 달"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="text-base font-bold text-gray-900 tabular-nums">
          {ym.y}년 {ym.m + 1}월
        </h2>
        <button
          onClick={() => move(1)}
          className="rounded-lg border border-gray-300 bg-white p-1.5 text-gray-600 hover:bg-gray-50"
          title="다음 달"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => setYm({ y: Number(t.slice(0, 4)), m: Number(t.slice(5, 7)) - 1 })}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          오늘
        </button>
        <span className="ml-auto flex items-center gap-3 text-[11px] text-gray-400">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-blue-500" />아직 안 잡힌 건
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3 text-emerald-600" />그날 확정 인원
          </span>
        </span>
      </div>

      {/* 요일 */}
      <div className="grid grid-cols-7 gap-px rounded-t-xl bg-gray-200 text-center text-[11px] font-semibold">
        {DOW_LABEL.map((d, i) => (
          <div
            key={d}
            className={`bg-gray-50 py-1.5 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'}`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 칸 */}
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-b-xl bg-gray-200">
        {weeks.flat().map(g => {
          const cell = byDate.get(g.date)
          const isToday = g.date === t
          const dow = dowOf(g.date)

          return (
            <div
              key={g.date}
              className={[
                'min-h-[7.5rem] p-1.5',
                g.inMonth ? 'bg-white' : 'bg-gray-50/70',
                isToday ? 'ring-2 ring-inset ring-blue-500' : '',
              ].join(' ')}
            >
              <div className="flex items-baseline justify-between">
                <span className={[
                  'text-[11px] font-semibold tabular-nums',
                  !g.inMonth ? 'text-gray-300'
                    : dow === '일' ? 'text-red-500'
                    : dow === '토' ? 'text-blue-500' : 'text-gray-700',
                ].join(' ')}>
                  {g.day}
                </span>
                {/* 그날 이미 나가 있는 인원 — 여기에 더 얹을 수 있는지의 기준이다 */}
                {cell && cell.wonEvents > 0 && (
                  <span
                    className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1 text-[10px] font-semibold text-emerald-700"
                    title={`확정 ${cell.wonEvents}건 · ${cell.wonStaff}명`}
                  >
                    <Users className="h-2.5 w-2.5" />
                    {cell.wonStaff || cell.wonEvents}
                    {cell.wonStaff ? '명' : '건'}
                  </span>
                )}
              </div>

              <div className="mt-1 space-y-1">
                {cell?.cards.slice(0, MAX_CHIPS).map(c => (
                  <button
                    key={c.inq.id}
                    onClick={() => onOpen(c.inq.id)}
                    className={[
                      'block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium',
                      'border-l-2 transition-colors',
                      c.signal === 'alert' ? 'border-l-red-500 bg-red-50 text-red-800 hover:bg-red-100'
                        : c.signal === 'warn' ? 'border-l-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100'
                        : 'border-l-blue-500 bg-blue-50 text-blue-800 hover:bg-blue-100',
                    ].join(' ')}
                    title={[
                      c.inq.company_name, c.inq.event_name,
                      c.inq.required_staff ? `${c.inq.required_staff}명` : null,
                      c.amount > 0 ? shortKRW(c.amount) : null,
                      c.stallText,
                    ].filter(Boolean).join(' · ')}
                  >
                    {c.inq.required_staff ? `${c.inq.required_staff}명 ` : ''}
                    {c.inq.company_name || c.inq.event_name || '(이름 없음)'}
                  </button>
                ))}
                {cell && cell.cards.length > MAX_CHIPS && (
                  <p
                    className="px-1 text-[10px] font-medium text-gray-400"
                    title={cell.cards.slice(MAX_CHIPS)
                      .map(c => `${c.inq.required_staff || '?'}명 ${c.inq.company_name || ''}`)
                      .join('\n')}
                  >
                    +{cell.cards.length - MAX_CHIPS}건
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 날짜 없는 건 — 달력에 자리가 없다고 사라지면 안 된다 */}
      {undated.length > 0 && (
        <div className="mt-3 rounded-xl border border-dashed border-gray-300 p-3">
          <h3 className="mb-2 text-xs font-semibold text-gray-600">
            날짜가 아직 없는 건 {undated.length}건
            <span className="ml-2 font-normal text-gray-400">달력에 올릴 수 없습니다</span>
          </h3>
          <ul className="flex flex-wrap gap-2">
            {undated.map(c => (
              <li key={c.inq.id}>
                <button
                  onClick={() => onOpen(c.inq.id)}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] hover:border-gray-400"
                >
                  <span className="max-w-[10rem] truncate font-medium text-gray-800">
                    {c.inq.company_name || c.inq.event_name}
                  </span>
                  {c.when.memo && <span className="text-gray-400">{c.when.memo}</span>}
                  {isLiveStage(c.stage) && c.stallText && (
                    <span className="text-gray-400">{c.stallText}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
