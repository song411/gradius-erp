'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, BookOpen, GitBranch, HelpCircle, ArrowRight, ChevronDown, ChevronUp, Clock } from 'lucide-react'

// ─── 버전 정보 ────────────────────────────────────────
const CURRENT_VERSION = 'v1.5.0'

// ─── 업데이트 노트 ────────────────────────────────────
const CHANGELOGS = [
  {
    version: 'v1.5.0',
    date: '2026.05.25',
    label: '최신',
    color: 'bg-green-100 text-green-700',
    items: [
      'DB 관리자 페이지 신설 (테이블 직접 조회·수정)',
      'CEO 인력비지급 — 지급완료 되돌리기 기능',
      'CEO 인력비지급 — 지급완료 이력 평면 테이블 뷰',
      '지급관리 좌측 2열 그리드 UI (한 화면에 2배 확인)',
      '미등록 인원 무시 + 본사 혼합 시 자동 지급완료 처리',
      'GUARDIUS LAB 가이드북 추가',
    ],
  },
  {
    version: 'v1.4.0',
    date: '2026.05',
    label: '',
    color: 'bg-blue-100 text-blue-700',
    items: [
      'AI 업무도우미 (Gemini 연동 — 준비 중)',
      '스마트연구소 툴 정렬 (사용 가능 → 준비 중 순)',
      '지급관리 본사+외부 혼합 행사 자동 완료 처리',
      'CEO 인력비지급 — 처리필요/지급완료 탭 분리',
    ],
  },
  {
    version: 'v1.3.0',
    date: '2026.05',
    label: '',
    color: 'bg-purple-100 text-purple-700',
    items: [
      '스마트연구소 타로뽑기 (메이저 아르카나 22장)',
      '오늘의 한마디 (리더십·팀워크 명언 50개+)',
      'MBTI 궁합 — 에이전시 현장 적용 상세 결과',
      '전국 경비업 연락처 — 275개 경찰서 + 이메일',
      '페이지 전환 애니메이션 버그 수정',
    ],
  },
  {
    version: 'v1.2.0',
    date: '2026.04',
    label: '',
    color: 'bg-amber-100 text-amber-700',
    items: [
      'GUARDIUS LAB 스마트연구소 페이지 오픈',
      '지급관리 — 본사 인원 자동 감지·분리',
      'CEO 전용 페이지 — 세금계산서·인력비·수익보고',
      '크루관리 — 프로필 카드, 평점 시스템',
      '전역 UI 가독성 개선 (테두리·대비)',
      'framer-motion 페이지·다이얼로그 애니메이션',
    ],
  },
  {
    version: 'v1.1.0',
    date: '2026.03',
    label: '',
    color: 'bg-gray-100 text-gray-600',
    items: [
      '다중 견적 버전 관리 (A/B 옵션, 최종견적 지정)',
      '체결관리 — 세금계산서 정보·계약 상태 추적',
      '인원배정 — 팀 배정·검색·프리팀 기능',
      '지급관리 페이지 신설 — Excel 내보내기',
      '정산/청구 개선 — 이익률·메모·빠른 액션',
    ],
  },
  {
    version: 'v1.0.0',
    date: '2026.02',
    label: '최초 출시',
    color: 'bg-gray-100 text-gray-500',
    items: [
      'Next.js 16 + Supabase 기반 ERP 최초 출시',
      '대시보드 · 문의관리 · 견적관리 기본 기능',
      '크루관리 · 고객관리 · 정산/청구',
      'Python/Google Sheets에서 완전 전환',
    ],
  },
]

