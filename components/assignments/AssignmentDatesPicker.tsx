'use client'

// 배정 근무일 고르기
// ─────────────────────────────────────────────────────────
// 배정에는 일수(work_days)와 날짜(work_dates) 두 칸이 있는데, 지금까지 실제로 채워진 건
// 일수뿐이다 (2026-09 기준 933건 중 날짜가 든 건 2건). 그래서 '홍천 정기행사에 6일 들어간다'는
// 알아도 '10일 중 어느 6일인지'는 시스템 어디에도 없었다. 이 컴포넌트가 채우는 건 그 빈칸이다.
//
// **일수를 고치지 않는다.** 날짜를 고른 배정만 일수가 따라온다.
// 사람마다 일부러 다르게 적어둔 일수(계절학기의 9·2·11·10일 같은)가 실제 운영이라,
// 코드가 운영일 수로 밀어버리면 지난 행사 지급액까지 틀어진다. 안 고른 배정은 예전 그대로.
//
// 후보 날짜는 행사 기간 전체가 아니라 운영일(eventDatesOf)만 — 홍천이면 30칸이 아니라 10칸.

import { useMemo, useState } from 'react'
import { CalendarDays, X, Check } from 'lucide-react'
import { compressDates, md, dowOf, isWeekend } from '@/components/schedule/dateUtils'

interface Props {
  /** 이 행사의 운영일 (eventDatesOf 결과) */
  eventDates: string[]
  /** 지금 저장된 work_dates */
  value: string[]
  onSave: (dates: string[]) => void | Promise<void>
}

export default function AssignmentDatesPicker({ eventDates, value, onSave }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>(value)
  const [saving, setSaving] = useState(false)

  const picked = useMemo(() => new Set(draft), [draft])
  const hasDates = value.length > 0

  // 운영일을 모르는 행사(시작일 미입력 등)에서는 고를 게 없다
  if (eventDates.length === 0) return null

  function begin() {
    setDraft(value)
    setOpen(true)
  }

  async function commit(next: string[]) {
    setSaving(true)
    try {
      await onSave([...next].sort())
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const toggle = (d: string) => {
    const next = new Set(picked)
    if (next.has(d)) next.delete(d); else next.add(d)
    setDraft([...next].sort())
  }

  /** 그 날짜와 같은 요일을 전부 켠다 — 문의쪽 운영일 고르기와 같은 조작감 */
  const addSameDow = (d: string) => {
    const g = new Date(d + 'T00:00:00').getDay()
    const next = new Set(picked)
    eventDates.forEach(x => { if (new Date(x + 'T00:00:00').getDay() === g) next.add(x) })
    setDraft([...next].sort())
  }

  // ── 접힌 상태 ────────────────────────────────────────
  if (!open) {
    if (hasDates) {
      return (
        <button
          type="button"
          onClick={begin}
          className="inline-flex items-center gap-1 text-2xs px-1.5 py-0.5 rounded
            border border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-400 transition-colors"
          title="근무일 바꾸기"
        >
          <CalendarDays className="h-2.5 w-2.5" />
          <span className="tabular-nums">{compressDates(value)}</span>
        </button>
      )
    }
    return (
      <button
        type="button"
        onClick={begin}
        className="inline-flex items-center gap-0.5 text-2xs px-1 py-0.5 rounded
          border border-gray-200 text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-colors"
        title="며칠인지 말고 '어느 날'인지 정합니다"
      >
        <CalendarDays className="h-2.5 w-2.5" />
        날짜
      </button>
    )
  }

  // ── 펼친 상태 ────────────────────────────────────────
  return (
    <div className="mt-1 w-full rounded-lg border border-blue-200 bg-blue-50/40 p-2 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-gray-700">
          근무일 {draft.length}일
          <span className="font-normal text-gray-400"> / 운영일 {eventDates.length}일</span>
        </span>
        {draft.length > 0 && (
          <span className="text-xs text-blue-700 tabular-nums">{compressDates(draft)}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {eventDates.map(d => {
          const on = picked.has(d)
          return (
            <button
              key={d}
              type="button"
              onClick={() => toggle(d)}
              onDoubleClick={() => addSameDow(d)}
              title={`${md(d)} (${dowOf(d)}) — 더블클릭하면 같은 요일 전부`}
              className={`w-11 rounded border px-1 py-0.5 text-center transition
                ${on
                  ? 'border-blue-400 bg-blue-100 text-blue-800'
                  : 'border-gray-200 bg-white text-gray-400 hover:border-gray-400'}`}
            >
              <div className="text-xs font-bold tabular-nums leading-tight">{md(d)}</div>
              <div className={`text-2xs ${isWeekend(d) ? 'text-blue-400' : 'opacity-60'}`}>
                {dowOf(d)}
              </div>
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap text-xs">
        <button type="button" onClick={() => setDraft([...eventDates])}
          className="px-2 py-0.5 rounded border border-gray-200 bg-white text-gray-600 hover:border-blue-400">
          전체
        </button>
        <button type="button" onClick={() => setDraft([])}
          className="px-2 py-0.5 rounded border border-gray-200 bg-white text-gray-600 hover:border-blue-400">
          전부 해제
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={() => setOpen(false)}
            className="px-2 py-0.5 rounded text-gray-400 hover:text-gray-700">
            취소
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => commit(draft)}
            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-blue-600 text-white
              font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            <Check className="h-3 w-3" />
            {draft.length > 0 ? `${draft.length}일로 저장` : '날짜 안 씀'}
          </button>
        </div>
      </div>

      <p className="text-2xs text-gray-400">
        {draft.length > 0
          ? '고른 날짜 수가 참여 일수가 됩니다. 인원배정 표·출석부·중복배정 판정에 그대로 쓰입니다.'
          : '날짜를 비우면 일수는 지금 값 그대로 두고, 전 기간 투입으로 봅니다 (예전 동작).'}
      </p>
      {draft.length === 0 && hasDates && (
        <p className="text-2xs text-amber-600 flex items-center gap-1">
          <X className="h-2.5 w-2.5" />
          이대로 저장하면 지금 잡혀 있는 {compressDates(value)} 가 지워집니다.
        </p>
      )}
    </div>
  )
}
