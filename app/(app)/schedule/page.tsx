import Header from '@/components/layout/Header'
import ScheduleWorkspace from '@/components/schedule/ScheduleWorkspace'

export default function SchedulePage() {
  return (
    <div className="flex flex-col h-full">
      <Header
        title="운영 캘린더"
        subtitle="날짜별 청구·지급 단가와 배정 인원을 한 화면에서 확인합니다"
      />
      <div className="flex-1 overflow-hidden">
        <ScheduleWorkspace />
      </div>
    </div>
  )
}
