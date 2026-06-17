'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { db } from '@/lib/supabase/api'
import type { Inquiry, GuardProfile } from '@/lib/supabase/types'
import { X, Printer, UserPlus, Trash2, ChevronDown, Save, FolderOpen, Mail, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/utils'

// ── 경찰서 연락처 데이터 (전국 경비업 담당) ──────────────────────
interface PoliceStation { region: string; name: string; phone: string; email: string }
const POLICE_DATA: PoliceStation[] = [
  { region:'서울청', name:'중부경찰서', phone:'02-3396-9151', email:'su1bbse@police.go.kr' },
  { region:'서울청', name:'종로경찰서', phone:'02-3701-4130', email:'su2bbse@police.go.kr' },
  { region:'서울청', name:'남대문경찰서', phone:'02-2096-8563', email:'su3bbse@police.go.kr' },
  { region:'서울청', name:'서대문경찰서', phone:'02-335-8175', email:'su4bbse@police.go.kr' },
  { region:'서울청', name:'혜화경찰서', phone:'02-3158-7891', email:'su5bbse@police.go.kr' },
  { region:'서울청', name:'용산경찰서', phone:'02-2198-0274', email:'su6bbse@police.go.kr' },
  { region:'서울청', name:'성북경찰서', phone:'02-920-1411', email:'su7bbse@police.go.kr' },
  { region:'서울청', name:'동대문경찰서', phone:'02-961-4137', email:'su8bbse@police.go.kr' },
  { region:'서울청', name:'마포경찰서', phone:'02-3149-6129', email:'su9bbse@police.go.kr' },
  { region:'서울청', name:'영등포경찰서', phone:'02-2118-9438', email:'su10bbse@police.go.kr' },
  { region:'서울청', name:'성동경찰서', phone:'02-2286-0440', email:'su11bbse@police.go.kr' },
  { region:'서울청', name:'동작경찰서', phone:'02-811-9346', email:'su12bbse@police.go.kr' },
  { region:'서울청', name:'광진경찰서', phone:'02-2285-7141', email:'su13bbse@police.go.kr' },
  { region:'서울청', name:'서부경찰서', phone:'02-335-9546', email:'su14bbse@police.go.kr' },
  { region:'서울청', name:'강북경찰서', phone:'02-944-4457', email:'su15bbse@police.go.kr' },
  { region:'서울청', name:'금천경찰서', phone:'02-801-5307', email:'su16bbse@police.go.kr' },
  { region:'서울청', name:'중랑경찰서', phone:'02-2171-0137', email:'su17bbse@police.go.kr' },
  { region:'서울청', name:'강남경찰서', phone:'02-3673-9138', email:'su18bbse@police.go.kr' },
  { region:'서울청', name:'관악경찰서', phone:'02-870-0183', email:'su19bbse@police.go.kr' },
  { region:'서울청', name:'강서경찰서', phone:'02-2620-9143', email:'su20bbse@police.go.kr' },
  { region:'서울청', name:'강동경찰서', phone:'02-3449-7285', email:'su21bbse@police.go.kr' },
  { region:'서울청', name:'종암경찰서', phone:'02-3396-7522', email:'su22bbse@police.go.kr' },
  { region:'서울청', name:'구로경찰서', phone:'02-840-8909', email:'su23bbse@police.go.kr' },
  { region:'서울청', name:'서초경찰서', phone:'02-3483-9492', email:'su24bbse@police.go.kr' },
  { region:'서울청', name:'양천경찰서', phone:'02-2093-8151', email:'su25bbse@police.go.kr' },
  { region:'서울청', name:'송파경찰서', phone:'02-3402-6456', email:'su26bbse@police.go.kr' },
  { region:'서울청', name:'노원경찰서', phone:'02-2092-0284', email:'su27bbse@police.go.kr' },
  { region:'서울청', name:'방배경찰서', phone:'02-3403-8130', email:'su30bbse@police.go.kr' },
  { region:'서울청', name:'은평경찰서', phone:'02-350-1311', email:'su29bbse@police.go.kr' },
  { region:'서울청', name:'도봉경찰서', phone:'02-2289-9344', email:'su28bbse@police.go.kr' },
  { region:'서울청', name:'수서경찰서', phone:'02-2155-9143', email:'su31bbse@police.go.kr' },
  { region:'부산청', name:'중부경찰서', phone:'051-664-0345', email:'ps1bbse@police.go.kr' },
  { region:'부산청', name:'동래경찰서', phone:'051-559-7346', email:'ps2bbse@police.go.kr' },
  { region:'부산청', name:'해운대경찰서', phone:'051-665-0332', email:'ps8bbse@police.go.kr' },
  { region:'인천청', name:'중부경찰서', phone:'032-760-8131', email:'ic1bbse@police.go.kr' },
  { region:'인천청', name:'부평경찰서', phone:'032-363-1230', email:'ic4bbse@police.go.kr' },
  { region:'대구청', name:'중부경찰서', phone:'053-420-1096', email:'dg1bbse@police.go.kr' },
  { region:'광주청', name:'동부경찰서', phone:'062-609-4346', email:'jn1bbse@police.go.kr' },
  { region:'대전청', name:'중부경찰서', phone:'042-220-7546', email:'cn1bbse@police.go.kr' },
  { region:'경기남부청', name:'수원장안경찰서', phone:'031-299-5343', email:'kk2bbse@police.go.kr' },
  { region:'경기남부청', name:'분당경찰서', phone:'031-786-5345', email:'kk14bbse@police.go.kr' },
  { region:'경기북부청', name:'의정부경찰서', phone:'031-849-3146', email:'kk6bbse@police.go.kr' },
  { region:'경기북부청', name:'고양경찰서', phone:'031-930-5343', email:'kk15bbse@police.go.kr' },
  { region:'강원청', name:'춘천경찰서', phone:'033-245-0607', email:'kw1bbse@police.go.kr' },
  { region:'충북청', name:'청주흥덕경찰서', phone:'043-270-3346', email:'cb2bbse@police.go.kr' },
  { region:'충남청', name:'천안서북경찰서', phone:'041-536-1277', email:'cn7bbse@police.go.kr' },
]

// 저장된 신고서 타입
interface DispatchReport {
  id: string
  title?: string
  police_station?: string
  report_date?: string
  receipt_no?: string
  receipt_date?: string
  is_baechi?: boolean
  is_pyeji?: boolean
  company_name?: string
  company_ceo?: string
  company_license?: string
  company_address?: string
  company_phone?: string
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

// 공통 테이블 셀 스타일 (공식 서식과 동일한 border 규격)
const S = {
  th: {
    border: '1px solid #000',
    padding: '3px 5px',
    background: '#f5f5f5',
    fontWeight: '500',
    fontSize: '11px',
    verticalAlign: 'middle' as const,
    whiteSpace: 'nowrap' as const,
  },
  td: {
    border: '1px solid #000',
    padding: '3px 5px',
    fontSize: '11px',
    verticalAlign: 'middle' as const,
  },
  vLabel: {
    border: '1px solid #000',
    padding: '4px 2px',
    background: '#ffffff',
    fontWeight: 'bold',
    textAlign: 'center' as const,
    verticalAlign: 'middle' as const,
    fontSize: '11px',
    width: '32px',
    lineHeight: '1.6',
  },
  input: {
    width: '100%',
    outline: 'none',
    background: 'transparent',
    border: 'none',
    fontSize: '11px',
    fontFamily: 'inherit',
    display: 'block' as const,
  } as React.CSSProperties,
}

// 회사 고정 정보
const COMPANY = {
  name:    '주식회사 가디어스',
  ceo:     '최규성',
  license: '서울지방경찰청 허가 제 4577호',
  address: '서울시 종로구 동방산1길 2, 1층',
  phone:   '02-1600-2944',
}

// PDF → 캔버스 이미지 뷰어 (pdfjs-dist 사용, iframe 완전 제거)
// 렌더링된 결과가 <img> 태그이므로 팝업 클론 시 완벽하게 복사됨
function PdfCanvasViewer({ url, label }: { url: string; label: string }) {
  const [pages, setPages] = useState<string[]>([])   // base64 dataURL 배열
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    setLoading(true)
    setError('')
    setPages([])

    async function render() {
      try {
        // pdfjs-dist 동적 임포트 (Next.js SSR 방지)
        const pdfjsLib = await import('pdfjs-dist')
        // 워커: 번들 포함 경로 사용
        const workerUrl = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString()
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

        const pdf = await pdfjsLib.getDocument({ url, cMapPacked: true }).promise
        const imgs: string[] = []

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const scale = 2.0   // 고화질 (인쇄 품질)
          const viewport = page.getViewport({ scale })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          await page.render({ canvasContext: ctx, viewport, canvas }).promise
          imgs.push(canvas.toDataURL('image/jpeg', 0.92))
        }

        if (mounted.current) {
          setPages(imgs)
          setLoading(false)
        }
      } catch (e) {
        if (mounted.current) {
          setError('PDF를 불러올 수 없습니다.')
          setLoading(false)
        }
      }
    }

    render()
    return () => { mounted.current = false }
  }, [url])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-gray-400">
        <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-indigo-500 rounded-full" />
        <span className="text-xs">PDF 렌더링 중...</span>
      </div>
    )
  }
  if (error) {
    return <div className="text-xs text-red-400 text-center py-6">{error}</div>
  }
  return (
    <>
      {pages.map((src, i) => (
        <img
          key={i}
          src={src}
          alt={`${label} ${i + 1}페이지`}
          style={{ maxWidth: '100%', width: '100%', display: 'block', marginBottom: i < pages.length - 1 ? '4px' : 0 }}
        />
      ))}
    </>
  )
}

