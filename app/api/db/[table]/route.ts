import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// 모든 응답을 동적으로 처리 (CDN/Next.js 캐싱 방지)
export const dynamic = 'force-dynamic'

// 허용된 테이블 목록 (보안 — 화이트리스트)
const ALLOWED_TABLES = [
  'inquiries', 'customers', 'estimates', 'estimate_items',
  'assignments', 'settlements', 'staff', 'attendances',
  'payouts', 'evaluations', 'roles', 'factors', 'guides',
  'estimate_versions', 'closings', 'improvement_notes',
  'guard_profiles', 'dispatch_reports', 'project_memos',
  'pricing_history', 'event_expenses', 'calendar_notes',
  'sim_roles', 'sim_factors', 'sim_guides',
]

/** Supabase REST가 한 번에 돌려주는 최대 행 수. 클라이언트는 이 단위로 나눠 읽는다. */
const MAX_PAGE = 1000

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> }
) {
  const { table } = await params
  if (!ALLOWED_TABLES.includes(table)) {
    return NextResponse.json({ error: '허용되지 않은 테이블' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const orderBy = searchParams.get('order') || 'created_at'
  const ascending = searchParams.get('asc') === 'true'
  const limitStr = searchParams.get('limit')
  const select = searchParams.get('select') || '*'
  const orFilter = searchParams.get('or')

  const supabase = createAdminClient()
  let query = supabase.from(table).select(select)

  // eq/in/neq 필터 파싱
  searchParams.forEach((value, key) => {
    if (key.startsWith('eq_')) {
      query = query.eq(key.slice(3), value)
    } else if (key.startsWith('in_')) {
      query = query.in(key.slice(3), value.split(','))
    } else if (key.startsWith('neq_')) {
      query = query.neq(key.slice(4), value)
    }
  })

  if (orFilter) query = query.or(orFilter)

  // 2차 정렬로 id를 항상 붙인다.
  // sort_order처럼 같은 값이 많은 컬럼으로만 정렬하면 순서가 요청마다 달라질 수 있어,
  // 페이지를 나눠 읽을 때 같은 행이 두 번 오거나 아예 빠진다.
  query = query.order(orderBy, { ascending }).order('id', { ascending: true })

  // 페이지 구간. Supabase REST는 한 번에 1000행까지만 주므로
  // (실측 2026-09-21: estimate_items 1052행 중 1000행만 돌아와 각 견적의
  //  5번째 이후 품목 — 식비·부대비용 — 이 통째로 사라졌다) 나눠서 읽는다.
  const offset = Number(searchParams.get('offset') || 0)
  if (limitStr) {
    const limit = Number(limitStr)
    query = query.range(offset, offset + limit - 1)
  } else if (offset > 0) {
    query = query.range(offset, offset + MAX_PAGE - 1)
  }

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, count }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> }
) {
  const { table } = await params
  if (!ALLOWED_TABLES.includes(table)) {
    return NextResponse.json({ error: '허용되지 않은 테이블' }, { status: 403 })
  }

  const body = await request.json()
  const supabase = createAdminClient()
  const { data, error } = await supabase.from(table).insert(body).select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> }
) {
  const { table } = await params
  if (!ALLOWED_TABLES.includes(table)) {
    return NextResponse.json({ error: '허용되지 않은 테이블' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id  = searchParams.get('id')
  // 여러 건을 같은 값으로 고칠 때 (예: 견적 일괄 발송 표시).
  // 한 건씩 보내면 100건에 100번 왕복한다 — 중간에 끊기면 절반만 바뀐다.
  const ids = searchParams.get('ids')?.split(',').map(v => v.trim()).filter(Boolean)

  if (!id && !ids?.length) {
    return NextResponse.json({ error: 'id 또는 ids 필요' }, { status: 400 })
  }

  const body = await request.json()
  const supabase = createAdminClient()
  const q = supabase.from(table).update(body)
  const { data, error } = await (id ? q.eq('id', id) : q.in('id', ids!)).select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> }
) {
  const { table } = await params
  if (!ALLOWED_TABLES.includes(table)) {
    return NextResponse.json({ error: '허용되지 않은 테이블' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const supabase = createAdminClient()
  const id = searchParams.get('id')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase.from(table).delete()

  if (id) {
    q = q.eq('id', id)
  } else {
    // eq_ 필터로 삭제 (예: estimate_items를 estimate_id로 삭제)
    let hasFilter = false
    searchParams.forEach((value, key) => {
      if (key.startsWith('eq_')) {
        q = q.eq(key.slice(3), value)
        hasFilter = true
      }
    })
    if (!hasFilter) {
      return NextResponse.json({ error: 'id 또는 eq 필터 필요' }, { status: 400 })
    }
  }

  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
