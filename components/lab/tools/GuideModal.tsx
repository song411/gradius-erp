'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, BookOpen, GitBranch, HelpCircle, ArrowRight, ChevronDown, ChevronUp, Clock, Copy, CheckCheck, MessageCircle, ListChecks } from 'lucide-react'

const CURRENT_VERSION = 'v1.5.0'

// ─── 업데이트 노트 ────────────────────────────────────────
const CHANGELOGS = [
  {
    version: 'v1.5.0', date: '2026.05.25', label: '최신',
    color: 'bg-green-100 text-green-700',
    items: ['DB 관리자 페이지 신설', 'CEO 지급완료 되돌리기', '지급완료 이력 평면 테이블', '지급관리 2열 그리드 UI', '미등록 인원 무시 + 본사 혼합 자동완료', 'ERP 가이드북 고도화'],
  },
  {
    version: 'v1.4.0', date: '2026.05', label: '',
    color: 'bg-blue-100 text-blue-700',
    items: ['AI 업무도우미 (준비 중)', '스마트연구소 툴 정렬', '본사+외부 혼합 자동완료', 'CEO 지급 탭 분리'],
  },
  {
    version: 'v1.3.0', date: '2026.05', label: '',
    color: 'bg-purple-100 text-purple-700',
    items: ['타로뽑기·오늘의 한마디', 'MBTI 상세 궁합', '전국 경비업 연락처 275개+이메일', '페이지 전환 버그 수정'],
  },
  {
    version: 'v1.2.0', date: '2026.04', label: '',
    color: 'bg-amber-100 text-amber-700',
    items: ['GUARDIUS LAB 오픈', '본사 인원 자동 감지', 'CEO 전용 페이지', '크루 프로필·평점', '전역 UI 개선', '애니메이션 적용'],
  },
  {
    version: 'v1.1.0', date: '2026.03', label: '',
    color: 'bg-gray-100 text-gray-600',
    items: ['다중 견적 버전(A/B)', '체결관리·세금계산서', '인원배정 팀구조', '지급관리 신설·Excel'],
  },
  {
    version: 'v1.0.0', date: '2026.02', label: '최초 출시',
    color: 'bg-gray-100 text-gray-500',
    items: ['Next.js+Supabase ERP 출시', '문의·견적·크루·고객·정산', 'Python/Google Sheets 전환'],
  },
]

// ─── 업무 플로우 ──────────────────────────────────────────
const FLOW_STEPS = [
  {
    emoji: '📋', title: '문의 접수', menu: '문의관리',
    desc: '고객으로부터 행사 문의가 오면 가장 먼저 등록합니다.',
    tips: ['의뢰처·행사명·날짜·장소·담당자 입력', '상태 "접수"로 시작', '특이사항은 메모란에 기록'],
    color: 'from-blue-500 to-blue-600',
  },
  {
    emoji: '📄', title: '견적 작성', menu: '견적관리',
    desc: '문의 건에 대해 견적서를 작성합니다. A/B 복수 옵션 제시 가능.',
    tips: ['항목·단가·인원·일수 입력 → 자동 합계', '미리보기 → 이미지 저장 → 카톡 발송', '발송 후 발송 상태 배지 클릭해서 "발송완료" 체크'],
    color: 'from-violet-500 to-violet-600',
  },
  {
    emoji: '🤝', title: '체결 확정', menu: '견적관리 → 체결관리',
    desc: '고객이 수락하면 최종 견적 확정 → 체결관리에 자동 등록됩니다.',
    tips: ['견적관리에서 ⭐ 최종 확정 버튼 클릭', '문의 상태 자동으로 "체결"로 변경', '체결관리에서 세금계산서 정보 입력'],
    color: 'from-green-500 to-green-600',
  },
  {
    emoji: '👥', title: '인원 배정', menu: '인원배정',
    desc: '투입할 크루를 배정합니다. 팀장·팀원 구조 가능.',
    tips: ['크루 이름 검색 후 클릭 → 자동 추가', '역할·직종·단가·근무일수 설정', '본사 인원은 is_payable 해제'],
    color: 'from-orange-500 to-orange-600',
  },
  {
    emoji: '💸', title: '지급 처리', menu: '지급관리',
    desc: '행사 종료 후 크루 인력비를 단계별 처리합니다.',
    tips: ['지급 등록 → 검토완료 → 입금완료 순서', '엑셀로 이체목록 다운로드 후 은행 이체', '전체 검토완료·전체 입금완료 버튼으로 일괄처리'],
    color: 'from-red-500 to-red-600',
  },
  {
    emoji: '💰', title: '정산/청구', menu: '정산/청구',
    desc: '고객사에 세금계산서 발행 및 입금을 관리합니다.',
    tips: ['계약금액·입금액 업데이트', '세금계산서 발행 여부 체크', 'CEO 페이지에서 전체 수익 확인'],
    color: 'from-teal-500 to-teal-600',
  },
]

