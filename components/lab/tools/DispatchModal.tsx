'use client'

import { useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/supabase/api'
import type { Inquiry, GuardProfile } from '@/lib/supabase/types'
import { X, Printer, UserPlus, Trash2, ChevronDown, Save, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/utils'

// 저장된 신고서 타입
interface DispatchReport {
  id: string
  title?: string
  police_station?: string
  report_date?: string
  is_baechi?: boolean
  is_pyeji?: boolean
  receipt_no?: string
  location?: string
  location_phone?: string
  start_date?: string
  start_time?: string
  end_date?: string
  end_time?: string
  purpose?: string
  guard_rows?: GuardRow[]
  include_docs?: boolean
  inquiry_id?: string
  created_at?: string
}

// 회사 고정 정보
const COMPANY = {
  name:    '주식회사 가디어스',
  ceo:     '최규성',
  license: '서울지방경찰청 허가 제 4577호',
  address: '서울시 종로구 동방산1길 2, 1층',
  phone:   '02-1600-2944',
}

// PDF/이미지 자동 구분 뷰어 — iframe 사용 (embed는 이벤트 가로채기 문제 있음)
function DocViewer({ url, label }: { url: string; label: string }) {
  const isPdf = url.toLowerCase().includes('.pdf')
  if (isPdf) {
    return (
      <iframe
        src={url}
        className="w-full border-0"
        style={{ height: '270mm', minHeight: '270mm' }}
        title={label}
      />
    )
  }
  return (
    <img src={url} alt={label} className="max-w-full object-contain" style={{ maxHeight: '270mm' }} />
  )
}

// 명단 한 행
interface GuardRow {
  name: string
  id_number: string
  job_category: string
  certificate_number: string
  id_doc_url?: string
  certificate_doc_url?: string
  crime_check_doc_url?: string
}

const emptyRow = (): GuardRow => ({
  name: '', id_number: '', job_category: '신변보호', certificate_number: '',
})

// 날짜 포맷 헬퍼
function toDisplayDate(dateStr?: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}. ${String(d.getMonth()+1).padStart(2,'0')}. ${String(d.getDate()).padStart(2,'0')}.`
}

export default function DispatchModal({ onClose }: { onClose: () => void }) {
  const [inquiries, setInquiries]   = useState<Inquiry[]>([])
  const [guards, setGuards]         = useState<GuardProfile[]>([])
  const [selectedInqId, setSelectedInqId] = useState('')
  const [showGuardPicker, setShowGuardPicker] = useState(false)
  const [guardSearch, setGuardSearch] = useState('')
  const [savedReports, setSavedReports] = useState<DispatchReport[]>([])
  const [showLoadPicker, setShowLoadPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [currentReportId, setCurrentReportId] = useState<string | null>(null)

  // 신고서 헤더 (모두 수동 편집 가능) - 배치/배치폐지 독립 체크
  const [isBaechi, setIsBaechi]   = useState(true)
  const [isPyeji,  setIsPyeji]    = useState(true)
  const [receiptNo, setReceiptNo]         = useState('')
  const [location, setLocation]           = useState('')
  const [locationPhone, setLocationPhone] = useState('')
  const [startDate, setStartDate]         = useState('')
  const [startTime, setStartTime]         = useState('')
  const [endDate, setEndDate]             = useState('')
  const [endTime, setEndTime]             = useState('')
  const [purpose, setPurpose]             = useState('')
  const [policeStation, setPoliceStation] = useState('혜화')
  const [reportDate, setReportDate]       = useState(new Date().toISOString().slice(0, 10))

  // 경호원 명단
  const [rows, setRows] = useState<GuardRow[]>(
    Array.from({ length: 6 }, emptyRow)
  )

  // 서류 첨부 포함 여부
  const [showDocs, setShowDocs] = useState(true)

  const load = useCallback(async () => {
    const [inqs, gs, reports] = await Promise.all([
      db.list<Inquiry>('inquiries', {
        inFilter: { status: ['체결', '배정완료', '진행중', '완료'] },
        order: 'event_start', asc: false,
      }),
      db.list<GuardProfile>('guard_profiles', { order: 'name', asc: true }),
      db.list<DispatchReport>('dispatch_reports', { order: 'created_at', asc: false }),
    ])
    setInquiries(inqs)
    setGuards(gs)
    setSavedReports(reports)
  }, [])

  useEffect(() => { load() }, [load])

  // 저장
  async function handleSave() {
    setSaving(true)
    setSaveMsg('')
    const title = `${reportDate} ${policeStation}경찰서 ${rows.filter(r => r.name).map(r => r.name).join('·') || '(경호원 없음)'}`
    const payload = {
      title,
      inquiry_id: selectedInqId || null,
      police_station: policeStation,
      report_date: reportDate,
      receipt_no: receiptNo,
      is_baechi: isBaechi,
      is_pyeji: isPyeji,
      location,
      location_phone: locationPhone,
      start_date: startDate,
      start_time: startTime,
      end_date: endDate,
      end_time: endTime,
      purpose,
      guard_rows: rows,
      include_docs: showDocs,
    }
    try {
      if (currentReportId) {
        await db.update('dispatch_reports', currentReportId, payload)
        setSaveMsg('✅ 저장 완료')
      } else {
        const created = await db.insert<DispatchReport>('dispatch_reports', payload)
        if (created?.[0]?.id) setCurrentReportId(created[0].id)
        setSaveMsg('✅ 저장 완료')
      }
      // 목록 갱신
      const reports = await db.list<DispatchReport>('dispatch_reports', { order: 'created_at', asc: false })
      setSavedReports(reports)
    } catch {
      setSaveMsg('❌ 저장 실패')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(''), 2500)
    }
  }

  // 불러오기
  function handleLoadReport(r: DispatchReport) {
    setCurrentReportId(r.id)
    setSelectedInqId(r.inquiry_id || '')
    setPoliceStation(r.police_station || '혜화')
    setReportDate(r.report_date || new Date().toISOString().slice(0, 10))
    setReceiptNo(r.receipt_no || '')
    setIsBaechi(r.is_baechi ?? true)
    setIsPyeji(r.is_pyeji ?? true)
    setLocation(r.location || '')
    setLocationPhone(r.location_phone || '')
    setStartDate(r.start_date || '')
    setStartTime(r.start_time || '')
    setEndDate(r.end_date || '')
    setEndTime(r.end_time || '')
    setPurpose(r.purpose || '')
    setRows(r.guard_rows && r.guard_rows.length > 0 ? r.guard_rows : Array.from({ length: 6 }, emptyRow))
    setShowDocs(r.include_docs ?? true)
    setShowLoadPicker(false)
  }

  // 저장된 신고서 삭제
  async function handleDeleteReport(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('이 신고서를 삭제할까요?')) return
    await db.delete('dispatch_reports', id)
    setSavedReports(prev => prev.filter(r => r.id !== id))
    if (currentReportId === id) setCurrentReportId(null)
  }

  // 행사 선택 → 기본 정보만 자동완성 (인원은 수동 선택)
  function handleSelectInquiry(inqId: string) {
    setSelectedInqId(inqId)
    if (!inqId) return
    const inq = inquiries.find(i => i.id === inqId)
    if (!inq) return

    setLocation((inq as any).location || '')
    setStartDate(inq.event_start ? toDisplayDate(inq.event_start) : '')
    setStartTime((inq as any).event_time || '')
    setEndDate(inq.event_end ? toDisplayDate(inq.event_end) : '')
    setPurpose((inq as any).memo || '')
  }

  // 경호원 DB에서 선택해서 빈 행에 채우기 (or 새 행 추가)
  function handlePickGuard(g: GuardProfile) {
    const newRow: GuardRow = {
      name:               g.name,
      id_number:          g.id_number || '',
      job_category:       g.job_category || '신변보호',
      certificate_number: g.certificate_number || '',
      id_doc_url:         g.id_doc_url,
      certificate_doc_url: g.certificate_doc_url,
      crime_check_doc_url: g.crime_check_doc_url,
    }
    // 첫 번째 빈 이름 행에 채우기, 없으면 추가
    const emptyIdx = rows.findIndex(r => !r.name.trim())
    if (emptyIdx !== -1) {
      setRows(prev => prev.map((r, i) => i === emptyIdx ? newRow : r))
    } else {
      setRows(prev => [...prev, newRow])
    }
    setShowGuardPicker(false)
  }

  function updateRow(idx: number, field: keyof GuardRow, value: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  function addEmptyRow() {
    setRows(prev => [...prev, emptyRow()])
  }

  function removeRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx))
  }

  // 표시용 날짜
  const reportDateFormatted = (() => {
    const d = new Date(reportDate)
    return `${d.getFullYear()}년 ${String(d.getMonth()+1).padStart(2,'0')}월 ${String(d.getDate()).padStart(2,'0')}일`
  })()

  const docRows = rows.filter(r => r.id_doc_url || r.certificate_doc_url || r.crime_check_doc_url)

  // 새 창에서 인쇄 (embed/iframe 이벤트 충돌 완전 회피)
  function handlePrint() {
    setShowGuardPicker(false)

    const area = document.getElementById('dispatch-print-content')
    if (!area) return

    // input 현재 값 → value 어트리뷰트 동기화 (cloneNode는 property만 복사 안함)
    area.querySelectorAll('input, textarea').forEach(el => {
      (el as HTMLInputElement).setAttribute('value', (el as HTMLInputElement).value)
    })

    const clone = area.cloneNode(true) as HTMLElement
    // 화면 전용 요소 제거
    clone.querySelectorAll('.dispatch-no-print').forEach(el => el.remove())
    // iframe → embed 로 교체 (인쇄창에서는 embed가 더 안정적)
    clone.querySelectorAll('iframe').forEach(iframe => {
      const src = iframe.getAttribute('src') || ''
      const embed = document.createElement('embed')
      embed.src = src
      embed.type = 'application/pdf'
      embed.style.cssText = 'width:194mm;height:270mm;border:none;'
      iframe.replaceWith(embed)
    })

    const win = window.open('', '_blank', 'width=900,height=800')
    if (!win) {
      alert('팝업이 차단되어 있습니다. 브라우저에서 팝업을 허용한 후 다시 시도해주세요.')
      return
    }

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>배치신고서</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    body { font-family: 'Malgun Gothic','맑은 고딕',sans-serif; background:white; margin:0; }
    table { border-collapse: collapse; width:100%; }
    .dispatch-page { width:210mm; padding:12mm 18mm; margin:0 auto; font-size:11px; }
    .dispatch-doc-page {
      width:210mm; min-height:297mm; padding:8mm; margin:0 auto;
      display:flex; align-items:center; justify-content:center;
      page-break-before:always;
    }
    .dispatch-doc-page img { max-width:194mm; max-height:270mm; object-fit:contain; }
    .dispatch-doc-page embed { width:194mm; height:270mm; border:none; }
    input,textarea,select { border:none!important; outline:none!important; background:transparent!important; }
    @media print {
      @page { size:A4; margin:0; }
      .dispatch-page { page-break-after:always; }
    }
  </style>
</head>
<body>
${clone.innerHTML}
</body>
</html>`)
    win.document.close()
    win.focus()
    // Tailwind + 리소스 로드 후 인쇄
    setTimeout(() => win.print(), 2000)
  }

  return (
    <>
      <style>{`
        @media screen {
          .dispatch-page { width: 210mm; padding: 12mm 18mm; background: white; }
          .dispatch-doc-page { width: 210mm; padding: 8mm; background: white; min-height: 120px; display: flex; flex-direction: column; }
        }
      `}</style>

      <div className="fixed inset-0 bg-black/70 flex flex-col" style={{ zIndex: 9999 }}>

        {/* ── 상단 컨트롤 바 ── */}
        <div className="dispatch-no-print flex items-center gap-3 bg-gray-900 px-5 py-3 shrink-0 flex-wrap"
          onClick={e => { if ((e.target as HTMLElement).closest('.guard-picker-btn') === null) setShowGuardPicker(false) }}>
          <h2 className="text-white font-bold text-sm">📋 배치신고서 작성기</h2>

          {/* 행사 선택 */}
          <select value={selectedInqId} onChange={e => handleSelectInquiry(e.target.value)}
            className="text-xs bg-gray-800 text-white border border-gray-600 rounded-lg px-3 h-8 flex-1 min-w-48 max-w-72">
            <option value="">행사 선택 (기본정보 자동완성)</option>
            {inquiries.map(i => (
              <option key={i.id} value={i.id}>
                {formatDate(i.event_start)} · {i.company_name} · {i.event_name}
              </option>
            ))}
          </select>

          {/* 경호원 선택 */}
          <div className="relative guard-picker-btn">
            <Button size="sm" onClick={e => { e.stopPropagation(); setShowGuardPicker(v => !v) }}
              className="bg-indigo-600 hover:bg-indigo-700 text-xs h-8 gap-1">
              <UserPlus className="h-3.5 w-3.5" />경호원 선택
              <ChevronDown className="h-3 w-3" />
            </Button>
            {showGuardPicker && (
              <div className="absolute top-9 left-0 bg-white rounded-xl shadow-2xl border border-gray-200 w-72" style={{ zIndex: 10000 }}>
                {/* 검색창 */}
                <div className="px-3 pt-2 pb-1 border-b border-gray-100">
                  <input
                    autoFocus
                    value={guardSearch}
                    onChange={e => setGuardSearch(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    placeholder="이름 검색..."
                    className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-400"
                  />
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {guards.length === 0 && (
                    <div className="px-3 py-4 text-xs text-gray-400 text-center">
                      등록된 경호원이 없습니다.<br/>경호원 관리에서 먼저 등록하세요.
                    </div>
                  )}
                  {guards
                    .filter(g => !guardSearch.trim() || g.name.includes(guardSearch.trim()))
                    .map(g => (
                      <button key={g.id} onClick={() => { handlePickGuard(g); setGuardSearch('') }}
                        className="w-full text-left px-3 py-2 hover:bg-indigo-50 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">
                          {g.name[0]}
                        </div>
                        <div>
                          <div className="text-xs font-medium text-gray-800">{g.name}</div>
                          <div className="text-[10px] text-gray-400">{g.job_category} · {g.certificate_number || '이수증 미등록'}</div>
                        </div>
                        <div className="ml-auto flex gap-0.5">
                          {g.id_doc_url && <span className="w-1.5 h-1.5 rounded-full bg-green-400" title="신분증" />}
                          {g.certificate_doc_url && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" title="이수증" />}
                          {g.crime_check_doc_url && <span className="w-1.5 h-1.5 rounded-full bg-purple-400" title="회보서" />}
                        </div>
                      </button>
                    ))
                  }
                  {guardSearch.trim() && guards.filter(g => g.name.includes(guardSearch.trim())).length === 0 && (
                    <div className="px-3 py-3 text-xs text-gray-400 text-center">"{guardSearch}" 검색 결과 없음</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 서류 첨부 토글 */}
          <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
            <input type="checkbox" checked={showDocs} onChange={e => setShowDocs(e.target.checked)} className="rounded" />
            서류 첨부 포함
          </label>

          {/* 불러오기 */}
          <div className="relative">
            <Button size="sm" onClick={() => setShowLoadPicker(v => !v)}
              className="bg-gray-700 hover:bg-gray-600 text-xs h-8 gap-1">
              <FolderOpen className="h-3.5 w-3.5" />불러오기
            </Button>
            {showLoadPicker && (
              <div className="absolute top-9 right-0 bg-white rounded-xl shadow-2xl border border-gray-200 w-80 max-h-72 overflow-y-auto" style={{ zIndex: 10000 }}>
                <div className="px-3 py-2 border-b border-gray-100 text-xs font-semibold text-gray-500">저장된 신고서</div>
                {savedReports.length === 0 && (
                  <div className="px-3 py-4 text-xs text-gray-400 text-center">저장된 신고서가 없습니다.</div>
                )}
                {savedReports.map(r => (
                  <button key={r.id} onClick={() => handleLoadReport(r)}
                    className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 flex items-center gap-2 border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-800 truncate">{r.title || '제목 없음'}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString('ko-KR') : ''}
                        {r.id === currentReportId && <span className="ml-1 text-indigo-500 font-semibold">· 현재 편집 중</span>}
                      </div>
                    </div>
                    <button onClick={e => handleDeleteReport(r.id, e)}
                      className="text-red-300 hover:text-red-500 shrink-0 p-1">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 저장 */}
          <Button size="sm" onClick={handleSave} disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-700 text-xs h-8 gap-1">
            <Save className="h-3.5 w-3.5" />
            {saving ? '저장 중...' : currentReportId ? '덮어쓰기' : '저장'}
          </Button>
          {saveMsg && <span className="text-xs text-emerald-300">{saveMsg}</span>}

          <Button size="sm" onClick={handlePrint}
            className="bg-blue-600 hover:bg-blue-700 text-xs h-8 gap-1">
            <Printer className="h-3.5 w-3.5" />인쇄 / PDF
          </Button>
          <button onClick={onClose} className="text-gray-400 hover:text-white ml-auto">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── 본문 스크롤 영역 ── */}
        <div id="dispatch-print-content" className="dispatch-print-area flex-1 overflow-y-auto bg-gray-100 py-6 flex flex-col items-center gap-6"
          onClick={() => setShowGuardPicker(false)}>

          {/* ── 신고서 설정 패널 (화면 전용) ── */}
          <div className="dispatch-no-print w-[210mm] bg-white rounded-xl border border-gray-200 p-4 shadow">
            <h4 className="text-xs font-bold text-gray-600 mb-3 uppercase tracking-wide">신고서 설정</h4>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] text-gray-500 mb-1.5 block">신고 구분</label>
                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={isBaechi} onChange={e => setIsBaechi(e.target.checked)}
                      className="w-3.5 h-3.5 accent-indigo-600" />
                    <span className="text-xs">배치</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={isPyeji} onChange={e => setIsPyeji(e.target.checked)}
                      className="w-3.5 h-3.5 accent-indigo-600" />
                    <span className="text-xs">배치폐지</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 mb-0.5 block">제출 경찰서</label>
                <Input value={policeStation} onChange={e => setPoliceStation(e.target.value)}
                  placeholder="혜화" className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 mb-0.5 block">신고 날짜</label>
                <Input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)}
                  className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 mb-0.5 block">접수번호</label>
                <Input value={receiptNo} onChange={e => setReceiptNo(e.target.value)}
                  placeholder="(기재 불요)" className="h-8 text-xs" />
              </div>
            </div>
          </div>

          {/* ── A4 신고서 양식 ── */}
          <div className="dispatch-page shadow-xl rounded-sm text-xs" onClick={e => e.stopPropagation()}>

            {/* 제목 */}
            <div className="text-center mb-3">
              <div className="text-[10px] text-left mb-1">
                ■ 경비업법 시행규칙 [별지 제15호서식] &lt;개정 2023. 7. 17.&gt;
              </div>
              <div className="text-xl font-bold leading-tight">
                경비원 [{isBaechi ? 'v' : '\u3000'}] 배치<br />
                　　[{isPyeji  ? 'v' : '\u3000'}] 배치폐지 &nbsp;신고서
              </div>
            </div>

            {/* 접수 행 */}
            <table className="w-full border-collapse" style={{borderTop:'2px solid #000', fontSize:'11px'}}>
              <tbody>
                <tr>
                  <td className="border border-gray-700 px-2 py-1 bg-gray-50 font-medium w-20">접수번호</td>
                  <td className="border border-gray-700 px-2 py-1 w-36">{receiptNo || ''}</td>
                  <td className="border border-gray-700 px-2 py-1 bg-gray-50 font-medium w-16">접수일자</td>
                  <td className="border border-gray-700 px-2 py-1 w-32"></td>
                  <td className="border border-gray-700 px-2 py-1 bg-gray-50 font-medium w-16">처리기간</td>
                  <td className="border border-gray-700 px-2 py-1">즉시</td>
                </tr>
              </tbody>
            </table>

            {/* 신고인 정보 */}
            <table className="w-full border-collapse" style={{fontSize:'11px'}}>
              <tbody>
                <tr>
                  <td className="border border-gray-700 px-1.5 py-1 bg-gray-100 font-bold text-center w-10" rowSpan={4}>신<br/>고<br/>인</td>
                  <td className="border border-gray-700 px-2 py-1 bg-gray-50 font-medium w-28">법인 명칭</td>
                  <td className="border border-gray-700 px-2 py-1 w-44">{COMPANY.name}</td>
                  <td className="border border-gray-700 px-2 py-1 bg-gray-50 font-medium w-24">대표자 성명</td>
                  <td className="border border-gray-700 px-2 py-1">{COMPANY.ceo}</td>
                </tr>
                <tr>
                  <td className="border border-gray-700 px-2 py-1 bg-gray-50 font-medium"></td>
                  <td className="border border-gray-700 px-2 py-1"></td>
                  <td className="border border-gray-700 px-2 py-1 bg-gray-50 font-medium">허가번호</td>
                  <td className="border border-gray-700 px-2 py-1 text-[10px]">{COMPANY.license}</td>
                </tr>
                <tr>
                  <td className="border border-gray-700 px-2 py-1 bg-gray-50 font-medium">소재지</td>
                  <td className="border border-gray-700 px-2 py-1" colSpan={3}>{COMPANY.address}</td>
                </tr>
                <tr>
                  <td className="border border-gray-700 px-2 py-1 bg-gray-50 font-medium">전화번호</td>
                  <td className="border border-gray-700 px-2 py-1">{COMPANY.phone}</td>
                  <td className="border border-gray-700 px-2 py-1 bg-gray-50 font-medium">배치장소(구체적으로 기재)</td>
                  <td className="border border-gray-700 px-2 py-1">
                    <input value={location} onChange={e => setLocation(e.target.value)}
                      className="w-full outline-none bg-transparent" placeholder="배치장소 입력" />
                  </td>
                </tr>
                <tr>
                  <td className="border border-gray-700 px-1.5 py-1 bg-gray-100"></td>
                  <td className="border border-gray-700 px-2 py-1 bg-gray-50 font-medium">배치장소(구체적으로 기재)</td>
                  <td className="border border-gray-700 px-2 py-1">
                    <input value={location} onChange={e => setLocation(e.target.value)}
                      className="w-full outline-none bg-transparent" placeholder="배치장소 입력" />
                  </td>
                  <td className="border border-gray-700 px-2 py-1 bg-gray-50 font-medium">전화번호(경호원)</td>
                  <td className="border border-gray-700 px-2 py-1">
                    <input value={locationPhone} onChange={e => setLocationPhone(e.target.value)}
                      className="w-full outline-none bg-transparent" placeholder="010-0000-0000" />
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 배치 내용 */}
            <table className="w-full border-collapse" style={{fontSize:'11px'}}>
              <tbody>
                <tr>
                  <td className="border border-gray-700 px-1.5 py-1 bg-gray-100 font-bold text-center w-10" rowSpan={2}>
                    경<br/>비<br/>원<br/>배<br/>치<br/>(폐<br/>지)<br/>내<br/>용
                  </td>
                  <td className="border border-gray-700 px-2 py-1 bg-gray-50 font-medium w-28">배치일시</td>
                  <td className="border border-gray-700 px-2 py-1">
                    <div className="flex gap-2">
                      <input value={startDate} onChange={e => setStartDate(e.target.value)}
                        className="outline-none bg-transparent w-32" placeholder="2026. 06. 08." />
                      <input value={startTime} onChange={e => setStartTime(e.target.value)}
                        className="outline-none bg-transparent w-16" placeholder="14:00" />
                    </div>
                  </td>
                  <td className="border border-gray-700 px-2 py-1 bg-gray-50 font-medium w-32">배치폐지(예정)일시</td>
                  <td className="border border-gray-700 px-2 py-1">
                    <div className="flex gap-2">
                      <input value={endDate} onChange={e => setEndDate(e.target.value)}
                        className="outline-none bg-transparent w-32" placeholder="2026. 06. 08." />
                      <input value={endTime} onChange={e => setEndTime(e.target.value)}
                        className="outline-none bg-transparent w-16" placeholder="17:00" />
                    </div>
                  </td>
                </tr>
                <tr>
                  <td className="border border-gray-700 px-2 py-1 bg-gray-50 font-medium">경비의 목적 또는 내용(구체적으로 기재)</td>
                  <td className="border border-gray-700 px-2 py-1" colSpan={3}>
                    <input value={purpose} onChange={e => setPurpose(e.target.value)}
                      className="w-full outline-none bg-transparent" placeholder="경비 목적 입력" />
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 경호원 명단 */}
            <table className="w-full border-collapse" style={{fontSize:'11px'}}>
              <thead>
                <tr className="bg-gray-100">
                  <td className="border border-gray-700 px-1.5 py-1 font-bold text-center w-10" rowSpan={2}>경<br/>비<br/>원<br/>명<br/>단</td>
                  <td className="border border-gray-700 px-2 py-1 font-medium text-center w-8">연번</td>
                  <td className="border border-gray-700 px-2 py-1 font-medium text-center w-16">성명</td>
                  <td className="border border-gray-700 px-2 py-1 font-medium text-center w-36">주민등록번호</td>
                  <td className="border border-gray-700 px-2 py-1 font-medium text-center w-24">배치 경비업무</td>
                  <td className="border border-gray-700 px-2 py-1 font-medium text-center">경비원 신임교육<br/>이수증 교부번호</td>
                  <td className="border border-gray-700 px-1 py-1 text-center no-print w-6"></td>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx}>
                    <td className="border border-gray-700 px-1.5 py-0.5 text-center text-gray-300 text-[9px]">
                      {idx === 0 ? '경비원명단' : ''}
                    </td>
                    <td className="border border-gray-700 px-2 py-1 text-center">{idx + 1}</td>
                    <td className="border border-gray-700 px-1 py-1">
                      <input value={row.name} onChange={e => updateRow(idx, 'name', e.target.value)}
                        className="w-full outline-none bg-transparent text-center" />
                    </td>
                    <td className="border border-gray-700 px-1 py-1">
                      <input value={row.id_number} onChange={e => updateRow(idx, 'id_number', e.target.value)}
                        className="w-full outline-none bg-transparent text-center" />
                    </td>
                    <td className="border border-gray-700 px-1 py-1">
                      <input value={row.job_category} onChange={e => updateRow(idx, 'job_category', e.target.value)}
                        className="w-full outline-none bg-transparent text-center" />
                    </td>
                    <td className="border border-gray-700 px-1 py-1">
                      <input value={row.certificate_number} onChange={e => updateRow(idx, 'certificate_number', e.target.value)}
                        className="w-full outline-none bg-transparent text-center" />
                    </td>
                    <td className="border border-gray-700 px-1 py-0.5 text-center dispatch-no-print">
                      <button onClick={() => removeRow(idx)} className="text-red-300 hover:text-red-500">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 행 추가 버튼 */}
            <button onClick={addEmptyRow}
              className="dispatch-no-print mt-1 w-full text-[10px] text-gray-400 border border-dashed border-gray-200 rounded py-1 hover:border-blue-300 hover:text-blue-500 flex items-center justify-center gap-1">
              <UserPlus className="h-3 w-3" />빈 행 추가
            </button>

            {/* 신고 문구 */}
            <div className="mt-4 text-[11px] leading-relaxed">
              「경비업법」 제18조제2항, 같은 법 시행규칙 제24조에 따라 위와 같이 경비원의 (배치·배치폐지)를 신고합니다.
            </div>
            <div className="mt-3 text-right text-[11px]">
              <div className="mb-2">{reportDateFormatted}</div>
              <div className="flex items-center justify-end gap-6">
                <span>신고인(대표자) &nbsp; 가디어스 대표이사 &nbsp; {COMPANY.ceo}</span>
                <span className="inline-flex items-center justify-center w-10 h-10 border border-gray-400 rounded-full text-gray-300 text-[9px]">(인)</span>
              </div>
            </div>
            <div className="mt-2 text-base font-bold">&nbsp;&nbsp;{policeStation} 경찰서장 &nbsp; 귀하</div>

            {/* 첨부서류 */}
            <table className="w-full border-collapse mt-3" style={{fontSize:'11px'}}>
              <tbody>
                <tr>
                  <td className="border border-gray-700 px-2 py-1 bg-gray-100 font-medium w-16">첨부서류</td>
                  <td className="border border-gray-700 px-2 py-1">
                    병력(兵歷)신고 및 개인정보 이용 동의서(특수경비원의 배치신고에만 해당합니다)
                  </td>
                  <td className="border border-gray-700 px-2 py-1 text-center w-14">수수<br/>없음</td>
                </tr>
              </tbody>
            </table>

            {/* 작성요령 */}
            <div className="mt-2 bg-gray-50 border border-gray-200 rounded p-2 text-[10px] text-gray-600">
              <div className="font-bold text-center mb-1">작성요령</div>
              <div>1. 경비원 신임교육 이수증 번호는 신임교육을 받은 경비원만 적습니다.</div>
              <div>2. 배치·배치폐지 경비원 명단 작성 시 필요하면 별지를 사용하시기 바랍니다.</div>
            </div>
          </div>

          {/* ── 서류 첨부 페이지 ── */}
          {showDocs && docRows.map((row, ri) => (
            <div key={ri} className="flex flex-col items-center gap-4 w-full">
              {row.id_doc_url && (
                <div className="dispatch-doc-page shadow-xl rounded-sm">
                  <div className="dispatch-no-print text-xs text-gray-500 mb-2">{row.name} — 신분증 사본</div>
                  <DocViewer url={row.id_doc_url} label={`${row.name} 신분증`} />
                </div>
              )}
              {row.certificate_doc_url && (
                <div className="dispatch-doc-page shadow-xl rounded-sm">
                  <div className="dispatch-no-print text-xs text-gray-500 mb-2">{row.name} — 이수증</div>
                  <DocViewer url={row.certificate_doc_url} label={`${row.name} 이수증`} />
                </div>
              )}
              {row.crime_check_doc_url && (
                <div className="dispatch-doc-page shadow-xl rounded-sm">
                  <div className="dispatch-no-print text-xs text-gray-500 mb-2">{row.name} — 성범죄 회보서</div>
                  <DocViewer url={row.crime_check_doc_url} label={`${row.name} 성범죄 회보서`} />
                </div>
              )}
            </div>
          ))}

        </div>
      </div>
    </>
  )
}
