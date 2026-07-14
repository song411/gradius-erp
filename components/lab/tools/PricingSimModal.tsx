'use client'

import { Fragment, useEffect, useState } from 'react'
import { db } from '@/lib/supabase/api'
import { X, RefreshCw, Calculator, Pencil, BarChart3, Save, ShieldAlert, Info, Plus, Trash2, AlertTriangle, ChevronDown, ChevronRight, History, List, LayoutGrid } from 'lucide-react'
import { toast } from 'sonner'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

// ── 타입 ─────────────────────────────────────────────────
interface FixedCost { l: string; a: number }
interface RoleRow {
  id: string; role_code: string; role_name: string
  base_price: number; pay_price: number; leader_bonus: number
  fixed_costs: FixedCost[]; is_published: boolean
  base_hours: number; overtime_hourly: number
  mgmt_rate: number; profit_rate: number
}
type RuleType = 'flat' | 'percent' | 'tier_qty' | 'tier_duration'
interface RuleParams { pct?: number; pay_pct?: number; min_qty?: number; min_days?: number }
interface FactorRow {
  id: string; role_id: string | null; factor_name: string; description?: string | null
  add_price: number; add_pay_price: number; level: string; alert?: string | null
  rule_type: RuleType; rule_params: RuleParams
}
interface GuideRow {
  id: string; role_id: string; consult_points?: string | null
  market_avg_price?: number | null; competitor_price?: number | null; past_contract_price?: number | null
  label?: string | null; price?: number | null; surveyed_at?: string | null
}
interface PrepItem { i: string; m: boolean; t: string; n: string }
interface StaffGroup { t: string; items: { m: boolean; t: string }[] }

// UI 전용 데이터(디자인/설명/업무 안내) — 변경 빈도가 낮아 DB에 넣지 않고 코드에 상수로 유지
const JOB_META: Record<string, {
  emoji: string; cc: string; cb: string; cat: string; what: string; confuse: string
  prep: PrepItem[]; staffCriteria: StaffGroup[]
}> = {
  staff: {
    emoji: '🟦', cc: '#2471A3', cb: '#EBF5FB', cat: '운영 직군',
    what: '공연·전시·컨퍼런스 현장에서 관객 안내, 동선 유도, 등록 처리, QR 체크인 보조 등 행사 운영 전반을 지원.',
    confuse: '군중 통제·신체 제지 업무가 있으면 경비업(혼잡경비) → 경비업 허가 필요.',
    prep: [
      { i: '📋', m: true, t: '일용직 근로계약서 당일 교부', n: '미교부 시 과태료 500만원/인' },
      { i: '🌡️', m: true, t: '야외 35도+ 시 교대조 편성', n: '1시간 작업 후 15분 휴식 의무' },
      { i: '🍱', m: false, t: '식대 제공 여부 확인', n: '미제공 시 견적에 포함' },
    ],
    staffCriteria: [
      { t: '필수', items: [{ m: true, t: '18세 이상' }, { m: true, t: '기본 커뮤니케이션' }, { m: true, t: '당일 계약서 체결' }] },
      { t: '우대', items: [{ m: false, t: '행사 경험' }, { m: false, t: '서비스 마인드' }, { m: false, t: '디지털 기기 활용' }] },
    ],
  },
  parking: {
    emoji: '🅿️', cc: '#2471A3', cb: '#EBF5FB', cat: '운영 직군',
    what: '차량 유도·주차 보조·발렛 파킹 담당. 발렛은 고객 차량을 직접 운전하므로 보험 처리가 핵심.',
    confuse: '발렛요원은 운전직. 운전경력 1년 미만 절대 불가.',
    prep: [
      { i: '🚗', m: true, t: '발렛 시 보험 처리 주체 계약서 명시', n: '미명시 시 사고 분쟁 발생' },
      { i: '📸', m: true, t: '투입 전 차량 상태 사진 확보', n: '기스·파손 사전 기록' },
      { i: '🪪', m: true, t: '발렛요원 운전경력 1년 미만 불가', n: '면허 취득일 확인' },
    ],
    staffCriteria: [
      { t: '발렛 필수', items: [{ m: true, t: '운전면허 1년 이상' }, { m: true, t: '사고 이력 없음' }, { m: true, t: '고급 세단 경험' }] },
      { t: '일반', items: [{ m: false, t: '기본 차량 상식' }, { m: false, t: '야외 장시간 체력' }, { m: false, t: '서비스 마인드' }] },
    ],
  },
  safety: {
    emoji: '🦺', cc: '#2471A3', cb: '#EBF5FB', cat: '운영 직군',
    what: '행사장 위험 구역 통제, 비상 상황 대응, CPR 응급처치 1차 대응.',
    confuse: '군중 통제·신체 제지=경비원(허가 필요). 무대 앞 배리어 통제가 있으면 경비업법 위반.',
    prep: [
      { i: '📜', m: true, t: 'CPR/AED 수료증 사전 수령·보관', n: '현장 점검 시 요청' },
      { i: '⚖️', m: true, t: '경비업 해당 여부 판단', n: '신체 제지 있으면 허가 필요' },
      { i: '📋', m: true, t: '안전교육 기록 서명 목록 수령', n: '중대재해법 면책 핵심' },
    ],
    staffCriteria: [
      { t: '자격', items: [{ m: true, t: 'CPR/AED 수료증(유효기간 확인)' }, { m: false, t: '수상안전(워터 행사)' }, { m: true, t: '강한 체력·판단력' }] },
      { t: '주의', items: [{ m: true, t: '신체 제지 업무 여부 사전 확인' }, { m: false, t: '응급처치 경험' }, { m: false, t: '대형 행사 경험' }] },
    ],
  },
  promoter: {
    emoji: '📣', cc: '#6C3483', cb: '#F4ECF7', cat: '홍보 직군',
    what: '제품 시연·샘플링·판촉·브랜드 홍보 수행.',
    confuse: '외모형(이미지 중심) vs 세일즈형(판매 전환율 KPI). 유형 확인 필수.',
    prep: [
      { i: '❓', m: true, t: '유형 먼저 확인: 외모형 vs 세일즈형 vs 전문지식형', n: '"판매 목표 있냐", "외모 기준 있냐" 반드시 확인' },
      { i: '👗', m: true, t: '의상 노출 수위 사전 협의 후 계약서 명시', n: '크루 거부 권리 고지' },
    ],
    staffCriteria: [
      { t: '공통', items: [{ m: true, t: '외향적 성격' }, { m: true, t: '서비스 마인드' }, { m: false, t: '제품 관심도' }] },
      { t: '유형별', items: [{ m: false, t: '[세일즈] 판매 경험·멘트' }, { m: false, t: '[전문] 제품 지식' }, { m: false, t: '[외국어] 어학 테스트' }] },
    ],
  },
  narrator: {
    emoji: '🎤', cc: '#6C3483', cb: '#F4ECF7', cat: '홍보 직군',
    what: '전시회·신제품 발표회·박람회에서 마이크를 잡고 스크립트를 전달하는 전문 진행 인력.',
    confuse: '나레이터 ≠ MC. 나레이터는 정해진 스크립트 전달.',
    prep: [
      { i: '🎬', m: true, t: '진행 영상·음성 포트폴리오 확인', n: '등급(S/A/B/C) 분류 후 단가 적용' },
      { i: '🎙️', m: false, t: '자체 앰프·마이크 보유 여부', n: '지참 시 장비 임대비 별도' },
    ],
    staffCriteria: [
      { t: '등급 기준', items: [{ m: true, t: 'S급: 대형 무대, 즉흥 대처' }, { m: true, t: 'A급: 발표회 경험 3회+' }, { m: false, t: 'B급: 소규모 경험' }] },
      { t: '필수 역량', items: [{ m: true, t: '정확한 발음·발성' }, { m: true, t: '스크립트 암기력' }, { m: false, t: '무대 매너' }] },
    ],
  },
  mascot: {
    emoji: '🐻', cc: '#6C3483', cb: '#F4ECF7', cat: '홍보 직군',
    what: '캐릭터 슈트 착용 홍보·퍼포먼스. 밀폐 환경·고강도 신체 노동.',
    confuse: '1인 8시간 풀타임 배치 = 법 위반. 반드시 2인 1조 교대.',
    prep: [
      { i: '👥', m: true, t: '2인 1조 교대 원칙 (30~40분 착용 후 휴식)', n: '"1인으로" 요청 → 거절' },
      { i: '😰', m: true, t: '폐소공포증 유무 사전 확인', n: '면접 시 필수 질문' },
      { i: '❄️', m: false, t: '여름 야외: 냉각 조끼·아이스팩', n: '클라이언트 요청 또는 비용 청구' },
    ],
    staffCriteria: [
      { t: '적합', items: [{ m: true, t: '폐소공포증 없음' }, { m: true, t: '더위에 강한 체력' }, { m: false, t: '퍼포먼스 경험' }] },
      { t: '부적합', items: [{ m: false, t: '× 밀폐공간 불안' }, { m: false, t: '× 체력 저하자' }, { m: false, t: '× 열에 민감' }] },
    ],
  },
  docent: {
    emoji: '🖼️', cc: '#1E8449', cb: '#EAFAF1', cat: '전문 직군',
    what: '미술관·박람회·전시회 작품 해설, 관람객 스토리텔링.',
    confuse: '도슨트 ≠ 진행요원. 전문 지식과 연구 기간이 필요.',
    prep: [
      { i: '📚', m: false, t: '스크립트 제공 여부 확인', n: '미제공 시 연구·작성비 청구' },
      { i: '🌏', m: false, t: '외국어 능력 테스트', n: '외국어 도슨트 요청 시' },
    ],
    staffCriteria: [
      { t: '필수', items: [{ m: true, t: '해당 분야 지식' }, { m: true, t: '스토리텔링 능력' }, { m: false, t: 'Q&A 대처력' }] },
      { t: '우대', items: [{ m: false, t: '관련 학과 졸업' }, { m: false, t: '외국어 능력' }, { m: false, t: '교육 경험' }] },
    ],
  },
  mc: {
    emoji: '🎙️', cc: '#1E8449', cb: '#EAFAF1', cat: '전문 직군',
    what: '행사·시상식·컨퍼런스 프로그램 전체를 이끄는 사회자.',
    confuse: 'MC ≠ 나레이터. MC는 전체 운영·돌발 대처.',
    prep: [
      { i: '🎬', m: true, t: '진행 영상 포트폴리오 확인', n: '등급(S/A/B) 분류 후 단가' },
      { i: '📝', m: false, t: '대본 작성 주체 확인', n: 'MC 직접 작성 시 추가 비용' },
    ],
    staffCriteria: [
      { t: '등급', items: [{ m: true, t: 'S급: 방송·대형 경력' }, { m: true, t: 'A급: 기업 행사 다수' }, { m: false, t: 'B급: 소규모 경험' }] },
      { t: '필수', items: [{ m: true, t: '돌발 상황 즉흥 대처' }, { m: true, t: '청중 장악력' }, { m: false, t: '특수 분야 지식' }] },
    ],
  },
  protocol: {
    emoji: '🎀', cc: '#784212', cb: '#FEF9E7', cat: '의전 직군',
    what: '기공식·협약식·시상식·VIP 영접에서 의전 서비스 제공.',
    confuse: '의전도우미 ≠ 프로모터. 의전은 품격·격식, 프로모터는 판매·홍보.',
    prep: [
      { i: '👗', m: true, t: '유니폼 제공 여부 확인', n: '미제공 시 헤어·의상비 별도' },
      { i: '💬', m: true, t: '의상 노출 수위 사전 협의', n: '크루 거부 권리 있음' },
      { i: '👠', m: false, t: '하이힐 장시간 착용 가능 여부', n: '발 질환 유무 확인' },
    ],
    staffCriteria: [
      { t: '이미지 기준', items: [{ m: false, t: '키 168cm+ 선호' }, { m: false, t: '문신 노출 없음' }, { m: false, t: '사이즈 44~66' }] },
      { t: '역량', items: [{ m: true, t: '격식 있는 태도·화법' }, { m: false, t: '에티켓 교육 이수' }, { m: false, t: '외국어 능력' }] },
    ],
  },
  driver: {
    emoji: '🚗', cc: '#784212', cb: '#FEF9E7', cat: '의전 직군',
    what: '임원·VIP 이동 담당 전문 운전. 의전·보안 마인드 필수.',
    confuse: '수행기사 ≠ 일반 운전기사. 1년 미만 경력 불가.',
    prep: [
      { i: '🪪', m: true, t: '운전경력 1년 미만 절대 불가', n: '면허 취득일 확인 필수' },
      { i: '🤫', m: true, t: 'NDA(비밀유지협약) 서면 체결', n: 'VIP 대화 유출 시 손해배상' },
      { i: '🚬', m: true, t: '흡연 여부 확인', n: '차내 냄새 민감 클라이언트 있음' },
    ],
    staffCriteria: [
      { t: '필수', items: [{ m: true, t: '면허 1년 이상' }, { m: true, t: '고급 세단·SUV 경험' }, { m: true, t: '비흡연자' }] },
      { t: '성격', items: [{ m: true, t: '말수 적음·비밀유지' }, { m: true, t: '보안 의식' }, { m: false, t: '외국어 능력' }] },
    ],
  },
  guard: {
    emoji: '🛡️', cc: '#C0392B', cb: '#FDECEA', cat: '보안 직군',
    what: '특정인 신변 보호(신변보호) 또는 행사장 출입·혼잡 관리(행사경비).',
    confuse: '경비업 허가 없이 경호 서비스 = 3년 이하 징역 또는 3,000만원 벌금.',
    prep: [
      { i: '📋', m: true, t: '배치신고 타이밍 확인', n: '신변보호=배치 전 / 행사경비=7일내 / 집단민원=48H전 허가' },
      { i: '🚫', m: true, t: '결격사유 확인', n: '금고 이상 실형 5년 미경과자 불가' },
      { i: '📜', m: true, t: '신임교육 이수증 수령·보관', n: '28시간 집합교육 필수' },
      { i: '🤫', m: true, t: '경호원과 NDA 서면 체결', n: '퇴직 후에도 비밀유지 의무' },
    ],
    staffCriteria: [
      { t: '법적 요건(절대)', items: [{ m: true, t: '결격사유 없음' }, { m: true, t: '신임교육 이수증 보유' }, { m: true, t: '경비업법 §10 해당 없음' }] },
      { t: '역량', items: [{ m: false, t: '무도 자격증' }, { m: false, t: '경호·경비 경력' }, { m: false, t: '외국어(외국인 경호 시)' }] },
    ],
  },
}

