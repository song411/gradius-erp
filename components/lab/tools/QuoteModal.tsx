'use client'

import { useState, useCallback } from 'react'
import { X, RefreshCw, Quote, Star } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// ─────────────────────────────────────────
// 1. 세계 명언
// ─────────────────────────────────────────
interface QuoteItem {
  text: string
  author: string
  emoji: string
  category: '리더십' | '팀워크' | '도전' | '삶의 지혜'
}

const QUOTES: QuoteItem[] = [
  // 리더십
  { text: '리더는 희망을 파는 사람이다.', author: '나폴레옹 보나파르트', emoji: '👑', category: '리더십' },
  { text: '최고의 지도자는 자기 편이 스스로 이뤘다고 느끼게 만든다.', author: '노자', emoji: '🌿', category: '리더십' },
  { text: '훌륭한 리더는 뒤에서 밀지 않고 앞에서 이끈다.', author: '넬슨 만델라', emoji: '✊', category: '리더십' },
  { text: '장수는 용감하되 경솔하지 않고, 위엄 있되 잔인하지 않아야 한다.', author: '손자 (孫子兵法)', emoji: '⚔️', category: '리더십' },
  { text: '나는 명령하는 법을 배우기 전에 복종하는 법을 배웠다.', author: '알렉산더 대왕', emoji: '🏛️', category: '리더십' },
  { text: '평범한 사람들이 비범한 일을 해낼 수 있도록 이끄는 것이 좋은 리더십이다.', author: '존 D. 록펠러', emoji: '💡', category: '리더십' },
  { text: '지도자는 비전을 제시하고, 팀은 그것을 현실로 만든다.', author: '스티브 잡스', emoji: '🍎', category: '리더십' },
  { text: '한 사람이 꿈을 꾸면 단순한 꿈이지만, 함께 꿈을 꾸면 현실이 된다.', author: '존 레넌', emoji: '☮️', category: '리더십' },
  { text: '강한 사람이 혼자 많은 것을 할 수 있지만, 강한 팀이 모든 것을 할 수 있다.', author: '로널드 레이건', emoji: '🇺🇸', category: '리더십' },
  { text: '책임을 지는 사람이 리더다. 결과를 탓하는 사람은 관리자다.', author: '피터 드러커', emoji: '📊', category: '리더십' },
  { text: '군자는 말보다 행동이 앞서야 하고, 그 후에 말이 따라야 한다.', author: '공자 (論語)', emoji: '☯️', category: '리더십' },
  { text: '위기가 인물을 만든다.', author: '윈스턴 처칠', emoji: '🎩', category: '리더십' },
  { text: '나를 따르라고 말하지 말라. 내가 먼저 가겠다.', author: '조지 패튼 장군', emoji: '🎖️', category: '리더십' },
  // 팀워크
  { text: '혼자 가면 빠르고, 함께 가면 멀리 간다.', author: '아프리카 속담', emoji: '🤝', category: '팀워크' },
  { text: '위대한 것은 혼자서 이루지 않는다.', author: '마거릿 미드', emoji: '🌍', category: '팀워크' },
  { text: '재능은 게임에서 이기게 하지만, 팀워크는 챔피언십을 만든다.', author: '마이클 조던', emoji: '🏆', category: '팀워크' },
  { text: '각자가 최선을 다할 때 전체는 더 커진다.', author: '필 잭슨', emoji: '🏀', category: '팀워크' },
  { text: '1+1이 2가 아닌 11이 되는 것이 팀워크다.', author: '미상', emoji: '🔢', category: '팀워크' },
  { text: '백지장도 맞들면 낫다.', author: '한국 속담', emoji: '📄', category: '팀워크' },
  { text: '팀의 강점은 각 구성원에서 나오고, 각 구성원의 강점은 팀에서 나온다.', author: '필 잭슨', emoji: '⛹️', category: '팀워크' },
  { text: '협력이란 한 방향으로 모두가 노를 젓는 것이다.', author: '미상', emoji: '🚣', category: '팀워크' },
  { text: '혼자서는 천재가 될 수 있지만, 함께해야 기적이 된다.', author: '하워드 슐츠', emoji: '☕', category: '팀워크' },
  { text: '팀원 한 명이 움직이지 않으면, 팀 전체가 느려진다.', author: '패튼 장군', emoji: '⚡', category: '팀워크' },
  // 도전
  { text: '불가능이란 아무것도 하지 않으려는 자의 변명이다.', author: '나폴레옹 보나파르트', emoji: '💥', category: '도전' },
  { text: '두려움을 느낀다면 그건 당신이 성장하고 있다는 신호다.', author: '로빈 샤르마', emoji: '🌱', category: '도전' },
  { text: '용기란 두려움이 없는 것이 아니라, 두려움에도 행동하는 것이다.', author: '마크 트웨인', emoji: '🦁', category: '도전' },
  { text: '완벽한 계획보다 지금 당장의 행동이 낫다.', author: '조지 S. 패튼 장군', emoji: '🚀', category: '도전' },
  { text: '실패는 포기하지 않는 한 실패가 아니다.', author: '에이브러햄 링컨', emoji: '🕯️', category: '도전' },
  { text: '태산이 높다 하되 하늘 아래 뫼이로다. 오르고 또 오르면 못 오를 리 없건마는, 사람이 제 아니 오르고 뫼만 높다 하더라.', author: '양사언 (시조)', emoji: '⛰️', category: '도전' },
  { text: '지금 할 수 없다고 나중도 못 하는 것은 아니다. 하지만 지금 해야 나중이 바뀐다.', author: '미상', emoji: '⏰', category: '도전' },
  { text: '천 리 길도 한 걸음부터.', author: '노자 (道德經)', emoji: '👣', category: '도전' },
  { text: '고통 없이는 얻는 것도 없다.', author: '벤자민 프랭클린', emoji: '💪', category: '도전' },
  { text: '10번 도전해서 10번 다 성공할 필요는 없다. 1번만 제대로 성공하면 된다.', author: '일론 머스크', emoji: '🚀', category: '도전' },
  { text: '이미 늦었다고 생각할 때가 사실은 가장 이른 때다.', author: '미상', emoji: '🌅', category: '도전' },
  { text: '어떤 일이든 시작하기 전에는 불가능해 보인다.', author: '넬슨 만델라', emoji: '✊', category: '도전' },
  // 삶의 지혜
  { text: '하루를 잘 마무리하는 것이 내일을 시작하는 힘이다.', author: '랄프 왈도 에머슨', emoji: '🌅', category: '삶의 지혜' },
  { text: '현재에 집중하라. 과거는 이미 지나갔고 미래는 아직 오지 않았다.', author: '부처', emoji: '☯️', category: '삶의 지혜' },
  { text: '작은 일에 최선을 다하는 사람이 큰 일도 해낸다.', author: '마더 테레사', emoji: '💙', category: '삶의 지혜' },
  { text: '잘 쉬어야 잘 달릴 수 있다.', author: '한국 속담', emoji: '🛌', category: '삶의 지혜' },
  { text: '배움을 멈추는 순간 성장도 멈춘다.', author: '헨리 포드', emoji: '📖', category: '삶의 지혜' },
  { text: '감사는 가장 강력한 에너지다.', author: '오프라 윈프리', emoji: '🙏', category: '삶의 지혜' },
  { text: '말은 쉽고 행동은 어렵다. 하지만 행동이 말보다 웅변한다.', author: '공자', emoji: '📢', category: '삶의 지혜' },
  { text: '지금 심는 나무의 그늘 아래 언젠가 당신이 앉게 될 것이다.', author: '그리스 속담', emoji: '🌳', category: '삶의 지혜' },
  { text: '지식은 힘이다.', author: '프랜시스 베이컨', emoji: '🔬', category: '삶의 지혜' },
  { text: '인내는 모든 미덕의 어머니다.', author: '아리스토텔레스', emoji: '⏳', category: '삶의 지혜' },
  { text: '세 사람이 길을 가면 그 중에 반드시 나의 스승이 있다.', author: '공자 (論語)', emoji: '🚶', category: '삶의 지혜' },
  { text: '남을 아는 자는 지혜롭고, 자기를 아는 자는 밝다.', author: '노자 (道德經)', emoji: '🪔', category: '삶의 지혜' },
  { text: '가장 위대한 영광은 한 번도 쓰러지지 않는 데 있지 않고, 쓰러질 때마다 일어서는 데 있다.', author: '공자', emoji: '🏅', category: '삶의 지혜' },
  { text: '자신을 이기는 자가 진정한 강자다.', author: '노자', emoji: '🧘', category: '삶의 지혜' },
  { text: '좋은 판단은 경험에서 나오고, 경험은 나쁜 판단에서 나온다.', author: '미상', emoji: '🧠', category: '삶의 지혜' },
]

