'use client'

import { useState } from 'react'
import { X, RefreshCw, Star, Shield, Zap, Users, ChevronDown, ChevronUp } from 'lucide-react'

const MBTI_TYPES = ['INTJ','INTP','ENTJ','ENTP','INFJ','INFP','ENFJ','ENFP','ISTJ','ISFJ','ESTJ','ESFJ','ISTP','ISFP','ESTP','ESFP']

// 각 MBTI 상세 프로필
interface MbtiProfile {
  nickname: string
  emoji: string
  keywords: string[]
  desc: string
  agencyRole: string       // 에이전시/경호 업무에서의 역할
  strengths: string[]      // 업무 강점
  weaknesses: string[]     // 주의할 점
  bestRole: string         // 최적 현장 역할
}

const PROFILES: Record<string, MbtiProfile> = {
  INTJ: {
    nickname: '전략가',
    emoji: '♟️',
    keywords: ['계획형', '독립적', '완벽주의', '분석적'],
    desc: '먼 미래를 내다보는 냉철한 전략가. 감정보다 논리가 앞선다.',
    agencyRole: '행사 전 리스크 분석, 배치 시나리오 수립에 탁월. 돌발상황 대응 매뉴얼 작성에 최적.',
    strengths: ['복잡한 현장 동선 파악 빠름', '매뉴얼 및 SOP 작성 능숙', '감정에 흔들리지 않는 냉정함'],
    weaknesses: ['소통이 딱딱하게 느껴질 수 있음', '팀원 감정 케어 부족', '즉흥 대응보다 계획 집착'],
    bestRole: '현장 총괄 매니저 / 배치 기획',
  },
  INTP: {
    nickname: '논리술사',
    emoji: '🔬',
    keywords: ['분석적', '호기심', '객관적', '유연한'],
    desc: '모든 것을 의심하고 분석하는 논리의 화신. 틀에 박힌 방식을 싫어한다.',
    agencyRole: '기존 배치 방식의 문제점을 날카롭게 짚어냄. 신규 운영 방식 아이디어 뱅크.',
    strengths: ['문제 원인 파악 탁월', '개선 아이디어 창출', '다양한 방법론 접근'],
    weaknesses: ['실행력 약함 (아이디어만 많음)', '마감 개념 희박', '현장 실무보다 이론 선호'],
    bestRole: '운영 개선 담당 / 백오피스 전략',
  },
  ENTJ: {
    nickname: '통솔자',
    emoji: '👑',
    keywords: ['리더십', '결단력', '목표지향', '카리스마'],
    desc: '타고난 리더. 결정을 내리고 팀을 이끄는 것이 본능.',
    agencyRole: '현장 지휘관으로 최적. 다수 인원 통솔 및 클라이언트 응대 모두 능숙.',
    strengths: ['팀 전체를 빠르게 정렬', '클라이언트 신뢰 획득', '위기 시 빠른 의사결정'],
    weaknesses: ['독단적 판단으로 갈등 야기', '팀원 의견 무시 가능성', '완벽 추구로 팀 압박'],
    bestRole: '현장 책임자 / 클라이언트 매니저',
  },
  ENTP: {
    nickname: '변론가',
    emoji: '💡',
    keywords: ['창의적', '도전적', '설득력', '융통성'],
    desc: '아이디어가 넘치고 토론을 즐기는 혁신가. 규칙보다 가능성을 본다.',
    agencyRole: '클라이언트 제안 및 영업에 강함. 예상치 못한 상황에서 창의적 해결책 도출.',
    strengths: ['즉흥 대응 및 임기응변', '클라이언트 설득 탁월', '새로운 운영 방식 제안'],
    weaknesses: ['세부 사항 놓치기 쉬움', '집중력 분산', '체계적 업무 처리 약함'],
    bestRole: '영업 / 클라이언트 상담 / 기획',
  },
  INFJ: {
    nickname: '옹호자',
    emoji: '🌙',
    keywords: ['통찰력', '이상주의', '공감능력', '헌신적'],
    desc: '사람을 깊이 이해하는 조용한 혁신가. 팀의 분위기를 읽는 레이더.',
    agencyRole: '크루 컨디션 파악 및 멘탈 케어. 고객 니즈 파악과 세밀한 서비스 제공.',
    strengths: ['팀 내 갈등 중재', '고객 요구사항 정확히 파악', '장기적 신뢰 관계 구축'],
    weaknesses: ['번아웃 위험', '갈등 회피로 문제 축적', '과도한 완벽주의'],
    bestRole: '크루 코디네이터 / 고객 케어',
  },
  INFP: {
    nickname: '중재자',
    emoji: '🌿',
    keywords: ['이상주의', '공감', '창의적', '진정성'],
    desc: '세상을 더 좋게 만들고 싶은 따뜻한 몽상가. 진심이 언행에 묻어난다.',
    agencyRole: '팀 내 화합과 사기 진작. 세심한 고객 응대와 섬세한 현장 분위기 조성.',
    strengths: ['진심 어린 서비스로 고객 만족도 높음', '팀 분위기 메이커', '창의적 아이디어'],
    weaknesses: ['압박 상황에서 흔들림', '비판에 민감', '현실적 판단 약함'],
    bestRole: '고객 응대 / 현장 분위기 메이커',
  },
  ENFJ: {
    nickname: '선도자',
    emoji: '🌟',
    keywords: ['카리스마', '공감', '영향력', '열정적'],
    desc: '타인을 성장시키는 타고난 멘토. 팀 전체를 하나로 만드는 접착제.',
    agencyRole: '팀 사기 고양 및 동기부여. 클라이언트와의 관계 관리 및 현장 분위기 리딩.',
    strengths: ['팀원 동기부여 탁월', '클라이언트 관계 최강', '갈등 조율 능숙'],
    weaknesses: ['타인 의존으로 소진', '반대 의견에 상처', '우선순위 설정 어려움'],
    bestRole: '팀 리더 / 클라이언트 관계 담당',
  },
  ENFP: {
    nickname: '활동가',
    emoji: '🎊',
    keywords: ['열정적', '창의적', '사교적', '자유로운'],
    desc: '에너지가 넘치고 어디서나 분위기를 만드는 활력소. 현장의 활기 자체.',
    agencyRole: '현장 분위기 조성 및 고객 웰컴. 행사 전반의 에너지 관리.',
    strengths: ['현장 분위기 메이커', '즉흥 대응력', '폭넓은 인간관계'],
    weaknesses: ['집중력·지속성 약함', '세부 업무 소홀', '감정 기복으로 팀 혼란'],
    bestRole: '행사 MC 보조 / 웰컴 담당',
  },
  ISTJ: {
    nickname: '현실주의자',
    emoji: '📋',
    keywords: ['책임감', '신뢰', '체계적', '꼼꼼한'],
    desc: '말보다 행동으로 증명하는 신뢰의 기둥. 약속은 반드시 지킨다.',
    agencyRole: '배치신고서 등 서류 업무 완벽 처리. 규정·프로토콜 준수의 모범.',
    strengths: ['마감 100% 준수', '세부 사항 놓치지 않음', '일관된 수준의 서비스'],
    weaknesses: ['변화 적응 느림', '유연성 부족', '창의적 제안 잘 안 함'],
    bestRole: '행정·서류 담당 / 규정 관리',
  },
  ISFJ: {
    nickname: '수호자',
    emoji: '🛡️',
    keywords: ['헌신적', '꼼꼼한', '따뜻한', '실용적'],
    desc: '남을 돕는 것이 자연스러운 조용한 영웅. 뒤에서 묵묵히 팀을 지지한다.',
    agencyRole: '크루 컨디션 세심히 챙김. 고객 불만 조기 발견 및 조용한 해결.',
    strengths: ['팀원 케어 탁월', '고객 불만 조기 해소', '꼼꼼한 현장 준비'],
    weaknesses: ['자기 의견 잘 안 냄', '무리한 부탁 거절 못함', '스트레스 내색 안 함'],
    bestRole: '크루 케어 / 고객 VIP 응대',
  },
  ESTJ: {
    nickname: '경영자',
    emoji: '⚙️',
    keywords: ['조직적', '규율', '리더십', '실용적'],
    desc: '규칙과 질서를 중시하는 타고난 관리자. 체계 없이는 못 산다.',
    agencyRole: '현장 운영 총괄 및 규정 집행. 인원 통솔과 시간 관리 철저.',
    strengths: ['시간·인원 관리 탁월', '명확한 역할 지시', '규정 준수 확보'],
    weaknesses: ['융통성 부족으로 갈등', '감정 배려 약함', '변화 저항'],
    bestRole: '현장 운영 책임자 / 시프트 매니저',
  },
  ESFJ: {
    nickname: '집정관',
    emoji: '🤝',
    keywords: ['친화력', '책임감', '배려', '사교적'],
    desc: '모두가 행복하기를 원하는 팀의 허브. 관계 유지에 타의 추종 불허.',
    agencyRole: '고객·스태프 모두와 원활한 소통. 현장 분위기 관리 및 고객 만족도 극대화.',
    strengths: ['고객 만족도 최상', '팀 화합 유도', '갈등 예방 및 중재'],
    weaknesses: ['타인 승인 과도 의존', '비판에 예민', '객관적 판단 어려움'],
    bestRole: '고객 응대 / 팀 커뮤니케이션',
  },
  ISTP: {
    nickname: '장인',
    emoji: '🔧',
    keywords: ['실용적', '분석적', '독립적', '침착한'],
    desc: '말이 없어도 손이 먼저 움직이는 실행형 전문가. 위기에 강하다.',
    agencyRole: '장비·통신 운용 및 현장 돌발상황 즉각 대응. 물리적 통제 업무 최적.',
    strengths: ['위기 상황 침착 대응', '장비 운용 능숙', '빠른 문제 해결'],
    weaknesses: ['소통 부족으로 오해', '감정 표현 서툼', '팀 합의보다 단독 판단'],
    bestRole: '경호원 / 통신·장비 담당 / 긴급대응',
  },
  ISFP: {
    nickname: '모험가',
    emoji: '🎨',
    keywords: ['감성적', '현재집중', '온화한', '유연한'],
    desc: '지금 이 순간 최선을 다하는 조용한 실행가. 강요를 싫어하고 자유롭다.',
    agencyRole: '섬세한 현장 세팅 및 시각적 연출 보조. 고객 한 명 한 명에 집중하는 일대일 케어.',
    strengths: ['세심한 현장 관찰', '고객 개인 케어', '갈등 없는 조화로운 팀워크'],
    weaknesses: ['장기 계획 수립 약함', '리더 역할 기피', '갑작스러운 변화 혼란'],
    bestRole: '게스트 케어 / 현장 세팅 보조',
  },
  ESTP: {
    nickname: '사업가',
    emoji: '⚡',
    keywords: ['즉흥적', '대담한', '현실적', '에너지'],
    desc: '행동이 먼저인 위험 감수자. 현장에서 가장 빛나는 순간 대응의 달인.',
    agencyRole: '돌발 상황 즉각 제압 및 현장 통제. 빠른 판단과 행동이 필요한 최전선.',
    strengths: ['즉각 대응 최강', '현장 장악력', '압박 상황에서 오히려 강해짐'],
    weaknesses: ['충동적 판단으로 실수', '장기 계획 소홀', '규칙·절차 무시'],
    bestRole: '선두 경호원 / 긴급대응팀 / 현장통제',
  },
  ESFP: {
    nickname: '연예인',
    emoji: '🎤',
    keywords: ['활발한', '즉흥적', '사교적', '낙천적'],
    desc: '모든 순간을 무대로 만드는 타고난 엔터테이너. 어디서나 존재감 폭발.',
    agencyRole: '행사 현장 분위기 메이커 및 게스트 웰컴. VIP 응대 시 자연스러운 친화력 발휘.',
    strengths: ['VIP 친화력 최고', '현장 에너지 관리', '고객 불만 분위기 전환'],
    weaknesses: ['업무 집중도 낮음', '세부 지시 이행 불안정', '감정에 따라 퍼포먼스 기복'],
    bestRole: 'VIP 응대 / 행사 웰컴 / 이벤트 진행',
  },
}

