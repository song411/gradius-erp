import { NextRequest, NextResponse } from 'next/server'
import { sendToAll, subjectFrom, buildDigest } from '@/lib/push'

export const dynamic = 'force-dynamic'

// 요약 알림을 바깥 스케줄러가 부를 때 쓰는 입구. 2026-10-27 사장님이 "아침 요약은 필요 없다"고 해서
// vercel.json 의 크론은 뺐다 — 라우트만 남겨 둔다. 나중에 시간 기반 알림이 필요해지면
// vercel.json 에 crons 를 다시 넣고 Vercel 환경변수 CRON_SECRET 을 설정하면 바로 쓸 수 있다.
// 공개 경로(proxy PUBLIC_PATHS)라서 CRON_SECRET 으로만 받는다. 같은 날 두 번 불려도 한 번만 나간다.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET 환경변수가 없어 아침 요약을 보내지 않습니다. Vercel → Settings → Environment Variables 에 추가하세요.' }, { status: 503 })
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: '권한 없음' }, { status: 401 })
  try {
    const payload = await buildDigest()
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
    const r = await sendToAll(payload, subjectFrom(request), { kind: 'digest', dedupeKey: `digest:${today}` })
    return NextResponse.json({ ...r, payload })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
