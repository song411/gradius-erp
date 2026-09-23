import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { krwLabel } from '@/lib/ai/cost'

// 가디를 이번 달에 얼마나 썼나
// ─────────────────────────────────────────────────────────
// Anthropic Console 의 청구서는 하루치 총액만 준다. 여기서는 **어느 질문이
// 비쌌는지**까지 본다. 금액은 우리가 usage 로 되짚은 어림값이고, 정확한
// 청구는 Console 쪽이 정답이다.

interface UsageRow {
  created_at: string
  model: string
  cost_krw: number | string
  question: string | null
}

/** Supabase 는 1000행에서 조용히 자른다 — 한 달치가 넘어갈 수 있으니 페이징한다 */
async function fetchSince(from: string): Promise<UsageRow[]> {
  const supabase = createAdminClient()
  const PAGE = 1000
  const out: UsageRow[] = []
  for (let start = 0; start < 20_000; start += PAGE) {
    const { data, error } = await supabase
      .from('ai_usage')
      .select('created_at, model, cost_krw, question')
      .gte('created_at', from)
      .order('created_at', { ascending: false })
      .range(start, start + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data || []) as UsageRow[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

export async function GET() {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

  let rows: UsageRow[]
  try {
    rows = await fetchSince(monthStart)
  } catch (err) {
    // 표가 아직 없으면(마이그레이션 015 미실행) 화면이 그 사실을 알아야 한다
    return NextResponse.json({
      ready: false,
      error: err instanceof Error ? err.message : '조회 실패',
      hint: 'supabase/migrations/015_ai_usage.sql 을 SQL Editor 에서 실행하세요.',
    })
  }

  const won = (r: UsageRow) => Number(r.cost_krw) || 0
  const sum = (list: UsageRow[]) => list.reduce((t, r) => t + won(r), 0)

  const today = rows.filter(r => r.created_at >= dayStart)
  const byModel: Record<string, { count: number; krw: number }> = {}
  rows.forEach(r => {
    const m = (byModel[r.model] ??= { count: 0, krw: 0 })
    m.count++
    m.krw += won(r)
  })

  // 무엇이 비쌌는지 — 다음에 어떤 질문을 싼 모델로 돌릴지 정하는 근거가 된다
  const top = [...rows].sort((a, b) => won(b) - won(a)).slice(0, 5).map(r => ({
    question: r.question || '(질문 없음)',
    krw: won(r),
    label: krwLabel(won(r)),
    at: r.created_at,
  }))

  const monthKrw = sum(rows)
  return NextResponse.json({
    ready: true,
    month: { count: rows.length, krw: monthKrw, label: krwLabel(monthKrw) },
    today: { count: today.length, krw: sum(today), label: krwLabel(sum(today)) },
    average: rows.length ? krwLabel(monthKrw / rows.length) : '-',
    byModel,
    top,
  })
}
