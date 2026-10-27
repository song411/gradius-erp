'use client'

// 휴대폰 틀의 아래 탭 — 현장 / 할 일 / 돈 / 검색 / 더보기
// 휴대폰에서 하는 일은 '확인하고, 전화하고, 한 줄 적는 것'까지다. 복잡한 작업은 PC로 보낸다.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarCheck, ListTodo, Wallet, Search, MoreHorizontal } from 'lucide-react'

const TABS = [
  { href: '/m/today',  label: '현장',   icon: CalendarCheck },
  { href: '/m/todo',   label: '할 일',  icon: ListTodo },
  { href: '/m/money',  label: '돈',     icon: Wallet },
  { href: '/m/search', label: '검색',   icon: Search },
  { href: '/m/more',   label: '더보기', icon: MoreHorizontal },
]

export default function MobileTabs() {
  const pathname = usePathname()
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]">
      <ul className="max-w-lg mx-auto grid grid-cols-5">
        {TABS.map(t => {
          const Icon = t.icon
          const active = pathname === t.href || pathname.startsWith(t.href + '/')
          return (
            <li key={t.href}>
              <Link href={t.href} className={`flex flex-col items-center justify-center h-14 gap-0.5 ${active ? 'text-gray-900' : 'text-gray-400'}`}>
                <Icon className={`h-6 w-6 ${active ? 'stroke-[2.5]' : ''}`} />
                <span className={`text-2xs ${active ? 'font-extrabold' : 'font-semibold'}`}>{t.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
