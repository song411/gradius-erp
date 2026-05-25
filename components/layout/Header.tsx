'use client'

import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

interface HeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode   /* 우측 커스텀 액션 영역 */
  stats?: React.ReactNode     /* 제목 옆 미니 스탯 */
}

export default function Header({ title, subtitle, actions, stats }: HeaderProps) {
  const router = useRouter()

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-white border-b-2 border-gray-200 shrink-0 shadow-sm">
      <div className="flex items-center gap-4 min-w-0">
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold text-gray-900 leading-tight">{title}</h1>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-0.5 font-medium">{subtitle}</p>
          )}
        </div>
        {stats && (
          <div className="hidden md:flex items-center gap-2">
            {stats}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {actions}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.refresh()}
          title="새로고침"
          className="text-gray-400 hover:text-gray-700 hover:bg-gray-100"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
