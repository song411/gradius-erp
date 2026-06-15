'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ContactsModal from './tools/ContactsModal'
import MbtiModal from './tools/MbtiModal'
import TaxCalcModal from './tools/TaxCalcModal'
import TarotModal from './tools/TarotModal'
import QuoteModal from './tools/QuoteModal'
import AiModal from './tools/AiModal'
import GuideModal from './tools/GuideModal'
import KitModal from './tools/KitModal'
import IncomeModal from './tools/IncomeModal'
import DispatchModal from './tools/DispatchModal'

// ───────── 도구 정의 ─────────
type ToolStatus = 'ready' | 'beta' | 'soon'
interface Tool {
  id: string
  emoji: string
  name: string
  desc: string
  category: string
  status: ToolStatus
  gradient: string
  link?: string
}

const TOOLS: Tool[] = [
  // 가이드 & 도구
  {
    id: 'guide',
    emoji: '📚',
    name: 'ERP 가이드북',
    desc: '업무 플로우 · 메뉴별 사용법 · FAQ · 버전별 업데이트 노트',
    category: '가이드 & 도구',
    status: 'ready',
    gradient: 'from-amber-500 to-orange-600',
  },
  {
    id: 'kit',
    emoji: '🛠️',
    name: 'ERP 고도화 준비키트',
    desc: '피드백 · 기획서 · 데이터점검 · 리서치 — 개선 아이디어를 체계적으로 기록하고 관리',
    category: '가이드 & 도구',
    status: 'ready',
    gradient: 'from-violet-500 to-purple-700',
  },
  // 경비업무
  {
    id: 'contacts',
    emoji: '📞',
    name: '전국 경비업 연락처',
    desc: '지방경찰청 경비업 담당부서 연락처 · 배치신고 시 한 번에 찾기',
    category: '경비업무',
    status: 'ready',
    gradient: 'from-blue-500 to-blue-700',
  },
  {
    id: 'deploy-report',
    emoji: '📋',
    name: '배치신고서 작성기',
    desc: '인원배정 DB 연동 → 경비업법 표준 양식 자동 완성',
    category: '경비업무',
    status: 'ready',
    gradient: 'from-sky-500 to-cyan-600',
  },
  {
    id: 'license',
    emoji: '🏅',
    name: '자격·서류 관리',
    desc: '이수증 만료일 D-Day · 성범죄 회보서 유효기간 · 교육 현황 추적',
    category: '경비업무',
    status: 'soon',
    gradient: 'from-indigo-500 to-violet-600',
  },
  // 팀 & 크루
  {
    id: 'mbti',
    emoji: '🧩',
    name: 'MBTI 팀 궁합',
    desc: '두 크루의 MBTI로 팀 케미 분석 · 협업 스타일 파악',
    category: '팀 & 크루',
    status: 'ready',
    gradient: 'from-purple-500 to-pink-600',
  },
  {
    id: 'matching',
    emoji: '🎯',
    name: '크루 스마트 매칭',
    desc: '행사 조건에 맞는 최적 크루 조합을 AI가 추천',
    category: '팀 & 크루',
    status: 'soon',
    gradient: 'from-rose-500 to-orange-500',
  },
  // 계산 도구
  {
    id: 'income-ledger',
    emoji: '📑',
    name: '사업소득대장',
    desc: '월별 인건비 지급 내역 자동 정리 · 소득세 3% / 지방소득세 0.3% · 엑셀 내보내기',
    category: '계산 도구',
    status: 'ready',
    gradient: 'from-teal-500 to-cyan-600',
  },
  {
    id: 'taxcalc',
    emoji: '🧮',
    name: '세금 공제 계산기',
    desc: '3.3% / 0.9% / 비과세 공제 후 실수령액 즉시 계산',
    category: '계산 도구',
    status: 'ready',
    gradient: 'from-emerald-500 to-teal-600',
  },
  {
    id: 'profit-sim',
    emoji: '📊',
    name: '수익 시뮬레이터',
    desc: '투입 인원·단가 조정으로 예상 수익률을 미리 시뮬레이션',
    category: '계산 도구',
    status: 'soon',
    gradient: 'from-amber-500 to-orange-600',
  },
  // 재미 & 동기부여
  {
    id: 'tarot',
    emoji: '🎴',
    name: '오늘의 타로',
    desc: '메이저 아르카나 22장 중 한 장을 뽑아 오늘의 업무 메시지를 확인하세요',
    category: '재미 & 동기부여',
    status: 'ready',
    gradient: 'from-indigo-600 to-purple-800',
  },
  {
    id: 'quote',
    emoji: '💬',
    name: '오늘의 한마디',
    desc: '리더십·팀워크·현장 격언 — 랜덤 뽑기로 오늘의 명언을',
    category: '재미 & 동기부여',
    status: 'ready',
    gradient: 'from-slate-600 to-gray-800',
  },
  // AI & 데이터
  {
    id: 'ai',
    emoji: '🤖',
    name: 'AI 업무 도우미',
    desc: '가디어스 ERP 데이터를 바탕으로 매출·미수금·크루 현황을 자연어로 질문하세요',
    category: 'AI & 데이터',
    status: 'soon',
    gradient: 'from-violet-600 to-purple-800',
  },
  {
    id: 'report-gen',
    emoji: '📄',
    name: '리포트 생성기',
    desc: '월간 운영 리포트 · 고객사 제출용 결과보고서 자동 생성',
    category: 'AI & 데이터',
    status: 'soon',
    gradient: 'from-gray-500 to-gray-700',
  },
]

