import { NextRequest, NextResponse } from 'next/server'
import { sendToAll, subjectFrom, buildDigest } from '@/lib/push'

export const dynamic = 'force-dynamic'

/** 설정 화면의 "테스트 보내기". body.digest 가 true 면 아침 요약을 지금 보낸다 (내용 확인용, 중복 방지 없음) */
export async function POST(request: NextRequest) {
  let body: { digest?: boolean } = {}
  try { body = await request.json() } catch { /* 빈 몸통 허용 */ }
  try {
    const payload = body.digest
      ? await buildDigest()
      : { title: '가디어스 알림 테스트', body: '이 알림이 보이면 켜진 것입니다.', url: '/m/more', tag: 'test' }
    const r = await sendToAll(payload, subjectFrom(request), { kind: body.digest ? 'digest-test' : 'test' })
    return NextResponse.json(r)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
