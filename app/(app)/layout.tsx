import Sidebar from '@/components/layout/Sidebar'

// ERP 메인 레이아웃 (사이드바 포함)
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