// 이미지 / PDF 자동 분기 뷰어
function DocViewer({ url, label }: { url: string; label: string }) {
  const isPdf = url.toLowerCase().includes('.pdf')
  if (isPdf) {
    return <PdfCanvasViewer url={url} label={label} />
  }
  return (
    <img src={url} alt={label} style={{ maxWidth: '100%', maxHeight: '270mm', width: 'auto', height: 'auto', objectFit: 'contain', display: 'block' }} />
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

  // 이메일 발송 관련 상태
  const [showEmailPicker, setShowEmailPicker] = useState(false)
  const [emailSearch, setEmailSearch] = useState('')

  // 회사 정보 (편집 가능)
  const [companyName,    setCompanyName]    = useState(COMPANY.name)
  const [companyCeo,     setCompanyCeo]     = useState(COMPANY.ceo)
  const [companyLicense, setCompanyLicense] = useState(COMPANY.license)
  const [companyAddress, setCompanyAddress] = useState(COMPANY.address)
  const [companyPhone,   setCompanyPhone]   = useState(COMPANY.phone)

  // 신고서 헤더 (모두 수동 편집 가능) - 배치/배치폐지 독립 체크
  const [isBaechi, setIsBaechi]   = useState(true)
  const [isPyeji,  setIsPyeji]    = useState(true)
  const [receiptNo,   setReceiptNo]   = useState('')
  const [receiptDate, setReceiptDate] = useState('')
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
      receipt_date: receiptDate,
      is_baechi: isBaechi,
      is_pyeji: isPyeji,
      company_name: companyName,
      company_ceo: companyCeo,
      company_license: companyLicense,
      company_address: companyAddress,
      company_phone: companyPhone,
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
    setReceiptDate(r.receipt_date || '')
    setIsBaechi(r.is_baechi ?? true)
    setIsPyeji(r.is_pyeji ?? true)
    setCompanyName(r.company_name || COMPANY.name)
    setCompanyCeo(r.company_ceo || COMPANY.ceo)
    setCompanyLicense(r.company_license || COMPANY.license)
    setCompanyAddress(r.company_address || COMPANY.address)
    setCompanyPhone(r.company_phone || COMPANY.phone)
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

  // 인쇄 / PDF 저장 — 팝업 새 창 방식 (PDF는 canvas→img로 미리 렌더링됨)
  function handlePrint() {
    setShowGuardPicker(false)

    const area = document.getElementById('dispatch-print-content')
    if (!area) { alert('인쇄 영역을 찾을 수 없습니다.'); return }

    // PDF 렌더링 스피너가 아직 돌고 있으면 완료 대기 안내
    if (area.querySelector('.animate-spin')) {
      alert('PDF 파일을 아직 불러오는 중입니다. 잠시 후 다시 시도해주세요.')
      return
    }

    // input 현재 값 → value attribute 동기화
    area.querySelectorAll('input, textarea').forEach(el => {
      (el as HTMLInputElement).setAttribute('value', (el as HTMLInputElement).value)
    })

    const clone = area.cloneNode(true) as HTMLElement
    // 화면 전용 요소 제거
    clone.querySelectorAll('.dispatch-no-print').forEach(el => el.remove())
    // 배경색 초기화
    clone.style.background = 'white'
    clone.style.padding = '0'
    clone.style.overflow = 'visible'

    // DocViewer가 PDF를 canvas→img로 미리 렌더링했으므로
    // iframe이 없음 → 팝업에서도 img 태그로 완벽 복사됨
    // (PDF 렌더링이 완료되지 않은 경우 로딩 스피너 div가 표시됨)

    const win = window.open('', '_blank', 'width=900,height=850')
    if (!win) {
      alert('팝업이 차단되어 있습니다. 브라우저에서 팝업을 허용한 후 다시 시도해주세요.')
      return
    }

    win.document.write(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>배치신고서</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Malgun Gothic','맑은 고딕',sans-serif; background: white; margin: 0; padding: 0; }
    table { border-collapse: collapse; width: 100%; }
    td, th { word-break: keep-all; }
    .dispatch-page { width: 210mm; padding: 12mm 15mm; margin: 0 auto; font-size: 11px; background: white; }

    /* ── 서류 페이지: A4 정확히 1장 ── */
    .dispatch-doc-page {
      width: 210mm; height: 297mm; padding: 10mm; margin: 0 auto;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      page-break-before: always; page-break-after: always; page-break-inside: avoid;
      break-before: page; break-after: page; break-inside: avoid;
      background: white; overflow: hidden;
    }
    .dispatch-no-print { display: none !important; }
    .dispatch-doc-page img {
      max-width: 190mm; max-height: 270mm; width: auto; height: auto;
      object-fit: contain; display: block;
    }
    input, textarea, select {
      border: none !important; outline: none !important; background: transparent !important;
      font-family: 'Malgun Gothic','맑은 고딕',sans-serif; font-size: inherit;
    }
    @media print {
      @page { size: A4; margin: 0; }
      body { margin: 0; }
      .dispatch-page { page-break-after: always; break-after: page; }
    }
  </style>
</head>
<body>
${clone.innerHTML}
</body>
</html>`)
    win.document.close()
    win.focus()

    // 이미지 로딩 완료 후 인쇄 (모든 img onload 대기)
    win.onload = () => {
      const imgs = Array.from(win.document.querySelectorAll('img'))
      if (imgs.length === 0) {
        win.print()
        return
      }
      let loaded = 0
      const tryPrint = () => { if (++loaded >= imgs.length) win.print() }
      imgs.forEach(img => {
        if (img.complete) tryPrint()
        else { img.onload = tryPrint; img.onerror = tryPrint }
      })
    }
  }

  // 이메일 발송 — mailto: 링크로 이메일 클라이언트 실행
  function handleSendEmail(station: PoliceStation) {
    const guardNames = rows.filter(r => r.name.trim()).map(r => r.name).join(', ') || '(경호원 미입력)'
    const subject = encodeURIComponent(`[배치신고] ${companyName} / ${location || '장소 미입력'} / ${startDate || reportDate}`)
    const body = encodeURIComponent([
      `${station.region} ${station.name} 경비업 담당자님께`,
      '',
      `안녕하세요. ${companyName}입니다.`,
      `아래와 같이 경비원 배치신고서를 제출합니다.`,
      '',
      '■ 신고 내용',
      `- 신고 구분: ${[isBaechi ? '배치' : '', isPyeji ? '배치폐지' : ''].filter(Boolean).join(' / ')}`,
      `- 경비원 배치 장소: ${location || '(미입력)'}`,
      `- 전화번호: ${locationPhone || '(미입력)'}`,
      `- 배치 기간: ${startDate || '(미입력)'} ~ ${endDate || '(미입력)'}`,
      `- 경비 목적: ${purpose || '(미입력)'}`,
      '',
      '■ 배치 인원',
      guardNames,
      '',
      `※ 배치신고서 및 관련 서류는 첨부파일을 확인해 주시기 바랍니다.`,
      `   (인쇄/PDF 버튼으로 생성 후 직접 첨부해 주세요)`,
      '',
      `${companyName}`,
      `담당자 연락처: ${companyPhone}`,
      `주소: ${companyAddress}`,
    ].join('\n'))
    window.location.href = `mailto:${station.email}?subject=${subject}&body=${body}`
    setShowEmailPicker(false)
  }

  // 이메일 검색 필터
  const filteredStations = POLICE_DATA.filter(s =>
    !emailSearch.trim() ||
    s.name.includes(emailSearch.trim()) ||
    s.region.includes(emailSearch.trim())
  )

  return (
    <>
      <style>{`
        .dispatch-page {
          width: 210mm; padding: 12mm 15mm; background: white;
          box-sizing: border-box; font-family: 'Malgun Gothic','맑은 고딕',sans-serif;
        }
        /* 화면: 서류 미리보기 영역 */
        .dispatch-doc-page {
          width: 210mm; padding: 10mm; background: white;
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; box-sizing: border-box; min-height: 200px;
        }
        .dispatch-doc-page img {
          max-width: 190mm; max-height: 270mm; width: auto; height: auto;
          object-fit: contain; display: block;
        }
        .dispatch-doc-page iframe {
          width: 190mm; height: 270mm; border: none; display: block;
        }
      `}</style>

      <div className="fixed inset-0 bg-black/70 flex flex-col" style={{ zIndex: 9999 }}>

        {/* ── 상단 컨트롤 바 ── */}
        <div className="dispatch-no-print flex items-center gap-3 bg-gray-900 px-5 py-3 shrink-0 flex-wrap"
          onClick={e => {
            if ((e.target as HTMLElement).closest('.guard-picker-btn') === null) setShowGuardPicker(false)
            if ((e.target as HTMLElement).closest('.email-picker-btn') === null) setShowEmailPicker(false)
          }}>
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

          {/* 이메일 발송 버튼 */}
          <div className="relative email-picker-btn">
            <Button size="sm" onClick={e => { e.stopPropagation(); setShowEmailPicker(v => !v) }}
              className="bg-violet-600 hover:bg-violet-700 text-xs h-8 gap-1">
              <Mail className="h-3.5 w-3.5" />이메일 발송
            </Button>
            {showEmailPicker && (
              <div className="absolute top-9 right-0 bg-white rounded-xl shadow-2xl border border-gray-200 w-80" style={{ zIndex: 10000 }}
                onClick={e => e.stopPropagation()}>
                <div className="px-3 pt-2.5 pb-1.5 border-b border-gray-100">
                  <p className="text-[10px] text-gray-400 mb-1.5">경찰서 선택 시 이메일 앱이 열립니다</p>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <input
                      autoFocus
                      value={emailSearch}
                      onChange={e => setEmailSearch(e.target.value)}
                      placeholder="경찰서 또는 지역 검색..."
                      className="w-full text-xs border border-gray-200 rounded-lg pl-7 pr-2.5 py-1.5 outline-none focus:border-violet-400"
                    />
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {filteredStations.length === 0 && (
                    <div className="px-3 py-4 text-xs text-gray-400 text-center">검색 결과 없음</div>
                  )}
                  {filteredStations.map((s, i) => (
                    <button key={i} onClick={() => handleSendEmail(s)}
                      className="w-full text-left px-3 py-2 hover:bg-violet-50 border-b border-gray-50 last:border-0 flex items-start gap-2">
                      <div className="shrink-0 mt-0.5">
                        <span className="inline-block text-[9px] bg-violet-100 text-violet-700 rounded px-1 py-0.5 font-semibold">{s.region}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-800">{s.name}</div>
                        <div className="text-[10px] text-gray-400 truncate">{s.email}</div>
                      </div>
                      <Mail className="h-3 w-3 text-violet-400 shrink-0 mt-1" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

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

          {/* ── A4 신고서 양식 (경비업법 시행규칙 별지 제15호서식) ── */}
          <div className="dispatch-page shadow-xl rounded-sm" onClick={e => e.stopPropagation()}
            style={{ fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif", fontSize: '11px' }}>

            {/* 상단 법령 표기 */}
            <div style={{ fontSize: '9px', marginBottom: '2px' }}>
              ■ 경비업법 시행규칙 [별지 제15호서식] &lt;개정 2023. 7. 17.&gt;
            </div>

            {/* 제목 — 공식 서식: 경비원(좌,rs2) | 배치/배치폐지(중) | 신고서(우,rs2) */}
            <table style={{ width: '100%', borderCollapse: 'collapse', margin: '6px 0 8px' }}>
              <tbody>
                <tr>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '22px', verticalAlign: 'middle', width: '38%', padding: '2px 8px' }} rowSpan={2}>경비원</td>
                  <td style={{ fontWeight: 'bold', fontSize: '18px', textAlign: 'center', verticalAlign: 'middle', padding: '2px 4px' }}>
                    [{isBaechi ? 'v' : ' '}] 배치
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '22px', letterSpacing: '0.2em', verticalAlign: 'middle', width: '30%', padding: '2px 8px' }} rowSpan={2}>신고서</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold', fontSize: '18px', textAlign: 'center', verticalAlign: 'middle', padding: '2px 4px' }}>
                    [{isPyeji ? 'v' : ' '}] 배치폐지
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ① 접수 행 */}
            <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: '2px solid #000' }}>
              <colgroup>
                <col style={{ width: '13%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '27%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '7%' }} />
              </colgroup>
              <tbody>
                <tr>
                  <td style={S.th}>접수번호</td>
                  <td style={S.td}>
                    <input value={receiptNo} onChange={e => setReceiptNo(e.target.value)}
                      style={S.input} placeholder="" />
                  </td>
                  <td style={S.th}>접수일자</td>
                  <td style={S.td}>
                    <input value={receiptDate} onChange={e => setReceiptDate(e.target.value)}
                      style={S.input} placeholder="" />
                  </td>
                  <td style={S.th}>처리기간</td>
                  <td style={{ ...S.td, textAlign: 'center' }}>즉시</td>
                </tr>
              </tbody>
            </table>

            {/* ② 신고인 — 공식 서식: 레이블/값 각각 별도 행 (6행) */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <colgroup>
                <col style={{ width: '38px' }} />
                <col style={{ width: '43%' }} />
                <col style={{ width: '33%' }} />
                <col />
              </colgroup>
              <tbody>
                {/* 행1: 레이블 */}
                <tr>
                  <td style={S.vLabel} rowSpan={6}>신<br/>고<br/>인</td>
                  <td style={S.th}>법인 명칭</td>
                  <td style={S.th}>대표자 성명</td>
                  <td style={S.th}>허가번호</td>
                </tr>
                {/* 행2: 값 */}
                <tr>
                  <td style={S.td}>
                    <input value={companyName} onChange={e => setCompanyName(e.target.value)} style={S.input} />
                  </td>
                  <td style={S.td}>
                    <input value={companyCeo} onChange={e => setCompanyCeo(e.target.value)} style={S.input} />
                  </td>
                  <td style={S.td}>
                    <input value={companyLicense} onChange={e => setCompanyLicense(e.target.value)}
                      style={{ ...S.input, fontSize: '9.5px' }} />
                  </td>
                </tr>
                {/* 행3: 레이블 */}
                <tr>
                  <td style={S.th} colSpan={2}>소재지</td>
                  <td style={S.th}>전화번호</td>
                </tr>
                {/* 행4: 값 */}
                <tr>
                  <td style={S.td} colSpan={2}>
                    <input value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} style={S.input} />
                  </td>
                  <td style={S.td}>
                    <input value={companyPhone} onChange={e => setCompanyPhone(e.target.value)} style={S.input} />
                  </td>
                </tr>
                {/* 행5: 레이블 */}
                <tr>
                  <td style={S.th} colSpan={2}>배치장소(구체적으로 기재)</td>
                  <td style={S.th}>전화번호(경호원)</td>
                </tr>
                {/* 행6: 값 */}
                <tr>
                  <td style={S.td} colSpan={2}>
                    <input value={location} onChange={e => setLocation(e.target.value)}
                      style={S.input} placeholder="배치장소 입력" />
                  </td>
                  <td style={S.td}>
                    <input value={locationPhone} onChange={e => setLocationPhone(e.target.value)}
                      style={S.input} placeholder="010-0000-0000" />
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ③ 경비원 배치(폐지) 내용 — 공식 서식: 레이블/값 별도 행 (4행) */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <colgroup>
                <col style={{ width: '38px' }} />
                <col style={{ width: '55%' }} />
                <col />
              </colgroup>
              <tbody>
                {/* 행1: 레이블 */}
                <tr>
                  <td style={S.vLabel} rowSpan={4}>경비원<br/>배치(폐지)<br/>내용</td>
                  <td style={S.th}>배치일시</td>
                  <td style={S.th}>배치폐지(예정)일시</td>
                </tr>
                {/* 행2: 값 */}
                <tr>
                  <td style={S.td}>
                    <input value={startDate} onChange={e => setStartDate(e.target.value)}
                      style={{ ...S.input, display: 'inline', width: 'auto', minWidth: '100px' }} placeholder="2026. 06. 08." />
                    &nbsp;
                    <input value={startTime} onChange={e => setStartTime(e.target.value)}
                      style={{ ...S.input, display: 'inline', width: '50px' }} placeholder="14:00" />
                  </td>
                  <td style={S.td}>
                    <input value={endDate} onChange={e => setEndDate(e.target.value)}
                      style={{ ...S.input, display: 'inline', width: 'auto', minWidth: '100px' }} placeholder="2026. 06. 08." />
                    &nbsp;
                    <input value={endTime} onChange={e => setEndTime(e.target.value)}
                      style={{ ...S.input, display: 'inline', width: '50px' }} placeholder="17:00" />
                  </td>
                </tr>
                {/* 행3: 레이블 */}
                <tr>
                  <td style={S.th} colSpan={2}>경비의 목적 또는 내용(구체적으로 기재)</td>
                </tr>
                {/* 행4: 값 */}
                <tr>
                  <td style={S.td} colSpan={2}>
                    <input value={purpose} onChange={e => setPurpose(e.target.value)}
                      style={S.input} placeholder="경비의 목적 또는 내용을 구체적으로 기재" />
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ④ 경비원 명단 */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <colgroup>
                <col style={{ width: '38px' }} />
                <col style={{ width: '28px' }} />
                <col style={{ width: '50px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '70px' }} />
                <col />
                <col className="dispatch-no-print" style={{ width: '22px' }} />
              </colgroup>
              <tbody>
                {/* 헤더 행 */}
                <tr style={{ backgroundColor: '#f5f5f5' }}>
                  <td style={S.vLabel} rowSpan={rows.length + 2}>경비원<br/>명단</td>
                  <td style={{ ...S.th, width: '28px', textAlign: 'center' }} rowSpan={2}>연번</td>
                  <td style={{ ...S.th, width: '52px', textAlign: 'center' }} rowSpan={2}>성명</td>
                  <td style={{ ...S.th, width: '100px', textAlign: 'center' }} rowSpan={2}>주민등록번호</td>
                  <td style={{ ...S.th, width: '70px', textAlign: 'center' }} rowSpan={2}>배치 경비업무</td>
                  <td style={{ ...S.th, textAlign: 'center' }}>경비원 신임교육</td>
                  {/* 화면에서만 보이는 삭제 컬럼 헤더 */}
                  <td className="dispatch-no-print" style={{ border: '1px solid #374151', width: '22px' }} rowSpan={2}></td>
                </tr>
                {/* 헤더 행 2 */}
                <tr style={{ backgroundColor: '#f5f5f5' }}>
                  <td style={{ ...S.th, textAlign: 'center' }}>이수증 교부번호</td>
                </tr>
                {/* 데이터 행 */}
                {rows.map((row, idx) => (
                  <tr key={idx}>
                    <td style={{ ...S.td, textAlign: 'center', padding: '3px 2px' }}>{idx + 1}</td>
                    <td style={{ ...S.td, padding: '2px' }}>
                      <input value={row.name} onChange={e => updateRow(idx, 'name', e.target.value)}
                        style={{ width: '100%', outline: 'none', background: 'transparent', textAlign: 'center' }} />
                    </td>
                    <td style={{ ...S.td, padding: '2px' }}>
                      <input value={row.id_number} onChange={e => updateRow(idx, 'id_number', e.target.value)}
                        style={{ width: '100%', outline: 'none', background: 'transparent', textAlign: 'center' }}
                        placeholder="000000-0000000" />
                    </td>
                    <td style={{ ...S.td, padding: '2px' }}>
                      <input value={row.job_category} onChange={e => updateRow(idx, 'job_category', e.target.value)}
                        style={{ width: '100%', outline: 'none', background: 'transparent', textAlign: 'center' }} />
                    </td>
                    <td style={{ ...S.td, padding: '2px' }}>
                      <input value={row.certificate_number} onChange={e => updateRow(idx, 'certificate_number', e.target.value)}
                        style={{ width: '100%', outline: 'none', background: 'transparent', textAlign: 'center' }} />
                    </td>
                    {/* 화면에서만 보이는 삭제 버튼 */}
                    <td className="dispatch-no-print" style={{ border: '1px solid #374151', textAlign: 'center', padding: '2px' }}>
                      <button onClick={() => removeRow(idx)} style={{ color: '#fca5a5', cursor: 'pointer', lineHeight: 1 }}>
                        <Trash2 style={{ width: '11px', height: '11px' }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 행 추가 버튼 (화면 전용) */}
            <button onClick={addEmptyRow}
              className="dispatch-no-print"
              style={{ marginTop: '3px', width: '100%', fontSize: '10px', color: '#9ca3af',
                border: '1px dashed #d1d5db', borderRadius: '4px', padding: '3px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer' }}>
              <UserPlus style={{ width: '11px', height: '11px' }} />빈 행 추가
            </button>

            {/* ⑤ 신고 문구 */}
            <div style={{ marginTop: '14px', fontSize: '11px', lineHeight: '1.8' }}>
              &nbsp;&nbsp;「경비업법」 제18조제2항, 같은 법 시행규칙 제24조에 따라 위와 같이 경비원의 (배치·배치폐지)를 신고합니다.
            </div>

            {/* ⑥ 날짜 및 서명 — 공식 서식: 날짜는 우측, 신고인은 좌측, 서명란은 우측 */}
            <div style={{ marginTop: '16px', marginBottom: '4px' }}>
              {/* 날짜: 우측 정렬 */}
              <div style={{ textAlign: 'right', fontSize: '11px', marginBottom: '8px' }}>
                {reportDateFormatted}
              </div>
              {/* 신고인(대표자) 좌측 / (서명 또는 인) 우측 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                <div>
                  신고인(대표자) &nbsp;&nbsp;
                  <input value={companyName} onChange={e => setCompanyName(e.target.value)}
                    style={{ ...S.input, display: 'inline', width: '110px' }} />
                  &nbsp;대표이사&nbsp;
                  <input value={companyCeo} onChange={e => setCompanyCeo(e.target.value)}
                    style={{ ...S.input, display: 'inline', width: '55px' }} />
                </div>
                <div style={{ fontSize: '10px', color: '#555' }}>(서명 또는 인)</div>
              </div>
            </div>

            {/* 경찰서장 귀하 */}
            <div style={{ marginTop: '8px', fontSize: '16px', fontWeight: 'bold' }}>
              <input value={policeStation} onChange={e => setPoliceStation(e.target.value)}
                style={{ ...S.input, display: 'inline', width: '50px', fontSize: '16px', fontWeight: 'bold' }} />
              경찰서장 &nbsp;&nbsp; 귀하
            </div>

            {/* ⑦ 첨부서류 */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px', borderTop: '2px solid #000' }}>
              <tbody>
                <tr>
                  <td style={{ ...S.th, width: '55px', verticalAlign: 'middle' }} rowSpan={2}>첨부서류</td>
                  <td style={{ ...S.td }} rowSpan={2}>
                    병력(病歷)신고 및 개인정보 이용 동의서(특수경비원의 배치신고에만 해당합니다)
                  </td>
                  <td style={{ ...S.th, width: '40px', textAlign: 'center' }}>수수료</td>
                </tr>
                <tr>
                  <td style={{ ...S.td, textAlign: 'center' }}>없음</td>
                </tr>
              </tbody>
            </table>

            {/* ⑧ 작성요령 */}
            <div style={{ marginTop: '6px', border: '1px solid #000', padding: '4px 8px', fontSize: '9px', color: '#374151' }}>
              <div style={{ fontWeight: 'bold', textAlign: 'center', marginBottom: '2px' }}>작&nbsp;&nbsp;&nbsp;성&nbsp;&nbsp;&nbsp;요&nbsp;&nbsp;&nbsp;령</div>
              <div>1. 경비원 신임교육 이수증 번호는 신임교육을 받은 경비원만 적습니다.</div>
              <div>2. 배치·배치폐지 경비원 명단 작성 시 필요하면 별지를 사용하시기 바랍니다.</div>
            </div>

            {/* 용지 규격 표기 */}
            <div style={{ textAlign: 'right', fontSize: '8px', color: '#9ca3af', marginTop: '4px' }}>
              210mm×297mm[백상지 80g/㎡ (재활용품)]
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