// ─── 따라하기 시나리오 ────────────────────────────────────
const SCENARIOS = [
  {
    id: 'new-inquiry',
    emoji: '📞',
    title: '새 문의가 들어왔을 때',
    steps: [
      { action: '문의관리 페이지 이동', detail: '사이드바에서 📋 문의 관리 클릭' },
      { action: '+ 문의 등록 버튼 클릭', detail: '오른쪽 상단의 파란색 버튼' },
      { action: '기본 정보 입력', detail: '의뢰처명, 행사명, 행사 날짜, 장소, 담당자 연락처 입력' },
      { action: '상태 확인', detail: '상태는 기본값 "접수"로 유지' },
      { action: '저장', detail: '저장하면 견적관리 → 견적 대기 탭에 자동으로 나타남' },
    ],
  },
  {
    id: 'make-estimate',
    emoji: '📄',
    title: '견적서 작성하고 카톡으로 보낼 때',
    steps: [
      { action: '견적관리 → 견적 대기 탭', detail: '접수된 문의 목록에서 해당 건 확인' },
      { action: '"견적 작성" 버튼 클릭', detail: '스마트 견적 빌더가 전체화면으로 열림' },
      { action: '왼쪽 패널: 항목 추가', detail: '+ 버튼으로 경호원·사복 등 품목 추가, 단가·인원·일수 입력' },
      { action: '오른쪽 패널: 미리보기 확인', detail: '실시간으로 A4 견적서 레이아웃 확인' },
      { action: '이미지 저장 버튼 클릭', detail: '오른쪽 상단 "이미지 저장" → 견적서 PNG 다운로드' },
      { action: '카카오톡으로 전송', detail: '저장된 이미지를 고객 오픈채팅 or 1:1 채팅에 전송' },
      { action: '발송완료 체크', detail: '견적관리 목록에서 발송 상태 배지 클릭 → "발송완료" 표시' },
    ],
  },
  {
    id: 'confirm-deal',
    emoji: '🤝',
    title: '계약이 확정됐을 때',
    steps: [
      { action: '견적관리 → 진행 중 탭', detail: '발송한 견적을 찾기' },
      { action: '⭐ 최종 확정 버튼 클릭', detail: '여러 버전 중 고객이 선택한 안 확정' },
      { action: '확인 팝업 "확인"', detail: '문의 상태가 자동으로 "체결"로 변경됨' },
      { action: '체결관리 이동', detail: '사이드바 🤝 체결 관리 클릭' },
      { action: '세금계산서 정보 입력', detail: '사업자번호·대표자·담당자 정보 업데이트' },
      { action: '계약금 입금 확인', detail: '정산/청구에서 입금액 업데이트' },
    ],
  },
  {
    id: 'assign-crew',
    emoji: '👥',
    title: '행사 인원을 배정할 때',
    steps: [
      { action: '인원배정 페이지 이동', detail: '사이드바 👥 인원 배정 클릭' },
      { action: '해당 행사 선택', detail: '왼쪽 행사 목록에서 체결된 행사 클릭' },
      { action: '크루 검색', detail: '오른쪽 검색창에서 이름·직종으로 크루 검색' },
      { action: '역할 설정 후 추가', detail: '경호원/사복/팀장 역할, 단가, 근무일수 입력 후 배정 버튼' },
      { action: '팀장-팀원 묶기', detail: '팀장 배정 후 같은 팀코드로 팀원 추가 (팀 배정 기능)' },
      { action: '본사 인원 추가 시', detail: '반드시 is_payable 체크 해제 → 지급 목록에서 자동 제외' },
    ],
  },
  {
    id: 'process-payout',
    emoji: '💸',
    title: '인력비를 지급 처리할 때',
    steps: [
      { action: '지급관리 페이지 이동', detail: '사이드바 💸 지급 관리 클릭' },
      { action: '처리 필요 탭 → 행사 선택', detail: '왼쪽 카드에서 처리 필요한 행사 클릭' },
      { action: '지급 등록 버튼', detail: '미등록 인원 섹션에서 "지급 등록" 클릭 → 금액·계좌 확인 후 저장' },
      { action: '전체 검토완료 클릭', detail: '오른쪽 상단 버튼으로 일괄 검토완료 처리' },
      { action: '이체목록 엑셀 다운로드', detail: '"이체목록 엑셀" 버튼 → 은행 대량이체 파일 다운로드' },
      { action: '이체 완료 후 입금완료 클릭', detail: '"전체 입금완료" 버튼 → 지급완료 탭으로 자동 이동' },
    ],
  },
]

