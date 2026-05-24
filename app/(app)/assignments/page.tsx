import Header from '@/components/layout/Header'
import AssignmentsContent from '@/components/assignments/AssignmentsContent'

export default function AssignmentsPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="인원 배정" subtitle="체결 완료 행사의 인력 배정 관리" />
      <div className="flex-1 overflow-hidden">
        <AssignmentsContent />
      </div>
    </div>
  )
}
