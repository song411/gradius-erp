'use client'

import { X } from 'lucide-react'

export type Period = '전체' | '이번달' | '이번분기' | '올해'
const PERIOD_BTNS: Period[] = ['전체', '이번달', '이번분기', '올해']

export interface PeriodState {
  period:        Period
  customFrom:    string
  customTo:      string
}

interface PeriodFilterProps {
  value:          PeriodState
  onChange:       (next: PeriodState) => void
}

export function PeriodFilter({ value, onChange }: PeriodFilterProps) {
  const { period, customFrom, customTo } = value
  const isCustom = period === ('직접입력' as Period)

  function setP(p: Period) {
    onChange({ period: p, customFrom: '', customTo: '' })
  }

  function setFrom(v: string) {
    onChange({ ...value, customFrom: v })
  }

  function setTo(v: string) {
    onChange({ ...value, customTo: v })
  }

  function reset() {
    onChange({ period: '전체', customFrom: '', customTo: '' })
  }

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {PERIOD_BTNS.map(p => (
        <button
          key={p}
          onClick={() => setP(p)}
          className={`text-xs px-3 py-1.5 rounded-full border-2 font-semibold transition-colors ${
            period === p && !isCustom
              ? 'bg-amber-500 text-white border-amber-500'
              : 'bg-white text-gray-600 border-gray-300 hover:border-amber-400'
          }`}
        >
          {p}
        </button>
      ))}
      {/* 직접 입력 토글 버튼 */}
      <button
        onClick={() => onChange({ period: '직접입력' as Period, customFrom, customTo })}
        className={`text-xs px-3 py-1.5 rounded-full border-2 font-semibold transition-colors ${
          isCustom
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
        }`}
      >
        직접 입력
      </button>

      {/* 날짜 범위 입력 — 직접 입력 모드일 때만 표시 */}
      {isCustom && (
        <div className="flex items-center gap-1.5 ml-1">
          <input
            type="date"
            value={customFrom}
            onChange={e => setFrom(e.target.value)}
            className="text-xs border-2 border-blue-300 rounded-lg px-2 py-1 focus:outline-none focus:border-blue-500"
          />
          <span className="text-xs text-gray-400 font-semibold">~</span>
          <input
            type="date"
            value={customTo}
            onChange={e => setTo(e.target.value)}
            className="text-xs border-2 border-blue-300 rounded-lg px-2 py-1 focus:outline-none focus:border-blue-500"
          />
          {(customFrom || customTo) && (
            <button
              onClick={reset}
              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
              title="초기화"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// 공통 날짜 필터 함수
export function isInPeriodFn(
  dateStr:    string | undefined | null,
  state:      PeriodState,
): boolean {
  const { period, customFrom, customTo } = state

  // 직접 입력 모드
  if (period === ('직접입력' as Period)) {
    if (!customFrom && !customTo) return true   // 날짜 미입력 → 전체 표시
    if (!dateStr) return false
    const d = new Date(dateStr)
    if (customFrom && d < new Date(customFrom)) return false
    if (customTo   && d > new Date(customTo + 'T23:59:59')) return false
    return true
  }

  if (period === '전체') return true
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  if (period === '이번달')   return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  if (period === '이번분기') return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3)
  if (period === '올해')     return d.getFullYear() === now.getFullYear()
  return true
}
