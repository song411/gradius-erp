'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, User, RefreshCw } from 'lucide-react'
import MarkdownView from './ai/MarkdownView'
import ProposalCard from './ai/ProposalCard'
import type { Draft } from '@/lib/ai/draft'
import { MODEL_LABEL } from '@/lib/ai/model'

interface Message {
  role: 'user' | 'assistant'
  content: string
  /** AI가 만든 초안 — 말풍선 아래 [이대로 입력] 카드로 뜬다 */
  drafts?: Draft[]
}

const GREETING = `안녕하세요, 대표님. **가디**입니다.

행사·견적·배정·정산·크루 이력까지 직접 뒤져서 답합니다.
특정 행사나 사람을 콕 집어 물어보셔도 됩니다.

"이번 행사에 누구 보낼까?" 하고 물으시면 **그 현장을 해본 사람**부터 찾아드립니다.`

const QUICK_QUESTIONS = [
  '다음 행사에 누구 보내면 좋을까?',
  '다음주에 무슨 행사 있어?',
  '미수금 많은 순으로 알려줘',
  '이번달 매출이 얼마야?',
  '지급 대기 중인 건이 몇 개야?',
  '전체 현황 요약해줘',
]

// ─── 아크 리액터 ──────────────────────────────────────────
/** 가디의 얼굴. 생각 중일 때 빨라지고 밝아진다 — 지금 일하는 중이라는 신호 */
function ReactorCore({ size = 36, busy = false }: { size?: number; busy?: boolean }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{ boxShadow: busy ? '0 0 18px 2px rgba(34,211,238,.55)' : '0 0 10px rgba(34,211,238,.3)' }}
      />
      <svg viewBox="0 0 100 100" width={size} height={size} className="relative">
        {/* 바깥 눈금 링 */}
        <motion.g
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: busy ? 3 : 14, ease: 'linear' }}
          style={{ originX: '50%', originY: '50%' }}
        >
          <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(34,211,238,.45)"
            strokeWidth="3" strokeDasharray="14 9" strokeLinecap="round" />
        </motion.g>
        {/* 반대로 도는 안쪽 링 */}
        <motion.g
          animate={{ rotate: -360 }}
          transition={{ repeat: Infinity, duration: busy ? 2 : 9, ease: 'linear' }}
          style={{ originX: '50%', originY: '50%' }}
        >
          <circle cx="50" cy="50" r="33" fill="none" stroke="rgba(56,189,248,.6)"
            strokeWidth="4" strokeDasharray="30 18" strokeLinecap="round" />
        </motion.g>
        {/* 코어 */}
        <motion.circle
          cx="50" cy="50" r="19"
          fill="rgba(34,211,238,.18)" stroke="rgba(103,232,249,.9)" strokeWidth="3"
          animate={{ opacity: busy ? [0.55, 1, 0.55] : [0.75, 1, 0.75] }}
          transition={{ repeat: Infinity, duration: busy ? 0.9 : 2.6, ease: 'easeInOut' }}
        />
        <circle cx="50" cy="50" r="7" fill="rgba(165,243,252,.95)" />
      </svg>
    </div>
  )
}

