import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { currentCode } from '@/lib/checkinCode'
import { UUID_RE } from '@/lib/checkin'
import { createAdminClient } from '@/lib/supabase/admin'

// 현장 코드·QR — 팀장 휴대폰의 현장 화면이 부른다. 잠금(proxy.ts) 안에 있으므로 ERP 에 들어온 사람만 받는다.
// /api/checkin 아래에 두지 않는 이유: 그 경로는 PUBLIC_PATHS 라 누구나 열린다.
//  · GET  ?inq=  → 지금 코드·QR·남은 시간
//  · POST {inq, lat, lng, acc} → 팀장 폰 위치를 그날 행사장 기준점으로 저장 (023). 거리 기록의 기준이 된다
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const inq = request.nextUrl.searchParams.get('inq') || ''
  if (!UUID_RE.test(inq)) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost'
  const proto = request.headers.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')
  const { code, secondsLeft } = currentCode(inq)
  const url = `${proto}://${host}/c/${inq}?k=${code}`
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, width: 240, errorCorrectionLevel: 'M' })
  return NextResponse.json({ code, secondsLeft, url, svg })
}

export async function POST(request: NextRequest) {
  let body: { inq?: string; lat?: number; lng?: number; acc?: number }
  try { body = await request.json() } catch { return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 }) }
  const inq = String(body.inq || '')
  const lat = Number(body.lat), lng = Number(body.lng), acc = Math.round(Number(body.acc) || 0)
  if (!UUID_RE.test(inq) || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }
  const supabase = createAdminClient()
  const { error } = await supabase.from('inquiries')
    .update({ site_lat: lat, site_lng: lng, site_acc: acc, site_at: new Date().toISOString() })
    .eq('id', inq)
  if (error) return NextResponse.json({ error: '기준점 저장 실패 — 023 마이그레이션을 확인해 주세요.' }, { status: 500 })
  return NextResponse.json({ ok: true, acc })
}
