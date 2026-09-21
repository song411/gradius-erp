// 클라이언트 컴포넌트에서 서버 API 라우트를 통해 DB에 접근
// service_role 키는 서버에서만 사용되므로 브라우저에 노출되지 않음

const BASE = '/api/db'

type QueryOptions = {
  select?: string
  order?: string
  asc?: boolean
  limit?: number
  filters?: Record<string, string>       // eq 필터 (단일 값)
  inFilter?: Record<string, string[]>    // in 필터 (배열)
  neqFilter?: Record<string, string>     // neq 필터
  or?: string                             // Supabase or() 표현식
}

/** Supabase REST가 한 번에 돌려주는 최대 행 수 */
const PAGE = 1000

/** 안전장치 — 이보다 많으면 무언가 잘못된 것이다 */
const MAX_ROWS = 100_000

function buildParams(opts: QueryOptions): URLSearchParams {
  const params = new URLSearchParams()
  if (opts.select)  params.set('select', opts.select)
  if (opts.order)   params.set('order', opts.order)
  if (opts.asc !== undefined) params.set('asc', String(opts.asc))
  if (opts.or)      params.set('or', opts.or)

  Object.entries(opts.filters   || {}).forEach(([k, v]) => params.set(`eq_${k}`, v))
  Object.entries(opts.inFilter  || {}).forEach(([k, v]) => params.set(`in_${k}`, v.join(',')))
  Object.entries(opts.neqFilter || {}).forEach(([k, v]) => params.set(`neq_${k}`, v))
  return params
}

async function fetchPage<T>(
  table: string, opts: QueryOptions, limit: number, offset: number,
): Promise<T[]> {
  const params = buildParams(opts)
  params.set('limit', String(limit))
  if (offset > 0) params.set('offset', String(offset))

  const res = await fetch(`${BASE}/${table}?${params}`, { cache: 'no-store' })
  if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
  const { data } = await res.json()
  return (data ?? []) as T[]
}

export const db = {
  // 다건 조회
  //
  // limit을 주지 않으면 '전부 달라'는 뜻이다. 그런데 Supabase REST는 한 번에
  // 1000행까지만 준다. 그래서 그냥 한 번 부르면 조용히 잘린 목록이 돌아온다 —
  // 에러도 없고 경고도 없다. 실측(2026-09-21): estimate_items 1052행 중 1000행만
  // 와서, sort_order 오름차순이라 각 견적의 5번째 이후 품목(식비·부대비용)이
  // 통째로 사라졌다. 저장은 멀쩡했는데 불러오기가 잘리고 있었다.
  // assignments도 966행이라 곧 같은 일이 일어난다.
  async list<T>(table: string, opts: QueryOptions = {}): Promise<T[]> {
    if (opts.limit) return fetchPage<T>(table, opts, opts.limit, 0)

    const out: T[] = []
    for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
      const page = await fetchPage<T>(table, opts, PAGE, offset)
      out.push(...page)
      if (page.length < PAGE) break   // 마지막 장
    }
    return out
  },

  // 단건 조회 (id로)
  async single<T>(table: string, id: string): Promise<T | null> {
    const res = await fetch(`${BASE}/${table}?eq_id=${id}&limit=1`)
    if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
    const { data } = await res.json()
    return data?.[0] ?? null
  },

  // 삽입
  async insert<T>(table: string, payload: Record<string, unknown> | Record<string, unknown>[]): Promise<T[]> {
    const res = await fetch(`${BASE}/${table}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
    const { data } = await res.json()
    return data as T[]
  },

  // 수정 (id 기준)
  async update<T>(table: string, id: string, payload: Record<string, unknown>): Promise<T[]> {
    const res = await fetch(`${BASE}/${table}?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
    const { data } = await res.json()
    return data as T[]
  },

  // 여러 건을 같은 값으로 수정 (일괄 처리용)
  async updateMany<T>(table: string, ids: string[], payload: Record<string, unknown>): Promise<T[]> {
    if (ids.length === 0) return []
    const res = await fetch(`${BASE}/${table}?ids=${ids.join(',')}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
    const { data } = await res.json()
    return data as T[]
  },

  // 삭제 (id 기준)
  async delete(table: string, id: string): Promise<void> {
    const res = await fetch(`${BASE}/${table}?id=${id}`, { method: 'DELETE' })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
  },

  // 조건 삭제 (eq 필터 기준 — estimate_items 등)
  async deleteWhere(table: string, filters: Record<string, string>): Promise<void> {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => params.set(`eq_${k}`, v))
    const res = await fetch(`${BASE}/${table}?${params}`, { method: 'DELETE' })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
  },
}