// ─── 카카오톡 양식 ────────────────────────────────────────
const KAKAO_TEMPLATES = [
  {
    id: 'inquiry-form',
    title: '📥 문의접수 양식 (고객 전달용)',
    tag: '문의 받을 때',
    color: 'bg-amber-50 border-amber-300',
    tagColor: 'bg-amber-100 text-amber-800',
    template: `📋 문의접수 양식
아래 내용을 채워서 보내주세요 😊

문의날짜 : 
업체 : 
성함 : 
행사명 : 
연락처 : 
장소 : 
일시 : 
시간 : 
서비스종류 : 
요청인원수 : 
페이 : 
복장 : 
식사 : 
주차 : 
특이사항 :

감사합니다 🙏`,
    sampleTitle: '✅ 작성 예시',
    sample: `📋 문의접수 양식
아래 내용을 채워서 보내주세요 😊

문의날짜 : 5월 20일
업체 : 개인(황보태)
성함 : 황보태
행사명 : 개인신변보호
연락처 : 010-5269-6258
장소 : 서울 및 파주
일시 : 5월 22일
시간 : 16:00 - 23:00
서비스종류 : 개인수행
요청인원수 : 1
페이 : 50만원 내외
복장 : 활동성 편한복장
식사 : 미제공
주차 : 가능
특이사항 :
2타임 나눠져있음
16:00 서울역 → 청담동
22:00 청담동 → 파주 금촌
차량 필요, 휠체어 이용자이므로
큰 차 있어야 할 듯

감사합니다 🙏`,
    tips: [
      '업체명은 "업체명(담당자명)" 형식으로 입력하면 ERP에 고객사 자동 등록 시 편리해요',
      '시간은 "시작 - 종료" 형식으로 작성해 주세요 (예: 10:00 - 18:00)',
      '특이사항은 최대한 구체적으로 — 이 내용이 견적서 비고란에 활용됩니다',
      '페이가 미정이면 "협의" 또는 "시장가"로 작성해도 됩니다',
    ],
  },
  {
    id: 'inquiry-confirm',
    title: '문의 접수 확인',
    tag: '문의 접수 시',
    color: 'bg-yellow-50 border-yellow-200',
    tagColor: 'bg-yellow-100 text-yellow-700',
    template: `안녕하세요, 가디어스입니다 😊

문의 접수 감사합니다!
말씀 주신 행사 건 확인하였습니다.

📋 검토 후 빠른 시일 내에 견적서를 발송해 드리겠습니다.
추가로 문의사항이 있으시면 편하게 연락 주세요.

감사합니다 🙏`,
  },
  {
    id: 'estimate-send',
    title: '견적서 발송',
    tag: '견적 발송 시',
    color: 'bg-blue-50 border-blue-200',
    tagColor: 'bg-blue-100 text-blue-700',
    template: `안녕하세요, 가디어스입니다 😊

요청하신 견적서 발송드립니다.

📄 견적 내용 확인 후 궁금하신 사항이 있으시면
언제든지 말씀 주세요!

감사합니다 🙏`,
  },
  {
    id: 'contract-confirm',
    title: '계약 확정 감사',
    tag: '계약 체결 시',
    color: 'bg-green-50 border-green-200',
    tagColor: 'bg-green-100 text-green-700',
    template: `안녕하세요, 가디어스입니다 😊

계약 체결 감사드립니다!

✅ 배치 신고 및 행사 준비를 진행하겠습니다.
행사 관련 세부 사항은 별도로 안내드리겠습니다.

잘 부탁드립니다 🙏`,
  },
  {
    id: 'event-day',
    title: '행사 당일 안내',
    tag: '행사 전날/당일',
    color: 'bg-purple-50 border-purple-200',
    tagColor: 'bg-purple-100 text-purple-700',
    template: `안녕하세요, 가디어스입니다 😊

내일 행사 관련 안내드립니다.

📍 집결 장소: [장소]
⏰ 집결 시간: [시간]
👔 복장: [복장]
📞 현장 담당자: [담당자명] [연락처]

궁금하신 점은 편하게 연락 주세요!
내일도 잘 부탁드립니다 🙏`,
  },
  {
    id: 'invoice-request',
    title: '세금계산서 발행 요청',
    tag: '정산 시',
    color: 'bg-gray-50 border-gray-200',
    tagColor: 'bg-gray-100 text-gray-700',
    template: `안녕하세요, 가디어스입니다 😊

이번 행사 관련 세금계산서 발행 안내드립니다.

🧾 발행 정보를 아래와 같이 확인 부탁드립니다.
- 상호명:
- 사업자번호:
- 담당자 이메일:

확인 후 회신 주시면 바로 발행해 드리겠습니다.
감사합니다 🙏`,
  },
]