// ─── 업무 플로우 ────────────────────────────────────
const FLOW_STEPS = [
  {
    emoji: '📋', title: '문의 접수', menu: '문의관리',
    desc: '고객으로부터 행사 문의가 오면 가장 먼저 문의관리에 등록합니다.',
    tips: ['의뢰처(고객사), 행사명, 날짜, 장소를 최대한 상세히 입력', '상태는 "접수"로 시작'],
    color: 'from-blue-500 to-blue-600',
  },
  {
    emoji: '📄', title: '견적 작성', menu: '견적관리',
    desc: '문의 건에 대한 견적서를 작성합니다. A/B 버전으로 여러 옵션 제시 가능.',
    tips: ['항목별 단가·인원 입력 후 자동 합계 계산', '최종 견적 확정 시 "최종견적" 체크 필수', 'PDF 저장 또는 이미지로 고객에게 전달'],
    color: 'from-violet-500 to-violet-600',
  },
  {
    emoji: '🤝', title: '체결', menu: '체결관리',
    desc: '고객이 견적을 수락하면 체결 처리. 세금계산서 정보와 계약 조건을 입력합니다.',
    tips: ['문의 상태를 "체결"로 변경', '사업자등록번호, 담당자 등 세금계산서 발행 정보 입력', '계약금 입금 여부 확인'],
    color: 'from-green-500 to-green-600',
  },
  {
    emoji: '👥', title: '인원 배정', menu: '인원배정',
    desc: '행사에 투입할 크루를 배정합니다. 팀장·팀원 구조로 팀 배정 가능.',
    tips: ['크루 검색 후 역할(경호원/사복/팀장 등) 선택', '본사 인원은 is_payable 해제', '팀 배정 시 팀코드로 묶어서 관리'],
    color: 'from-orange-500 to-orange-600',
  },
  {
    emoji: '💸', title: '지급 관리', menu: '지급관리',
    desc: '행사 종료 후 크루에게 인력비를 지급합니다. 단계별 검토 후 입금처리.',
    tips: ['지급 등록 → 검토완료 → 입금완료 순서로 진행', '엑셀로 이체목록 다운로드 가능', '본사 인원은 자동으로 지급 제외 처리'],
    color: 'from-red-500 to-red-600',
  },
  {
    emoji: '💰', title: '정산/청구', menu: '정산/청구',
    desc: '고객사에 세금계산서를 발행하고 입금을 확인합니다.',
    tips: ['계약금액·입금액·미수금 현황 관리', '세금계산서 발행 여부 체크', 'CEO 페이지에서 전체 수익 보고 확인'],
    color: 'from-teal-500 to-teal-600',
  },
]

