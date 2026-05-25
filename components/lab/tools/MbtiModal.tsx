'use client'

import { useState } from 'react'
import { X, RefreshCw, Heart, Zap, Users, Star } from 'lucide-react'

const MBTI_TYPES = ['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP']

// 궁합 매트릭스: 0=환상 1=좋음 2=보통 3=도전
const COMPAT: Record<string, Record<string, number>> = {
  INTJ: { INTJ:2,INTP:1,ENTJ:1,ENTP:0,INFJ:1,INFP:2,ENFJ:2,ENFP:0,ISTJ:1,ISFJ:3,ESTJ:2,ESFJ:3,ISTP:2,ISFP:3,ESTP:3,ESFP:3 },
  INTP: { INTJ:1,INTP:2,ENTJ:2,ENTP:1,INFJ:2,INFP:1,ENFJ:0,ENFP:1,ISTJ:2,ISFJ:3,ESTJ:3,ESFJ:3,ISTP:1,ISFP:3,ESTP:3,ESFP:3 },
  ENTJ: { INTJ:1,INTP:2,ENTJ:2,ENTP:1,INFJ:0,INFP:3,ENFJ:1,ENFP:2,ISTJ:1,ISFJ:2,ESTJ:1,ESFJ:2,ISTP:2,ISFP:3,ESTP:2,ESFP:3 },
  ENTP: { INTJ:0,INTP:1,ENTJ:1,ENTP:2,INFJ:1,INFP:2,ENFJ:2,ENFP:1,ISTJ:3,ISFJ:3,ESTJ:3,ESFJ:3,ISTP:1,ISFP:3,ESTP:2,ESFP:2 },
  INFJ: { INTJ:1,INTP:2,ENTJ:0,ENTP:1,INFJ:2,INFP:1,ENFJ:1,ENFP:0,ISTJ:2,ISFJ:1,ESTJ:3,ESFJ:2,ISTP:3,ISFP:2,ESTP:3,ESFP:3 },
  INFP: { INTJ:2,INTP:1,ENTJ:3,ENTP:2,INFJ:1,INFP:2,ENFJ:0,ENFP:1,ISTJ:3,ISFJ:2,ESTJ:3,ESFJ:2,ISTP:2,ISFP:1,ESTP:3,ESFP:2 },
  ENFJ: { INTJ:2,INTP:0,ENTJ:1,ENTP:2,INFJ:1,INFP:0,ENFJ:2,ENFP:1,ISTJ:2,ISFJ:1,ESTJ:2,ESFJ:1,ISTP:3,ISFP:2,ESTP:3,ESFP:2 },
  ENFP: { INTJ:0,INTP:1,ENTJ:2,ENTP:1,INFJ:0,INFP:1,ENFJ:1,ENFP:2,ISTJ:3,ISFJ:2,ESTJ:3,ESFJ:2,ISTP:2,ISFP:1,ESTP:2,ESFP:1 },
  ISTJ: { INTJ:1,INTP:2,ENTJ:1,ENTP:3,INFJ:2,INFP:3,ENFJ:2,ENFP:3,ISTJ:2,ISFJ:1,ESTJ:1,ESFJ:1,ISTP:1,ISFP:2,ESTP:0,ESFP:2 },
  ISFJ: { INTJ:3,INTP:3,ENTJ:2,ENTP:3,INFJ:1,INFP:2,ENFJ:1,ENFP:2,ISTJ:1,ISFJ:2,ESTJ:1,ESFJ:1,ISTP:2,ISFP:1,ESTP:2,ESFP:0 },
  ESTJ: { INTJ:2,INTP:3,ENTJ:1,ENTP:3,INFJ:3,INFP:3,ENFJ:2,ENFP:3,ISTJ:1,ISFJ:1,ESTJ:2,ESFJ:1,ISTP:0,ISFP:2,ESTP:1,ESFP:2 },
  ESFJ: { INTJ:3,INTP:3,ENTJ:2,ENTP:3,INFJ:2,INFP:2,ENFJ:1,ENFP:2,ISTJ:1,ISFJ:1,ESTJ:1,ESFJ:2,ISTP:2,ISFP:0,ESTP:2,ESFP:1 },
  ISTP: { INTJ:2,INTP:1,ENTJ:2,ENTP:1,INFJ:3,INFP:2,ENFJ:3,ENFP:2,ISTJ:1,ISFJ:2,ESTJ:0,ESFJ:2,ISTP:2,ISFP:1,ESTP:1,ESFP:1 },
  ISFP: { INTJ:3,INTP:3,ENTJ:3,ENTP:3,INFJ:2,INFP:1,ENFJ:2,ENFP:1,ISTJ:2,ISFJ:1,ESTJ:2,ESFJ:0,ISTP:1,ISFP:2,ESTP:1,ESFP:1 },
  ESTP: { INTJ:3,INTP:3,ENTJ:2,ENTP:2,INFJ:3,INFP:3,ENFJ:3,ENFP:2,ISTJ:0,ISFJ:2,ESTJ:1,ESFJ:2,ISTP:1,ISFP:1,ESTP:2,ESFP:1 },
  ESFP: { INTJ:3,INTP:3,ENTJ:3,ENTP:2,INFJ:3,INFP:2,ENFJ:2,ENFP:1,ISTJ:2,ISFJ:0,ESTJ:2,ESFJ:1,ISTP:1,ISFP:1,ESTP:1,ESFP:2 },
}