// ─────────────────────────────────────────
// 2. 가디어스 현장 명언
// ─────────────────────────────────────────
interface GuardiusQuote {
  text: string
  tag: string   // 상황 태그
  emoji: string
}

const GUARDIUS_QUOTES: GuardiusQuote[] = [
  { text: '배치도 없이 나간 현장은 반드시 탈이 난다.', tag: '배치', emoji: '📋' },
  { text: '브리핑 30분이 현장 3시간을 아낀다.', tag: '준비', emoji: '⏱️' },
  { text: 'VIP 10미터 안에서 커피 마시지 마라.', tag: '경호', emoji: '☕' },
  { text: '클라이언트가 원하는 건 완벽함이 아니라 안심이다.', tag: '고객관리', emoji: '🤝' },
  { text: '행사 당일 처음 만나는 팀은 팀이 아니다.', tag: '팀빌딩', emoji: '⚠️' },
  { text: '계약서에 없는 건 해줄 수 있지만, 당연히 해줄 수는 없다.', tag: '계약', emoji: '📝' },
  { text: '팀장이 무너지면 팀 전체가 무너진다.', tag: '리더십', emoji: '🏗️' },
  { text: '예비 인원 없는 배치는 사고를 부른다.', tag: '배치', emoji: '🔄' },
  { text: '현장에서의 돌발은 대비한 만큼만 대비된다.', tag: '리스크', emoji: '🛡️' },
  { text: '클라이언트의 기대치를 파악하지 못한 미팅은 없는 것만 못하다.', tag: '영업', emoji: '🎯' },
  { text: '견적서의 단가는 자존심이다. 함부로 깎지 마라.', tag: '견적', emoji: '💰' },
  { text: '행사 전날 연락 안 되는 크루는 행사 당일도 연락 안 된다.', tag: '인원관리', emoji: '📵' },
  { text: '현장 사진은 행사 후 30분 안에 찍어야 증거가 된다.', tag: '현장', emoji: '📸' },
  { text: '입금 전에 움직이지 마라. 이건 원칙이다.', tag: '계약', emoji: '💳' },
  { text: '고객의 불만은 빠를수록 작아진다.', tag: '고객관리', emoji: '🔥' },
  { text: '복장이 흐트러지면 마음도 흐트러진다.', tag: '현장', emoji: '👔' },
  { text: '현장에서 모르면 물어봐라. 아는 척하다 다친다.', tag: '안전', emoji: '🙋' },
  { text: '크루 한 명의 태도가 우리 회사 전체의 이미지다.', tag: '서비스', emoji: '🪞' },
  { text: '배치신고는 24시간 전이 아니라 48시간 전에 하는 것이다.', tag: '행정', emoji: '📅' },
  { text: '제일 좋은 계약은 다음 계약으로 이어지는 계약이다.', tag: '영업', emoji: '🔁' },
  { text: '현장 책임자가 첫 번째로 도착하고 마지막에 떠난다.', tag: '책임', emoji: '🔑' },
  { text: '비가 와도, 더워도, 추워도 — 그게 우리 일이다.', tag: '마인드', emoji: '🌦️' },
  { text: '클라이언트 앞에서 팀 내부 갈등을 보여주는 순간 신뢰는 끝이다.', tag: '프로정신', emoji: '🎭' },
  { text: '좋은 크루는 지시 없이도 움직인다.', tag: '팀', emoji: '⚙️' },
  { text: '이익률은 배치 전에 결정된다.', tag: '수익관리', emoji: '📊' },
  { text: '클라이언트가 바쁠 때 연락하면 안 받는다. 한가할 때 관계를 쌓아라.', tag: '영업', emoji: '☎️' },
  { text: '행사가 끝나는 순간이 다음 행사의 시작이다.', tag: '영업', emoji: '🔄' },
  { text: '평점이 낮은 크루를 VIP 현장에 보내는 건 도박이다.', tag: '배치', emoji: '🎲' },
  { text: '3.3%를 아끼려다 신뢰를 잃는다.', tag: '정산', emoji: '💸' },
  { text: '계약이 깨지는 이유 중 80%는 소통 부재다.', tag: '소통', emoji: '📡' },
]

