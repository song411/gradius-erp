import type { Metadata } from 'next'
import Link from 'next/link'
import { MobileHeader } from '@/components/mobile/ui'
import PushSettings from '@/components/mobile/PushSettings'
import { PenLine, CalendarRange, LayoutDashboard, Smartphone, ChevronRight } from 'lucide-react'

export const metadata: Metadata = { title: '더보기 | 가디어스' }

// 휴대폰 틀에 없는 것으로 가는 문. PC 화면은 휴대폰에서 '데스크탑 모드' 버튼으로 축소해 본다.
const LINKS = [
  { href: '/field',    icon: PenLine,         title: '현장 기록 반영 대기함', desc: '현장에서 적은 한 줄을 지급·부대비용에 반영 (PC 화면)' },
  { href: '/schedule', icon: CalendarRange,   title: '운영 캘린더',           desc: '월·주 달력 (PC 화면)' },
  { href: '/',         icon: LayoutDashboard, title: 'PC 대시보드',           desc: '전체 ERP. 오른쪽 아래 버튼으로 데스크탑 모드 전환' },
]

export default function MobileMorePage() {
  return (
    <div className="max-w-lg mx-auto">
      <MobileHeader kicker="가디어스" title="더보기" />
      <div className="px-4 pt-4 space-y-4">
        <PushSettings />
        <section className="rounded-2xl bg-white border-2 border-gray-200 overflow-hidden">
          {LINKS.map(l => {
            const Icon = l.icon
            return (
              <Link key={l.href} href={l.href} className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 last:border-b-0 active:bg-gray-50">
                <Icon className="h-6 w-6 text-gray-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-gray-900">{l.title}</p>
                  <p className="text-xs text-gray-500">{l.desc}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-300" />
              </Link>
            )
          })}
        </section>

        <section className="rounded-2xl bg-blue-50 border border-blue-200 p-4">
          <p className="font-bold text-blue-900 flex items-center gap-1.5"><Smartphone className="h-5 w-5" />홈 화면에 추가</p>
          <p className="text-sm text-blue-800 mt-1 leading-relaxed">
            아이폰: Safari 공유 버튼 → 홈 화면에 추가<br />
            안드로이드: 브라우저 메뉴(⋮) → 홈 화면에 추가 또는 앱 설치
          </p>
          <p className="text-2xs text-blue-600 mt-2">추가하면 주소창 없이 바로 현장 화면이 열립니다.</p>
        </section>

        <p className="text-2xs text-gray-400 px-1">휴대폰에서는 확인·전화·한 줄 기록·평가까지. 견적 작성, 인원 배정, 정산서 작성은 PC에서 합니다.</p>
      </div>
    </div>
  )
}
