'use client'

import { useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/supabase/api'
import type { Inquiry, Assignment, GuardProfile } from '@/lib/supabase/types'
import { X, Printer, ChevronDown, AlertCircle, UserPlus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDate } from '@/lib/utils'

// 회사 고정 정보
const COMPANY = {
  name:    '주식회사 가디어스',
  ceo:     '최규성',
  license: '서울지방경찰청 허가 제 4577호',
  address: '서울시 종로구 동방산1길 2, 1층',
  phone:   '02-1600-2944',
}

interface GuardRow {
  no: number
  name: string
  id_number: string
  job_category: string
  certificate_number: string
  // 매칭된 guard_profile id (있으면 사진 첨부 가능)
  guard_id?: string
  id_doc_url?: string
  certificate_doc_url?: string
  crime_check_doc_url?: string
}

function formatDateTime(dateStr?: string, timeStr?: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const base = `${yy}. ${mm}. ${dd}.`
  return timeStr ? `${base}  ${timeStr}` : base
}

export default function DispatchModal({ onClose }: { onClose: () => void }) {
  // 행사 목록
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [selectedInqId, setSelectedInqId] = useState('')
  const [selectedInq, setSelectedInq] = useState<Inquiry | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [guards, setGuards] = useState<GuardProfile[]>([])
  const [loading, setLoading] = useState(false)

  // 신고서 헤더 필드 (수동 입력 가능)
  const [reportType, setReportType] = useState<'배치' | '배치폐지'>('배치')
  const [receiptNo, setReceiptNo] = useState('')
  const [location, setLocation] = useState('')
  const [locationPhone, setLocationPhone] = useState('')
  const [startDateTime, setStartDateTime] = useState('')
  const [endDateTime, setEndDateTime] = useState('')
  const [purpose, setPurpose] = useState('')
  const [policeStation, setPoliceStation] = useState('혜화')
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10))

  // 경호원 명단 (편집 가능)
  const [rows, setRows] = useState<GuardRow[]>([])

  // 서류 첨부 이미지 표시 여부
  const [showDocs, setShowDocs] = useState(true)

  const loadInitial = useCallback(async () => {
    const [inqs, gs] = await Promise.all([
      db.list<Inquiry>('inquiries', {
        inFilter: { status: ['배정완료', '진행중', '완료', '체결'] },
        order: 'event_start', asc: false,
      }),
      db.list<GuardProfile>('guard_profiles', { order: 'name', asc: true }),
    ])
    setInquiries(inqs)
    setGuards(gs)
  }, [])

  useEffect(() => { loadInitial() }, [loadInitial])

  // 행사 선택 시 배정 인원 + 자동완성
  async function handleSelectInquiry(inqId: string) {
    setSelectedInqId(inqId)
    if (!inqId) { setSelectedInq(null); setRows([]); return }

    setLoading(true)
    const inq = inquiries.find(i => i.id === inqId)!
    setSelectedInq(inq)

    // 헤더 자동완성
    setLocation((inq as any).location || '')
    setStartDateTime(formatDateTime(inq.event_start, (inq as any).event_time))
    setEndDateTime(formatDateTime(inq.event_end, ''))
    setPurpose((inq as any).memo || '')

    // 배정 인원 로드 (본사 제외)
    const asgns = await db.list<Assignment>('assignments', {
      filters: { inquiry_id: inqId },
      order: 'assigned_at', asc: true,
    })
    const external = asgns.filter(a => a.status !== '취소' && a.staff_type !== '본사')

    // guard_profiles 매칭 (staff_id 우선, 없으면 이름으로)
    const matched: GuardRow[] = external.map((a, idx) => {
      const byStaffId = a.staff_id ? guards.find(g => g.staff_id === a.staff_id) : undefined
      const byName    = guards.find(g => g.name === a.staff_name)
      const guard     = byStaffId || byName

      return {
        no: idx + 1,
        name:               a.staff_name || '',
        id_number:          guard?.id_number || '',
        job_category:       guard?.job_category || a.job_type || '신변보호',
        certificate_number: guard?.certificate_number || '',
        guard_id:           guard?.id,
        id_doc_url:         guard?.id_doc_url,
        certificate_doc_url: guard?.certificate_doc_url,
        crime_check_doc_url: guard?.crime_check_doc_url,
      }
    })

    setRows(matched)
    setAssignments(external)
    setLoading(false)
  }

  function updateRow(idx: number, field: keyof GuardRow, value: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  function addRow() {
    setRows(prev => [...prev, {
      no: prev.length + 1,
      name: '', id_number: '', job_category: '신변보호', certificate_number: '',
    }])
  }

  function removeRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, no: i + 1 })))
  }

  function handlePrint() {
    window.print()
  }

  const today = new Date()
  const reportDateFormatted = (() => {
    const d = new Date(reportDate)
    return `${d.getFullYear()}년 ${String(d.getMonth()+1).padStart(2,'0')}월 ${String(d.getDate()).padStart(2,'0')}일`
  })()

  return (
    <>
      {/* 인쇄 전용 CSS */}
      <style>{`
        @media print {
          body > *:not(.dispatch-print-root) { display: none !important; }
          .dispatch-print-root { display: block !important; position: static !important; }
          .no-print { display: none !important; }
          .print-page { 
            width: 210mm; 
            min-height: 297mm; 
            padding: 15mm 20mm;
            margin: 0;
            page-break-after: always;
          }
          .doc-page {
            page-break-before: always;
            width: 210mm;
            min-height: 297mm;
            padding: 10mm;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .doc-page img { max-width: 190mm; max-height: 275mm; object-fit: contain; }
        }
        @media screen {
          .print-page { width: 210mm; padding: 15mm 20mm; background: white; }
          .doc-page { width: 210mm; padding: 10mm; background: white; }
        }
      `}</style>

      <div className="dispatch-print-root fixed inset-0 z-50 bg-black/60 flex flex-col">

        {/* 컨트롤 바 (인쇄 시 숨김) */}
        <div className="no-print flex items-center gap-3 bg-gray-900 px-5 py-3 shrink-0">
          <h2 className="text-white font-bold text-sm flex-1">📋 배치신고서 작성기</h2>

          {/* 행사 선택 */}
          <select
            value={selectedInqId}
            onChange={e => handleSelectInquiry(e.target.value)}
            className="text-xs bg-gray-800 text-white border border-gray-600 rounded-lg px-3 h-8 w-64"
          >
            <option value="">행사를 선택하세요</option>
            {inquiries.map(i => (
              <option key={i.id} value={i.id}>
                {formatDate(i.event_start)} · {i.company_name} · {i.event_name}
              </option>
            ))}
          </select>

          {/* 서류 첨부 토글 */}
          <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
            <input type="checkbox" checked={showDocs} onChange={e => setShowDocs(e.target.checked)}
              className="rounded" />
            서류 첨부 포함
          </label>

          <Button size="sm" onClick={handlePrint}
            className="bg-blue-600 hover:bg-blue-700 text-xs h-8 gap-1">
            <Printer className="h-3.5 w-3.5" />인쇄 / PDF
          </Button>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 본문 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto bg-gray-100 py-6 flex flex-col items-center gap-6">

          {/* ── A4 신고서 양식 ── */}
          <div className="print-page shadow-xl rounded-sm">

            {/* 제목 */}
            <div className="text-center mb-4">
              <div className="text-xs text-left mb-1">■ 경비업법 시행규칙 [별지 제15호서식] &lt;개정 2023. 7. 17.&gt;</div>
              <div className="text-2xl font-bold">
                경비원 [{reportType === '배치' ? 'v' : '　'}] 배치<br />
                　　[{reportType === '배치폐지' ? 'v' : '　'}] 배치폐지 신고서
              </div>
            </div>

            {/* 접수 정보 */}
            <table className="w-full border-collapse text-xs mb-0" style={{borderTop:'2px solid #000'}}>
              <tbody>
                <tr>
                  <td className="border border-gray-800 px-2 py-1 font-medium bg-gray-50 w-20">접수번호</td>
                  <td className="border border-gray-800 px-2 py-1 w-40">
                    <input value={receiptNo} onChange={e => setReceiptNo(e.target.value)}
                      className="w-full outline-none bg-transparent no-print-border" placeholder="(기재 불요)" />
                  </td>
                  <td className="border border-gray-800 px-2 py-1 font-medium bg-gray-50 w-16">접수일자</td>
                  <td className="border border-gray-800 px-2 py-1 w-40"></td>
                  <td className="border border-gray-800 px-2 py-1 font-medium bg-gray-50 w-16">처리기간</td>
                  <td className="border border-gray-800 px-2 py-1">즉시</td>
                </tr>
              </tbody>
            </table>

            {/* 신고인 정보 */}
            <table className="w-full border-collapse text-xs mb-0">
              <tbody>
                <tr>
                  <td className="border border-gray-800 px-2 py-1 font-bold bg-gray-100 text-center w-12" rowSpan={4}>신고인</td>
                  <td className="border border-gray-800 px-2 py-1 font-medium bg-gray-50 w-28">법인 명칭</td>
                  <td className="border border-gray-800 px-2 py-1 w-48">{COMPANY.name}</td>
                  <td className="border border-gray-800 px-2 py-1 font-medium bg-gray-50 w-24">대표자 성명</td>
                  <td className="border border-gray-800 px-2 py-1">{COMPANY.ceo}</td>
                </tr>
                <tr>
                  <td className="border border-gray-800 px-2 py-1 font-medium bg-gray-50" colSpan={1}></td>
                  <td className="border border-gray-800 px-2 py-1" colSpan={1}></td>
                  <td className="border border-gray-800 px-2 py-1 font-medium bg-gray-50">허가번호</td>
                  <td className="border border-gray-800 px-2 py-1 text-xs">{COMPANY.license}</td>
                </tr>
                <tr>
                  <td className="border border-gray-800 px-2 py-1 font-medium bg-gray-50">소재지</td>
                  <td className="border border-gray-800 px-2 py-1" colSpan={3}>{COMPANY.address}</td>
                </tr>
                <tr>
                  <td className="border border-gray-800 px-2 py-1 font-medium bg-gray-50">전화번호</td>
                  <td className="border border-gray-800 px-2 py-1">{COMPANY.phone}</td>
                  <td className="border border-gray-800 px-2 py-1 font-medium bg-gray-50">배치장소(구체적으로 기재)</td>
                  <td className="border border-gray-800 px-2 py-1">
                    <input value={location} onChange={e => setLocation(e.target.value)}
                      className="w-full outline-none bg-transparent" placeholder="배치장소 입력" />
                  </td>
                </tr>
                <tr>
                  <td className="border border-gray-800 px-2 py-1 font-medium bg-gray-50"></td>
                  <td className="border border-gray-800 px-2 py-1 font-medium bg-gray-50">배치장소(구체적으로 기재)</td>
                  <td className="border border-gray-800 px-2 py-1" colSpan={1}>
                    <input value={location} onChange={e => setLocation(e.target.value)}
                      className="w-full outline-none bg-transparent" placeholder="배치장소 입력" />
                  </td>
                  <td className="border border-gray-800 px-2 py-1 font-medium bg-gray-50">전화번호(경호원)</td>
                  <td className="border border-gray-800 px-2 py-1">
                    <input value={locationPhone} onChange={e => setLocationPhone(e.target.value)}
                      className="w-full outline-none bg-transparent" placeholder="010-0000-0000" />
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 배치 내용 */}
            <table className="w-full border-collapse text-xs mb-0">
              <tbody>
                <tr>
                  <td className="border border-gray-800 px-2 py-1 font-bold bg-gray-100 text-center w-12" rowSpan={3}>
                    경비원<br/>배치(폐<br/>지)내용
                  </td>
                  <td className="border border-gray-800 px-2 py-1 font-medium bg-gray-50 w-28">배치일시</td>
                  <td className="border border-gray-800 px-2 py-1">
                    <input value={startDateTime} onChange={e => setStartDateTime(e.target.value)}
                      className="w-full outline-none bg-transparent" />
                  </td>
                  <td className="border border-gray-800 px-2 py-1 font-medium bg-gray-50 w-36">배치폐지(예정)일시</td>
                  <td className="border border-gray-800 px-2 py-1">
                    <input value={endDateTime} onChange={e => setEndDateTime(e.target.value)}
                      className="w-full outline-none bg-transparent" />
                  </td>
                </tr>
                <tr>
                  <td className="border border-gray-800 px-2 py-1 font-medium bg-gray-50" colSpan={1}>경비의 목적 또는 내용(구체적으로 기재)</td>
                  <td className="border border-gray-800 px-2 py-1" colSpan={3}>
                    <input value={purpose} onChange={e => setPurpose(e.target.value)}
                      className="w-full outline-none bg-transparent" placeholder="경비 목적 입력" />
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 경호원 명단 */}
            <table className="w-full border-collapse text-xs mb-0">
              <thead>
                <tr className="bg-gray-100">
                  <td className="border border-gray-800 px-2 py-1 font-bold text-center w-12" rowSpan={2}>경비원<br/>명단</td>
                  <td className="border border-gray-800 px-2 py-1 font-medium text-center w-8">연번</td>
                  <td className="border border-gray-800 px-2 py-1 font-medium text-center w-20">성명</td>
                  <td className="border border-gray-800 px-2 py-1 font-medium text-center w-36">주민등록번호</td>
                  <td className="border border-gray-800 px-2 py-1 font-medium text-center w-24">배치 경비업무</td>
                  <td className="border border-gray-800 px-2 py-1 font-medium text-center">
                    경비원 신임교육<br/>이수증 교부번호
                  </td>
                  <td className="border border-gray-800 px-2 py-1 text-center no-print w-8">-</td>
                </tr>
              </thead>
              <tbody>
                {/* 최소 6행 */}
                {Array.from({ length: Math.max(6, rows.length) }).map((_, idx) => {
                  const row = rows[idx]
                  return (
                    <tr key={idx}>
                      <td className="border border-gray-800 px-1 py-1 text-center text-gray-400 text-xs">
                        {idx === 0 ? '경비원명단' : ''}
                      </td>
                      <td className="border border-gray-800 px-2 py-1 text-center">{idx + 1}</td>
                      <td className="border border-gray-800 px-1 py-1">
                        <input value={row?.name || ''} onChange={e => row && updateRow(idx, 'name', e.target.value)}
                          className="w-full outline-none bg-transparent text-center" />
                      </td>
                      <td className="border border-gray-800 px-1 py-1">
                        <input value={row?.id_number || ''} onChange={e => row && updateRow(idx, 'id_number', e.target.value)}
                          className="w-full outline-none bg-transparent text-center" />
                      </td>
                      <td className="border border-gray-800 px-1 py-1">
                        <input value={row?.job_category || ''} onChange={e => row && updateRow(idx, 'job_category', e.target.value)}
                          className="w-full outline-none bg-transparent text-center" />
                      </td>
                      <td className="border border-gray-800 px-1 py-1">
                        <input value={row?.certificate_number || ''} onChange={e => row && updateRow(idx, 'certificate_number', e.target.value)}
                          className="w-full outline-none bg-transparent text-center" />
                      </td>
                      <td className="border border-gray-800 px-1 py-0.5 text-center no-print">
                        {row && <button onClick={() => removeRow(idx)} className="text-red-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* 행 추가 버튼 (인쇄 시 숨김) */}
            <button onClick={addRow}
              className="no-print mt-1 w-full text-xs text-gray-400 border border-dashed border-gray-200 rounded py-1 hover:border-blue-300 hover:text-blue-500 flex items-center justify-center gap-1">
              <UserPlus className="h-3 w-3" />인원 추가
            </button>

            {/* 신고 문구 */}
            <div className="mt-4 text-xs">
              「경비업법」 제18조제2항, 같은 법 시행규칙 제24조에 따라 위와 같이 경비원의 (배치·배치폐지)를 신고합니다.
            </div>

            <div className="mt-3 text-right text-xs">
              <div className="mb-2">{reportDateFormatted}</div>
              <div className="flex items-center justify-end gap-4">
                <span>신고인(대표자) &nbsp;&nbsp;&nbsp; 가디어스 대표이사 {COMPANY.ceo}</span>
                <span className="inline-block w-10 h-10 border border-gray-400 rounded-full text-center text-gray-300 leading-10 text-[10px]">(인)</span>
              </div>
            </div>

            <div className="mt-2 text-xl font-bold">&nbsp;&nbsp;{policeStation} 경찰서장 &nbsp; 귀하</div>

            {/* 첨부서류 */}
            <div className="mt-4 border-t border-gray-300 pt-2">
              <table className="w-full border-collapse text-xs">
                <tbody>
                  <tr>
                    <td className="border border-gray-800 px-2 py-1 font-medium bg-gray-100 w-16">첨부서류</td>
                    <td className="border border-gray-800 px-2 py-1">
                      병력(兵歷)신고 및 개인정보 이용 동의서(특수경비원의 배치신고에만 해당합니다)
                    </td>
                    <td className="border border-gray-800 px-2 py-1 text-center w-16">
                      수수<br/>없음
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 작성요령 */}
            <div className="mt-3 bg-gray-50 border border-gray-200 rounded p-2 text-xs text-gray-600">
              <div className="font-bold text-center mb-1">직성요령</div>
              <div>1. 경비원 신임교육 이수증 번호는 신임교육을 받은 경비원만 적습니다.</div>
              <div>2. 배치·배치폐지 경비원 명단 작성 시 필요하면 별지를 사용하시기 바랍니다.</div>
            </div>
          </div>

          {/* ── 서류 첨부 페이지 (체크 시 인쇄 포함) ── */}
          {showDocs && rows.filter(r => r.id_doc_url || r.certificate_doc_url || r.crime_check_doc_url).map(row => (
            <div key={row.guard_id || row.name} className="w-full flex flex-col items-center gap-4">
              {/* 신분증 */}
              {row.id_doc_url && (
                <div className="doc-page shadow-xl rounded-sm">
                  <div className="text-xs text-gray-500 mb-2 no-print">{row.name} — 신분증 사본</div>
                  <img src={row.id_doc_url} alt={`${row.name} 신분증`}
                    className="max-w-full max-h-[260mm] object-contain" />
                </div>
              )}
              {/* 이수증 */}
              {row.certificate_doc_url && (
                <div className="doc-page shadow-xl rounded-sm">
                  <div className="text-xs text-gray-500 mb-2 no-print">{row.name} — 신임경비교육 이수증</div>
                  <img src={row.certificate_doc_url} alt={`${row.name} 이수증`}
                    className="max-w-full max-h-[260mm] object-contain" />
                </div>
              )}
              {/* 성범죄 회보서 */}
              {row.crime_check_doc_url && (
                <div className="doc-page shadow-xl rounded-sm">
                  <div className="text-xs text-gray-500 mb-2 no-print">{row.name} — 성범죄 회보서</div>
                  <img src={row.crime_check_doc_url} alt={`${row.name} 성범죄 회보서`}
                    className="max-w-full max-h-[260mm] object-contain" />
                </div>
              )}
            </div>
          ))}

          {/* 컨트롤 패널 (화면 전용) */}
          <div className="no-print w-[210mm] bg-white rounded-xl border border-gray-200 p-4 shadow">
            <h4 className="text-sm font-bold text-gray-700 mb-3">신고서 설정</h4>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">신고 구분</label>
                <select value={reportType} onChange={e => setReportType(e.target.value as any)}
                  className="w-full h-8 text-xs border border-gray-200 rounded-lg px-2">
                  <option>배치</option>
                  <option>배치폐지</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">제출 경찰서</label>
                <Input value={policeStation} onChange={e => setPoliceStation(e.target.value)}
                  placeholder="혜화" className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">신고 날짜</label>
                <Input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)}
                  className="h-8 text-xs" />
              </div>
            </div>

            {/* 매칭 현황 */}
            {rows.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-600 mb-2">경호원 서류 매칭 현황</p>
                <div className="space-y-1">
                  {rows.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-20 font-medium truncate">{r.name || `(${i+1}번)`}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${r.id_doc_url ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>신분증</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${r.certificate_doc_url ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>이수증</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${r.crime_check_doc_url ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>회보서</span>
                      {!r.guard_id && (
                        <span className="text-amber-500 text-[10px] flex items-center gap-0.5">
                          <AlertCircle className="h-3 w-3" />경호원 DB 미연결
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  )
}
