import LabContent from '@/components/lab/LabContent'
import Header from '@/components/layout/Header'

export default function LabPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="스마트연구소"
        subtitle="GUARDIUS LAB — 경호·에이전시 전용 스마트 도구 모음"
      />
      <div className="flex-1 overflow-y-auto">
        <LabContent />
      </div>
    </div>
  )
}
