'use client'

// 견적 변경 이력 목록 — 견적 목록·문의 상세·CEO 세금계산서 탭이 같이 쓴다
import { History } from 'lucide-react'
import { formatRevisionAt, type HistoryEntry } from '@/lib/estimateHistory'

export default function EstimateHistoryList({
  entries, legacy, compact = false,
}: {
  entries: HistoryEntry[]
  /** 스냅샷을 남기기 전에 고친 건 — estimates.prev_* 칸의 한 줄짜리 흔적 */
  legacy?: { prevTotal?: number | null; prevItems?: string | null; total: number; updatedAt?: string } | null
  compact?: boolean
}) {
  const hasLegacy = legacy && (legacy.prevTotal != null || legacy.prevItems)
  if (!entries.length && !hasLegacy) {
    return <p className={`text-gray-400 ${compact ? 'text-2xs' : 'text-xs'}`}>변경 이력 없음 (처음 작성 그대로)</p>
  }
  const text = compact ? 'text-2xs' : 'text-xs'
  return (
    <ul className="space-y-1">
      {hasLegacy && entries.length === 0 && (
        <li className={`flex items-start gap-2 ${text}`}>
          <History className="h-3 w-3 text-gray-300 mt-0.5 shrink-0" />
          <span className="text-gray-400 shrink-0 font-mono">{legacy!.updatedAt ? formatRevisionAt(legacy!.updatedAt) : '이전'}</span>
          <span className="text-gray-600">
            {legacy!.prevItems ? <>품목 <span className="line-through text-gray-400">{legacy!.prevItems}</span> → 현재 · </> : null}
            {legacy!.prevTotal != null ? <>합계 {legacy!.prevTotal.toLocaleString()} → {legacy!.total.toLocaleString()}</> : null}
            <span className="text-gray-300 ml-1">(상세 기록 전)</span>
          </span>
        </li>
      )}
      {[...entries].reverse().map((e, i) => (
        <li key={i} className={`flex items-start gap-2 ${text}`}>
          <History className="h-3 w-3 text-indigo-300 mt-0.5 shrink-0" />
          <span className="text-gray-500 shrink-0 font-mono" title={formatRevisionAt(e.at, true)}>{formatRevisionAt(e.at)}</span>
          <span className="text-gray-700">
            {e.changes.length ? e.changes.join(' · ') : <span className="text-gray-400">금액·품목은 그대로 (메모·주소 등만 수정)</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}