// ─────────────────────────────────────────
const QUOTE_CATS = ['전체', '리더십', '팀워크', '도전', '삶의 지혜'] as const
type QuoteCat = typeof QUOTE_CATS[number]

const CAT_COLOR: Record<string, string> = {
  '전체': 'bg-gray-700 text-white',
  '리더십': 'bg-amber-500 text-white',
  '팀워크': 'bg-blue-600 text-white',
  '도전': 'bg-red-600 text-white',
  '삶의 지혜': 'bg-emerald-600 text-white',
}
const CAT_BADGE: Record<string, string> = {
  '리더십': 'bg-amber-100 text-amber-700',
  '팀워크': 'bg-blue-100 text-blue-700',
  '도전': 'bg-red-100 text-red-700',
  '삶의 지혜': 'bg-emerald-100 text-emerald-700',
}

const TAG_COLOR: Record<string, string> = {
  '배치': 'bg-blue-100 text-blue-700',
  '준비': 'bg-sky-100 text-sky-700',
  '경호': 'bg-slate-100 text-slate-700',
  '고객관리': 'bg-green-100 text-green-700',
  '팀빌딩': 'bg-indigo-100 text-indigo-700',
  '계약': 'bg-orange-100 text-orange-700',
  '리더십': 'bg-amber-100 text-amber-700',
  '리스크': 'bg-red-100 text-red-700',
  '영업': 'bg-violet-100 text-violet-700',
  '행정': 'bg-gray-100 text-gray-700',
  '현장': 'bg-teal-100 text-teal-700',
  '안전': 'bg-yellow-100 text-yellow-700',
  '서비스': 'bg-pink-100 text-pink-700',
  '마인드': 'bg-cyan-100 text-cyan-700',
  '프로정신': 'bg-purple-100 text-purple-700',
  '팀': 'bg-emerald-100 text-emerald-700',
  '수익관리': 'bg-lime-100 text-lime-700',
  '소통': 'bg-rose-100 text-rose-700',
  '책임': 'bg-fuchsia-100 text-fuchsia-700',
  '정산': 'bg-orange-100 text-orange-700',
}

