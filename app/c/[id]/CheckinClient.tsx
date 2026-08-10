'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, MapPin, CalendarDays, Clock } from 'lucide-react'
import type { CheckinView, RosterItem } from '@/lib/checkin'

function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr)
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${day})`
}

export default function CheckinClient({
  inquiryId,
  view,
}: {
  inquiryId: string
  view: CheckinView
}) {
  const router = useRouter()
  // 서버 컴포넌트 재조회(router.refresh) 완료까지 대기 상태 유지
  const [refreshing, startRefresh] = useTransition()
  const [pending, setPending] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function act(item: RosterItem, action: 'checkin' | 'cancel') {
    if (pending) return
    if (action === 'cancel' && !confirm(`${item.name}님 출석을 취소할까요?`)) return

    setPending(item.assignmentId)
    setNotice(null)
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inquiryId, assignmentId: item.assignmentId, action }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNotice(json.error || '처리하지 못했습니다.')
        return
      }
      startRefresh(() => router.refresh())
    } catch {
      setNotice('연결에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setPending(null)
    }
  }

  const doneCount = view.roster.filter(r => r.status).length

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-200 px-5 py-4">
        <p className="text-xs text-gray-400">{view.companyName}</p>
        <h1 className="text-lg font-bold text-gray-900 mt-0.5">{view.eventName}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />{formatDateLong(view.workDate)}
          </span>
          {view.eventTime && (
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{view.eventTime}</span>
          )}
          {view.location && (
            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{view.location}</span>
          )}
        </div>
      </div>

      {/* 행사 당일이 아닐 때 안내 */}
      {!view.isToday && (
        <div className="mx-4 mt-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-800">
          오늘은 행사일이 아닙니다. <b>{formatDateLong(view.workDate)}</b> 출석으로 기록됩니다.
        </div>
      )}

      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">본인 이름을 눌러주세요</p>
        <span className="text-xs text-gray-400">{doneCount}/{view.roster.length}명 완료</span>
      </div>

      {notice && (
        <div className="mx-4 mb-2 rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-xs text-red-700">
          {notice}
        </div>
      )}

      {/* 명단 */}
      <div className="px-4 space-y-2">
        {view.roster.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-10">배정된 인원이 없습니다.</p>
        )}
        {view.roster.map(item => {
          const checked = !!item.status
          const busy = pending === item.assignmentId || refreshing
          const canCancel = checked && item.selfCheckin && item.status === '출석'
          return (
            <div
              key={item.assignmentId}
              className={`rounded-2xl border px-4 py-3.5 flex items-center gap-3 transition-colors ${
                checked ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'
              }`}
            >
              <button
                onClick={() => !checked && act(item, 'checkin')}
                disabled={checked || busy}
                className="flex-1 flex items-center gap-3 text-left disabled:cursor-default"
              >
                <div className={`w-11 h-11 rounded-full flex items-center justify-center text-base font-bold shrink-0 ${
                  checked ? 'bg-green-500 text-white' : 'bg-blue-100 text-blue-700'
                }`}>
                  {checked ? <CheckCircle2 className="h-6 w-6" /> : item.name[0]}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-semibold text-gray-900">{item.name}</span>
                    {item.isLeader && (
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">팀장</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {checked
                      ? `${item.status}${item.clockIn ? ` · ${item.clockIn}` : ''}`
                      : item.jobType || '탭하여 출석'}
                  </p>
                </div>
              </button>

              {pending === item.assignmentId ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 shrink-0" />
              ) : canCancel ? (
                <button
                  onClick={() => act(item, 'cancel')}
                  disabled={busy}
                  className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 shrink-0 disabled:opacity-40"
                >
                  취소
                </button>
              ) : !checked ? (
                <span className="text-xs font-bold text-blue-600 shrink-0">출석</span>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
