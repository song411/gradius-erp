import { Suspense } from 'react'
import Header from '@/components/layout/Header'
import SettlementsContent from '@/components/settlements/SettlementsContent'

export default function SettlementsPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="정산/청구" subtitle="청구서 발행 및 수금 관리" />
      <div className="flex-1 overflow-y-auto p-6">
        <Suspense fallback={
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        }>
          <SettlementsContent />
        </Suspense>
      </div>
    </div>
  )
}
