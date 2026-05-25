import AdminContent from '@/components/admin/AdminContent'
import Header from '@/components/layout/Header'

export default function AdminPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="DB 관리자"
        subtitle="Supabase 데이터베이스 직접 조회 · 수정 — 주의해서 사용하세요"
      />
      <div className="flex-1 overflow-hidden">
        <AdminContent />
      </div>
    </div>
  )
}
