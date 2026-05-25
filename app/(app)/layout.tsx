import Sidebar from '@/components/layout/Sidebar'
import PageTransition from '@/components/layout/PageTransition'

// ERP 메인 레이아웃 (사이드바 포함)
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <PageTransition>
          {children}
        </PageTransition>
      </main>
    </div>
  )
}
