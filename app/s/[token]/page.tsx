import { createAdminClient } from '@/lib/supabase/admin'
import SignClient from './SignClient'
import { AlertCircle } from 'lucide-react'
import type { ContractFields } from '@/lib/laborContract'

// 근로계약서 전자서명 (공개 페이지) — 크루가 카톡으로 받은 링크로 연다
// (app) 그룹 밖에 두어 ERP 사이드바·잠금 레이아웃이 딸려오지 않게 한다 (체크인 /c/ 와 같은 구조).
// 계약서 내용은 여기(서버)에서 token 으로 직접 읽는다. 전화번호 등 확인용 값은 내려보내지 않는다.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: '근로계약서 서명',
  robots: { index: false, follow: false },
}

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const valid = /^[0-9a-f]{32}$/.test(token)
  const supabase = createAdminClient()
  const { data: row } = valid
    ? await supabase
      .from('labor_contracts')
      .select('id, staff_name, variant, fields, status, signed_at, signature_data')
      .eq('token', token)
      .maybeSingle()
    : { data: null }

  // 회사 도장 (021). 표가 없거나 비어 있으면 도장 없이 보여 준다
  const { data: stampRow } = row
    ? await supabase.from('app_assets').select('data_url').eq('id', 'company_stamp').maybeSingle()
    : { data: null }

  if (!row) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gray-50 px-6 text-center">
        <AlertCircle className="h-10 w-10 text-gray-300" />
        <p className="text-gray-700 font-medium">계약서를 찾을 수 없습니다.</p>
        <p className="text-sm text-gray-400">담당자에게 링크를 다시 요청해 주세요.</p>
      </div>
    )
  }

  return (
    <SignClient
      token={token}
      staffName={row.staff_name || ''}
      fields={row.fields as ContractFields}
      status={row.status}
      signedAt={row.signed_at}
      signatureData={row.signature_data}
      stampSrc={stampRow?.data_url || null}
    />
  )
}