// 좌측 목록에 보여줄 직종 순서 — 여기 없는 직종은 이 뒤에 이름순으로 붙는다
const ROLE_ORDER = ['guard', 'staff', 'safety', 'parking', 'promoter', 'protocol']
function sortRoles(list: RoleRow[]) {
  return [...list].sort((a, b) => {
    const ai = ROLE_ORDER.indexOf(a.role_code), bi = ROLE_ORDER.indexOf(b.role_code)
    const av = ai === -1 ? ROLE_ORDER.length : ai, bv = bi === -1 ? ROLE_ORDER.length : bi
    if (av !== bv) return av - bv
    return a.role_name.localeCompare(b.role_name, 'ko')
  })
}

function fmt(n: number | null | undefined) { return Math.round(n || 0).toLocaleString('ko-KR') }

// ── 체결 히스토리 (실제 ERP 견적/문의 데이터 기반 참고 자료, 읽기 전용) ──
// estimate_items.role_name은 완전 자유 텍스트라 포함(contains) 키워드로 근사 매칭한다.
// 완벽한 매칭이 아니므로 UI에서 매칭된 원문을 그대로 보여줘 팀이 검증할 수 있게 한다.
const ROLE_MATCH_KEYWORDS: Record<string, string[]> = {
  staff: ['행사스탭', '행사팀장', '총괄팀장', '진행팀장', '스탭팀장'],
  parking: ['주차요원'],
  safety: ['안전요원'],
  promoter: ['프로모터', '판촉스탭', '판촉 프로모터'],
  narrator: ['나레이'],
  mascot: ['인형탈'],
  docent: ['도슨트'],
  mc: ['MC'],
  protocol: ['의전'],
  driver: ['수행기사'],
  guard: ['경호'],
}
const WON_STATUSES = new Set(['체결', '배정완료', '진행중', '완료', '정산완료'])
const LOST_STATUSES = new Set(['미체결', '취소'])

interface HistoryItem {
  id: string; role_name: string; unit_price: number; quantity: number; days: number
  status: string; outcome: 'won' | 'lost' | 'pending'
  event_start: string | null; event_end: string | null; event_time: string | null
  company_name: string | null
}

function classifyOutcome(status: string | undefined | null): 'won' | 'lost' | 'pending' {
  if (!status) return 'pending'
  if (WON_STATUSES.has(status)) return 'won'
  if (LOST_STATUSES.has(status)) return 'lost'
  return 'pending'
}
function matchesRoleName(roleName: string, roleCode: string): boolean {
  const keywords = ROLE_MATCH_KEYWORDS[roleCode]
  if (!keywords || !roleName) return false
  return keywords.some(k => roleName.includes(k))
}
function priceBucket(price: number) { return Math.round(price / 10000) * 10000 }
// 전체 직종 비교 매트릭스 전용 — 직종마다 가격대가 7만원~70만원까지 넓게 퍼져 있어서
// 1만원 단위(priceBucket)로 나누면 열이 60개 넘게 생겨 못 읽는다. 10만원 단위로 묶어서 압축.
function priceBucketCoarse(price: number) { return Math.floor(price / 100000) * 100000 }
function formatEventDate(it: HistoryItem) {
  if (!it.event_start) return '일정 미정'
  const range = it.event_end && it.event_end !== it.event_start ? `${it.event_start} ~ ${it.event_end}` : it.event_start
  return it.event_time ? `${range} (${it.event_time})` : range
}

function computeRoleHistory(roleCode: string, items: HistoryItem[]) {
  const matched = items.filter(it => matchesRoleName(it.role_name, roleCode))
  const decided = matched.filter(it => it.outcome !== 'pending')
  const won = decided.filter(it => it.outcome === 'won')
  const winRate = decided.length > 0 ? Math.round((won.length / decided.length) * 100) : null
  const bucketMap = new Map<number, { total: number; won: number; items: HistoryItem[] }>()
  matched.forEach(it => {
    const b = priceBucket(it.unit_price)
    if (!bucketMap.has(b)) bucketMap.set(b, { total: 0, won: 0, items: [] })
    const rec = bucketMap.get(b)!
    rec.total++
    if (it.outcome === 'won') rec.won++
    rec.items.push(it)
  })
  const buckets = Array.from(bucketMap.entries()).map(([price, v]) => ({ price, ...v })).sort((a, b) => a.price - b.price)
  const wonPrices = won.map(w => w.unit_price)
  const avgWonPrice = wonPrices.length > 0 ? Math.round(wonPrices.reduce((s, p) => s + p, 0) / wonPrices.length) : null
  const recentWon = [...won].sort((a, b) => (b.event_start || '').localeCompare(a.event_start || ''))[0] || null
  return { matched, decided, won, winRate, buckets, avgWonPrice, recentWon }
}

// 전체 직종 x 가격대(10만원 단위) 체결율 매트릭스 — "전체보기" 매트릭스 뷰 전용
function computeAllRolesMatrix(roles: RoleRow[], items: HistoryItem[]) {
  const perRole = roles.map(r => {
    const matched = items.filter(it => matchesRoleName(it.role_name, r.role_code))
    const cellMap = new Map<number, { total: number; won: number; lost: number }>()
    matched.forEach(it => {
      const b = priceBucketCoarse(it.unit_price)
      if (!cellMap.has(b)) cellMap.set(b, { total: 0, won: 0, lost: 0 })
      const c = cellMap.get(b)!
      c.total++
      if (it.outcome === 'won') c.won++
      if (it.outcome === 'lost') c.lost++
    })
    return { role: r, cellMap, total: matched.length }
  })
  const allBuckets = new Set<number>()
  perRole.forEach(p => p.cellMap.forEach((_, b) => allBuckets.add(b)))
  const buckets = Array.from(allBuckets).sort((a, b) => a - b)
  return { perRole, buckets }
}

// 숫자로 저장하는 필드 목록 (인라인 편집 시 타입 변환용)
const NUMBER_FIELDS = new Set(['base_price', 'pay_price', 'leader_bonus', 'base_hours', 'overtime_hourly', 'mgmt_rate', 'profit_rate', 'add_price', 'add_pay_price', 'market_avg_price', 'competitor_price', 'past_contract_price', 'price'])
// mgmt_rate/profit_rate는 0.06 같은 비율로 저장되지만 사람은 %로 입력/확인하는 게 편해서 별도 처리
const PERCENT_FIELDS = new Set(['mgmt_rate', 'profit_rate'])

interface EditTarget { table: 'sim_roles' | 'sim_factors' | 'sim_guides'; id: string; field: string; value: string }
type EditableValueComp = React.ComponentType<{ table: EditTarget['table']; id: string; field: string; value: unknown; suffix?: string }>