// ─── 메뉴별 가이드 ────────────────────────────────────────
const MENUS = [
  {
    emoji: '🏠', name: '대시보드', path: '/',
    desc: '전체 현황을 한눈에 확인하는 메인 화면.',
    buttons: [
      { name: 'KPI 카드 (매출·지급·크루수 등)', desc: '이번달 핵심 수치. 클릭하면 해당 페이지로 이동' },
      { name: '알림 배너', desc: '미배정 행사·미수금·지급 대기 건 경고. 숫자 확인 필수' },
      { name: '행사 캘린더', desc: '이번달 행사 일정. 날짜 클릭 시 해당 문의로 이동' },
    ],
    notes: ['매출은 정산 입금액 기준 (계약금액 아님)', '알림 배너 숫자가 0이 되도록 관리하세요'],
  },
  {
    emoji: '📋', name: '문의관리', path: '/inquiries',
    desc: '고객 문의 접수 및 상태 관리.',
    buttons: [
      { name: '+ 문의 등록', desc: '새 고객 문의 접수. 행사명·날짜·장소·담당자 최대한 상세히 입력' },
      { name: '상태 필터 탭', desc: '접수·견적·체결·완료·미체결 탭으로 전환. 진행 상황 한눈에 파악' },
      { name: '행 클릭', desc: '해당 문의 상세 보기 및 수정' },
      { name: '삭제(휴지통)', desc: '⚠ 절대 삭제 금지. 대신 상태를 "미체결"로 변경하세요' },
    ],
    notes: ['문의는 절대 삭제하지 마세요 — 지급·정산 데이터와 연결되어 있습니다', '행사 날짜 정확히 입력해야 대시보드 캘린더에 표시됩니다'],
  },
  {
    emoji: '📄', name: '견적관리', path: '/estimates',
    desc: '견적서 작성, 버전 관리, 발송 처리.',
    buttons: [
      { name: '견적 작성 버튼', desc: '스마트 견적 빌더 열기. 왼쪽 편집 / 오른쪽 A4 미리보기 분할 화면' },
      { name: '견적 추가 버튼 (그룹 헤더)', desc: '같은 문의에 B안·C안 추가 견적 작성' },
      { name: '⭐ 최종 확정', desc: '고객이 선택한 안 확정. 클릭 시 문의 상태가 "체결"로 자동 변경' },
      { name: '↩ 되돌리기', desc: '최종 확정 취소. 문의 상태가 다시 "견적"으로 변경' },
      { name: '👁 미리보기', desc: 'A4 견적서 미리보기. 이미지 저장 버튼으로 PNG 다운로드 가능' },
      { name: '발송 상태 배지 클릭', desc: '"미발송" → 클릭 → "발송완료" 체크. 발송 완료 탭으로 자동 이동' },
    ],
    notes: ['최종 확정 버튼을 누르면 체결관리에 자동으로 레코드가 생성됩니다', '여러 버전 중 반드시 하나만 최종 확정하세요'],
  },
  {
    emoji: '🤝', name: '체결관리', path: '/closings',
    desc: '계약 세금계산서 정보 및 계약 현황.',
    buttons: [
      { name: '세금계산서 정보 수정', desc: '사업자번호·대표자·이메일 입력. CEO 세금계산서 탭과 연동됨' },
      { name: '계약 메모', desc: '계약 특이사항·특약 조건 등 기록' },
    ],
    notes: ['체결관리 레코드는 최종 확정 시 자동 생성됩니다', '세금계산서 발행 전 반드시 정보 확인'],
  },
  {
    emoji: '👥', name: '인원배정', path: '/assignments',
    desc: '행사별 크루 배정 및 팀 구성.',
    buttons: [
      { name: '크루 검색창', desc: '이름·직종으로 검색. 클릭하면 배정 폼이 열림' },
      { name: '배정 버튼', desc: '역할·단가·일수 입력 후 저장. 지급관리에 자동 연동' },
      { name: '팀 배정', desc: '팀장 먼저 배정 후 같은 팀코드로 팀원 묶기' },
      { name: 'is_payable 체크', desc: '본사 인원은 반드시 해제 → 지급 대상에서 자동 제외' },
    ],
    notes: ['단가를 정확히 입력해야 지급관리에서 올바른 금액 계산됩니다', '팀장-팀원 연결은 팀코드로 관리됩니다'],
  },
  {
    emoji: '💸', name: '지급관리', path: '/payouts',
    desc: '크루 인력비 단계별 지급 처리.',
    buttons: [
      { name: '지급 등록 버튼', desc: '미등록 인원의 지급액·계좌 정보 등록. 인원배정 단가가 자동 입력됨' },
      { name: '전체 검토완료', desc: '"대기" 상태 전체를 "검토완료"로 일괄 처리' },
      { name: '전체 입금완료', desc: '"검토완료" 상태 전체를 "입금완료"로 처리. 지급완료 탭으로 자동 이동' },
      { name: '이체목록 엑셀', desc: '검토완료 건의 이체 정보 엑셀 다운로드. 은행 대량이체에 활용' },
      { name: '검토완료 → / 입금완료 → 버튼', desc: '개별 건 단계별 처리 버튼' },
    ],
    notes: ['미등록 인원은 후보 미확정으로 간주 — 지급완료 판단에서 제외', '지급완료 되돌리기는 CEO 전용 페이지에서 가능'],
  },
  {
    emoji: '💰', name: '정산/청구', path: '/settlements',
    desc: '매출 청구 및 입금 현황 관리.',
    buttons: [
      { name: '입금액 수정', desc: '고객사 입금 확인 후 업데이트. 미수금 자동 계산됨' },
      { name: '세금계산서 발행 체크', desc: '발행 완료 시 체크. CEO 탭에서 미발행 건 알림 확인 가능' },
      { name: '메모', desc: '입금 이슈·특이사항 기록' },
    ],
    notes: ['입금액 업데이트를 미루면 대시보드 매출이 부정확해집니다', '미수금 = 계약금액 - 입금액 자동 계산'],
  },
  {
    emoji: '🧑', name: '크루관리', path: '/staff',
    desc: '직원·크루 정보 및 평점 관리.',
    buttons: [
      { name: '+ 크루 등록', desc: '신규 크루 등록. 연락처·직종·계좌 정보 입력' },
      { name: '이름 클릭', desc: '크루 프로필 카드 열기. 배정 이력·평점 확인 가능' },
      { name: '평점 입력', desc: '0~5점 소수점 가능. 행사 후 평가 기준으로 활용' },
      { name: '비활성 처리', desc: '퇴직자는 삭제 대신 비활성 처리 → 배정 목록에서 제외' },
    ],
    notes: ['크루 삭제 시 배정·지급 데이터도 영향받습니다 — 비활성 처리 권장'],
  },
  {
    emoji: '⭐', name: 'CEO 전용', path: '/ceo',
    desc: '경영진 전용 종합 보고 페이지.',
    buttons: [
      { name: '경영현황 탭', desc: 'KPI·매출·지급 종합 현황' },
      { name: '세금계산서 탭', desc: '미발행 건 목록. 발행 처리 직접 가능' },
      { name: '인력비 지급 탭', desc: '지급현황 전체 보기. ↩ 되돌리기 버튼으로 지급완료 취소 가능' },
      { name: '업체 입금 탭', desc: '미수금 현황. 입금 처리 가능' },
      { name: '수익 보고 탭', desc: '행사별 이익률·총수익 분석' },
    ],
    notes: ['지급완료 되돌리기는 이 페이지 인력비 지급 탭에서만 가능'],
  },
  {
    emoji: '🛡️', name: 'DB 관리자', path: '/admin',
    desc: '데이터베이스 직접 조회·수정 (신중히 사용).',
    buttons: [
      { name: '테이블 선택 (좌측)', desc: '문의·견적·지급 등 테이블 선택' },
      { name: '셀 클릭', desc: '인라인 편집 모드 진입. Enter 저장 / Esc 취소' },
      { name: '날짜 보기 토글', desc: 'created_at 등 날짜 컬럼 표시/숨김' },
      { name: '삭제 버튼 (휴지통)', desc: '⚠ 확인 팝업 후 즉시 삭제. 복구 불가' },
    ],
    notes: ['잘못된 수정은 ERP 전체에 영향을 줄 수 있습니다', '삭제는 절대 신중하게 — 복구 방법 없음'],
  },
]

