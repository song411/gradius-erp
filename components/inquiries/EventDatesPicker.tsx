'use client'

// 행사 운영일 선택
// ─────────────────────────────────────────────────────────
// '09월 18일,19일 / 09월 25일,26일 / 10월 2일,3일 ...' 처럼 띄엄띄엄 도는 행사가 있다.
// 지금까지는 시작~종료 한 쌍뿐이라 9/18~10/17 로 넣을 수밖에 없었고, 그러면
// 안 하는 20일이 행사 기간에 포함돼 운영 캘린더·구글 캘린더·중복배정이 전부 어긋났다.
//
// 이 행사는 전체의 10%도 안 되고 대부분 불규칙하다. 그래서 요일 패턴 같은 자동 생성을
// 앞세우지 않고 '달력에서 직접 클릭'을 주 입력으로 둔다. 요일 버튼은 거들기다.
//
// 비워두면 예전과 똑같이 동작한다 — 일반 행사는 이 화면을 아예 안 봐도 된다.

import { useMemo, useState } from 'react'
import { CalendarDays, X } from 'lucide-react'

const DOW = ['일', '월', '화', '수', '목', '금', '토']
const pad = (n: number) => String(n).padStart(2, '0')

function rangeDates(start: string, end: string): string[] {
  const out: string[] = []
  const d = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  if (isNaN(d.getTime()) || isNaN(e.getTime()) || d > e) return out
  // 너무 긴 구간은 그리지 않는다 (잘못 입력된 연도 등으로 브라우저가 멈추는 것 방지)
  let guard = 0
  while (d <= e && guard++ < 400) {
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
    d.setDate(d.getDate() + 1)
  }
  return out
}

/** 선택된 날짜를 '9/18–9/19, 9/25–9/26' 처럼 접어서 보여준다 */
function summarize(dates: string[]): string {
  const s = [...dates].sort()
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
  const diff = (a: string, b: string) =>
    (new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000
  const out: string[] = []
  let i = 0
  while (i < s.length) {
    let j = i
    while (j + 1 < s.length && diff(s[j], s[j + 1]) === 1) j++
    out.push(i === j ? md(s[i]) : `${md(s[i])}–${md(s[j])}`)
    i = j + 1
  }
  return out.join(', ')
}

interface Props {
  start: string
  end: string
  value: string[]
  onChange: (next: string[]) => void
}

export default function EventDatesPicker({ start, end, value, onChange }: Props) {
  const [open, setOpen] = useState(value.length > 0)

  const all = useMemo(() => (start && end ? rangeDates(start, end) : []), [start, end])
  const picked = useMemo(() => new Set(value), [value])

  if (!start || !end) {
    return (
      <p className="text-xs text-gray-400">
        시작일과 종료일을 먼저 넣으면 그 사이 날짜 중에서 고를 수 있습니다.
      </p>
    )
  }

  if (all.length === 0) {
    return <p className="text-xs text-amber-600">시작일이 종료일보다 늦습니다.</p>
  }

  const toggle = (d: string) => {
    const next = new Set(picked)
    if (next.has(d)) next.delete(d); else next.add(d)
    onChange([...next].sort())
  }

  /** 그 날짜와 같은 요일을 전부 켠다 — 반규칙적인 행사에서 클릭 수를 줄인다 */
  const addSameDow = (d: string) => {
    const g = new Date(d + 'T00:00:00').getDay()
    const next = new Set(picked)
    all.forEach(x => { if (new Date(x + 'T00:00:00').getDay() === g) next.add(x) })
    onChange([...next].sort())
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg
          border border-gray-200 text-gray-500 hover:border-gray-400"
      >
        <CalendarDays className="h-3.5 w-3.5" />
        띄엄띄엄 하는 행사인가요? 운영일 고르기
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-2 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-gray-600">
          운영일 {value.length}일
          <span className="font-normal text-gray-400"> / 기간 {all.length}일</span>
        </span>
        {value.length > 0 && (
          <span className="text-xs text-blue-700 tabular-nums">{summarize(value)}</span>
        )}
        <button
          type="button"
          onClick={() => { onChange([]); setOpen(false) }}
          className="ml-auto inline-flex items-center gap-0.5 text-xs text-gray-400 hover:text-gray-700"
          title="운영일을 지우면 기간 전체를 행사일로 봅니다 (기본 동작)"
        >
          <X className="h-3 w-3" />
          안 씀
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {all.map(d => {
          const dt = new Date(d + 'T00:00:00')
          const on = picked.has(d)
          const g  = dt.getDay()
          return (
            <button
              key={d}
              type="button"
              onClick={() => toggle(d)}
              onDoubleClick={() => addSameDow(d)}
              title={`${dt.getMonth() + 1}/${dt.getDate()} (${DOW[g]}) — 더블클릭하면 같은 요일 전부 선택`}
              className={`w-11 rounded border px-1 py-0.5 text-center transition
                ${on
                  ? 'border-blue-400 bg-blue-100 text-blue-800'
                  : 'border-gray-200 bg-white text-gray-400 hover:border-gray-400'}`}
            >
              <div className="text-xs font-bold tabular-nums leading-tight">
                {dt.getMonth() + 1}/{dt.getDate()}
              </div>
              <div className={`text-2xs ${
                g === 0 ? 'text-red-400' : g === 6 ? 'text-blue-400' : 'opacity-60'
              }`}>
                {DOW[g]}
              </div>
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap text-xs">
        <button type="button" onClick={() => onChange([...all])}
          className="px-2 py-0.5 rounded border border-gray-200 bg-white text-gray-600 hover:border-blue-400">
          전체
        </button>
        <button type="button" onClick={() => onChange([])}
          className="px-2 py-0.5 rounded border border-gray-200 bg-white text-gray-600 hover:border-blue-400">
          전부 해제
        </button>
        <span className="text-gray-400">
          날짜를 눌러 켜고 끕니다 · 더블클릭하면 같은 요일 전부
        </span>
      </div>

      <p className="text-2xs text-gray-400">
        비워두면 기간 전체를 행사일로 봅니다. 고른 날짜는 운영 캘린더·인원배정·출석부·
        중복배정 판정에 그대로 쓰입니다.
      </p>
    </div>
  )
}
