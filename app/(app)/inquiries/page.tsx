import { Suspense } from 'react'
import Header from '@/components/layout/Header'
import InquiriesContent from '@/components/inquiries/InquiriesContent'

export default function InquiriesPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="문의 관리" subtitle="고객 문의 접수 및 상태 관리" />
      <div className="flex-1 overflow-y-auto p-6">
        <Suspense fallback={
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        }>
          <InquiriesContent />
        </Suspense>
      </div>
    </div>
  )
}
