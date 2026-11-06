import { createHmac } from 'node:crypto'

// 현장 코드 — "현장에 있었다"를 확인하는 장치 (2026-11-06 결정)
// ─────────────────────────────────────────────────────────
// 팀장 휴대폰의 현장 화면(/m/today, 잠금 안)에 행사별 6자리 코드와 QR 이 뜬다. 코드는 10분마다 바뀐다.
// 크루는 QR 을 찍거나 코드를 넣어야 체크인이 된다 — 사진으로 공유해도 10분 뒤엔 못 쓴다.
// 코드는 서버 비밀값 + 행사 id + 시간 창으로 만든 HMAC 이라 DB 에 저장할 것이 없다.
// ⚠️ 서버 전용(node:crypto). 클라이언트 컴포넌트에서 import 금지.

export const CODE_WINDOW_MS = 10 * 60 * 1000
const DIGITS = 6

function secret(): string {
  // 전용 비밀값이 있으면 그것, 없으면 서비스 키로 만든다 (HMAC 결과로 키를 되짚을 수는 없다)
  return process.env.CHECKIN_CODE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-only'
}

function codeFor(inquiryId: string, windowIndex: number): string {
  const mac = createHmac('sha256', secret()).update(`${inquiryId}:${windowIndex}`).digest()
  const n = mac.readUInt32BE(0) % 10 ** DIGITS
  return String(n).padStart(DIGITS, '0')
}

/** 지금 창의 코드와 남은 시간(초) */
export function currentCode(inquiryId: string, at = Date.now()): { code: string; secondsLeft: number } {
  const idx = Math.floor(at / CODE_WINDOW_MS)
  return { code: codeFor(inquiryId, idx), secondsLeft: Math.ceil(((idx + 1) * CODE_WINDOW_MS - at) / 1000) }
}

/** 지금 창 또는 바로 전 창의 코드면 통과 — 창이 바뀌는 순간에 찍은 사람을 떨어뜨리지 않는다 */
export function verifyCode(inquiryId: string, code: string, at = Date.now()): boolean {
  const c = String(code || '').replace(/\D/g, '')
  if (c.length !== DIGITS) return false
  const idx = Math.floor(at / CODE_WINDOW_MS)
  return c === codeFor(inquiryId, idx) || c === codeFor(inquiryId, idx - 1)
}