// ─── 메뉴별 가이드 ────────────────────────────────────
const MENUS = [
  {
    emoji: '🏠', name: '대시보드', path: '/',
    desc: '전체 현황을 한눈에 확인하는 메인 화면입니다.',
    features: ['이번달 매출·지급 KPI 카드', '처리 필요 알림 (미배정·미수금·지급대기)', '이번달 행사 캘린더', '최근 문의 목록'],
    notes: ['매출은 정산 완료된 금액 기준', '알림 뱃지 숫자를 주기적으로 확인하세요'],
  },
  {
    emoji: '📋', name: '문의관리', path: '/inquiries',
    desc: '고객 문의를 접수하고 상태를 관리합니다.',
    features: ['문의 등록·수정·삭제', '상태별 필터 (접수/견적/체결/완료 등)', '행사 날짜·장소·의뢰처 관리', '메모 및 특이사항 기록'],
    notes: ['문의는 절대 삭제하지 마세요. 상태를 "미체결"로 변경하세요', '행사 날짜는 정확히 입력해야 캘린더에 표시됩니다'],
  },
  {
    emoji: '📄', name: '견적관리', path: '/estimates',
    desc: '행사별 견적서를 작성하고 여러 버전을 관리합니다.',
    features: ['A/B 견적 버전 관리', '항목별 단가·인원·일수 계산', '이익률 자동 계산', '견적서 PDF/이미지 저장'],
    notes: ['버전 라벨(A안/B안 등)로 구분하세요', '"최종견적" 체크를 해야 체결관리에서 금액이 연동됩니다'],
  },
  {
    emoji: '🤝', name: '체결관리', path: '/closings',
    desc: '계약 체결된 행사의 세금계산서 및 계약 정보를 관리합니다.',
    features: ['세금계산서 발행 정보 입력', '계약금·잔금 입금 관리', '사업자등록번호·담당자 정보', '계약 메모'],
    notes: ['체결 후 반드시 세금계산서 정보를 입력하세요', 'CEO 페이지 세금계산서 탭과 연동됩니다'],
  },
  {
    emoji: '👥', name: '인원배정', path: '/assignments',
    desc: '행사별로 크루를 배정하고 역할을 관리합니다.',
    features: ['크루 이름 검색 후 배정', '역할·직종 설정 (경호원/사복/팀장 등)', '팀 코드로 팀 단위 관리', '본사 인원 별도 관리'],
    notes: ['본사 인원(최규성·송무재 등)은 지급 대상에서 자동 제외', '팀장 배정 시 같은 팀코드로 팀원을 묶으세요'],
  },
  {
    emoji: '💸', name: '지급관리', path: '/payouts',
    desc: '크루 인력비 지급을 단계별로 처리합니다.',
    features: ['지급 등록 (단가·공제·추가수당)', '검토완료 → 입금완료 단계 처리', '이체목록 엑셀 다운로드', '지급완료 자동 탭 이동'],
    notes: ['미등록 인원은 후보 미확정으로 간주 — 완료 판단에서 제외', '본사 인원은 지급 등록 불필요', '지급완료 후 되돌리기는 CEO 페이지에서 가능'],
  },
  {
    emoji: '💰', name: '정산/청구', path: '/settlements',
    desc: '고객사 청구 및 입금 현황을 관리합니다.',
    features: ['계약금액·입금액·미수금 관리', '세금계산서 발행 여부 추적', '이익률 표시', '메모 기록'],
    notes: ['입금 확인 후 반드시 입금액을 업데이트하세요', 'CEO 업체입금 탭과 연동됩니다'],
  },
  {
    emoji: '🧑', name: '크루관리', path: '/staff',
    desc: '직원 및 크루 정보를 관리합니다.',
    features: ['크루 프로필 카드', '직종·역할·연락처 관리', '평점 시스템 (0~5점)', '활성/비활성 상태 관리'],
    notes: ['퇴직자는 삭제 대신 "비활성" 처리하세요', '평점은 행사 후 평가 기준으로 활용하세요'],
  },
  {
    emoji: '🏢', name: '고객관리', path: '/customers',
    desc: '고객사 정보와 사업자 정보를 관리합니다.',
    features: ['사업자등록번호·대표자명', '담당자·연락처', '주소·이메일', '거래 이력 연동'],
    notes: ['견적 발행 전 고객사를 미리 등록해두면 자동완성됩니다'],
  },
  {
    emoji: '✅', name: '출석부', path: '/attendance',
    desc: '행사별 크루 출석을 관리합니다.',
    features: ['행사별 출석 체크', '불참자 표시', '출석 현황 통계'],
    notes: ['인원배정 완료 후 출석 체크하세요'],
  },
  {
    emoji: '⭐', name: 'CEO 전용', path: '/ceo',
    desc: '경영진을 위한 종합 보고 및 관리 페이지입니다.',
    features: ['경영현황 KPI', '세금계산서 발행 관리', '인력비 지급 전체 현황', '업체 입금 관리', '수익 보고'],
    notes: ['인력비 지급완료 되돌리기는 이 페이지에서만 가능', '수익 보고에서 행사별 이익률 확인 가능'],
  },
]

// ─── FAQ ────────────────────────────────────────────
const FAQS = [
  {
    q: '지급완료가 자동으로 안 넘어가요',
    a: '등록된 외부(유급) 인원 중 입금 미완료 건이 있으면 자동 이동이 안 됩니다. 지급관리 우측에서 미등록/대기 인원을 확인하세요. 미등록 인원은 후보 미확정으로 간주해 무시됩니다.',
  },
  {
    q: '본사 인원이 지급 목록에 뜨는데 어떻게 하나요?',
    a: '인원배정 시 본사 인원은 is_payable을 해제하거나, 이름(최규성·송무재·여지은·김영찬)으로 자동 감지됩니다. DB 관리자 페이지에서 assignments 테이블의 is_payable 값을 false로 수정할 수 있습니다.',
  },
  {
    q: '견적서 최종금액이 체결관리에 안 보여요',
    a: '견적관리에서 해당 버전의 "최종견적" 체크박스를 활성화해야 합니다. 여러 버전 중 하나만 최종으로 지정할 수 있습니다.',
  },
  {
    q: '지급완료를 실수로 눌렀어요',
    a: 'CEO 전용 → 인력비 지급 → 지급완료 이력 탭에서 해당 건의 "↩ 되돌리기" 버튼을 누르면 검토완료 상태로 되돌아갑니다.',
  },
  {
    q: '대시보드 매출이 실제와 달라요',
    a: '대시보드 매출은 정산/청구에 입력된 입금액 기준입니다. 정산 탭에서 입금액이 정확히 입력됐는지 확인하세요.',
  },
  {
    q: '크루 검색이 안 돼요',
    a: '크루관리에서 해당 직원이 "활성" 상태인지 확인하세요. 비활성 처리된 크루는 배정 화면에 나타나지 않습니다.',
  },
  {
    q: '데이터를 잘못 입력했는데 수정이 안 돼요',
    a: 'DB 관리자 페이지 (사이드바 맨 하단)에서 해당 테이블을 찾아 직접 수정할 수 있습니다. 셀을 클릭하면 인라인 편집이 됩니다.',
  },
  {
    q: '세금계산서 발행 체크는 어디서 하나요?',
    a: '정산/청구 페이지 또는 CEO 전용 → 세금계산서 탭에서 발행 여부를 체크할 수 있습니다.',
  },
]

