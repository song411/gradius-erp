'use client'

// 관련 기록 바로가기 — 전부 새 탭으로 연다.
// 실무자 의견: 화면이 바로 바뀌어 버려서, 세금계산서를 발행하다 견적이 잘못된 걸 알아도
// 지금 보던 자리를 잃지 않고 그 견적으로 갈 길이 없었다. 돈·운영 화면 어디서든
// 같은 행사의 문의·견적·배정·정산·세금계산서로 건너뛸 수 있게 한다.

import { ExternalLink } from 'lucide-react'

type Target = '문의' | '견적' | '배정' | '정산' | '세금계산서' | '입금' | '고객사' | '현장기록'

export default function RelatedLinks({
  inquiryId, eventName, companyName, hide = [], compact = false, className = '',
}: {
  inquiryId?: string | null
  eventName?: string | null
  companyName?: string | null
  /** 지금 보고 있는 화면은 뺀다 */
  hide?: Target[]
  compact?: boolean
  className?: string
}) {
  const q = encodeURIComponent(eventName || '')
  const links: { key: Target; href: string; title: string }[] = []
  if (inquiryId) links.push({ key: '문의', href: `/inquiries/${inquiryId}`, title: '문의 상세 (견적·배정·정산·지급이 한 화면에)' })
  if (eventName) links.push({ key: '견적', href: `/estimates?tab=all&search=${q}`, title: '이 행사의 견적 (수정·미리보기)' })
  if (inquiryId) links.push({ key: '배정', href: `/assignments?inq=${inquiryId}`, title: '인원 배정 화면에서 이 행사 열기' })
  if (eventName) links.push({ key: '정산', href: `/settlements?search=${q}`, title: '정산/청구 화면' })
  if (eventName) links.push({ key: '세금계산서', href: `/ceo?tab=tax&q=${q}`, title: 'CEO 세금계산서 탭' })
  if (eventName) links.push({ key: '입금', href: `/ceo?tab=deposit&q=${q}`, title: 'CEO 업체 입금 탭' })
  if (companyName) links.push({ key: '고객사', href: `/customers?search=${encodeURIComponent(companyName)}`, title: '고객사 거래 이력' })
  if (inquiryId) links.push({ key: '현장기록', href: `/field?inq=${inquiryId}`, title: '현장 기록 (연장·인원변경·추가지급·부대비용 한 줄 메모)' })

  const shown = links.filter(l => !hide.includes(l.key))
  if (!shown.length) return null

  return (
    <div className={`flex items-center gap-1 flex-wrap ${className}`} onClick={e => e.stopPropagation()}>
      {!compact && <span className="text-2xs text-gray-400 font-semibold mr-0.5">바로가기</span>}
      {shown.map(l => (
        <a
          key={l.key} href={l.href} target="_blank" rel="noopener noreferrer" title={`${l.title} — 새 탭`}
          className={`inline-flex items-center gap-0.5 rounded border border-gray-200 bg-white text-gray-600 hover:text-blue-700 hover:border-blue-300 ${compact ? 'text-2xs px-1 py-0.5' : 'text-xs px-1.5 py-0.5'}`}
        >
          {l.key}<ExternalLink className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
        </a>
      ))}
    </div>
  )
}
