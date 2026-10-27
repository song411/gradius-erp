// 현장 기록 → 견적 품목 초안
// ─────────────────────────────────────────────────────────
// "2시간 연장, 전원" 같은 기록을 견적 빌더에 미리 채워진 품목 한 줄로 바꾼다.
// 여기서는 초안만 만든다. 단가 확인과 저장은 사람이 빌더에서 한다 — 기록이 저장되는 순간
// 품목이 생기면 안 된다 (현장 기록은 후보 메모, 돈 표는 사람이 누를 때만 바뀐다).
// 합계·부가세·변경 이력은 빌더의 저장 규칙이 그대로 돈다.

import type { FieldLog } from '@/lib/supabase/types'

export interface DraftItem {
  role_name: string
  item_type: '인력' | '교통비' | '숙박비' | '식비' | '연장수당' | '지원품목' | '기타'
  quantity: number
  days: number
  quantity_unit?: string
  days_unit?: string
  unit_price?: number
  spec?: string
}

export interface DraftHint {
  /** 기록에 금액이 없을 때 쓸 제안 단가 (lib/overtime) */
  unitPrice?: number
  /** 그 제안의 근거 — 비고에 같이 적어 사람이 보게 한다 */
  priceNote?: string
}

export function itemFromFieldLog(log: FieldLog, hint: DraftHint = {}): DraftItem {
  const note = `현장기록 ${log.log_date || log.created_at.slice(0, 10)}: ${log.content}`
  const head = log.headcount && log.headcount > 0 ? log.headcount : 1
  switch (log.kind) {
    case '연장': {
      // 기록 금액이 있으면 그것이 총액이라 보고 시간당으로 나눈다. 없으면 제안 단가
      const hours = log.hours && log.hours > 0 ? log.hours : 1
      const fromLog = log.amount && log.amount > 0 ? Math.round(log.amount / (head * hours)) : undefined
      const unit = fromLog ?? hint.unitPrice
      const spec = fromLog === undefined && hint.unitPrice && hint.priceNote ? `${note} · 제안단가 ${hint.priceNote}` : note
      return { role_name: '연장 근무', item_type: '연장수당', quantity: head, days: hours, days_unit: '시간', unit_price: unit, spec }
    }
    case '인원변경':
      return { role_name: log.staff_name ? `추가 인원 (${log.staff_name})` : '추가 인원', item_type: '인력', quantity: head, days: 1, spec: note }
    case '추가지급':
      return { role_name: '추가 비용', item_type: '기타', quantity: 1, days: 1, quantity_unit: '식', days_unit: '회', unit_price: log.amount || 0, spec: note }
    case '부대비용':
      return { role_name: '실비 청구', item_type: '기타', quantity: 1, days: 1, quantity_unit: '식', days_unit: '회', unit_price: log.amount || 0, spec: note }
    default:
      return { role_name: '현장 추가 항목', item_type: '기타', quantity: 1, days: 1, quantity_unit: '식', days_unit: '회', unit_price: log.amount || 0, spec: note }
  }
}
