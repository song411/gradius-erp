'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, MessageSquare, FileText, Users, UserCheck,
  Calculator, CreditCard, ClipboardList, Search, TrendingUp,
  ChevronLeft, ChevronRight, Building2, Handshake
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  { href: '/ceo', label: 'CEO 전용', icon: TrendingUp },
  { href: '/', label: '대시보드', icon: LayoutDashboard },
  { href: '/inquiries', label: '문의 관리', icon: MessageSquare },
  { href: '/estimates', label: '견적 관리', icon: FileText },
  { href: '/closings', label: '체결 관리', icon: Handshake },
  { href: '/assignments', label: '인원 배정', icon: UserCheck },
  { href: '/payouts', label: '지급 관리', icon: Calculator },
  { href: '/settlements', label: '정산/청구', icon: CreditCard },
  { href: '/staff', label: '크루 관리', icon: Users },
  { href: '/customers', label: '고객 관리', icon: Building2 },
  { href: '/attendance', label: '출석부', icon: ClipboardList },
  { href: '/search', label: '통합검색', icon: Search },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-gray-900 text-white transition-all duration-300 shrink-0',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* 로고 */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-700">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-sm">G</span>
        </div>
        {!collapsed && (
          <div>
            <span className="text-white font-bold text-base">Gradius</span>
            <p className="text-gray-400 text-xs">인력파견 ERP</p>
          </div>
        )}
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 px-2">
        {navItems.map((item, idx) => {
          const Icon = item.icon
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href))
          const isCeo = item.href === '/ceo'

          return (
            <div key={item.href}>
              {/* CEO 전용 메뉴 아래 구분선 */}
              {idx === 1 && (
                <div className={cn('my-1.5', collapsed ? 'mx-1' : 'mx-2')}>
                  <div className="border-t border-gray-700" />
                </div>
              )}
              <Link
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isCeo
                    ? isActive
                      ? 'bg-amber-500 text-white'
                      : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300'
                    : isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && (
                  <span className="flex-1">{item.label}</span>
                )}
              </Link>
            </div>
          )
        })}
      </nav>

      {/* 접기 버튼 */}
      <div className="p-3 border-t border-gray-700">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-full h-9 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <ChevronLeft className="h-4 w-4" />
              <span>메뉴 접기</span>
            </div>
          )}
        </button>
      </div>
    </aside>
  )
}
