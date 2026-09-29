// 세금계산서 발행 정보(사업자 정보)를 이전 정산에서 찾아 쓰는 규칙
// ─────────────────────────────────────────────────────────
// 재이용 고객이 많다. 2026-09-29 실측: 사업자번호가 적힌 정산 115건 중 고유 사업자는 70,
// 그중 20곳은 두 번 이상 발행했다. 그런데 정산을 새로 만들 때마다 사업자번호·상호·대표자·
// 주소·이메일을 다시 적고 있었다. 같은 업체가 문의를 다시 넣으면 이전 발행 정보를 그대로
// 가져오면 된다 — 사람이 적는 건 바뀐 부분만.
//
// 업체명은 같은 곳인데도 표기가 흔들린다. 숲소리 한 곳이 '숲소리', '숲소리_마곡_6월2주차',
// '숲소리_송도 5월 1주'로 8가지. '메카닉코리아'와 '메카니 코리아'도 같은 사업자다.
// 그래서 이름을 정규화해서 비교하고, 그래도 못 찾으면 사람이 검색해서 고른다.
//
// 사람이 이미 적어 둔 칸은 절대 덮어쓰지 않는다. 빈 칸만 채운다.

import type { Settlement } from '@/lib/supabase/types'
import { db } from '@/lib/supabase/api'

/** 세금계산서에 들어가는 발행 정보. 청구금액·현장주소는 여기 없다 — 건마다 다르다. */
export const BIZ_INFO_FIELDS = [
  'biz_number', 'corp_name', 'rep_name', 'email', 'contact_phone', 'biz_address',
] as const
export type BizInfoField = typeof BIZ_INFO_FIELDS[number]
export type BizInfo = Partial<Record<BizInfoField, string>>

/** 업체명 비교용 정규화. 공백·법인 접두어를 걷어내고, '_' 뒤의 회차 표기를 자른다.
 *  '숲소리_마곡_6월2주차' → '숲소리', '(주)메카닉코리아' → '메카닉코리아' */
export function normalizeCompany(name: string | undefined | null): string {
  if (!name) return ''
  return name
    .split('_')[0]
    .replace(/\(주\)|주식회사|㈜|\(유\)|유한회사/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

/** 정산 한 건에서 발행 정보만 뽑는다. 빈 값은 키 자체를 빼서, 덮어쓸 때 빈 문자열이 이기지 않게 한다. */
export function bizInfoOf(s: Pick<Settlement, BizInfoField>): BizInfo {
  const out: BizInfo = {}
  BIZ_INFO_FIELDS.forEach(k => { const v = s[k]; if (v) out[k] = v })
  return out
}

/** 이 업체명으로 발행한 적이 있으면 가장 최근 정산의 발행 정보를 준다.
 *
 *  정규화한 이름이 정확히 같은 것을 먼저, 없으면 한쪽이 다른 쪽으로 시작하는 것(두 글자 이상)을 본다.
 *  같은 사업자인데 이름이 완전히 다른 경우(시대인재 ↔ 커넥텀엑스)는 못 찾는다 — 그건 검색으로. */
export function findPrevBizInfo(
  settlements: Settlement[],
  companyName: string | undefined | null,
  excludeId?: string,
): { info: BizInfo; from: Settlement } | null {
  const key = normalizeCompany(companyName)
  if (key.length < 2) return null
  const candidates = settlements
    .filter(s => s.id !== excludeId && s.biz_number)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
  const exact = candidates.find(s => normalizeCompany(s.company_name) === key || normalizeCompany(s.corp_name) === key)
  // 앞부분 일치는 짧은 쪽이 세 글자 이상일 때만. 'LG'가 'LG전자'에 붙으면 세금계산서가 틀린다.
  const hit = exact ?? candidates.find(s => {
    const n = normalizeCompany(s.company_name)
    return Math.min(n.length, key.length) >= 3 && (n.startsWith(key) || key.startsWith(n))
  })
  return hit ? { info: bizInfoOf(hit), from: hit } : null
}

/** 사업자번호 기준으로 한 곳당 하나씩, 최신 순. 검색 목록의 재료. */
export function uniqueBizOptions(settlements: Settlement[], excludeId?: string): Settlement[] {
  const seen = new Set<string>()
  return settlements
    .filter(s => s.id !== excludeId && s.biz_number)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .filter(s => { const k = s.biz_number!; if (seen.has(k)) return false; seen.add(k); return true })
}

/** 검색. 상호·업체명·사업자번호·대표자를 공백 무시하고 본다. 사업자번호는 '-' 없이 쳐도 잡힌다. */
export function searchBizOptions(options: Settlement[], query: string): Settlement[] {
  const q = query.replace(/\s+/g, '').toLowerCase()
  if (!q) return options
  const qDigits = q.replace(/\D/g, '')
  return options.filter(s => {
    const hay = [s.corp_name, s.company_name, s.rep_name].map(v => (v || '').replace(/\s+/g, '').toLowerCase())
    if (hay.some(h => h.includes(q))) return true
    return qDigits.length >= 3 && (s.biz_number || '').replace(/\D/g, '').includes(qDigits)
  })
}

/** 정산 목록에 사람이 아직 안 적은 칸만 이전 정보로 채운다. */
export function fillEmptyBizFields<T extends BizInfo>(form: T, info: BizInfo): { next: T; filled: BizInfoField[] } {
  const next = { ...form }
  const filled: BizInfoField[] = []
  BIZ_INFO_FIELDS.forEach(k => {
    if (!next[k] && info[k]) { (next as BizInfo)[k] = info[k]; filled.push(k) }
  })
  return { next, filled }
}

/** 정산을 자동으로 만드는 자리(체결·견적 확정)에서 쓰는 조회.
 *  발행 정보는 있으면 좋은 것이고 정산 생성은 꼭 되어야 하는 것이다. 그래서 여기서 무슨 일이
 *  나도 빈 값으로 돌아간다 — 조회 하나 때문에 '확정 실패'가 뜨면 안 된다.
 *  (db.list 의 order 는 컬럼 이름만 받고 방향은 asc 로 준다. 'created_at.desc' 처럼 붙여 쓰면
 *   그런 컬럼이 없다는 DB 오류가 난다 — 2026-09-29 첫 배포에서 그렇게 적었었다) */
export async function loadPrevBizInfo(companyName: string | undefined | null): Promise<BizInfo> {
  try {
    const rows = await db.list<Settlement>('settlements', { order: 'created_at', asc: false })
    return findPrevBizInfo(rows, companyName)?.info ?? {}
  } catch (e) {
    console.error('[bizInfo] 이전 발행 정보 조회 실패 — 빈 값으로 진행', e)
    return {}
  }
}