function getRandom<T>(arr: T[], exclude?: T): T {
  const pool = exclude ? arr.filter(q => q !== exclude) : arr
  return pool[Math.floor(Math.random() * pool.length)]
}

interface Props { onClose: () => void }

export default function QuoteModal({ onClose }: Props) {
  const [category, setCategory] = useState<QuoteCat>('전체')
  const [quote, setQuote] = useState<QuoteItem>(() => getRandom(QUOTES))
  const [liked, setLiked] = useState(false)
  const [animKey, setAnimKey] = useState(0)

  function shuffleQuote(cat: QuoteCat = category) {
    const pool = cat === '전체' ? QUOTES : QUOTES.filter(q => q.category === cat)
    setQuote(prev => getRandom(pool, prev))
    setLiked(false)
    setAnimKey(k => k + 1)
  }

  function handleCategory(cat: QuoteCat) {
    setCategory(cat)
    const pool = cat === '전체' ? QUOTES : QUOTES.filter(q => q.category === cat)
    setQuote(getRandom(pool))
    setLiked(false)
    setAnimKey(k => k + 1)
  }

  return (
    <div className="flex flex-col" style={{ maxHeight: '84vh' }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between p-5 bg-gradient-to-r from-slate-800 to-gray-900 rounded-t-2xl shrink-0">
        <div>
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            <Quote className="h-5 w-5 text-amber-400" />
            오늘의 명언
          </h2>
          <p className="text-gray-400 text-xs mt-0.5">세계 리더·철학자·운동선수 명언 {QUOTES.length}개 큐레이션</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-lg"><X className="h-5 w-5" /></button>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-950 p-5 space-y-4">
        {/* 카테고리 필터 */}
        <div className="flex flex-wrap gap-2">
          {QUOTE_CATS.map(cat => (
            <button key={cat} onClick={() => handleCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                category === cat ? CAT_COLOR[cat] : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}>{cat}</button>
          ))}
        </div>

        {/* 명언 카드 */}
        <AnimatePresence mode="wait">
          <motion.div key={animKey}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
            className="bg-gray-900 border border-gray-700 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-4xl">{quote.emoji}</span>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${CAT_BADGE[quote.category] || ''}`}>
                {quote.category}
              </span>
            </div>
            <blockquote>
              <p className="text-white text-xl font-bold leading-relaxed">&ldquo;{quote.text}&rdquo;</p>
              <footer className="mt-3 text-gray-400 text-sm">— {quote.author}</footer>
            </blockquote>
            <div className="pt-2 border-t border-gray-800 flex items-center justify-between">
              <button onClick={() => setLiked(l => !l)}
                className={`flex items-center gap-1.5 text-sm font-semibold transition-colors ${liked ? 'text-amber-400' : 'text-gray-500 hover:text-amber-400'}`}>
                <Star className={`h-4 w-4 ${liked ? 'fill-amber-400' : ''}`} />
                {liked ? '좋은 말이에요!' : '마음에 들면 별표'}
              </button>
              <span className="text-xs text-gray-600">총 {QUOTES.length}개 수록</span>
            </div>
          </motion.div>
        </AnimatePresence>

        <motion.button onClick={() => shuffleQuote()}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
          className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-extrabold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20">
          <RefreshCw className="h-4 w-4" />다른 명언 뽑기
        </motion.button>
      </div>
    </div>
  )
}
