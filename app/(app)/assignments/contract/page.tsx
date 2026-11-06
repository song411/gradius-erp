import { Suspense } from 'react'
import Header from '@/components/layout/Header'
import LaborContractContent from '@/components/contracts/LaborContractContent'

// 근로계약서 만들기 — 인원 배정 화면의 계약서 버튼으로 들어온다 (?a=배정id 또는 ?inq=문의id)
export default function LaborContractPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="근로계약서" subtitle="배정·문의·크루 정보로 채운 일용직 근로계약서. 고친 뒤 인쇄하세요" />
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        }>
          <LaborContractContent />
        </Suspense>
      </div>
    </div>
  )
}
