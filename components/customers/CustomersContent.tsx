'use client'

import { useEffect, useState, useCallback, Fragment } from 'react'
import { useSearchParams } from 'next/navigation'
import { db } from '@/lib/supabase/api'
import { toast } from 'sonner'
import { getCustomerType } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter, DialogClose
} from '@/components/ui/dialog'
import { Plus, Search, Edit2, Trash2, Building2, User, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import type { Customer, Inquiry, Settlement } from '@/lib/supabase/types'
import { normalizeCompany } from '@/lib/bizInfo'
import { contractStats } from '@/lib/finance'
import { formatKRW } from '@/lib/utils'

// 고객사 한 곳의 거래 이력. 고객사 화면이 주소록에 그치지 않도록, 문의·정산에서 모아 온다.
// 문의는 customer_id 로 잇되, 그 칸이 비어 있는 예전 문의는 업체명을 정규화해 잇는다
// (lib/bizInfo.ts 의 같은 규칙 — '숲소리_마곡_6월2주차'도 '숲소리'로 본다).
interface CustomerHistory {
  inquiries: Inquiry[]
  won: number        // 체결 이상
  lost: number       // 미체결
  rate: number       // 체결율 (분모는 결정난 건만 — lib/finance contractStats)
  lastEvent?: string // 마지막 행사일
  billed: number
  received: number
  unpaid: number
  unissued: number   // 세금계산서 미발행 건수
  /** 정산에 적힌 사업자번호가 고객사 카드와 다르다 — 어느 쪽이 맞는지 사람이 봐야 한다 */
  bizMismatch?: string
}

function buildHistory(custs: Customer[], inqs: Inquiry[], setts: Settlement[]): Map<string, CustomerHistory> {
  const byId   = new Map<string, Inquiry[]>()
  const byName = new Map<string, Inquiry[]>()
  inqs.forEach(q => {
    if (q.customer_id) { const l = byId.get(q.customer_id) || []; l.push(q); byId.set(q.customer_id, l) }
    else {
      const k = normalizeCompany(q.company_name)
      if (k) { const l = byName.get(k) || []; l.push(q); byName.set(k, l) }
    }
  })
  const settByInq = new Map<string, Settlement>()
  setts.forEach(s => { if (s.inquiry_id && !settByInq.has(s.inquiry_id)) settByInq.set(s.inquiry_id, s) })

  const out = new Map<string, CustomerHistory>()
  custs.forEach(c => {
    const mine = [...(byId.get(c.id) || []), ...(byName.get(normalizeCompany(c.company_name)) || [])]
    if (!mine.length) return
    const cs = contractStats(mine)
    let billed = 0, received = 0, unpaid = 0, unissued = 0
    let bizMismatch: string | undefined
    const myDigits = (c.biz_number || '').replace(/[^0-9]/g, '')
    mine.forEach(q => {
      const s = settByInq.get(q.id)
      if (!s) return
      billed   += s.invoice_amount || s.supply_price + s.vat || 0
      received += s.received_amount || 0
      unpaid   += Math.max(0, s.balance ?? ((s.invoice_amount || 0) - (s.received_amount || 0)))
      if (!s.tax_invoice_issued && !['접수', '견적', '미체결', '보류', '취소'].includes(q.status)) unissued++
      const d = (s.biz_number || '').replace(/[^0-9]/g, '')
      if (myDigits.length >= 10 && d.length >= 10 && d !== myDigits && !bizMismatch) bizMismatch = s.biz_number
    })
    const lastEvent = mine.map(q => q.event_start || '').filter(Boolean).sort().pop()
    out.set(c.id, { inquiries: mine, won: cs.won, lost: cs.lost, rate: cs.rate, lastEvent, billed, received, unpaid, unissued, bizMismatch })
  })
  return out
}

const emptyForm = {
  company_name: '',
  rep_name: '',
  biz_number: '',
  biz_type: '',
  biz_item: '',
  address: '',
  email: '',
  contact_name: '',
  phone: '',
  memo: '',
  customer_type: '개인' as '법인' | '개인',
}

export default function CustomersContent() {
  // 통합검색 결과에서 넘어올 때 그 업체만 바로 보이게 한다
  const searchParams = useSearchParams()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [history, setHistory] = useState<Map<string, CustomerHistory>>(new Map())
  const [settlements, setSettlements] = useState<Map<string, Settlement>>(new Map())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const settlementOf = (inquiryId: string) => settlements.get(inquiryId)
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState(searchParams.get('search') || '')
  const [filterType, setFilterType] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState<Customer | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [custs, inqs, setts] = await Promise.all([
      db.list<Customer>('customers', { order: 'created_at', asc: false }),
      db.list<Inquiry>('inquiries', { order: 'event_start', asc: false }),
      db.list<Settlement>('settlements'),
    ])
    setCustomers(custs)
    setHistory(buildHistory(custs, inqs, setts))
    const m = new Map<string, Settlement>()
    setts.forEach(s => { if (s.inquiry_id && !m.has(s.inquiry_id)) m.set(s.inquiry_id, s) })
    setSettlements(m)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditTarget(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  function openEdit(c: Customer) {
    setEditTarget(c)
    setForm({
      company_name: c.company_name,
      rep_name: c.rep_name || '',
      biz_number: c.biz_number || '',
      biz_type: c.biz_type || '',
      biz_item: c.biz_item || '',
      address: c.address || '',
      email: c.email || '',
      contact_name: c.contact_name || '',
      phone: c.phone || '',
      memo: c.memo || '',
      customer_type: (c.customer_type as '법인' | '개인') || getCustomerType(c.biz_number) as '법인' | '개인',
    })
    setError('')
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.company_name.trim()) { setError('업체명을 입력해주세요.'); return }

    setSaving(true)
    setError('')

    const customerType = form.customer_type

    const payload = {
      company_name: form.company_name.trim(),
      rep_name: form.rep_name || null,
      biz_number: form.biz_number || null,
      biz_type: form.biz_type || null,
      biz_item: form.biz_item || null,
      address: form.address || null,
      email: form.email || null,
      contact_name: form.contact_name || null,
      phone: form.phone || null,
      memo: form.memo || null,
      customer_type: customerType,
    }

    try {
      if (editTarget) {
        await db.update('customers', editTarget.id, payload)
      } else {
        await db.insert('customers', payload)
      }
    } catch (e) {
      setSaving(false); setError((e as Error).message); return
    }

    setSaving(false)
    setShowModal(false)
    toast.success(editTarget ? '수정되었습니다.' : '등록되었습니다.')
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('이 고객사를 삭제하시겠습니까?')) return
    try {
      await db.delete('customers', id)
      toast.success('삭제되었습니다.')
      load()
    } catch (e) {
      toast.error(`삭제 실패: ${(e as Error).message}`)
    }
  }

  const filtered = customers.filter(c => {
    const matchSearch = !searchText || [c.company_name, c.contact_name, c.phone, c.biz_number]
      .some(v => v?.toLowerCase().includes(searchText.toLowerCase()))
    const matchType = !filterType || (c.customer_type || getCustomerType(c.biz_number)) === filterType
    return matchSearch && matchType
  })

  const stats = {
    total: customers.length,
    corp: customers.filter(c => (c.customer_type || getCustomerType(c.biz_number)) === '법인').length,
    personal: customers.filter(c => (c.customer_type || getCustomerType(c.biz_number)) === '개인').length,
    repeat: customers.filter(c => (history.get(c.id)?.won || 0) >= 2).length,
    unpaid: customers.reduce((a, c) => a + (history.get(c.id)?.unpaid || 0), 0),
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-5">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-xs text-gray-500">전체 고객사</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}개</p>
        </div>
        <div className="bg-white rounded-xl border border-blue-200 p-4 text-center">
          <p className="text-xs text-blue-600">법인</p>
          <p className="text-2xl font-bold text-blue-700">{stats.corp}개</p>
        </div>
        <div className="bg-white rounded-xl border border-purple-200 p-4 text-center">
          <p className="text-xs text-purple-600">개인</p>
          <p className="text-2xl font-bold text-purple-700">{stats.personal}개</p>
        </div>
        <div className="bg-white rounded-xl border border-emerald-200 p-4 text-center" title="체결 2건 이상">
          <p className="text-xs text-emerald-600">재이용 고객</p>
          <p className="text-2xl font-bold text-emerald-700">{stats.repeat}개</p>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-4 text-center" title="고객사별 미수 잔액 합">
          <p className="text-xs text-red-600">미수금</p>
          <p className="text-xl font-bold text-red-700">{formatKRW(stats.unpaid)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="업체명, 담당자, 연락처, 사업자번호 검색..."
            className="pl-9"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />
        </div>
        <Select value={filterType} onChange={e => setFilterType(e.target.value)} className="w-28">
          <option value="">전체</option>
          <option value="법인">법인</option>
          <option value="개인">개인</option>
        </Select>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          고객사 등록
        </Button>
      </div>

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
                    <th>구분</th>
                    <th title="문의 건수 · 체결율 (분모는 결정난 건만)">거래</th>
                    <th>마지막 행사</th>
                    <th className="text-right" title="청구 합계 / 미수 잔액">청구 · 미수</th>
                    <th>대표자</th>
                    <th>담당자</th>
                    <th>연락처</th>
                    <th>사업자번호</th>
                    <th>이메일</th>
                    <th className="text-right">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={11}><div className="erp-empty"><p>고객사가 없습니다.</p></div></td>
                    </tr>
                  ) : (
                    filtered.map(c => {
                      const type = c.customer_type || getCustomerType(c.biz_number)
                      const h = history.get(c.id)
                      const isOpen = expandedId === c.id
                      return (
                        <Fragment key={c.id}>
                        <tr
                          className={`transition-colors ${h ? 'cursor-pointer hover:bg-blue-50/60' : ''} ${isOpen ? 'bg-blue-50/60' : ''}`}
                          onClick={e => {
                            if ((e.target as HTMLElement).closest('button,a,input')) return
                            if (h) setExpandedId(isOpen ? null : c.id)
                          }}
                        >
                          <td>
                            <div className="flex items-center gap-2">
                              {h
                                ? (isOpen ? <ChevronDown className="h-3.5 w-3.5 text-blue-500 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />)
                                : <span className="w-3.5 shrink-0" />}
                              <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                                {type === '법인' ? (
                                  <Building2 className="h-3.5 w-3.5 text-indigo-600" />
                                ) : (
                                  <User className="h-3.5 w-3.5 text-purple-600" />
                                )}
                              </div>
                              <span className="font-medium">{c.company_name}</span>
                            </div>
                          </td>
                          <td>
                            <button
                              onClick={async () => {
                                const next = type === '법인' ? '개인' : '법인'
                                await db.update('customers', c.id, { customer_type: next })
                                load()
                              }}
                              title="클릭하여 전환"
                              className={`text-xs px-2 py-0.5 rounded-full cursor-pointer hover:opacity-70 transition-opacity ${
                                type === '법인' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                              }`}
                            >
                              {type}
                            </button>
                          </td>
                          <td className="text-xs whitespace-nowrap">
                            {h ? (
                              <span>
                                <b className="text-gray-800">{h.inquiries.length}건</b>
                                <span className="text-gray-500"> · 체결 {h.won}</span>
                                {h.won + h.lost > 0 && <span className={`ml-1 font-semibold ${h.rate >= 70 ? 'text-green-700' : h.rate >= 40 ? 'text-yellow-700' : 'text-red-600'}`}>{h.rate}%</span>}
                              </span>
                            ) : <span className="text-gray-300">거래 없음</span>}
                          </td>
                          <td className="text-xs text-gray-600 whitespace-nowrap">{h?.lastEvent?.slice(0, 10) || <span className="text-gray-300">-</span>}</td>
                          <td className="text-right text-xs whitespace-nowrap">
                            {h && h.billed > 0 ? (
                              <span>
                                <span className="text-gray-700">{formatKRW(h.billed)}</span>
                                {h.unpaid > 0 && <span className="ml-1 text-red-600 font-semibold">미수 {formatKRW(h.unpaid)}</span>}
                                {h.unissued > 0 && <span className="ml-1 text-2xs text-orange-600" title="세금계산서 미발행">계산서 {h.unissued}</span>}
                              </span>
                            ) : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="text-gray-600">{c.rep_name || '-'}</td>
                          <td className="text-gray-600">{c.contact_name || '-'}</td>
                          <td className="text-gray-600">{c.phone || '-'}</td>
                          <td className="text-gray-500 text-xs whitespace-nowrap">
                            {c.biz_number || '-'}
                            {h?.bizMismatch && (
                              <span className="ml-1 inline-flex items-center gap-0.5 text-orange-600" title={`정산(세금계산서)에는 ${h.bizMismatch} 로 적혀 있습니다. 어느 쪽이 맞는지 확인하세요`}>
                                <AlertTriangle className="h-3 w-3" />
                              </span>
                            )}
                          </td>
                          <td className="text-gray-500 text-xs">{c.email || '-'}</td>
                          <td className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(c)} title="수정">
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="icon" onClick={() => handleDelete(c.id)}
                                className="text-red-500 hover:text-red-700" title="삭제"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {isOpen && h && (
                          <tr>
                            <td colSpan={11} className="p-0 bg-blue-50/40 border-b border-blue-100">
                              <div className="px-6 py-3 space-y-2">
                                <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                                  <span>청구 <b className="text-gray-800">{formatKRW(h.billed)}</b></span>
                                  <span>입금 <b className="text-green-700">{formatKRW(h.received)}</b></span>
                                  <span>미수 <b className={h.unpaid > 0 ? 'text-red-600' : 'text-gray-400'}>{formatKRW(h.unpaid)}</b></span>
                                  <span>체결 {h.won} · 미체결 {h.lost}{h.won + h.lost > 0 ? ` · 체결율 ${h.rate}%` : ''}</span>
                                  {(c.address || c.memo) && <span className="text-gray-500">{[c.address, c.memo].filter(Boolean).join(' · ')}</span>}
                                </div>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-gray-500">
                                      <th className="text-left py-1 font-semibold">행사</th>
                                      <th className="text-left py-1 font-semibold">행사일</th>
                                      <th className="text-left py-1 font-semibold">상태</th>
                                      <th className="text-right py-1 font-semibold">청구</th>
                                      <th className="text-right py-1 font-semibold">입금</th>
                                      <th className="text-left py-1 pl-3 font-semibold">계산서</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {[...h.inquiries].sort((a, b) => (b.event_start || '').localeCompare(a.event_start || '')).map(q => {
                                      const s = settlementOf(q.id)
                                      return (
                                        <tr key={q.id} className="border-t border-blue-100">
                                          <td className="py-1">
                                            <Link href={`/inquiries/${q.id}`} className="text-blue-700 hover:underline">{q.event_name}</Link>
                                            {q.company_name && normalizeCompany(q.company_name) !== normalizeCompany(c.company_name) && (
                                              <span className="ml-1 text-gray-400">({q.company_name})</span>
                                            )}
                                          </td>
                                          <td className="py-1 text-gray-600">{q.event_start?.slice(0, 10) || q.date_memo || '-'}</td>
                                          <td className="py-1"><span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{q.status}</span></td>
                                          <td className="py-1 text-right text-gray-700">{s ? formatKRW(s.invoice_amount || s.supply_price + s.vat) : '-'}</td>
                                          <td className="py-1 text-right">{s ? <span className={s.deposit_status === '입금완료' ? 'text-green-700' : s.deposit_status === '부분입금' ? 'text-yellow-700' : 'text-red-600'}>{s.deposit_status}</span> : '-'}</td>
                                          <td className="py-1 pl-3">{s ? (s.tax_invoice_issued ? <span className="text-green-700">발행</span> : <span className="text-gray-400">미발행</span>) : '-'}</td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      )
                    })
                  )}
                </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={showModal} onClose={() => setShowModal(false)} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editTarget ? '고객사 수정' : '고객사 등록'}</DialogTitle>
          <DialogClose onClose={() => setShowModal(false)} />
        </DialogHeader>
        <DialogContent className="space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">업체명 *</label>
              <Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="업체명" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">구분</label>
              <div className="flex gap-2">
                {(['법인', '개인'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, customer_type: t }))}
                    className={`flex-1 py-1.5 rounded-lg border text-sm font-semibold transition-colors ${
                      form.customer_type === t
                        ? t === '법인'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-purple-600 text-white border-purple-600'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {t === '법인' ? '🏢 법인' : '👤 개인'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">대표자명</label>
              <Input value={form.rep_name} onChange={e => setForm(f => ({ ...f, rep_name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">사업자번호</label>
              <Input
                value={form.biz_number}
                onChange={e => setForm(f => ({
                  ...f,
                  biz_number: e.target.value,
                  customer_type: e.target.value.trim() ? '법인' : f.customer_type,
                }))}
                placeholder="000-00-00000"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">업태</label>
              <Input value={form.biz_type} onChange={e => setForm(f => ({ ...f, biz_type: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">종목</label>
              <Input value={form.biz_item} onChange={e => setForm(f => ({ ...f, biz_item: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">담당자</label>
              <Input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">연락처</label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="010-0000-0000" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">이메일</label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">주소</label>
              <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">메모</label>
            <Textarea value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} rows={2} />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowModal(false)}>취소</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : (editTarget ? '수정 완료' : '등록')}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  )
}
