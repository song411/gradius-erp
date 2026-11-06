import { createAdminClient } from '@/lib/supabase/admin'
import GroupSignClient, { type GroupItem } from './GroupSignClient'
import { AlertCircle } from 'lucide-react'

// 행사 공용 서명 링크 (공개 페이지) — 단톡방에 하나만 올리고, 크루가 자기 이름을 눌러 서명한다
// 체크인(/c/행사id)과 같은 구조. 여기서는 이름과 서명 여부만 보여 주고, 계약서 본문은
// 뒷 4자리 확인(/api/sign/find)을 거쳐 개인 링크(/s/token)로 넘어가야 보인다.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: '근로계약서 서명',
  robots: { index: false, follow: false },
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function GroupSignPage({ params }: { params: Promise<{ inquiryId: string }> }) {
  const { inquiryId } = await params
  const supabase = createAdminClient()
  const { data: inq } = UUID_RE.test(inquiryId)
    ? await supabase.from('inquiries').select('id, event_name, company_name, event_start, event_end').eq('id', inquiryId).maybeSingle()
    : { data: null }

  if (!inq) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gray-50 px-6 text-center">
        <AlertCircle className="h-10 w-10 text-gray-300" />
        <p className="text-gray-700 font-medium">행사를 찾을 수 없습니다.</p>
        <p className="text-sm text-gray-400">담당자에게 링크를 다시 요청해 주세요.</p>
      </div>
    )
  }

  // 배정마다 가장 최근 링크 하나 (취소 제외). 전화번호는 내려보내지 않고 "있는지"만
  const { data: rows } = await supabase
    .from('labor_contracts')
    .select('id, assignment_id, staff_name, status, phone, created_at')
    .eq('inquiry_id', inquiryId)
    .neq('status', '취소')
    .order('created_at', { ascending: false })
  const seen = new Set<string>()
  const items: GroupItem[] = []
  for (const r of rows || []) {
    if (seen.has(r.assignment_id)) continue
    seen.add(r.assignment_id)
    items.push({ id: r.id, name: r.staff_name || '(이름 없음)', signed: r.status === '서명완료', hasPhone: String(r.phone || '').replace(/\D/g, '').length >= 4 })
  }
  items.sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  return (
    <GroupSignClient
      eventName={inq.event_name || ''}
      companyName={inq.company_name || ''}
      period={[inq.event_start, inq.event_end].filter(Boolean).map(d => String(d).slice(0, 10)).filter((d, i, arr) => arr.indexOf(d) === i).join(' ~ ')}
      items={items}
    />
  )
}
