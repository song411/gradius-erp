'use client'

// 휴대폰 틀의 공용 조각 — 상단 바, 숫자 타일, 접히는 카드
import Link from 'next/link'
import { RefreshCw, Monitor, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

export function MobileHeader({ kicker = '가디어스', title, sub, onRefresh, loading }: {
  kicker?: string; title: React.ReactNode; sub?: React.ReactNode; onRefresh?: () => void; loading?: boolean
}) {
  return (
    <header className="sticky top-0 z-20 bg-gray-900 text-white px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-2xs text-gray-400 font-semibold tracking-wider">{kicker}</p>
        <h1 className="text-lg font-extrabold leading-tight">{title}{sub && <span className="text-gray-300 font-semibold"> {sub}</span>}</h1>
      </div>
      {onRefresh && (
        <button onClick={onRefresh} disabled={loading} title="새로고침"
          className="h-11 w-11 rounded-full bg-gray-800 flex items-center justify-center active:scale-95">
          <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      )}
      <Link href="/" title="PC 화면으로" className="h-11 w-11 rounded-full bg-gray-800 flex items-center justify-center active:scale-95">
        <Monitor className="h-5 w-5" />
      </Link>
    </header>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl bg-red-50 border border-red-200 p-4">
      <p className="font-bold text-red-800">불러오지 못했습니다</p>
      <p className="text-sm text-red-700 mt-1 break-all">{message}</p>
      <button onClick={onRetry} className="mt-3 h-11 px-5 rounded-xl bg-red-600 text-white font-bold">다시 시도</button>
    </div>
  )
}

/** 큰 숫자 하나 */
export function Tile({ label, value, sub, tone = 'default' }: {
  label: string; value: string; sub?: string; tone?: 'default' | 'good' | 'bad' | 'warn'
}) {
  const color = tone === 'good' ? 'text-green-700' : tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-700' : 'text-gray-900'
  return (
    <div className="rounded-2xl bg-white border-2 border-gray-200 p-3">
      <p className="text-2xs font-bold text-gray-500 tracking-wider">{label}</p>
      <p className={`text-xl font-extrabold leading-tight mt-0.5 break-keep ${color}`}>{value}</p>
      {sub && <p className="text-2xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

/** 머리에 건수·금액, 누르면 목록이 펼쳐지는 카드. 건수가 0이면 흐리게. */
export function CountCard({ title, count, amount, hint, tone = 'default', pcHref, pcLabel = 'PC에서 처리', children }: {
  title: string; count: number; amount?: string; hint?: string
  tone?: 'default' | 'bad' | 'warn' | 'good'; pcHref?: string; pcLabel?: string; children?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const zero = count === 0
  const border = zero ? 'border-gray-200' : tone === 'bad' ? 'border-red-300' : tone === 'warn' ? 'border-amber-300' : tone === 'good' ? 'border-green-300' : 'border-gray-300'
  const num = zero ? 'text-gray-300' : tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-700' : tone === 'good' ? 'text-green-700' : 'text-gray-900'
  return (
    <article className={`rounded-2xl bg-white border-2 ${border} overflow-hidden ${zero ? 'opacity-70' : ''}`}>
      <button onClick={() => !zero && setOpen(v => !v)} className="w-full text-left p-4 flex items-center gap-3 active:bg-gray-50" disabled={zero}>
        <div className="flex-1 min-w-0">
          <p className="text-base font-extrabold text-gray-900">{title}</p>
          {hint && <p className="text-2xs text-gray-400 mt-0.5">{hint}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className={`text-2xl font-extrabold leading-none ${num}`}>{count}<span className="text-sm font-bold ml-0.5">건</span></p>
          {amount && !zero && <p className="text-xs font-bold text-gray-600 mt-1">{amount}</p>}
        </div>
        {!zero && (open ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />)}
      </button>
      {open && (
        <div className="border-t border-gray-100">
          {children}
          {pcHref && (
            <Link href={pcHref} className="block text-center text-sm font-bold text-blue-700 py-3 border-t border-gray-100 active:bg-blue-50">{pcLabel} →</Link>
          )}
        </div>
      )}
    </article>
  )
}

/** 목록 한 줄: 제목·설명·오른쪽 값·전화 */
export function Row({ title, desc, right, tel, tone }: {
  title: string; desc?: string; right?: string; tel?: string | null; tone?: 'bad' | 'warn' | 'good'
}) {
  const clean = (tel || '').replace(/[^0-9+]/g, '')
  const rc = tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-700' : tone === 'good' ? 'text-green-700' : 'text-gray-900'
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900 break-keep">{title}</p>
        {desc && <p className="text-xs text-gray-500 break-keep">{desc}</p>}
      </div>
      {right && <p className={`text-sm font-extrabold shrink-0 ${rc}`}>{right}</p>}
      {clean && (
        <a href={`tel:${clean}`} className="h-10 w-10 rounded-full bg-green-600 text-white flex items-center justify-center shrink-0 active:scale-95" title="전화">
          <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
        </a>
      )}
    </div>
  )
}

export function More({ n }: { n: number }) {
  return n > 0 ? <p className="text-2xs text-gray-400 px-4 py-2">외 {n}건 — 전체는 PC에서</p> : null
}
