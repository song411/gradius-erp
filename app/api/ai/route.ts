import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { ErpData, TOOLS, runTool } from '@/lib/ai/tools'
import { BASE_INSTRUCTIONS, TOOL_LABEL } from '@/lib/ai/prompt'

const MODEL = 'claude-opus-5'

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

  const client = new Anthropic({ apiKey })
  const encoder = new TextEncoder()

  const responseBody = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))

      // 한 번의 질문 동안에는 같은 테이블을 다시 읽지 않는다
      const erp = new ErpData()
      const convo: Anthropic.MessageParam[] = [...messages]
      let usage: Anthropic.Usage | undefined

      try {
        for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
          const stream = client.messages.stream({
            model: MODEL,
            max_tokens: 16000,
            thinking: { type: 'adaptive' },
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
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              send({ type: 'text', text: event.delta.text })
            }
          }

          const final = await stream.finalMessage()
          usage = final.usage

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

          const results = await Promise.all(calls.map(async call => {
            send({ type: 'tool', name: call.name, label: TOOL_LABEL[call.name] || '조회 중' })
            try {
              const out = await runTool(call.name, call.input as Record<string, unknown>, erp)
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

          // 여러 결과는 반드시 한 메시지에 담는다 — 나눠 보내면
          // 다음부터 도구를 하나씩만 부르게 된다
          convo.push({ role: 'user', content: results })
        }

        send({ type: 'done', usage })
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
