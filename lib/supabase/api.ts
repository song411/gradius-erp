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

export const db = {
  // 다건 조회
  async list<T>(table: string, opts: QueryOptions = {}): Promise<T[]> {
    const params = new URLSearchParams()
    if (opts.select)  params.set('select', opts.select)
    if (opts.order)   params.set('order', opts.order)
    if (opts.asc !== undefined) params.set('asc', String(opts.asc))
    if (opts.limit)   params.set('limit', String(opts.limit))
    if (opts.or)      params.set('or', opts.or)

    Object.entries(opts.filters   || {}).forEach(([k, v]) => params.set(`eq_${k}`, v))
    Object.entries(opts.inFilter  || {}).forEach(([k, v]) => params.set(`in_${k}`, v.join(',')))
    Object.entries(opts.neqFilter || {}).forEach(([k, v]) => params.set(`neq_${k}`, v))

    const res = await fetch(`${BASE}/${table}?${params}`, { cache: 'no-store' })
    if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
    const { data } = await res.json()
    return data as T[]
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