// ─── FAQ ─────────────────────────────────────────────────
const FAQS = [
  { q: '지급완료가 자동으로 안 넘어가요', a: '등록된 외부(유급) 인원 중 입금 미완료 건이 있으면 자동 이동이 안 됩니다. 지급관리 우측에서 "대기" 또는 "검토완료" 상태를 모두 처리하세요. 미등록 인원은 후보 미확정으로 자동 무시됩니다.' },
  { q: '본사 인원이 지급 목록에 뜨는데 어떻게 하나요?', a: '인원배정 시 본사 인원은 is_payable을 해제하거나, 이름(최규성·송무재·여지은·김영찬)으로 자동 감지됩니다. DB 관리자 → assignments 테이블에서 is_payable을 false로 수정할 수 있습니다.' },
  { q: '견적서 최종금액이 체결관리에 안 보여요', a: '견적관리에서 해당 버전의 ⭐ "최종 확정" 버튼을 눌러야 합니다. 여러 버전 중 하나만 최종으로 지정할 수 있습니다.' },
  { q: '지급완료를 실수로 눌렀어요', a: 'CEO 전용 → 인력비 지급 → 지급완료 이력 탭에서 해당 건의 "↩ 되돌리기" 버튼을 누르면 검토완료 상태로 되돌아갑니다.' },
  { q: '대시보드 매출이 실제와 달라요', a: '정산/청구에서 입금액이 정확히 입력됐는지 확인하세요. 대시보드 매출은 계약금액이 아닌 실제 입금액 기준입니다.' },
  { q: '크루가 배정 검색에 안 나와요', a: '크루관리에서 해당 직원이 "활성" 상태인지 확인하세요. 비활성 처리된 크루는 배정 화면에 나타나지 않습니다.' },
  { q: '데이터를 잘못 입력했어요', a: 'DB 관리자 페이지 (사이드바 맨 하단 빨간 아이콘)에서 해당 테이블을 찾아 셀 클릭 → 직접 수정 가능합니다.' },
  { q: '견적 발송 상태를 바꾸려면?', a: '견적관리 목록에서 발송 상태 배지(미발송/발송완료)를 직접 클릭하면 토글됩니다. 발송완료로 바꾸면 "발송 완료" 탭으로 자동 이동합니다.' },
]

