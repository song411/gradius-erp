'use client'

// 현장 코드·QR 패널 — 팀장이 크루에게 보여 주는 화면. 10분마다 바뀌고, 20초마다 다시 받아 온다.
// 코드 자체는 서버(lib/checkinCode)가 만든다. 여기서는 보여 주기만.

import { useEffect, useState } from 'react'
import { QrCode, RefreshCw } from 'lucide-react'

export default function SiteCodePanel({ inquiryId }: { inquiryId: string }) {
  const [data, setData] = useState<{ code: string; secondsLeft: number; svg: string } | null>(null)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const res = await fetch(`/api/site-code?inq=${inquiryId}`, { cache: 'no-store' })
        const json = await res.json()
        if (!alive) return
        if (!res.ok) { setError(json.error || '코드를 못 받았습니다'); return }
        setData(json); setError('')
      } catch { if (alive) setError('연결 실패') }
    }
    load()
    const t = setInterval(load, 20_000)
    return () => { alive = false; clearInterval(t) }
  }, [inquiryId, tick])

  // 남은 시간 표시용 1초 카운트다운
  useEffect(() => {
    if (!data) return
    const t = setInterval(() => setData(d => d ? { ...d, secondsLeft: Math.max(0, d.secondsLeft - 1) } : d), 1000)
    return () => clearInterval(t)
  }, [data?.code])  // eslint-disable-line react-hooks/exhaustive-deps

  const mm = data ? Math.floor(data.secondsLeft / 60) : 0
  const ss = data ? String(data.secondsLeft % 60).padStart(2, '0') : '00'

  return (
    <div className="mt-2 mb-3 rounded-2xl border-2 border-gray-900 bg-white p-4 text-center">
      <p className="text-sm font-extrabold text-gray-900 flex items-center justify-center gap-1"><QrCode className="h-4 w-4" />현장 출석 QR · 코드</p>
      <p className="text-2xs text-gray-500 mt-0.5">크루에게 이 화면을 보여 주세요. QR을 찍거나 아래 숫자를 넣어야 출석이 됩니다.</p>
      {error ? (
        <p className="text-sm text-red-600 mt-3">{error}</p>
      ) : !data ? (
        <p className="text-sm text-gray-400 mt-3">불러오는 중…</p>
      ) : (
        <>
          <div className="mx-auto mt-3 w-[240px] max-w-full" dangerouslySetInnerHTML={{ __html: data.svg }} />
          <p className="mt-2 text-4xl font-black tracking-[0.3em] text-gray-900 tabular-nums">{data.code}</p>
          <p className="text-xs text-gray-500 mt-1">{mm}분 {ss}초 뒤 새 코드로 바뀝니다 (바뀐 뒤 10분까지는 이전 코드도 됩니다)</p>
        </>
      )}
      <button type="button" onClick={() => setTick(t => t + 1)} className="mt-2 h-9 px-3 rounded-full border-2 border-gray-300 text-xs font-bold text-gray-600 inline-flex items-center gap-1 active:scale-95"><RefreshCw className="h-3.5 w-3.5" />새로고침</button>
    </div>
  )
}
