'use client'

import { useMemo, useState } from 'react'
import type { Borders, FillPattern, Workbook, Worksheet } from 'exceljs'
import type { Inquiry, Assignment, Attendance, Staff } from '@/lib/supabase/types'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Printer, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'

// ── 출력 옵션 ────────────────────────────────────────────
type SheetMode = 'blank' | 'record'

interface Props {
  open: boolean
  onClose: () => void
  inquiry: Inquiry
  assignments: Assignment[]
  attendances: Attendance[]
  staffMap: Record<string, Staff>
  /** 행사 전체 날짜 (getDateRange 결과) */
  dates: string[]
  /** 출석 탭에서 현재 보고 있는 날짜 */
  currentDate: string | null
}

// 010-1234-5678 형태로 정규화 (숫자 10~11자리만 처리, 그 외는 원문 유지)
function formatPhone(raw?: string): string {
  if (!raw) return ''
  const d = raw.replace(/\D/g, '')
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
  if (d.length === 10) return d.startsWith('02')
    ? `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`
    : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  return raw
}

// YYYY-MM-DD → "2026년 8월 10일 (월)"
function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr)
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${day})`
}

// 파일명용 YYYYMMDD
function compactDate(dateStr: string): string {
  return dateStr.replace(/-/g, '')
}

// 동적 import한 exceljs에서 실제로 쓰는 부분만 좁혀 잡은 타입
type ExcelJSModule = { Workbook: new () => Workbook }

// ── 현장 안전관리 교육 확인 및 서약서 ────────────────────
// 출석부에 서명하는 행위가 곧 안전교육 이수 확인이 되도록 명단 위에 둔다.
// 인쇄와 엑셀이 같은 문구를 써야 하므로 여기 한 곳에만 적는다.
const PLEDGE_TITLE = '현장 안전관리 교육 확인 및 서약서'
const PLEDGE_LEAD =
  '본인은 주식회사 가디어스가 실시한 현장 안전관리 교육에 참석하여 아래 사항을 교육받았으며, '
  + '배포된 현장 운영 매뉴얼을 정독하고 그 내용을 충분히 이해하였음을 확인합니다.'
const PLEDGE_TRAINING = [
  '근무 기본자세·복장 및 금지 사항',
  '담당 구역의 임무와 배치 위치',
  '비상구·소화기·대피 동선 확인',
  '보고 체계 (가디어스 책임자 우선 보고)',
  '긴급 상황 대응 절차 (119·112 신고 기준)',
  '관람객 응대 원칙 (안전·친절·신뢰)',
]
const PLEDGE_OATH = [
  '본인은 본 교육을 이수하고 현장 운영 매뉴얼을 정독하였으며, 근무 중 이를 준수합니다.',
  '지정된 배치 위치와 보고 체계를 따르며, 문제 발생 시 가디어스 현장 책임자에게 먼저 보고합니다.',
  '본인의 고의 또는 중대한 부주의로 교육 및 매뉴얼의 안전 수칙을 위반하여 발생한 사고에 대하여는 '
  + '그에 상응하는 과실 책임이 따를 수 있음을 이해하였습니다.',
]
const PLEDGE_NOTE = '아래 명단의 서명란 서명은 본 교육 이수 및 서약에 대한 확인을 겸합니다.'

// ── 엑셀 서식 상수 ───────────────────────────────────────
const THIN: Partial<Borders> = {
  top:    { style: 'thin', color: { argb: 'FF000000' } },
  left:   { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right:  { style: 'thin', color: { argb: 'FF000000' } },
}
const HEAD_FILL: FillPattern = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F1F1' } }

type ColAlign = 'left' | 'center'
interface SheetCol { key: string; label: string; width: number; align: ColAlign }

// 출석부 표 컬럼 정의 — 엑셀 시트가 이 순서/너비를 그대로 따른다
function SHEET_COLS(withPhone: boolean): SheetCol[] {
  return [
    { key: 'no',       label: 'No',    width: 5,  align: 'center' },
    { key: 'name',     label: '성 명',  width: 12, align: 'center' },
    { key: 'group',    label: '구 분',  width: 7,  align: 'center' },
    { key: 'job',      label: '직 무',  width: 14, align: 'center' },
    ...(withPhone ? [{ key: 'phone', label: '연 락 처', width: 15, align: 'center' as ColAlign }] : []),
    { key: 'clockIn',  label: '출근',   width: 8,  align: 'center' },
    { key: 'clockOut', label: '퇴근',   width: 8,  align: 'center' },
    { key: 'status',   label: '출결',   width: 7,  align: 'center' },
    { key: 'sign',     label: '서 명',  width: 14, align: 'center' },
    { key: 'notes',    label: '비 고',  width: 24, align: 'left' },
  ]
}

// 1 → 'A', 10 → 'J'
function colLetter(n: number): string {
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** 엑셀에서 전체 너비로 병합한 칸에 문단을 쓴다.
 *  엑셀은 병합된 셀의 행 높이를 자동으로 맞춰주지 않는다 — 줄바꿈만 켜두면 글자가 잘린다.
 *  그래서 글자 수로 줄 수를 추정해 높이를 직접 준다. 한글은 두 칸으로 센다. */
function writeParagraph(
  ws: Worksheet,
  rowIdx: number,
  nCols: number,
  totalWidth: number,
  text: string,
  opts: { bold?: boolean; size?: number; center?: boolean; indent?: number } = {},
) {
  ws.mergeCells(rowIdx, 1, rowIdx, nCols)
  const cell = ws.getCell(rowIdx, 1)
  cell.value = text
  cell.font = { name: '맑은 고딕', size: opts.size ?? 9.5, bold: !!opts.bold }
  cell.alignment = {
    horizontal: opts.center ? 'center' : 'left',
    vertical: 'middle',
    wrapText: true,
    indent: opts.center ? 0 : (opts.indent ?? 1),
  }
  const units = [...text].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2000 ? 2 : 1), 0)
  const perLine = Math.max(20, Math.floor(totalWidth * 0.92) - (opts.indent ?? 1) * 2)
  const lines = Math.max(1, Math.ceil(units / perLine))
  ws.getRow(rowIdx).height = lines * ((opts.size ?? 9.5) + 5) + 4
  return lines
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// 시각 문자열에서 HH:MM만 추출 (DB가 HH:MM:SS로 저장하는 경우 대비)
function hhmm(t?: string): string {
  if (!t) return ''
  const m = t.match(/^(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : t
}

interface SheetRow {
  no: number
  assignId: string
  name: string
  isHQ: boolean
  isLeader: boolean
  job: string
  phone: string
  clockIn: string
  clockOut: string
  status: string
  notes: string
}

export default function AttendanceSheetModal({
  open, onClose, inquiry, assignments, attendances, staffMap, dates, currentDate,
}: Props) {
  const isMultiDay = dates.length > 1
  const [mode, setMode] = useState<SheetMode>('blank')
  // 날짜는 "출석 탭에서 보고 있던 날짜"가 기본값. 사용자가 직접 고르면 그 값이 우선.
  // ('all' = 전체 날짜를 날짜별 여러 장으로) 닫을 때 null로 되돌려 다음 열기에 기본값 복귀.
  const [dateOverride, setDateOverride] = useState<string | null>(null)
  const [includePhone, setIncludePhone] = useState(true)
  const [includePledge, setIncludePledge] = useState(true)
  // 엑셀 생성 중 (exceljs 동적 로드 + 파일 조립)
  const [busy, setBusy] = useState(false)
  const dateSel = dateOverride ?? currentDate ?? dates[0] ?? ''

  function handleClose() {
    setDateOverride(null)
    onClose()
  }

  // dates는 부모가 매 렌더마다 새 배열로 넘기므로 문자열 키로 고정해 비교한다
  const datesKey = dates.join(',')

  // 실제 출력 대상 날짜 목록
  const targetDates = useMemo(() => {
    const list = datesKey ? datesKey.split(',') : []
    if (!list.length) return [inquiry.event_start || new Date().toISOString().slice(0, 10)]
    return dateSel === 'all' ? list : [dateSel]
  }, [datesKey, dateSel, inquiry.event_start])

  // 특정 날짜의 인원 행 생성 — 인쇄·엑셀 공용
  function buildRows(date: string): SheetRow[] {
    return assignments
      .filter(a => a.status !== '취소')
      .map((a, i) => {
        const att = mode === 'record'
          ? attendances.find(at => at.assignment_id === a.id && at.work_date === date)
          : undefined
        const staff = a.staff_id ? staffMap[a.staff_id] : undefined
        return {
          no: i + 1,
          assignId: a.id,
          name: a.staff_name || '-',
          isHQ: a.staff_type === '본사',
          isLeader: a.role_type === '팀장',
          job: a.job_type || '',
          phone: formatPhone(a.phone || staff?.phone),
          clockIn: hhmm(att?.clock_in),
          clockOut: hhmm(att?.clock_out),
          status: att?.status || '',
          notes: att?.notes || att?.reason || '',
        }
      })
  }

  const rowCount = assignments.filter(a => a.status !== '취소').length

  // ── A4 인쇄 ────────────────────────────────────────────
  function handlePrint() {
    if (rowCount === 0) { toast.error('배정된 인원이 없습니다.'); return }

    const pages = targetDates.map(date => {
      const rows = buildRows(date)
      const stat = mode === 'record'
        ? (() => {
            const c = (s: string) => rows.filter(r => r.status === s).length
            return `출석 ${c('출석')} · 지각 ${c('지각')} · 결근 ${c('결근')} · 조퇴 ${c('조퇴')} · 외출 ${c('외출')}`
          })()
        : ''

      const bodyRows = rows.map(r => `
        <tr>
          <td class="c">${r.no}</td>
          <td class="nm">${r.isHQ ? '<b class="tag">본사</b> ' : ''}${r.isLeader ? '<b class="tag">팀장</b> ' : ''}${esc(r.name)}</td>
          <td class="c">${esc(r.job)}</td>
          ${includePhone ? `<td class="c ph">${esc(r.phone)}</td>` : ''}
          <td class="c">${esc(r.clockIn)}</td>
          <td class="c">${esc(r.clockOut)}</td>
          <td class="c">${esc(r.status)}</td>
          <td class="sig"></td>
          <td>${esc(r.notes)}</td>
        </tr>`).join('')

      return `
      <div class="page">
        <h1>출 석 부</h1>
        <table class="meta">
          <tr>
            <th>행 사 명</th><td colspan="3">${esc(inquiry.event_name || '')}</td>
            <th>일 자</th><td>${formatDateLong(date)}</td>
          </tr>
          <tr>
            <th>업 체 명</th><td colspan="3">${esc(inquiry.company_name || '')}</td>
            <th>인 원</th><td>${rowCount}명</td>
          </tr>
          <tr>
            <th>장 소</th><td colspan="3">${esc(inquiry.location || '')}</td>
            <th>근무시간</th><td>${esc(inquiry.event_time || '')}</td>
          </tr>
        </table>

        ${includePledge ? `
        <section class="pledge">
          <h2>${PLEDGE_TITLE}</h2>
          <p class="lead">${esc(PLEDGE_LEAD)}</p>
          <div class="cols">
            <div class="col">
              <h3>교육 내용</h3>
              <ol>${PLEDGE_TRAINING.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
            </div>
            <div class="col">
              <h3>확인 및 서약</h3>
              <ol>${PLEDGE_OATH.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
            </div>
          </div>
          <p class="note">${esc(PLEDGE_NOTE)}</p>
        </section>` : ''}

        <table class="roster">
          <colgroup>
            <col style="width:6%"><col style="width:13%"><col style="width:13%">
            ${includePhone ? '<col style="width:15%">' : ''}
            <col style="width:9%"><col style="width:9%"><col style="width:8%">
            <col style="width:${includePhone ? 13 : 16}%"><col>
          </colgroup>
          <thead>
            <tr>
              <th>No</th><th>성 명</th><th>직 무</th>
              ${includePhone ? '<th>연 락 처</th>' : ''}
              <th>출근</th><th>퇴근</th><th>출결</th><th>서 명</th><th>비 고</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>

        ${stat ? `<p class="stat">${stat}</p>` : ''}
        <p class="confirm">위와 같이 근무 인원의 출결을 확인합니다.
          &nbsp;&nbsp;&nbsp;현장 담당자 : ________________ <span class="sgn">(서명)</span></p>
      </div>`
    }).join('')

    const win = window.open('', '_blank')
    if (!win) { toast.error('팝업이 차단되어 있습니다. 브라우저에서 팝업을 허용해주세요.'); return }

    win.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"/>
<title>출석부 - ${esc(inquiry.event_name || '')}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Malgun Gothic','맑은 고딕',sans-serif; background: #fff; color: #000; }
  .page { width: 210mm; min-height: 297mm; padding: 14mm 12mm; margin: 0 auto; page-break-after: always; break-after: page; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  h1 { text-align: center; font-size: 26px; letter-spacing: 8px; margin-bottom: 10mm; font-weight: 700; }
  table { border-collapse: collapse; width: 100%; }
  .meta { margin-bottom: 4mm; font-size: 11px; }
  .meta th, .meta td { border: 1px solid #000; padding: 4px 7px; }
  .meta th { background: #f1f1f1; text-align: center; white-space: nowrap; width: 62px; font-weight: 700; }
  .roster { font-size: 11px; }
  .roster th, .roster td { border: 1px solid #000; padding: 0 4px; height: 26px; word-break: keep-all; }
  .roster th { background: #f1f1f1; text-align: center; font-weight: 700; }
  .roster td.c { text-align: center; }
  .roster td.nm { font-weight: 600; }
  .roster td.ph { font-size: 10.5px; white-space: nowrap; }
  .roster td.sig { background: #fcfcfc; }
  .tag { font-size: 8.5px; border: 1px solid #666; padding: 0 2px; border-radius: 2px; font-weight: 700; vertical-align: 1px; }
  .pledge { border: 1px solid #000; padding: 3mm 3.5mm; margin-bottom: 4mm; }
  .pledge h2 { text-align: center; font-size: 13px; letter-spacing: 2px; font-weight: 700; margin-bottom: 2mm; }
  .pledge .lead { font-size: 10.5px; line-height: 1.55; text-align: justify; margin-bottom: 2.5mm; }
  .pledge .cols { display: flex; gap: 5mm; }
  .pledge .col { flex: 1; min-width: 0; }
  .pledge h3 { font-size: 10.5px; font-weight: 700; border-bottom: 1px solid #000;
               padding-bottom: 0.8mm; margin-bottom: 1.4mm; }
  .pledge ol { margin: 0; padding-left: 4.5mm; }
  .pledge li { font-size: 10px; line-height: 1.5; margin-bottom: 0.8mm; word-break: keep-all; }
  .pledge .note { font-size: 9.5px; margin-top: 2mm; padding-top: 1.5mm;
                  border-top: 1px dashed #999; text-align: center; }
  .stat { margin-top: 3mm; font-size: 11px; text-align: right; }
  .confirm { margin-top: 8mm; font-size: 11px; }
  .sgn { color: #666; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  @media print { @page { size: A4; margin: 0; } body { margin: 0; } }
</style></head><body>${pages}</body></html>`)
    win.document.close()
    win.focus()
    win.print()
  }

  // ── 엑셀 다운로드 ──────────────────────────────────────
  // 파일 자체를 서식 있는 출석부 양식으로 만든다(테두리·제목 병합·인쇄 설정).
  // xlsx(무료판)는 셀 스타일을 쓸 수 없어 exceljs를 사용.
  async function handleExcel() {
    if (rowCount === 0) { toast.error('배정된 인원이 없습니다.'); return }
    setBusy(true)
    try {
      // exceljs는 브라우저에서 UMD 번들(package.json의 browser 필드)로 해석된다.
      // 번들러에 따라 네임스페이스에 바로 오기도, default에 담기기도 하므로 둘 다 받는다.
      const mod = await import('exceljs')
      const ExcelJS = ((mod as unknown as { default?: ExcelJSModule }).default
        ?? (mod as unknown as ExcelJSModule))
      const wb = new ExcelJS.Workbook()
      wb.creator = '가디우스 ERP'

      targetDates.forEach(date => {
        const rows = buildRows(date)
        const sheetName = (isMultiDay ? date.slice(5).replace(/-/g, '.') : '출석부').slice(0, 31)
        const ws = wb.addWorksheet(sheetName, {
          pageSetup: {
            paperSize: 9,              // A4
            orientation: 'portrait',
            fitToPage: true,
            fitToWidth: 1,
            fitToHeight: 0,            // 세로는 여러 장 허용
            horizontalCentered: true,
            margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
          },
        })

        ws.columns = SHEET_COLS(includePhone).map(c => ({ width: c.width }))
        const nCols = ws.columns.length
        const last = colLetter(nCols)
        // 좌/우 2단 정보표에서 오른쪽 라벨이 놓일 열
        const labelCol2 = includePhone ? 6 : 5

        // 1행: 제목
        ws.mergeCells(`A1:${last}1`)
        const title = ws.getCell('A1')
        title.value = '출 석 부'
        title.font = { name: '맑은 고딕', size: 20, bold: true }
        title.alignment = { horizontal: 'center', vertical: 'middle' }
        ws.getRow(1).height = 34
        ws.getRow(2).height = 6

        // 3~5행: 행사 정보표
        const meta: [string, string, string, string][] = [
          ['행사명', inquiry.event_name || '', '일 자', formatDateLong(date)],
          ['업체명', inquiry.company_name || '', '인 원', `${rowCount}명`],
          ['장 소', inquiry.location || '', '근무시간', inquiry.event_time || ''],
        ]
        meta.forEach(([l1, v1, l2, v2], i) => {
          const r = 3 + i
          ws.getRow(r).height = 20
          ws.mergeCells(r, 2, r, labelCol2 - 1)
          ws.mergeCells(r, labelCol2 + 1, r, nCols)
          ws.getCell(r, 1).value = l1
          ws.getCell(r, 2).value = v1
          ws.getCell(r, labelCol2).value = l2
          ws.getCell(r, labelCol2 + 1).value = v2
          for (let c = 1; c <= nCols; c++) {
            const cell = ws.getCell(r, c)
            cell.border = THIN
            cell.font = { name: '맑은 고딕', size: 10 }
            cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
          }
          ;[1, labelCol2].forEach(c => {
            const cell = ws.getCell(r, c)
            cell.font = { name: '맑은 고딕', size: 10, bold: true }
            cell.fill = HEAD_FILL
            cell.alignment = { vertical: 'middle', horizontal: 'center' }
          })
        })
        ws.getRow(6).height = 8

        // 안전교육 서약서 — 명단 바로 위. 서명 한 번이 이수 확인을 겸하게 한다.
        // 전체 너비 병합 + 줄 수 계산(writeParagraph)으로 인쇄해도 글자가 잘리지 않게 한다.
        const totalWidth = SHEET_COLS(includePhone).reduce((n, c) => n + c.width, 0)
        let cur = 7
        if (includePledge) {
          writeParagraph(ws, cur, nCols, totalWidth, PLEDGE_TITLE, { bold: true, size: 12, center: true })
          ws.getRow(cur).height = 24
          cur++
          writeParagraph(ws, cur, nCols, totalWidth, PLEDGE_LEAD)
          cur++

          const sectionHead = (label: string) => {
            writeParagraph(ws, cur, nCols, totalWidth, label, { bold: true, size: 10 })
            ws.getCell(cur, 1).fill = HEAD_FILL
            ws.getRow(cur).height = 18
            cur++
          }
          sectionHead('교육 내용')
          PLEDGE_TRAINING.forEach((t, i) => {
            writeParagraph(ws, cur, nCols, totalWidth, `${i + 1}. ${t}`, { indent: 2 })
            cur++
          })
          sectionHead('확인 및 서약')
          PLEDGE_OATH.forEach((t, i) => {
            writeParagraph(ws, cur, nCols, totalWidth, `${i + 1}. ${t}`, { indent: 2 })
            cur++
          })
          writeParagraph(ws, cur, nCols, totalWidth, PLEDGE_NOTE, { size: 9, center: true })
          cur++

          // 서약서를 바깥 테두리로만 감싼다 — 칸마다 선을 그으면 격자처럼 보여
          // 명단 표와 구분이 안 된다. 여기는 '문서', 아래는 '표'로 읽혀야 한다.
          const line = { style: 'thin' as const, color: { argb: 'FF000000' } }
          for (let r = 7; r < cur; r++) {
            for (let c = 1; c <= nCols; c++) {
              ws.getCell(r, c).border = {
                ...(c === 1 ? { left: line } : {}),
                ...(c === nCols ? { right: line } : {}),
                ...(r === 7 ? { top: line } : {}),
                ...(r === cur - 1 ? { bottom: line } : {}),
              }
            }
          }
          ws.getRow(cur).height = 8
          cur++
        }

        // 표 머리글
        const HEADER_ROW = cur
        const cols = SHEET_COLS(includePhone)
        const head = ws.getRow(HEADER_ROW)
        head.height = 24
        cols.forEach((c, i) => {
          const cell = head.getCell(i + 1)
          cell.value = c.label
          cell.font = { name: '맑은 고딕', size: 10, bold: true }
          cell.fill = HEAD_FILL
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
          cell.border = THIN
        })

        // 8행~: 인원
        rows.forEach((r, i) => {
          const row = ws.getRow(HEADER_ROW + 1 + i)
          row.height = 21
          const values: (string | number)[] = [
            r.no,
            r.name,
            r.isHQ ? '본사' : r.isLeader ? '팀장' : '크루',
            r.job,
            ...(includePhone ? [r.phone] : []),
            r.clockIn, r.clockOut, r.status, '', r.notes,
          ]
          values.forEach((v, ci) => {
            const cell = row.getCell(ci + 1)
            cell.value = v
            cell.border = THIN
            cell.font = { name: '맑은 고딕', size: 10, bold: cols[ci].key === 'name' }
            cell.alignment = {
              horizontal: cols[ci].align,
              vertical: 'middle',
              indent: cols[ci].align === 'left' ? 1 : 0,
            }
            // 연락처는 앞자리 0이 사라지지 않도록 문자열 서식 고정
            if (cols[ci].key === 'phone') cell.numFmt = '@'
          })
        })

        let cursor = HEADER_ROW + rows.length
        // 집계 (기록 모드)
        if (mode === 'record') {
          const c = (s: string) => rows.filter(r => r.status === s).length
          cursor += 2
          ws.mergeCells(cursor, 1, cursor, nCols)
          const cell = ws.getCell(cursor, 1)
          cell.value = `집계   출석 ${c('출석')}   ·   지각 ${c('지각')}   ·   결근 ${c('결근')}   ·   조퇴 ${c('조퇴')}   ·   외출 ${c('외출')}`
          cell.font = { name: '맑은 고딕', size: 10 }
          cell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 }
        }

        // 담당자 확인란
        cursor += 2
        ws.mergeCells(cursor, 1, cursor, nCols)
        const confirm = ws.getCell(cursor, 1)
        confirm.value = '위와 같이 근무 인원의 출결을 확인합니다.      현장 담당자 : ________________  (서명)'
        confirm.font = { name: '맑은 고딕', size: 10 }
        confirm.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
        ws.getRow(cursor).height = 26

        // 인쇄 시 페이지마다 표 머리글 반복
        ws.pageSetup.printTitlesRow = `${HEADER_ROW}:${HEADER_ROW}`
        // 화면 틀 고정은 서약서가 없을 때만. 서약서까지 20여 행을 붙박아두면
        // 화면 대부분이 고정돼 정작 명단을 스크롤할 수 없다.
        if (!includePledge) ws.views = [{ state: 'frozen', ySplit: HEADER_ROW }]
      })

      // 다일 행사 + 기록 모드: 날짜별 출결을 한 장에 모은 종합 시트
      if (mode === 'record' && targetDates.length > 1) {
        const rows = buildRows(targetDates[0])
        const ws = wb.addWorksheet('종합', {
          pageSetup: {
            paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
            margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
          },
        })
        const headLabels = [
          'No', '성명', '직무',
          ...(includePhone ? ['연락처'] : []),
          ...targetDates.map(d => d.slice(5).replace('-', '/')),
          '출석일수',
        ]
        ws.columns = [
          { width: 5 }, { width: 12 }, { width: 14 },
          ...(includePhone ? [{ width: 15 }] : []),
          ...targetDates.map(() => ({ width: 9 })), { width: 10 },
        ]
        const nCols = headLabels.length

        ws.mergeCells(1, 1, 1, nCols)
        const title = ws.getCell(1, 1)
        title.value = `${inquiry.event_name || ''} 출석 종합`
        title.font = { name: '맑은 고딕', size: 16, bold: true }
        title.alignment = { horizontal: 'center', vertical: 'middle' }
        ws.getRow(1).height = 30
        ws.getRow(2).height = 6

        const head = ws.getRow(3)
        head.height = 22
        headLabels.forEach((l, i) => {
          const cell = head.getCell(i + 1)
          cell.value = l
          cell.font = { name: '맑은 고딕', size: 10, bold: true }
          cell.fill = HEAD_FILL
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
          cell.border = THIN
        })

        rows.forEach((r, i) => {
          const perDate = targetDates.map(d =>
            attendances.find(at => at.assignment_id === r.assignId && at.work_date === d)?.status || ''
          )
          const present = perDate.filter(s => s && s !== '결근').length
          const values: (string | number)[] = [
            r.no, r.name, r.job,
            ...(includePhone ? [r.phone] : []),
            ...perDate, present,
          ]
          const row = ws.getRow(4 + i)
          row.height = 20
          values.forEach((v, ci) => {
            const cell = row.getCell(ci + 1)
            cell.value = v
            cell.border = THIN
            cell.font = { name: '맑은 고딕', size: 10, bold: ci === 1 }
            cell.alignment = { horizontal: ci === 1 || ci === 2 ? 'left' : 'center', vertical: 'middle', indent: ci <= 2 ? 1 : 0 }
            if (includePhone && ci === 3) cell.numFmt = '@'
          })
        })

        ws.pageSetup.printTitlesRow = '3:3'
        ws.views = [{ state: 'frozen', ySplit: 3 }]
      }

      const suffix = targetDates.length > 1
        ? `${compactDate(targetDates[0])}-${compactDate(targetDates[targetDates.length - 1])}`
        : compactDate(targetDates[0])
      const buf = await wb.xlsx.writeBuffer()
      downloadBlob(
        new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `출석부_${inquiry.event_name || '행사'}_${suffix}.xlsx`,
      )
      toast.success('엑셀 파일이 다운로드되었습니다.')
    } catch (e) {
      toast.error('엑셀 생성 실패: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} className="max-w-md">
      <DialogHeader>
        <DialogTitle className="text-base">출석부 출력</DialogTitle>
        <DialogClose onClose={handleClose} />
      </DialogHeader>

      <DialogContent className="space-y-4">
        {/* 내용 선택 */}
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1.5">내용</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              { v: 'blank', label: '빈 양식', desc: '현장 서명·수기 체크용' },
              { v: 'record', label: '기록 포함', desc: '저장된 출결 채워서' },
            ] as const).map(o => (
              <button
                key={o.v}
                onClick={() => setMode(o.v)}
                className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                  mode === o.v
                    ? 'border-blue-500 bg-blue-50 text-blue-800'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-600'
                }`}
              >
                <span className="block text-sm font-semibold">{o.label}</span>
                <span className="block text-xs text-gray-400 mt-0.5">{o.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 날짜 선택 — 다일 행사만 */}
        {isMultiDay && (
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">날짜</p>
            <select
              value={dateSel}
              onChange={e => setDateOverride(e.target.value)}
              className="w-full h-9 rounded-lg border border-gray-200 px-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">전체 {dates.length}일 (날짜별 {dates.length}장)</option>
              {dates.map(d => (
                <option key={d} value={d}>{formatDateLong(d)}</option>
              ))}
            </select>
          </div>
        )}

        {/* 연락처 포함 */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includePhone}
            onChange={e => setIncludePhone(e.target.checked)}
            className="h-4 w-4 accent-blue-600"
          />
          <span className="text-sm text-gray-700">연락처 포함</span>
          <span className="text-xs text-gray-400">개인정보 — 배포 시 주의</span>
        </label>

        {/* 안전교육 서약서 — 명단 위에 붙여 서명 한 번으로 이수 확인을 겸하게 한다 */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includePledge}
            onChange={e => setIncludePledge(e.target.checked)}
            className="h-4 w-4 accent-blue-600"
          />
          <span className="text-sm text-gray-700">안전교육 서약서 포함</span>
          <span className="text-xs text-gray-400">명단 위에 교육 내용·서약 문구</span>
        </label>

        <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">
          인원 {rowCount}명 · A4 세로 {targetDates.length}장
          {mode === 'blank' && ' · 출근/퇴근/출결/서명란 비워서 출력'}
          {includePledge && ' · 명단 위에 안전교육 서약서'}
          <br />
          엑셀도 테두리·인쇄 설정이 들어가 있어 열어서 바로 인쇄하면 출석부가 됩니다.
        </p>
      </DialogContent>

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={handleExcel} disabled={busy}>
          <FileSpreadsheet className="h-3.5 w-3.5" />{busy ? '생성 중...' : '엑셀 다운로드'}
        </Button>
        <Button size="sm" onClick={handlePrint} disabled={busy} className="bg-blue-600 hover:bg-blue-700">
          <Printer className="h-3.5 w-3.5" />A4 인쇄
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
