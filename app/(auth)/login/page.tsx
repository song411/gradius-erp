'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LogIn } from 'lucide-react'

export default function LoginPage() {
  const supabase = createClient()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error: err } = await supabase.auth.signInWithPassword({ email, password })

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* 로고 */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white font-bold text-3xl">G</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Gradius ERP</h1>
          <p className="text-gray-500 text-sm mt-1">인력파견 통합 관리 시스템</p>
        </div>

        {/* 로그인 폼 */}
        <form onSubmit={handleLogin} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">이메일</label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@gradius.co.kr"
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">비밀번호</label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="비밀번호 입력"
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              {error === 'Invalid login credentials'
                ? '이메일 또는 비밀번호가 올바르지 않습니다.'
                : error}
            </div>
          )}

          <Button type="submit" className="w-full h-11" disabled={loading}>
            <LogIn className="h-4 w-4" />
            {loading ? '로그인 중...' : '로그인'}
          </Button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          © 2026 Gradius. All rights reserved.
        </p>
      </div>
    </div>
  )
}
