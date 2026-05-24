'use client'

import { Bell, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

interface HeaderProps {
  title: string
  subtitle?: string
}

export default function Header({ title, subtitle }: HeaderProps) {
  const router = useRouter()

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.refresh()}
          title="새로고침"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" title="알림">
          <Bell className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