// 궁합 매트릭스: 0=환상 1=좋음 2=무난 3=도전
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

// 궁합 조합별 설명
const PAIR_DESC: Record<number, { title: string; desc: string; tip: string; agencyTip: string }> = {
  0: {
    title: '환상의 파트너 ✨',
    desc: '서로가 서로를 완성시키는 이상적인 조합입니다. 강점이 상대의 약점을 자연스럽게 채웁니다.',
    tip: '이 조합은 장기 프로젝트에서 진가를 발휘합니다. 서로를 믿고 역할을 나누세요.',
    agencyTip: '장기 행사나 대형 프로젝트의 핵심 듀오로 최적. 한 명이 기획·전략, 다른 한 명이 실행·현장을 담당하면 완벽한 분업이 됩니다.',
  },
  1: {
    title: '좋은 케미 😊',
    desc: '서로의 성향을 자연스럽게 이해하고 협력이 원활한 조합입니다.',
    tip: '역할 분담을 명확히 하면 이 조합의 시너지가 극대화됩니다.',
    agencyTip: '대부분의 현장에서 잘 맞습니다. 주도 역할을 한 명이 맡고 다른 한 명이 서포트하는 구조가 효과적입니다.',
  },
  2: {
    title: '무난한 사이 🙂',
    desc: '갈등 없이 함께 일할 수 있지만, 서로의 차이를 의식적으로 존중해야 합니다.',
    tip: '일 시작 전 역할·기대치를 명확히 정하면 훨씬 수월하게 협력할 수 있습니다.',
    agencyTip: '단기 행사나 명확하게 역할이 분리된 업무라면 문제없습니다. 미리 각자 담당을 정해두세요.',
  },
  3: {
    title: '도전적 관계 😅',
    desc: '성향 차이가 커서 마찰이 생길 수 있습니다. 그러나 서로 배울 점도 많은 관계입니다.',
    tip: '직접 대화보다 명확한 문서·지시로 소통하면 마찰을 줄일 수 있습니다.',
    agencyTip: '같은 현장에 투입 시 중간 조율자 역할이 필요합니다. 각자 완전히 다른 구역을 담당하게 하거나, 책임자가 통역 역할을 하세요.',
  },
}

