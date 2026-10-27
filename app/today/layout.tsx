import type { Metadata } from 'next'

// 휴대폰 전용 화면 — (app) 그룹 밖에 두어 사이드바가 붙지 않는다.
// 잠금(proxy.ts)은 그대로 걸린다: 공개 경로가 아니므로 erp_access 쿠키가 있어야 열린다.
export const metadata: Metadata = {
  title: '오늘 현장 | 가디어스',
}

export default function TodayLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-gray-50">{children}</div>
}
