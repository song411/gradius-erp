'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Download, CalendarDays, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import type { Assignment, Inquiry } from '@/lib/supabase/types'
import { StickyNote } from 'lucide-react'
import {
  type JobBase, type JobCell,
  pad, fmt, cleanStaffName, makeCell, coversDate,
  cellState, STATE_STYLE, STATUS_CHIP, actualPayRate, jobMoney, type JobMoney,
} from './matrixCore'
import { md, dowOf, isWeekend, dayDiff, compressDates } from './dateUtils'
import type { EventBase, ScheduleData } from './useScheduleData'

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

/** 인원배정 화면 딥링크 — 행사를 자동 선택하고 해당 직무로 스크롤한다 */
function asgnHref(inqId: string, jobType: string) {
  const q = new URLSearchParams({ inq: inqId })
  if (jobType) q.set('job', jobType)
  return `/assignments?${q}`
}

/** 청구 합계의 내역(단가 × 필요 × 일수)이 합계와 정확히 맞는지.
 *  견적 라인이 여러 개거나 실무자가 필요인원을 고친 직무는 맞지 않으므로,
 *  틀린 곱셈식을 보여주지 않고 단가만 표시한다. */
function breakdownExact(job: JobBase) {
  return job.billRate * job.required * (job.days || 1) === job.billTotal
}

function billTip(job: JobBase, m: JobMoney) {
  const parts = [
    `청구 합계 ${fmt(m.billTotal)}원 — 확정 견적의 '${job.label}' 라인 금액 합계입니다.`,
    '행사 전체 기준이며 구간별로 나눈 금액이 아닙니다.',
  ]
  if (!breakdownExact(job)) {
    parts.push(`화면의 단가 ${fmt(job.billRate)}원 · 필요 ${job.required}명과 곱해도 이 값이 나오지 않습니다`
      + ' (견적 라인이 여러 개이거나 필요인원을 손으로 고친 직무).')
  }
  return parts.join(' ')
}

function Th({
  width, align = 'left', tip, children,
}: {
  width: string; align?: 'left' | 'center' | 'right'
  tip?: string; children: React.ReactNode
}) {
  const at = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'
  return (
    <th
      title={tip}
      className={`bg-gray-100 px-2 py-2 font-bold text-[11px] text-gray-600 tracking-wide
        border-b-2 border-gray-300 whitespace-nowrap ${width} ${at}`}
    >
      {children}
    </th>
  )
}

// ═════════════════════════════════════════════════════════
interface Props {
  year: number
  month: number
  /** 이 표가 다룰 날짜 (그 달의 1일~말일).
   *  달력 격자는 앞뒤로 인접 월 며칠을 더 불러오지만, 표의 단위는 '그 달'이다. */
  dates: string[]
  today: string
  data: ScheduleData
  query: string
  onlyProblem: boolean
  onOpenDetail: (inq: Inquiry) => void
}

/** 운영 캘린더 '표' 뷰.
 *  조회·검색·월이동은 상위(ScheduleWorkspace)가 맡고, 여기서는 받은 데이터를
 *  구간(Run) 단위로 펼쳐 그리는 일만 한다. */
