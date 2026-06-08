import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const COOKIE_NAME = 'erp_access'

// 잠금에서 제외할 경로
const PUBLIC_PATHS = [
  '/lock',
  '/api/auth/verify',
  '/_next',
  '/favicon.ico',
  '/logo.png',
]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── 접근 코드 잠금 체크 ──────────────────────────
  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))
  if (!isPublic) {
    const hasAccess = request.cookies.get(COOKIE_NAME)?.value === 'granted'
    if (!hasAccess) {
      const lockUrl = new URL('/lock', request.url)
      lockUrl.searchParams.set('from', pathname)
      return NextResponse.redirect(lockUrl)
    }
  }

  // ── Supabase 세션 갱신 (토큰 자동 리프레시) ───────
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  await supabase.auth.getUser()

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
