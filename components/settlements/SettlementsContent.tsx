'use client'

import { useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/supabase/api'
import { formatKRW, calcWithholdingTax, STATUS_COLORS } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter, DialogClose
} from '@/components/ui/dialog'
import {
  Plus, Search, Edit2, CheckCircle, AlertCircle,
  BadgePercent, StickyNote, Banknote, ChevronDown, Sparkles,
} from 'lucide-react'
import type { Settlement, DepositStatus, ProjectProgress, Inquiry } from '@/lib/supabase/types'
import { toast } from 'sonner'

const PROGRESS_OPTIONS: ProjectProgress[] = ['계약체결', '행사준비', '행사종료', '정산완료']
const DEPOSIT_OPTIONS: DepositStatus[] = ['미입금', '부분입금', '입금완료']

// 수익률 계산: (공급가액 - 지급액) / 공급가액 × 100
function calcProfitRate(supplyPrice: number, payoutAmount: number): number | null {
  if (!supplyPrice) return null
  return Math.round(((supplyPrice - payoutAmount) / supplyPrice) * 100)
}

function ProfitRateBadge({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="text-gray-300">-</span>
  const color = rate >= 20 ? 'text-green-600' : rate >= 10 ? 'text-blue-600' : rate >= 0 ? 'text-orange-500' : 'text-red-600'
  return <span className={`font-semibold ${color}`}>{rate}%</span>
}

export default function SettlementsContent() {
  const [settlements, setSettlements] = useState<(Settlement & { inquiries?: Inquiry })[]>([])
  const [inquiries, setInquiries]     = useState<Inquiry[]>([])
  const [loading, setLoading]         = useState(true)
  const [searchText, setSearchText]   = useState('')
  const [filterDeposit, setFilterDeposit] = useState('')
  const [filterProgress, setFilterProgress] = useState('')

  // 수정 모달
  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState<Settlement | null>(null)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  // 인라인 메모 편집
  const [memoEditId, setMemoEditId]     = useState<string | null>(null)
  const [memoValue, setMemoValue]       = useState('')

  // 인라인 금액 수정 (연장/변경 대응)
  const [amtEditId, setAmtEditId]       = useState<string | null>(null)
  const [amtSupply, setAmtSupply]       = useState('')

  const [form, setForm] = useState({
    inquiry_id: '',
    company_name: '',
    site_name: '',
    dispatch_period: '',
    manager: '',
    site_address: '',
    supply_price: '',
    vat: '',
    received_amount: '',
    payout_amount: '',
    base_pay: '',
    meal_pay: '',
    overtime_pay: '',
    transport_pay: '',
    progress: '계약체결' as ProjectProgress,
    deposit_status: '미입금' as DepositStatus,
    tax_invoice_issued: false,
    category: '',
    biz_number: '',
    rep_name: '',
    email: '',
    corp_name: '',
    item_description: '',
    contact_phone: '',
    biz_address: '',       // 사업장주소 (세금계산서용 — 현장주소와 다름!)
    invoice_request: '',
  })

  // 이전 발행 정보 자동완성용
  const [prevBizInfo, setPrevBizInfo] = useState<{
    biz_number?: string; corp_name?: string; rep_name?: string
    email?: string; contact_phone?: string; biz_address?: string
    company_name?: string
  } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [setts, inqs] = await Promise.all([
      db.list<Settlement & { inquiries?: Inquiry }>('settlements', {
        select: '*, inquiries(event_name, company_name, status)',
        order: 'created_at', asc: false,
      }),
      db.list<Inquiry>('inquiries', {
        inFilter: { status: ['체결', '배정완료', '진행중', '완료', '정산완료'] },
        order: 'created_at', asc: false,
      }),
    ])
    setSettlements(setts)
    setInquiries(inqs)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // 3.3% 자동 계산
  const autoWithholding = calcWithholdingTax(
    Number(form.base_pay) || 0,
    Number(form.meal_pay) || 0,
    Number(form.overtime_pay) || 0,
  )
  const autoPayoutAmount =
    (Number(form.base_pay) || 0) +
    (Number(form.meal_pay) || 0) +
    (Number(form.overtime_pay) || 0) +
    (Number(form.transport_pay) || 0)

  function openCreate() {
    setEditTarget(null)
    setPrevBizInfo(null)
    setForm({
      inquiry_id: '', company_name: '', site_name: '', dispatch_period: '',
      manager: '', site_address: '', supply_price: '', vat: '', received_amount: '',
      payout_amount: '', base_pay: '', meal_pay: '', overtime_pay: '', transport_pay: '',
      progress: '계약체결', deposit_status: '미입금', tax_invoice_issued: false,
      category: '', biz_number: '', rep_name: '', email: '', corp_name: '',
      item_description: '', contact_phone: '', biz_address: '', invoice_request: '',
    })
    setError('')
    setShowModal(true)
  }

  function openEdit(s: Settlement) {
    setEditTarget(s)
    setPrevBizInfo(null)
    setForm({
      inquiry_id: s.inquiry_id || '',
      company_name: s.company_name || '',
      site_name: s.site_name || '',
      dispatch_period: s.dispatch_period || '',
      manager: s.manager || '',
      site_address: s.site_address || '',
      supply_price: String(s.supply_price || ''),
      vat: String(s.vat || ''),
      received_amount: String(s.received_amount || ''),
      payout_amount: String(s.payout_amount || ''),
      base_pay: '', meal_pay: '', overtime_pay: '', transport_pay: '',
      progress: s.progress,
      deposit_status: s.deposit_status,
      tax_invoice_issued: s.tax_invoice_issued,
      category: s.category || '',
      biz_number: s.biz_number || '',
      rep_name: s.rep_name || '',
      email: s.email || '',
      corp_name: s.corp_name || '',
      item_description: s.item_description || '',
      contact_phone: s.contact_phone || '',
      biz_address: (s as Settlement & { biz_address?: string }).biz_address || '',
      invoice_request: s.invoice_request || '',
    })
    setError('')
    setShowModal(true)
  }

  // 문의 선택 시 같은 업체의 이전 발행 정보 조회
  async function handleInquirySelect(inquiryId: string) {
    const inq = inquiries.find(i => i.id === inquiryId)
    const companyName = inq?.company_name || ''
    setForm(f => ({ ...f, inquiry_id: inquiryId, company_name: companyName }))
    setPrevBizInfo(null)
    if (!companyName) return

    // 같은 업체명의 정산 건 중 사업자번호가 있는 가장 최근 건 조회
    const prev = settlements.find(s =>
      s.id !== editTarget?.id &&
      (s.company_name || '') === companyName &&
      s.biz_number
    )
    if (prev) {
      setPrevBizInfo({
        biz_number:    prev.biz_number,
        corp_name:     prev.corp_name,
        rep_name:      prev.rep_name,
        email:         prev.email,
        contact_phone: prev.contact_phone,
        biz_address:   (prev as Settlement & { biz_address?: string }).biz_address,
        company_name:  prev.company_name,
      })
    }
  }

  // 이전 발행 정보 자동완성 (청구금액·현장주소는 건드리지 않음)
  function applyPrevBizInfo() {
    if (!prevBizInfo) return
    setForm(f => ({
      ...f,
      biz_number:    prevBizInfo.biz_number    || f.biz_number,
      corp_name:     prevBizInfo.corp_name     || f.corp_name,
      rep_name:      prevBizInfo.rep_name      || f.rep_name,
      email:         prevBizInfo.email         || f.email,
      contact_phone: prevBizInfo.contact_phone || f.contact_phone,
      biz_address:   prevBizInfo.biz_address   || f.biz_address,
    }))
    setPrevBizInfo(null)
  }

  async function handleSave() {
    if (!form.inquiry_id) { setError('문의를 선택해주세요.'); return }
    setSaving(true)
    setError('')
    const supplyPrice = Number(form.supply_price) || 0
    const vat = Number(form.vat) || Math.floor(supplyPrice * 0.1)
    const payload = {
      inquiry_id: form.inquiry_id,
      company_name: form.company_name || null,
      site_name: form.site_name || null,
      dispatch_period: form.dispatch_period || null,
      manager: form.manager || null,
      site_address: form.site_address || null,
      supply_price: supplyPrice,
      vat,
      invoice_amount: supplyPrice + vat,
      received_amount: Number(form.received_amount) || 0,
      payout_amount: autoPayoutAmount || Number(form.payout_amount) || 0,
      withholding_tax: autoWithholding,
      progress: form.progress,
      deposit_status: form.deposit_status,
      tax_invoice_issued: form.tax_invoice_issued,
      category: form.category || null,
      biz_number: form.biz_number || null,
      rep_name: form.rep_name || null,
      email: form.email || null,
      corp_name: form.corp_name || null,
      item_description: form.item_description || null,
      contact_phone: form.contact_phone || null,
      biz_address: form.biz_address || null,
      invoice_request: form.invoice_request || null,
    }
    try {
      if (editTarget) {
        await db.update('settlements', editTarget.id, payload)
        toast.success('정산 정보가 수정되었습니다.')
      } else {
        await db.insert('settlements', payload)
        await db.update('inquiries', form.inquiry_id, { status: '정산완료' })
        toast.success('정산이 등록되었습니다.')
      }
    } catch (e) {
      setSaving(false); setError((e as Error).message); return
    }
    setSaving(false)
    setShowModal(false)
    load()
  }

  // ── 인라인 금액 수정 (연장/변경) ──
  async function handleAmtSave(s: Settlement) {
    const supply = Number(amtSupply)
    if (isNaN(supply) || supply <= 0) { toast.error('올바른 금액을 입력해주세요.'); return }
    const vat = Math.floor(supply * 0.1)
    try {
      await db.update('settlements', s.id, {
        supply_price: supply,
        vat,
        invoice_amount: supply + vat,
      })
      toast.success(`청구금액이 ${formatKRW(supply + vat)}으로 수정되었습니다.`)
      setAmtEditId(null)
      load()
    } catch (e) { toast.error('수정 실패: ' + (e as Error).message) }
  }

  // ── 빠른 입금 처리 ──
  async function handleQuickDeposit(s: Settlement, type: '50%' | '전액') {
    const invoiceAmt = s.invoice_amount || (s.supply_price + s.vat)
    const amount     = type === '50%' ? Math.floor(invoiceAmt * 0.5) : invoiceAmt
    const status: DepositStatus = type === '50%' ? '부분입금' : '입금완료'
    try {
      await db.update('settlements', s.id, {
        received_amount: amount,
        deposit_status: status,
      })
      toast.success(`${type === '50%' ? '50% 부분입금' : '전액 입금'} 확인 완료 (${formatKRW(amount)})`)
      load()
    } catch (e) { toast.error('처리 실패: ' + (e as Error).message) }
  }

  // ── 진행상태 퀵변경 ──
  async function handleProgressChange(s: Settlement, progress: ProjectProgress) {
    try {
      await db.update('settlements', s.id, { progress })
      toast.success(`진행상태 → ${progress}`)
      load()
    } catch (e) { toast.error('처리 실패: ' + (e as Error).message) }
  }

  // ── 인라인 메모 저장 ──
  async function handleMemoSave(id: string) {
    try {
      await db.update('settlements', id, { invoice_request: memoValue || null })
      toast.success('메모가 저장되었습니다.')
      setMemoEditId(null)
      load()
    } catch (e) { toast.error('저장 실패: ' + (e as Error).message) }
  }

  const filtered = settlements.filter(s => {
    const matchSearch = !searchText ||
      [s.company_name, s.site_name, s.inquiries?.event_name]
        .some(v => v?.toLowerCase().includes(searchText.toLowerCase()))
    const matchDeposit   = !filterDeposit   || s.deposit_status === filterDeposit
    const matchProgress  = !filterProgress  || s.progress === filterProgress
    return matchSearch && matchDeposit && matchProgress
  })

  // 집계 (필터 무관 전체 기준)
  const totalInvoice  = settlements.reduce((s, r) => s + (r.invoice_amount || r.supply_price + r.vat), 0)
  const totalReceived = settlements.reduce((s, r) => s + r.received_amount, 0)
  const totalUnpaid   = settlements.reduce((s, r) => s + (r.balance || 0), 0)
  const totalProfit   = settlements.reduce((s, r) => s + (r.supply_price - r.payout_amount), 0)

  return (
    <>
      {/* 집계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <div className="bg-gradient-to-br from-blue-600 to-blue-500 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">총 청구금액 (VAT포함)</p>
          <p className="text-xl font-bold mt-1">{formatKRW(totalInvoice)}</p>
        </div>
        <div className="bg-gradient-to-br from-green-600 to-green-500 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">총 받은금액</p>
          <p className="text-xl font-bold mt-1">{formatKRW(totalReceived)}</p>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-orange-400 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">총 미수금</p>
          <p className="text-xl font-bold mt-1">{formatKRW(totalUnpaid)}</p>
        </div>
        <div className="bg-gradient-to-br from-purple-600 to-purple-500 rounded-xl p-4 text-white">
          <p className="text-xs opacity-80">총 수익 (공급가-지급액)</p>
          <p className="text-xl font-bold mt-1">{formatKRW(totalProfit)}</p>
        </div>
      </div>

      {/* 검색 + 필터 */}
      <div className="erp-filter-bar">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="업체명, 현장명 검색..."
            className="pl-9"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />
        </div>
        <Select value={filterDeposit} onChange={e => setFilterDeposit(e.target.value)} className="w-32">
          <option value="">전체 입금</option>
          {DEPOSIT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
        </Select>
        <Select value={filterProgress} onChange={e => setFilterProgress(e.target.value)} className="w-36">
          <option value="">전체 진행</option>
          {PROGRESS_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </Select>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />정산 등록
        </Button>
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
                    <th>업체명</th>
                    <th>현장명</th>
                    <th>총청구금액</th>
                    <th>받은금액</th>
                    <th>잔액</th>
                    <th>수익률</th>
                    <th>입금상태</th>
                    <th>진행상태</th>
                    <th>세금계산서</th>
                    <th>메모</th>
                    <th className="text-right min-w-[200px]">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={11}><div className="erp-empty"><p>정산 내역이 없습니다.</p></div></td>
                    </tr>
                  ) : (
                    filtered.map(s => {
                      const invoiceAmt   = s.invoice_amount || (s.supply_price + s.vat)
                      const profitRate   = calcProfitRate(s.supply_price, s.payout_amount)
                      const isMemoEditing = memoEditId === s.id

                      const isAmtEditing = amtEditId === s.id
                      const previewVat   = Math.floor((Number(amtSupply) || 0) * 0.1)
                      const previewTotal = (Number(amtSupply) || 0) + previewVat

                      return (
                        <tr key={s.id} className="align-top">
                          {/* 업체명 */}
                          <td className="font-medium">{s.company_name || s.inquiries?.company_name || '-'}</td>
                          {/* 현장명 */}
                          <td className="text-sm">{s.site_name || '-'}</td>

                          {/* 총청구금액 — 클릭하면 인라인 수정 */}
                          <td>
                            {isAmtEditing ? (
                              <div className="flex flex-col gap-1 min-w-[160px]">
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    value={amtSupply}
                                    onChange={e => setAmtSupply(e.target.value)}
                                    className="h-7 text-xs w-28"
                                    placeholder="공급가액"
                                    autoFocus
                                  />
                                  <span className="text-[10px] text-gray-400">원</span>
                                </div>
                                {Number(amtSupply) > 0 && (
                                  <p className="text-[10px] text-blue-600 font-semibold">
                                    청구 {formatKRW(previewTotal)} (VAT {formatKRW(previewVat)})
                                  </p>
                                )}
                                <div className="flex gap-1">
                                  <button onClick={() => handleAmtSave(s)} className="text-[10px] bg-blue-600 text-white rounded px-2 py-0.5 hover:bg-blue-700">저장</button>
                                  <button onClick={() => setAmtEditId(null)} className="text-[10px] bg-gray-100 text-gray-600 rounded px-2 py-0.5">취소</button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setAmtEditId(s.id); setAmtSupply(String(s.supply_price || '')) }}
                                className="text-left group"
                                title="클릭하여 금액 수정"
                              >
                                <span className="font-semibold group-hover:text-blue-600 group-hover:underline transition-colors">
                                  {formatKRW(invoiceAmt)}
                                </span>
                                <p className="text-[10px] text-gray-400 mt-0.5">
                                  공급 {formatKRW(s.supply_price)} + VAT {formatKRW(s.vat)}
                                </p>
                              </button>
                            )}
                          </td>

                          {/* 받은금액 */}
                          <td className="text-green-700 font-medium">{formatKRW(s.received_amount)}</td>

                          {/* 잔액 */}
                          <td className={`font-semibold ${(s.balance || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatKRW(s.balance || 0)}
                          </td>

                          {/* 수익률 */}
                          <td>
                            <div className="flex items-center gap-1">
                              <BadgePercent className="h-3.5 w-3.5 text-gray-300" />
                              <ProfitRateBadge rate={profitRate} />
                            </div>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {formatKRW(s.supply_price - s.payout_amount)}
                            </p>
                          </td>

                          {/* 입금상태 */}
                          <td>
                            <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLORS[s.deposit_status] || 'bg-gray-100 text-gray-600'}`}>
                              {s.deposit_status}
                            </span>
                          </td>

                          {/* 진행상태 — 인라인 셀렉트 */}
                          <td>
                            <select
                              value={s.progress}
                              onChange={e => handleProgressChange(s, e.target.value as ProjectProgress)}
                              className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white cursor-pointer hover:border-blue-400 focus:outline-none"
                            >
                              {PROGRESS_OPTIONS.map(p => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                          </td>

                          {/* 세금계산서 */}
                          <td className="text-center">
                            {s.tax_invoice_issued ? (
                              <CheckCircle className="h-4 w-4 text-green-600 mx-auto" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-gray-300 mx-auto" />
                            )}
                          </td>

                          {/* 메모 — 인라인 편집 */}
                          <td className="min-w-[140px]">
                            {isMemoEditing ? (
                              <div className="flex flex-col gap-1">
                                <textarea
                                  autoFocus
                                  value={memoValue}
                                  onChange={e => setMemoValue(e.target.value)}
                                  rows={2}
                                  className="text-xs border border-blue-300 rounded px-2 py-1 w-full resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  placeholder="입금예정일, 특이사항 등"
                                />
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleMemoSave(s.id)}
                                    className="text-[10px] bg-blue-600 text-white rounded px-2 py-0.5 hover:bg-blue-700"
                                  >저장</button>
                                  <button
                                    onClick={() => setMemoEditId(null)}
                                    className="text-[10px] bg-gray-100 text-gray-600 rounded px-2 py-0.5 hover:bg-gray-200"
                                  >취소</button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setMemoEditId(s.id); setMemoValue(s.invoice_request || '') }}
                                className="w-full text-left text-xs text-gray-500 hover:text-gray-700 group"
                              >
                                {s.invoice_request ? (
                                  <span className="flex items-start gap-1">
                                    <StickyNote className="h-3 w-3 text-yellow-500 shrink-0 mt-0.5" />
                                    <span className="line-clamp-2">{s.invoice_request}</span>
                                  </span>
                                ) : (
                                  <span className="text-gray-300 group-hover:text-gray-400 flex items-center gap-1">
                                    <StickyNote className="h-3 w-3" />메모 추가
                                  </span>
                                )}
                              </button>
                            )}
                          </td>

                          {/* 액션 */}
                          <td className="text-right">
                            <div className="flex gap-1 justify-end flex-wrap">
                              {/* 50% 입금 */}
                              {s.deposit_status === '미입금' && (
                                <button
                                  onClick={() => handleQuickDeposit(s, '50%')}
                                  className="text-[10px] bg-yellow-50 text-yellow-700 border border-yellow-200 rounded px-2 py-1 hover:bg-yellow-100 whitespace-nowrap"
                                >
                                  50% 입금
                                </button>
                              )}
                              {/* 전액 입금 */}
                              {s.deposit_status !== '입금완료' && (
                                <button
                                  onClick={() => handleQuickDeposit(s, '전액')}
                                  className="text-[10px] bg-green-50 text-green-700 border border-green-200 rounded px-2 py-1 hover:bg-green-100 whitespace-nowrap font-medium"
                                >
                                  전액 입금
                                </button>
                              )}
                              {/* 수정 */}
                              <Button variant="ghost" size="icon" onClick={() => openEdit(s)} title="수정">
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 등록/수정 모달 */}
      <Dialog open={showModal} onClose={() => setShowModal(false)} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editTarget ? '정산 수정' : '정산 등록'}</DialogTitle>
          <DialogClose onClose={() => setShowModal(false)} />
        </DialogHeader>
        <DialogContent className="space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">연결 문의 *</label>
              <Select
                value={form.inquiry_id}
                onChange={e => handleInquirySelect(e.target.value)}
              >
                <option value="">문의 선택</option>
                {inquiries.map(i => (
                  <option key={i.id} value={i.id}>[{i.status}] {i.company_name} - {i.event_name}</option>
                ))}
              </Select>
            </div>

            {/* 이전 발행 정보 자동완성 배너 — 문의 선택 직후 눈에 띄게 표시 */}
            {prevBizInfo && (
              <div className="col-span-2 flex items-center gap-3 bg-amber-50 border-2 border-amber-300 rounded-xl px-4 py-3">
                <Sparkles className="h-5 w-5 text-amber-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-amber-800">이전 발행 정보가 있습니다!</p>
                  <p className="text-xs text-amber-600 truncate">
                    {[prevBizInfo.corp_name, prevBizInfo.biz_number, prevBizInfo.rep_name].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={applyPrevBizInfo}
                  className="shrink-0 text-xs bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg px-3 py-2 transition-colors"
                >
                  자동완성
                </button>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">업체명</label>
              <Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">현장명</label>
              <Input value={form.site_name} onChange={e => setForm(f => ({ ...f, site_name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">파견 기간</label>
              <Input value={form.dispatch_period} onChange={e => setForm(f => ({ ...f, dispatch_period: e.target.value }))} placeholder="2024-01-01 ~ 2024-01-03" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">담당자</label>
              <Input value={form.manager} onChange={e => setForm(f => ({ ...f, manager: e.target.value }))} />
            </div>

            {/* 청구 금액 */}
            <div className="col-span-2">
              <h4 className="text-xs font-semibold text-gray-700 mt-1 mb-2 border-t pt-3">청구 금액</h4>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">공급가액</label>
              <Input
                type="number"
                value={form.supply_price}
                onChange={e => {
                  const sp = Number(e.target.value)
                  setForm(f => ({ ...f, supply_price: e.target.value, vat: String(Math.floor(sp * 0.1)) }))
                }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">부가세 (자동)</label>
              <Input type="number" value={form.vat} onChange={e => setForm(f => ({ ...f, vat: e.target.value }))} className="bg-gray-50" />
            </div>

            {/* 총 청구금액 표시 */}
            {(Number(form.supply_price) > 0) && (
              <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 flex justify-between items-center">
                <span className="text-sm text-blue-700 font-medium">총 청구금액 (VAT 포함)</span>
                <span className="text-lg font-bold text-blue-800">
                  {formatKRW((Number(form.supply_price) || 0) + (Number(form.vat) || 0))}
                </span>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">받은금액</label>
              <Input type="number" value={form.received_amount} onChange={e => setForm(f => ({ ...f, received_amount: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">입금 상태</label>
              <Select value={form.deposit_status} onChange={e => setForm(f => ({ ...f, deposit_status: e.target.value as DepositStatus }))}>
                {DEPOSIT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </Select>
            </div>

            {/* 지급 금액 */}
            <div className="col-span-2">
              <h4 className="text-xs font-semibold text-gray-700 mt-1 mb-2 border-t pt-3">지급 금액 (3.3% 자동계산)</h4>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">기본급</label>
              <Input type="number" value={form.base_pay} onChange={e => setForm(f => ({ ...f, base_pay: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">식사비 (공제대상)</label>
              <Input type="number" value={form.meal_pay} onChange={e => setForm(f => ({ ...f, meal_pay: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">야근비 (공제대상)</label>
              <Input type="number" value={form.overtime_pay} onChange={e => setForm(f => ({ ...f, overtime_pay: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">교통비 (공제제외)</label>
              <Input type="number" value={form.transport_pay} onChange={e => setForm(f => ({ ...f, transport_pay: e.target.value }))} />
            </div>

            {(form.base_pay || form.meal_pay || form.overtime_pay) && (
              <div className="col-span-2 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm">
                <p className="font-semibold text-yellow-800 mb-1">3.3% 원천세 계산 결과</p>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div><span className="text-gray-600">공제 전 합계</span><p className="font-semibold">{formatKRW(autoPayoutAmount)}</p></div>
                  <div><span className="text-gray-600">원천세 (3.3%)</span><p className="font-semibold text-red-600">-{formatKRW(autoWithholding)}</p></div>
                  <div><span className="text-gray-600">최종 지급액</span><p className="font-semibold text-green-700">{formatKRW(autoPayoutAmount - autoWithholding)}</p></div>
                </div>
              </div>
            )}

            {/* 수익률 미리보기 */}
            {Number(form.supply_price) > 0 && (Number(form.payout_amount) > 0 || autoPayoutAmount > 0) && (
              <div className="col-span-2 bg-purple-50 border border-purple-200 rounded-lg px-4 py-2 flex justify-between items-center">
                <span className="text-sm text-purple-700">예상 수익률 (공급가액 - 지급액)</span>
                <span className="font-bold text-purple-800">
                  {calcProfitRate(Number(form.supply_price), autoPayoutAmount || Number(form.payout_amount))}%
                  &nbsp;({formatKRW(Number(form.supply_price) - (autoPayoutAmount || Number(form.payout_amount)))})
                </span>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">진행 상태</label>
              <Select value={form.progress} onChange={e => setForm(f => ({ ...f, progress: e.target.value as ProjectProgress }))}>
                {PROGRESS_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </Select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.tax_invoice_issued}
                  onChange={e => setForm(f => ({ ...f, tax_invoice_issued: e.target.checked }))}
                  className="w-4 h-4 rounded"
                />
                세금계산서 발행 완료
              </label>
            </div>

            <div className="col-span-2">
              <h4 className="text-xs font-semibold text-gray-700 mt-1 mb-2 border-t pt-3">메모 / 입금 특이사항</h4>
              <Textarea
                value={form.invoice_request}
                onChange={e => setForm(f => ({ ...f, invoice_request: e.target.value }))}
                placeholder="입금 예정일, 분할 일정, 특이사항 등 자유롭게 기입"
                rows={2}
                className="text-sm"
              />
            </div>

            {/* 세금계산서 발행 정보 */}
            <div className="col-span-2">
              <div className="flex items-center justify-between border-t pt-3 mt-1 mb-2">
                <h4 className="text-xs font-semibold text-gray-700">세금계산서 발행 정보</h4>
              </div>
              <p className="text-[11px] text-gray-400 mb-3">
                ※ 사업장주소는 세금계산서용 등록 주소입니다. 행사 현장주소와 다를 수 있습니다.
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">사업자번호</label>
              <Input value={form.biz_number} onChange={e => setForm(f => ({ ...f, biz_number: e.target.value }))} placeholder="000-00-00000" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">법인명 (상호)</label>
              <Input value={form.corp_name} onChange={e => setForm(f => ({ ...f, corp_name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">대표자</label>
              <Input value={form.rep_name} onChange={e => setForm(f => ({ ...f, rep_name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">이메일 (전자세금계산서 수신)</label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="tax@company.com" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">연락처</label>
              <Input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="02-0000-0000" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">품목</label>
              <Input value={form.item_description} onChange={e => setForm(f => ({ ...f, item_description: e.target.value }))} placeholder="용역비 등" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                사업장주소 <span className="text-amber-600 font-normal">(세금계산서 등록 주소 — 현장주소 아님)</span>
              </label>
              <Input value={form.biz_address} onChange={e => setForm(f => ({ ...f, biz_address: e.target.value }))} placeholder="서울시 강남구 ..." />
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowModal(false)}>취소</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : (editTarget ? '수정 완료' : '정산 등록')}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  )
}
