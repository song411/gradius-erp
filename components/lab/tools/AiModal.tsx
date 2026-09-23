'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, User, RefreshCw, Brain, ChevronDown } from 'lucide-react'
import MarkdownView from './ai/MarkdownView'
import ProposalCard from './ai/ProposalCard'
import ErpScope, { type ScanRow, type TraceStep } from './ai/ErpScope'
import type { Draft } from '@/lib/ai/draft'
import { MODELS, EFFORTS, DEFAULT_MODEL, DEFAULT_EFFORT, resolveModel } from '@/lib/ai/model'
import { krwLabel } from '@/lib/ai/cost'

interface Message {
  role: 'user' | 'assistant'
  content: string
  /** AI가 만든 초안 — 말풍선 아래 [이대로 입력] 카드로 뜬다 */
  drafts?: Draft[]
  /** 이 답을 만들며 ERP를 어떻게 훑었는지 */
  steps?: TraceStep[]
  scans?: ScanRow[]
  /** 답하기 전에 무엇을 따졌는지 (모델이 준 생각 요약) */
  thinking?: string
  /** 이 답 한 번에 든 값 (원) */
  costKrw?: number
}

const GREETING = `안녕하세요, 대표님. **가디**입니다.

행사·견적·배정·정산·크루 이력까지 직접 뒤져서 답합니다.
특정 행사나 사람을 콕 집어 물어보셔도 됩니다.

"이번 행사에 누구 보낼까?" 하고 물으시면 **그 현장을 해본 사람**부터,
1순위와 예비까지 **여러 명**을 이유와 함께 뽑아드립니다. 섭외 문구도 만들어 드립니다.`

const QUICK_QUESTIONS = [
  '다음 행사에 누구 보내면 좋을까?',
  '그 사람들한테 보낼 섭외 문구 만들어줘',
  '다음주에 무슨 행사 있어?',
  '미수금 많은 순으로 알려줘',
  '이번달 매출이 얼마야?',
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

/** 답 아래 접혀 있는 '생각 과정'.
 *  펼치기 전에는 한 줄만 차지한다 — 평소에는 답만 보고, 미심쩍을 때만 열어 본다. */
function ThinkingPanel({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  if (!text.trim()) return null

  return (
    <div className="ml-[38px]">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-violet-400/25 px-2 py-1 font-mono text-2xs text-violet-300/80 transition-colors hover:border-violet-400/50 hover:bg-violet-400/10"
      >
        <Brain className="h-3 w-3" />
        생각 과정 {open ? '접기' : '보기'}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1 max-h-72 overflow-y-auto rounded-xl border border-violet-400/20 bg-violet-400/[0.04] px-3 py-2 text-violet-200/75">
          <MarkdownView text={text} />
        </div>
      )}
    </div>
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
      {msg.thinking && <ThinkingPanel text={msg.thinking} />}
      {msg.steps && msg.steps.length > 0 && (
        <ErpScope steps={msg.steps} scans={msg.scans ?? []} live={false} />
      )}
      {msg.costKrw !== undefined && msg.costKrw > 0 && (
        <p className="ml-[38px] font-mono text-2xs text-slate-500">
          ▸ 이 답에 약 {krwLabel(msg.costKrw)}
        </p>
      )}
      {msg.drafts?.map((d, i) => <ProposalCard key={i} draft={d} />)}
    </div>
  )
}

/** 지난번에 고른 값을 되살린다. 저장소를 막아둔 브라우저면 기본값으로 간다. */
function readStored(key: string, allowed: string[], fallback: string): string {
  if (typeof window === 'undefined') return fallback
  try {
    const v = localStorage.getItem(key)
    return v && allowed.includes(v) ? v : fallback
  } catch { return fallback }
}