const LEVEL = [
  { label: '환상의 파트너 ✨', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-300', bar: 'bg-purple-500', pct: 95, emoji: '💜' },
  { label: '좋은 케미 😊',     color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-300',   bar: 'bg-blue-500',   pct: 75, emoji: '💙' },
  { label: '무난한 사이 🙂',   color: 'text-green-700',  bg: 'bg-green-50 border-green-300',  bar: 'bg-green-400',  pct: 55, emoji: '💚' },
  { label: '도전적 관계 😅',   color: 'text-orange-700', bg: 'bg-orange-50 border-orange-300',bar: 'bg-orange-400', pct: 30, emoji: '🧡' },
]

const WORK_TIPS: Record<number, string[]> = {
  0: ['서로의 강점을 자연스럽게 보완합니다', '팀 프로젝트에서 시너지가 극대화됩니다', '신뢰를 쌓으면 최강의 파트너가 됩니다'],
  1: ['의사소통이 원활하여 협업이 수월합니다', '서로를 이해하는 속도가 빠릅니다', '적절한 역할 분배로 높은 성과를 낼 수 있습니다'],
  2: ['명확한 역할 분담이 협업의 핵심입니다', '서로의 차이를 존중하면 좋은 팀이 됩니다', '필요 시 중간 조율자 역할이 도움이 됩니다'],
  3: ['스타일 차이를 먼저 인정하세요', '단기 미션보다는 역할을 분리하는 것이 효율적입니다', '각자의 강점을 살리는 방식으로 협력하세요'],
}

interface Props { onClose: () => void }

export default function MbtiModal({ onClose }: Props) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')

  const result = a && b && a !== b ? COMPAT[a]?.[b] ?? 2 : null
  const level = result !== null ? LEVEL[result] : null
  const tips = result !== null ? WORK_TIPS[result] : []

  function reset() { setA(''); setB('') }

  return (
    <div className="flex flex-col h-full max-h-[80vh]">
      {/* 헤더 */}
      <div className="flex items-center justify-between p-5 border-b-2 border-gray-200 bg-gradient-to-r from-purple-600 to-pink-600 rounded-t-2xl">
        <div>
          <h2 className="text-lg font-extrabold text-white">🧩 MBTI 팀 궁합 분석</h2>
          <p className="text-purple-100 text-xs mt-0.5">크루 배정 시 팀 케미를 미리 확인하세요</p>
        </div>
        <button onClick={onClose} className="text-purple-200 hover:text-white p-1 rounded-lg"><X className="h-5 w-5" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* 선택 UI */}
        <div className="grid grid-cols-2 gap-4">
          {[{ label: '크루 A', value: a, set: setA }, { label: '크루 B', value: b, set: setB }].map(({ label, value, set }) => (
            <div key={label}>
              <p className="text-xs font-bold text-gray-600 mb-2">{label} MBTI</p>
              <div className="grid grid-cols-4 gap-1.5">
                {MBTI_TYPES.map(type => (
                  <button key={type} onClick={() => set(type)}
                    className={`py-1.5 rounded-lg text-xs font-bold transition-all border-2 ${
                      value === type
                        ? 'bg-purple-600 text-white border-purple-600 scale-105 shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300 hover:text-purple-600'
                    }`}>{type}</button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 결과 */}
        {a && b && a === b && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4 text-center">
            <p className="text-yellow-700 font-bold">같은 MBTI예요! 🤝</p>
            <p className="text-yellow-600 text-sm mt-1">비슷한 성향으로 호흡은 잘 맞지만, 약점도 비슷할 수 있어요.</p>
          </div>
        )}

        {level && result !== null && (
          <div className={`border-2 rounded-2xl p-5 ${level.bg}`}>
            {/* 결과 헤더 */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-3xl">{level.emoji}</span>
                  <div>
                    <p className="text-xs text-gray-500 font-semibold">{a} × {b}</p>
                    <p className={`text-xl font-extrabold ${level.color}`}>{level.label}</p>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-4xl font-extrabold ${level.color}`}>{level.pct}%</p>
                <p className="text-xs text-gray-500">케미 지수</p>
              </div>
            </div>

            {/* 게이지 */}
            <div className="w-full bg-white/60 rounded-full h-3 mb-4 overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ${level.bar}`} style={{ width: `${level.pct}%` }} />
            </div>

            {/* 업무 팁 */}
            <div className="bg-white/70 rounded-xl p-3">
              <p className="text-xs font-bold text-gray-600 mb-2 flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />업무 협업 팁
              </p>
              <div className="space-y-1.5">
                {tips.map((tip, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Star className={`h-3 w-3 mt-0.5 shrink-0 ${level.color}`} />
                    <p className="text-xs text-gray-700">{tip}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 리셋 */}
            <button onClick={reset}
              className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 py-1.5 hover:bg-white/50 rounded-lg transition-colors">
              <RefreshCw className="h-3 w-3" />다시 선택
            </button>
          </div>
        )}

        {/* 안내 (초기 상태) */}
        {!a && !b && (
          <div className="text-center py-8 text-gray-400">
            <Heart className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">두 크루의 MBTI를 선택하세요</p>
            <p className="text-xs mt-1 opacity-70">팀 배정 전 케미 체크에 활용하세요</p>
          </div>
        )}
      </div>
    </div>
  )
}
