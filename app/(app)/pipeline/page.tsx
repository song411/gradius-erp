import Header from '@/components/layout/Header'
import PipelineContent from '@/components/pipeline/PipelineContent'

export default function PipelinePage() {
  return (
    <div className="flex flex-col h-full">
      <Header
        title="영업 보드"
        subtitle="체결 전 현황 — 견적 발송·답변 대기·다음 할 일을 한 화면에서 봅니다"
      />
      <div className="flex-1 overflow-y-auto p-6">
        <PipelineContent />
      </div>
    </div>
  )
}
