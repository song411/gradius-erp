import Header from '@/components/layout/Header'
import ContractsContent from '@/components/contracts/ContractsContent'

export default function ContractsPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="계약/배정" subtitle="인력 배정 및 계약 관리" />
      <div className="flex-1 overflow-y-auto p-6">
        <ContractsContent />
      </div>
    </div>
  )
}
