import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// 공용 링크(/s/e/행사id)에서 본인 이름을 누른 뒤 — 전화번호 뒷 4자리가 맞으면 그 사람의 개인 서명 링크(token)를 돌려준다.
// 개인 링크(/s/token)는 본인 확인이 없지만, 공용 링크는 남의 이름을 눌러 남의 계약서(주민번호·계좌)를 보거나
// 서명해 버리는 일을 막아야 하므로 여기서만 뒷 4자리를 묻는다 (사장님 결정 2026-11-06, 1번안).
// 10번 틀리면 그 계약서는 잠긴다 — 사무실에서 '새 링크'를 만들면 풀린다.
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  let body: { contractId?: string; last4?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 }) }
  const contractId = String(body.contractId || '')
  const last4 = String(body.last4 || '').trim()
  if (!UUID_RE.test(contractId)) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  if (!/^\d{4}$/.test(last4)) return NextResponse.json({ error: '전화번호 뒷 4자리를 숫자로 입력해 주세요.' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: row } = await supabase
    .from('labor_contracts')
    .select('id, token, phone, status, verify_fails')
    .eq('id', contractId)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: '계약서를 찾을 수 없습니다. 담당자에게 문의해 주세요.' }, { status: 404 })
  if (row.status === '서명완료') return NextResponse.json({ error: '이미 서명이 끝난 계약서입니다.' }, { status: 409 })
  if (row.status !== '대기') return NextResponse.json({ error: '서명을 받을 수 없는 계약서입니다. 담당자에게 문의해 주세요.' }, { status: 409 })
  if ((row.verify_fails || 0) >= 10) return NextResponse.json({ error: '본인 확인 시도가 너무 많아 잠겼습니다. 담당자에게 문의해 주세요.' }, { status: 423 })

  const digits = String(row.phone || '').replace(/\D/g, '')
  if (digits.length < 4) return NextResponse.json({ error: '전화번호가 등록되지 않아 본인 확인을 할 수 없습니다. 담당자에게 개인 링크를 요청해 주세요.' }, { status: 409 })
  if (digits.slice(-4) !== last4) {
    await supabase.from('labor_contracts').update({ verify_fails: (row.verify_fails || 0) + 1, updated_at: new Date().toISOString() }).eq('id', row.id)
    return NextResponse.json({ error: '전화번호 뒷 4자리가 맞지 않습니다.' }, { status: 403 })
  }
  return NextResponse.json({ ok: true, token: row.token })
}
