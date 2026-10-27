// 연장 단가 제안 — 한 곳
// ─────────────────────────────────────────────────────────
// 현장 기록에 "2시간 연장"만 있고 금액이 없을 때 지급·견적에 미리 채울 값을 만든다.
// 어디까지나 '제안'이다. 화면은 근거(source)를 같이 보여주고, 사람이 고친 뒤 저장한다.
//
// 근거 순서 (있는 것부터):
//   ① 직무표(roles)의 시간당 연장 단가(overtime_hourly) — 고객가. 지급은 같은 비율로 내린다
//   ② 요율표(factors)의 '연장·초과' 가산 — add_price(고객)/add_pay_price(지급). 시간당으로 본다
//   ③ 아무것도 없으면 일당 ÷ 기본시간(8) × 1.5  ← 가정. 사장님 확인 전까지 '가정'이라 표시
//
// 규칙을 바꾸려면 이 파일만 고친다. 화면마다 따로 계산하지 말 것.

import type { Role, Factor } from '@/lib/supabase/types'
import { canonRoleKey } from '@/lib/roleAlias'

export interface OvertimeRate {
  /** 시간당 고객 청구 단가 */
  customerHourly: number
  /** 시간당 크루 지급 단가 */
  payHourly: number
  /** 어디서 온 값인지 — 화면에 그대로 보여준다 */
  source: string
  /** ③ 가정 규칙으로 만든 값이면 true */
  assumed: boolean
  roleName: string
}

const FALLBACK_MULT = 1.5
const DEFAULT_HOURS = 8

/** 직무 이름으로 직무표 행을 찾는다. 별칭(lib/roleAlias)을 거쳐 비교한다 */
export function findRole(jobType: string | null | undefined, roles: Role[]): Role | undefined {
  if (!jobType) return undefined
  const key = canonRoleKey(jobType)
  if (!key) return undefined
  const exact = roles.find(r => canonRoleKey(r.role_name) === key)
    || roles.find(r => { const k = canonRoleKey(r.role_name); return !!k && (key.includes(k) || k.includes(key)) })
  if (exact) return exact
  // '진행팀장' ↔ '행사 진행요원' 처럼 별칭표에 없는 말 — 두 글자 이상 겹치는 가장 긴 조각으로 고른다.
  // '행사' 한 조각만 겹치는 건 아무 직무나 맞으므로 '행사'는 세지 않는다
  let best: { role: Role; len: number } | undefined
  for (const r of roles) {
    const k = canonRoleKey(r.role_name)
    let len = 0
    for (let i = 0; i < key.length - 1; i++) {
      for (let j = key.length; j > i + 1; j--) {
        const piece = key.slice(i, j)
        if (piece !== '행사' && k.includes(piece)) { len = Math.max(len, piece.length); break }
      }
    }
    if (len >= 2 && (!best || len > best.len)) best = { role: r, len }
  }
  return best?.role
}

export function overtimeRateFor(jobType: string | null | undefined, roles: Role[], factors: Factor[]): OvertimeRate | null {
  const role = findRole(jobType, roles)
  if (!role) return null
  const hours = role.base_hours && role.base_hours > 0 ? role.base_hours : DEFAULT_HOURS
  const payRatio = role.base_price > 0 ? role.pay_price / role.base_price : 0.7

  if (role.overtime_hourly && role.overtime_hourly > 0) {
    return {
      customerHourly: role.overtime_hourly,
      payHourly: Math.round(role.overtime_hourly * payRatio / 100) * 100,
      source: `직무표 ${role.role_name} 시간당 연장 단가`, assumed: false, roleName: role.role_name,
    }
  }
  const f = factors.find(x => x.role_id === role.id && /연장|초과/.test(x.factor_name || ''))
  if (f && (f.add_price > 0 || f.add_pay_price > 0)) {
    return {
      customerHourly: f.add_price || 0,
      payHourly: f.add_pay_price || Math.round((f.add_price || 0) * payRatio / 100) * 100,
      source: `요율표 가산 "${f.factor_name}"`, assumed: false, roleName: role.role_name,
    }
  }
  return {
    customerHourly: Math.round(role.base_price / hours * FALLBACK_MULT / 100) * 100,
    payHourly:      Math.round(role.pay_price  / hours * FALLBACK_MULT / 100) * 100,
    source: `일당 ÷ ${hours}시간 × ${FALLBACK_MULT} (가정 — 확인 필요)`, assumed: true, roleName: role.role_name,
  }
}

/** 제안 금액 한 줄 설명. 예) "제안 21,000원 = 10,500원/시간 × 2시간 · 요율표 가산 …" */
export function describeOvertime(rate: OvertimeRate, hours: number, side: 'customer' | 'pay'): string {
  const hourly = side === 'customer' ? rate.customerHourly : rate.payHourly
  return `${hourly.toLocaleString()}원/시간 × ${hours}시간 · ${rate.source}`
}
