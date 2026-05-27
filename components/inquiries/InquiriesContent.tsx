'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { db } from '@/lib/supabase/api'
import { STATUS_COLORS, formatDate } from '@/lib/utils'
import { parseInquiryText, calcParseConfidence, type ParsedInquiry } from '@/lib/inquiryParser'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter, DialogClose
} from '@/components/ui/dialog'
import {
  Plus, Search, Edit2, Trash2, ChevronRight,
  Zap, CheckCircle, AlertCircle, ClipboardPaste, X
} from 'lucide-react'
import type { Inquiry, InquiryStatus } from '@/lib/supabase/types'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

const STATUS_OPTIONS: InquiryStatus[] = [
  '접수', '견적', '체결', '배정완료', '진행중', '완료', '정산완료', '미체결', '보류', '취소'
]
const SERVICE_TYPES = [
  '행사도우미', '나레이터', '전시도우미', '안내도우미', '판촉도우미',
  '스탭/경호', '경호원', '의전도우미', '프로모터', '기타'
]

const emptyForm = {
  company_name: '',
  contact_name: '',
  phone: '',
  event_name: '',
  location: '',
  event_start: '',
  event_end: '',
  event_time: '',
  date_memo: '',       // 비정기 일정 메모 (예: 5월 5일, 5월 7일)
  service_type: '',
  required_staff: '',
  pay_detail: '',
  expected_pay: '',
  status: '접수' as InquiryStatus,
  notes: '',
  attire: '',
  meal: '',
  parking: '',
  consult_notes: '',
  relationship: '신규',
  category: '',
}

