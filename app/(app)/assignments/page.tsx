import { Suspense } from 'react'
import Header from '@/components/layout/Header'
import AssignmentsContent from '@/components/assignments/AssignmentsContent'

export default function AssignmentsPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="인원 배정" subtitle="체결 완료 행사의 인력 배정 관리" />
      <div className="flex-1 overflow-hidden">
        {/* AssignmentsContent가 useSearchParams로 ?inq / ?job 딥링크를 읽으므로
            Suspense 경계가 필요하다 (운영 캘린더에서 넘어오는 링크) */}
        <Suspense fallback={
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        }>
          <AssignmentsContent />
        </Suspense>
      </div>
    </div>
  )
}
