'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, RefreshCw, Sparkles } from 'lucide-react'

interface TarotCard {
  id: number
  name: string
  emoji: string
  keyword: string
  meaning: string        // 정방향 의미
  agencyMsg: string     // 에이전시/경호 업무 적용
  advice: string        // 오늘의 조언
  color: string         // 카드 테마 색상
}

const CARDS: TarotCard[] = [
  {
    id: 0, name: '바보', emoji: '🌟', keyword: '새로운 시작 · 용기',
    meaning: '두려움 없이 새 출발을 하는 순간입니다. 경험보다 열정이 앞서는 날.',
    agencyMsg: '새로운 클라이언트나 낯선 현장에 도전할 때입니다. 실수를 두려워 말고 일단 뛰어드세요.',
    advice: '오늘은 "어떻게 될지 모르지만 일단 해보자"는 마음으로 임하세요.',
    color: 'from-yellow-400 to-orange-500',
  },
  {
    id: 1, name: '마법사', emoji: '🎩', keyword: '능력 발휘 · 자신감',
    meaning: '당신이 가진 모든 자원과 능력을 활용할 때입니다. 의지와 기술이 정점.',
    agencyMsg: '지금 팀의 역량을 최대한 발휘할 수 있는 배치가 가능합니다. 리소스를 총동원하세요.',
    advice: '"나는 이미 필요한 것을 다 가지고 있다"고 생각하고 행동하세요.',
    color: 'from-purple-500 to-indigo-600',
  },
  {
    id: 2, name: '여사제', emoji: '🌙', keyword: '직관 · 통찰',
    meaning: '논리보다 직관을 믿어야 할 때. 말하지 않아도 아는 것이 있습니다.',
    agencyMsg: '현장 분위기를 직관적으로 읽어야 합니다. 클라이언트가 말하지 않는 니즈를 파악하세요.',
    advice: '오늘은 머리보다 느낌을 믿어보세요. 첫 번째 판단이 맞을 가능성이 높습니다.',
    color: 'from-blue-500 to-cyan-600',
  },
  {
    id: 3, name: '여황제', emoji: '🌸', keyword: '풍요 · 성장 · 돌봄',
    meaning: '노력이 결실을 맺는 시기입니다. 팀원을 챙기고 관계를 가꾸세요.',
    agencyMsg: '크루들의 컨디션과 사기를 점검할 때입니다. 작은 관심이 큰 성과로 돌아옵니다.',
    advice: '오늘은 팀원에게 한 마디 격려를 건네보세요. 분위기가 달라집니다.',
    color: 'from-pink-400 to-rose-500',
  },
  {
    id: 4, name: '황제', emoji: '👑', keyword: '리더십 · 통솔 · 책임',
    meaning: '강한 리더십이 필요한 시기입니다. 흔들림 없이 중심을 잡아야 합니다.',
    agencyMsg: '현장 지휘 체계를 명확히 할 때입니다. 책임자가 확실해야 팀이 움직입니다.',
    advice: '오늘은 모호한 지시 말고 명확하게 말하세요. "이렇게 해"가 팀을 살립니다.',
    color: 'from-amber-500 to-yellow-600',
  },
  {
    id: 5, name: '교황', emoji: '📜', keyword: '원칙 · 규범 · 전통',
    meaning: '검증된 방식과 프로토콜을 따를 때입니다. 기본에 충실하세요.',
    agencyMsg: '배치신고, 서류 업무 등 절차를 꼼꼼히 점검하세요. 매뉴얼대로가 최선입니다.',
    advice: '지름길보다 정도가 더 빠를 때가 있습니다. 오늘은 원칙을 지키세요.',
    color: 'from-slate-500 to-gray-600',
  },
  {
    id: 6, name: '연인', emoji: '💕', keyword: '선택 · 조화 · 파트너십',
    meaning: '중요한 선택의 기로에 있습니다. 가치관에 맞는 방향을 고르세요.',
    agencyMsg: '파트너사 선정, 팀 구성, 협력 방식 등 중요한 결정이 필요한 시기입니다.',
    advice: '오늘의 선택이 앞으로의 방향을 결정합니다. 신중하되 빠르게 결정하세요.',
    color: 'from-red-400 to-pink-500',
  },
  {
    id: 7, name: '전차', emoji: '⚡', keyword: '추진력 · 승리 · 집중',
    meaning: '앞으로 돌진할 때입니다. 의지와 집중력으로 장애물을 뚫어내세요.',
    agencyMsg: '까다로운 현장이나 어려운 클라이언트도 지금이라면 돌파할 수 있습니다. 전진하세요.',
    advice: '멈추지 마세요. 오늘은 추진력이 모든 것을 해결합니다.',
    color: 'from-blue-600 to-indigo-700',
  },
  {
    id: 8, name: '힘', emoji: '🦁', keyword: '내면의 힘 · 인내 · 용기',
    meaning: '외적인 힘이 아닌 내면의 강함이 필요합니다. 부드럽게, 그러나 단호하게.',
    agencyMsg: '압박이 심한 현장에서도 팀을 차분하게 이끌어야 합니다. 감정 관리가 핵심입니다.',
    advice: '목소리 높이지 않아도 됩니다. 침착함 자체가 가장 강한 무기입니다.',
    color: 'from-orange-500 to-amber-600',
  },
  {
    id: 9, name: '은둔자', emoji: '🕯️', keyword: '성찰 · 지혜 · 홀로서기',
    meaning: '혼자만의 시간이 필요합니다. 바쁜 일상에서 잠시 물러나 생각하세요.',
    agencyMsg: '현재 운영 방식을 객관적으로 점검할 시간입니다. 잘 돌아가고 있는지 되돌아보세요.',
    advice: '오늘은 다음 행동 전에 5분만 조용히 생각하는 시간을 가져보세요.',
    color: 'from-gray-500 to-slate-700',
  },
  {
    id: 10, name: '운명의 수레바퀴', emoji: '🎡', keyword: '전환점 · 행운 · 변화',
    meaning: '운명의 전환점에 있습니다. 흐름이 바뀌고 있으니 기회를 놓치지 마세요.',
    agencyMsg: '예상치 못한 기회나 변수가 생길 수 있습니다. 유연하게 대응하면 유리한 결과가 옵니다.',
    advice: '계획이 틀어져도 당황하지 마세요. 오늘의 변화는 좋은 방향으로 이어집니다.',
    color: 'from-violet-500 to-purple-700',
  },
  {
    id: 11, name: '정의', emoji: '⚖️', keyword: '공정 · 균형 · 결과',
    meaning: '노력한 만큼 결과가 따르는 날입니다. 공정한 판단이 중요합니다.',
    agencyMsg: '지급 처리, 인원 배정, 계약 조건 등 공정성이 필요한 업무에 집중하세요.',
    advice: '오늘은 감정보다 사실과 원칙에 따라 판단하세요. 후회가 없을 것입니다.',
    color: 'from-blue-500 to-sky-700',
  },
  {
    id: 12, name: '매달린 사람', emoji: '🙃', keyword: '기다림 · 관점 전환',
    meaning: '지금 당장 행동하기보다 기다리며 다른 관점으로 봐야 할 때입니다.',
    agencyMsg: '클라이언트의 답변이나 계약 확정을 기다리는 시기. 조급해하지 말고 기다리세요.',
    advice: '오늘은 내가 틀렸을 가능성을 열어두세요. 반대로 생각하면 답이 보입니다.',
    color: 'from-teal-500 to-emerald-700',
  },
  {
    id: 13, name: '죽음', emoji: '🌑', keyword: '변화 · 끝과 시작 · 전환',
    meaning: '무언가의 끝은 새로운 시작입니다. 낡은 것을 놓아야 새것이 옵니다.',
    agencyMsg: '기존 방식이나 오래된 계약에 집착하지 마세요. 새로운 클라이언트, 새 운영 방식으로 전환할 때.',
    advice: '오늘 버려야 할 것을 과감하게 버리세요. 비워야 채울 수 있습니다.',
    color: 'from-gray-700 to-gray-900',
  },
  {
    id: 14, name: '절제', emoji: '🌊', keyword: '균형 · 조화 · 중용',
    meaning: '극단을 피하고 균형을 찾아야 합니다. 서두르지도, 멈추지도 마세요.',
    agencyMsg: '예산·인원·시간 모든 면에서 적정선을 유지하세요. 과욕은 금물입니다.',
    advice: '오늘은 70% 힘으로도 충분합니다. 무리하지 말고 지속가능하게 운영하세요.',
    color: 'from-cyan-500 to-blue-600',
  },
  {
    id: 15, name: '악마', emoji: '🔗', keyword: '집착 · 속박 · 패턴',
    meaning: '당신을 묶고 있는 나쁜 습관이나 두려움이 있습니다. 인식하면 이미 반은 해결됩니다.',
    agencyMsg: '"우리는 원래 이렇게 해왔어"라는 관성이 발목을 잡고 있을 수 있습니다. 틀을 깨세요.',
    advice: '오늘은 반복되는 나쁜 패턴 하나를 의식적으로 끊어보세요.',
    color: 'from-red-700 to-rose-900',
  },
  {
    id: 16, name: '탑', emoji: '⚡🏰', keyword: '충격 · 붕괴 · 각성',
    meaning: '갑작스러운 변화나 충격이 올 수 있습니다. 하지만 이것이 새로운 토대가 됩니다.',
    agencyMsg: '예상치 못한 취소, 돌발 상황이 생길 수 있습니다. 컨틴전시 플랜을 미리 점검하세요.',
    advice: '흔들리는 것은 튼튼하지 않기 때문입니다. 오늘 무너지면 더 강하게 재건할 수 있습니다.',
    color: 'from-orange-600 to-red-700',
  },
  {
    id: 17, name: '별', emoji: '⭐', keyword: '희망 · 영감 · 치유',
    meaning: '어둠이 지나가고 희망의 빛이 보이는 시간입니다. 자신을 믿으세요.',
    agencyMsg: '힘든 프로젝트가 마무리되어 가고 있습니다. 팀의 노력이 빛을 발할 것입니다.',
    advice: '오늘은 잘 되고 있다는 것을 믿으세요. 걱정보다 기대하는 마음이 결과를 바꿉니다.',
    color: 'from-sky-400 to-blue-600',
  },
  {
    id: 18, name: '달', emoji: '🌕', keyword: '불확실 · 착각 · 무의식',
    meaning: '상황이 명확하지 않습니다. 섣불리 판단하거나 결정하지 마세요.',
    agencyMsg: '계약 조건, 클라이언트 의도가 불분명한 상황일 수 있습니다. 확인 또 확인하세요.',
    advice: '오늘은 "내가 오해하고 있을 수도 있다"는 전제로 소통하세요.',
    color: 'from-indigo-400 to-violet-600',
  },
  {
    id: 19, name: '태양', emoji: '☀️', keyword: '성공 · 에너지 · 기쁨',
    meaning: '오늘은 최고의 날입니다! 긍정적인 에너지가 넘치고 모든 것이 잘 됩니다.',
    agencyMsg: '현장 분위기가 최고조입니다. 팀 전체가 빛날 날이니 자신 있게 나아가세요.',
    advice: '오늘만큼은 걱정은 내려두세요. 모든 것이 잘 될 것입니다! ☀️',
    color: 'from-yellow-400 to-amber-500',
  },
  {
    id: 20, name: '심판', emoji: '🎺', keyword: '부활 · 성찰 · 소명',
    meaning: '과거를 돌아보고 앞으로의 방향을 재정립할 시간입니다.',
    agencyMsg: '지금까지의 프로젝트 결과를 정리하고 다음 목표를 세울 때입니다.',
    advice: '지난 것들을 정직하게 평가하고, 새롭게 다짐하세요. 리셋의 날입니다.',
    color: 'from-rose-500 to-red-600',
  },
  {
    id: 21, name: '세계', emoji: '🌍', keyword: '완성 · 통합 · 성취',
    meaning: '모든 것이 완성되어 가는 순간입니다. 노력의 결실을 거둘 때.',
    agencyMsg: '중요한 프로젝트가 성공적으로 마무리되거나 큰 계약이 성사될 조짐입니다.',
    advice: '오늘은 축하받아 마땅한 날입니다. 스스로를 인정해주세요! 🎉',
    color: 'from-emerald-500 to-teal-600',
  },
]

