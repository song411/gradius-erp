/**
 * InquiryParser — 카톡/문자 자동 분석 엔진
 * Python utils_inquiry.py의 TypeScript 재구현 + 대폭 개선
 *
 * 개선점:
 * - 날짜 파싱 강화 (6월 18일 ~ 6월 21일, 6/18~6/21 모두 처리)
 * - 페이 만원 단위 자동 인식 ("팀장 22 / 서브 17" → 구조화)
 * - 인원수 숫자 추출 ("2명" → 2)
 * - 시간 정규화 ("09:30 ~ 18:00")
 * - 복장/식사/주차 별도 컬럼으로 분리
 * - 특이사항 멀티라인 캡처
 */

export interface ParsedInquiry {
  company_name: string
  contact_name: string
  phone: string
  event_name: string
  location: string
  event_start: string   // YYYY-MM-DD
  event_end: string     // YYYY-MM-DD
  event_time: string
  service_type: string
  required_staff: number | null
  pay_detail: string    // 원문 그대로 ("팀장 22 / 서브 17")
  expected_pay: number | null  // 대표 단가 (만원 → 원 변환)
  attire: string
  meal: string
  parking: string
  notes: string         // 특이사항
}

// 현재 연도 (KST)
function currentYear(): number {
  return new Date().getFullYear()
}

/**
 * "6월 18일", "6.18", "6/18", "06-18" → "YYYY-MM-DD"
 */
function parseKoreanDate(raw: string, baseYear?: number): string {
  const year = baseYear ?? currentYear()
  if (!raw || !raw.trim()) return ''

  const cleaned = raw.trim()

  // YYYY-MM-DD 이미 완성형
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return cleaned

  // N월 N일
  const m1 = cleaned.match(/(\d{1,2})월\s*(\d{1,2})일?/)
  if (m1) {
    const mm = m1[1].padStart(2, '0')
    const dd = m1[2].padStart(2, '0')
    return `${year}-${mm}-${dd}`
  }

  // N.N 또는 N/N 또는 N-N (년도 없는 경우)
  const m2 = cleaned.match(/^(\d{1,2})[.\-\/](\d{1,2})$/)
  if (m2) {
    const mm = m2[1].padStart(2, '0')
    const dd = m2[2].padStart(2, '0')
    return `${year}-${mm}-${dd}`
  }

  // YYYY.MM.DD 또는 YYYY/MM/DD
  const m3 = cleaned.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/)
  if (m3) {
    return `${m3[1]}-${m3[2].padStart(2, '0')}-${m3[3].padStart(2, '0')}`
  }

  return cleaned
}

/**
 * 날짜 범위 파싱 ("6월 18일 ~ 6월 21일" → {start, end})
 */
function parseDateRange(raw: string): { start: string; end: string } {
  if (!raw) return { start: '', end: '' }

  const tilde = raw.includes('~') ? '~' : raw.includes('–') ? '–' : null

  if (tilde) {
    const parts = raw.split(tilde).map(s => s.trim())
    const start = parseKoreanDate(parts[0])
    // 종료일에 월이 없으면 시작일의 월을 사용
    let end = ''
    if (parts[1]) {
      if (/^\d{1,2}일?$/.test(parts[1].replace(/일$/, ''))) {
        // "21일" 형태 — 시작 월 사용
        const startMonth = start.substring(5, 7)
        const day = parts[1].replace(/[^0-9]/g, '').padStart(2, '0')
        end = `${currentYear()}-${startMonth}-${day}`
      } else {
        end = parseKoreanDate(parts[1])
      }
    }
    return { start, end: end || start }
  }

  // 단일 날짜
  const single = parseKoreanDate(raw)
  return { start: single, end: single }
}

/**
 * 페이 정보 파싱
 * "팀장 22 / 서브 17" → { detail: "팀장 22 / 서브 17", representativePay: 170000 }
 * "20" → { detail: "20만원", representativePay: 200000 }
 */
function parsePay(raw: string): { detail: string; representativePay: number | null } {
  if (!raw) return { detail: '', representativePay: null }

  const trimmed = raw.trim()

  // 숫자만 있는 경우 ("20" → 20만원)
  if (/^\d+$/.test(trimmed)) {
    const amount = parseInt(trimmed) * 10000
    return { detail: `${trimmed}만원`, representativePay: amount }
  }

  // "팀장 N / 서브 N" 형태
  const leaderMatch = trimmed.match(/팀장\s*(\d+)/)
  const subMatch = trimmed.match(/서브\s*(\d+)/)
  if (subMatch) {
    const subPay = parseInt(subMatch[1]) * 10000
    return { detail: trimmed, representativePay: subPay }
  }
  if (leaderMatch) {
    const leaderPay = parseInt(leaderMatch[1]) * 10000
    return { detail: trimmed, representativePay: leaderPay }
  }

  // "N만원" 형태
  const manwon = trimmed.match(/(\d+)\s*만원?/)
  if (manwon) {
    return { detail: trimmed, representativePay: parseInt(manwon[1]) * 10000 }
  }

  // 그 외 — 원문 보존
  return { detail: trimmed, representativePay: null }
}

