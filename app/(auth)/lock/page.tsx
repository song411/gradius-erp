'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Shield, Eye, EyeOff, Loader2 } from 'lucide-react'

// useSearchParams는 Suspense 경계 안에서만 사용 가능
function LockForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('from') || '/'

  const [code, setCode] = useState('')
  const [show, setShow] = useState(false)
  const [remember, setRemember] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), remember }),
      })

      if (res.ok) {
        router.replace(redirectTo)
      } else {
        const data = await res.json()
        setError(data.error || '코드가 올바르지 않습니다.')
        setCode('')
        setShake(true)
        setTimeout(() => setShake(false), 600)
        inputRef.current?.focus()
      }
    } catch {
      setError('서버 연결 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      {/* 배경 패턴 */}
      <div className="absolute inset-0 opacity-5" style={{
        backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
        backgroundSize: '32px 32px',
      }} />

      <div className={`relative w-full max-w-sm transition-transform ${shake ? 'animate-[wiggle_0.5s_ease-in-out]' : ''}`}
        style={shake ? { animation: 'shake 0.5s ease-in-out' } : {}}>

        {/* 카드 */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">

          {/* 상단 헤더 */}
          <div className="bg-gray-900 px-8 py-8 text-center">
            <div className="flex items-center justify-center mb-4">
              <div className="w-14 h-14 rounded-xl bg-white flex items-center justify-center overflow-hidden shadow-lg">
                <Image
                  src="/logo.png"
                  alt="GUARDIUS"
                  width={52}
                  height={52}
                  className="object-contain"
                  onError={(e) => {
                    const el = e.currentTarget as HTMLImageElement
                    el.style.display = 'none'
                    const p = el.parentElement
                    if (p) {
                      p.classList.add('bg-amber-500')
                      p.innerHTML = '<span class="text-white font-black text-2xl">G</span>'
                    }
                  }}
                />
              </div>
            </div>
            <p className="text-gray-400 text-xs font-medium tracking-widest uppercase mb-1">주식회사 가디어스</p>
            <h1 className="text-white font-extrabold text-xl tracking-wide">GUARDIUS ERP</h1>
          </div>

          {/* 잠금 아이콘 + 안내 */}
          <div className="px-8 pt-7 pb-2 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-50 mb-3">
              <Shield className="h-6 w-6 text-blue-600" />
            </div>
            <p className="text-gray-800 font-semibold text-base">접근 코드 입력</p>
            <p className="text-gray-400 text-xs mt-1">승인된 사용자만 접근할 수 있습니다.</p>
          </div>

          {/* 폼 */}
          <form onSubmit={handleSubmit} className="px-8 pb-8 pt-4 space-y-4">
            {/* 코드 입력 */}
            <div className="relative">
              <input
                ref={inputRef}
                type={show ? 'text' : 'password'}
                value={code}
                onChange={e => { setCode(e.target.value); setError('') }}
                placeholder="접근 코드 입력"
                className={`w-full h-12 px-4 pr-11 rounded-xl border-2 text-sm font-mono tracking-widest transition-colors outline-none ${
                  error
                    ? 'border-red-400 bg-red-50 focus:border-red-500'
                    : 'border-gray-200 bg-gray-50 focus:border-blue-500 focus:bg-white'
                }`}
                autoComplete="off"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShow(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* 에러 메시지 */}
            {error && (
              <p className="text-red-500 text-xs text-center font-medium">
                ⚠️ {error}
              </p>
            )}

            {/* 기억하기 */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
                className="w-4 h-4 rounded accent-blue-600"
              />
              <span className="text-xs text-gray-500">30일 동안 기억하기</span>
            </label>

            {/* 접속 버튼 */}
            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" />확인 중...</>
              ) : (
                'ERP 접속'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-600 text-xs mt-4">
          © 2026 주식회사 가디어스. All rights reserved.
        </p>
      </div>

      {/* shake 애니메이션 */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  )
}

// 페이지 컴포넌트: Suspense로 감싸서 useSearchParams 허용
export default function LockPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
      </div>
    }>
      <LockForm />
    </Suspense>
  )
}
