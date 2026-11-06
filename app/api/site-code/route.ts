import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { currentCode } from '@/lib/checkinCode'
import { UUID_RE } from '@/lib/checkin'

// 현장 코드·QR — 팀장 휴대폰의 현장 화면이 부른다. 잠금(proxy.ts) 안에 있으므로 ERP 에 들어온 사람만 받는다.
// /api/checkin 아래에 두지 않는 이유: 그 경로는 PUBLIC_PATHS 라 누구나 열린다.
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
