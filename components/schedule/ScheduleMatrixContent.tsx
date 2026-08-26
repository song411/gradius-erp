'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, AlertTriangle, Download, Search, X, CalendarDays,
} from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/lib/supabase/api'
import type { Assignment, Estimate, EstimateItem, Inquiry } from '@/lib/supabase/types'
import { Input } from '@/components/ui/input'
import EventDetailPanel from './EventDetailPanel'
import { StickyNote } from 'lucide-react'
import {
  CONTRACTED_STATUSES, CONFIG_TAG, DOW, EMPTY_CONFIG,
  type JobBase, type JobCell, type MemoRecord,
  pad, fmt, todayLocal, cleanStaffName, parseConfigs, buildJobs, makeCell, splitByDate, coversDate,
  cellState, STATE_STYLE, STATUS_CHIP, actualPayRate, marginRate, payRateSuspicious,
} from './matrixCore'

// ─── 화면 전용 타입 ───────────────────────────────────────
interface EventBase {
  inq: Inquiry
  jobs: JobBase[]
  hasFinalEstimate: boolean
  discountLabel: string | null   // 할인이 걸려 있으면 청구단가에 주의 표시
  memoCount: number              // 스케줄 설정 레코드를 뺀 실제 메모 수
  latestMemo: string | null      // 가장 최근 메모 한 줄 (툴팁)
  /** 어느 견적 직무에도 붙지 못한 배정 인원 수.
   *  이 인원이 있으면 다른 직무의 '미배정'은 사람이 없다는 뜻이 아니다. */
  unassignedJob: number
}

/** 행사 × 직무의 "편성이 동일한 연속 구간" 한 줄.
 *  배정에 work_dates를 지정하지 않으면 전체기간 투입으로 처리되므로,
 *  7일 행사는 7일 내내 같은 인원이 반복된다. 날짜마다 한 줄씩 뿌리면
 *  같은 내용이 7번 나와 읽을 수 없다. 그래서 구간 단위로 접는다.
 *  인원이 바뀌는 날에는 구간이 저절로 끊기므로 변화는 놓치지 않는다. */
interface Run {
  base: EventBase
  cell: JobCell        // 구간 대표 셀 (구간 내 모든 날짜가 동일)
  start: string
  end: string
  days: number
  hasToday: boolean
  allWeekend: boolean
}

interface Conflict {
  name: string
  events: string[]
  dates: string[]
}

