import Header from '@/components/layout/Header'
import AttendanceContent from '@/components/attendance/AttendanceContent'

export default function AttendancePage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="출석부" subtitle="직원 근태 기록 관리" />
      <div className="flex-1 overflow-y-auto p-6">
        <AttendanceContent />
      </div>
    </div>
  )
}
