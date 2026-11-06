import { getCheckinView } from '@/lib/checkin'
import CheckinClient from './CheckinClient'
import { AlertCircle } from 'lucide-react'

// 크루 셀프 출석 체크인 (공개 페이지)
// (app) 그룹 밖에 두어 ERP 사이드바·잠금 레이아웃이 딸려오지 않게 한다.
// 명단은 여기(서버)에서 직접 조회하므로 공개 GET API가 필요 없다.
// ?k=현장코드 — 팀장 화면의 QR 을 찍고 들어오면 코드가 미리 채워진다 (lib/checkinCode)
export const dynamic = 'force-dynamic'

export const metadata = {
  title: '출석 체크',
  robots: { index: false, follow: false },   // 링크가 검색에 노출되지 않도록
}

export default async function CheckinPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ k?: string }>
}) {
  const { id } = await params
  const { k } = await searchParams
  const view = await getCheckinView(id)

  if (!view) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gray-50 px-6 text-center">
        <AlertCircle className="h-10 w-10 text-gray-300" />
        <p className="text-gray-700 font-medium">행사를 찾을 수 없습니다.</p>
        <p className="text-sm text-gray-400">담당자에게 링크를 다시 요청해주세요.</p>
      </div>
    )
  }

  return <CheckinClient inquiryId={id} view={view} codeFromQr={(k || '').replace(/\D/g, '').slice(0, 6)} />
}
