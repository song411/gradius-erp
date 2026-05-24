import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 숫자 포맷 (천 단위 콤마)
export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '0'
  return value.toLocaleString('ko-KR')
}

// 금액 포맷 (원 단위)
export function formatKRW(value: number | null | undefined): string {
  if (value == null) return '0원'
  return `${value.toLocaleString('ko-KR')}원`
}

// 날짜 포맷 (YYYY-MM-DD)
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  return dateStr.substring(0, 10)
}

// 날짜+시간 포맷
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  return dateStr.substring(0, 16).replace('T', ' ')
}

// 오늘 날짜 (KST 기준)
export function todayKST(): string {
  return new Date().toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).replace(/\. /g, '-').replace('.', '')
}

// 3.3% 원천세 계산 (교통비 제외)
export function calcWithholdingTax(
  basePay: number,
  mealPay: number,
  overtimePay: number
): number {
  const taxableAmount = basePay + mealPay + overtimePay
  return Math.floor(taxableAmount * 0.033)
}

// 최종 지급액 계산
export function calcFinalPay(
  basePay: number,
  overtimePay: number,
  mealPay: number,
  transportPay: number,
  bonus: number = 0
): {
  subtotal: number
  taxDeduction: number
  finalPay: number
} {
  // 교통비(택시비)는 3.3% 공제 제외
  const taxableAmount = basePay + overtimePay + mealPay + bonus
  const taxDeduction = Math.floor(taxableAmount * 0.033)
  const subtotal = taxableAmount
  const finalPay = subtotal - taxDeduction + transportPay

  return { subtotal, taxDeduction, finalPay }
}

// 공급가액 → 부가세 → 합계
export function calcVAT(supplyPrice: number): {
  supply: number
  vat: number
  total: number
} {
  const vat = Math.floor(supplyPrice * 0.1)
  return { supply: supplyPrice, vat, total: supplyPrice + vat }
}

// 수익률 계산
export function calcProfitRate(supply: number, cost: number): number {
  if (supply <= 0) return 0
  return Math.round(((supply - cost) / supply) * 1000) / 10
}

// 고객 분류 (사업자번호 유무)
export function getCustomerType(bizNumber?: string | null): string {
  return bizNumber && bizNumber.trim() ? '법인' : '개인'
}

// 상태 배지 색상
export const STATUS_COLORS: Record<string, string> = {
  // 문의 상태
  '접수': 'bg-blue-100 text-blue-700',
  '견적': 'bg-purple-100 text-purple-700',
  '체결': 'bg-indigo-100 text-indigo-700',
  '배정완료': 'bg-cyan-100 text-cyan-700',
  '진행중': 'bg-yellow-100 text-yellow-700',
  '완료': 'bg-green-100 text-green-700',
  '정산완료': 'bg-emerald-100 text-emerald-700',
  '미체결': 'bg-orange-100 text-orange-700',
  '보류': 'bg-gray-100 text-gray-600',
  '취소': 'bg-red-100 text-red-600',
  // 배정 상태
  '후보': 'bg-blue-100 text-blue-700',
  '배정중': 'bg-yellow-100 text-yellow-700',
  '확정': 'bg-green-100 text-green-700',
  // 지급 상태
  '대기': 'bg-yellow-100 text-yellow-700',
  '확인완료': 'bg-emerald-100 text-emerald-700',
  '미지급': 'bg-red-100 text-red-600',
  // 진행 상태
  '계약체결': 'bg-blue-100 text-blue-700',
  '행사준비': 'bg-purple-100 text-purple-700',
  '행사종료': 'bg-indigo-100 text-indigo-700',
  // 입금 상태
  '입금완료': 'bg-green-100 text-green-700',
  '부분입금': 'bg-yellow-100 text-yellow-700',
  '미입금': 'bg-red-100 text-red-600',
  // 추천 등급
  '우선투입': 'bg-green-100 text-green-700',
  '일반': 'bg-gray-100 text-gray-700',
  // 출석 상태
  '출석': 'bg-green-100 text-green-700',
  '지각': 'bg-yellow-100 text-yellow-700',
  '결근': 'bg-red-100 text-red-600',
  '조퇴': 'bg-orange-100 text-orange-700',
  '외출': 'bg-blue-100 text-blue-700',
}

// 문의 상태 흐름
export const INQUIRY_STATUS_FLOW = [
  '접수', '견적', '체결', '배정완료', '진행중', '완료', '정산완료'
] as const

// 문의 상태 진행률
export function getStatusProgress(status: string): number {
  const idx = INQUIRY_STATUS_FLOW.indexOf(status as typeof INQUIRY_STATUS_FLOW[number])
  if (idx === -1) return 0
  return Math.round((idx / (INQUIRY_STATUS_FLOW.length - 1)) * 100)
}

// 안전한 정수 변환
export function safeInt(value: unknown): number {
  const n = Number(value)
  return isNaN(n) ? 0 : Math.floor(n)
}

// 숫자 → 한글 금액 표기 (예: 5852000 → 오백팔십오만이천원정)
export function toKoreanAmount(num: number): string {
  if (num === 0) return '영원정'
  const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']
  const places = ['', '십', '백', '천']
  const units = ['', '만', '억', '조']

  function chunkToKorean(n: number): string {
    let result = ''
    for (let i = 3; i >= 0; i--) {
      const d = Math.floor(n / Math.pow(10, i)) % 10
      if (d === 0) continue
      result += (d === 1 && i > 0 ? '' : digits[d]) + places[i]
    }
    return result
  }

  let result = ''
  let unitIdx = 0
  let n = num
  const parts: string[] = []
  while (n > 0) {
    const chunk = n % 10000
    if (chunk > 0) parts.unshift(chunkToKorean(chunk) + units[unitIdx])
    n = Math.floor(n / 10000)
    unitIdx++
  }
  result = parts.join('')
  return `${result}원정`
}

// 텍스트 자르기
export function truncate(text: string, maxLength: number = 20): string {
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}
