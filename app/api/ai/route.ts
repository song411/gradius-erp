import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'

const MODEL = 'claude-opus-5'

// 한 번에 넘기는 대화 길이 상한 (토큰 낭비 방지)
const MAX_HISTORY = 20

// 오늘 날짜 기준 월 범위 반환
function getMonthRange() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = new Date(year, month, 0).toISOString().split('T')[0]
  return { start, end, label: `${year}년 ${month}월` }
}

// 집계용 전체 조회. Supabase 는 서버 설정에 따라 행을 잘라 보낼 수 있으므로
// count 와 실제 받은 행 수를 비교해, 잘렸으면 그 사실을 그대로 알린다.
// (일부만 받아놓고 전체 합계인 척하는 것이 이 함수의 원래 버그였다)
async function fetchAll<T>(
  supabase: ReturnType<typeof createAdminClient>,
  table: string,
  columns: string,
) {
  const { data, count, error } = await supabase
    .from(table)
    .select(columns, { count: 'exact' })
    .limit(5000)
  if (error) throw new Error(`${table}: ${error.message}`)
  const rows = (data || []) as T[]
  const total = count ?? rows.length
  return { rows, total, truncated: rows.length < total }
}

const won = (n: number) => `${Math.round(n).toLocaleString()}원`

// 값 분포를 "상태 건수" 형태로 압축
function distribution(rows: Record<string, unknown>[], col: string, unit = '건'): string {
  const m: Record<string, number> = {}
  rows.forEach(r => {
    const v = r[col] == null || r[col] === '' ? '(미지정)' : String(r[col])
    m[v] = (m[v] || 0) + 1
  })
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}${unit}`).join(' / ')
}

type Inquiry = {
  event_name: string | null; company_name: string | null
  event_start: string | null; event_end: string | null
  status: string; location: string | null; required_staff: number | null
}
type Settlement = {
  company_name: string | null; site_name: string | null
  invoice_amount: number | null; received_amount: number | null
  deposit_status: string | null; progress: string | null
}
type Staff = {
  name: string; gender: string | null; age: number | null; region: string | null
  recommend: string | null; total_score: number | null
  attendance_score: number | null; performance_score: number | null; teamwork_score: number | null
}
type Payout = {
  staff_name: string | null; site_name: string | null
  final_pay: number | null; status: string | null
}

// Supabase 데이터 수집
// 집계(합계·평균·건수)는 전체를 대상으로 계산하고, 목록만 잘라 보여준다.
// TODO(다음 단계): 이 통짜 요약을 질문에 맞춰 골라 쓰는 도구(tool)로 쪼갠다.
//   search_events / find_available_staff / get_staff_history / search_estimates ...
async function fetchBusinessContext(): Promise<string> {
  const supabase = createAdminClient()
  const { start, end, label } = getMonthRange()
  const today = new Date().toISOString().split('T')[0]

  try {
    const [inq, settl, staffRes, payoutRes] = await Promise.all([
      fetchAll<Inquiry>(supabase, 'inquiries',
        'event_name, company_name, event_start, event_end, status, location, required_staff'),
      fetchAll<Settlement>(supabase, 'settlements',
        'company_name, site_name, invoice_amount, received_amount, deposit_status, progress'),
      fetchAll<Staff>(supabase, 'staff',
        'name, gender, age, region, recommend, total_score, attendance_score, performance_score, teamwork_score'),
      fetchAll<Payout>(supabase, 'payouts', 'staff_name, site_name, final_pay, status'),
    ])

    const warn = [inq, settl, staffRes, payoutRes].some(r => r.truncated)
      ? '\n⚠ 일부 테이블이 조회 상한에 걸려 잘렸습니다. 아래 합계는 정확하지 않을 수 있습니다.\n'
      : ''

    // ── 문의/행사 ──────────────────────────────────────────
    // 행사일이 빈 건(견적 단계 등)을 먼저 걸러낸다.
    // 걸러내지 않으면 내림차순 정렬에서 빈 값이 맨 앞으로 와 목록을 통째로 차지한다.
    const dated = inq.rows.filter(i => i.event_start)
    const undated = inq.rows.length - dated.length
    const monthly = dated.filter(i => i.event_start! >= start && i.event_start! <= end)

    const upcoming = dated
      .filter(i => i.event_start! >= today && i.status !== '취소')
      .sort((a, b) => a.event_start!.localeCompare(b.event_start!))
      .slice(0, 12)
      .map(i => `${i.event_start}${i.event_end && i.event_end !== i.event_start ? `~${i.event_end}` : ''} | ${i.company_name || '-'} | ${i.event_name || '-'} | ${i.status} | ${i.location || '-'} | 필요 ${i.required_staff ?? '?'}명`)
      .join('\n') || '(없음)'

    const finished = dated
      .filter(i => i.event_start! < today)
      .sort((a, b) => b.event_start!.localeCompare(a.event_start!))
      .slice(0, 8)
      .map(i => `${i.event_start} | ${i.company_name || '-'} | ${i.event_name || '-'} | ${i.status}`)
      .join('\n') || '(없음)'

    // ── 정산 ───────────────────────────────────────────────
    const invoice = settl.rows.reduce((s, r) => s + (r.invoice_amount || 0), 0)
    const received = settl.rows.reduce((s, r) => s + (r.received_amount || 0), 0)
    const owedRows = settl.rows
      .map(r => ({ ...r, owed: (r.invoice_amount || 0) - (r.received_amount || 0) }))
      .filter(r => r.owed > 0)
      .sort((a, b) => b.owed - a.owed)
    const owedList = owedRows.slice(0, 12)
      .map(r => `${r.company_name || r.site_name || '-'} | 청구 ${won(r.invoice_amount || 0)} | 입금 ${won(r.received_amount || 0)} | 미수 ${won(r.owed)} | ${r.deposit_status || '-'}`)
      .join('\n') || '(없음)'

    // ── 지급 ───────────────────────────────────────────────
    // status 값이 완료/지급완료/확인완료 셋이라 이분법으로 나누지 않고 상태별로 그대로 보고한다.
    const payByStatus: Record<string, { n: number; sum: number }> = {}
    payoutRes.rows.forEach(p => {
      const k = p.status || '(미지정)'
      const b = payByStatus[k] || (payByStatus[k] = { n: 0, sum: 0 })
      b.n++; b.sum += p.final_pay || 0
    })
    const payLine = Object.entries(payByStatus).sort((a, b) => b[1].n - a[1].n)
      .map(([k, v]) => `${k} ${v.n}건(${won(v.sum)})`).join(' / ')
    const pending = payoutRes.rows
      .filter(p => p.status === '확인완료')
      .sort((a, b) => (b.final_pay || 0) - (a.final_pay || 0))
      .slice(0, 10)
      .map(p => `${p.staff_name || '-'} | ${p.site_name || '-'} | ${won(p.final_pay || 0)}`)
      .join('\n') || '(없음)'

    // ── 크루 ───────────────────────────────────────────────
    // 평균은 평가받은 인원만으로 낸다. 미평가(0점)를 섞으면 평균이 통째로 왜곡된다.
    const rated = staffRes.rows.filter(s => (s.total_score || 0) > 0)
    const avgScore = rated.length
      ? (rated.reduce((s, p) => s + (p.total_score || 0), 0) / rated.length).toFixed(2)
      : 'N/A'
    const topCrew = rated
      .sort((a, b) => (b.total_score || 0) - (a.total_score || 0))
      .slice(0, 20)
      .map(s => `${s.name}(${s.gender || '?'}/${s.age ?? '?'}세/${s.region || '지역미상'}) 평점 ${s.total_score} [${s.recommend || '-'}] 근태 ${s.attendance_score ?? '-'} 직무 ${s.performance_score ?? '-'} 팀워크 ${s.teamwork_score ?? '-'}`)
      .join('\n')

    return `
