import Header from '@/components/layout/Header'
import InquiryDetail from '@/components/inquiries/InquiryDetail'

// Next.js 16: params가 Promise로 처리됨
export default async function InquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div className="flex flex-col h-full">
      <Header title="문의 상세" subtitle="문의 정보 및 연관 데이터 확인" />
      <div className="flex-1 overflow-y-auto p-6">
        <InquiryDetail id={id} />
      </div>
    </div>
  )
}
