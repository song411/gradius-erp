// 전자서명 봉인 — 지문 계산 규칙 한 곳
// ─────────────────────────────────────────────────────────
// 서버(/api/sign)가 서명 순간 지문을 만들고, ERP 화면이 같은 규칙으로 다시 계산해 맞춰 본다.
// 브라우저와 서버 둘 다에서 돌게 Web Crypto(crypto.subtle)만 쓴다. 키 순서가 다르면 지문이 달라지므로 키를 정렬해 직렬화한다.

export interface SealInput {
  contractId: string
  staffName: string
  variant: string
  fields: Record<string, unknown>
  signature: string      // data:image/png;base64,...
  signedAt: string       // ISO
  verifiedBy: string
}

/** 키를 정렬한 JSON — 같은 내용이면 어디서 만들어도 같은 글자 */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

/** 이 건의 지문 */
export function contentHashOf(input: SealInput): Promise<string> {
  return sha256Hex(stableStringify(input))
}

/** 앞 건과 이어 붙인 값. 첫 건은 'GENESIS' */
export function chainHashOf(prevChain: string | null | undefined, contentHash: string): Promise<string> {
  return sha256Hex(`${prevChain || 'GENESIS'}:${contentHash}`)
}

/** 화면에 짧게 */
export function shortHash(h?: string | null): string {
  return h ? `${h.slice(0, 8)}…${h.slice(-4)}` : ''
}
