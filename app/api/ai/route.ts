import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { createAdminClient } from '@/lib/supabase/admin'

// 오늘 날짜 기준 월 범위 반환
function getMonthRange() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = new Date(year, month, 0).toISOString().split('T')[0]
  return { start, end, label: `${year}년 ${month}월` }
}

// Supabase 실제 데이터를 JSON으로 수집 → AI가 직접 분석
async function fetchBusinessContext(): Promise<string> {
  const supabase = createAdminClient()
  const { label } = getMonthRange()

  try {
    const [inquiriesRes, settlementsRes, staffRes, payoutsRes] = await Promise.all([
      supabase.from('inquiries')
        .select('id, event_name, company_name, event_start, event_end, status, location, required_staff, expected_pay, memo')
        .order('event_start', { ascending: false })
        .limit(80),
      supabase.from('settlements')
        .select('id, inquiry_id, company_name, site_name, invoice_amount, supply_price, vat, received_amount, payout_amount, deposit_status, progress, profit')
        .limit(150),
      supabase.from('staff')
        .select('id, name, gender, age, region, total_score, attendance_score, performance_score, appearance_score, teamwork_score')
        .limit(100),
      supabase.from('payouts')
        .select('id, inquiry_id, staff_name, site_name, dispatch_days, base_pay, final_pay, status, paid_at')
        .limit(150),
    ])

    const inquiries = inquiriesRes.data || []
    const settlements = settlementsRes.data || []
    const staff = staffRes.data || []
    const payouts = payoutsRes.data || []

    // 빠른 집계 (AI가 계산하기 쉽도록 요약도 함께 제공)
    const statusCount: Record<string, number> = {}
    inquiries.forEach(i => { statusCount[i.status] = (statusCount[i.status] || 0) + 1 })

    const totalInvoice   = settlements.reduce((s, r) => s + (r.invoice_amount  || 0), 0)
    const totalReceived  = settlements.reduce((s, r) => s + (r.received_amount || 0), 0)
    const totalPayout    = payouts.reduce((s, p) => s + (p.final_pay || 0), 0)
    const paidPayout     = payouts.filter(p => p.status === '지급완료').reduce((s, p) => s + (p.final_pay || 0), 0)

    return `
=== 가디어스 ERP 실시간 데이터 (${new Date().toLocaleDateString('ko-KR')} / ${label}) ===

## 📊 집계 요약
- 전체 문의: ${inquiries.length}건 / 상태별: ${Object.entries(statusCount).map(([k,v])=>`${k} ${v}건`).join(', ')}
- 총 청구금액: ${totalInvoice.toLocaleString()}원 / 총 입금액: ${totalReceived.toLocaleString()}원 / 미수금: ${(totalInvoice-totalReceived).toLocaleString()}원
- 총 지급예정: ${totalPayout.toLocaleString()}원 / 지급완료: ${paidPayout.toLocaleString()}원 / 미지급: ${(totalPayout-paidPayout).toLocaleString()}원
- 크루 인원: ${staff.length}명

## 📋 문의 목록 (최근 80건)
${JSON.stringify(inquiries, null, 0)}

## 💰 정산 목록 (최근 150건)
${JSON.stringify(settlements, null, 0)}

## 👥 크루(직원) 목록
${JSON.stringify(staff, null, 0)}

## 💳 지급 목록 (최근 150건)
${JSON.stringify(payouts, null, 0)}
`.trim()
  } catch (err) {
    console.error('[AI Context 수집 오류]', err)
    return '(데이터 조회 오류 — 일반 질문에는 답변 가능합니다)'
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY가 설정되지 않았습니다.' }, { status: 503 })
  }

  let body: { messages: { role: string; content: string }[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  const { messages } = body
  if (!messages || messages.length === 0) {
    return NextResponse.json({ error: '메시지가 없습니다.' }, { status: 400 })
  }

  const businessContext = await fetchBusinessContext()

  const systemPrompt = `당신은 가디어스(Guardius) 경호·에이전시 전문 AI 비서 "가디"입니다.
아래 ERP 실시간 데이터를 기반으로 업무 질문에 답변하되, AI로서의 지식과 추론 능력을 적극 활용하세요.

[답변 원칙]
- 항상 한국어로 답변하세요.
- ERP 데이터가 있는 질문은 데이터를 우선 참고하여 정확하게 답변하세요.
- ERP 데이터에 없는 일반 질문(날씨, 상식, 업무 조언 등)은 AI 본연의 지식으로 자유롭게 답변하세요.
- 금액은 천 단위 콤마를 사용하세요 (예: 1,500,000원).
- 인력 추천, 업무 전략, 고객 응대 조언 등 경호·에이전시 실무 전반에 대해 적극적으로 도움을 주세요.
- 친근하고 전문적인 어투를 유지하되, 필요시 이모지를 활용해 읽기 쉽게 답변하세요.
- 실시간 인터넷 검색은 불가능하므로, 최신 정보(오늘 날씨, 실시간 뉴스 등)가 필요한 경우 솔직하게 안내하세요.

[ERP 실시간 데이터]
${businessContext}`

  try {
    const groq = new Groq({ apiKey })

    // Groq 형식으로 메시지 변환 (system 메시지는 별도, user/assistant만)
    const chatMessages = messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        ...chatMessages,
      ],
      temperature: 0.7,
      max_tokens: 1024,
    })

    const reply = completion.choices[0]?.message?.content || '응답을 받지 못했습니다.'
    return NextResponse.json({ reply })
  } catch (err: unknown) {
    console.error('[Groq API 오류]', err)
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return NextResponse.json({ error: `AI 응답 오류: ${message}` }, { status: 500 })
  }
}
