'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, Bot, User, RefreshCw, Sparkles, ChevronRight } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

// 빠른 질문 예시 목록
const QUICK_QUESTIONS = [
  '이번달 매출이 얼마야?',
  '미수금이 얼마나 돼?',
  '현재 재직 중인 크루는 몇 명이야?',
  '지급 대기 중인 건이 몇 개야?',
  '최근 행사 현황 알려줘',
  '전체 문의 상태 요약해줘',
]

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-2">
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="w-2 h-2 rounded-full bg-violet-400"
          animate={{ y: [0, -5, 0] }}
          transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* 아바타 */}
      <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shadow
        ${isUser ? 'bg-blue-500' : 'bg-gradient-to-br from-violet-600 to-purple-700'}`}>
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      {/* 말풍선 */}
      <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 shadow-sm text-sm leading-relaxed whitespace-pre-wrap
        ${isUser
          ? 'bg-blue-500 text-white rounded-tr-sm'
          : 'bg-white text-gray-800 border border-gray-100 rounded-tl-sm'
        }`}>
        {msg.content}
      </div>
    </motion.div>
  )
}

export default function AiModal({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '안녕하세요! 저는 가디어스 ERP AI 도우미입니다 🤖\n\n매출, 미수금, 크루 현황, 지급 상태 등 실시간 데이터를 바탕으로 궁금한 것을 물어보세요!\n아래 빠른 질문을 눌러도 됩니다.',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(text?: string) {
    const userText = (text ?? input).trim()
    if (!userText || loading) return

    setInput('')
    setError(null)
    const newMessages: Message[] = [...messages, { role: 'user', content: userText }]
    setMessages(newMessages)
    setLoading(true)

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'AI 응답 오류')
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch (err) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류'
      setError(msg)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ 죄송합니다. 오류가 발생했습니다.\n${msg}`,
      }])
    } finally {
      setLoading(false)
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
    setMessages([{
      role: 'assistant',
      content: '대화를 초기화했습니다. 새로운 질문을 입력해주세요! 😊',
    }])
    setError(null)
    setInput('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
        className="relative bg-gray-50 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: '100%', maxWidth: 760, height: '85vh', maxHeight: 800 }}
      >
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-5 py-4 flex items-center gap-3 shrink-0">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-bold text-base leading-tight">가디어스 AI 업무 도우미</h2>
            <p className="text-violet-200 text-xs mt-0.5">Gemini 1.5 Flash · 실시간 ERP 데이터 연동</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetChat}
              className="p-2 rounded-lg hover:bg-white/20 transition-colors text-white"
              title="대화 초기화"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/20 transition-colors text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 메시지 영역 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => (
              <MessageBubble key={idx} msg={msg} />
            ))}
          </AnimatePresence>

          {loading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-2.5"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 shadow-sm">
                <TypingDots />
              </div>
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 빠른 질문 버튼 (메시지가 1개일 때만 표시) */}
        {messages.length <= 1 && (
          <div className="px-4 pb-2 shrink-0">
            <p className="text-xs text-gray-400 mb-2 font-medium">💡 빠른 질문</p>
            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="flex items-center gap-1.5 text-left text-xs text-gray-600 bg-white border border-gray-200 rounded-xl px-3 py-2 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50 transition-all group"
                >
                  <ChevronRight className="w-3 h-3 text-gray-300 group-hover:text-violet-400 shrink-0" />
                  <span className="line-clamp-1">{q}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 입력 영역 */}
        <div className="px-4 pb-4 pt-2 shrink-0 border-t border-gray-100 bg-white">
          {error && (
            <p className="text-xs text-red-500 mb-2 flex items-center gap-1">
              <span>⚠️</span> {error}
            </p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="질문을 입력하세요... (Enter로 전송, Shift+Enter 줄바꿈)"
              rows={2}
              className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
              disabled={loading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 text-white flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-all shadow"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-gray-300 mt-1.5 text-center">
            AI 답변은 참고용입니다. 중요한 의사결정은 ERP 데이터를 직접 확인하세요.
          </p>
        </div>
      </motion.div>
    </div>
  )
}
