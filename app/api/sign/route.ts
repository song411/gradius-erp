import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendToAll, subjectFrom } from '@/lib/push'

// 근로계약서 전자서명 — 로그인 없이 호출되는 공개 라우트 (proxy.ts PUBLIC_PATHS).
// 체크인(/api/checkin)과 같은 원칙으로 범위를 최대한 좁힌다.
//  · 쓰기 전용(POST). 계약서 내용은 /s/[token] 서버 페이지가 직접 읽는다 — 공개 GET 없음.
//  · 할 수 있는 일은 "대기 상태인 계약서에 서명 한 번" 뿐. 내용·상태를 바꾸는 다른 길은 없다.
//  · 본인 확인은 전화번호 뒷 4자리. 10번 틀리면 그 링크는 잠긴다(사무실에서 새 링크).
export const dynamic = 'force-dynamic'

const TOKEN_RE = /^[0-9a-f]{32}$/
const MAX_SIGNATURE_BYTES = 400_000

export async function POST(request: NextRequest) {
  let body: { token?: string; last4?: string; signature?: string; agreed?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 }) }

  const token = String(body.token || '')
  const last4 = String(body.last4 || '').trim()
  const signature = String(body.signature || '')
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: '잘못된 링크입니다.' }, { status: 400 })
  if (!/^\d{4}$/.test(last4)) return NextResponse.json({ error: '전화번호 뒷 4자리를 숫자로 입력해 주세요.' }, { status: 400 })
  if (!signature.startsWith('data:image/png;base64,') || signature.length > MAX_SIGNATURE_BYTES) {
    return NextResponse.json({ error: '서명을 그려 주세요.' }, { status: 400 })
  }
  if (body.agreed !== true) return NextResponse.json({ error: '계약 내용에 동의해야 서명할 수 있습니다.' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: row } = await supabase
    .from('labor_contracts')
    .select('id, assignment_id, inquiry_id, staff_name, phone, status, verify_fails')
    .eq('token', token)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: '계약서를 찾을 수 없습니다. 담당자에게 링크를 다시 요청해 주세요.' }, { status: 404 })
  if (row.status === '서명완료') return NextResponse.json({ error: '이미 서명이 끝난 계약서입니다.' }, { status: 409 })
  if (row.status !== '대기') return NextResponse.json({ error: '서명을 받을 수 없는 계약서입니다. 담당자에게 문의해 주세요.' }, { status: 409 })
  if ((row.verify_fails || 0) >= 10) return NextResponse.json({ error: '본인 확인 시도가 너무 많아 잠겼습니다. 담당자에게 새 링크를 요청해 주세요.' }, { status: 423 })

  const phoneDigits = String(row.phone || '').replace(/\D/g, '')
  if (phoneDigits.length < 4) return NextResponse.json({ error: '전화번호가 등록되지 않아 본인 확인을 할 수 없습니다. 담당자에게 문의해 주세요.' }, { status: 409 })
  if (phoneDigits.slice(-4) !== last4) {
    await supabase.from('labor_contracts').update({ verify_fails: (row.verify_fails || 0) + 1, updated_at: new Date().toISOString() }).eq('id', row.id)
    return NextResponse.json({ error: '전화번호 뒷 4자리가 맞지 않습니다.' }, { status: 403 })
  }

  const signedAt = new Date().toISOString()
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null
  const { error } = await supabase
    .from('labor_contracts')
    .update({
      status: '서명완료', signed_at: signedAt, signature_data: signature,
      signer_ua: (request.headers.get('user-agent') || '').slice(0, 300) || null, signer_ip: ip,
      verified_by: '전화 뒷4자리', updated_at: signedAt,
    })
    .eq('id', row.id)
    .eq('status', '대기')   // 동시에 두 번 눌러도 한 번만
  if (error) return NextResponse.json({ error: '저장에 실패했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500 })

  // 사무실 휴대폰에 알림 — 실패해도 서명은 끝난 것
  try {
    const { data: ev } = row.inquiry_id
      ? await supabase.from('inquiries').select('event_name').eq('id', row.inquiry_id).maybeSingle()
      : { data: null }
    await sendToAll({
      title: `근로계약서 서명 · ${ev?.event_name || '행사'}`,
      body: `${row.staff_name || '크루'} 서명 완료`,
      url: `/assignments/contract?a=${row.assignment_id}`, tag: `sign:${row.id}`,
    }, subjectFrom(request), { kind: 'sign', dedupeKey: `sign:${row.id}` })
  } catch (e) { console.error('서명 알림 실패', e) }

  return NextResponse.json({ ok: true, signed_at: signedAt })
}
