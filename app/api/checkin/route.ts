import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { UUID_RE, SELF_NOTE, nowHHMM, resolveWorkDate } from '@/lib/checkin'

// 크루 셀프 출석 체크인 — 로그인 없이 호출되는 공개 라우트.
// proxy.ts의 PUBLIC_PATHS에 등록되어 있으므로 다루는 범위를 최대한 좁게 유지한다.
//  · 쓰기 전용(POST). 명단 조회는 서버 컴포넌트에서 직접 하므로 공개 GET을 두지 않는다.
//  · 상태는 '출석' 고정 — 임의 상태를 지정할 수 없다.
//  · 범용 /api/db 라우트(모든 테이블 admin 접근)는 잠금 뒤에 그대로 둔다.
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  let body: { inquiryId?: string; assignmentId?: string; action?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  const { inquiryId = '', assignmentId = '', action = 'checkin' } = body
  if (!UUID_RE.test(inquiryId) || !UUID_RE.test(assignmentId)) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }
  if (action !== 'checkin' && action !== 'cancel') {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: inq } = await supabase
    .from('inquiries')
    .select('id, event_start, event_end')
    .eq('id', inquiryId)
    .maybeSingle()
  if (!inq) return NextResponse.json({ error: '행사를 찾을 수 없습니다.' }, { status: 404 })

  // 배정이 이 행사에 실제로 속하는지 확인 — 다른 행사 인원을 건드리지 못하게 한다
  const { data: asgn } = await supabase
    .from('assignments')
    .select('id, staff_name, pay_rate, status')
    .eq('id', assignmentId)
    .eq('inquiry_id', inquiryId)
    .maybeSingle()
  if (!asgn) return NextResponse.json({ error: '배정 정보를 찾을 수 없습니다.' }, { status: 404 })
  if (asgn.status === '취소') {
    return NextResponse.json({ error: '취소된 배정입니다.' }, { status: 400 })
  }

  const workDate = resolveWorkDate(inq.event_start, inq.event_end)

  const { data: existing } = await supabase
    .from('attendances')
    .select('id, status, notes')
    .eq('assignment_id', assignmentId)
    .eq('work_date', workDate)
    .maybeSingle()

  // ── 취소: 셀프로 찍은 '출석' 기록만 되돌린다 ──
  if (action === 'cancel') {
    if (!existing) return NextResponse.json({ ok: true })
    if (existing.notes !== SELF_NOTE || existing.status !== '출석') {
      return NextResponse.json(
        { error: '담당자가 입력한 기록은 취소할 수 없습니다.' }, { status: 409 }
      )
    }
    await supabase.from('attendances').delete().eq('id', existing.id)
    await supabase.from('assignments').update({ is_present: false }).eq('id', assignmentId)
    return NextResponse.json({ ok: true })
  }

  // ── 체크인 ──
  // 담당자가 이미 지각·결근 등으로 기록해 둔 경우엔 덮어쓰지 않는다
  if (existing && existing.status && existing.status !== '출석') {
    return NextResponse.json(
      { error: `담당자가 '${existing.status}'(으)로 기록해 두었습니다.` }, { status: 409 }
    )
  }
  if (existing) {
    // 이미 출석 처리됨 — 중복 탭은 조용히 성공 처리
    return NextResponse.json({ ok: true })
  }

  // 출석 탭(handleSaveAttendance)이 만드는 레코드와 같은 형태로 저장한다
  const { error } = await supabase.from('attendances').insert({
    assignment_id: assignmentId,
    inquiry_id: inquiryId,
    staff_name: asgn.staff_name || '',
    work_date: workDate,
    clock_in: nowHHMM(),
    daily_pay: asgn.pay_rate || 0,
    status: '출석',
    notes: SELF_NOTE,
  })
  if (error) return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 })

  await supabase.from('assignments').update({ is_present: true }).eq('id', assignmentId)

  return NextResponse.json({ ok: true })
}
