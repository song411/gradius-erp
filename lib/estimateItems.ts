// 견적 품목을 어느 견적에 붙일 것인가
// ─────────────────────────────────────────────────────────
// estimate_items 에는 estimate_id 와 inquiry_id 가 둘 다 있다. 예전 화면들은
// inquiry_id 로만 품목을 찾았다. 견적이 한 문의에 한 장이던 시절엔 문제가 없었는데,
// A안/B안을 나누면서부터 두 견적이 서로의 품목까지 전부 받아 갔다.
//
// 더 나쁜 건 저장이었다 — B안을 열면 A안 품목까지 섞여 보이고, 그대로 저장하면
// B안의 품목이 'A안+B안'으로 덮여 두 안이 한 덩어리가 됐다 (사장님 신고: "AB가 합쳐진다").
//
// 규칙: 품목은 estimate_id 로 찾는다. estimate_id 가 빈 아주 오래된 행(실측 2줄)만
// inquiry_id 로 그 문의의 견적에 붙인다. 품목이 필요한 화면은 전부 여기를 쓴다.

import type { Estimate, EstimateItem } from '@/lib/supabase/types'

type Est = Pick<Estimate, 'id' | 'inquiry_id'> & Partial<Pick<Estimate, 'is_final' | 'created_at'>>

/** 각 견적에 자기 품목만 붙인다. sort_order 순서는 입력 순서를 그대로 따른다. */
export function attachItems<E extends Est>(
  estimates: E[],
  items: EstimateItem[],
): (E & { estimate_items: EstimateItem[] })[] {
  const byEstimate = new Map<string, EstimateItem[]>()
  const orphansByInquiry = new Map<string, EstimateItem[]>()
  items.forEach(it => {
    if (it.estimate_id) {
      const list = byEstimate.get(it.estimate_id) || []
      list.push(it); byEstimate.set(it.estimate_id, list)
    } else if (it.inquiry_id) {
      const list = orphansByInquiry.get(it.inquiry_id) || []
      list.push(it); orphansByInquiry.set(it.inquiry_id, list)
    }
  })
  return estimates.map(est => {
    const own = byEstimate.get(est.id)
    if (own && own.length) return { ...est, estimate_items: own }
    return { ...est, estimate_items: est.inquiry_id ? (orphansByInquiry.get(est.inquiry_id) || []) : [] }
  })
}

/** 한 견적의 품목만 고른다. */
export function itemsOfEstimate(estimateId: string, inquiryId: string | undefined, items: EstimateItem[]): EstimateItem[] {
  const own = items.filter(it => it.estimate_id === estimateId)
  if (own.length) return own
  return inquiryId ? items.filter(it => !it.estimate_id && it.inquiry_id === inquiryId) : []
}

/** 문의 하나를 대표하는 견적 — 최종 확정본이 있으면 그것, 없으면 가장 최근 것. */
export function representativeEstimate<E extends Est>(inquiryId: string | undefined, estimates: E[]): E | undefined {
  if (!inquiryId) return undefined
  const mine = estimates.filter(e => e.inquiry_id === inquiryId)
  if (!mine.length) return undefined
  const fin = mine.find(e => e.is_final)
  if (fin) return fin
  return [...mine].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0]
}

/** 정산·세금계산서·입금 화면이 "이 행사의 품목"을 물을 때 쓰는 것.
 *  확정 견적의 품목만 돌려준다. 확정본이 없으면 가장 최근 견적의 품목. */
export function itemsOfInquiry(inquiryId: string | undefined, estimates: Est[], items: EstimateItem[]): EstimateItem[] {
  const est = representativeEstimate(inquiryId, estimates)
  if (est) return itemsOfEstimate(est.id, inquiryId, items)
  // 견적 행 자체가 없는 아주 예전 데이터 — 문의로만 찾는다
  return inquiryId ? items.filter(it => it.inquiry_id === inquiryId) : []
}
