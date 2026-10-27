import type { Metadata } from 'next'
import MobileTabs from '@/components/mobile/MobileTabs'

// 휴대폰 틀 — (app) 그룹 밖이라 사이드바가 안 붙는다. 잠금(proxy.ts)은 그대로.
// 아래 탭 다섯 개: 현장 / 할 일 / 돈 / 검색 / 더보기.
// 여기서 하는 일은 확인·전화·한 줄 쓰기까지. 견적·배정·정산 작성은 PC.
export const metadata: Metadata = {
  title: '가디어스 모바일',
}

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-gray-50 pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
      {children}
      <MobileTabs />
    </div>
  )
}
