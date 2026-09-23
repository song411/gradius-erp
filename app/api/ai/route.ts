import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { ErpData, DraftBox, TOOLS, runTool } from '@/lib/ai/tools'
import { BASE_INSTRUCTIONS, TOOL_LABEL } from '@/lib/ai/prompt'
import { resolveModel, resolveEffort } from '@/lib/ai/model'
import { emptyUsage, addUsage, costOf } from '@/lib/ai/cost'
import { createAdminClient } from '@/lib/supabase/admin'

// 한 번에 넘기는 대화 길이 상한 (토큰 낭비 방지)
const MAX_HISTORY = 20

// 도구를 몇 번까지 돌 것인가 — 무한 루프를 막는 안전장치
const MAX_TOOL_TURNS = 8

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

  let body: { messages: IncomingMessage[]; model?: string; effort?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  const messages = normalizeMessages(body?.messages || [])
  if (messages.length === 0) {
    return NextResponse.json({ error: '메시지가 없습니다.' }, { status: 400 })
  }

  // 화면이 보낸 값은 그대로 믿지 않는다 — 목록에 없는 모델·깊이는 기본값으로 떨어진다
  const model = resolveModel(body?.model)
  const effort = resolveEffort(body?.effort)

  const client = new Anthropic({ apiKey })
  const encoder = new TextEncoder()

  const responseBody = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))

      // 한 번의 질문 동안에는 같은 테이블을 다시 읽지 않는다
      const erp = new ErpData()
      // 도구가 만든 초안을 모아, 화면에 [이대로 입력] 카드로 띄운다
      const drafts = new DraftBox()
      let sentDrafts = 0
      const convo: Anthropic.MessageParam[] = [...messages]
      // 도구를 도는 동안 매 턴이 따로 청구된다. 마지막 턴만 세면 실제 쓴 것의
      // 일부만 세게 된다 — 여러 번 조회하는 질문일수록 크게 어긋난다.
      const usage = emptyUsage()
      let turns = 0
      const usedTools: string[] = []

      try {
        for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
          const stream = client.messages.stream({
            model: model.id,
            max_tokens: 16000,
            // 생각은 켜두고, 요약을 받아 화면에 흘린다. 그냥 두면 답이 나오기 전까지
            // 한참 멈춰 있는 것처럼 보이고, 무엇을 따지고 있는지도 알 수 없다.
            thinking: { type: 'adaptive', display: 'summarized' },
            // 얼마나 오래 따질지 — 사장님이 헤더에서 고른 값
            output_config: { effort: effort.id },
            system: [
              // 앞 블록은 매번 같으므로 캐시에 올린다 — 도구를 도는 동안
              // 이 지침과 도구 목록이 매 요청 다시 실려 나가기 때문이다
              { type: 'text', text: BASE_INSTRUCTIONS, cache_control: { type: 'ephemeral' } },
              { type: 'text', text: `오늘은 ${new Date().toLocaleDateString('ko-KR')} 입니다.` },
            ],
            tools: TOOLS,
            messages: convo,
          })

          for await (const event of stream) {
            if (event.type !== 'content_block_delta') continue
            if (event.delta.type === 'text_delta') {
              send({ type: 'text', text: event.delta.text })
            } else if (event.delta.type === 'thinking_delta') {
              // 답이 아니라 '생각하는 내용'. 화면은 이것을 접어서 따로 보여준다.
              send({ type: 'think', text: event.delta.thinking })
            }
          }

          const final = await stream.finalMessage()
          addUsage(usage, final.usage)
          turns++

          if (final.stop_reason === 'refusal') {
            send({ type: 'error', error: '요청을 처리할 수 없습니다. 질문을 다르게 표현해주세요.' })
            break
          }

          const calls = final.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
          )
          if (calls.length === 0) break   // 할 말을 마쳤다

          // 생각한 흔적(thinking)까지 그대로 되돌려줘야 다음 턴이 이어진다
          convo.push({ role: 'assistant', content: final.content })

          // 어디까지 읽었는지 이 턴 전후로 재서, 새로 읽은 것만 화면에 보낸다
          const scanMark = erp.scans.length
          const turnStart = Date.now()

          const results = await Promise.all(calls.map(async call => {
            usedTools.push(call.name)
            send({ type: 'tool', id: call.id, name: call.name, label: TOOL_LABEL[call.name] || '조회 중' })
            const t0 = Date.now()
            try {
              const out = await runTool(call.name, call.input as Record<string, unknown>, erp, drafts)
              send({ type: 'tool_done', id: call.id, ms: Date.now() - t0, chars: out.length })
              return { type: 'tool_result' as const, tool_use_id: call.id, content: out }
            } catch (err) {
              console.error(`[도구 ${call.name} 오류]`, err)
              return {
                type: 'tool_result' as const,
                tool_use_id: call.id,
                content: `조회 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
                is_error: true,
              }
            }
          }))

          // 이 턴에 실제로 읽은 테이블 — 몇 행을 몇 초에 봤는지 그대로 보여준다.
          // AI가 무엇을 근거로 말하는지가 눈에 보여야 믿을 수 있다.
          const scanned = erp.scans.slice(scanMark)
          if (scanned.length > 0) {
            send({ type: 'scan', tables: scanned, ms: Date.now() - turnStart })
          }

          // 새로 생긴 초안을 화면으로 흘려보낸다. 저장은 하지 않는다 —
          // 사람이 [이대로 입력]을 눌러야 /api/ai/apply 가 저장한다
          while (sentDrafts < drafts.items.length) {
            send({ type: 'proposal', draft: drafts.items[sentDrafts++] })
          }

          // 여러 결과는 반드시 한 메시지에 담는다 — 나눠 보내면
          // 다음부터 도구를 하나씩만 부르게 된다
          convo.push({ role: 'user', content: results })
        }

        send({ type: 'done', usage, cost: costOf(model.id, usage), model: model.id, effort: effort.id })
      } catch (err) {
        console.error('[Claude API 오류]', err)
        send({ type: 'error', error: errorMessage(err) })
      } finally {
        // 쓴 만큼을 남긴다. 실패해도 답은 이미 나갔으니 여기서 막지 않는다 —
        // 기록을 못 남겼다고 대화가 끊기면 본말이 뒤집힌다.
        if (turns > 0) {
          const cost = costOf(model.id, usage)
          const last = messages[messages.length - 1]
          const question = typeof last?.content === 'string' ? last.content.slice(0, 200) : null
          try {
            const { error } = await createAdminClient().from('ai_usage').insert({
              model: model.id,
              effort: effort.id,
              turns,
              input_tokens: usage.input_tokens,
              output_tokens: usage.output_tokens,
              cache_write_tokens: usage.cache_creation_input_tokens,
              cache_read_tokens: usage.cache_read_input_tokens,
              cost_usd: Number(cost.usd.toFixed(6)),
              cost_krw: Number(cost.krw.toFixed(2)),
              question,
              tools: usedTools.length ? [...new Set(usedTools)] : null,
            })
            // 표가 아직 없으면(마이그레이션 015 미실행) 여기서 조용히 지나간다
            if (error) console.warn('[가디 사용기록 남기지 못함]', error.message)
          } catch (err) {
            console.warn('[가디 사용기록 남기지 못함]', err)
          }
        }
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
