// 일용직 근로계약서 — 채우는 규칙 한 곳
// ─────────────────────────────────────────────────────────
// 바탕 양식은 두 벌이다 (바탕화면 '께약서 모음' 폴더의 한글 파일을 그대로 옮겼다).
//   기본: 노무사 자문 샘플(일용직근로계약서_샘플.hwp). 사용자/근로자, 1~7조, 주소·생년월일·입사일 칸.
//   상세: 용인 주차요원 샘플. 사업주/근로자, 제1~9조, 포괄임금·고용/산재 0.9%·비밀유지·해지·손해배상.
// 계약서 글귀를 고치려면 이 파일만 고친다. 화면(LaborContractDoc)은 여기 있는 글을 그대로 찍는다.
//
// 값은 배정(assignments)·문의(inquiries)·크루(staff)에서 가져와 채우고, 화면에서 사람이 고쳐서 인쇄한다.
// 여기서 DB 에 쓰는 것은 없다 — 계약서는 종이(또는 PDF)로만 나간다.

import type { Assignment, Inquiry, Staff } from '@/lib/supabase/types'

export type ContractVariant = '기본' | '상세'

export const VARIANT_DESC: Record<ContractVariant, string> = {
  기본: '노무사 자문 양식 — 7개 조항, 주소·생년월일·입사일 칸',
  상세: '용인 주차요원 양식 — 9개 조항, 포괄임금·비밀유지·해지·손해배상 포함',
}

/** 사용자(회사) 쪽 고정값. 견적서(EstimatePreview)와 같은 값 */
export const COMPANY = {
  name: '주식회사 가디어스',
  ceo: '최규성',
  regNo: '429-88-01469',
  address: '서울시 종로구 동망산1길 2, 1층',
  phone: '1600-2944',
}

/** 계약서에 찍히는 칸 전부. 전부 문자열 — 사람이 화면에서 고칠 수 있어야 하므로 */
export interface ContractFields {
  variant: ContractVariant
  workerName: string
  workerPhone: string
  workerIdNumber: string   // 상세 양식(주민등록번호 칸)
  workerBirth: string      // 기본 양식(생년월일 칸) — 주민번호 앞자리로 만든다
  workerAccount: string    // 지급계좌 (은행 계좌번호) — 급여를 보낼 곳
  periodText: string       // Ⓐ 근로계약기간
  positionText: string     // Ⓑ 담당직위
  dutyText: string         // Ⓒ 담당업무
  placeText: string        // Ⓓ 취업장소
  hoursText: string        // Ⓔ 소정근로시간
  payMethodText: string    // Ⓗ 임금산정방법
  dailyPayText: string     // 기본 일당총액
  totalPayText: string     // 지급가(기본) / 합계(상세)
  signDate: string         // 작성일 YYYY-MM-DD
}

export const FIELD_LABELS: Record<keyof Omit<ContractFields, 'variant'>, string> = {
  workerName: '성명', workerPhone: '전화번호', workerIdNumber: '주민등록번호', workerBirth: '생년월일',
  workerAccount: '지급계좌', periodText: 'Ⓐ 근로계약기간', positionText: 'Ⓑ 담당직위',
  dutyText: 'Ⓒ 담당업무', placeText: 'Ⓓ 취업장소', hoursText: 'Ⓔ 소정근로시간', payMethodText: 'Ⓗ 임금산정방법',
  dailyPayText: '기본 일당총액', totalPayText: '지급가 / 합계', signDate: '작성일',
}

/** 사람마다 다른 칸 — 여러 명 한 번에 뽑을 때 공통 수정에서 제외한다 */
export const PER_PERSON_KEYS: (keyof ContractFields)[] = [
  'workerName', 'workerPhone', 'workerIdNumber', 'workerBirth', 'workerAccount', 'periodText', 'dailyPayText', 'totalPayText',
]

