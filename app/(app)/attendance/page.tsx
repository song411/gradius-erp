import Header from '@/components/layout/Header'
import AttendanceContent from '@/components/attendance/AttendanceContent'

export default function AttendancePage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="출석 · 평가 관리" subtitle="현장 인원 출석 체크 및 행사 후 평가 입력" />
      <div className="flex-1 overflow-hidden">
        <AttendanceContent />
      </div>
    </div>
  )
}