function marginColor(pct: number) {
  if (pct < 10) return 'text-red-600 bg-red-100'
  if (pct < 15) return 'text-amber-600 bg-amber-100'
  return 'text-emerald-700 bg-emerald-100'
}
// marginColor는 마진율(보통 10~30%대) 기준 임계값이라 0~100% 범위인 체결율에는 안 맞는다
// (체결율은 대부분 15% 이상이라 marginColor를 쓰면 사실상 다 초록색이 됨) — 별도 3분위 기준.
function winRateColor(pct: number) {
  if (pct < 40) return 'text-red-600 bg-red-100'
  if (pct < 70) return 'text-amber-600 bg-amber-100'
  return 'text-emerald-700 bg-emerald-100'
}

interface Props { onClose: () => void }

export default function PricingSimModal({ onClose }: Props) {
  const [roles, setRoles]     = useState<RoleRow[]>([])
  const [factors, setFactors] = useState<FactorRow[]>([])
  const [guides, setGuides]   = useState<GuideRow[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [isLeader, setIsLeader] = useState(false)
  const [qty, setQty] = useState(1)
  const [days, setDays] = useState(1)
  const [hours, setHours] = useState(8)
  const [daysPerWeek, setDaysPerWeek] = useState(5)
  const [attendancePerfect, setAttendancePerfect] = useState(true)
  const [tab, setTab] = useState<'calc' | 'edit' | 'market' | 'info' | 'history'>('calc')
  const [changer, setChanger] = useState('')
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'role' | 'dashboard'>('role')
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [expandedBucket, setExpandedBucket] = useState<number | null>(null)
  const [historyViewMode, setHistoryViewMode] = useState<'list' | 'graph' | 'matrix'>('list')
  const [matrixScope, setMatrixScope] = useState<'role' | 'all'>('role')

  async function loadHistory() {
    if (historyLoaded || historyLoading) return
    setHistoryLoading(true)
    try {
      const [items, inquiries] = await Promise.all([
        db.list<{ id: string; role_name: string; unit_price: number; quantity: number; days: number; inquiry_id: string | null }>(
          'estimate_items', { select: 'id,role_name,unit_price,quantity,days,inquiry_id', limit: 5000 }
        ),
        db.list<{ id: string; status: string; event_start: string | null; event_end: string | null; event_time: string | null; company_name: string | null }>(
          'inquiries', { select: 'id,status,event_start,event_end,event_time,company_name', limit: 5000 }
        ),
      ])
      const inqById = new Map(inquiries.map(i => [i.id, i]))
      const merged: HistoryItem[] = items
        .filter(it => it.role_name && it.inquiry_id && inqById.has(it.inquiry_id))
        .map(it => {
          const inq = inqById.get(it.inquiry_id as string)!
          return {
            id: it.id, role_name: it.role_name, unit_price: it.unit_price, quantity: it.quantity, days: it.days,
            status: inq.status, outcome: classifyOutcome(inq.status),
            event_start: inq.event_start, event_end: inq.event_end, event_time: inq.event_time,
            company_name: inq.company_name,
          }
        })
      setHistoryItems(merged)
      setHistoryLoaded(true)
    } catch {
      toast.error('체결 히스토리 조회 실패')
    } finally {
      setHistoryLoading(false)
    }
  }

  async function loadAll() {
    setLoading(true)
    try {
      const [r, f, g] = await Promise.all([
        db.list<RoleRow>('sim_roles', { order: 'role_name', asc: true }),
        db.list<FactorRow>('sim_factors', { order: 'factor_name', asc: true }),
        db.list<GuideRow>('sim_guides', { order: 'id', asc: true }),
      ])
      const sortedRoles = sortRoles(r)
      setRoles(sortedRoles)
      setFactors(f)
      setGuides(g)
      if (sortedRoles.length > 0 && !selectedRoleId) setSelectedRoleId(sortedRoles[0].id)
    } catch {
      toast.error('단가 데이터 조회 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const role = roles.find(r => r.id === selectedRoleId) || null
  const roleFactors = factors.filter(f => f.role_id === selectedRoleId)
  const commonFactors = factors.filter(f => f.role_id === null)
  const allFactors = [...roleFactors, ...commonFactors]
  const manualFactors = allFactors.filter(f => f.rule_type === 'flat' || f.rule_type === 'percent')
  const tierFactors = allFactors.filter(f => f.rule_type === 'tier_qty' || f.rule_type === 'tier_duration')
  const roleGuideMain = guides.find(g => g.role_id === selectedRoleId && !g.label) || null
  const roleGuideExtra = guides.filter(g => g.role_id === selectedRoleId && g.label)
  const meta = role ? JOB_META[role.role_code] : null

  function selectRole(id: string) {
    setSelectedRoleId(id)
    setViewMode('role')
    setChecked(new Set())
    setIsLeader(false)
    setQty(1); setDays(1)
    const r = roles.find(x => x.id === id)
    setHours(r?.base_hours || 8)
  }

  function toggleFactor(id: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // ── 가격 계산 (checkedSet을 인자로 받아 "이 옵션 체크 시 마진" 미리보기에도 재사용) ──
  function calcPrice(checkedSet: Set<string>) {
    if (!role) return {
      crew: 0, client: 0, margin: 0, sub: 0, mgmt: 0, profit: 0, varAdd: 0, fcTotal: 0, leaderAdd: 0, overtimeAdd: 0,
      autoApplied: [] as { factor: FactorRow; amount: number }[],
      weeklyHours: 0, weeklyEligible: false, hourlyWage: 0, weeklyAllowance: 0,
    }
    let varAdd = 0, payAdd = 0
    manualFactors.filter(f => checkedSet.has(f.id)).forEach(f => {
      if (f.rule_type === 'flat') { varAdd += f.add_price; payAdd += f.add_pay_price }
      else {
        varAdd += Math.round(role.base_price * (f.rule_params?.pct || 0))
        payAdd += Math.round(role.pay_price * (f.rule_params?.pay_pct || 0))
      }
    })
    const autoApplied: { factor: FactorRow; amount: number }[] = []
    tierFactors.forEach(f => {
      const matches = f.rule_type === 'tier_qty'
        ? qty >= (f.rule_params?.min_qty ?? Infinity)
        : days >= (f.rule_params?.min_days ?? Infinity)
      if (matches) {
        const amt = Math.round(role.base_price * (f.rule_params?.pct || 0))
        const payAmt = Math.round(role.pay_price * (f.rule_params?.pay_pct || 0))
        varAdd += amt
        payAdd += payAmt
        autoApplied.push({ factor: f, amount: amt })
      }
    })
    const fcTotal = (role.fixed_costs || []).reduce((s, f) => s + f.a, 0)
    const leaderAdd = isLeader ? role.leader_bonus : 0
    const overtimeHours = Math.max(0, hours - (role.base_hours || 8))
    const overtimeAdd = overtimeHours * (role.overtime_hourly || 0)

    // 주휴수당 (근로기준법 §55) — 1주 소정근로시간 15시간 이상 + 개근 시 발생
    // 주휴수당 = 시급 × (min(주 소정근로시간,40)/40) × 8, 시급은 이번 견적의 일급(옵션 반영)÷근무시간으로 근사
    const weeklyHours = daysPerWeek * hours
    const weeklyEligible = weeklyHours >= 15 && attendancePerfect
    const dailyPayBeforeAllowance = role.pay_price + payAdd
    const hourlyWage = hours > 0 ? dailyPayBeforeAllowance / hours : 0
    const weeklyAllowance = weeklyEligible ? Math.round(hourlyWage * (Math.min(weeklyHours, 40) / 40) * 8) : 0

    const sub = role.base_price + varAdd + fcTotal + leaderAdd + overtimeAdd + weeklyAllowance
    const mgmt = Math.round(sub * (role.mgmt_rate ?? 0.06))
    const profit = Math.round(sub * (role.profit_rate ?? 0.10))
    const client = sub + mgmt + profit
    const crew = role.pay_price + payAdd + weeklyAllowance
    return { crew, client, margin: client - crew, sub, mgmt, profit, varAdd, fcTotal, leaderAdd, overtimeAdd, autoApplied, weeklyHours, weeklyEligible, hourlyWage, weeklyAllowance }
  }
  const P = calcPrice(checked)
  const marginPct = P.client > 0 ? Math.round((P.margin / P.client) * 100) : 0
  const uncheckedAlerts = manualFactors.filter(f => f.alert && !checked.has(f.id))

  function marginDeltaIfToggled(f: FactorRow) {
    const hypothetical = new Set(checked)
    if (hypothetical.has(f.id)) hypothetical.delete(f.id); else hypothetical.add(f.id)
    const hp = calcPrice(hypothetical)
    const hpct = hp.client > 0 ? Math.round((hp.margin / hp.client) * 100) : 0
    return hpct - marginPct
  }

  // ── 인라인 편집 + 이력 기록 (수정자 이름은 선택사항 — 미입력 시 '미기재'로 기록) ──
  function startEdit(table: EditTarget['table'], id: string, field: string, currentVal: unknown) {
    const display = currentVal === null || currentVal === undefined ? ''
      : PERCENT_FIELDS.has(field) ? String((currentVal as number) * 100)
      : String(currentVal)
    setEditing({ table, id, field, value: display })
  }

  async function logHistory(table: string, id: string, field: string, oldVal: unknown, newVal: unknown) {
    await db.insert('pricing_history', {
      table_name: table, row_id: id, field_name: field,
      old_value: oldVal === null || oldVal === undefined ? null : String(oldVal),
      new_value: newVal === null || newVal === undefined ? null : String(newVal),
      changed_by: changer.trim() || '미기재',
    })
  }

  async function saveEdit() {
    if (!editing) return
    const { table, id, field, value } = editing

    const list = table === 'sim_roles' ? roles : table === 'sim_factors' ? factors : guides
    const original = (list as { id: string }[]).find(r => r.id === id) as Record<string, unknown> | undefined
    if (!original) return
    const oldVal = original[field]

    let parsedVal: unknown = value
    if (NUMBER_FIELDS.has(field)) {
      parsedVal = value === '' ? 0 : Number(value)
      if (isNaN(parsedVal as number)) { toast.error('숫자 형식이 올바르지 않습니다.'); return }
      if (PERCENT_FIELDS.has(field)) parsedVal = (parsedVal as number) / 100
    } else if (value === '') {
      parsedVal = null
    }

    try {
      await db.update(table, id, { [field]: parsedVal })
      await logHistory(table, id, field, oldVal, parsedVal)
      if (table === 'sim_roles') setRoles(prev => prev.map(r => r.id === id ? { ...r, [field]: parsedVal } : r))
      if (table === 'sim_factors') setFactors(prev => prev.map(r => r.id === id ? { ...r, [field]: parsedVal } : r))
      if (table === 'sim_guides') setGuides(prev => prev.map(r => r.id === id ? { ...r, [field]: parsedVal } : r))
      toast.success('저장됐습니다.')
      setEditing(null)
    } catch {
      toast.error('저장 실패')
    }
  }

  async function togglePublished(r: RoleRow) {
    const next = !r.is_published
    try {
      await db.update('sim_roles', r.id, { is_published: next })
      await logHistory('sim_roles', r.id, 'is_published', r.is_published, next)
      setRoles(prev => prev.map(x => x.id === r.id ? { ...x, is_published: next } : x))
      toast.success(next ? '발행됨 — 검토 완료로 표시됩니다. (실제 견적서 작성 화면에는 영향 없음)' : '발행 취소됨 — 다시 초안으로 표시됩니다.')
    } catch {
      toast.error('저장 실패')
    }
  }

  // ── 고정 원가(fixed_costs) 편집 — roles.fixed_costs는 JSONB 배열이라 컬럼 하나로
  // 다루는 EditableValue로는 표현이 안 돼서 전용 함수로 배열 전체를 갱신한다 ──
  async function saveFixedCosts(r: RoleRow, next: FixedCost[]) {
    try {
      await db.update('sim_roles', r.id, { fixed_costs: next })
      await logHistory('sim_roles', r.id, 'fixed_costs', JSON.stringify(r.fixed_costs), JSON.stringify(next))
      setRoles(prev => prev.map(x => x.id === r.id ? { ...x, fixed_costs: next } : x))
    } catch {
      toast.error('저장 실패')
    }
  }
  function addFixedCost(r: RoleRow) { saveFixedCosts(r, [...(r.fixed_costs || []), { l: '새 고정원가', a: 0 }]) }
  function updateFixedCostLabel(r: RoleRow, i: number, l: string) { saveFixedCosts(r, r.fixed_costs.map((fc, idx) => idx === i ? { ...fc, l } : fc)) }
  function updateFixedCostAmount(r: RoleRow, i: number, a: number) { saveFixedCosts(r, r.fixed_costs.map((fc, idx) => idx === i ? { ...fc, a } : fc)) }
  function deleteFixedCost(r: RoleRow, i: number) { saveFixedCosts(r, r.fixed_costs.filter((_, idx) => idx !== i)) }

  async function updateFactorRule(f: FactorRow, ruleType: RuleType, params: RuleParams) {
    try {
      await db.update('sim_factors', f.id, { rule_type: ruleType, rule_params: params })
      await logHistory('sim_factors', f.id, 'rule_type', f.rule_type, ruleType)
      setFactors(prev => prev.map(x => x.id === f.id ? { ...x, rule_type: ruleType, rule_params: params } : x))
    } catch {
      toast.error('저장 실패')
    }
  }

  async function updateFactorLevel(f: FactorRow, level: string) {
    try {
      await db.update('sim_factors', f.id, { level })
      await logHistory('sim_factors', f.id, 'level', f.level, level)
      setFactors(prev => prev.map(x => x.id === f.id ? { ...x, level } : x))
    } catch {
      toast.error('저장 실패')
    }
  }

  async function addFactor(roleId: string | null) {
    try {
      const rows = await db.insert<FactorRow>('sim_factors', {
        role_id: roleId, factor_name: '새 옵션', add_price: 0, add_pay_price: 0,
        level: '기본', rule_type: 'flat', rule_params: {},
      })
      setFactors(prev => [...prev, ...rows])
    } catch {
      toast.error('추가 실패')
    }
  }

  async function deleteFactor(id: string) {
    if (!confirm('이 옵션을 삭제할까요?')) return
    try {
      await db.delete('sim_factors', id)
      setFactors(prev => prev.filter(f => f.id !== id))
    } catch {
      toast.error('삭제 실패')
    }
  }

  async function addMarketEntry() {
    if (!role) return
    try {
      const rows = await db.insert<GuideRow>('sim_guides', {
        role_id: role.id, label: '새 항목', price: 0,
        surveyed_at: new Date().toISOString().slice(0, 10),
      })
      setGuides(prev => [...prev, ...rows])
    } catch {
      toast.error('추가 실패')
    }
  }

  async function deleteMarketEntry(id: string) {
    if (!confirm('이 시장 조사 항목을 삭제할까요?')) return
    try {
      await db.delete('sim_guides', id)
      setGuides(prev => prev.filter(g => g.id !== id))
    } catch {
      toast.error('삭제 실패')
    }
  }

  // ── 편집 가능한 값 렌더 (클릭하면 인라인 편집) ─────────────
  const EditableValue: EditableValueComp = ({ table, id, field, value, suffix = '' }) => {
    const isEditingThis = editing && editing.table === table && editing.id === id && editing.field === field
    if (isEditingThis) {
      return (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={editing!.value}
            onChange={e => setEditing(prev => prev ? { ...prev, value: e.target.value } : null)}
            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null) }}
            className="border border-blue-400 rounded px-1.5 py-0.5 text-sm w-28 focus:outline-none"
          />
          <button onClick={saveEdit} className="text-blue-600 hover:text-blue-800"><Save className="h-3.5 w-3.5" /></button>
        </span>
      )
    }
    return (
      <button
        onClick={() => startEdit(table, id, field, value)}
        className="underline decoration-dotted decoration-gray-300 hover:decoration-blue-400 hover:text-blue-600 text-left"
        title="클릭해서 수정"
      >
        {PERCENT_FIELDS.has(field) ? `${Math.round((value as number) * 1000) / 10}%`
          : NUMBER_FIELDS.has(field) ? fmt(value as number) : String(value ?? '—')}{suffix}
      </button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex flex-col" style={{ zIndex: 9999 }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-rose-700 to-orange-700 shrink-0">
        <div>
          <h2 className="text-lg font-extrabold text-white">💰 가디어스 단가 시뮬레이터</h2>
          <p className="text-rose-100 text-xs mt-0.5">11개 직종 견적 계산 · 단가 편집 · 시장 단가 비교 (스마트연구소 · BETA)</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadAll} disabled={loading} className="text-rose-100 hover:text-white p-1.5 rounded-lg disabled:opacity-40">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={onClose} className="text-rose-100 hover:text-white p-1.5 rounded-lg"><X className="h-5 w-5" /></button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden bg-gray-50">
        {/* 좌측: 직종 선택 */}
        <div className="w-56 shrink-0 bg-white border-r border-gray-200 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-400 text-sm">불러오는 중...</div>
          ) : roles.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-xs">데이터가 없습니다.<br />마이그레이션 시드가 적용됐는지 확인해 주세요.</div>
          ) : (
            <nav className="py-2">
              <button
                onClick={() => { setViewMode('dashboard'); loadHistory() }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                  viewMode === 'dashboard' ? 'bg-blue-50 border-l-4 border-blue-500 text-blue-700' : 'border-l-4 border-transparent text-gray-600 hover:bg-gray-50'
                }`}
              >
                <BarChart3 className="h-4 w-4" />📊 전체 대시보드
              </button>
              <div className="border-b border-gray-100 my-1" />
              {roles.map(r => {
                const m = JOB_META[r.role_code]
                return (
                  <button
                    key={r.id}
                    onClick={() => selectRole(r.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                      viewMode === 'role' && selectedRoleId === r.id ? 'bg-rose-50 border-l-4 border-rose-500 font-semibold' : 'border-l-4 border-transparent hover:bg-gray-50'
                    }`}
                  >
                    <span>{m?.emoji || '👤'}</span>
                    <span className="flex-1 truncate">{r.role_name}</span>
                    {!r.is_published && <span className="text-[10px] bg-gray-200 text-gray-500 rounded px-1.5 py-0.5">초안</span>}
                  </button>
                )
              })}
            </nav>
          )}
        </div>

        {/* 우측: 본문 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {viewMode === 'dashboard' ? (
            <div className="flex-1 overflow-y-auto p-5">
              <DashboardView roles={roles} factors={factors} guides={guides} onSelectRole={selectRole}
                onViewHistory={id => { selectRole(id); setTab('history') }}
                historyItems={historyItems} historyLoading={historyLoading} />
            </div>
          ) : role && (
            <>
              {/* 탭 */}
              <div className="flex items-center gap-1 px-4 pt-3 bg-white border-b border-gray-200 shrink-0">
                <TabBtn active={tab === 'calc'} onClick={() => setTab('calc')} icon={<Calculator className="h-3.5 w-3.5" />} label="견적 계산" />
                <TabBtn active={tab === 'info'} onClick={() => setTab('info')} icon={<Info className="h-3.5 w-3.5" />} label="업무 안내" />
                <TabBtn active={tab === 'edit'} onClick={() => setTab('edit')} icon={<Pencil className="h-3.5 w-3.5" />} label="단가 편집" />
                <TabBtn active={tab === 'market'} onClick={() => setTab('market')} icon={<BarChart3 className="h-3.5 w-3.5" />} label="시장 단가" />
                <TabBtn active={tab === 'history'} onClick={() => { setTab('history'); loadHistory() }} icon={<History className="h-3.5 w-3.5" />} label="체결 히스토리" />
                <div className="flex-1" />
                <label className={`text-xs px-2.5 py-1.5 rounded-full font-semibold ${role.is_published ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                  {role.is_published ? '발행됨 (검토 완료)' : '초안 (검토 중)'}
                </label>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {tab === 'calc' && (
                  <div className="max-w-2xl space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{meta?.emoji}</span>
                      <h3 className="text-base font-bold text-gray-800">{role.role_name}</h3>
                      {meta && <span className="text-xs rounded-full px-2 py-0.5" style={{ background: meta.cb, color: meta.cc }}>{meta.cat}</span>}
                      <div className="flex-1" />
                      <span className="text-xs text-gray-400">청구 기본가</span>
                      <span className="text-sm font-extrabold text-gray-800">{fmt(role.base_price)}원</span>
                      <span className="text-xs text-gray-300">/</span>
                      <span className="text-xs text-gray-400">지급 기본가</span>
                      <span className="text-sm font-bold text-gray-500">{fmt(role.pay_price)}원</span>
                    </div>

                    {uncheckedAlerts.length > 0 && (
                      <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>
                          <b>법적 의무/주의 조건 미체크:</b> {uncheckedAlerts.map(f => `${f.factor_name} (${f.alert})`).join(' · ')}
                        </div>
                      </div>
                    )}

                    {role.leader_bonus > 0 && (
                      <label className="flex items-center gap-2 text-sm bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 cursor-pointer">
                        <input type="checkbox" checked={isLeader} onChange={() => setIsLeader(v => !v)} />
                        팀장·수퍼바이저 배정 (+{fmt(role.leader_bonus)}원)
                      </label>
                    )}

                    {/* 조건 입력: 근무시간 / 인원 / 일수 */}
                    <div className="grid grid-cols-3 gap-3 bg-white border border-gray-200 rounded-xl p-3">
                      <NumberField label={`근무시간 (기준 ${role.base_hours || 8}H)`} value={hours} onChange={setHours} />
                      <NumberField label="투입 인원 (인원 조건용)" value={qty} onChange={setQty} />
                      <NumberField label="투입 일수 (기간 조건용)" value={days} onChange={setDays} />
                    </div>
                    {P.autoApplied.length > 0 && (
                      <div className="text-xs bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-blue-700">
                        자동 적용된 조건: {P.autoApplied.map(a => `${a.factor.factor_name} (${a.amount < 0 ? '' : '+'}${fmt(a.amount)}원)`).join(' · ')}
                      </div>
                    )}

                    {/* 주휴수당 체크 (근로기준법 §55) */}
                    <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-600">주휴수당 체크 (근로기준법 §55)</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${P.weeklyEligible ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400'}`}>
                          {P.weeklyEligible ? '발생' : '미발생'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 items-end">
                        <NumberField label="주당 근무일수" value={daysPerWeek} onChange={setDaysPerWeek} />
                        <label className="flex items-center gap-2 text-xs text-gray-600 pb-1.5">
                          <input type="checkbox" checked={attendancePerfect} onChange={() => setAttendancePerfect(v => !v)} />
                          결근 없이 개근 (가정)
                        </label>
                      </div>
                      <p className="text-xs text-gray-500">
                        주 소정근로시간 {P.weeklyHours}시간
                        {P.weeklyHours < 15 ? ' — 15시간 미만이라 주휴수당 대상 아님' : !attendancePerfect ? ' — 개근하지 않으면 발생하지 않음' : (
                          <> · 시급 환산 약 {fmt(P.hourlyWage)}원 · <b className="text-gray-700">주휴수당 {fmt(P.weeklyAllowance)}원</b> (아래 견적에 반영됨)</>
                        )}
                      </p>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 text-xs">
                          <tr><th className="w-8 py-2"></th><th className="text-left py-2">레벨</th><th className="text-left py-2">가산 옵션</th><th className="text-right py-2">단가 영향</th><th className="text-right py-2 pr-3">마진 변화</th></tr>
                        </thead>
                        <tbody>
                          {manualFactors.length === 0 && (
                            <tr><td colSpan={5} className="text-center text-gray-400 text-xs py-4">등록된 가산 옵션이 없습니다.</td></tr>
                          )}
                          {manualFactors.map(f => {
                            const amount = f.rule_type === 'flat' ? f.add_price : Math.round(role.base_price * (f.rule_params?.pct || 0))
                            const delta = marginDeltaIfToggled(f)
                            const isExpanded = expandedId === f.id
                            return (
                              <Fragment key={f.id}>
                                <tr className={checked.has(f.id) ? 'bg-rose-50/60' : ''}>
                                  <td className="text-center"><input type="checkbox" checked={checked.has(f.id)} onChange={() => toggleFactor(f.id)} /></td>
                                  <td className="py-1.5"><LevelBadge level={f.level} /></td>
                                  <td className="py-1.5">
                                    <button onClick={() => setExpandedId(isExpanded ? null : f.id)} className="inline-flex items-center gap-1 text-left hover:text-rose-600">
                                      {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                                      {f.factor_name}
                                    </button>
                                    {f.role_id === null && <span className="ml-1.5 text-[10px] bg-violet-100 text-violet-600 rounded px-1.5 py-0.5">공통</span>}
                                    {f.rule_type === 'percent' && <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-600 rounded px-1.5 py-0.5">정률</span>}
                                    {f.alert && <span className="ml-1.5 text-[10px] bg-red-100 text-red-600 rounded px-1.5 py-0.5">{f.alert}</span>}
                                  </td>
                                  <td className="text-right py-1.5 font-semibold text-gray-700">{amount < 0 ? '' : '+'}{fmt(amount)}원</td>
                                  <td className={`text-right pr-3 py-1.5 text-xs ${delta === 0 ? 'text-gray-300' : delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {delta === 0 ? '—' : `${delta > 0 ? '▲' : '▼'}${Math.abs(delta)}%p`}
                                  </td>
                                </tr>
                                {isExpanded && (
                                  <tr className="bg-gray-50">
                                    <td></td>
                                    <td colSpan={4} className="text-xs text-gray-500 py-2 pr-3">{f.description || '상세 설명이 아직 없습니다. 단가 편집 탭에서 추가할 수 있어요.'}</td>
                                  </tr>
                                )}
                              </Fragment>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="grid grid-cols-3 gap-3 text-center mb-4">
                        <div>
                          <div className="text-xs text-gray-400">크루 지급 단가</div>
                          <div className="text-lg font-extrabold text-gray-800">{fmt(P.crew)}원</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400">클라이언트 청구가</div>
                          <div className="text-lg font-extrabold text-emerald-600">{fmt(P.client)}원</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400">예상 마진</div>
                          <div className="text-lg font-extrabold text-gray-800 flex items-center justify-center gap-1.5">
                            {fmt(P.margin)}원
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${marginColor(marginPct)}`}>{marginPct}%</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 space-y-0.5 border-t border-gray-100 pt-3">
                        <Row label="기본 단가 (기준시간 요율)" val={role.base_price} />
                        {P.leaderAdd > 0 && <Row label="팀장 가산" val={P.leaderAdd} />}
                        {P.varAdd !== 0 && <Row label="옵션/조건 가산·할인 합계" val={P.varAdd} />}
                        {P.overtimeAdd > 0 && <Row label={`기준시간 초과 (${hours - (role.base_hours || 8)}H × ${fmt(role.overtime_hourly)}원)`} val={P.overtimeAdd} />}
                        {P.weeklyAllowance > 0 && <Row label="주휴수당 (근로기준법 §55)" val={P.weeklyAllowance} />}
                        {(role.fixed_costs || []).map((fc, i) => <Row key={i} label={`${fc.l} (고정 원가)`} val={fc.a} />)}
                        <Row label="소계" val={P.sub} bold />
                        <Row label={`일반관리비 (${Math.round((role.mgmt_rate ?? 0.06) * 1000) / 10}%)`} val={P.mgmt} />
                        <Row label={`이익 (${Math.round((role.profit_rate ?? 0.10) * 1000) / 10}%)`} val={P.profit} />
                        <Row label="최종 청구가 (VAT 별도, 1인 기준)" val={P.client} bold big />
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-400">수치는 팀이 스마트연구소에서 직접 입력·관리하는 참고값입니다. 1인 단가 기준이며 VAT 별도.</p>
                  </div>
                )}

                {tab === 'info' && meta && (
                  <div className="max-w-2xl space-y-4">
                    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
                      <h4 className="text-sm font-bold text-gray-700">이 직종이 하는 일</h4>
                      <p className="text-sm text-gray-600">{meta.what}</p>
                      <p className="text-amber-700 bg-amber-50 rounded px-2 py-1.5 text-xs">⚠️ {meta.confuse}</p>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <h4 className="text-sm font-bold text-gray-700 mb-2">준비사항 체크리스트</h4>
                      <p className="text-[11px] text-gray-400 mb-2"><span className="bg-red-100 text-red-600 rounded px-1.5 py-0.5 mr-1">필수</span>는 반드시 확인, 나머지는 권장</p>
                      <ul className="space-y-2">
                        {meta.prep.map((p, i) => (
                          <li key={i} className="flex gap-2 text-sm">
                            <span>{p.i}</span>
                            <span>
                              {p.m && <span className="bg-red-100 text-red-600 text-[10px] rounded px-1.5 py-0.5 mr-1">필수</span>}
                              {p.t}
                              <br /><span className="text-xs text-gray-400">{p.n}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {meta.staffCriteria.map((g, i) => (
                        <div key={i} className="bg-white border border-gray-200 rounded-xl p-4">
                          <h4 className="text-sm font-bold text-gray-700 mb-2">{g.t}</h4>
                          <ul className="space-y-1 text-sm">
                            {g.items.map((it, j) => (
                              <li key={j} className="flex items-center gap-1.5">
                                <span className={it.m ? 'text-emerald-600' : 'text-gray-300'}>●</span>{it.t}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {tab === 'edit' && (
                  <div className="max-w-4xl space-y-4">
                    <ChangerInput changer={changer} setChanger={setChanger} />
                    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-gray-700">{role.role_name} — 기본 단가</h4>
                        <button
                          onClick={() => togglePublished(role)}
                          className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold ${
                            role.is_published ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                          }`}
                        >
                          <ShieldAlert className="h-3.5 w-3.5" />
                          {role.is_published ? '발행됨 · 클릭해서 초안으로' : '초안 · 클릭해서 발행'}
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <Field label="고객 청구 기본가">
                          <EditableValue table="sim_roles" id={role.id} field="base_price" value={role.base_price} suffix="원" />
                        </Field>
                        <Field label="크루 지급 기본가">
                          <EditableValue table="sim_roles" id={role.id} field="pay_price" value={role.pay_price} suffix="원" />
                        </Field>
                        <Field label="팀장 가산">
                          <EditableValue table="sim_roles" id={role.id} field="leader_bonus" value={role.leader_bonus} suffix="원" />
                        </Field>
                        <Field label="기준 근무시간">
                          <EditableValue table="sim_roles" id={role.id} field="base_hours" value={role.base_hours} suffix="시간" />
                        </Field>
                        <Field label="기준시간 초과 1시간당 추가 청구가">
                          <EditableValue table="sim_roles" id={role.id} field="overtime_hourly" value={role.overtime_hourly} suffix="원" />
                        </Field>
                        <Field label="일반관리비율">
                          <EditableValue table="sim_roles" id={role.id} field="mgmt_rate" value={role.mgmt_rate} />
                        </Field>
                        <Field label="이익률">
                          <EditableValue table="sim_roles" id={role.id} field="profit_rate" value={role.profit_rate} />
                        </Field>
                      </div>

                      <div className="border-t border-gray-100 pt-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-gray-600">고정 원가 (항상 더해지는 원가 항목)</span>
                          <button onClick={() => addFixedCost(role)} className="flex items-center gap-1 text-xs bg-rose-600 text-white px-2 py-1 rounded-lg hover:bg-rose-700">
                            <Plus className="h-3 w-3" />항목 추가
                          </button>
                        </div>
                        {(role.fixed_costs || []).length === 0 ? (
                          <p className="text-xs text-gray-400">고정 원가 항목이 없습니다.</p>
                        ) : (
                          <ul className="space-y-1.5">
                            {role.fixed_costs.map((fc, i) => (
                              <li key={i} className="flex items-center gap-2 text-sm">
                                <input
                                  defaultValue={fc.l}
                                  onBlur={e => updateFixedCostLabel(role, i, e.target.value)}
                                  className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-rose-400"
                                />
                                <input
                                  type="number"
                                  defaultValue={fc.a}
                                  onBlur={e => updateFixedCostAmount(role, i, Number(e.target.value) || 0)}
                                  className="w-24 border border-gray-200 rounded px-2 py-1 text-xs text-right focus:outline-none focus:border-rose-400"
                                />
                                <span className="text-xs text-gray-400">원</span>
                                <button onClick={() => deleteFixedCost(role, i)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    <FactorTable
                      title={`${role.role_name} 전용 옵션`}
                      list={roleFactors}
                      onAdd={() => addFactor(role.id)}
                      onDelete={deleteFactor}
                      onSaveRule={updateFactorRule}
                      onSaveLevel={updateFactorLevel}
                      EditableValue={EditableValue}
                      expandedId={expandedId} setExpandedId={setExpandedId}
                    />
                    <FactorTable
                      title="공통 옵션 (모든 직종에 적용 — 예: 교통비 지원)"
                      list={commonFactors}
                      onAdd={() => addFactor(null)}
                      onDelete={deleteFactor}
                      onSaveRule={updateFactorRule}
                      onSaveLevel={updateFactorLevel}
                      EditableValue={EditableValue}
                      expandedId={expandedId} setExpandedId={setExpandedId}
                    />
                  </div>
                )}

                {tab === 'market' && (
                  <div className="max-w-2xl space-y-4">
                    <ChangerInput changer={changer} setChanger={setChanger} />
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <h4 className="text-sm font-bold text-gray-700 mb-3">{role.role_name} — 대표 시장 단가</h4>
                      {roleGuideMain ? (
                        <div className="space-y-3 text-sm">
                          <div className="grid grid-cols-2 gap-4">
                            <Field label="지킴 (경쟁사) 단가">
                              <EditableValue table="sim_guides" id={roleGuideMain.id} field="competitor_price" value={roleGuideMain.competitor_price} suffix="원" />
                            </Field>
                            <Field label="시장 평균">
                              <EditableValue table="sim_guides" id={roleGuideMain.id} field="market_avg_price" value={roleGuideMain.market_avg_price} suffix="원" />
                            </Field>
                          </div>
                          <Field label="비고 / 조사 메모">
                            <EditableValue table="sim_guides" id={roleGuideMain.id} field="consult_points" value={roleGuideMain.consult_points ?? ''} />
                          </Field>
                          <Field label="과거 체결가 (참고)">
                            <EditableValue table="sim_guides" id={roleGuideMain.id} field="past_contract_price" value={roleGuideMain.past_contract_price} suffix="원" />
                          </Field>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">이 직종은 아직 대표 시장 데이터가 없습니다.</p>
                      )}
                    </div>

                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-bold text-gray-700">추가 시장 조사 기록</h4>
                        <button onClick={addMarketEntry} className="flex items-center gap-1 text-xs bg-rose-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-rose-700">
                          <Plus className="h-3.5 w-3.5" />항목 추가
                        </button>
                      </div>
                      {roleGuideExtra.length === 0 ? (
                        <p className="text-xs text-gray-400">아직 추가 항목이 없습니다. 경쟁사별·조사시점별로 자유롭게 추가하세요.</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead className="text-gray-400 text-xs">
                            <tr><th className="text-left py-1">항목명</th><th className="text-left py-1">단가</th><th className="text-left py-1">조사일자</th><th className="text-left py-1">메모</th><th></th></tr>
                          </thead>
                          <tbody>
                            {roleGuideExtra.map(g => (
                              <tr key={g.id} className="border-t border-gray-100">
                                <td className="py-1.5"><EditableValue table="sim_guides" id={g.id} field="label" value={g.label} /></td>
                                <td className="py-1.5"><EditableValue table="sim_guides" id={g.id} field="price" value={g.price} suffix="원" /></td>
                                <td className="py-1.5"><EditableValue table="sim_guides" id={g.id} field="surveyed_at" value={g.surveyed_at} /></td>
                                <td className="py-1.5"><EditableValue table="sim_guides" id={g.id} field="consult_points" value={g.consult_points ?? ''} /></td>
                                <td className="py-1.5 text-right pr-1">
                                  <button onClick={() => deleteMarketEntry(g.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )}

                {tab === 'history' && (
                  <div className={historyViewMode === 'matrix' && matrixScope === 'all' ? 'max-w-full space-y-4' : 'max-w-3xl space-y-4'}>
                    <p className="text-[11px] text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                      실제 ERP 견적 데이터에서 품목명 텍스트로 근사 매칭한 참고 자료입니다. 완전히 정확하지 않을 수 있으니 아래 목록의 원문 품목명으로 직접 확인해 주세요.
                    </p>
                    <div className="flex items-center justify-between">
                      <ViewSwitchTabs value={historyViewMode} onChange={setHistoryViewMode} options={[
                        { value: 'list', label: '목록형', icon: <List className="h-3.5 w-3.5" /> },
                        { value: 'graph', label: '그래프형', icon: <BarChart3 className="h-3.5 w-3.5" /> },
                        { value: 'matrix', label: '매트릭스형', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
                      ]} />
                      {historyViewMode === 'matrix' && (
                        <ViewSwitchTabs value={matrixScope} onChange={setMatrixScope} options={[
                          { value: 'role', label: '이 직종만' },
                          { value: 'all', label: '전체 직종 비교' },
                        ]} />
                      )}
                    </div>
                    {historyLoading ? (
                      <p className="text-sm text-gray-400">불러오는 중...</p>
                    ) : !historyLoaded ? (
                      <p className="text-sm text-gray-400">데이터를 불러오지 못했습니다.</p>
                    ) : historyViewMode === 'list' ? (
                      <RoleHistoryView roleCode={role.role_code} items={historyItems}
                        expandedBucket={expandedBucket} setExpandedBucket={setExpandedBucket} />
                    ) : historyViewMode === 'graph' ? (
                      <RoleHistoryGraphView roleCode={role.role_code} items={historyItems} />
                    ) : matrixScope === 'role' ? (
                      <RoleMatrixView roleCode={role.role_code} items={historyItems} />
                    ) : (
                      <AllRolesMatrixView roles={roles} items={historyItems}
                        onSelectRole={id => { selectRole(id); setTab('history'); setMatrixScope('role') }} />
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 단가 편집 탭의 옵션 목록 (직종 전용 / 공통 공용) ────────
function FactorTable({ title, list, onAdd, onDelete, onSaveRule, onSaveLevel, EditableValue, expandedId, setExpandedId }: {
  title: string; list: FactorRow[]
  onAdd: () => void; onDelete: (id: string) => void
  onSaveRule: (f: FactorRow, ruleType: RuleType, params: RuleParams) => void
  onSaveLevel: (f: FactorRow, level: string) => void
  EditableValue: EditableValueComp
  expandedId: string | null; setExpandedId: (id: string | null) => void
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
        <h4 className="text-xs font-bold text-gray-600">{title}</h4>
        <button onClick={onAdd} className="flex items-center gap-1 text-xs bg-rose-600 text-white px-2 py-1 rounded-lg hover:bg-rose-700">
          <Plus className="h-3 w-3" />옵션 추가
        </button>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 text-xs">
          <tr>
            <th className="text-left py-2 pl-3">레벨</th><th className="text-left py-2">옵션명</th>
            <th className="text-left py-2">유형</th><th className="text-left py-2">조건/가산</th>
            <th className="text-left py-2">경고</th><th className="w-8"></th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 && (
            <tr><td colSpan={6} className="text-center text-gray-400 text-xs py-3">옵션이 없습니다.</td></tr>
          )}
          {list.map(f => (
            <FactorRuleEditor
              key={f.id} f={f} onSave={onSaveRule} onSaveLevel={onSaveLevel} onDelete={onDelete} EditableValue={EditableValue}
              expanded={expandedId === f.id} onToggleExpand={() => setExpandedId(expandedId === f.id ? null : f.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FactorRuleEditor({ f, onSave, onSaveLevel, onDelete, EditableValue, expanded, onToggleExpand }: {
  f: FactorRow
  onSave: (f: FactorRow, ruleType: RuleType, params: RuleParams) => void
  onSaveLevel: (f: FactorRow, level: string) => void
  onDelete: (id: string) => void
  EditableValue: EditableValueComp
  expanded: boolean; onToggleExpand: () => void
}) {
  const [ruleType, setRuleType] = useState<RuleType>(f.rule_type)
  const [pct, setPct] = useState(f.rule_params?.pct ?? 0)
  const [payPct, setPayPct] = useState(f.rule_params?.pay_pct ?? 0)
  const [minQty, setMinQty] = useState(f.rule_params?.min_qty ?? 5)
  const [minDays, setMinDays] = useState(f.rule_params?.min_days ?? 3)

  function buildParams(t: RuleType, o: Partial<{ pct: number; payPct: number; minQty: number; minDays: number }> = {}): RuleParams {
    const p = o.pct ?? pct, pp = o.payPct ?? payPct, mq = o.minQty ?? minQty, md = o.minDays ?? minDays
    if (t === 'percent') return { pct: p, pay_pct: pp }
    if (t === 'tier_qty') return { min_qty: mq, pct: p, pay_pct: pp }
    if (t === 'tier_duration') return { min_days: md, pct: p, pay_pct: pp }
    return {}
  }
  function handleTypeChange(t: RuleType) { setRuleType(t); onSave(f, t, buildParams(t)) }
  function commitPct(v: number) { setPct(v); onSave(f, ruleType, buildParams(ruleType, { pct: v })) }
  function commitPayPct(v: number) { setPayPct(v); onSave(f, ruleType, buildParams(ruleType, { payPct: v })) }
  function commitMinQty(v: string) { const n = Number(v) || 0; setMinQty(n); onSave(f, ruleType, buildParams(ruleType, { minQty: n })) }
  function commitMinDays(v: string) { const n = Number(v) || 0; setMinDays(n); onSave(f, ruleType, buildParams(ruleType, { minDays: n })) }

  return (
    <>
      <tr className="border-t border-gray-100 align-top">
        <td className="py-2 pl-3">
          <select value={f.level} onChange={e => onSaveLevel(f, e.target.value)} className="border border-gray-200 rounded px-1 py-0.5 text-xs">
            <option value="기본">기본</option>
            <option value="★">★</option>
            <option value="★★">★★</option>
          </select>
        </td>
        <td className="py-2">
          <span className="inline-flex items-center gap-1">
            <button onClick={onToggleExpand} className="text-gray-400 hover:text-rose-600">
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
            <EditableValue table="sim_factors" id={f.id} field="factor_name" value={f.factor_name} />
          </span>
        </td>
        <td className="py-2">
          <select value={ruleType} onChange={e => handleTypeChange(e.target.value as RuleType)} className="border border-gray-200 rounded px-1.5 py-0.5 text-xs">
            <option value="flat">정액가산</option>
            <option value="percent">정률(수동 체크)</option>
            <option value="tier_qty">인원수 조건(자동)</option>
            <option value="tier_duration">기간 조건(자동)</option>
          </select>
        </td>
        <td className="py-2">
          {ruleType === 'flat' && (
            <div className="flex flex-col gap-1 text-xs">
              <span>추가 청구가: <EditableValue table="sim_factors" id={f.id} field="add_price" value={f.add_price} suffix="원" /></span>
              <span>추가 지급가: <EditableValue table="sim_factors" id={f.id} field="add_pay_price" value={f.add_pay_price} suffix="원" /></span>
            </div>
          )}
          {ruleType === 'percent' && (
            <div className="flex flex-col gap-1">
              <SignedPctField label="청구가 기준" value={pct} onCommit={commitPct} />
              <SignedPctField label="지급가 기준" value={payPct} onCommit={commitPayPct} />
            </div>
          )}
          {ruleType === 'tier_qty' && (
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-1 text-xs">
                <input defaultValue={minQty} onBlur={e => commitMinQty(e.target.value)} className="w-12 border border-gray-200 rounded px-1 py-0.5" />명 이상 시
              </span>
              <SignedPctField label="청구가 기준" value={pct} onCommit={commitPct} />
              <SignedPctField label="지급가 기준" value={payPct} onCommit={commitPayPct} />
            </div>
          )}
          {ruleType === 'tier_duration' && (
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-1 text-xs">
                <input defaultValue={minDays} onBlur={e => commitMinDays(e.target.value)} className="w-12 border border-gray-200 rounded px-1 py-0.5" />일 이상 시
              </span>
              <SignedPctField label="청구가 기준" value={pct} onCommit={commitPct} />
              <SignedPctField label="지급가 기준" value={payPct} onCommit={commitPayPct} />
            </div>
          )}
        </td>
        <td className="py-2"><EditableValue table="sim_factors" id={f.id} field="alert" value={f.alert ?? ''} /></td>
        <td className="py-2 pr-2 text-right">
          <button onClick={() => onDelete(f.id)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50">
          <td></td>
          <td colSpan={5} className="py-2 pr-3">
            <div className="text-xs text-gray-500">
              상세 설명: <EditableValue table="sim_factors" id={f.id} field="description" value={f.description ?? ''} />
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// 할인/가산 방향을 명시적으로 고르는 정률 입력 — 부호를 직접 타이핑하지 않아도 됨
function SignedPctField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [mode, setMode] = useState<'discount' | 'surcharge'>(value < 0 ? 'discount' : 'surcharge')
  const [mag, setMag] = useState((Math.round(Math.abs(value) * 1000) / 10).toString())

  function commit(nextMode: 'discount' | 'surcharge' = mode, nextMag: string = mag) {
    const signed = (nextMode === 'discount' ? -1 : 1) * (Number(nextMag) || 0) / 100
    onCommit(signed)
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
      {label}
      <select value={mode} onChange={e => { const m = e.target.value as 'discount' | 'surcharge'; setMode(m); commit(m) }} className="border border-gray-200 rounded px-1 py-0.5">
        <option value="discount">할인</option>
        <option value="surcharge">가산</option>
      </select>
      <input value={mag} onChange={e => setMag(e.target.value)} onBlur={() => commit()} className="w-12 border border-gray-200 rounded px-1 py-0.5" />%
    </span>
  )
}

// ── 전체 대시보드: 11개 직종을 한 화면에서 매트릭스로 비교 ──
function DashboardView({ roles, factors, guides, onSelectRole, onViewHistory, historyItems, historyLoading }: {
  roles: RoleRow[]; factors: FactorRow[]; guides: GuideRow[]; onSelectRole: (id: string) => void
  onViewHistory: (id: string) => void; historyItems: HistoryItem[]; historyLoading: boolean
}) {
  const rows = roles.map(r => {
    const roleFactors = factors.filter(f => f.role_id === r.id)
    const legalCount = roleFactors.filter(f => f.alert).length
    const sub = r.base_price + (r.fixed_costs || []).reduce((s, f) => s + f.a, 0)
    const mgmt = Math.round(sub * (r.mgmt_rate ?? 0.06))
    const profit = Math.round(sub * (r.profit_rate ?? 0.10))
    const client = sub + mgmt + profit
    const margin = client - r.pay_price
    const marginPct = client > 0 ? Math.round((margin / client) * 100) : 0
    const guide = guides.find(g => g.role_id === r.id && !g.label) || null
    const diffPct = guide?.market_avg_price ? Math.round(((r.base_price - guide.market_avg_price) / guide.market_avg_price) * 1000) / 10 : null
    const h = computeRoleHistory(r.role_code, historyItems)
    return { r, optionCount: roleFactors.length, legalCount, client, margin, marginPct, guide, diffPct, history: h }
  })
  const commonCount = factors.filter(f => f.role_id === null).length
  const publishedCount = roles.filter(r => r.is_published).length

  return (
    <div className="max-w-5xl space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="전체 직종" value={roles.length} />
        <StatCard label="발행됨" value={publishedCount} accent="text-emerald-600" />
        <StatCard label="초안" value={roles.length - publishedCount} accent="text-gray-500" />
        <StatCard label="공통 옵션" value={commonCount} accent="text-violet-600" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <h4 className="px-3 py-2 text-xs font-bold text-gray-600 bg-gray-50 border-b border-gray-200">
          직종별 단가 한눈에 보기 (옵션 미적용 기준가, 클릭하면 상세로 이동) — 이력 매칭건수/체결율은 실제 ERP 견적 데이터 기반 참고치{historyLoading ? ' (불러오는 중...)' : ''}
        </h4>
        <table className="w-full text-sm">
          <thead className="text-gray-400 text-xs">
            <tr>
              <th className="text-left py-2 pl-3">직종</th><th className="text-right py-2">청구 기본가</th><th className="text-right py-2">지급 기본가</th>
              <th className="text-right py-2">기본 마진</th><th className="text-right py-2">마진율</th>
              <th className="text-center py-2">옵션수</th><th className="text-center py-2">법적의무</th>
              <th className="text-center py-2">이력건수</th><th className="text-center py-2">체결율</th>
              <th className="text-center py-2 pr-3">상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, optionCount, legalCount, margin, marginPct, history: h }) => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-rose-50/40 cursor-pointer" onClick={() => onSelectRole(r.id)}>
                <td className="py-1.5 pl-3">{JOB_META[r.role_code]?.emoji} {r.role_name}</td>
                <td className="text-right py-1.5">{fmt(r.base_price)}원</td>
                <td className="text-right py-1.5">{fmt(r.pay_price)}원</td>
                <td className="text-right py-1.5">{fmt(margin)}원</td>
                <td className="text-right py-1.5"><span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${marginColor(marginPct)}`}>{marginPct}%</span></td>
                <td className="text-center py-1.5">{optionCount}</td>
                <td className="text-center py-1.5">{legalCount > 0 ? <span className="text-red-500 font-bold">{legalCount}</span> : <span className="text-gray-300">—</span>}</td>
                <td className="text-center py-1.5">{h.matched.length > 0 ? h.matched.length : <span className="text-gray-300">—</span>}</td>
                <td className="text-center py-1.5">
                  {h.winRate === null ? <span className="text-gray-300">—</span> : (
                    <button onClick={e => { e.stopPropagation(); onViewHistory(r.id) }} className={`underline decoration-dotted ${winRateColor(h.winRate)} px-1 rounded-full text-xs font-bold`}>
                      {h.winRate}% ({h.won.length}/{h.decided.length})
                    </button>
                  )}
                </td>
                <td className="text-center py-1.5 pr-3">{r.is_published ? <span className="text-emerald-600 text-xs font-semibold">발행</span> : <span className="text-gray-400 text-xs">초안</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <h4 className="px-3 py-2 text-xs font-bold text-gray-600 bg-gray-50 border-b border-gray-200">시장 단가 비교 한눈에 보기</h4>
        <table className="w-full text-sm">
          <thead className="text-gray-400 text-xs">
            <tr>
              <th className="text-left py-2 pl-3">직종</th><th className="text-right py-2">우리 기본가</th>
              <th className="text-right py-2">지킴</th><th className="text-right py-2">시장 평균</th><th className="text-right py-2 pr-3">시장평균 대비</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ r, guide, diffPct }) => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-rose-50/40 cursor-pointer" onClick={() => onSelectRole(r.id)}>
                <td className="py-1.5 pl-3">{JOB_META[r.role_code]?.emoji} {r.role_name}</td>
                <td className="text-right py-1.5">{fmt(r.base_price)}원</td>
                <td className="text-right py-1.5">{guide?.competitor_price ? `${fmt(guide.competitor_price)}원` : <span className="text-gray-300">—</span>}</td>
                <td className="text-right py-1.5">{guide?.market_avg_price ? `${fmt(guide.market_avg_price)}원` : <span className="text-gray-300">—</span>}</td>
                <td className="text-right py-1.5 pr-3">
                  {diffPct === null ? <span className="text-gray-300">—</span> : (
                    <span className={diffPct >= 0 ? 'text-emerald-600' : 'text-red-500'}>{diffPct > 0 ? '+' : ''}{diffPct}%</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({ label, value, display, accent = 'text-gray-800' }: { label: string; value: number; display?: string; accent?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className={`text-xl font-extrabold ${accent}`}>{display ?? value}</div>
    </div>
  )
}

// ── 역할별 체결 히스토리 뷰 ────────────────────────────────
function RoleHistoryView({ roleCode, items, expandedBucket, setExpandedBucket }: {
  roleCode: string; items: HistoryItem[]
  expandedBucket: number | null; setExpandedBucket: (b: number | null) => void
}) {
  const h = computeRoleHistory(roleCode, items)

  if (h.matched.length === 0) {
    return <p className="text-sm text-gray-400">이 직종과 매칭되는 과거 견적 데이터가 없습니다. (키워드 매칭 기준이라 실제로는 데이터가 있어도 못 잡을 수 있어요)</p>
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="매칭 건수" value={h.matched.length} />
        <StatCard label="체결율 (결정건 기준)" value={0} display={h.winRate === null ? '—' : `${h.winRate}%`}
          accent={h.winRate === null ? 'text-gray-400' : winRateColor(h.winRate)} />
        <StatCard label="평균 체결가" value={0} display={h.avgWonPrice ? `${fmt(h.avgWonPrice)}원` : '—'} />
        <StatCard label="최근 체결" value={0} display={h.recentWon ? formatEventDate(h.recentWon) : '—'} />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <h4 className="px-3 py-2 text-xs font-bold text-gray-600 bg-gray-50 border-b border-gray-200">가격대별 체결율 (클릭하면 개별 건 목록)</h4>
        <table className="w-full text-sm">
          <thead className="text-gray-400 text-xs">
            <tr><th className="text-left py-2 pl-3">가격대</th><th className="text-right py-2">전체건수</th><th className="text-right py-2">성사</th><th className="text-right py-2 pr-3">체결율</th></tr>
          </thead>
          <tbody>
            {h.buckets.map(b => {
              const decided = b.items.filter(it => it.outcome !== 'pending').length
              const rate = decided > 0 ? Math.round((b.won / decided) * 100) : null
              const isOpen = expandedBucket === b.price
              return (
                <Fragment key={b.price}>
                  <tr className="border-t border-gray-100 hover:bg-rose-50/40 cursor-pointer" onClick={() => setExpandedBucket(isOpen ? null : b.price)}>
                    <td className="py-1.5 pl-3">{fmt(b.price)}원대</td>
                    <td className="text-right py-1.5">{b.total}</td>
                    <td className="text-right py-1.5">{b.won}</td>
                    <td className="text-right py-1.5 pr-3">{rate === null ? <span className="text-gray-300">—</span> : `${rate}%`}</td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-gray-50">
                      <td colSpan={4} className="py-2 px-3">
                        <ul className="space-y-1 text-xs text-gray-500">
                          {b.items.map(it => (
                            <li key={it.id} className="flex items-center gap-2">
                              <span className={it.outcome === 'won' ? 'text-emerald-600' : it.outcome === 'lost' ? 'text-red-400' : 'text-gray-400'}>
                                {it.outcome === 'won' ? '●성사' : it.outcome === 'lost' ? '○미성사' : '△미정'}
                              </span>
                              <span>{formatEventDate(it)}</span>
                              <span className="text-gray-400">· {it.company_name || '고객사 미기재'}</span>
                              <span className="text-gray-400">· 원문: "{it.role_name}"</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// 목록형/그래프형/매트릭스형, 이 직종만/전체 직종 비교 — 같은 스위처 UI를 재사용
function ViewSwitchTabs<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: React.ReactNode }[]
}) {
  return (
    <div className="inline-flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
            value === o.value ? 'bg-white text-rose-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  )
}

// ── 그래프형: 가격대별 성사/미성사/미정 건수를 막대로 (recharts, 대시보드 화면과 톤 통일) ──
function RoleHistoryGraphView({ roleCode, items }: { roleCode: string; items: HistoryItem[] }) {
  const h = computeRoleHistory(roleCode, items)
  if (h.matched.length === 0) {
    return <p className="text-sm text-gray-400">이 직종과 매칭되는 과거 견적 데이터가 없습니다. (키워드 매칭 기준이라 실제로는 데이터가 있어도 못 잡을 수 있어요)</p>
  }
  const data = h.buckets.map(b => ({
    label: `${fmt(b.price)}원대`,
    성사: b.items.filter(it => it.outcome === 'won').length,
    미성사: b.items.filter(it => it.outcome === 'lost').length,
    미정: b.items.filter(it => it.outcome === 'pending').length,
  }))
  const height = Math.max(160, data.length * 36 + 40)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="매칭 건수" value={h.matched.length} />
        <StatCard label="체결율 (결정건 기준)" value={0} display={h.winRate === null ? '—' : `${h.winRate}%`}
          accent={h.winRate === null ? 'text-gray-400' : winRateColor(h.winRate)} />
        <StatCard label="평균 체결가" value={0} display={h.avgWonPrice ? `${fmt(h.avgWonPrice)}원` : '—'} />
        <StatCard label="최근 체결" value={0} display={h.recentWon ? formatEventDate(h.recentWon) : '—'} />
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-3">
        <h4 className="text-xs font-bold text-gray-600 mb-2">가격대별 성사·미성사·미정 건수</h4>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="label" width={80} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="성사" stackId="a" fill="#059669" radius={[0, 0, 0, 0]} />
            <Bar dataKey="미성사" stackId="a" fill="#f87171" />
            <Bar dataKey="미정" stackId="a" fill="#9ca3af" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── 매트릭스형(이 직종만): 가격대 x 결과 그리드 — 클릭 없이 전체 분포를 한눈에 ──
function RoleMatrixView({ roleCode, items }: { roleCode: string; items: HistoryItem[] }) {
  const h = computeRoleHistory(roleCode, items)
  if (h.matched.length === 0) {
    return <p className="text-sm text-gray-400">이 직종과 매칭되는 과거 견적 데이터가 없습니다. (키워드 매칭 기준이라 실제로는 데이터가 있어도 못 잡을 수 있어요)</p>
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="매칭 건수" value={h.matched.length} />
        <StatCard label="체결율 (결정건 기준)" value={0} display={h.winRate === null ? '—' : `${h.winRate}%`}
          accent={h.winRate === null ? 'text-gray-400' : winRateColor(h.winRate)} />
        <StatCard label="평균 체결가" value={0} display={h.avgWonPrice ? `${fmt(h.avgWonPrice)}원` : '—'} />
        <StatCard label="최근 체결" value={0} display={h.recentWon ? formatEventDate(h.recentWon) : '—'} />
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <h4 className="px-3 py-2 text-xs font-bold text-gray-600 bg-gray-50 border-b border-gray-200">가격대별 매트릭스</h4>
        <table className="w-full text-sm">
          <thead className="text-gray-400 text-xs">
            <tr>
              <th className="text-left py-2 pl-3">가격대</th><th className="text-center py-2">성사</th>
              <th className="text-center py-2">미성사</th><th className="text-center py-2">미정</th>
              <th className="text-center py-2 pr-3">체결율</th>
            </tr>
          </thead>
          <tbody>
            {h.buckets.map(b => {
              const won = b.items.filter(it => it.outcome === 'won').length
              const lost = b.items.filter(it => it.outcome === 'lost').length
              const pending = b.items.filter(it => it.outcome === 'pending').length
              const decided = won + lost
              const rate = decided > 0 ? Math.round((won / decided) * 100) : null
              return (
                <tr key={b.price} className="border-t border-gray-100">
                  <td className="py-1.5 pl-3">{fmt(b.price)}원대</td>
                  <td className="text-center py-1.5 text-emerald-600 font-semibold">{won || <span className="text-gray-200">—</span>}</td>
                  <td className="text-center py-1.5 text-red-400 font-semibold">{lost || <span className="text-gray-200">—</span>}</td>
                  <td className="text-center py-1.5 text-gray-400">{pending || <span className="text-gray-200">—</span>}</td>
                  <td className="text-center py-1.5 pr-3">
                    {rate === null ? <span className="text-gray-300">—</span> : (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${winRateColor(rate)}`}>{rate}%</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── 매트릭스형(전체 직종 비교): 직종 x 가격대(10만원 단위) 그리드 — 11개 직종을 한 화면에서 비교 ──
function AllRolesMatrixView({ roles, items, onSelectRole }: {
  roles: RoleRow[]; items: HistoryItem[]; onSelectRole: (id: string) => void
}) {
  const { perRole, buckets } = computeAllRolesMatrix(roles, items)
  const activeRows = perRole.filter(p => p.total > 0)

  if (activeRows.length === 0) {
    return <p className="text-sm text-gray-400">매칭된 체결 이력이 있는 직종이 없습니다.</p>
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <h4 className="px-3 py-2 text-xs font-bold text-gray-600 bg-gray-50 border-b border-gray-200">
        전체 직종 × 가격대(10만원 단위) 체결율 — 행 클릭 시 해당 직종 상세로 이동
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-400 text-xs">
            <tr>
              <th className="text-left py-2 pl-3 sticky left-0 bg-white">직종</th>
              {buckets.map(b => <th key={b} className="text-center py-2 px-2 whitespace-nowrap">{fmt(b)}원~</th>)}
            </tr>
          </thead>
          <tbody>
            {activeRows.map(({ role, cellMap, total }) => (
              <tr key={role.id} className="border-t border-gray-100 hover:bg-rose-50/40 cursor-pointer" onClick={() => onSelectRole(role.id)}>
                <td className="py-1.5 pl-3 sticky left-0 bg-white font-medium whitespace-nowrap">
                  {JOB_META[role.role_code]?.emoji} {role.role_name} <span className="text-gray-300 font-normal">({total})</span>
                </td>
                {buckets.map(b => {
                  const c = cellMap.get(b)
                  if (!c) return <td key={b} className="text-center py-1.5 text-gray-200">—</td>
                  const decided = c.won + c.lost
                  const rate = decided > 0 ? Math.round((c.won / decided) * 100) : null
                  return (
                    <td key={b} className="text-center py-1.5">
                      {rate === null ? <span className="text-gray-300 text-xs">—</span> : (
                        <span className={`inline-block text-xs px-1.5 py-0.5 rounded-full font-bold ${winRateColor(rate)}`}>{rate}%</span>
                      )}
                      <div className="text-[9px] text-gray-400">{c.total}건</div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
        active ? 'border-rose-600 text-rose-700' : 'border-transparent text-gray-400 hover:text-gray-600'
      }`}
    >
      {icon}{label}
    </button>
  )
}

function LevelBadge({ level }: { level: string }) {
  const cls = level === '★★' ? 'bg-red-100 text-red-600' : level === '★' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
  return <span className={`text-[11px] font-bold rounded px-1.5 py-0.5 ${cls}`}>{level}</span>
}

function Row({ label, val, bold = false, big = false }: { label: string; val: number; bold?: boolean; big?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? 'font-bold text-gray-700' : ''} ${big ? 'text-sm pt-1' : ''}`}>
      <span>{label}</span><span>{val < 0 ? '' : '+'}{fmt(val)}원</span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="font-semibold text-gray-700">{children}</div>
    </div>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="text-[11px] text-gray-400 mb-1">{label}</div>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value) || 0)}
        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-rose-400"
      />
    </div>
  )
}

function ChangerInput({ changer, setChanger }: { changer: string; setChanger: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
      <span className="text-xs font-semibold text-blue-700 shrink-0">수정자</span>
      <input
        value={changer}
        onChange={e => setChanger(e.target.value)}
        placeholder="이름을 입력하면 변경 이력에 남습니다 (선택 입력)"
        className="flex-1 bg-white border border-blue-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-400"
      />
    </div>
  )
}