// ── 날짜 ────────────────────────────────────────────────
export function fmtKorean(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '')
  if (!m) return ymd || ''
  return `${Number(m[1])}년 ${Number(m[2])}월 ${Number(m[3])}일`
}
/** 샘플 그대로 "25년 9월 7일" 식의 짧은 표기 */
export function fmtKoreanShort(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '')
  if (!m) return ymd || ''
  return `${m[1].slice(2)}년 ${Number(m[2])}월 ${Number(m[3])}일`
}
export function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00')
  if (isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 주민등록번호 → "1990년 1월 1일". 뒷자리 첫 숫자로 세기를 가른다(1·2·5·6 = 1900년대, 3·4·7·8 = 2000년대) */
export function birthFromIdNumber(id?: string | null): string {
  const digits = (id || '').replace(/\D/g, '')
  if (digits.length < 7) return ''
  const yy = digits.slice(0, 2), mm = digits.slice(2, 4), dd = digits.slice(4, 6), g = digits[6]
  const century = '3478'.includes(g) ? '20' : '19'
  const m = Number(mm), d = Number(dd)
  if (m < 1 || m > 12 || d < 1 || d > 31) return ''
  return `${century}${yy}년 ${m}월 ${d}일`
}

/** 주민번호 표기 "900101-1234567" 로 정리. 숫자가 13자리가 아니면 적힌 그대로 */
export function formatIdNumber(id?: string | null): string {
  const digits = (id || '').replace(/\D/g, '')
  return digits.length === 13 ? `${digits.slice(0, 6)}-${digits.slice(6)}` : (id || '').trim()
}

// ── 근무일 ──────────────────────────────────────────────
/** 배정의 근무일 목록. work_dates 가 있으면 그것, 없으면 배정 시작~종료, 그것도 없으면 행사 시작~종료 */
export function workDatesOf(a: Assignment, inq?: Inquiry | null): string[] {
  if (a.work_dates && a.work_dates.length) return [...a.work_dates].sort()
  const s = a.start_date || inq?.event_start || ''
  const e = a.end_date || inq?.event_end || s
  if (!s) return []
  if (!e || e <= s) return [s]
  const out: string[] = []
  for (let d = s; d && d <= e && out.length < 400; d = addDaysYmd(d, 1)) out.push(d)
  return out
}

export function periodTextOf(variant: ContractVariant, dates: string[], workDays?: number): string {
  if (!dates.length) return ''
  const first = dates[0], last = dates[dates.length - 1]
  const n = workDays && workDays > 0 ? workDays : dates.length
  if (variant === '상세') return `${fmtKorean(first)}부터 ${fmtKoreanShort(last)} 까지 중 실제 근로한 날`
  return `${fmtKorean(first)}부터 ${fmtKoreanShort(last)} (${n}일)까지로 한다.`
}

// ── 근로시간 ────────────────────────────────────────────
/** "10:00~18:00" 같은 행사 시간에서 실근무·휴게를 계산한다.
 *  휴게는 근로기준법 최소치 — 4시간 이상 30분, 8시간 이상 1시간. 실제와 다르면 화면에서 고친다. */
export function hoursTextOf(eventTime?: string | null): string {
  const raw = (eventTime || '').trim()
  const m = /(\d{1,2}):(\d{2})\s*[~\-–]\s*(\d{1,2}):(\d{2})/.exec(raw)
  if (!m) return raw
  const start = Number(m[1]) * 60 + Number(m[2])
  let end = Number(m[3]) * 60 + Number(m[4])
  if (end <= start) end += 24 * 60
  const total = end - start
  const rest = total >= 8 * 60 ? 60 : total >= 4 * 60 ? 30 : 0
  const work = total - rest
  const h = Math.floor(work / 60), mm = work % 60
  const workText = mm ? `${h}시간 ${mm}분` : `${h}시간`
  const pad = (n: string) => n.padStart(2, '0')
  return `${pad(m[1])}:${m[2]} ~ ${pad(m[3])}:${m[4]} (실근무 ${workText}${rest ? `, 휴게 ${rest}분` : ''})`
}

// ── 직위·업무 ───────────────────────────────────────────
/** 직군 이름을 직위답게 — "주차" 는 "주차요원" 으로. 못 찾으면 직군 이름 그대로 */
const POSITION_BY_JOB: Record<string, string> = {
  주차: '주차요원', 안전: '안전요원', 경호: '경호원', 경비: '경비원', 스탭: '행사 스태프', 스텝: '행사 스태프',
  의전: '의전요원', 서빙: '서빙 스태프', 설치: '설치 스태프', 드라이버: '드라이버',
}
export function positionTextOf(variant: ContractVariant, jobType?: string | null): string {
  const j = (jobType || '').trim()
  if (variant !== '상세' || !j) return '단기 일용직'
  return `단기 일용직 ${POSITION_BY_JOB[j] || j}`
}

const DUTY_BY_JOB: [RegExp, string][] = [
  [/주차/, '주차 안내 및 차량 유도'],
  [/경호|안전|경비|보안/, '행사장 안전관리, 출입 통제 및 질서유지'],
  [/의전/, '의전 및 내빈 안내'],
  [/프로모터|홍보/, '행사 홍보 및 고객 응대'],
  [/서빙|케이터링/, '케이터링 서빙 및 정리'],
  [/설치|철수/, '행사 물품 설치 및 철수'],
  [/MC|나레이터|도슨트|진행/i, '행사 진행 및 안내'],
  [/드라이버|운전/, '차량 운행 및 이동 지원'],
]
export function dutyTextOf(jobType?: string | null): string {
  const j = jobType || ''
  const hit = DUTY_BY_JOB.find(([re]) => re.test(j))
  return hit ? hit[1] : '행사 및 현장 운영 보조, 안내, 정리, 질서유지 등'
}

/** 지급계좌 표기 "기업은행 123-456-789". 둘 중 하나만 있어도 적는다 */
export function accountTextOf(bank?: string | null, account?: string | null): string {
  return [bank, account].map(x => (x || '').trim()).filter(Boolean).join(' ')
}
/** 화면에서 적은 "기업은행 123-456" 을 은행·계좌로 나눈다. 첫 낱말에 숫자가 거의 없으면 은행 이름으로 본다 */
export function splitAccount(text: string): { bank_name: string; account_number: string } {
  const parts = (text || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2 && !/\d{3,}/.test(parts[0])) return { bank_name: parts[0], account_number: parts.slice(1).join(' ') }
  return { bank_name: '', account_number: parts.join(' ') }
}

export function payDeadlineText(lastDate: string): string {
  const due = lastDate ? addDaysYmd(lastDate, 14) : ''
  return due ? `계약종료일로부터 14일 이내(${fmtKorean(due)} 이내 지급)` : '계약종료일로부터 14일 이내'
}

export function won(n: number): string {
  return `${Math.round(n).toLocaleString('ko-KR')}원`
}

// ── 조립 ────────────────────────────────────────────────
export interface BuildInput {
  assignment: Assignment
  inquiry?: Inquiry | null
  staff?: Staff | null
  variant: ContractVariant
  /** 작성일. 보통 오늘 */
  today: string
}

/** 배정·문의·크루에서 계약서 칸을 채운다. 비어 있는 칸은 빈 문자열 — 화면이 빈 칸으로 알려 준다 */
export function buildContractFields({ assignment: a, inquiry, staff, variant, today }: BuildInput): ContractFields {
  const dates = workDatesOf(a, inquiry)
  const last = dates[dates.length - 1] || ''
  const idNumber = formatIdNumber(a.id_number || staff?.id_number)
  const dailyPay = Number(a.pay_rate) || 0
  const days = Number(a.work_days) || dates.length
  const total = dailyPay * days
  return {
    variant,
    workerName: a.staff_name || staff?.name || '',
    workerPhone: a.phone || staff?.phone || '',
    workerIdNumber: idNumber,
    workerBirth: birthFromIdNumber(idNumber),
    workerAccount: accountTextOf(a.bank_name || staff?.bank_name, a.account_number || staff?.account_number),
    periodText: periodTextOf(variant, dates, Number(a.work_days) || undefined),
    positionText: positionTextOf(variant, a.job_type),
    dutyText: dutyTextOf(a.job_type),
    placeText: inquiry?.location || '',
    hoursText: hoursTextOf(inquiry?.event_time),
    payMethodText: payDeadlineText(last),
    dailyPayText: dailyPay ? won(dailyPay) : '',
    totalPayText: variant === '상세'
      ? (dailyPay ? `${won(dailyPay)} × 근무일(${days}일) = ${won(total)}` : '포괄임금 × 근무일')
      : (dailyPay ? won(total) : ''),
    signDate: today,
  }
}

/** 빈 칸 목록(라벨). 인쇄 전에 사람이 채우라고 알려 주는 용도 */
export function missingFields(f: ContractFields): string[] {
  const need: (keyof ContractFields)[] = f.variant === '상세'
    ? ['workerName', 'workerPhone', 'workerIdNumber', 'periodText', 'placeText', 'hoursText', 'dailyPayText']
    : ['workerName', 'workerPhone', 'workerBirth', 'periodText', 'placeText', 'hoursText', 'dailyPayText']
  return need.filter(k => !String(f[k] || '').trim()).map(k => FIELD_LABELS[k as keyof typeof FIELD_LABELS])
}

// ── 조문 — 샘플 한글 파일의 글귀 그대로 ─────────────────
export interface Clause { title: string; items: string[] }

/** 급여 조항 안에 들어가는 표 뒤·앞 글귀는 Doc 이 variant 별로 자리를 잡는다. 여기서는 조문 글만 */
export const CLAUSES: Record<ContractVariant, Clause[]> = {
  기본: [
    { title: '1. 근로계약기간', items: ['➀ 근로계약기간은 Ⓐ와 같다.'] },
    { title: '2. 담당 직급 · 업무 및 취업 장소', items: [
      '➀ 담당 직위, 담당 업무, 취업 장소는 Ⓑ, Ⓒ, Ⓓ와 같다.',
      '② ‘사용자’는 회사 운영상 필요한 경우에 Ⓑ, Ⓒ, Ⓓ의 담당 직급 · 또는 취업 장소의 내용을 변경할 수 있다.',
    ] },
    { title: '3. 근로시간 및 휴게시간', items: [
      '➀ 소정근로일 및 소정근로시간은 Ⓔ와 같다.',
      '➁ ‘사용자’는 업무상 사정에 따라 근로시간 및 휴게시간을 조정할 수 있으며 근로자는 회사 및 업무 사정에 따라 연장, 야간, 휴일 근로함에 동의한다.',
    ] },
    { title: '4. 유급휴일 및 휴가', items: [
      '➀ ‘사용자’는 ‘근로자’가 1주간의 소정근로를 개근한 경우에 Ⓕ에 해당하는 요일의 주휴일을 부여한다. (근로기준법 요건 충족 시)',
      '➁ ‘사용자’는 ‘근로자’에게 근로기준법에 따른 연차유급휴가를 부여한다. (근로기준법 요건 충족 시)',
    ] },
    { title: '5. 급여 및 퇴직금', items: [
      '➀ 월 급여는 출근일x기본일당 총액으로 지급한다.',
      '__PAY_TABLE__',
      '➁ 임금의 산정방법은 Ⓗ와 같으며 급여에서 법령에서 정하는 제세공과금을 공제 후 ‘근로자’가 요청한 은행계좌에 지급한다.',
      '※ 근로자의 요청에 의하여 사업소득세 3.3%를 공제하는 경우, 추후 4대보험과 관련하여 행정상 이의제기를 하지 않음에 동의한다.',
    ] },
    { title: '6. 퇴직', items: ['➀ Ⓐ의 근로계약 만료로 근로관계는 당연히 종료된다.'] },
    { title: '7. 기타 근무조건', items: [
      '➀ 근로자는 근무시간 동안 성실히 업무를 수행하며, 무단 결근, 지각, 조퇴, 음주, 부적절한 행동 등은 계약 해지 및 향후 배제 사유가 될 수 있습니다.',
      '➁ 현장에서 알게 된 정보, 지침 등은 외부에 유출하지 않으며, 본인의 SNS 등에 무단 게시하지 않습니다.',
      '③ 본 계약에 명시되지 않은 사항은 관련 법령 및 회사 내규에 따릅니다.',
    ] },
  ],
  상세: [
    { title: '제1조 근로계약기간', items: ['➀ 근로계약기간은 Ⓐ와 같다.'] },
    { title: '제2조 담당 직급 · 업무 및 취업 장소', items: [
      '➀ 담당 직위, 담당 업무, 취업 장소는 Ⓑ, Ⓒ, Ⓓ와 같다.',
      '② ‘사업주’는 회사 운영상 필요한 경우에 Ⓑ, Ⓒ, Ⓓ의 담당 직급 · 또는 취업 장소의 내용을 변경할 수 있다.',
    ] },
    { title: '제3조 근로시간 및 휴게시간', items: [
      '➀ 소정근로시간은 Ⓔ와 같다.',
      '➁ ‘사업주’는 업무상 사정에 따라 근로시간 및 휴게시간을 조정할 수 있으며 ‘근로자’는 회사 및 업무 사정에 따라 연장, 야간, 휴일 근로함에 동의한다.',
    ] },
    { title: '제4조 급여 및 퇴직금', items: [
      '➀ 일급은 포괄임금으로서 기본급, 식대, 제수당이 포함된다. 급여는 출근일x기본일당 총액으로 지급한다.',
      '__PAY_TABLE__',
      '➁ 임금의 산정방법은 Ⓗ와 같으며 급여에서 법령에서 정하는 제세공과금을 공제 후 ‘근로자’가 요청한 은행계좌에 지급한다.',
      '※ 고용보험 및 산재보험이 적용되며 총 임금의 0.9%를 공제 후 지급한다.',
      '③ 유급휴일은 본 계약의 단기성을 고려하여 일당(주휴수당 포함) 지급으로 갈음하며, 별도의 유급휴일을 부여하지 않기로 합의한다.',
    ] },
    { title: '제5조 비밀유지 의무', items: [
      '➀ ‘근로자’는 현장에서 알게 된 고객 정보, 미공개 프로모션 내용, 영업 비밀 등을 제3자에게 누설하거나 개인 SNS(인스타그램, 블로그 등) 및 인터넷 커뮤니티에 무단 게시할 수 없다.',
      '➁ 본 조항은 계약 종료 후에도 유효하며, 위반 시 민·형사상 법적 책임을 진다.',
    ] },
    { title: '제6조 성실 의무 및 근무 수칙', items: [
      '‘근로자’는 다음 각 호의 사항을 반드시 준수하여야 한다.',
      '➀ 품위 유지: 복장 및 언행에 있어 브랜드 이미지에 부합하는 품위를 유지해야 한다.',
      '② 근무 준비: 업무 시작 전까지 복장 착용 등 정상적인 근로 제공 준비를 마쳐야 한다.',
      '③ 대리 근무 금지: 사전에 ‘사업주’의 승인 없는 대리 근무 지정이나 근무 중 사적 용무 수행을 금지한다.',
      '④ 즉시 보고: 근무 중 민원, 사고, 갈등 상황 발생 시 즉시 관리자에게 보고하여야 하며 독단적으로 처리하지 않는다.',
      '⑤ 분란 금지: 동료 간 불화 조성, 비협조적인 태도 등으로 현장 분위기를 저해해서는 안 된다.',
    ] },
    { title: '제7조 계약의 해지', items: [
      '‘사업주’는 다음 각 호의 사유 발생 시 즉시 본 계약을 해지할 수 있다.',
      '➀ 정당한 사유 없는 무단 결근, 잦은 지각(2회 이상) 등 근태가 불량한 경우',
      '② 제5조(비밀유지) 및 제6조(성실의무)를 위반하거나, 업무 능력이 현저히 부족하여 업무 수행이 불가능하다고 판단되는 경우',
      '③ 관리자의 정당한 업무 지시를 불이행하거나 항명하는 경우',
      '④ 질병, 부상 등 일신상의 사유로 정상적인 근로 제공이 어려운 경우',
      '⑤ 기타 사회 통념상 고용관계를 유지할 수 없는 비위행위가 있는 경우',
    ] },
    { title: '제8조 손해배상', items: [
      '‘근로자’의 고의 또는 과실(횡령, 유용, 시설물 파손, 무단 퇴사, 비밀 누설 등)로 인하여 회사에 금전적·비금전적 손해가 발생한 경우, ‘사업주’는 이에 대하여 민·형사상 손해배상을 청구할 수 있다.',
    ] },
    { title: '제9조 기타', items: ['기타 본 계약에 명시되지 않은 사항은 근로기준법을 따른다.'] },
  ],
}

// ── 전자서명 ────────────────────────────────────────────
/** 서명 링크 토큰 — 32자리 hex(128bit). 브라우저의 난수로 만든다 */
export function makeToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

/** 카톡에 붙여넣는 문구 — 사람 이름·행사·링크 */
export function signLinkMessage(name: string, eventName: string, url: string): string {
  return `[가디어스] ${name}님, ${eventName ? `${eventName} ` : ''}근로계약서입니다. 아래 링크를 열어 내용을 확인하고 서명해 주세요.
${url}`
}

/** 서명 시각 "2026년 4월 23일 14:05" (한국 시간) */
export function fmtSignedAt(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).formatToParts(d)
  const g = (t: string) => p.find(x => x.type === t)?.value || ''
  return `${g('year')}년 ${g('month')}월 ${g('day')}일 ${g('hour')}:${g('minute')}`
}

/** 양식별 호칭: 회사 쪽을 뭐라 부르는지 */
export function employerLabel(variant: ContractVariant): string {
  return variant === '상세' ? '사업주' : '사용자'
}
export function titleOf(variant: ContractVariant): string {
  return variant === '상세' ? '가디어스 일용직 근로계약서' : '일용직 근로계약서'
}
