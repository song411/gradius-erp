'use client'

import { useState, useCallback } from 'react'
import { X, RefreshCw, Quote, Star } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface QuoteItem {
  text: string
  author: string
  emoji: string
  category: '리더십' | '팀워크' | '도전' | '삶의 지혜' | '현장 격언'
}

const QUOTES: QuoteItem[] = [
  // 리더십
  { text: '리더는 희망을 파는 사람이다.', author: '나폴레옹 보나파르트', emoji: '👑', category: '리더십' },
  { text: '최고의 리더는 사람들로 하여금 자신이 스스로 이뤘다고 느끼게 만든다.', author: '노자', emoji: '🌿', category: '리더십' },
  { text: '훌륭한 리더는 뒤에서 밀지 않고 앞에서 이끈다.', author: '넬슨 만델라', emoji: '✊', category: '리더십' },
  { text: '지휘관이 두렵다면 병사들은 용감해진다.', author: '손자', emoji: '⚔️', category: '리더십' },
  { text: '명령하는 사람은 복종하는 법을 먼저 배워야 한다.', author: '아리스토텔레스', emoji: '📚', category: '리더십' },
  { text: '좋은 리더는 평범한 사람들이 비범한 일을 하도록 이끈다.', author: '존 D. 록펠러', emoji: '💡', category: '리더십' },
  { text: '결단이 없으면 전략도 없다.', author: '썬 마이크로시스템즈 창업자', emoji: '⚡', category: '리더십' },
  { text: '팀은 한 사람이 꿈꾸는 것보다 더 많은 것을 꿈꿀 수 있다.', author: '존 C. 맥스웰', emoji: '🌟', category: '리더십' },
  // 팀워크
  { text: '혼자 가면 빠르고, 함께 가면 멀리 간다.', author: '아프리카 속담', emoji: '🤝', category: '팀워크' },
  { text: '위대한 것은 혼자서 이루지 않는다.', author: '마가릿 미드', emoji: '🌍', category: '팀워크' },
  { text: '팀 케미는 훈련으로 만들어지지 않는다. 신뢰로 만들어진다.', author: '빌 캠벨', emoji: '🔥', category: '팀워크' },
  { text: '각자가 최선을 다할 때 전체는 더 커진다.', author: '필 잭슨', emoji: '🏀', category: '팀워크' },
  { text: '재능은 게임에서 이기게 하지만, 팀워크는 챔피언십을 만든다.', author: '마이클 조던', emoji: '🏆', category: '팀워크' },
  { text: '모두가 움직여야 배가 나아간다.', author: '한국 속담', emoji: '⛵', category: '팀워크' },
  { text: '연결되지 않은 강점은 약점이다.', author: '스티브 잡스', emoji: '🔗', category: '팀워크' },
  // 도전
  { text: '불가능이란 아무것도 하지 않으려는 자의 변명이다.', author: '나폴레옹 보나파르트', emoji: '💥', category: '도전' },
  { text: '두려움을 느낀다면 그건 당신이 성장하고 있다는 신호다.', author: '로빈 샤르마', emoji: '🌱', category: '도전' },
  { text: '실패는 포기할 때만 실패가 된다.', author: '이순신 장군', emoji: '⚓', category: '도전' },
  { text: '부딪혀 보기 전에는 아무도 모른다.', author: '한국 속담', emoji: '🎯', category: '도전' },
  { text: '지금 할 수 없는 것이 나중을 결정하는 게 아니다. 지금 하느냐가 결정한다.', author: '톰 홉킨스', emoji: '⏰', category: '도전' },
  { text: '완벽한 계획보다 지금 당장의 행동이 낫다.', author: '조지 S. 패튼 장군', emoji: '🚀', category: '도전' },
  { text: '용기란 두려움이 없는 것이 아니라, 두려움에도 행동하는 것이다.', author: '마크 트웨인', emoji: '🦁', category: '도전' },
  { text: '이미 늦었다고 생각하는 바로 지금이 가장 이른 때다.', author: '장자', emoji: '🕊️', category: '도전' },
  // 삶의 지혜
  { text: '하루를 잘 마무리하는 것이 내일을 시작하는 힘이다.', author: '랄프 왈도 에머슨', emoji: '🌅', category: '삶의 지혜' },
  { text: '현재에 집중하라. 과거는 이미 지나갔고 미래는 아직 오지 않았다.', author: '부처', emoji: '☯️', category: '삶의 지혜' },
  { text: '작은 일에 최선을 다하는 사람이 큰 일도 해낸다.', author: '마더 테레사', emoji: '💙', category: '삶의 지혜' },
  { text: '생각은 크게, 행동은 작게 시작하라.', author: '케빈 켈리', emoji: '🧠', category: '삶의 지혜' },
  { text: '잘 쉬어야 잘 달릴 수 있다.', author: '한국 속담', emoji: '🛌', category: '삶의 지혜' },
  { text: '한 번 실수는 실수, 두 번 실수는 습관이다.', author: '미상', emoji: '🪞', category: '삶의 지혜' },
  { text: '배움을 멈추는 순간 성장도 멈춘다.', author: '헨리 포드', emoji: '📖', category: '삶의 지혜' },
  { text: '감사는 가장 강력한 에너지다.', author: '오프라 윈프리', emoji: '🙏', category: '삶의 지혜' },
  // 현장 격언 (에이전시 실무 특화)
  { text: '배치도 없이 나간 현장은 반드시 탈이 난다.', author: '현장 경험칙', emoji: '📋', category: '현장 격언' },
  { text: '클라이언트가 원하는 건 완벽함이 아니라 안심이다.', author: '서비스 실무', emoji: '🤝', category: '현장 격언' },
  { text: '행사 당일 처음 만나는 팀은 팀이 아니다.', author: '이벤트 업계 격언', emoji: '⚠️', category: '현장 격언' },
  { text: '브리핑 30분이 현장 3시간을 아낀다.', author: '현장 경험칙', emoji: '⏱️', category: '현장 격언' },
  { text: 'VIP 10미터 안에서 커피 마시지 마라.', author: '경호 현장 수칙', emoji: '☕', category: '현장 격언' },
  { text: '계약서에 없는 건 해줄 수 있지만, 당연히 해줄 수는 없다.', author: '에이전시 업계 격언', emoji: '📝', category: '현장 격언' },
  { text: '팀장이 무너지면 팀 전체가 무너진다.', author: '현장 경험칙', emoji: '🏗️', category: '현장 격언' },
  { text: '예비 인원 없는 배치는 사고를 부른다.', author: '인력파견 격언', emoji: '🔄', category: '현장 격언' },
  { text: '현장에서의 돌발은 대비한 만큼만 대비된다.', author: '경호 업계 격언', emoji: '🛡️', category: '현장 격언' },
  { text: '클라이언트의 기대치를 파악하지 못한 미팅은 없는 것만 못하다.', author: '에이전시 실무', emoji: '🎯', category: '현장 격언' },
]

