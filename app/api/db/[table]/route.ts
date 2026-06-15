import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// 허용된 테이블 목록 (보안 — 화이트리스트)
const ALLOWED_TABLES = [
  'inquiries', 'customers', 'estimates', 'estimate_items',
  'assignments', 'settlements', 'staff', 'attendances',
  'payouts', 'evaluations', 'roles', 'factors', 'guides',
  'estimate_versions', 'closings', 'improvement_notes',
  'guard_profiles',
]

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
  query = query.order(orderBy, { ascending })
  if (limitStr) query = query.limit(Number(limitStr))

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, count })
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
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  const body = await request.json()
  const supabase = createAdminClient()
  const { data, error } = await supabase.from(table).update(body).eq('id', id).select()

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
