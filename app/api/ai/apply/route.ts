import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUPPORT_TYPES, type Draft } from '@/lib/ai/draft'

// AI 초안을 실제로 저장하는 곳 — 사람이 [이대로 입력]을 눌렀을 때만 불린다.
// ─────────────────────────────────────────────────────────
// AI 는 이 경로를 부를 수 없다. 도구는 초안을 만들 뿐이고, 저장은 사람의 클릭에서
// 시작한다. 그래서 잘못 만들어진 초안은 누르지 않으면 아무 일도 일어나지 않는다.
//
// 열려 있는 것은 문의(inquiries)와 견적(estimates+estimate_items) 둘뿐이다.
// 배정·지급·정산은 돈과 사람이 걸려 있어 여기서 손대지 않는다.

/** 기존 화면과 같은 방식으로 코드를 발급한다 (INQ-YYYYMMDD-XXXX / EST-...) */
function issueCode(prefix: 'INQ' | 'EST'): string {
  const now = new Date()
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const rand = Math.random().toString(36).toUpperCase().slice(2, 6)
  return `${prefix}-${ymd}-${rand}`
}

/** 문의 테이블에 실제로 있는 칸만 통과시킨다 — 초안에 엉뚱한 키가 섞여도 저장이 깨지지 않게 */
const INQUIRY_FIELDS = new Set([
  'company_name', 'contact_name', 'phone', 'event_name', 'location',
  'event_start', 'event_end', 'event_time', 'service_type', 'required_staff',
  'expected_pay', 'pay_detail', 'attire', 'meal', 'parking', 'notes', 'memo',
  'consult_notes', 'category', 'status',
])

function cleanInquiry(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (!INQUIRY_FIELDS.has(k)) continue
    if (v === '' || v === undefined) continue      // 빈 문자열은 넣지 않는다
    out[k] = v
  }
  out.status = out.status || '접수'
  return out
}

export async function POST(req: NextRequest) {
  let body: { draft?: Draft }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  const draft = body?.draft
  if (!draft || (draft.kind !== 'inquiry' && draft.kind !== 'estimate')) {
    return NextResponse.json({ error: '저장할 수 있는 초안이 아닙니다.' }, { status: 400 })
  }

  const supabase = createAdminClient()

  try {
    if (draft.kind === 'inquiry') {
      const payload = cleanInquiry(draft.fields as Record<string, unknown>)
      if (!payload.event_name && !payload.company_name) {
        return NextResponse.json(
          { error: '거래처와 행사명이 둘 다 비어 있어 저장하지 않았습니다.' }, { status: 400 })
      }
      const { data, error } = await supabase
        .from('inquiries')
        .insert({ ...payload, inquiry_code: issueCode('INQ') })
        .select('id, inquiry_code, company_name, event_name')
        .single()
      if (error) throw new Error(error.message)

      return NextResponse.json({
        ok: true, kind: 'inquiry', id: data.id,
        message: `문의 ${data.inquiry_code} 로 등록했습니다.`,
        href: '/inquiries',
      })
    }

    // ── 견적 ──────────────────────────────────────────────
    if (!draft.inquiry_id) {
      return NextResponse.json({ error: '어느 문의의 견적인지가 없습니다.' }, { status: 400 })
    }
    const billable = draft.items.filter(it => !SUPPORT_TYPES.includes(it.item_type))
    if (billable.length === 0) {
      return NextResponse.json({ error: '품목이 없어 저장하지 않았습니다.' }, { status: 400 })
    }

    const t = draft.totals
    const { data: est, error: estErr } = await supabase
      .from('estimates')
      .insert({
        estimate_code: issueCode('EST'),
        version_label: 'A안',
        inquiry_id: draft.inquiry_id,
        company_name: draft.company_name || null,
        event_name: draft.event_name || null,
        supply_price: t.supply,
        vat: t.vat,
        total_price: t.total,
        cost_price: t.cost,
        extra_cost: 0,
        profit_rate: t.profit_rate,
        send_status: '미발송',
        // expected_profit 은 DB가 계산하는 칸이라 직접 넣지 않는다
      })
      .select('id, estimate_code')
      .single()
    if (estErr) throw new Error(estErr.message)

    const items = draft.items.map((it, idx) => ({
      estimate_id: est.id,
      inquiry_id: draft.inquiry_id,
      role_name: it.role_name,
      quantity: it.quantity,
      days: it.days,
      unit_price: it.unit_price,
      pay_unit_price: it.pay_unit_price,
      is_leader: it.is_leader,
      item_type: it.item_type,
      discount: 0,
      sort_order: idx,
      spec: it.spec || null,
    }))
    const { error: itemErr } = await supabase.from('estimate_items').insert(items)
    if (itemErr) {
      // 품목이 안 들어갔으면 머리만 남은 견적이 된다 — 되돌린다
      await supabase.from('estimates').delete().eq('id', est.id)
      throw new Error(`품목 저장 실패로 견적을 취소했습니다: ${itemErr.message}`)
    }

    return NextResponse.json({
      ok: true, kind: 'estimate', id: est.id,
      message: `견적 ${est.estimate_code} 로 등록했습니다. (품목 ${items.length}줄)`,
      href: '/estimates',
    })
  } catch (err) {
    console.error('[초안 저장 실패]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.' },
      { status: 500 })
  }
}
