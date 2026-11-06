import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { UUID_RE, SELF_NOTE, nowHHMM, resolveWorkDate } from '@/lib/checkin'
import { sendToAll, subjectFrom } from '@/lib/push'
import { verifyCode } from '@/lib/checkinCode'
import { distanceMeters } from '@/lib/geo'

// 크루 셀프 출석 체크인 — 로그인 없이 호출되는 공개 라우트.
// proxy.ts의 PUBLIC_PATHS에 등록되어 있으므로 다루는 범위를 최대한 좁게 유지한다.
//  · 쓰기 전용(POST). 명단 조회는 서버 컴포넌트에서 직접 하므로 공개 GET을 두지 않는다.
//  · 상태는 '출석' 고정 — 임의 상태를 지정할 수 없다.
//  · 체크인 = 본인 확인(전화 뒷 4자리) + 현장 코드(팀장 화면 QR, 10분마다 바뀜) + 안전교육 서약 동의 + 손가락 서명.
//    넷이 다 있어야 기록된다 (2026-11-06). 현장 코드가 '현장에 있었다'의 증거다.
//    담당자가 이미 출결을 적어 둔 사람은 상태는 그대로 두고 서명만 붙인다.
//  · 범용 /api/db 라우트(모든 테이블 admin 접근)는 잠금 뒤에 그대로 둔다.
export const dynamic = 'force-dynamic'

const MAX_SIGNATURE_BYTES = 400_000

export async function POST(request: NextRequest) {
  let body: { inquiryId?: string; assignmentId?: string; action?: string; last4?: string; siteCode?: string; signature?: string; pledged?: boolean; lat?: number; lng?: number; acc?: number }
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
    .select('id, event_start, event_end, event_name, site_lat, site_lng')
    .eq('id', inquiryId)
    .maybeSingle()
  if (!inq) return NextResponse.json({ error: '행사를 찾을 수 없습니다.' }, { status: 404 })

  // 배정이 이 행사에 실제로 속하는지 확인 — 다른 행사 인원을 건드리지 못하게 한다
  const { data: asgn } = await supabase
    .from('assignments')
    .select('id, staff_name, pay_rate, status, phone, staff_id')
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
    .select('id, status, notes, signature_data')
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

  // ── 체크인: 본인 확인 → 서약 동의 → 서명 ──
  const last4 = String(body.last4 || '').trim()
  const signature = String(body.signature || '')
  if (!/^\d{4}$/.test(last4)) return NextResponse.json({ error: '전화번호 뒷 4자리를 입력해 주세요.' }, { status: 400 })
  if (!verifyCode(inquiryId, String(body.siteCode || ''))) {
    return NextResponse.json({ error: '현장 코드가 맞지 않습니다. 팀장 휴대폰 화면의 QR이나 숫자를 다시 확인해 주세요.' }, { status: 403 })
  }
  if (body.pledged !== true) return NextResponse.json({ error: '안전교육 서약 확인에 체크해 주세요.' }, { status: 400 })
  if (!signature.startsWith('data:image/png;base64,') || signature.length > MAX_SIGNATURE_BYTES) {
    return NextResponse.json({ error: '서명을 그려 주세요.' }, { status: 400 })
  }

  // 전화번호: 배정에 적힌 것 우선, 없으면 크루관리
  let phone = String(asgn.phone || '')
  if (phone.replace(/\D/g, '').length < 4 && asgn.staff_id) {
    const { data: st } = await supabase.from('staff').select('phone').eq('id', asgn.staff_id).maybeSingle()
    phone = String(st?.phone || '')
  }
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 4) {
    return NextResponse.json({ error: '전화번호가 등록되지 않아 본인 확인을 할 수 없습니다. 담당자에게 말씀해 주세요.' }, { status: 409 })
  }
  if (digits.slice(-4) !== last4) {
    return NextResponse.json({ error: '전화번호 뒷 4자리가 맞지 않습니다.' }, { status: 403 })
  }

  const now = new Date().toISOString()
  const ua = (request.headers.get('user-agent') || '').slice(0, 300) || null

  // 위치 — 크루 폰 좌표가 오고 행사 기준점(팀장 폰)이 있으면 거리를 잰다. 없으면 NULL. 막지 않는다
  const lat = Number(body.lat), lng = Number(body.lng)
  const hasFix = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  const geo = hasFix ? {
    lat, lng, acc: Math.round(Number(body.acc) || 0),
    distance_m: typeof inq.site_lat === 'number' && typeof inq.site_lng === 'number' ? distanceMeters(inq.site_lat, inq.site_lng, lat, lng) : null,
  } : {}

  if (existing) {
    // 담당자가 먼저 적어 둔 기록(지각 등)이든 셀프 출석이든 — 상태는 두고 서명만 붙인다
    if (existing.signature_data) return NextResponse.json({ ok: true, already: true })
    const { error } = await supabase.from('attendances')
      .update({ signature_data: signature, pledge_at: now, signer_ua: ua, ...geo })
      .eq('id', existing.id)
    if (error) return NextResponse.json({ error: '저장에 실패했습니다. 022 마이그레이션을 확인해 주세요.' }, { status: 500 })
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
    signature_data: signature,
    pledge_at: now,
    signer_ua: ua,
    ...geo,
  })
  if (error) return NextResponse.json({ error: '저장에 실패했습니다. 022 마이그레이션을 확인해 주세요.' }, { status: 500 })

  await supabase.from('assignments').update({ is_present: true }).eq('id', assignmentId)

  // 알림을 켠 휴대폰에 "누가 체크인했다"를 알린다. 실패해도 체크인은 이미 됐다
  try {
    await sendToAll({
      title: `체크인 · ${inq.event_name || '행사'}`,
      body: `${asgn.staff_name || '크루'} ${nowHHMM()} 셀프 체크인 · 안전교육 서명`,
      url: '/m/today', tag: `checkin:${inquiryId}`,
    }, subjectFrom(request), { kind: 'checkin' })
  } catch (e) { console.error('체크인 알림 실패', e) }

  return NextResponse.json({ ok: true })
}
