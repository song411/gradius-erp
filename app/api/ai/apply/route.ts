import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUPPORT_TYPES, type Draft } from '@/lib/ai/draft'

// AI 초안을 실제로 저장하는 곳 — 사람이 [이대로 입력]을 눌렀을 때만 불린다.
// ─────────────────────────────────────────────────────────
// AI 는 이 경로를 부를 수 없다. 도구는 초안을 만들 뿐이고, 저장은 사람의 클릭에서
// 시작한다. 그래서 잘못 만들어진 초안은 누르지 않으면 아무 일도 일어나지 않는다.
//
// 열려 있는 것은 문의·견적·배정 셋이다. 지급·정산은 돈이 직접 나가는 자리라 닫아뒀다.
// 배정은 상태를 '배정중'으로만 넣는다 — 확정은 섭외가 끝난 뒤 사람이 배정 화면에서 바꾼다.

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
  const ALLOWED = ['inquiry', 'estimate', 'assignment']
  if (!draft || !ALLOWED.includes(draft.kind)) {
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

    // ── 배정 ──────────────────────────────────────────────
    if (draft.kind === 'assignment') {
      if (!draft.inquiry_id) {
        return NextResponse.json({ error: '어느 행사의 배정인지가 없습니다.' }, { status: 400 })
      }
      if (draft.rows.length === 0) {
        return NextResponse.json({ error: '넣을 사람이 없습니다.' }, { status: 400 })
      }

      // 이미 이 행사에 들어가 있는 사람은 건너뛴다.
      // 초안 카드가 두 장 떠 있을 수 있고(AI가 다시 만들면), 둘 다 누르면
      // 같은 사람이 두 번 들어가 지급이 겹친다. 저장 직전에 다시 본다.
      const { data: existing } = await supabase
        .from('assignments')
        .select('staff_name')
        .eq('inquiry_id', draft.inquiry_id)
        .neq('status', '취소')
      const taken = new Set((existing || []).map(r => (r.staff_name as string || '').trim()))

      const fresh = draft.rows.filter(r => !taken.has(r.staff_name.trim()))
      const skipped = draft.rows.length - fresh.length
      if (fresh.length === 0) {
        return NextResponse.json({
          ok: true, kind: 'assignment', id: draft.inquiry_id,
          message: `이미 배정돼 있어 새로 넣은 사람은 없습니다. (${skipped}명 건너뜀)`,
          href: '/assignments',
        })
      }

      // 크루 카드에서 연락처·계좌를 가져온다 — 지급할 때 필요하다
      const ids = fresh.map(r => r.staff_id).filter(Boolean) as string[]
      const { data: staffRows } = ids.length
        ? await supabase.from('staff')
            .select('id, phone, bank_name, account_number, id_number').in('id', ids)
        : { data: [] as Array<Record<string, unknown>> }
      const byId = new Map((staffRows || []).map(r => [r.id as string, r]))

      const payload = fresh.map(r => {
        const s = r.staff_id ? byId.get(r.staff_id) : undefined
        return {
          inquiry_id: draft.inquiry_id,
          event_name: draft.event_name || null,
          staff_id: r.staff_id || null,
          staff_name: r.staff_name,
          staff_type: '크루',
          job_type: r.job_type || null,
          phone: (s?.phone as string) || r.phone || null,
          bank_name: (s?.bank_name as string) || null,
          account_number: (s?.account_number as string) || null,
          id_number: (s?.id_number as string) || null,
          pay_rate: r.pay_rate,
          // 날짜를 고른 배정만 일수가 따라온다. 안 고르면 준 값 그대로 —
          // 운영일 수로 밀면 지난 행사 지급액까지 소급으로 틀어진다
          work_days: r.work_dates && r.work_dates.length > 0 ? r.work_dates.length : r.work_days,
          ...(r.work_dates && r.work_dates.length > 0 ? { work_dates: r.work_dates } : {}),
          status: '배정중',
          is_payable: true,
          is_present: true,
          role_type: r.role_type || null,
          start_date: draft.event_start || null,
          end_date: draft.event_end || null,
        }
      })

      const { data, error } = await supabase.from('assignments').insert(payload).select('id')
      if (error) throw new Error(error.message)

      return NextResponse.json({
        ok: true, kind: 'assignment', id: draft.inquiry_id,
        message: `${data?.length ?? payload.length}명을 배정표에 넣었습니다. (상태: 배정중)` +
          (skipped > 0 ? ` ${skipped}명은 이미 배정돼 있어 건너뛰었습니다.` : ''),
        href: '/assignments',
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