// ─── 섹션 타입 ────────────────────────────────────────
type Section = 'flow' | 'menus' | 'faq' | 'changelog'

const SECTIONS: { id: Section; label: string; emoji: string }[] = [
  { id: 'flow',      label: '업무 플로우',    emoji: '🔄' },
  { id: 'menus',     label: '메뉴별 가이드',  emoji: '📖' },
  { id: 'faq',       label: 'FAQ',            emoji: '❓' },
  { id: 'changelog', label: '업데이트 노트',  emoji: '📝' },
]

export default function GuideModal({ onClose }: { onClose: () => void }) {
  const [section, setSection]     = useState<Section>('flow')
  const [openMenu, setOpenMenu]   = useState<string | null>(null)
  const [openFaq, setOpenFaq]     = useState<number | null>(null)
  const [openLog, setOpenLog]     = useState<string | null>(CHANGELOGS[0].version)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ duration: 0.2 }}
        className="relative bg-gray-50 rounded-2xl shadow-2xl flex overflow-hidden"
        style={{ width: '100%', maxWidth: 900, height: '88vh' }}
      >
        {/* ── 좌측 네비게이션 ── */}
        <div className="w-48 shrink-0 bg-gray-900 flex flex-col">
          {/* 헤더 */}
          <div className="px-4 py-5 border-b border-gray-700">
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="h-5 w-5 text-amber-400" />
              <span className="font-extrabold text-white text-sm">ERP 가이드북</span>
            </div>
            <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full">
              {CURRENT_VERSION}
            </span>
          </div>

          {/* 섹션 버튼 */}
          <nav className="flex-1 py-3 px-2 space-y-1">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  section === s.id
                    ? 'bg-amber-500 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <span className="text-base leading-none">{s.emoji}</span>
                <span>{s.label}</span>
              </button>
            ))}
          </nav>

          {/* 하단 닫기 */}
          <div className="p-3 border-t border-gray-700">
            <button onClick={onClose}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-gray-400 hover:bg-gray-800 hover:text-white transition-colors text-sm">
              <X className="h-4 w-4" />닫기
            </button>
          </div>
        </div>

        {/* ── 우측 콘텐츠 ── */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="p-6"
            >

              {/* ── 업무 플로우 ── */}
              {section === 'flow' && (
                <div>
                  <h2 className="text-xl font-extrabold text-gray-900 mb-1">업무 플로우</h2>
                  <p className="text-sm text-gray-500 mb-6">문의 접수부터 정산까지 전체 업무 흐름입니다.</p>

                  <div className="space-y-3">
                    {FLOW_STEPS.map((step, idx) => (
                      <div key={step.title}>
                        <div className="flex gap-4 items-start">
                          {/* 번호 + 선 */}
                          <div className="flex flex-col items-center shrink-0">
                            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${step.color} flex items-center justify-center text-white font-extrabold text-sm shadow`}>
                              {idx + 1}
                            </div>
                            {idx < FLOW_STEPS.length - 1 && (
                              <div className="w-0.5 h-6 bg-gray-200 mt-1" />
                            )}
                          </div>

                          {/* 카드 */}
                          <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4 mb-1 shadow-sm">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-xl">{step.emoji}</span>
                              <span className="font-extrabold text-gray-900">{step.title}</span>
                              <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 font-medium">
                                {step.menu}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">{step.desc}</p>
                            <div className="space-y-1">
                              {step.tips.map(tip => (
                                <div key={tip} className="flex items-start gap-1.5 text-xs text-gray-500">
                                  <ArrowRight className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                                  <span>{tip}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── 메뉴별 가이드 ── */}
              {section === 'menus' && (
                <div>
                  <h2 className="text-xl font-extrabold text-gray-900 mb-1">메뉴별 가이드</h2>
                  <p className="text-sm text-gray-500 mb-5">각 메뉴를 클릭하면 상세 사용법을 확인할 수 있습니다.</p>

                  <div className="space-y-2">
                    {MENUS.map(menu => {
                      const isOpen = openMenu === menu.name
                      return (
                        <div key={menu.name} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                          <button
                            onClick={() => setOpenMenu(isOpen ? null : menu.name)}
                            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
                          >
                            <span className="text-xl leading-none">{menu.emoji}</span>
                            <div className="flex-1">
                              <span className="font-bold text-gray-800">{menu.name}</span>
                              <span className="ml-2 text-xs text-gray-400">{menu.path}</span>
                            </div>
                            {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                          </button>

                          {isOpen && (
                            <div className="border-t border-gray-100 px-5 py-4 space-y-3">
                              <p className="text-sm text-gray-600">{menu.desc}</p>

                              <div>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">주요 기능</p>
                                <ul className="space-y-1">
                                  {menu.features.map(f => (
                                    <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                                      {f}
                                    </li>
                                  ))}
                                </ul>
                              </div>

                              {menu.notes.length > 0 && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                                  <p className="text-xs font-bold text-amber-700 mb-1.5">⚠ 주의사항</p>
                                  {menu.notes.map(n => (
                                    <p key={n} className="text-xs text-amber-700">• {n}</p>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── FAQ ── */}
              {section === 'faq' && (
                <div>
                  <h2 className="text-xl font-extrabold text-gray-900 mb-1">자주 묻는 질문</h2>
                  <p className="text-sm text-gray-500 mb-5">실무에서 자주 발생하는 문제와 해결 방법입니다.</p>

                  <div className="space-y-2">
                    {FAQS.map((faq, idx) => {
                      const isOpen = openFaq === idx
                      return (
                        <div key={idx} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                          <button
                            onClick={() => setOpenFaq(isOpen ? null : idx)}
                            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
                          >
                            <HelpCircle className="h-4 w-4 text-amber-500 shrink-0" />
                            <span className="flex-1 font-medium text-gray-800 text-sm">{faq.q}</span>
                            {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                          </button>
                          {isOpen && (
                            <div className="border-t border-gray-100 px-5 py-3.5 bg-gray-50">
                              <p className="text-sm text-gray-700 leading-relaxed">{faq.a}</p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── 업데이트 노트 ── */}
              {section === 'changelog' && (
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-xl font-extrabold text-gray-900">업데이트 노트</h2>
                    <span className="text-sm font-bold text-amber-600 bg-amber-100 px-2.5 py-0.5 rounded-full">
                      현재 {CURRENT_VERSION}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mb-5">GUARDIUS ERP 버전별 변경 내역입니다.</p>

                  <div className="space-y-2">
                    {CHANGELOGS.map(log => {
                      const isOpen = openLog === log.version
                      return (
                        <div key={log.version} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                          <button
                            onClick={() => setOpenLog(isOpen ? null : log.version)}
                            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
                          >
                            <GitBranch className="h-4 w-4 text-gray-400 shrink-0" />
                            <span className="font-extrabold text-gray-800">{log.version}</span>
                            {log.label && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${log.color}`}>
                                {log.label}
                              </span>
                            )}
                            <div className="flex-1 flex items-center gap-1.5 text-xs text-gray-400">
                              <Clock className="h-3 w-3" />
                              {log.date}
                            </div>
                            {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                          </button>

                          {isOpen && (
                            <div className="border-t border-gray-100 px-5 py-3.5">
                              <ul className="space-y-2">
                                {log.items.map(item => (
                                  <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
                                    <span className="text-amber-500 font-bold shrink-0">+</span>
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
