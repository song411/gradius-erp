// 운영 캘린더 날짜 표시 유틸
// ─────────────────────────────────────────────────────────
// 표·월달력·주간뷰가 같은 표기를 써야 실무자가 화면을 옮겨다녀도 헷갈리지 않는다.
// 계산 규칙(matrixCore)과 달리 여기는 "보여주는 방법"만 모은다.

import { DOW, pad } from './matrixCore'

/** '2026-09-03' → '9/3' */
export const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

/** '2026-09-03' → '목' */
export const dowOf = (d: string) => DOW[new Date(d + 'T00:00:00').getDay()]

export const isWeekend = (d: string) => {
  const g = new Date(d + 'T00:00:00').getDay()
  return g === 0 || g === 6
}

/** b - a (일 단위). 양끝을 자정으로 고정해 서머타임·시분 영향을 받지 않는다. */
export const dayDiff = (a: string, b: string) =>
  (new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000

/** ['2026-08-01','2026-08-02','2026-08-05'] → '8/1–8/2, 8/5' */
export function compressDates(dates: string[]): string {
  const sorted = [...dates].sort()
  const out: string[] = []
  let i = 0
  while (i < sorted.length) {
    let j = i
    while (j + 1 < sorted.length && dayDiff(sorted[j], sorted[j + 1]) === 1) j++
    out.push(i === j ? md(sorted[i]) : `${md(sorted[i])}–${md(sorted[j])}`)
    i = j + 1
  }
  return out.join(', ')
}

/** 해당 월의 1일~말일을 'YYYY-MM-DD' 배열로 */
export function monthDatesOf(year: number, month: number): string[] {
  const key = `${year}-${pad(month + 1)}`
  const last = new Date(year, month + 1, 0).getDate()
  return Array.from({ length: last }, (_, i) => `${key}-${pad(i + 1)}`)
}

/** 월 달력 그리드용 주(week) 분할.
 *  앞뒤를 인접 월 날짜로 채워 항상 7칸씩 떨어지게 만든다.
 *  빈 칸(null)으로 두면 여러 날 행사 막대가 월 경계에서 끊겨 보이므로,
 *  실제 날짜를 넣고 inMonth 플래그로만 흐리게 표시한다. */
export interface GridDay {
  date: string
  day: number
  inMonth: boolean
}

/** 'YYYY-MM-DD' 에 n일을 더한 날짜 */
export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 그 날짜가 속한 주의 일요일 */
export function weekStartOf(date: string): string {
  const d = new Date(date + 'T00:00:00')
  return addDays(date, -d.getDay())
}

/** 그 날짜가 속한 주의 7일 (일~토) */
export function weekOf(date: string): GridDay[] {
  const start = weekStartOf(date)
  const anchorMonth = date.substring(0, 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i)
    return { date: d, day: Number(d.slice(8, 10)), inMonth: d.substring(0, 7) === anchorMonth }
  })
}

export function monthGrid(year: number, month: number): GridDay[][] {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())   // 그 주의 일요일
  const weeks: GridDay[][] = []
  const cur = new Date(start)

  // 6주(42칸)를 채우되, 마지막 주가 통째로 다음 달이면 버린다
  for (let w = 0; w < 6; w++) {
    const week: GridDay[] = []
    for (let i = 0; i < 7; i++) {
      week.push({
        date: `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`,
        day: cur.getDate(),
        inMonth: cur.getMonth() === month && cur.getFullYear() === year,
      })
      cur.setDate(cur.getDate() + 1)
    }
    if (w >= 4 && week.every(d => !d.inMonth)) break
    weeks.push(week)
  }
  return weeks
}
