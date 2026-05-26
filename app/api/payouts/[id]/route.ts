import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// 지급 상태 전용 PATCH 엔드포인트
// 일반 /api/db/payouts 라우트 대신 이 라우트를 사용하면 paid_at 컬럼 없어도 graceful 처리
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'id 필요' }, { status: 400 })
  }

  const body: Record<string, unknown> = await request.json()
  const supabase = createAdminClient()

  // 1단계: status만 먼저 업데이트 (항상 동작)
  const { error: statusErr } = await supabase
    .from('payouts')
    .update({ status: body.status })
    .eq('id', id)

  if (statusErr) {
    console.error('[payout update] status 업데이트 실패:', statusErr.message)
    return NextResponse.json(
      { error: `상태 업데이트 실패: ${statusErr.message}` },
      { status: 500 },
    )
  }

  // 2단계: paid_at 업데이트 시도 (컬럼 없으면 무시)
  if ('paid_at' in body) {
    const { error: paidAtErr } = await supabase
      .from('payouts')
      .update({ paid_at: body.paid_at })
      .eq('id', id)

    if (paidAtErr) {
      // paid_at 컬럼이 없는 경우는 경고만 (status는 이미 반영됨)
      console.warn('[payout update] paid_at 업데이트 실패 (컬럼 없을 수 있음):', paidAtErr.message)
      return NextResponse.json({
        success: true,
        warning: `paid_at 미적용: ${paidAtErr.message}`,
      })
    }
  }

  return NextResponse.json({ success: true })
}
