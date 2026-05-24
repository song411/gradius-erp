import Header from '@/components/layout/Header'
import EstimatesContent from '@/components/estimates/EstimatesContent'

export default function EstimatesPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="견적 관리" subtitle="견적 작성 및 발송 관리" />
      <div className="flex-1 overflow-y-auto p-6">
        <EstimatesContent />
      </div>
    </div>
  )
}
