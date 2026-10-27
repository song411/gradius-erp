import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** 알림 켜기 — 이 기기의 구독을 저장. 같은 endpoint 면 덮어쓴다 */
export async function POST(request: NextRequest) {
  let body: { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }; label?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }) }
  const s = body.subscription
  if (!s?.endpoint || !s.keys?.p256dh || !s.keys?.auth) return NextResponse.json({ error: '구독 정보가 비었습니다' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth,
    user_agent: request.headers.get('user-agent')?.slice(0, 200) || null,
    label: (body.label || '').slice(0, 60) || null,
    failed_count: 0,
  }, { onConflict: 'endpoint' })
  if (error) return NextResponse.json({ error: error.message + ' (018 마이그레이션을 실행했는지 확인)' }, { status: 500 })
  const { count } = await supabase.from('push_subscriptions').select('id', { count: 'exact', head: true })
  return NextResponse.json({ ok: true, devices: count ?? 0 })
}

/** 알림 끄기 — 이 기기의 구독 삭제 */
export async function DELETE(request: NextRequest) {
  let body: { endpoint?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }) }
  if (!body.endpoint) return NextResponse.json({ error: 'endpoint 필요' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', body.endpoint)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** 켜진 기기 수 (설정 화면 표시용) */
export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('push_subscriptions').select('label, user_agent, created_at, last_ok_at, failed_count').order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message, devices: [] }, { status: 200 })
  return NextResponse.json({ devices: data || [] })
}