const CATEGORIES = ['전체', '리더십', '팀워크', '도전', '삶의 지혜', '현장 격언'] as const
type Category = typeof CATEGORIES[number]

const CAT_COLOR: Record<string, string> = {
  '전체': 'bg-gray-700 text-white',
  '리더십': 'bg-amber-500 text-white',
  '팀워크': 'bg-blue-600 text-white',
  '도전': 'bg-red-600 text-white',
  '삶의 지혜': 'bg-emerald-600 text-white',
  '현장 격언': 'bg-purple-600 text-white',
}
const CAT_BADGE: Record<string, string> = {
  '리더십': 'bg-amber-100 text-amber-700',
  '팀워크': 'bg-blue-100 text-blue-700',
  '도전': 'bg-red-100 text-red-700',
  '삶의 지혜': 'bg-emerald-100 text-emerald-700',
  '현장 격언': 'bg-purple-100 text-purple-700',
}

function getRandomQuote(category: Category, exclude?: QuoteItem): QuoteItem {
  const pool = category === '전체'
    ? QUOTES
    : QUOTES.filter(q => q.category === category)
  const filtered = exclude ? pool.filter(q => q.text !== exclude.text) : pool
  return filtered[Math.floor(Math.random() * filtered.length)]
}

interface Props { onClose: () => void }

export default function QuoteModal({ onClose }: Props) {
  const [category, setCategory] = useState<Category>('전체')
  const [quote, setQuote] = useState<QuoteItem>(() => getRandomQuote('전체'))
  const [liked, setLiked] = useState(false)
  const [animKey, setAnimKey] = useState(0)

  const shuffle = useCallback((cat: Category = category) => {
    setQuote(prev => getRandomQuote(cat, prev))
    setLiked(false)
    setAnimKey(k => k + 1)
  }, [category])

  function handleCategory(cat: Category) {
    setCategory(cat)
    setQuote(getRandomQuote(cat))
    setLiked(false)
    setAnimKey(k => k + 1)
  }

  return (
    <div className="flex flex-col" style={{ maxHeight: '80vh' }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between p-5 bg-gradient-to-r from-slate-800 to-gray-900 rounded-t-2xl shrink-0">
        <div>
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            <Quote className="h-5 w-5 text-amber-400" />
            오늘의 한마디
          </h2>
          <p className="text-gray-400 text-xs mt-0.5">명언·격언 랜덤 뽑기 — 리더십부터 현장 격언까지</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-lg"><X className="h-5 w-5" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 bg-gray-950 space-y-5">
        {/* 카테고리 필터 */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => handleCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                category === cat ? CAT_COLOR[cat] : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}>{cat}</button>
          ))}
        </div>

        {/* 명언 카드 */}
        <AnimatePresence mode="wait">
          <motion.div key={animKey}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="bg-gray-900 border border-gray-700 rounded-2xl p-6 space-y-4"
          >
            {/* 이모지 */}
            <div className="flex items-center justify-between">
              <span className="text-4xl">{quote.emoji}</span>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${CAT_BADGE[quote.category] || 'bg-gray-700 text-gray-300'}`}>
                {quote.category}
              </span>
            </div>

            {/* 명언 텍스트 */}
            <blockquote>
              <p className="text-white text-xl font-bold leading-relaxed">
                &ldquo;{quote.text}&rdquo;
              </p>
              <footer className="mt-3 text-gray-400 text-sm">
                — {quote.author}
              </footer>
            </blockquote>

            {/* 좋아요 */}
            <div className="pt-2 border-t border-gray-800 flex items-center justify-between">
              <button onClick={() => setLiked(l => !l)}
                className={`flex items-center gap-1.5 text-sm font-semibold transition-colors ${
                  liked ? 'text-amber-400' : 'text-gray-500 hover:text-amber-400'
                }`}>
                <Star className={`h-4 w-4 ${liked ? 'fill-amber-400' : ''}`} />
                {liked ? '마음에 들어요!' : '마음에 들면 별점 주기'}
              </button>
              <span className="text-xs text-gray-600">{QUOTES.indexOf(quote) + 1} / {QUOTES.length}</span>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* 셔플 버튼 */}
        <motion.button
          onClick={() => shuffle()}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-extrabold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all"
        >
          <RefreshCw className="h-4 w-4" />
          다른 명언 뽑기
        </motion.button>

        {/* 전체 카운트 */}
        <p className="text-center text-gray-600 text-xs">
          총 {QUOTES.length}개의 명언 · 격언 수록
        </p>
      </div>
    </div>
  )
}
