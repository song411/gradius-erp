import { NextRequest, NextResponse } from 'next/server'
import { sendToAll, subjectFrom, buildDigest } from '@/lib/push'

export const dynamic = 'force-dynamic'

// 아침 요약. vercel.json 의 crons 가 매일 08:00 KST(23:00 UTC)에 부른다.
// 공개 경로(proxy PUBLIC_PATHS)라서 Vercel 이 붙여 주는 CRON_SECRET 으로만 받는다.
// CRON_SECRET 이 없으면 아무것도 보내지 않고 안내만 돌려준다 — Vercel 프로젝트 환경변수에 넣어야 한다.
// 같은 날 두 번 불려도 push_log 의 dedupe_key(digest:날짜)로 한 번만 나간다.
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
