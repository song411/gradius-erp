import Header from '@/components/layout/Header'
import CustomersContent from '@/components/customers/CustomersContent'

export default function CustomersPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="고객 관리" subtitle="고객사 정보 및 거래 현황" />
      <div className="flex-1 overflow-y-auto p-6">
        <CustomersContent />
      </div>
    </div>
  )
}
