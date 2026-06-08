import { NextRequest, NextResponse } from 'next/server'

const COOKIE_NAME = 'erp_access'

// 잠금에서 제외할 경로
const PUBLIC_PATHS = [
  '/lock',
  '/api/auth/verify',
  '/_next',
  '/favicon.ico',
  '/logo.png',
]

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 공개 경로는 통과
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // 접근 쿠키 확인
  const hasAccess = req.cookies.get(COOKIE_NAME)?.value === 'granted'

  if (!hasAccess) {
    // 원래 가려던 경로를 ?from= 파라미터로 전달
    const lockUrl = new URL('/lock', req.url)
    lockUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(lockUrl)
  }

  return NextResponse.next()
}

export const config = {
  // API 라우트, 정적 파일 등 제외하고 모든 페이지에 적용
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo.png|api/auth).*)',
  ],
}