// ─── 날짜 표기 ────────────────────────────────────────────
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
const dowOf = (d: string) => DOW[new Date(d + 'T00:00:00').getDay()]
const isWeekend = (d: string) => {
  const g = new Date(d + 'T00:00:00').getDay()
  return g === 0 || g === 6
}
const dayDiff = (a: string, b: string) =>
  (new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000

/** ['2026-08-01','2026-08-02','2026-08-05'] → '8/1–8/2, 8/5' */
function compressDates(dates: string[]): string {
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

// ─── 인력 칩 ─────────────────────────────────────────────
function StaffChip({ asgn, whole }: { asgn: Assignment; whole: boolean }) {
  const cls = whole
    ? 'bg-white text-gray-500 border-dashed border-gray-300'
    : (STATUS_CHIP[asgn.status] ?? 'bg-gray-50 text-gray-600 border-gray-200')
  const tip = [
    cleanStaffName(asgn.staff_name),
    asgn.status,
    whole ? '전체기간 투입(날짜 미지정)' : null,
    asgn.role_type ?? null,
    `지급 ${fmt(asgn.pay_rate)}원`,
    asgn.is_payable === false ? '무급' : null,
    asgn.phone ?? null,
  ].filter(Boolean).join(' · ')

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] leading-none px-1.5 py-1 rounded border ${cls}`}
      title={tip}
    >
      {asgn.role_type === '팀장' && <span className="text-[9px] font-bold text-indigo-500">팀</span>}
      {cleanStaffName(asgn.staff_name)}
      {whole && <span className="text-[9px] text-gray-400">전</span>}
      {asgn.is_payable === false && <span className="text-[9px] text-purple-400">무</span>}
    </span>
  )
}

function Th({
  width, align = 'left', children,
}: { width: string; align?: 'left' | 'center' | 'right'; children: React.ReactNode }) {
  const at = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'
  return (
    <th className={`bg-gray-100 px-2 py-2 font-bold text-[11px] text-gray-600 tracking-wide
      border-b-2 border-gray-300 whitespace-nowrap ${width} ${at}`}>
      {children}
    </th>
  )
}

// ═════════════════════════════════════════════════════════
export default function ScheduleMatrixContent() {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())   // 0-indexed

  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [events,    setEvents]    = useState<EventBase[]>([])
  const [loadingInq,   setLoadingInq]   = useState(true)
  const [loadingMonth, setLoadingMonth] = useState(false)

  const [query,       setQuery]       = useState('')
  const [onlyProblem, setOnlyProblem] = useState(false)
  const [expandDays,  setExpandDays]  = useState(false)
  const [detailInq,   setDetailInq]   = useState<Inquiry | null>(null)
  const [exporting,   setExporting]   = useState(false)

  const monthKey = `${year}-${pad(month + 1)}`
  const today    = todayLocal()

  const monthDates = useMemo(() => {
    const lastDay = new Date(year, month + 1, 0).getDate()
    return Array.from({ length: lastDay }, (_, i) => `${monthKey}-${pad(i + 1)}`)
  }, [year, month, monthKey])

  // ── 행사 전체 1회 조회 (월 이동 시 재조회 불필요) ──────
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const rows = await db.list<Inquiry>('inquiries', { order: 'event_start', asc: false })
        if (alive) setInquiries(rows)
      } catch (e) {
        toast.error('행사 조회 실패: ' + (e as Error).message)
      } finally {
        if (alive) setLoadingInq(false)
      }
    })()
    return () => { alive = false }
  }, [])

  // ── 이 달에 걸쳐 있는 체결 이상 행사 ────────────────────
  const monthInqs = useMemo(() => inquiries.filter(inq => {
    if (!CONTRACTED_STATUSES.includes(inq.status)) return false
    if (!inq.event_start) return false
    const s = inq.event_start.substring(0, 7)
    const e = inq.event_end ? inq.event_end.substring(0, 7) : s
    return s <= monthKey && monthKey <= e
  }), [inquiries, monthKey])

  // ── 월 단위 상세 조회 (견적 / 배정 / 스케줄설정) ────────
  // 대상 행사 id로 in 필터를 걸어 4개 쿼리로 끝낸다 (행사별 개별 조회 = N+1 금지)
  const loadMonth = useCallback(async (inqs: Inquiry[]) => {
    if (inqs.length === 0) { setEvents([]); return }
    setLoadingMonth(true)
    try {
      const ids = inqs.map(i => i.id)

      const [ests, assigns, memos] = await Promise.all([
        db.list<Estimate>('estimates',       { inFilter: { inquiry_id: ids }, order: 'created_at', asc: false }),
        db.list<Assignment>('assignments',   { inFilter: { inquiry_id: ids }, order: 'assigned_at', asc: true }),
        db.list<MemoRecord>('project_memos', { inFilter: { inquiry_id: ids }, order: 'created_at', asc: true })
          .catch(() => [] as MemoRecord[]),
      ])

      // 행사별 최종 확정 견적 (is_final, created_at desc 정렬이므로 첫 건이 최신)
      const finalByInq = new Map<string, Estimate>()
      ests.forEach(e => {
        if (!e.is_final || !e.inquiry_id) return
        if (!finalByInq.has(e.inquiry_id)) finalByInq.set(e.inquiry_id, e)
      })

      const finalIds = [...finalByInq.values()].map(e => e.id)
      const items = finalIds.length
        ? await db.list<EstimateItem>('estimate_items', {
            inFilter: { estimate_id: finalIds }, order: 'sort_order', asc: true,
          })
        : []

      const itemsByEst = new Map<string, EstimateItem[]>()
      items.forEach(it => {
        if (!it.estimate_id) return
        const arr = itemsByEst.get(it.estimate_id)
        if (arr) arr.push(it); else itemsByEst.set(it.estimate_id, [it])
      })

      const asgnByInq = new Map<string, Assignment[]>()
      assigns.filter(a => a.status !== '취소').forEach(a => {
        if (!a.inquiry_id) return
        const arr = asgnByInq.get(a.inquiry_id)
        if (arr) arr.push(a); else asgnByInq.set(a.inquiry_id, [a])
      })

      const cfgByInq = parseConfigs(memos)

      // 메모 표시용 집계 — 스케줄 설정 레코드는 메모가 아니므로 제외
      const memoByInq = new Map<string, { count: number; latest: string }>()
      memos.forEach(m => {
        if (!m.content || m.content.startsWith(CONFIG_TAG)) return
        const cur = memoByInq.get(m.inquiry_id)
        if (cur) cur.count += 1
        else memoByInq.set(m.inquiry_id, { count: 1, latest: m.content })
      })

      const built: EventBase[] = inqs.map(inq => {
        const est  = finalByInq.get(inq.id)
        const its  = est ? (itemsByEst.get(est.id) ?? []) : []
        const cfg  = cfgByInq.get(inq.id) ?? EMPTY_CONFIG
        const disc = est && est.discount_type && est.discount_type !== 'none' && (est.discount_value ?? 0) > 0
          ? (est.discount_label
              || (est.discount_type === 'percentage'
                    ? `${est.discount_value}% 할인`
                    : `${fmt(est.discount_value ?? 0)}원 할인`))
          : null
        const memo = memoByInq.get(inq.id)
        const jobs = buildJobs(its, asgnByInq.get(inq.id) ?? [], cfg)
        return {
          inq,
          jobs,
          unassignedJob: jobs.filter(g => g.unmatched)
            .reduce((n, g) => n + g.assignments.length, 0),
          hasFinalEstimate: !!est,
          discountLabel: disc,
          memoCount: memo?.count ?? 0,
          latestMemo: memo?.latest ?? null,
        }
      })

      setEvents(built)
    } catch (e) {
      toast.error('상세 조회 실패: ' + (e as Error).message)
      setEvents([])
    } finally {
      setLoadingMonth(false)
    }
  }, [])

  useEffect(() => {
    if (loadingInq) return
    let alive = true
    // 마이크로태스크로 미뤄 effect 동기 구간에서 setState하지 않는다
    Promise.resolve().then(() => { if (alive) loadMonth(monthInqs) })
    return () => { alive = false }
  }, [monthInqs, loadingInq, loadMonth])

  // ── 구간(Run) 생성 ──────────────────────────────────────
  const runs = useMemo<Run[]>(() => {
    const out: Run[] = []

    events.forEach(base => {
      const active = monthDates.filter(d => coversDate(base.inq.event_start, base.inq.event_end, d))
      if (active.length === 0) return

      base.jobs.forEach(job => {
        const cells = active.map(d => ({ date: d, cell: makeCell(job, d) }))
        // 편성 지문: 필요 인원 + 투입된 배정 id 집합
        const sigOf = (c: JobCell) =>
          `${job.required}|${[...c.pinned, ...c.allPeriod].map(a => a.id).sort().join(',')}`

        let i = 0
        while (i < cells.length) {
          let j = i
          if (!expandDays) {
            while (
              j + 1 < cells.length &&
              dayDiff(cells[j].date, cells[j + 1].date) === 1 &&
              sigOf(cells[j].cell) === sigOf(cells[j + 1].cell)
            ) j++
          }
          const span = cells.slice(i, j + 1)
          out.push({
            base,
            cell: cells[i].cell,
            start: cells[i].date,
            end: cells[j].date,
            days: span.length,
            hasToday: span.some(s => s.date === today),
            allWeekend: span.every(s => isWeekend(s.date)),
          })
          i = j + 1
        }
      })
    })

    // 시작일 → 종료일 → 고객사 → 행사 → 필요인원 많은 직무 순
    out.sort((a, b) =>
      a.start.localeCompare(b.start) ||
      a.end.localeCompare(b.end) ||
      (a.base.inq.company_name ?? '').localeCompare(b.base.inq.company_name ?? '') ||
      (a.base.inq.event_name ?? '').localeCompare(b.base.inq.event_name ?? '') ||
      b.cell.job.required - a.cell.job.required ||
      a.cell.job.label.localeCompare(b.cell.job.label),
    )
    return out
  }, [events, monthDates, expandDays, today])

  // ── 필터 적용 ───────────────────────────────────────────
  const visibleRuns = useMemo(() => {
    const q = query.trim().toLowerCase()
    return runs.filter(r => {
      if (onlyProblem) {
        const st = cellState(r.cell.total, r.cell.job.required)
        if (st !== 'none' && st !== 'short') return false
      }
      if (!q) return true
      const hay = [
        r.base.inq.event_name, r.base.inq.company_name, r.cell.job.label,
        ...[...r.cell.pinned, ...r.cell.allPeriod].map(a => cleanStaffName(a.staff_name)),
      ].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [runs, query, onlyProblem])

  // ── 중복배정 (날짜 단위로만 판정 가능하므로 별도 집계) ──
  const conflicts = useMemo<Conflict[]>(() => {
    // (크루, 행사조합) → 날짜 목록
    const acc = new Map<string, Conflict>()
    monthDates.forEach(date => {
      const where = new Map<string, Set<string>>()
      events.forEach(ev => {
        if (!coversDate(ev.inq.event_start, ev.inq.event_end, date)) return
        const title = ev.inq.event_name || ev.inq.company_name || '(무제)'
        ev.jobs.forEach(job => {
          const { pinned, allPeriod } = splitByDate(job.assignments, date)
          for (const a of [...pinned, ...allPeriod]) {
            const name = cleanStaffName(a.staff_name)
            if (name === '(미상)') continue
            const set = where.get(name) ?? new Set<string>()
            set.add(title)
            where.set(name, set)
          }
        })
      })
      where.forEach((set, name) => {
        if (set.size < 2) return
        const evs = [...set].sort()
        const key = `${name}|${evs.join('|')}`
        const cur = acc.get(key)
        if (cur) cur.dates.push(date)
        else acc.set(key, { name, events: evs, dates: [date] })
      })
    })
    return [...acc.values()].sort((a, b) => a.dates[0].localeCompare(b.dates[0]))
  }, [events, monthDates])

  // ── 월 요약 ─────────────────────────────────────────────
  const summary = useMemo(() => {
    let required = 0, filled = 0, gaps = 0
    visibleRuns.forEach(r => {
      required += r.cell.job.required
      filled   += r.cell.total
      const st = cellState(r.cell.total, r.cell.job.required)
      if (st === 'none' || st === 'short') gaps += 1
    })
    return {
      eventCount: new Set(visibleRuns.map(r => r.base.inq.id)).size,
      runCount: visibleRuns.length,
      required, filled, gaps,
    }
  }, [visibleRuns])

  // ── 월 이동 ─────────────────────────────────────────────
  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }
  const goToday   = () => { const d = new Date(); setYear(d.getFullYear()); setMonth(d.getMonth()) }

  // ── 엑셀 내보내기 ───────────────────────────────────────
  async function exportExcel() {
    if (visibleRuns.length === 0) { toast.error('내보낼 내용이 없습니다.'); return }
    setExporting(true)
    try {
      // exceljs는 브라우저에서 UMD 번들로 해석되므로 동적 import 후 default를 벗겨낸다
      type ExcelJSModule = { Workbook: new () => import('exceljs').Workbook }
      const mod = await import('exceljs')
      const ExcelJS = ((mod as unknown as { default?: ExcelJSModule }).default
        ?? (mod as unknown as ExcelJSModule))
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet(`${year}-${pad(month + 1)}`, {
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      })

      ws.addRow([
        '시작일', '종료일', '일수', '요일', '고객사', '행사명', '직무', '필요', '배정', '상태',
        '배정 인원', '청구단가', '지급단가(실제)', '지급단가(계획)', '마진율', '비고',
      ])
      ws.getRow(1).font = { bold: true }
      ws.getRow(1).eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
        c.border = { bottom: { style: 'medium' } }
      })

      visibleRuns.forEach(r => {
        const c = r.cell
        const names = [
          ...c.pinned.map(a => `${cleanStaffName(a.staff_name)}(${a.status})`),
          ...c.allPeriod.map(a => `${cleanStaffName(a.staff_name)}(전기간)`),
        ].join(', ')
        const st  = cellState(c.total, c.job.required)
        const act = actualPayRate(c)
        const mr  = marginRate(c.job.billRate, act.avg)
        const sus = payRateSuspicious(c.job.billRate, act)
        ws.addRow([
          r.start, r.end, r.days,
          r.days === 1 ? dowOf(r.start) : `${dowOf(r.start)}~${dowOf(r.end)}`,
          r.base.inq.company_name ?? '', r.base.inq.event_name ?? '',
          c.job.label, c.job.required, c.total,
          STATE_STYLE[st].label(c.total, c.job.required),
          names,
          c.job.billRate || null,
          act.mixed ? '혼재' : (act.value || null),
          c.job.planPayRate || null,
          mr === null ? null : Number(mr.toFixed(1)),
          sus ? '지급단가 확인필요 (팀 일괄지급 또는 총액 입력)' : '',
        ])
      })

      if (conflicts.length > 0) {
        ws.addRow([])
        ws.addRow(['중복배정'])
        ws.getRow(ws.rowCount).font = { bold: true }
        conflicts.forEach(cf => {
          ws.addRow([compressDates(cf.dates), '', cf.dates.length, '', '', cf.events.join(' / '), cf.name])
        })
      }

      const widths = [12, 12, 6, 10, 20, 28, 14, 6, 6, 16, 46, 12, 14, 14, 8, 28]
      widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
      ;[12, 13, 14].forEach(i => { ws.getColumn(i).numFmt = '#,##0' })
      ws.getColumn(15).numFmt = '0.0"%"'
      ws.views = [{ state: 'frozen', ySplit: 1 }]
      ws.pageSetup.printTitlesRow = '1:1'

      const buf  = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `운영캘린더_${year}-${pad(month + 1)}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('엑셀 파일이 다운로드되었습니다.')
    } catch (e) {
      toast.error('엑셀 생성 실패: ' + (e as Error).message)
    } finally {
      setExporting(false)
    }
  }

  const busy = loadingInq || loadingMonth

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── 툴바 ── */}
      <div className="shrink-0 px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <button onClick={prevMonth} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="이전 달">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-base font-bold text-gray-900 tabular-nums min-w-[110px] text-center">
              {year}년 {month + 1}월
            </span>
            <button onClick={nextMonth} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="다음 달">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={goToday}
              className="ml-1 text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:border-gray-400"
            >
              오늘
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">
              행사 {summary.eventCount}건 · {summary.runCount}개 구간
            </span>
            <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">
              배정 {summary.filled} / 필요 {summary.required}명
            </span>
            {summary.gaps > 0 && (
              <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 font-semibold">
                미충족 {summary.gaps}건
              </span>
            )}
            {conflicts.length > 0 && (
              <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 font-semibold inline-flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> 중복배정 {conflicts.length}건
              </span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="행사 · 고객사 · 크루 이름"
                className="h-8 pl-7 pr-7 text-xs w-56"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={onlyProblem}
                onChange={e => setOnlyProblem(e.target.checked)}
                className="accent-blue-600"
              />
              미충족만
            </label>
            <label
              className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none whitespace-nowrap"
              title="끄면 편성이 같은 연속 날짜를 한 줄로 묶습니다. 켜면 하루씩 모두 펼칩니다."
            >
              <input
                type="checkbox"
                checked={expandDays}
                onChange={e => setExpandDays(e.target.checked)}
                className="accent-blue-600"
              />
              하루씩 펼치기
            </label>
            <button
              onClick={exportExcel}
              disabled={exporting || busy}
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-400 disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? '생성 중…' : '엑셀'}
            </button>
          </div>
        </div>
      </div>

      {/* ── 본문 ── */}
      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-3">
        {/* 중복배정 경고 — 날짜 단위 판정이므로 표와 별도로 항상 보여준다 */}
        {!busy && conflicts.length > 0 && (
          <div className="rounded-xl border-2 border-red-200 bg-red-50 p-3">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-red-700 mb-2">
              <AlertTriangle className="h-4 w-4" />
              같은 날 두 곳에 배정된 크루 {conflicts.length}건
            </div>
            <div className="grid gap-x-3 gap-y-1 text-[11px]"
              style={{ gridTemplateColumns: 'minmax(0,max-content) minmax(0,max-content) minmax(0,1fr)' }}
            >
              {conflicts.map(cf => (
                <div key={`${cf.name}|${cf.events.join('|')}`} className="contents">
                  <span className="font-bold text-red-800 truncate max-w-[160px]" title={cf.name}>
                    {cf.name}
                  </span>
                  <span className="text-red-700 tabular-nums whitespace-nowrap">
                    {compressDates(cf.dates)}
                  </span>
                  <span className="text-red-600 min-w-0">{cf.events.join('  ↔  ')}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-red-500 mt-2">
              배정에 근무일(work_dates)이 지정되지 않은 인력은 행사 전체 기간에 투입된 것으로 계산됩니다.
              실제로는 날짜가 갈리는 경우라면 인원배정 화면에서 날짜를 지정해 주세요.
            </p>
          </div>
        )}

        {busy ? (
          <div className="flex items-center justify-center h-40 text-sm text-gray-400">불러오는 중…</div>
        ) : visibleRuns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <CalendarDays className="h-8 w-8" />
            <p className="text-sm">
              {monthInqs.length === 0
                ? `${month + 1}월에 체결된 행사가 없습니다.`
                : '조건에 맞는 항목이 없습니다.'}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border-2 border-gray-200 overflow-hidden bg-white">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10">
                <tr>
                  <Th width="w-[104px]">기간</Th>
                  <Th width="w-[210px]">행사 / 고객사</Th>
                  <Th width="w-[120px]">직무</Th>
                  <Th width="w-[54px]" align="center">필요</Th>
                  <Th width="w-[54px]" align="center">배정</Th>
                  <Th width="w-[112px]">상태</Th>
                  <Th width="min-w-[280px]">배정 인원</Th>
                  <Th width="w-[104px]" align="right">청구단가</Th>
                  <Th width="w-[132px]" align="right">
                    지급단가<span className="font-normal text-gray-400"> 실제/계획</span>
                  </Th>
                  <Th width="w-[70px]" align="right">마진</Th>
                </tr>
              </thead>
              <tbody>
                {visibleRuns.map((r, idx) => {
                  const c   = r.cell
                  const st  = cellState(c.total, c.job.required)
                  const sty = STATE_STYLE[st]
                  const act = actualPayRate(c)
                  const mr  = marginRate(c.job.billRate, act.avg)
                  const sus = payRateSuspicious(c.job.billRate, act)

                  // 같은 기간 · 같은 행사의 연속 행에서 행사 셀을 한 번만 그린다
                  const key  = `${r.start}|${r.end}|${r.base.inq.id}`
                  const prev = idx > 0 ? visibleRuns[idx - 1] : null
                  const prevKey = prev ? `${prev.start}|${prev.end}|${prev.base.inq.id}` : null
                  const isHead  = key !== prevKey
                  let groupSpan = 1
                  if (isHead) {
                    let k = idx + 1
                    while (k < visibleRuns.length) {
                      const n = visibleRuns[k]
                      if (`${n.start}|${n.end}|${n.base.inq.id}` !== key) break
                      groupSpan++; k++
                    }
                  }

                  return (
                    <tr
                      key={`${key}|${c.job.jobType}`}
                      className={`border-t border-gray-100 hover:bg-blue-50/40 ${
                        r.allWeekend ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      {/* 기간 + 행사 — 구간·행사 단위로 1회 */}
                      {isHead && (
                        <>
                          <td
                            rowSpan={groupSpan}
                            className={`align-top px-2 py-2 border-r border-gray-200 ${
                              r.hasToday ? 'bg-blue-600 text-white'
                                : r.allWeekend ? 'bg-amber-50' : 'bg-gray-50'
                            }`}
                          >
                            <div className="text-sm font-extrabold tabular-nums leading-tight">
                              {r.days === 1 ? md(r.start) : `${md(r.start)}–${md(r.end)}`}
                            </div>
                            <div className={`text-[10px] ${
                              r.hasToday ? 'text-blue-100'
                                : r.days === 1 && dowOf(r.start) === '일' ? 'text-red-500'
                                : r.days === 1 && dowOf(r.start) === '토' ? 'text-blue-500'
                                : 'text-gray-400'
                            }`}>
                              {r.days === 1 ? dowOf(r.start) : `${dowOf(r.start)}~${dowOf(r.end)} · ${r.days}일`}
                            </div>
                            {r.hasToday && (
                              <div className="text-[10px] font-bold text-white mt-0.5">오늘 포함</div>
                            )}
                          </td>

                          <td
                            rowSpan={groupSpan}
                            className="align-top px-2 py-2 border-r border-gray-200 bg-gray-50/60"
                          >
                            <button
                              onClick={() => setDetailInq(r.base.inq)}
                              className="text-left font-semibold text-gray-800 hover:text-blue-600 hover:underline leading-tight"
                              title="클릭하면 이 행사의 모든 정보를 봅니다"
                            >
                              {r.base.inq.event_name || '(행사명 없음)'}
                            </button>
                            <div className="text-[11px] text-gray-500 mt-0.5">
                              {r.base.inq.company_name || '-'}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white border border-gray-200 text-gray-500">
                                {r.base.inq.status}
                              </span>
                              {r.base.inq.event_time && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white border border-gray-200 text-gray-500">
                                  {r.base.inq.event_time}
                                </span>
                              )}
                              {!r.base.hasFinalEstimate && (
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-600"
                                  title="확정(최종) 견적이 없어 청구·지급 단가와 필요인원을 산출할 수 없습니다"
                                >
                                  확정견적 없음
                                </span>
                              )}
                              {r.base.unassignedJob > 0 && (
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-600 font-semibold"
                                  title="배정은 돼 있으나 job_type이 입력되지 않은 인원입니다. 견적 직무가 여러 개라 어느 직무인지 자동으로 정할 수 없어 아래 '직무 미지정' 줄에 모아 두었습니다. 그래서 다른 직무의 '미배정'은 사람이 아예 없다는 뜻이 아닙니다."
                                >
                                  직무 미지정 {r.base.unassignedJob}명
                                </span>
                              )}
                              {r.base.memoCount > 0 && (
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-600 inline-flex items-center gap-0.5"
                                  title={r.base.latestMemo ?? undefined}
                                >
                                  <StickyNote className="h-2.5 w-2.5" />
                                  메모 {r.base.memoCount}
                                </span>
                              )}
                              {r.base.discountLabel && (
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700"
                                  title={`견적에 ${r.base.discountLabel}이 적용되어 있어 실제 청구액은 품목 단가 합계와 다릅니다`}
                                >
                                  {r.base.discountLabel}
                                </span>
                              )}
                            </div>
                            <Link
                              href={`/inquiries/${r.base.inq.id}`}
                              className="inline-block mt-1 text-[10px] text-blue-500 hover:underline"
                            >
                              문의 상세 →
                            </Link>
                          </td>
                        </>
                      )}

                      {/* 직무 */}
                      <td className="px-2 py-2 align-top">
                        <div className="font-semibold text-gray-700">
                          {c.job.label}
                          {c.job.approx && (
                            <span
                              className="ml-1 text-[9px] font-bold text-indigo-500 align-middle"
                              title="배정 직무명이 견적 직무명과 정확히 같지 않아 기본 직무명으로 묶었습니다"
                            >
                              묶음
                            </span>
                          )}
                          {c.job.inferred ? (
                            <span
                              className="ml-1 text-[9px] font-bold text-teal-600 align-middle"
                              title={`직무가 입력되지 않은 ${c.job.inferred}명을 이 직무로 넣었습니다. 이 행사의 견적 직무가 하나뿐이라 다른 직무일 수 없습니다.`}
                            >
                              +{c.job.inferred} 자동
                            </span>
                          ) : null}
                          {c.job.unmatched && (
                            <span
                              className="ml-1 text-[9px] font-bold text-gray-400 align-middle"
                              title="배정에 job_type이 입력되지 않았거나 견적 직무명과 달라 어느 직무인지 알 수 없는 인원입니다"
                            >
                              미매칭
                            </span>
                          )}
                        </div>
                        {c.job.approx && (
                          <div className="text-[10px] text-indigo-400 leading-tight">
                            {c.job.approx.sources.map(x => `${x.label} ${x.required}`).join(' · ')}
                          </div>
                        )}
                        {c.job.days > 1 && (
                          <div className="text-[10px] text-gray-400">견적 {c.job.days}일</div>
                        )}
                      </td>

                      {/* 필요 / 배정 */}
                      <td className="px-2 py-2 text-center align-top tabular-nums text-gray-600">
                        {c.job.required > 0 ? c.job.required : '-'}
                      </td>
                      <td className="px-2 py-2 text-center align-top tabular-nums font-bold text-gray-800">
                        {c.total}
                      </td>

                      {/* 상태 */}
                      <td className="px-2 py-2 align-top">
                        <span className={`inline-block text-[10px] font-semibold px-1.5 py-1 rounded border ${sty.chip}`}>
                          {sty.label(c.total, c.job.required)}
                        </span>
                      </td>

                      {/* 배정 인원 — 이름 전부 노출 */}
                      <td className="px-2 py-2 align-top">
                        {c.total === 0 ? (
                          <span className="text-[11px] text-gray-300">배정된 인원이 없습니다</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {c.pinned.map(a => <StaffChip key={a.id} asgn={a} whole={false} />)}
                            {c.allPeriod.map(a => <StaffChip key={a.id} asgn={a} whole />)}
                          </div>
                        )}
                      </td>

                      {/* 청구단가 */}
                      <td className="px-2 py-2 text-right align-top tabular-nums">
                        {c.job.billRate ? (
                          <>
                            <span className="font-semibold text-gray-800">{fmt(c.job.billRate)}</span>
                            {c.job.approx && c.job.approx.billRange[0] !== c.job.approx.billRange[1] && (
                              <div className="text-[10px] text-gray-400">
                                {fmt(c.job.approx.billRange[0])}~{fmt(c.job.approx.billRange[1])}
                              </div>
                            )}
                          </>
                        ) : <span className="text-gray-300">-</span>}
                      </td>

                      {/* 지급단가 실제 / 계획 */}
                      <td className="px-2 py-2 text-right align-top tabular-nums">
                        {sus && (
                          <span
                            className="inline-block mr-1 text-amber-500 align-middle"
                            title="지급단가가 청구단가보다 큽니다. 팀 단위 일괄지급(팀장에게 팀 전체 금액)이거나, 여러 날 근무분이 총액으로 들어가고 근무일수가 1로 남은 경우일 수 있습니다. 적자라는 뜻은 아닙니다."
                          >
                            <AlertTriangle className="h-3 w-3 inline" />
                          </span>
                        )}
                        {act.mixed ? (
                          <span
                            className="font-semibold text-orange-600"
                            title={`인원별 지급단가가 다릅니다: ${act.list.map(v => fmt(v)).join(' / ')}원`}
                          >
                            혼재
                          </span>
                        ) : act.value ? (
                          <span className={`font-semibold ${
                            c.job.planPayRate && act.value !== c.job.planPayRate
                              ? 'text-orange-600' : 'text-gray-800'
                          }`}>
                            {fmt(act.value)}
                          </span>
                        ) : <span className="text-gray-300">-</span>}
                        <div className="text-[10px] text-gray-400">
                          계획 {c.job.planPayRate ? fmt(c.job.planPayRate) : '-'}
                          {!act.mixed && act.value > 0 && c.job.planPayRate > 0
                            && act.value !== c.job.planPayRate && (
                            <span className={act.value > c.job.planPayRate ? ' text-red-500' : ' text-green-600'}>
                              {' '}{act.value > c.job.planPayRate ? '▲' : '▼'}
                              {fmt(Math.abs(act.value - c.job.planPayRate))}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 마진 */}
                      <td className="px-2 py-2 text-right align-top tabular-nums">
                        {mr === null ? (
                          <span className="text-gray-300">-</span>
                        ) : sus ? (
                          // 단가 데이터가 의심스러울 때 붉은 적자로 단정하지 않는다
                          <span
                            className="font-bold text-amber-600"
                            title={`계산값 ${mr.toFixed(1)}% — 팀 일괄지급이거나 총액이 한 건에 잡힌 경우일 수 있어 마진으로 읽지 마세요`}
                          >
                            확인필요
                          </span>
                        ) : (
                          <span className={`font-bold ${
                            mr < 0 ? 'text-red-600' : mr < 20 ? 'text-orange-600' : 'text-gray-800'
                          }`}>
                            {mr.toFixed(1)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 범례 */}
        {!busy && visibleRuns.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-400">
            <span className="font-semibold text-gray-500">범례</span>
            <span><span className="inline-block w-2 h-2 rounded-sm bg-green-400 mr-1" />확정</span>
            <span><span className="inline-block w-2 h-2 rounded-sm bg-yellow-400 mr-1" />배정중</span>
            <span><span className="inline-block w-2 h-2 rounded-sm bg-blue-400 mr-1" />후보</span>
            <span>
              <span className="inline-block w-2 h-2 rounded-sm border border-dashed border-gray-400 mr-1" />
              전 = 날짜 미지정(전체기간) 배정
            </span>
            <span>무 = 무급 · 팀 = 팀장</span>
            <span>기간이 묶여 있으면 그 날짜 내내 편성이 같다는 뜻입니다</span>
            <span>행사명을 클릭하면 전체 정보가 열립니다</span>
          </div>
        )}
      </div>

      {/* ── 상세 패널 ── */}
      {detailInq && (
        <EventDetailPanel inquiry={detailInq} onClose={() => setDetailInq(null)} />
      )}
    </div>
  )
}
