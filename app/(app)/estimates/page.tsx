import { Suspense } from 'react'
import Header from '@/components/layout/Header'
import EstimatesContent from '@/components/estimates/EstimatesContent'

export default function EstimatesPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="견적 관리" subtitle="견적 작성 및 발송 관리" />
      <div className="flex-1 overflow-y-auto p-6">
        <Suspense fallback={
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        }>
          <EstimatesContent />
        </Suspense>
      </div>
    </div>
  )
}