export default function AiModal({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: GREETING }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)      // 요청 시작 ~ 종료 (입력 잠금)
  const [streaming, setStreaming] = useState(false)  // 첫 글자가 도착한 뒤
  const [activity, setActivity] = useState<string | null>(null)  // 지금 무엇을 조회 중인지
  const [liveSteps, setLiveSteps] = useState<TraceStep[]>([])    // 지금 하고 있는 일
  const [liveScans, setLiveScans] = useState<ScanRow[]>([])      // 지금까지 읽은 테이블
  const [liveThink, setLiveThink] = useState('')                 // 지금 무엇을 따지는 중인지
  const [monthLabel, setMonthLabel] = useState<string | null>(null)  // 이번 달 가디 사용료
  const [error, setError] = useState<string | null>(null)
  // 어떤 모델로 얼마나 깊게 볼지 — 사장님이 고른 값을 다음에 열 때도 그대로 쓴다
  const [modelId, setModelId] = useState(() =>
    readStored('gadi.model', MODELS.map(m => m.id), DEFAULT_MODEL))
  const [effortId, setEffortId] = useState(() =>
    readStored('gadi.effort', EFFORTS.map(e => e.id), DEFAULT_EFFORT) as typeof DEFAULT_EFFORT)
  const model = resolveModel(modelId)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 이번 달 얼마 썼는지 — 열 때 한 번, 답할 때마다 한 번 새로 본다
  const loadUsage = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/usage')
      const data = await res.json()
      setMonthLabel(data?.ready ? data.month.label : null)
    } catch { /* 못 읽어도 대화에는 지장이 없다 */ }
  }, [])

  // 열 때 한 번. 떠난 뒤 도착한 응답으로 사라진 화면을 건드리지 않게 끊어준다.
  useEffect(() => {
    let alive = true
    fetch('/api/ai/usage')
      .then(r => r.json())
      .then(d => { if (alive) setMonthLabel(d?.ready ? d.month.label : null) })
      .catch(() => { /* 못 읽어도 대화에는 지장이 없다 */ })
    return () => { alive = false }
  }, [])

  function pickModel(id: string) {
    setModelId(id)
    try { localStorage.setItem('gadi.model', id) } catch { /* 무시 */ }
  }
  function pickEffort(id: typeof DEFAULT_EFFORT) {
    setEffortId(id)
    try { localStorage.setItem('gadi.effort', id) } catch { /* 무시 */ }
  }

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
    setLiveSteps([])
    setLiveScans([])
    setLiveThink('')

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, model: modelId, effort: effortId }),
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
      let steps: TraceStep[] = []     // ERP를 어떻게 훑었는지
      const scans: ScanRow[] = []
      let thinking = ''               // 답하기 전에 따진 것
      let costKrw: number | undefined // 이 답에 든 값

      const paint = () => {
        const msg: Message = {
          role: 'assistant', content: answer,
          ...(thinking ? { thinking } : {}),
          ...(costKrw !== undefined ? { costKrw } : {}),
          ...(collected.length ? { drafts: [...collected] } : {}),
          ...(steps.length ? { steps: [...steps], scans: [...scans] } : {}),
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
          let evt: {
            type: string; text?: string; error?: string; label?: string
            draft?: Draft; id?: string; ms?: number; tables?: ScanRow[]
            cost?: { usd: number; krw: number }
          }
          try { evt = JSON.parse(line) } catch { continue }

          if (evt.type === 'text' && evt.text) {
            answer += evt.text
            setActivity(null)   // 답이 흘러나오기 시작하면 조회 표시는 거둔다
            paint()
          } else if (evt.type === 'think' && evt.text) {
            thinking += evt.text
            setLiveThink(thinking)
            if (started) paint()
          } else if (evt.type === 'tool') {
            setActivity(evt.label || '조회 중')
            steps = [...steps, { id: evt.id || String(steps.length), label: evt.label || '조회 중', done: false }]
            setLiveSteps(steps)
          } else if (evt.type === 'tool_done') {
            steps = steps.map(st => st.id === evt.id ? { ...st, done: true, ms: evt.ms } : st)
            setLiveSteps(steps)
            if (started) paint()
          } else if (evt.type === 'scan' && Array.isArray(evt.tables)) {
            scans.push(...evt.tables)
            setLiveScans([...scans])
            if (started) paint()
          } else if (evt.type === 'proposal' && evt.draft) {
            collected.push(evt.draft)
            if (started) paint()
          } else if (evt.type === 'done') {
            costKrw = evt.cost?.krw
            if (started) paint()
          } else if (evt.type === 'error') {
            throw new Error(evt.error || 'AI 응답 오류')
          }
        }
      }

      if (!started) {
        if (collected.length === 0 && !thinking) throw new Error('응답을 받지 못했습니다.')
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
      setLiveSteps([])
      setLiveScans([])
      setLiveThink('')
      loadUsage()   // 방금 쓴 만큼을 헤더에 바로 반영한다
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
              {model.label} · ERP LINK ACTIVE
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

        {/* ── 모델·사고 깊이 ─────────────────────────────
            둘 다 답의 질과 비용을 동시에 움직이는 손잡이라, 질문 앞에 놓아
            고르고 나서 묻게 한다. 답하는 중에는 잠근다 — 도중에 바뀌면
            같은 대화 안에서 앞뒤 답이 다른 기준으로 나온다. */}
        <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-cyan-400/12 px-5 py-2">
          <div className="flex items-center gap-1">
            <span className="mr-1 font-mono text-2xs tracking-wider text-cyan-400/50">MODEL</span>
            {MODELS.map(m => (
              <button
                key={m.id}
                onClick={() => pickModel(m.id)}
                disabled={loading}
                title={m.desc}
                className={`rounded-md border px-2 py-0.5 font-mono text-2xs transition-colors disabled:opacity-40 ${
                  m.id === modelId
                    ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-100'
                    : 'border-cyan-400/15 text-cyan-400/60 hover:border-cyan-400/40 hover:text-cyan-200'
                }`}
              >
                {m.short}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <span className="mr-1 font-mono text-2xs tracking-wider text-cyan-400/50">사고</span>
            {EFFORTS.map(e => (
              <button
                key={e.id}
                onClick={() => pickEffort(e.id)}
                disabled={loading}
                title={e.desc}
                className={`rounded-md border px-2 py-0.5 text-2xs transition-colors disabled:opacity-40 ${
                  e.id === effortId
                    ? 'border-violet-400/60 bg-violet-400/15 text-violet-100'
                    : 'border-violet-400/15 text-violet-300/50 hover:border-violet-400/40 hover:text-violet-200'
                }`}
              >
                {e.short}
              </button>
            ))}
          </div>

          {monthLabel && (
            <span
              className="ml-auto font-mono text-2xs text-cyan-400/50"
              title="이번 달 가디를 쓴 값 (우리가 되짚은 어림값 — 정확한 청구는 Anthropic Console)"
            >
              이번 달 {monthLabel}
            </span>
          )}
        </div>

        {/* ── 대화 ───────────────────────────────────────── */}
        <div ref={listRef} className="relative z-10 flex-1 space-y-3.5 overflow-y-auto overscroll-contain px-5 py-4">
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => <MessageWithDrafts key={idx} msg={msg} />)}
          </AnimatePresence>

          {/* 일하는 동안 ERP가 움직이는 것을 그대로 보여준다.
              말없이 멈춰 있으면 고장으로 보이고, 무엇을 읽었는지 보여야 답을 믿을 수 있다 */}
          {loading && (!streaming || activity || liveSteps.length > 0) && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
              <div className="flex gap-2.5">
                <ReactorCore size={28} busy />
                <div className="flex items-center gap-2.5 rounded-xl rounded-tl-sm border border-cyan-400/20 bg-slate-950/50 px-3.5 py-2.5">
                  <ScanBars />
                  <span className="font-mono text-xs tracking-wide text-cyan-300">
                    {activity ? `▸ ${activity}` : '▸ 생각하는 중'}
                  </span>
                </div>
              </div>
              {liveThink && (
                <div className="ml-[38px] rounded-lg border border-violet-400/20 bg-violet-400/[0.05] px-2.5 py-1.5">
                  <p className="font-mono text-2xs leading-relaxed text-violet-300/75">
                    {liveThink.trim().split('\n').filter(Boolean).slice(-2).join(' ').slice(-160)}
                  </p>
                </div>
              )}
              {(liveSteps.length > 0 || liveScans.length > 0) && (
                <ErpScope steps={liveSteps} scans={liveScans} live />
              )}
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
