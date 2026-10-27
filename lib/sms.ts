// 문자 보내기 — 무료 방식
// ─────────────────────────────────────────────────────────
// 휴대폰의 문자 앱을 받는 번호와 문구가 채워진 채로 연다. 보내기는 사람이 누른다.
// 통신사 요금제로 나가므로 돈이 안 들고, API·발신번호 등록이 필요 없다.
// 한계: 휴대폰에서만 되고 한 건씩이다. 일괄·자동 발송이 필요해지면 문자 API 를 붙이되
// 문구 틀은 여기 것을 그대로 쓴다.
//
// 문구는 '보내기 전에 고칠 수 있는 초안'이다. 계좌번호 같은 건 여기서 지어내지 않는다.

import { formatKRW } from '@/lib/utils'

const SIGN = '주식회사 가디어스 드림'

/** sms: 링크. 아이폰은 번호 뒤 구분자가 & 이고 안드로이드는 ? 다 — 반대로 쓰면 문구가 안 들어간다. */
export function smsHref(phone: string | null | undefined, body: string): string | null {
  const num = (phone || '').replace(/[^0-9+]/g, '')
  if (!num) return null
  const ios = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)
  return `sms:${num}${ios ? '&' : '?'}body=${encodeURIComponent(body)}`
}

/** 미수 안내 — 행사 하나면 행사명을, 여러 건이면 건수를 적는다 */
export function unpaidNotice(p: { company?: string | null; eventName?: string | null; amount: number; count?: number }): string {
  const who = p.company ? `${p.company} 담당자님` : '담당자님'
  const what = p.count && p.count > 1
    ? `진행해 드린 행사 ${p.count}건의 대금 ${formatKRW(p.amount)}`
    : `${p.eventName ? `「${p.eventName}」 ` : ''}행사 대금 ${formatKRW(p.amount)}`
  return [
    `안녕하십니까, ${who}. 주식회사 가디어스입니다.`,
    `${what}이 아직 입금 확인되지 않아 확인차 연락드립니다.`,
    `이미 송금하셨다면 알려주시면 바로 확인하겠습니다. 감사합니다.`,
    SIGN,
  ].join('\n')
}

/** 세금계산서 발행 안내 */
export function invoiceNotice(p: { company?: string | null; eventName?: string | null; amount: number }): string {
  const who = p.company ? `${p.company} 담당자님` : '담당자님'
  return [
    `안녕하십니까, ${who}. 주식회사 가디어스입니다.`,
    `${p.eventName ? `「${p.eventName}」 ` : ''}행사 세금계산서(${formatKRW(p.amount)})를 발행해 드리려 합니다.`,
    `발행받으실 사업자등록번호와 이메일을 회신 부탁드립니다. 감사합니다.`,
    SIGN,
  ].join('\n')
}

/** 입금 감사 */
export function thanksNotice(p: { company?: string | null; eventName?: string | null }): string {
  const who = p.company ? `${p.company} 담당자님` : '담당자님'
  return [
    `안녕하십니까, ${who}. 주식회사 가디어스입니다.`,
    `${p.eventName ? `「${p.eventName}」 ` : ''}행사 대금 입금 확인되었습니다. 감사합니다.`,
    `다음 행사에서도 좋은 인력으로 뵙겠습니다.`,
    SIGN,
  ].join('\n')
}
