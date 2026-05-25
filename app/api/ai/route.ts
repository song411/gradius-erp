import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
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

// Supabase에서 핵심 비즈니스 데이터 요약 수집
async function fetchBusinessContext(): Promise<string> {
  const supabase = createAdminClient()
  const { start, end, label } = getMonthRange()

  try {
    // 이번달 문의 현황
    const [inquiriesRes, settlementsRes, staffRes, payoutsRes, assignmentsRes] = await Promise.all([
      supabase.from('inquiries').select('id, status, event_name, company_name, event_start, event_end, location').order('created_at', { ascending: false }).limit(100),
      supabase.from('settlements').select('id, inquiry_id, contract_amount, received_amount, status').limit(200),
      supabase.from('staff').select('id, name, position, is_active, score').eq('is_active', true),
      supabase.from('payouts').select('id, inquiry_id, final_pay, status').limit(200),
      supabase.from('assignments').select('id, inquiry_id, staff_id, role').limit(200),
    ])

    const inquiries = inquiriesRes.data || []
    const settlements = settlementsRes.data || []
    const staff = staffRes.data || []
    const payouts = payoutsRes.data || []
    const assignments = assignmentsRes.data || []

    // 문의 상태별 집계
    const statusCount: Record<string, number> = {}
    inquiries.forEach(i => { statusCount[i.status] = (statusCount[i.status] || 0) + 1 })

    // 이번달 행사만 필터
    const monthlyInquiries = inquiries.filter(i =>
      i.event_start >= start && i.event_start <= end
    )

    // 정산 집계
    const totalContractAmount = settlements.reduce((s, r) => s + (r.contract_amount || 0), 0)
    const totalReceivedAmount = settlements.reduce((s, r) => s + (r.received_amount || 0), 0)
    const pendingAmount = totalContractAmount - totalReceivedAmount

    // 지급 집계
    const totalPayout = payouts.reduce((s, p) => s + (p.final_pay || 0), 0)
    const pendingPayouts = payouts.filter(p => p.status === '대기' || p.status === '검토완료').length
    const completedPayouts = payouts.filter(p => p.status === '지급완료').length

    // 최근 행사 목록 (최대 10개)
    const recentEvents = inquiries.slice(0, 10).map(i =>
      `- ${i.event_name || '(미정)'}(${i.company_name || ''}) / ${i.event_start || ''} / 상태: ${i.status}`
    ).join('\n')

    // 스태프 통계
    const avgScore = staff.length > 0
      ? (staff.reduce((s, p) => s + (p.score || 0), 0) / staff.length).toFixed(1)
      : 'N/A'

    const context = `
=== 가디어스 ERP 현황 데이터 (${new Date().toLocaleDateString('ko-KR')} 기준) ===

[전체 문의 현황]
- 총 문의 건수: ${inquiries.length}건
- 상태별: ${Object.entries(statusCount).map(([k, v]) => `${k} ${v}건`).join(', ')}
- ${label} 행사: ${monthlyInquiries.length}건

[정산/매출 현황]
- 총 계약금액: ${totalContractAmount.toLocaleString()}원
- 총 입금액: ${totalReceivedAmount.toLocaleString()}원
- 미수금 (미입금): ${pendingAmount.toLocaleString()}원

[인력 지급 현황]
- 총 지급 예정액: ${totalPayout.toLocaleString()}원
- 지급 대기/검토: ${pendingPayouts}건
- 지급 완료: ${completedPayouts}건

[크루(직원) 현황]
- 재직 중 인원: ${staff.length}명
- 평균 평점: ${avgScore}점

[총 배정 건수]
- 전체 배정: ${assignments.length}건

[최근 행사 목록 (최대 10건)]
${recentEvents}
`.trim()

    return context
  } catch (err) {
    console.error('[AI Context 수집 오류]', err)
    return '(데이터 조회 오류 — 일반 질문에는 답변 가능합니다)'
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey || apiKey === '여기에_발급받은_키_붙여넣기') {
    return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다. .env.local 파일을 확인해주세요.' }, { status: 503 })
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

  // Supabase 컨텍스트 수집
  const businessContext = await fetchBusinessContext()

  const systemPrompt = `당신은 가디어스(Guardius) 경호·에이전시 전용 ERP의 AI 업무 도우미입니다.
회사의 실시간 데이터를 바탕으로 대표님과 팀원들의 업무 질문에 친절하고 정확하게 답변합니다.

[주의사항]
- 항상 한국어로 답변하세요.
- 금액은 천 단위 콤마를 사용하세요 (예: 1,500,000원).
- 모르거나 데이터에 없는 내용은 솔직하게 "해당 정보는 확인이 어렵습니다"라고 답하세요.
- 경호·경비·에이전시 업무에 맞는 실무적 조언도 함께 제공할 수 있습니다.
- 친근하면서도 전문적인 어투를 유지하세요.

${businessContext}`

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    // 대화 히스토리를 Gemini 형식으로 변환 (마지막 메시지 제외 → history)
    // Gemini 규칙: history는 반드시 'user' 메시지로 시작해야 함
    // → 앞쪽의 'model'(assistant 환영 메시지 등) 제거
    const rawHistory = messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
    const firstUserIdx = rawHistory.findIndex(m => m.role === 'user')
    const history = firstUserIdx >= 0 ? rawHistory.slice(firstUserIdx) : []

    const lastMessage = messages[messages.length - 1].content

    const chat = model.startChat({
      history,
      systemInstruction: systemPrompt,
    })

    const result = await chat.sendMessage(lastMessage)
    const text = result.response.text()

    return NextResponse.json({ reply: text })
  } catch (err: unknown) {
    console.error('[Gemini API 오류]', err)
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return NextResponse.json({ error: `AI 응답 오류: ${message}` }, { status: 500 })
  }
}
