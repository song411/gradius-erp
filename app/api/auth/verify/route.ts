import { NextRequest, NextResponse } from 'next/server'

const COOKIE_NAME = 'erp_access'
const COOKIE_MAX_AGE = 60 * 60 * 8  // 8시간 (초)

export async function POST(req: NextRequest) {
  const { code, remember } = await req.json()

  const validCode = process.env.ACCESS_CODE
  if (!validCode) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 })
  }

  if (code !== validCode) {
    return NextResponse.json({ error: '접근 코드가 올바르지 않습니다.' }, { status: 401 })
  }

  const maxAge = remember ? 60 * 60 * 24 * 30 : COOKIE_MAX_AGE  // 기억하기: 30일

  const res = NextResponse.json({ success: true })
  res.cookies.set(COOKIE_NAME, 'granted', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  })
  return res
}

// 잠금 해제 (로그아웃)
export async function DELETE() {
  const res = NextResponse.json({ success: true })
  res.cookies.delete(COOKIE_NAME)
  return res
}