type Section = 'flow' | 'scenarios' | 'kakao' | 'menus' | 'faq' | 'changelog'

const SECTIONS: { id: Section; label: string; emoji: string }[] = [
  { id: 'flow',       label: '업무 플로우',    emoji: '🔄' },
  { id: 'scenarios',  label: '따라하기',       emoji: '📋' },
  { id: 'kakao',      label: '카톡 양식',      emoji: '💬' },
  { id: 'menus',      label: '메뉴별 가이드',  emoji: '📖' },
  { id: 'faq',        label: 'FAQ',            emoji: '❓' },
  { id: 'changelog',  label: '업데이트 노트',  emoji: '📝' },
]

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={handleCopy}
      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
        copied ? 'bg-green-500 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'
      }`}>
      {copied ? <><CheckCheck className="h-3.5 w-3.5" />복사됨!</> : <><Copy className="h-3.5 w-3.5" />복사</>}
    </button>
  )
}

export default function GuideModal({ onClose }: { onClose: () => void }) {
  const [section, setSection]   = useState<Section>('flow')
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [openFaq, setOpenFaq]   = useState<number | null>(null)
  const [openLog, setOpenLog]   = useState<string | null>(CHANGELOGS[0].version)
  const [openScenario, setOpenScenario] = useState<string | null>(SCENARIOS[0].id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ duration: 0.2 }}
        className="relative bg-gray-50 rounded-2xl shadow-2xl flex overflow-hidden"
        style={{ width: '100%', maxWidth: 960, height: '90vh' }}
      >
        {/* ── 좌측 네비 ── */}
        <div className="w-44 shrink-0 bg-gray-900 flex flex-col">
          <div className="px-4 py-5 border-b border-gray-700">
            <div className="flex items-center gap-2 mb-1.5">
              <BookOpen className="h-4 w-4 text-amber-400" />
              <span className="font-extrabold text-white text-sm">ERP 가이드북</span>
            </div>
            <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full">{CURRENT_VERSION}</span>
          </div>
          <nav className="flex-1 py-3 px-2 space-y-0.5">
            {SECTIONS.map(s => (
              <button key={s.id} onClick={() => setSection(s.id)}
                className={`w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  section === s.id ? 'bg-amber-500 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}>
                <span className="text-sm leading-none">{s.emoji}</span>
                <span>{s.label}</span>
              </button>
            ))}
          </nav>
          <div className="p-3 border-t border-gray-700">
            <button onClick={onClose}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-gray-400 hover:bg-gray-800 hover:text-white transition-colors text-xs">
              <X className="h-4 w-4" />닫기
            </button>
          </div>
        </div>

        {/* ── 우측 콘텐츠 ── */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div key={section}
              initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }} className="p-6">

              {/* ── 업무 플로우 ── */}
              {section === 'flow' && (
                <div>
                  <h2 className="text-xl font-extrabold text-gray-900 mb-1">업무 플로우</h2>
                  <p className="text-sm text-gray-500 mb-6">문의 접수부터 정산까지 전체 흐름입니다.</p>
                  <div className="space-y-3">
                    {FLOW_STEPS.map((step, idx) => (
                      <div key={step.title} className="flex gap-4 items-start">
                        <div className="flex flex-col items-center shrink-0">
                          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${step.color} flex items-center justify-center text-white font-extrabold text-sm shadow`}>{idx + 1}</div>
                          {idx < FLOW_STEPS.length - 1 && <div className="w-0.5 h-6 bg-gray-200 mt-1" />}
                        </div>
                        <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xl">{step.emoji}</span>
                            <span className="font-extrabold text-gray-900">{step.title}</span>
                            <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">{step.menu}</span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{step.desc}</p>
                          {step.tips.map(tip => (
                            <div key={tip} className="flex items-start gap-1.5 text-xs text-gray-500 mb-1">
                              <ArrowRight className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />{tip}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── 따라하기 ── */}
              {section === 'scenarios' && (
                <div>
                  <h2 className="text-xl font-extrabold text-gray-900 mb-1">따라하기</h2>
                  <p className="text-sm text-gray-500 mb-5">상황별 단계별 가이드입니다. 그대로 따라하세요.</p>
                  <div className="space-y-2">
                    {SCENARIOS.map(sc => {
                      const isOpen = openScenario === sc.id
                      return (
                        <div key={sc.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                          <button onClick={() => setOpenScenario(isOpen ? null : sc.id)}
                            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left">
                            <span className="text-xl">{sc.emoji}</span>
                            <span className="flex-1 font-bold text-gray-800">{sc.title}</span>
                            <span className="text-xs text-gray-400">{sc.steps.length}단계</span>
                            {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                          </button>
                          {isOpen && (
                            <div className="border-t border-gray-100 px-5 py-4">
                              <div className="space-y-3">
                                {sc.steps.map((step, idx) => (
                                  <div key={idx} className="flex gap-3 items-start">
                                    <div className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{idx + 1}</div>
                                    <div>
                                      <p className="font-semibold text-sm text-gray-800">{step.action}</p>
                                      <p className="text-xs text-gray-500 mt-0.5">{step.detail}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── 카카오톡 양식 ── */}
              {section === 'kakao' && (
                <div>
                  <h2 className="text-xl font-extrabold text-gray-900 mb-1">카카오톡 양식</h2>
                  <p className="text-sm text-gray-500 mb-5">상황별 메시지 양식입니다. 복사 후 상황에 맞게 수정해서 사용하세요.</p>
                  <div className="space-y-4">
                    {KAKAO_TEMPLATES.map(t => (
                      <div key={t.id} className={`rounded-xl border p-4 ${t.color}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <MessageCircle className="h-4 w-4 text-gray-600" />
                            <span className="font-bold text-gray-800">{t.title}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.tagColor}`}>{t.tag}</span>
                          </div>
                          <CopyButton text={t.template} />
                        </div>
                        <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed bg-white/60 rounded-lg px-4 py-3 border border-white/80">
                          {t.template}
                        </pre>

                        {/* 작성 팁 */}
                        {'tips' in t && Array.isArray(t.tips) && (
                          <div className="mt-3 bg-white/70 rounded-lg px-4 py-3 border border-amber-200">
                            <p className="text-xs font-bold text-amber-700 mb-2">💡 작성 팁</p>
                            <ul className="space-y-1">
                              {(t.tips as string[]).map((tip, i) => (
                                <li key={i} className="text-xs text-gray-600 flex gap-1.5">
                                  <span className="text-amber-500 shrink-0">•</span>{tip}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* 작성 예시 */}
                        {'sample' in t && t.sample && (
                          <div className="mt-3">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-bold text-gray-600">{'sampleTitle' in t ? String(t.sampleTitle) : '✅ 작성 예시'}</p>
                              <CopyButton text={String(t.sample)} />
                            </div>
                            <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans leading-relaxed bg-green-50 rounded-lg px-4 py-3 border border-green-200">
                              {String(t.sample)}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── 메뉴별 가이드 ── */}
              {section === 'menus' && (
                <div>
                  <h2 className="text-xl font-extrabold text-gray-900 mb-1">메뉴별 가이드</h2>
                  <p className="text-sm text-gray-500 mb-5">각 메뉴를 클릭하면 버튼 기능과 주의사항을 확인할 수 있습니다.</p>
                  <div className="space-y-2">
                    {MENUS.map(menu => {
                      const isOpen = openMenu === menu.name
                      return (
                        <div key={menu.name} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                          <button onClick={() => setOpenMenu(isOpen ? null : menu.name)}
                            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left">
                            <span className="text-xl">{menu.emoji}</span>
                            <div className="flex-1">
                              <span className="font-bold text-gray-800">{menu.name}</span>
                              <span className="ml-2 text-xs text-gray-400">{menu.path}</span>
                            </div>
                            {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                          </button>
                          {isOpen && (
                            <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                              <p className="text-sm text-gray-600">{menu.desc}</p>
                              <div>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                  <ListChecks className="h-3.5 w-3.5" />버튼 기능
                                </p>
                                <div className="space-y-2">
                                  {menu.buttons.map(btn => (
                                    <div key={btn.name} className="flex gap-3 items-start bg-gray-50 rounded-lg px-3 py-2">
                                      <span className="text-amber-500 font-bold text-xs shrink-0 mt-0.5">▶</span>
                                      <div>
                                        <span className="text-xs font-bold text-gray-700">{btn.name}</span>
                                        <span className="text-xs text-gray-500 ml-2">{btn.desc}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {menu.notes.length > 0 && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                                  <p className="text-xs font-bold text-amber-700 mb-1.5">⚠ 주의사항</p>
                                  {menu.notes.map(n => <p key={n} className="text-xs text-amber-700">• {n}</p>)}
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
                          <button onClick={() => setOpenFaq(isOpen ? null : idx)}
                            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left">
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
                    <span className="text-sm font-bold text-amber-600 bg-amber-100 px-2.5 py-0.5 rounded-full">현재 {CURRENT_VERSION}</span>
                  </div>
                  <p className="text-sm text-gray-500 mb-5">GUARDIUS ERP 버전별 변경 내역입니다.</p>
                  <div className="space-y-2">
                    {CHANGELOGS.map(log => {
                      const isOpen = openLog === log.version
                      return (
                        <div key={log.version} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                          <button onClick={() => setOpenLog(isOpen ? null : log.version)}
                            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left">
                            <GitBranch className="h-4 w-4 text-gray-400 shrink-0" />
                            <span className="font-extrabold text-gray-800">{log.version}</span>
                            {log.label && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${log.color}`}>{log.label}</span>}
                            <div className="flex-1 flex items-center gap-1.5 text-xs text-gray-400">
                              <Clock className="h-3 w-3" />{log.date}
                            </div>
                            {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                          </button>
                          {isOpen && (
                            <div className="border-t border-gray-100 px-5 py-3.5">
                              <ul className="space-y-2">
                                {log.items.map(item => (
                                  <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
                                    <span className="text-amber-500 font-bold shrink-0">+</span>{item}
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