export default function InquiriesContent() {
  const searchParams = useSearchParams()
  const defaultStatus = searchParams.get('status') || ''

  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [filterStatus, setFilterStatus] = useState(defaultStatus)
  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState<Inquiry | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dateUndecided, setDateUndecided] = useState(false)

  // 카톡 자동 분석 상태
  const [kakaoText, setKakaoText] = useState('')
  const [parseConfidence, setParseConfidence] = useState(0)
  const [parseDone, setParseDone] = useState(false)
  const [showKakaoBox, setShowKakaoBox] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const data = await db.list<Inquiry>('inquiries', { order: 'created_at', asc: false })
    setInquiries(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── 카톡 자동 분석 ───────────────────────────────────────────
  function handleParse() {
    if (!kakaoText.trim()) return

    const parsed = parseInquiryText(kakaoText)
    const confidence = calcParseConfidence(parsed)

    setForm(f => ({
      ...f,
      company_name:    parsed.company_name   || f.company_name,
      contact_name:    parsed.contact_name   || f.contact_name,
      phone:           parsed.phone          || f.phone,
      event_name:      parsed.event_name     || f.event_name,
      location:        parsed.location       || f.location,
      event_start:     parsed.event_start    || f.event_start,
      event_end:       parsed.event_end      || f.event_end,
      event_time:      parsed.event_time     || f.event_time,
      service_type:    parsed.service_type   || f.service_type,
      required_staff:  parsed.required_staff != null ? String(parsed.required_staff) : f.required_staff,
      pay_detail:      parsed.pay_detail     || f.pay_detail,
      expected_pay:    parsed.expected_pay   != null ? String(parsed.expected_pay)   : f.expected_pay,
      attire:          parsed.attire         || f.attire,
      meal:            parsed.meal           || f.meal,
      parking:         parsed.parking        || f.parking,
      notes:           parsed.notes          || f.notes,
    }))

    setParseConfidence(confidence)
    setParseDone(true)
    // 분석 후 카톡창 접기
    if (confidence >= 60) setShowKakaoBox(false)
  }

  function handleClearParse() {
    setKakaoText('')
    setParseDone(false)
    setParseConfidence(0)
    setShowKakaoBox(true)
  }
  // ─────────────────────────────────────────────────────────────

  const filtered = inquiries.filter(inq => {
    const matchSearch = !searchText || [inq.company_name, inq.event_name, inq.contact_name]
      .some(v => v?.toLowerCase().includes(searchText.toLowerCase()))
    const matchStatus = !filterStatus || inq.status === filterStatus
    return matchSearch && matchStatus
  })

  function openCreate() {
    setEditTarget(null)
    setForm(emptyForm)
    setDateUndecided(false)
    setKakaoText('')
    setParseDone(false)
    setParseConfidence(0)
    setShowKakaoBox(true)
    setError('')
    setShowModal(true)
  }

  function openEdit(inq: Inquiry) {
    setEditTarget(inq)
    setDateUndecided(!inq.event_start)
    setShowKakaoBox(false)
    setParseDone(false)
    setForm({
      company_name:   inq.company_name   || '',
      contact_name:   inq.contact_name   || '',
      phone:          inq.phone          || '',
      event_name:     inq.event_name     || '',
      location:       inq.location       || '',
      event_start:    inq.event_start    || '',
      event_end:      inq.event_end      || '',
      event_time:     inq.event_time     || '',
      date_memo:      (inq as any).date_memo || '',
      service_type:   inq.service_type   || '',
      required_staff: String(inq.required_staff || ''),
      pay_detail:     (inq as any).pay_detail || '',
      expected_pay:   String(inq.expected_pay  || ''),
      status:         inq.status,
      notes:          inq.notes          || '',
      attire:         inq.attire         || '',
      meal:           inq.meal           || '',
      parking:        inq.parking        || '',
      consult_notes:  inq.consult_notes  || '',
      relationship:   inq.relationship   || '신규',
      category:       inq.category       || '',
    })
    setError('')
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.company_name.trim()) { setError('업체명을 입력해주세요.'); return }
    if (!form.event_name.trim())   { setError('행사명을 입력해주세요.');  return }

    setSaving(true)
    setError('')

    // 고객사 자동 연결/등록
    let customerId: string | null = null
    const existingCustomers = await db.list<{ id: string }>('customers', {
      select: 'id', filters: { company_name: form.company_name.trim() }, limit: 1
    })
    if (existingCustomers.length > 0) {
      customerId = existingCustomers[0].id
    } else {
      const newCustomers = await db.insert<{ id: string }>('customers', {
        company_name:  form.company_name.trim(),
        contact_name:  form.contact_name.trim() || null,
        phone:         form.phone.trim()         || null,
        customer_type: '법인',
      })
      customerId = newCustomers[0]?.id || null
    }

    const payNote = form.pay_detail.trim() ? `[페이: ${form.pay_detail.trim()}]` : ''
    const notesWithPay = [payNote, form.notes.trim()].filter(Boolean).join('\n')

    // 신규 문의에만 inquiry_code 발급 (INQ-YYYYMMDD-XXXX)
    const now = new Date()
    const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`
    const rand = Math.random().toString(36).toUpperCase().slice(2,6)
    const newInquiryCode = `INQ-${dateStr}-${rand}`

    const payload: Record<string, unknown> = {
      company_name:   form.company_name.trim(),
      customer_id:    customerId,
      contact_name:   form.contact_name.trim()  || null,
      phone:          form.phone.trim()          || null,
      event_name:     form.event_name.trim(),
      location:       form.location.trim()       || null,
      event_start:    form.event_start           || null,
      event_end:      form.event_end             || null,
      event_time:     form.event_time.trim()     || null,
      date_memo:      form.date_memo.trim()      || null,
      service_type:   form.service_type          || null,
      required_staff: form.required_staff ? Number(form.required_staff) : null,
      expected_pay:   form.expected_pay   ? Number(form.expected_pay)   : null,
      pay_detail:     form.pay_detail.trim()     || null,
      status:         form.status,
      notes:          notesWithPay               || null,
      attire:         form.attire.trim()         || null,
      meal:           form.meal.trim()           || null,
      parking:        form.parking.trim()        || null,
      consult_notes:  form.consult_notes.trim()  || null,
      relationship:   form.relationship          || null,
      category:       form.category.trim()       || null,
    }

    const tid = toast.loading(editTarget ? '문의를 수정하는 중...' : '문의를 등록하는 중...')
    try {
      if (editTarget) {
        await db.update('inquiries', editTarget.id, payload)
        toast.success(`문의가 수정되었습니다. (${form.company_name})`, { id: tid })
      } else {
        // 신규 등록: inquiry_code 포함
        await db.insert('inquiries', { ...payload, inquiry_code: newInquiryCode })
        toast.success(
          `문의가 등록되었습니다! ${newInquiryCode}`,
          { id: tid, description: `${form.company_name} — ${form.event_name}`, duration: 5000 }
        )
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '저장 실패'
      toast.error(`저장 실패: ${msg}`, { id: tid })
      setSaving(false)
      setError(msg)
      return
    }

    setSaving(false)
    setShowModal(false)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('이 문의를 삭제하시겠습니까?')) return
    await db.delete('inquiries', id)
    load()
  }

  async function handleStatusChange(id: string, status: InquiryStatus) {
    await db.update('inquiries', id, { status })
    setInquiries(prev => prev.map(i => i.id === id ? { ...i, status } : i))
  }

  return (
    <>
      {/* 필터 바 */}
      <div className="erp-filter-bar">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="업체명, 행사명, 담당자 검색..."
            className="pl-9"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />
        </div>
        <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-36">
          <option value="">전체 상태</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Button onClick={openCreate} className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" />
          문의 등록
        </Button>
      </div>

      {/* 상태 탭 */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        <button
          onClick={() => setFilterStatus('')}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterStatus === '' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          전체 {inquiries.length}
        </button>
        {STATUS_OPTIONS.map(s => {
          const cnt = inquiries.filter(i => i.status === s).length
          if (cnt === 0) return null
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filterStatus === s ? 'bg-gray-900 text-white' : `${STATUS_COLORS[s] || 'bg-gray-100 text-gray-600'} hover:opacity-80`}`}
            >
              {s} {cnt}
            </button>
          )
        })}
      </div>

      {/* 테이블 */}
      <div className="erp-card">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="erp-table">
                <thead>
                  <tr>
                    <th>문의번호</th>
                    <th>업체명</th>
                    <th>행사명</th>
                    <th>담당자</th>
                    <th>행사일</th>
                    <th>인원</th>
                    <th>페이</th>
                    <th>상태</th>
                    <th>서비스</th>
                    <th className="text-right">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={9}><div className="erp-empty"><Search className="h-10 w-10" /><p>검색 결과가 없습니다.</p></div></td></tr>
                  ) : (
                    filtered.map(inq => (
                      <tr key={inq.id}>
                        <td>
                          {(inq as any).inquiry_code ? (
                            <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded whitespace-nowrap">
                              {(inq as any).inquiry_code}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-300 italic">-</span>
                          )}
                        </td>
                        <td className="font-medium">{inq.company_name || '-'}</td>
                        <td>
                          <Link href={`/inquiries/${inq.id}`} className="text-blue-600 hover:underline flex items-center gap-1">
                            {inq.event_name}
                            <ChevronRight className="h-3 w-3" />
                          </Link>
                        </td>
                        <td>{inq.contact_name || '-'}</td>
                        <td className="text-sm text-gray-600">
                          {inq.event_start
                            ? <>
                                {formatDate(inq.event_start)}
                                {inq.event_end && inq.event_end !== inq.event_start ? ` ~ ${formatDate(inq.event_end)}` : ''}
                              </>
                            : (inq as any).date_memo
                              ? <span className="text-amber-600 text-xs">{(inq as any).date_memo}</span>
                              : <span className="text-gray-300 text-xs">미정</span>
                          }
                        </td>
                        <td className="text-center">{inq.required_staff ? `${inq.required_staff}명` : '-'}</td>
                        <td className="text-xs text-gray-600">
                          {(inq as any).pay_detail || (inq.expected_pay ? `${(inq.expected_pay / 10000).toFixed(0)}만원` : '-')}
                        </td>
                        <td>
                          <Select
                            value={inq.status}
                            onChange={e => handleStatusChange(inq.id, e.target.value as InquiryStatus)}
                            className="w-28 h-8 text-xs"
                          >
                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                          </Select>
                        </td>
                        <td className="text-gray-500 text-xs">{inq.service_type || '-'}</td>
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(inq)} title="수정">
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(inq.id)} className="text-red-500 hover:text-red-700" title="삭제">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 문의 등록/수정 다이얼로그 ── */}
      <Dialog open={showModal} onClose={() => setShowModal(false)} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editTarget ? '문의 수정' : '신규 문의 접수'}</DialogTitle>
          <DialogClose onClose={() => setShowModal(false)} />
        </DialogHeader>

        <DialogContent className="space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
          )}

          {/* ── 카톡 자동 분석 박스 (신규 등록 시만) ── */}
          {!editTarget && (
            <div className={`rounded-xl border-2 transition-all ${parseDone ? 'border-green-300 bg-green-50' : 'border-blue-200 bg-blue-50'}`}>
              <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2">
                  <Zap className={`h-4 w-4 ${parseDone ? 'text-green-600' : 'text-blue-600'}`} />
                  <span className={`text-sm font-semibold ${parseDone ? 'text-green-700' : 'text-blue-700'}`}>
                    카톡/문자 자동 분석
                  </span>
                  {parseDone && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      parseConfidence >= 70 ? 'bg-green-200 text-green-800'
                      : parseConfidence >= 40 ? 'bg-yellow-200 text-yellow-800'
                      : 'bg-red-200 text-red-800'
                    }`}>
                      분석 품질 {parseConfidence}%
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {parseDone && (
                    <button onClick={handleClearParse} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                      <X className="h-3 w-3" /> 다시 분석
                    </button>
                  )}
                  <button
                    onClick={() => setShowKakaoBox(!showKakaoBox)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    {showKakaoBox ? '접기' : '펼치기'}
                  </button>
                </div>
              </div>

              {showKakaoBox && (
                <div className="px-3 pb-3 space-y-2">
                  <Textarea
                    placeholder={`카톡/문자 내용을 그대로 붙여넣으세요.\n\n업체 : 알마슬립\n행사명 : 킨텍스 가구 박람회\n연락처 : 010-2413-0268\n일시 : 6월 18일 ~ 6월 21일\n시간 : 09:30 ~ 18:00\n서비스종류 : 여성 나레이터\n요청인원수 : 2명\n페이 : 팀장 22 / 서브 17\n복장 : 깔끔,단정\n식사 : 제공\n주차 : 가능\n특이사항 : ...`}
                    rows={6}
                    value={kakaoText}
                    onChange={e => setKakaoText(e.target.value)}
                    className="text-xs bg-white"
                  />
                  <Button
                    onClick={handleParse}
                    disabled={!kakaoText.trim()}
                    className="w-full"
                  >
                    <Zap className="h-4 w-4" />
                    자동 분석 실행
                  </Button>
                  {parseDone && (
                    <div className="flex items-center gap-2 text-xs text-green-700">
                      <CheckCircle className="h-3.5 w-3.5" />
                      아래 필드에 자동으로 입력되었습니다. 확인 후 수정하세요.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── 입력 폼 ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">업체명 *</label>
              <Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="업체명" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">행사명 *</label>
              <Input value={form.event_name} onChange={e => setForm(f => ({ ...f, event_name: e.target.value }))} placeholder="행사명" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">담당자</label>
              <Input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">연락처</label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="010-0000-0000" />
            </div>
            {/* 날짜 입력 영역 */}
            <div className="col-span-2">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-600">행사 일정</label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dateUndecided}
                    onChange={e => {
                      setDateUndecided(e.target.checked)
                      if (e.target.checked) setForm(f => ({ ...f, event_start: '', event_end: '' }))
                    }}
                    className="w-3.5 h-3.5 rounded"
                  />
                  <span className="text-xs text-gray-500">날짜 미정</span>
                </label>
              </div>
              {dateUndecided ? (
                <Input
                  value={form.date_memo}
                  onChange={e => setForm(f => ({ ...f, date_memo: e.target.value }))}
                  placeholder="예: 5월 5일, 5월 7일 / 6월 중순 예정 등 자유롭게 입력"
                  className="text-sm"
                />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">시작일</label>
                    <Input type="date" value={form.event_start} onChange={e => setForm(f => ({ ...f, event_start: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">종료일 <span className="text-gray-300">(당일 행사면 생략)</span></label>
                    <Input type="date" value={form.event_end} onChange={e => setForm(f => ({ ...f, event_end: e.target.value }))} />
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">장소</label>
              <Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="킨텍스, 코엑스 등" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">행사 시간</label>
              <Input value={form.event_time} onChange={e => setForm(f => ({ ...f, event_time: e.target.value }))} placeholder="09:30 ~ 18:00" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">서비스 종류</label>
              <Select value={form.service_type} onChange={e => setForm(f => ({ ...f, service_type: e.target.value }))}>
                <option value="">선택</option>
                {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">필요 인원</label>
              <Input type="number" value={form.required_staff} onChange={e => setForm(f => ({ ...f, required_staff: e.target.value }))} placeholder="명" />
            </div>

            {/* 페이 — 텍스트로 자유 입력 */}
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                페이
                <span className="ml-1 text-gray-400 font-normal">(만원 단위 · 예: 팀장 22 / 서브 17)</span>
              </label>
              <Input
                value={form.pay_detail}
                onChange={e => setForm(f => ({ ...f, pay_detail: e.target.value }))}
                placeholder="팀장 22 / 서브 17"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">복장</label>
              <Input value={form.attire} onChange={e => setForm(f => ({ ...f, attire: e.target.value }))} placeholder="깔끔, 단정 등" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">식사</label>
              <Select value={form.meal} onChange={e => setForm(f => ({ ...f, meal: e.target.value }))}>
                <option value="">선택</option>
                <option value="제공">제공</option>
                <option value="미제공">미제공</option>
                <option value="식대지급">식대지급</option>
                <option value="미정">미정</option>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">주차</label>
              <Select value={form.parking} onChange={e => setForm(f => ({ ...f, parking: e.target.value }))}>
                <option value="">선택</option>
                <option value="가능">가능</option>
                <option value="불가">불가</option>
                <option value="유료">유료</option>
                <option value="미정">미정</option>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">상태</label>
              <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as InquiryStatus }))}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">신규/기존</label>
              <Select value={form.relationship} onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))}>
                <option value="신규">신규</option>
                <option value="기존">기존</option>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">특이사항</label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="인원 구성, 업무 상세, 요청사항 등" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">상담 내용 (내부용)</label>
            <Textarea value={form.consult_notes} onChange={e => setForm(f => ({ ...f, consult_notes: e.target.value }))} rows={2} placeholder="고객 성향, 내부 메모" />
          </div>
        </DialogContent>

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowModal(false)}>취소</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : editTarget ? '수정 완료' : '접수 등록'}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  )
}
