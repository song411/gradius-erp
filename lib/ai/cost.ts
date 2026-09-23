// 가디가 한 번 답하는 데 얼마가 드는지 — 한 곳에서만 센다
// ─────────────────────────────────────────────────────────
// 청구서(Anthropic Console)와 완전히 같은 숫자는 아니다. 그쪽이 정답이고
// 여기는 우리가 받은 usage 로 되짚은 값이다. 그래도 이것을 남기는 이유는
// **어느 질문이 비쌌는지**를 알 수 있기 때문이다. 청구서는 하루치 총액만 준다.

import { MODELS } from './model'

/** 캐시에 올릴 때는 입력가의 1.25배, 캐시에서 읽을 때는 0.1배 */
const CACHE_WRITE_MULT = 1.25
const CACHE_READ_MULT = 0.1

/** 환율 — 원화로 감을 잡기 위한 어림값이다. 정확한 청구는 달러로 나간다. */
export const USD_KRW = 1400

export interface UsageTotals {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

/** 비어 있는 합계 — 도구를 여러 턴 도는 동안 여기에 더해 나간다 */
export function emptyUsage(): UsageTotals {
  return {
    input_tokens: 0, output_tokens: 0,
    cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
  }
}

/** 한 턴의 usage 를 합계에 더한다.
 *
 *  ★ 도구를 도는 동안 매 턴이 따로 청구된다. 마지막 턴만 보면 실제 쓴 것의
 *    일부만 세게 된다 — 인력 추천처럼 여러 번 조회하는 질문에서 특히 어긋난다. */
export function addUsage(total: UsageTotals, u?: {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}): UsageTotals {
  if (!u) return total
  total.input_tokens += u.input_tokens ?? 0
  total.output_tokens += u.output_tokens ?? 0
  total.cache_creation_input_tokens += u.cache_creation_input_tokens ?? 0
  total.cache_read_input_tokens += u.cache_read_input_tokens ?? 0
  return total
}

export interface Cost {
  usd: number
  krw: number
}

export function costOf(model: string, u: UsageTotals): Cost {
  // 단가는 모델 정의(lib/ai/model.ts)에 붙어 있다. 없는 모델이면 0원이 되는데,
  // 조용히 0원이 찍히면 '공짜로 썼다'로 읽히므로 로그를 남긴다.
  const p = MODELS.find(m => m.id === model)?.price
  if (!p) {
    console.warn(`[비용] '${model}' 의 단가를 모릅니다 — 0원으로 셉니다.`)
    return { usd: 0, krw: 0 }
  }

  const usd =
    (u.input_tokens * p.input +
     u.cache_creation_input_tokens * p.input * CACHE_WRITE_MULT +
     u.cache_read_input_tokens * p.input * CACHE_READ_MULT +
     u.output_tokens * p.output) / 1_000_000

  return { usd, krw: usd * USD_KRW }
}

/** 화면에 적는 말 — 1원 미만은 '1원 미만'으로 (0원이라고 하면 공짜로 읽힌다) */
export function krwLabel(krw: number): string {
  if (krw <= 0) return '-'
  if (krw < 1) return '1원 미만'
  return `${Math.round(krw).toLocaleString()}원`
}