=== 가디어스 ERP 데이터 (${new Date().toLocaleDateString('ko-KR')} 기준 / ${label}) ===
아래 [합계]·[건수] 항목은 전체 데이터를 대상으로 계산한 정확한 값입니다.
[목록]으로 표시된 부분만 일부를 추린 것입니다.${warn}

[문의/행사] 전체 ${inq.total}건
상태: ${distribution(inq.rows, 'status')}
${label} 행사 ${monthly.length}건 / 행사일 미정 ${undated}건 (견적·미체결 단계)

[다가오는 행사 목록 — 최대 12건]
${upcoming}

[최근 종료 행사 목록 — 최대 8건]
${finished}

[정산] 전체 ${settl.total}건
청구 ${won(invoice)} / 입금 ${won(received)} / 미수금 ${won(invoice - received)}
입금상태: ${distribution(settl.rows, 'deposit_status')}
진행상태: ${distribution(settl.rows, 'progress')}
미수 발생 ${owedRows.length}건

[미수 목록 — 금액순 최대 12건]
${owedList}

[지급] 전체 ${payoutRes.total}건
상태별: ${payLine}
※ '확인완료'는 지급 전 단계로 보이나 확정된 정의가 아닙니다. 미지급액을 단정하지 말고 상태별 수치를 그대로 안내하세요.

[확인완료 목록 — 금액순 최대 10건]
${pending}

