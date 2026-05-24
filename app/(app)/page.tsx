import Header from '@/components/layout/Header'
import DashboardContent from '@/components/dashboard/DashboardContent'

export default function DashboardPage() {
  return (
    <div className="flex flex-col h-full">
      <Header
        title="🚀 Gradius 경영 대시보드"
        subtitle="실시간 사업 현황 통합 분석"
      />
      <div className="flex-1 overflow-y-auto p-6">
        <DashboardContent />
      </div>
    </div>
  )
}
