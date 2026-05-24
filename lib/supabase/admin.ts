import { createClient } from '@supabase/supabase-js'

// 서버 전용 관리자 클라이언트 (RLS 우회 — 절대 클라이언트 컴포넌트에서 import 금지)
// 이 파일은 Next.js API Route / Server Action 에서만 사용
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