[크루] 전체 ${staffRes.total}명
평가완료 ${rated.length}명 / 미평가 ${staffRes.total - rated.length}명 / 평가자 평균 ${avgScore}점 (5점 만점)
추천등급: ${distribution(staffRes.rows, 'recommend', '명')}

[평점 상위 크루 목록 — 최대 20명]
${topCrew}
`.trim()
  } catch (err) {
    console.error('[AI Context 수집 오류]', err)
    return '(데이터 조회 오류 — 일반 질문에는 답변 가능합니다)'
  }
}

const BASE_INSTRUCTIONS = `당신은 가디어스(Guardius) 경호·에이전시 전문 AI 비서 "가디"입니다.
아래 [ERP 데이터]를 근거로 실무 질문에 답하되, 판단과 조언은 적극적으로 하세요.

[반드시 지킬 것]
- 항상 한국어로 답변합니다.
- 수치·이름·날짜·현장명은 [ERP 데이터]에 실제로 있는 것만 인용합니다. 없는 값은 절대 지어내지 않습니다.
- [ERP 데이터]에서 [합계]·[건수]·[상태별] 수치는 전체를 집계한 정확한 값이니 그대로 인용하세요.
  반면 '목록'이라 적힌 부분은 상위 몇 건만 추린 것입니다. 목록에 없다고 해서 존재하지 않는 것이 아닙니다.
- 특정 행사·크루·거래처를 콕 집어 묻는데 목록에 없으면, "목록에 없어 확인이 어렵다"고 말하고
  ERP의 어느 화면에서 보면 되는지 안내하세요. 목록에 있는 다른 항목으로 대충 답하지 않습니다.
- 계산은 데이터에 있는 숫자로 직접 하고, 어떤 항목을 더했는지 근거를 짧게 덧붙입니다.
- 금액은 천 단위 콤마와 '원'을 씁니다. (예: 1,500,000원)
- 실시간 인터넷 검색은 불가능합니다. 오늘 날씨·뉴스 등은 솔직히 안내하세요.

[어투]
- 간결하고 실무적으로. 항목이 여럿이면 표나 불릿을 씁니다.
- 친근하되 과장하지 않습니다. 이모지는 꼭 필요할 때만.
- 인력 추천·단가 판단·고객 응대 조언은 근거를 밝히고 자신 있게 제시하세요.`

type IncomingMessage = { role: string; content: string }

// Claude는 첫 메시지가 user여야 한다 — 모달의 첫 인사말(assistant)을 걷어낸다
function normalizeMessages(raw: IncomingMessage[]): Anthropic.MessageParam[] {
  const cleaned = raw
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    .slice(-MAX_HISTORY)

  while (cleaned.length > 0 && cleaned[0].role === 'assistant') cleaned.shift()
  return cleaned
}

function errorMessage(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return 'API 키가 올바르지 않습니다. ANTHROPIC_API_KEY를 확인해주세요.'
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return 'API 키에 이 모델을 쓸 권한이 없습니다. Console에서 결제·권한을 확인해주세요.'
  }
  if (err instanceof Anthropic.RateLimitError) {
    return '요청이 몰렸습니다. 잠시 후 다시 시도해주세요.'
  }
  if (err instanceof Anthropic.APIError) {
    return err.status && err.status >= 500
      ? `Claude 서버 오류(${err.status})입니다. 잠시 후 다시 시도해주세요.`
      : `요청 오류: ${err.message}`
  }
  return err instanceof Error ? err.message : '알 수 없는 오류'
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' }, { status: 503 })
  }

  let body: { messages: IncomingMessage[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  const messages = normalizeMessages(body?.messages || [])
  if (messages.length === 0) {
    return NextResponse.json({ error: '메시지가 없습니다.' }, { status: 400 })
  }

  const businessContext = await fetchBusinessContext()
  const client = new Anthropic({ apiKey })

  const encoder = new TextEncoder()
  const responseBody = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))

      try {
        const stream = client.messages.stream({
          model: MODEL,
          max_tokens: 16000,
          thinking: { type: 'adaptive' },
          system: [
            { type: 'text', text: BASE_INSTRUCTIONS },
            { type: 'text', text: `[ERP 데이터]\n${businessContext}` },
          ],
          messages,
        })

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            send({ type: 'text', text: event.delta.text })
          }
        }

        const final = await stream.finalMessage()
        if (final.stop_reason === 'refusal') {
          send({ type: 'error', error: '요청을 처리할 수 없습니다. 질문을 다르게 표현해주세요.' })
        }
        send({ type: 'done', usage: final.usage })
      } catch (err) {
        console.error('[Claude API 오류]', err)
        send({ type: 'error', error: errorMessage(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(responseBody, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}
