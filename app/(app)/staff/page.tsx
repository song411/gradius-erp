import { Suspense } from 'react'
import Header from '@/components/layout/Header'
import StaffContent from '@/components/staff/StaffContent'

export default function StaffPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="크루 관리" subtitle="크루 정보 · 평가점수 · 배정 이력 관리" />
      <div className="flex-1 overflow-y-auto p-6">
        <Suspense fallback={
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        }>
          <StaffContent />
        </Suspense>
      </div>
    </div>
  )
}
