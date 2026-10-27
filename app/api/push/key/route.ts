import { NextRequest, NextResponse } from 'next/server'
import { getVapid, subjectFrom } from '@/lib/push'

export const dynamic = 'force-dynamic'

/** 휴대폰이 구독할 때 쓰는 공개키. 잠금 뒤에 있다 (쿠키 필요) */
export async function GET(request: NextRequest) {
  try {
    const v = await getVapid(subjectFrom(request))
    return NextResponse.json({ publicKey: v.publicKey })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
