import { Suspense } from 'react'
import Header from '@/components/layout/Header'
import CustomersContent from '@/components/customers/CustomersContent'

export default function CustomersPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="고객 관리" subtitle="고객사 정보 및 거래 현황" />
      <div className="flex-1 overflow-y-auto p-6">
        <Suspense fallback={
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        }>
          <CustomersContent />
        </Suspense>
      </div>
    </div>
  )
}
