// 섭외 문구 — 사장님이 실제로 쓰시는 양식 한 곳
// ─────────────────────────────────────────────────────────
// 배정 화면의 [섭외 문구] 버튼과 AI 비서(가디)가 같은 이 함수를 쓴다.
// 두 군데서 따로 만들면 한쪽만 고쳐지고, 받는 사람은 날마다 다른 양식을 받게 된다.
//
// ★ 이 양식은 사장님 것이다. 마음대로 이모지를 넣거나 줄을 바꾸지 말 것.
//   라벨(행사명·장소·일시…)은 값이 비어도 남긴다 — 빈 칸이 보여야 채울 것이 보인다.

import type { Inquiry } from '@/lib/supabase/types'

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

/** 'YYYY-MM-DD' → 로컬 Date (UTC 로 새면 하루 밀린다) */
function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/** '10월 6일' */
export function fmtMd(s: string): string {
  const d = parseYmd(s)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

/** '6일(화)' — 일자별 시간 적을 때 쓰는 짧은 꼴 */
export function fmtDayShort(s: string): string {
  const d = parseYmd(s)
  return `${d.getDate()}일(${WEEKDAY[d.getDay()]})`
}

/** 일시 한 줄 — '10월 6일 ~ 10월 8일' / 하루면 '10월 6일' */
export function fmtPeriod(dates: string[]): string {
  if (dates.length === 0) return ''
  if (dates.length === 1) return fmtMd(dates[0])
  return `${fmtMd(dates[0])} ~ ${fmtMd(dates[dates.length - 1])}`
}

/** 문구에 들어가는 값들. 화면에서 사람이 고쳐 쓸 수 있게 전부 문자열로 받는다. */
export interface OutreachFields {
  event_name: string
  location: string
  period: string
  time: string
  service_type: string
  pay: string
  attire: string
  meal: string
  notes: string
  /** 특이사항 아래 붙는 덩어리 (일자별 시간 등). 비우면 붙지 않는다 */
  extra: string
}

/** 문의에서 읽어 기본값을 채운다. 사람이 화면에서 고칠 출발점이다. */
export function defaultFields(iq: Inquiry, dates: string[]): OutreachFields {
  return {
    event_name: iq.event_name || '',
    location: iq.location || '',
    period: fmtPeriod(dates),
    time: iq.event_time || '',
    service_type: iq.service_type || '',
    // 페이는 문의에 적힌 원문을 그대로 쓴다 ('시급12000', '팀장 18 / 스탭 14' 처럼
    // 사람이 쓰던 말이 그대로 크루에게 전해져야 오해가 없다)
    pay: iq.pay_detail || '',
    attire: iq.attire || '',
    meal: iq.meal || '',
    notes: '',
    extra: '',
  }
}

/** 길게 가는 행사는 일자별 시간을 깔지 않는다 — 12줄짜리 빈 목록은 지우는 게 일이다 */
const MAX_DAY_LINES = 7

/** 일자별 시간 적을 자리 — 며칠짜리면 날짜를 미리 깔아둔다.
 *  '6일(화):' 까지 적어두면 사람은 시간만 쓰면 된다. */

export function dayTimeSkeleton(dates: string[]): string {
  if (dates.length < 2 || dates.length > MAX_DAY_LINES) return ''
  return dates.map(d => `${fmtDayShort(d)}: `).join('\n')
}

/** 이름 자리에 들어갈 말. 비우면 '00님' 으로 둔다(사장님 양식 그대로). */
const who = (name?: string) => (name ? `${name}님` : '00님')

/** 섭외 문구 한 통. name 을 주면 그 사람 이름이 박힌다. */
export function buildOutreachMessage(f: OutreachFields, name?: string): string {
  const you = who(name)
  const lines = [
    `안녕하세요 ${you}! 잘 지내고 계시죠? 😊`,
    '',
    `늘 깔끔하고 센스 있게 일 잘해주셔서, 이번에도 꼭 ${you}이랑 같이 일하고 싶어 가장 먼저 일정 물어봅니다!`,
    '',
    '아래 일정 확인해보시고, 참여 가능하신지 편하게 답장 부탁드릴게요!',
    '',
    `행사명 : ${f.event_name}`,
    `장소 : ${f.location}`,
    `일시 : ${f.period}`,
    `시간 : ${f.time}`,
    `서비스종류 : ${f.service_type}`,
    `페이 : ${f.pay}`,
    `복장 : ${f.attire}`,
    `식사 : ${f.meal}`,
    `특이사항 : ${f.notes}`,
  ]
  const extra = f.extra.trim()
  if (extra) lines.push('', extra)
  return lines.join('\n')
}

/** 사람이 채워야 할 빈 칸 — 보내기 전에 짚어주기 위한 것 */
export function emptyFieldLabels(f: OutreachFields): string[] {
  const check: Array<[keyof OutreachFields, string]> = [
    ['event_name', '행사명'], ['location', '장소'], ['period', '일시'],
    ['time', '시간'], ['service_type', '서비스종류'], ['pay', '페이'],
  ]
  return check.filter(([k]) => !String(f[k]).trim()).map(([, label]) => label)
}