const LEVEL_META = [
  { bar: 'bg-purple-500', pct: 95, accent: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', icon: '💜' },
  { bar: 'bg-blue-500',   pct: 75, accent: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     icon: '💙' },
  { bar: 'bg-green-400',  pct: 55, accent: 'text-green-700',  bg: 'bg-green-50 border-green-200',   icon: '💚' },
  { bar: 'bg-orange-400', pct: 30, accent: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', icon: '🧡' },
]

interface Props { onClose: () => void }

function ProfileCard({ type, side }: { type: string; side: 'A' | 'B' }) {
  const p = PROFILES[type]
  if (!p) return null
  const colors = side === 'A' ? 'border-blue-300 bg-blue-50' : 'border-purple-300 bg-purple-50'
  const badge  = side === 'A' ? 'bg-blue-600' : 'bg-purple-600'
  return (
    <div className={`border-2 rounded-xl p-3 ${colors}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[10px] font-bold text-white px-2 py-0.5 rounded-full ${badge}`}>{side}</span>
        <span className="text-xl">{p.emoji}</span>
        <div>
          <span className="text-sm font-extrabold text-gray-800">{type}</span>
          <span className="text-xs text-gray-500 ml-1.5">{p.nickname}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        {p.keywords.map(k => (
          <span key={k} className="text-[10px] bg-white border border-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{k}</span>
        ))}
      </div>
      <p className="text-xs text-gray-600 leading-relaxed">{p.desc}</p>
      <div className="mt-2 pt-2 border-t border-white/60">
        <p className="text-[10px] font-bold text-gray-500 mb-1">🏢 현장 최적 역할</p>
        <p className="text-xs font-semibold text-gray-700">{p.bestRole}</p>
      </div>
    </div>
  )
}

export default function MbtiModal({ onClose }: Props) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [showProfileA, setShowProfileA] = useState(false)
  const [showProfileB, setShowProfileB] = useState(false)

  const result = a && b && a !== b ? COMPAT[a]?.[b] ?? 2 : null
  const meta   = result !== null ? LEVEL_META[result] : null
  const pair   = result !== null ? PAIR_DESC[result]  : null
  const profA  = a ? PROFILES[a] : null
  const profB  = b ? PROFILES[b] : null

  function reset() { setA(''); setB(''); setShowProfileA(false); setShowProfileB(false) }

  return (
    <div className="flex flex-col" style={{ maxHeight: '88vh' }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between p-5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-t-2xl shrink-0">
        <div>
          <h2 className="text-lg font-extrabold text-white">🧩 MBTI 팀 궁합 분석</h2>
          <p className="text-purple-100 text-xs mt-0.5">16가지 유형별 특성 · 현장 역할 · 협업 궁합 분석</p>
        </div>
        <button onClick={onClose} className="text-purple-200 hover:text-white p-1 rounded-lg"><X className="h-5 w-5" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* MBTI 선택 */}
        <div className="grid grid-cols-2 gap-3">
          {([{ label: '크루 A', value: a, set: setA, show: showProfileA, toggleShow: () => setShowProfileA(v => !v) },
             { label: '크루 B', value: b, set: setB, show: showProfileB, toggleShow: () => setShowProfileB(v => !v) }] as const).map(({ label, value, set, show, toggleShow }) => (
            <div key={label}>
              <p className="text-xs font-bold text-gray-600 mb-1.5">{label} MBTI</p>
              <div className="grid grid-cols-4 gap-1">
                {MBTI_TYPES.map(type => (
                  <button key={type} onClick={() => set(type)}
                    className={`py-1 rounded-lg text-xs font-bold transition-all border-2 ${
                      value === type
                        ? 'bg-purple-600 text-white border-purple-600 shadow'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300 hover:text-purple-600'
                    }`}>{type}</button>
                ))}
              </div>
              {/* 선택된 유형 프로필 토글 */}
              {value && (
                <button onClick={toggleShow}
                  className="mt-1.5 w-full flex items-center justify-center gap-1 text-xs text-purple-600 hover:text-purple-800 py-1 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors">
                  {show ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {value} 상세 프로필 {show ? '접기' : '보기'}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* 개별 프로필 카드 */}
        {(showProfileA && a) && <ProfileCard type={a} side="A" />}
        {(showProfileB && b) && <ProfileCard type={b} side="B" />}

        {/* 같은 MBTI */}
        {a && b && a === b && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4">
            <p className="text-yellow-700 font-bold text-sm">같은 유형 — {a}! 🤝</p>
            <p className="text-yellow-600 text-xs mt-1">비슷한 강점과 약점을 공유합니다. 호흡은 잘 맞지만 사각지대도 동일할 수 있어요. 서로의 약점을 보완해 줄 다른 유형과 함께 팀을 구성하면 좋습니다.</p>
            {profA && (
              <div className="mt-2 pt-2 border-t border-yellow-200">
                <p className="text-xs text-yellow-700 font-semibold">🏢 현장 추천 역할: {profA.bestRole}</p>
              </div>
            )}
          </div>
        )}

        {/* 궁합 결과 */}
        {meta && pair && result !== null && profA && profB && (
          <div className={`border-2 rounded-2xl overflow-hidden ${meta.bg}`}>
            {/* 결과 헤더 */}
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{meta.icon}</span>
                  <div>
                    <p className="text-xs text-gray-500">{a} × {b} 조합</p>
                    <p className={`text-xl font-extrabold ${meta.accent}`}>{pair.title}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-4xl font-extrabold ${meta.accent}`}>{meta.pct}%</p>
                  <p className="text-[10px] text-gray-500">케미 지수</p>
                </div>
              </div>
              <div className="mt-3 w-full bg-white/60 rounded-full h-2.5 overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${meta.bar}`} style={{ width: `${meta.pct}%` }} />
              </div>
            </div>

            {/* 조합 분석 */}
            <div className="mx-4 mb-4 bg-white/70 rounded-xl p-3 space-y-3">
              <div>
                <p className="text-xs font-bold text-gray-600 flex items-center gap-1 mb-1"><Shield className="h-3.5 w-3.5" />관계 분석</p>
                <p className="text-xs text-gray-700 leading-relaxed">{pair.desc}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-600 flex items-center gap-1 mb-1"><Zap className="h-3.5 w-3.5" />협업 팁</p>
                <p className="text-xs text-gray-700 leading-relaxed">{pair.tip}</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                <p className="text-xs font-bold text-amber-700 flex items-center gap-1 mb-1">🏢 에이전시·경호 현장 활용법</p>
                <p className="text-xs text-amber-800 leading-relaxed">{pair.agencyTip}</p>
              </div>
            </div>

            {/* 두 사람의 강점 비교 */}
            <div className="grid grid-cols-2 gap-0 border-t border-white/40">
              {[{ type: a, prof: profA, color: 'bg-blue-50/80', border: 'border-r border-white/40' },
                { type: b, prof: profB, color: 'bg-purple-50/80', border: '' }].map(({ type, prof, color, border }) => (
                <div key={type} className={`p-3 ${color} ${border}`}>
                  <p className="text-[10px] font-bold text-gray-500 mb-1.5">{type} {prof.emoji} 강점</p>
                  {prof.strengths.map(s => (
                    <div key={s} className="flex items-start gap-1 mb-1">
                      <Star className="h-2.5 w-2.5 text-amber-400 mt-0.5 shrink-0" />
                      <p className="text-[10px] text-gray-700 leading-snug">{s}</p>
                    </div>
                  ))}
                  <p className="text-[10px] font-bold text-gray-500 mt-2 mb-1">⚠️ 주의</p>
                  {prof.weaknesses.slice(0,2).map(w => (
                    <p key={w} className="text-[10px] text-gray-500 mb-0.5">• {w}</p>
                  ))}
                </div>
              ))}
            </div>

            {/* 에이전시 역할 추천 */}
            <div className="mx-4 mb-4 mt-3 bg-white/70 rounded-xl p-3">
              <p className="text-xs font-bold text-gray-600 flex items-center gap-1 mb-2"><Users className="h-3.5 w-3.5" />현장 최적 역할 배치</p>
              <div className="grid grid-cols-2 gap-2">
                {[{ type: a, prof: profA }, { type: b, prof: profB }].map(({ type, prof }) => (
                  <div key={type} className="bg-gray-50 rounded-lg p-2">
                    <p className="text-[10px] font-bold text-gray-500">{type} {prof.emoji}</p>
                    <p className="text-xs font-semibold text-gray-800 mt-0.5">{prof.bestRole}</p>
                    <p className="text-[10px] text-gray-500 mt-1 leading-snug">{prof.agencyRole.slice(0,50)}...</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 리셋 */}
            <div className="px-4 pb-4">
              <button onClick={reset}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 py-1.5 hover:bg-white/50 rounded-lg transition-colors">
                <RefreshCw className="h-3 w-3" />다시 선택
              </button>
            </div>
          </div>
        )}

        {/* 초기 안내 */}
        {!a && !b && (
          <div className="text-center py-8 text-gray-400">
            <span className="text-5xl block mb-3">🧩</span>
            <p className="text-sm font-semibold">두 크루의 MBTI를 선택하세요</p>
            <p className="text-xs mt-1 opacity-70">각 유형 특성 · 현장 역할 · 팀 궁합을 한눈에 분석합니다</p>
          </div>
        )}
      </div>
    </div>
  )
}