const CATEGORIES = ['전체', '가이드 & 도구', '경비업무', '팀 & 크루', '계산 도구', '재미 & 동기부여', 'AI & 데이터']
const STATUS_META: Record<ToolStatus, { label: string; cls: string }> = {
  ready: { label: '사용 가능',    cls: 'bg-green-100 text-green-700 border-green-200' },
  beta:  { label: 'BETA',        cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  soon:  { label: '준비 중',     cls: 'bg-gray-100 text-gray-500 border-gray-200' },
}

// AI 모달은 전체화면 오버레이로 직접 렌더 (다른 모달보다 크므로 분리)
function ToolModal({ toolId, onClose }: { toolId: string; onClose: () => void }) {
  // AI 모달은 자체 오버레이를 포함하므로 별도 처리
  if (toolId === 'ai')             return <AiModal        onClose={onClose} />
  if (toolId === 'guide')          return <GuideModal     onClose={onClose} />
  if (toolId === 'income-ledger')  return <IncomeModal    onClose={onClose} />
  if (toolId === 'dispatch')       return <DispatchModal  onClose={onClose} />

  // kit은 넓은 모달이 필요하므로 별도 max-w 적용
  const isWide = toolId === 'kit'

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose} />
        <motion.div className={`relative z-10 w-full ${isWide ? 'max-w-2xl' : 'max-w-2xl'} bg-white rounded-2xl shadow-2xl overflow-hidden`}
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
          {toolId === 'contacts'  && <ContactsModal onClose={onClose} />}
          {toolId === 'mbti'      && <MbtiModal     onClose={onClose} />}
          {toolId === 'taxcalc'   && <TaxCalcModal  onClose={onClose} />}
          {toolId === 'tarot'     && <TarotModal    onClose={onClose} />}
          {toolId === 'quote'     && <QuoteModal    onClose={onClose} />}
          {toolId === 'kit'       && <KitModal      onClose={onClose} />}
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

export default function LabContent() {
  const [category, setCategory] = useState('전체')
  const [openTool, setOpenTool] = useState<string | null>(null)

  const STATUS_ORDER: Record<ToolStatus, number> = { ready: 0, beta: 1, soon: 2 }
  const visible = TOOLS
    .filter(t => category === '전체' || t.category === category)
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])

  function handleClick(tool: Tool) {
    if (tool.status === 'soon') return
    if (tool.link) { window.open(tool.link, '_blank'); return }
    setOpenTool(tool.id)
  }

  const readyCount = TOOLS.filter(t => t.status === 'ready').length
  const soonCount  = TOOLS.filter(t => t.status === 'soon').length

  return (
    <div className="min-h-full bg-gradient-to-b from-gray-900 to-gray-950">

      {/* ── 히어로 배너 ── */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-500/20 via-transparent to-transparent" />
        <div className="relative px-8 py-10">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🔬</span>
                <span className="text-amber-400 text-xs font-bold tracking-[0.2em] uppercase">Guardius Lab</span>
              </div>
              <h1 className="text-3xl font-extrabold text-white leading-tight">스마트연구소</h1>
              <p className="text-gray-400 text-sm mt-2 max-w-lg">
                경호·인력파견 에이전시를 위한 전용 스마트 도구 모음입니다.<br />
                실무에서 자주 필요한 기능을 한 곳에 모았습니다.
              </p>
              <div className="flex gap-3 mt-4">
                <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/30 rounded-full px-3 py-1">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-green-300 text-xs font-semibold">{readyCount}개 사용 가능</span>
                </div>
                <div className="flex items-center gap-1.5 bg-gray-500/10 border border-gray-500/30 rounded-full px-3 py-1">
                  <span className="text-gray-400 text-xs font-semibold">{soonCount}개 준비 중</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 카테고리 필터 ── */}
      <div className="px-8 pb-2 flex gap-2 flex-wrap sticky top-0 bg-gray-900/90 backdrop-blur-sm py-3 z-10 border-b border-gray-800">
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setCategory(cat)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${
              category === cat
                ? 'bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/20'
                : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-amber-500/50 hover:text-amber-300'
            }`}>{cat}</button>
        ))}
      </div>

      {/* ── 도구 그리드 ── */}
      <div className="px-8 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((tool, i) => {
            const meta = STATUS_META[tool.status]
            const isReady = tool.status !== 'soon'
            return (
              <motion.div key={tool.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, delay: i * 0.03 }}
                onClick={() => handleClick(tool)}
                className={`relative group rounded-2xl border overflow-hidden transition-all duration-200 ${
                  isReady
                    ? 'border-gray-700 hover:border-amber-500/60 cursor-pointer hover:shadow-xl hover:shadow-black/30'
                    : 'border-gray-800 opacity-60 cursor-not-allowed'
                }`}>

                {/* 그라디언트 상단 바 */}
                <div className={`h-1.5 bg-gradient-to-r ${tool.gradient}`} />

                <div className="bg-gray-800/60 p-5">
                  {/* 이모지 + 상태 뱃지 */}
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-4xl leading-none filter drop-shadow-sm">{tool.emoji}</span>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.cls}`}>
                        {meta.label}
                      </span>
                      <span className="text-[10px] text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full">{tool.category}</span>
                    </div>
                  </div>

                  {/* 이름 + 설명 */}
                  <h3 className={`text-base font-extrabold mb-1.5 ${isReady ? 'text-white group-hover:text-amber-300' : 'text-gray-400'} transition-colors`}>
                    {tool.name}
                  </h3>
                  <p className="text-xs text-gray-400 leading-relaxed">{tool.desc}</p>

                  {/* 하단 액션 힌트 */}
                  <div className="mt-4 flex items-center justify-end">
                    {isReady ? (
                      <span className="text-xs text-amber-400 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                        열기 →
                      </span>
                    ) : (
                      <span className="text-xs text-gray-600">출시 예정</span>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* ── 하단 로드맵 메시지 ── */}
      <div className="px-8 pb-10">
        <div className="bg-gray-800/40 border border-gray-700 rounded-2xl p-5 text-center">
          <p className="text-gray-300 text-sm font-semibold">💡 필요한 도구가 있으신가요?</p>
          <p className="text-gray-500 text-xs mt-1">스마트연구소는 계속 업데이트됩니다. 실무에서 필요한 기능을 제안해 주세요.</p>
        </div>
      </div>

      {/* ── 모달 ── */}
      {openTool && <ToolModal toolId={openTool} onClose={() => setOpenTool(null)} />}
    </div>
  )
}
