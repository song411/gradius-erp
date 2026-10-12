import { Suspense } from 'react'
import Header from '@/components/layout/Header'
import CeoContent from '@/components/ceo/CeoContent'

export default function CeoPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="CEO 전용" subtitle="경영현황 · 세금계산서 · 지급 · 입금 · 수익보고" />
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        }>
          <CeoContent />
        </Suspense>
      </div>
    </div>
  )
}