export default function ScheduleMatrixContent({
  year, month, dates, today, data, query, onlyProblem, onOpenDetail,
}: Props) {
  const { events, rangeInqs, conflicts, busy } = data

  // 표에만 있는 설정 — 달력에는 '구간' 개념이 없으므로 여기 둔다
  const [expandDays, setExpandDays] = useState(false)
  const [exporting,  setExporting]  = useState(false)

  // ── 구간(Run) 생성 ──────────────────────────────────────
  const runs = useMemo<Run[]>(() => {
    const out: Run[] = []

    events.forEach(base => {
      const active = dates.filter(d => coversDate(base.inq.event_start, base.inq.event_end, d))
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
  }, [events, dates, expandDays, today])

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
        '배정 인원',
        '청구 합계', '청구단가', '지급 합계', '지급 합계(계획)', '지급단가(실제)',
        '마진율', '비고',
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
        const mny = jobMoney(c.job)
        const note = [
          mny.trust !== 'ok' ? mny.reason : '',
          mny.freeCount > 0 ? `무급 ${mny.freeCount}명 지급합계 제외` : '',
        ].filter(Boolean).join(' / ')
        ws.addRow([
          r.start, r.end, r.days,
          r.days === 1 ? dowOf(r.start) : `${dowOf(r.start)}~${dowOf(r.end)}`,
          r.base.inq.company_name ?? '', r.base.inq.event_name ?? '',
          c.job.label, c.job.required, c.total,
          STATE_STYLE[st].label(c.total, c.job.required),
          names,
          mny.billTotal || null,
          c.job.billRate || null,
          mny.payTotal || null,
          mny.planPayTotal || null,
          act.mixed ? '혼재' : (act.value || null),
          mny.margin === null ? null : Number(mny.margin.toFixed(1)),
          note,
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

      const widths = [12, 12, 6, 10, 20, 28, 14, 6, 6, 16, 46, 14, 12, 14, 14, 12, 8, 44]
      widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
      ;[12, 13, 14, 15, 16].forEach(i => { ws.getColumn(i).numFmt = '#,##0' })
      ws.getColumn(17).numFmt = '0.0"%"'
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

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── 표 전용 툴바 ── (월 이동·검색·필터는 상위 워크스페이스에 있다) */}
      <div className="shrink-0 px-4 py-2 border-b border-gray-200 bg-white flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-gray-400">
          행사 {new Set(visibleRuns.map(r => r.base.inq.id)).size}건 · {visibleRuns.length}개 구간
        </span>
        <label
          className="ml-auto flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none whitespace-nowrap"
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

      {/* ── 본문 ── */}
      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-3">
        {busy ? (
          <div className="flex items-center justify-center h-40 text-sm text-gray-400">불러오는 중…</div>
        ) : visibleRuns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <CalendarDays className="h-8 w-8" />
            <p className="text-sm">
              {rangeInqs.length === 0
                ? `${month + 1}월에 체결된 행사가 없습니다.`
                : '조건에 맞는 항목이 없습니다.'}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border-2 border-gray-200 overflow-x-auto bg-white">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10">
                <tr>
                  <Th width="w-[104px]">기간</Th>
                  <Th width="w-[210px]">행사 / 고객사</Th>
                  <Th width="w-[120px]">직무</Th>
                  <Th width="w-[54px]" align="center">필요</Th>
                  <Th width="w-[54px]" align="center">배정</Th>
                  <Th width="w-[112px]">상태</Th>
                  <Th width="min-w-[240px]">
                    배정 인원<span className="font-normal text-gray-400"> (클릭 → 인원배정)</span>
                  </Th>
                  <Th
                    width="w-[118px]" align="right"
                    tip={'확정 견적의 이 직무 라인 금액 합계입니다 (단가 × 견적 수량 × 견적 일수). '
                      + '행사 전체 기준이며, 왼쪽 기간 칸의 구간에만 해당하는 금액이 아닙니다. '
                      + '필요인원을 손으로 고친 직무는 합계가 견적 그대로이고 화면의 필요 인원과 곱해도 맞지 않습니다(≠ 표시).'}
                  >
                    청구 합계<span className="block font-normal text-gray-400">견적 기준</span>
                  </Th>
                  <Th
                    width="w-[152px]" align="right"
                    tip={'이 직무에 배정된 인원에게 실제로 나갈 금액 합계입니다. '
                      + '지급관리와 같은 공식(구간별 단가가 있으면 그 합계, 없으면 단가 × 근무일수)이고, '
                      + '무급(본사 인원 / 팀 일괄지급 팀원)은 같은 돈이 두 번 잡히지 않도록 뺐습니다. '
                      + '아래 회색 줄은 견적 원가(계획)와의 차이입니다.'}
                  >
                    지급 합계<span className="block font-normal text-gray-400">배정 기준</span>
                  </Th>
                  <Th
                    width="w-[74px]" align="right"
                    tip={'(청구 합계 − 지급 합계) ÷ 청구 합계. 왼쪽 두 칸에서 바로 나온 값입니다. '
                      + '지급액이 아직 덜 잡힌 직무는 참고용으로만 표시하고, 배정이 없는 직무는 마진을 찍지 않습니다.'}
                  >
                    마진
                  </Th>
                </tr>
              </thead>
              <tbody>
                {visibleRuns.map((r, idx) => {
                  const c   = r.cell
                  const st  = cellState(c.total, c.job.required)
                  const sty = STATE_STYLE[st]
                  const act = actualPayRate(c)
                  const mny = jobMoney(c.job)

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
                              onClick={() => onOpenDetail(r.base.inq)}
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

                      {/* 배정 인원 — 이름 전부 노출. 칸 전체가 인원배정 화면 링크 */}
                      <td className="px-0 py-0 align-top">
                        <Link
                          href={asgnHref(r.base.inq.id, c.job.jobType)}
                          className="group block px-2 py-2 h-full hover:bg-blue-50"
                          title={`인원배정 화면에서 '${c.job.label}' 배정을 열어 수정합니다`}
                        >
                          {c.total === 0 ? (
                            <span className="text-[11px] text-gray-300 group-hover:text-blue-500">
                              배정된 인원이 없습니다 — 배정하러 가기 →
                            </span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1">
                              {c.pinned.map(a => <StaffChip key={a.id} asgn={a} whole={false} />)}
                              {c.allPeriod.map(a => <StaffChip key={a.id} asgn={a} whole />)}
                              <ExternalLink className="h-3 w-3 text-gray-300 group-hover:text-blue-500 shrink-0" />
                            </div>
                          )}
                        </Link>
                      </td>

                      {/* 청구 합계 (견적 기준) */}
                      <td className="px-2 py-2 text-right align-top tabular-nums break-keep">
                        {mny.billTotal ? (
                          <>
                            <div className="font-bold text-gray-900" title={billTip(c.job, mny)}>
                              {fmt(mny.billTotal)}
                            </div>
                            {breakdownExact(c.job) ? (
                              <div className="text-[10px] text-gray-400">
                                {fmt(c.job.billRate)} × {c.job.required}명
                                {c.job.days > 1 ? ` × ${c.job.days}일` : ''}
                              </div>
                            ) : (
                              <div className="text-[10px] text-gray-400"
                                title="견적 라인이 여러 개이거나 필요인원을 손으로 고쳐서, 합계가 (단가 × 필요 × 일수)와 맞지 않습니다. 합계는 견적 라인 금액을 그대로 더한 값입니다.">
                                단가 {fmt(c.job.billRate)}
                                {c.job.approx && c.job.approx.billRange[0] !== c.job.approx.billRange[1]
                                  ? `~${fmt(c.job.approx.billRange[1])}` : ''}
                                <span className="ml-0.5 text-gray-300">≠</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-300" title={mny.reason}>-</span>
                        )}
                      </td>

                      {/* 지급 합계 (배정 기준) */}
                      <td className="px-2 py-2 text-right align-top tabular-nums break-keep">
                        <div className="flex items-center justify-end gap-1">
                          {mny.trust === 'check' && (
                            <span className="shrink-0 text-amber-500" title={mny.reason}>
                              <AlertTriangle className="h-3 w-3" />
                            </span>
                          )}
                          <span className={`font-bold ${
                            mny.trust === 'check' ? 'text-amber-600'
                              : mny.payTotal ? 'text-gray-900' : 'text-gray-300'
                          }`}>
                            {mny.payTotal ? fmt(mny.payTotal) : '-'}
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-400">
                          계획 {mny.planPayTotal ? fmt(mny.planPayTotal) : '-'}
                          {mny.planPayTotal > 0 && mny.payTotal > 0
                            && mny.payTotal !== mny.planPayTotal && (
                            <span className={mny.payTotal > mny.planPayTotal ? ' text-red-500' : ' text-green-600'}>
                              {' '}{mny.payTotal > mny.planPayTotal ? '▲' : '▼'}
                              {fmt(Math.abs(mny.payTotal - mny.planPayTotal))}
                            </span>
                          )}
                        </div>
                        {(() => {
                          // 구분점(·)을 항목 앞에 붙이면 앞이 비었을 때 점만 남는다.
                          // 그려질 항목만 모아서 사이에 끼운다.
                          const notes: React.ReactNode[] = []
                          if (act.mixed) notes.push(
                            <span key="mix" className="text-orange-500"
                              title={`인원별 지급단가가 다릅니다: ${act.list.map(v => fmt(v)).join(' / ')}원`}>
                              단가 혼재
                            </span>)
                          else if (act.value) notes.push(<span key="rate">단가 {fmt(act.value)}</span>)
                          if (mny.freeCount > 0) notes.push(
                            <span key="free" className="text-purple-400"
                              title="본사 인원이거나 팀 일괄지급 팀원입니다. 팀 금액은 팀장 배정에 합산돼 있으므로 여기서 빼야 같은 돈이 두 번 잡히지 않습니다.">
                              무급 {mny.freeCount}명 제외
                            </span>)
                          if (mny.zeroRateCount > 0) notes.push(
                            <span key="zero" className="text-red-400" title={mny.reason}>
                              단가 미입력 {mny.zeroRateCount}명
                            </span>)
                          if (notes.length === 0) return null
                          return (
                            <div className="text-[10px] text-gray-400 leading-tight">
                              {notes.map((n, k) => (
                                <span key={k}>{k > 0 ? ' · ' : ''}{n}</span>
                              ))}
                            </div>
                          )
                        })()}
                      </td>

                      {/* 마진 — 위 두 합계에서 바로 나온 값 (청구합계-지급합계)/청구합계 */}
                      <td className="px-2 py-2 text-right align-top tabular-nums">
                        {mny.margin === null ? (
                          <span className="text-gray-300" title={mny.reason}>-</span>
                        ) : mny.trust === 'check' ? (
                          // 지급이 청구보다 크다 — 붉은 적자로 단정하지 않는다
                          <span className="font-bold text-amber-600"
                            title={`계산값 ${mny.margin.toFixed(1)}% — ${mny.reason}`}>
                            확인필요
                          </span>
                        ) : mny.trust === 'rough' ? (
                          <span className="font-bold text-gray-400" title={mny.reason}>
                            {mny.margin.toFixed(1)}%
                            <span className="block text-[9px] font-normal text-amber-600">참고용</span>
                          </span>
                        ) : (
                          <span className={`font-bold ${
                            mny.margin < 0 ? 'text-red-600' : mny.margin < 20 ? 'text-orange-600' : 'text-gray-800'
                          }`}>
                            {mny.margin.toFixed(1)}%
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

    </div>
  )
}