function CardBack({ idx, selected, onClick }: { idx: number; selected: boolean; onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={!selected ? { y: -6, scale: 1.04 } : {}}
      whileTap={!selected ? { scale: 0.97 } : {}}
      className={`relative rounded-xl overflow-hidden cursor-pointer transition-all ${
        selected ? 'ring-4 ring-amber-400 scale-105 shadow-xl shadow-amber-200' : 'hover:shadow-lg'
      }`}
      style={{ aspectRatio: '2/3' }}
    >
      {/* 카드 뒷면 패턴 */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-900" />
      <div className="absolute inset-0" style={{
        backgroundImage: `repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px, transparent 1px, transparent 8px)`,
      }} />
      <div className="absolute inset-2 rounded-lg border border-purple-500/30 flex items-center justify-center">
        <span className="text-2xl opacity-60">✦</span>
      </div>
      {selected && (
        <div className="absolute inset-0 bg-amber-400/20 flex items-center justify-center">
          <span className="text-amber-300 text-xs font-bold">선택됨</span>
        </div>
      )}
    </motion.button>
  )
}

interface Props { onClose: () => void }

export default function TarotModal({ onClose }: Props) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [drawnCard, setDrawnCard] = useState<TarotCard | null>(null)

  // 22장 카드 섞어서 표시 (위치용, 실제 값은 뽑을 때 결정)
  const displayCount = 11

  function handleSelect(idx: number) {
    if (revealed) return
    setSelectedIdx(idx)
  }

  function handleReveal() {
    if (selectedIdx === null) return
    const randomCard = CARDS[Math.floor(Math.random() * CARDS.length)]
    setDrawnCard(randomCard)
    setRevealed(true)
  }

  function handleReset() {
    setSelectedIdx(null)
    setRevealed(false)
    setDrawnCard(null)
  }

  return (
    <div className="flex flex-col" style={{ maxHeight: '88vh' }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between p-5 bg-gradient-to-r from-indigo-900 via-purple-900 to-indigo-900 rounded-t-2xl shrink-0">
        <div>
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-400" />
            오늘의 타로 카드
          </h2>
          <p className="text-purple-300 text-xs mt-0.5">카드 한 장을 골라 오늘의 메시지를 확인하세요</p>
        </div>
        <button onClick={onClose} className="text-purple-300 hover:text-white p-1 rounded-lg"><X className="h-5 w-5" /></button>
      </div>

      <div className="flex-1 overflow-y-auto bg-gradient-to-b from-indigo-950 to-gray-950">

        {!revealed ? (
          <div className="p-5 space-y-5">
            {/* 안내 문구 */}
            <div className="text-center">
              <p className="text-purple-200 text-sm">
                {selectedIdx === null
                  ? '✨ 눈을 감고 마음을 집중한 뒤, 이끌리는 카드를 하나 선택하세요'
                  : '🌟 선택했습니다! 카드를 뒤집어 오늘의 메시지를 확인하세요'}
              </p>
            </div>

            {/* 카드 그리드 */}
            <div className="grid grid-cols-4 gap-2.5 px-2">
              {Array.from({ length: displayCount }).map((_, i) => (
                <CardBack key={i} idx={i} selected={selectedIdx === i} onClick={() => handleSelect(i)} />
              ))}
              {/* 가운데 큰 카드 */}
              <div className="col-span-4 flex justify-center mt-2">
                <div style={{ width: '22%' }}>
                  <CardBack idx={11} selected={selectedIdx === 11} onClick={() => handleSelect(11)} />
                </div>
              </div>
            </div>

            {/* 뒤집기 버튼 */}
            <motion.button
              onClick={handleReveal}
              disabled={selectedIdx === null}
              whileHover={selectedIdx !== null ? { scale: 1.03 } : {}}
              whileTap={selectedIdx !== null ? { scale: 0.97 } : {}}
              className={`w-full py-3.5 rounded-xl font-extrabold text-sm transition-all ${
                selectedIdx !== null
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              {selectedIdx === null ? '카드를 먼저 선택하세요' : '🎴 카드 뒤집기'}
            </motion.button>
          </div>
        ) : (
          <AnimatePresence>
            {drawnCard && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-5 space-y-4"
              >
                {/* 뒤집힌 카드 */}
                <div className="flex justify-center">
                  <motion.div
                    initial={{ rotateY: 180, scale: 0.8 }}
                    animate={{ rotateY: 0, scale: 1 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    className={`rounded-2xl bg-gradient-to-br ${drawnCard.color} p-1 shadow-2xl`}
                    style={{ width: '40%', aspectRatio: '2/3' }}
                  >
                    <div className="h-full rounded-xl bg-black/20 flex flex-col items-center justify-center gap-3 p-4">
                      <span className="text-5xl">{drawnCard.emoji}</span>
                      <div className="text-center">
                        <p className="text-white/70 text-[10px] font-semibold tracking-widest uppercase">Major Arcana</p>
                        <p className="text-white font-extrabold text-lg leading-tight">{drawnCard.name}</p>
                        <p className="text-white/80 text-xs mt-1">{drawnCard.keyword}</p>
                      </div>
                    </div>
                  </motion.div>
                </div>

                {/* 해석 카드들 */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.4 }}
                  className="space-y-3"
                >
                  {/* 카드 의미 */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <p className="text-purple-300 text-xs font-bold mb-2 flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5" />카드의 의미
                    </p>
                    <p className="text-white text-sm leading-relaxed">{drawnCard.meaning}</p>
                  </div>

                  {/* 에이전시 업무 적용 */}
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                    <p className="text-amber-300 text-xs font-bold mb-2">🏢 오늘의 업무 메시지</p>
                    <p className="text-amber-100 text-sm leading-relaxed">{drawnCard.agencyMsg}</p>
                  </div>

                  {/* 오늘의 조언 */}
                  <div className={`bg-gradient-to-br ${drawnCard.color} rounded-xl p-4`}>
                    <p className="text-white/80 text-xs font-bold mb-2">💬 오늘의 조언</p>
                    <p className="text-white font-semibold text-sm leading-relaxed">{drawnCard.advice}</p>
                  </div>
                </motion.div>

                {/* 다시 뽑기 */}
                <button onClick={handleReset}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/70 hover:text-white text-sm font-semibold transition-all">
                  <RefreshCw className="h-4 w-4" />다시 뽑기
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
