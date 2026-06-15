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

// Supabase 데이터 수집 — 토큰 절약형 요약
async function fetchBusinessContext(): Promise<string> {
  const supabase = createAdminClient()
  const { start, end, label } = getMonthRange()

  try {
    const [inquiriesRes, settlementsRes, staffRes, payoutsRes] = await Promise.all([
      supabase.from('inquiries')
        .select('event_name, company_name, event_start, event_end, status, location, required_staff')
        .order('event_start', { ascending: false })
        .limit(30),
      supabase.from('settlements')
        .select('company_name, site_name, invoice_amount, received_amount, deposit_status, progress')
        .limit(50),
      supabase.from('staff')
        .select('name, gender, age, region, total_score, attendance_score, performance_score, teamwork_score')
        .limit(50),
      supabase.from('payouts')
        .select('staff_name, site_name, final_pay, status, paid_at')
        .limit(50),
    ])

    const inquiries  = inquiriesRes.data  || []
    const settlements = settlementsRes.data || []
    const staff      = staffRes.data      || []
    const payouts    = payoutsRes.data    || []

    // 집계
    const statusCount: Record<string, number> = {}
    inquiries.forEach(i => { statusCount[i.status] = (statusCount[i.status] || 0) + 1 })

    const monthlyInq    = inquiries.filter(i => i.event_start >= start && i.event_start <= end)
    const totalInvoice  = settlements.reduce((s, r) => s + (r.invoice_amount  || 0), 0)
    const totalReceived = settlements.reduce((s, r) => s + (r.received_amount || 0), 0)
    const totalPayout   = payouts.reduce((s, p) => s + (p.final_pay || 0), 0)
    const paidPayout    = payouts.filter(p => p.status === '지급완료').reduce((s, p) => s + (p.final_pay || 0), 0)
    const avgScore      = staff.length > 0 ? (staff.reduce((s,p)=>s+(p.total_score||0),0)/staff.length).toFixed(1) : 'N/A'

    // 최근 행사 목록 (텍스트 압축)
    const inqList = inquiries.slice(0, 15).map(i =>
      `${i.event_start||'?'} | ${i.company_name||''} | ${i.event_name} | ${i.status} | ${i.location||''}`
    ).join('\n')

    // 정산 목록
    const settlList = settlements.slice(0, 15).map(r =>
      `${r.company_name||r.site_name||''} | 청구:${(r.invoice_amount||0).toLocaleString()} | 입금:${(r.received_amount||0).toLocaleString()} | ${r.deposit_status}`
    ).join('\n')

    // 크루 목록
    const staffList = staff.map(s =>
      `${s.name}(${s.gender||'?'}/${s.age||'?'}세/${s.region||'?'}) 종합:${s.total_score||0} 근태:${s.attendance_score||0} 직무:${s.performance_score||0} 팀워크:${s.teamwork_score||0}`
    ).join('\n')

    // 지급 목록
    const payoutList = payouts.slice(0, 15).map(p =>
      `${p.staff_name||''} | ${p.site_name||''} | ${(p.final_pay||0).toLocaleString()}원 | ${p.status}`
    ).join('\n')

    return `
=== 가디어스 ERP 데이터 (${new Date().toLocaleDateString('ko-KR')} / ${label}) ===

[요약]
문의 총 ${inquiries.length}건 (${Object.entries(statusCount).map(([k,v])=>`${k}:${v}`).join(', ')}) / ${label} ${monthlyInq.length}건
청구 ${totalInvoice.toLocaleString()}원 / 입금 ${totalReceived.toLocaleString()}원 / 미수금 ${(totalInvoice-totalReceived).toLocaleString()}원
지급예정 ${totalPayout.toLocaleString()}원 / 완료 ${paidPayout.toLocaleString()}원 / 미지급 ${(totalPayout-paidPayout).toLocaleString()}원
크루 ${staff.length}명 / 평균평점 ${avgScore}점

[최근 행사 (최대 15건)]
${inqList}

[정산 현황 (최대 15건)]
${settlList}

[크루 목록]
${staffList}

[지급 현황 (최대 15건)]
${payoutList}
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
