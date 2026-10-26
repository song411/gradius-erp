import { Suspense } from 'react'
import Header from '@/components/layout/Header'
import FieldLogContent from '@/components/field/FieldLogContent'

export default function FieldPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="현장 기록" subtitle="현장에서 한 줄 — 연장·인원변경·추가지급·부대비용. 숫자 반영은 사무실에서" />
      <div className="flex-1 overflow-y-auto">
        <Suspense fallback={null}>
          <FieldLogContent />
        </Suspense>
      </div>
    </div>
  )
}
