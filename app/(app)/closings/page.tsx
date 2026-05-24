import Header from '@/components/layout/Header'
import ClosingsContent from '@/components/closings/ClosingsContent'

export default function ClosingsPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="체결 관리" subtitle="세금계산서 발행 현황 · 입금 관리 (settlements 기반)" />
      <div className="flex-1 overflow-y-auto p-6">
        <ClosingsContent />
      </div>
    </div>
  )
}
