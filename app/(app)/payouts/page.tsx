import Header from '@/components/layout/Header'
import PayoutsContent from '@/components/payouts/PayoutsContent'

export default function PayoutsPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="지급 관리" subtitle="배정 확정 인력의 지급 요청 · 확인 · 완료 처리" />
      <div className="flex-1 overflow-hidden">
        <PayoutsContent />
      </div>
    </div>
  )
}