/**
 * 한 줄에서 "키워드 : 값" 또는 "키워드: 값" 추출
 */
function extractLine(text: string, keywords: string[]): string {
  for (const kw of keywords) {
    // 줄 단위로 탐색 (multiline)
    const regex = new RegExp(`${kw}\\s*[:：]\\s*(.+)`, 'im')
    const m = text.match(regex)
    if (m && m[1]?.trim()) return m[1].trim()
  }
  return ''
}

/**
 * 특이사항 멀티라인 캡처
 * "특이사항:" 이후의 모든 내용을 가져옴
 */
function extractNotes(text: string): string {
  const keywords = ['특이사항', '비고', '추가사항', '기타']
  for (const kw of keywords) {
    const regex = new RegExp(`${kw}\\s*[:：]\\s*([\\s\\S]*)`, 'im')
    const m = text.match(regex)
    if (m && m[1]?.trim()) {
      // 다른 키 필드가 나오면 중단
      const stopKeywords = ['업체', '성함', '행사명', '연락처', '장소', '일시', '시간', '서비스', '복장', '식사', '주차']
      let content = m[1].trim()
      for (const stop of stopKeywords) {
        const stopIdx = content.search(new RegExp(`^${stop}\\s*[:：]`, 'm'))
        if (stopIdx > 0) content = content.substring(0, stopIdx).trim()
      }
      if (content) return content
    }
  }
  return ''
}

/**
 * 메인 파서 함수
 */
export function parseInquiryText(text: string): Partial<ParsedInquiry> {
  if (!text?.trim()) return {}

  // 날짜 파싱
  const dateRaw = extractLine(text, ['일시', '날짜', '행사일'])
  const { start: event_start, end: event_end } = parseDateRange(dateRaw)

  // 페이 파싱
  const payRaw = extractLine(text, ['페이', '예산', '금액', '단가'])
  const { detail: pay_detail, representativePay: expected_pay } = parsePay(payRaw)

  // 인원수 파싱
  const staffRaw = extractLine(text, ['요청인원수', '인원수', '인원', '필요인원'])
  const staffMatch = staffRaw.match(/\d+/)
  const required_staff = staffMatch ? parseInt(staffMatch[0]) : null

  // 전화번호 추출 (010-XXXX-XXXX 패턴)
  const phoneMatch = text.match(/010[-\s]?\d{3,4}[-\s]?\d{4}/)
  const phone = phoneMatch
    ? phoneMatch[0].replace(/\s/g, '-')
    : extractLine(text, ['연락처', '전화', '휴대폰'])

  return {
    company_name: extractLine(text, ['업체', '업체명', '회사']),
    contact_name: extractLine(text, ['성함', '담당자', '이름', '담당']),
    phone,
    event_name: extractLine(text, ['행사명', '행사', '이벤트']),
    location: extractLine(text, ['장소', '위치', '현장']),
    event_start,
    event_end,
    event_time: extractLine(text, ['시간', '행사시간', '근무시간']),
    service_type: extractLine(text, ['서비스종류', '서비스', '직종', '업무']),
    required_staff,
    pay_detail,
    expected_pay,
    attire: extractLine(text, ['복장', '복장규정', '유니폼']),
    meal: extractLine(text, ['식사', '식대', '중식']),
    parking: extractLine(text, ['주차', '주차가능', '주차여부']),
    notes: extractNotes(text),
  }
}

/**
 * 파싱 결과 신뢰도 계산 (0~100%)
 * UI에서 "분석 품질 N%" 표시용
 */
export function calcParseConfidence(parsed: Partial<ParsedInquiry>): number {
  const requiredFields: (keyof ParsedInquiry)[] = [
    'company_name', 'event_name', 'event_start', 'phone'
  ]
  const optionalFields: (keyof ParsedInquiry)[] = [
    'contact_name', 'location', 'event_time', 'service_type',
    'required_staff', 'pay_detail', 'attire', 'meal', 'parking'
  ]

  let score = 0
  for (const f of requiredFields) {
    if (parsed[f]) score += 15
  }
  for (const f of optionalFields) {
    if (parsed[f]) score += 5
  }

  return Math.min(score, 100)
}