/** 조회 중임을 알리는 막대 — 점 세 개보다 '스캔하는 중'에 가깝다 */
function ScanBars() {
  return (
    <div className="flex items-end gap-[3px]" aria-hidden>
      {[0, 1, 2, 3, 4].map(i => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-cyan-400"
          animate={{ height: [4, 13, 4], opacity: [0.45, 1, 0.45] }}
          transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.11, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

/** 패널 네 귀퉁이 꺾쇠 */
function Corners() {
  const base = 'pointer-events-none absolute w-4 h-4 border-cyan-400/60'
  return (
    <>
      <span className={`${base} left-2 top-2 border-l-2 border-t-2`} />
      <span className={`${base} right-2 top-2 border-r-2 border-t-2`} />
      <span className={`${base} bottom-2 left-2 border-b-2 border-l-2`} />
      <span className={`${base} bottom-2 right-2 border-b-2 border-r-2`} />
    </>
  )
}

function MessageBlock({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'

  if (isUser) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end gap-2.5">
        <div className="max-w-[80%] rounded-xl rounded-tr-sm border border-cyan-400/40 bg-cyan-400/10 px-3.5 py-2 text-sm leading-relaxed text-cyan-50">
          {msg.content}
        </div>
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-400/10">
          <User className="h-3.5 w-3.5 text-cyan-300" />
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2.5">
      <ReactorCore size={28} />
      <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm border border-cyan-400/15 bg-slate-950/50 px-3.5 py-2.5">
        <MarkdownView text={msg.content} />
      </div>
    </motion.div>
  )
}

/** 말풍선 + 그 아래 붙는 초안 카드들 */
function MessageWithDrafts({ msg }: { msg: Message }) {
  return (
    <div className="space-y-2">
      <MessageBlock msg={msg} />
      {msg.drafts?.map((d, i) => <ProposalCard key={i} draft={d} />)}
    </div>
  )
}

export default function AiModal({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: GREETING }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)      // 요청 시작 ~ 종료 (입력 잠금)
  const [streaming, setStreaming] = useState(false)  // 첫 글자가 도착한 뒤
  const [activity, setActivity] = useState<string | null>(null)  // 지금 무엇을 조회 중인지
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // scrollIntoView 를 쓰면 안 된다 — overflow-hidden 인 조상(패널 자체)까지 같이
  // 밀어버려서 헤더가 화면 밖으로 사라진다. 목록 상자만 직접 내린다.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, loading, activity])

  async function sendMessage(text?: string) {
    const userText = (text ?? input).trim()
    if (!userText || loading) return

    setInput('')
    setError(null)
    const newMessages: Message[] = [...messages, { role: 'user', content: userText }]
    setMessages(newMessages)
    setLoading(true)
    setStreaming(false)
    setActivity(null)

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'AI 응답 오류')
      }

      // NDJSON 스트림 — 한 줄에 이벤트 하나 ({type:'text'|'tool'|'error'|'done'})
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let answer = ''
      let started = false
      const collected: Draft[] = []   // 도구가 만든 초안 (저장 안 된 상태)

      const paint = () => {
        const msg: Message = {
          role: 'assistant', content: answer,
          ...(collected.length ? { drafts: [...collected] } : {}),
        }
        if (!started) {
          started = true
          setStreaming(true)
          setMessages(prev => [...prev, msg])
        } else {
          setMessages(prev => {
            const next = [...prev]
            next[next.length - 1] = msg
            return next
          })
        }
      }

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''   // 마지막 조각은 다음 청크와 이어붙인다

        for (const line of lines) {
          if (!line.trim()) continue
          let evt: { type: string; text?: string; error?: string; label?: string; draft?: Draft }
          try { evt = JSON.parse(line) } catch { continue }

          if (evt.type === 'text' && evt.text) {
            answer += evt.text
            setActivity(null)   // 답이 흘러나오기 시작하면 조회 표시는 거둔다
            paint()
          } else if (evt.type === 'tool') {
            setActivity(evt.label || '조회 중')
          } else if (evt.type === 'proposal' && evt.draft) {
            collected.push(evt.draft)
            if (started) paint()
          } else if (evt.type === 'error') {
            throw new Error(evt.error || 'AI 응답 오류')
          }
        }
      }

      if (!started) {
        if (collected.length === 0) throw new Error('응답을 받지 못했습니다.')
        paint()   // 말은 없었지만 초안은 만들어졌다 — 카드만이라도 띄운다
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류'
      setError(msg)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `**연결에 문제가 있습니다.**\n\n${msg}`,
      }])
    } finally {
      setLoading(false)
      setStreaming(false)
      setActivity(null)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function resetChat() {
    setMessages([{ role: 'assistant', content: GREETING }])
    setError(null)
    setInput('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ duration: 0.22 }}
        className="relative flex flex-col overflow-hidden rounded-2xl border border-cyan-400/25 bg-[#060a12]"
        style={{
          width: '100%', maxWidth: 820, height: '86vh', maxHeight: 820,
          boxShadow: '0 0 60px rgba(34,211,238,.18), 0 20px 60px rgba(0,0,0,.6)',
        }}
      >
        {/* 배경 격자 — 아주 옅게 깔아 금속판 느낌만 낸다 */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(34,211,238,.055) 1px, transparent 1px),' +
              'linear-gradient(90deg, rgba(34,211,238,.055) 1px, transparent 1px)',
            backgroundSize: '34px 34px',
          }}
        />
        {/* 위쪽에서 번지는 푸른 빛 */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-48"
          style={{ background: 'radial-gradient(80% 100% at 50% 0%, rgba(34,211,238,.16), transparent 70%)' }}
        />
        {/* 열릴 때 한 번 훑고 지나가는 스캔선 */}
        <motion.div
          className="pointer-events-none absolute inset-x-0 z-20 h-24"
          initial={{ top: '-10%', opacity: 0.85 }}
          animate={{ top: '110%', opacity: 0 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
          style={{ background: 'linear-gradient(180deg, transparent, rgba(34,211,238,.18), transparent)' }}
        />
        <Corners />

        {/* ── 헤더 ───────────────────────────────────────── */}
        <div className="relative z-10 flex shrink-0 items-center gap-3 border-b border-cyan-400/20 px-5 py-3.5">
          <ReactorCore size={38} busy={loading} />
          <div className="min-w-0 flex-1">
            <h2 className="font-mono text-base font-bold tracking-[0.18em] text-cyan-100">
              G · A · D · I
            </h2>
            <p className="mt-0.5 flex items-center gap-1.5 font-mono text-2xs tracking-wider text-cyan-400/70">
              <motion.span
                className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"
                animate={{ opacity: [1, 0.25, 1] }}
                transition={{ repeat: Infinity, duration: 1.8 }}
              />
              {MODEL_LABEL} · ERP LINK ACTIVE
            </p>
          </div>
          <button
            onClick={resetChat}
            title="대화 초기화"
            className="rounded-lg border border-cyan-400/20 p-2 text-cyan-300/80 transition-colors hover:border-cyan-400/50 hover:bg-cyan-400/10 hover:text-cyan-200"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            title="닫기"
            className="rounded-lg border border-cyan-400/20 p-2 text-cyan-300/80 transition-colors hover:border-rose-400/50 hover:bg-rose-400/10 hover:text-rose-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── 대화 ───────────────────────────────────────── */}
        <div ref={listRef} className="relative z-10 flex-1 space-y-3.5 overflow-y-auto overscroll-contain px-5 py-4">
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => <MessageWithDrafts key={idx} msg={msg} />)}
          </AnimatePresence>

          {/* 조회 중에는 무엇을 뒤지고 있는지 밝힌다 — 말없이 멈춰 있으면 고장으로 보인다 */}
          {loading && (!streaming || activity) && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2.5">
              <ReactorCore size={28} busy />
              <div className="flex items-center gap-2.5 rounded-xl rounded-tl-sm border border-cyan-400/20 bg-slate-950/50 px-3.5 py-2.5">
                <ScanBars />
                <span className="font-mono text-xs tracking-wide text-cyan-300">
                  {activity ? `▸ ${activity}` : '▸ 생각하는 중'}
                </span>
              </div>
            </motion.div>
          )}
        </div>

        {/* ── 빠른 질문 (첫 화면에서만) ───────────────────── */}
        {messages.length <= 1 && (
          <div className="relative z-10 shrink-0 px-5 pb-2">
            <p className="mb-2 font-mono text-2xs tracking-wider text-cyan-400/60">▸ QUICK QUERY</p>
            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="truncate rounded-lg border border-cyan-400/20 bg-cyan-400/[0.04] px-3 py-2 text-left text-xs text-slate-300 transition-all hover:border-cyan-400/60 hover:bg-cyan-400/10 hover:text-cyan-100"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── 입력 ───────────────────────────────────────── */}
        <div className="relative z-10 shrink-0 border-t border-cyan-400/20 px-5 pb-4 pt-3">
          {error && (
            <p className="mb-2 font-mono text-2xs text-rose-400">▸ {error}</p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="무엇이든 물어보세요.  (Enter 전송 · Shift+Enter 줄바꿈)"
              rows={2}
              disabled={loading}
              className="flex-1 resize-none rounded-xl border border-cyan-400/25 bg-slate-950/60 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 transition-all focus:border-cyan-400/70 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-50"
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-400/15 text-cyan-200 transition-all hover:border-cyan-300 hover:bg-cyan-400/25 disabled:opacity-30"
              style={{ boxShadow: input.trim() && !loading ? '0 0 16px rgba(34,211,238,.35)' : undefined }}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-center font-mono text-2xs tracking-wide text-slate-600">
            답변은 참고용입니다 · 중요한 결정은 ERP 화면에서 확인하세요
          </p>
        </div>
      </motion.div>
    </div>
  )
}
