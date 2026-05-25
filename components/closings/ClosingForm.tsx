'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { db } from '@/lib/supabase/api'
import { formatKRW } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import {
  Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Receipt, CheckCircle, Save, MapPin, Building2 } from 'lucide-react'
import type { Settlement, Inquiry, Customer } from '@/lib/supabase/types'

type SettRow = Settlement & { inquiries?: Inquiry & { location?: string; customer_id?: string } }

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  editTarget: SettRow | null
  customers?: Customer[]
}

const DEPOSIT_OPTIONS = ['미입금', '부분입금', '입금완료']
const PROGRESS_OPTIONS = ['계약체결', '행사준비', '행사종료', '정산완료']

// 세금계산서 메모 빠른 선택 프리셋
const INVOICE_REQUEST_PRESETS = [
  '100% 선발행 후 입금',
  '선금 50% / 잔금 50% 별도 발행',
  '계약금 후불 — 별도 발행 필요',
  '전체발행',
  '현금영수증 요청',
]

export default function ClosingForm({ open, onClose, onSaved, editTarget, customers = [] }: Props) {
  const [form, setForm]     = useState({
    biz_number:         '',
    rep_name:           '',
    corp_name:          '',
    email:              '',
    contact_phone:      '',
    item_description:   '',
    site_address:       '',   // 사업장주소 (이관 데이터는 site_address 컬럼에 저장됨)
    invoice_request:    '',
    received_amount:    '',
    deposit_status:     '미입금',
    tax_invoice_issued: false,
    progress:           '계약체결',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    if (!open || !editTarget) return
    setError('')
    setForm({
      biz_number:         editTarget.biz_number || '',
      rep_name:           editTarget.rep_name || '',
      corp_name:          editTarget.corp_name || editTarget.company_name || '',
      email:              editTarget.email || '',
      contact_phone:      editTarget.contact_phone || '',
      item_description:   editTarget.item_description || '',
      site_address:       editTarget.site_address || '',
      invoice_request:    editTarget.invoice_request || '',
      received_amount:    String(editTarget.received_amount || ''),
      deposit_status:     editTarget.deposit_status || '미입금',
      tax_invoice_issued: editTarget.tax_invoice_issued ?? false,
      progress:           editTarget.progress || '계약체결',
    })
  }, [open, editTarget])

  async function handleSave() {
    if (!editTarget) return
    setSaving(true); setError('')

    const tid = toast.loading('저장 중...')
    try {
      await db.update('settlements', editTarget.id, {
        biz_number:         form.biz_number || null,
        rep_name:           form.rep_name || null,
        corp_name:          form.corp_name || null,
        email:              form.email || null,
        contact_phone:      form.contact_phone || null,
        item_description:   form.item_description || null,
        site_address:       form.site_address || null,
        invoice_request:    form.invoice_request || null,
        received_amount:    Number(form.received_amount) || 0,
        deposit_status:     form.deposit_status,
        tax_invoice_issued: form.tax_invoice_issued,
        progress:           form.progress,
        // balance는 DB에서 invoice_amount - received_amount로 자동 계산되는 생성 컬럼
      })

      toast.success(
        `"${editTarget.company_name}" 세금계산서 정보가 저장되었습니다.`,
        { id: tid, duration: 4000 }
      )
      setSaving(false)
      onSaved()
    } catch (e) {
      const msg = (e as Error).message
      setError(msg)
      toast.error(`저장 실패: ${msg}`, { id: tid })
      setSaving(false)
    }
  }

  if (!editTarget) return null

  const inq           = editTarget.inquiries
  const invoiceAmt    = editTarget.invoice_amount || 0
  const supplyPrice   = editTarget.supply_price || 0
  const vat           = editTarget.vat || 0
  const receivedNum   = Number(form.received_amount) || 0
  const balance       = invoiceAmt - receivedNum

  // 고객사 주소 자동 조회 (inquiry.customer_id 기준)
  const linkedCustomer = customers.find(c => c.id === inq?.customer_id)
  const bizAddress     = linkedCustomer?.address || null
  const siteAddress    = inq?.location || editTarget.site_address || null

  // 파견일자
  const eventPeriod = inq?.event_start
    ? inq.event_end && inq.event_end !== inq.event_start
      ? `${inq.event_start.slice(0,10)} ~ ${inq.event_end.slice(0,10)}`
      : inq.event_start.slice(0,10)
    : null

  return (
    <Dialog open={open} onClose={onClose} className="max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-blue-600" />
          세금계산서 정보
          <span className="text-sm font-normal text-gray-400 ml-1">
            — {editTarget.company_name || editTarget.corp_name}
          </span>
        </DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>

      <DialogContent className="space-y-5">
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
        )}

        {/* 문의 / 행사 요약 */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2 text-slate-600">
          <div className="font-semibold text-slate-800 text-sm">{inq?.event_name || editTarget.site_name}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            {eventPeriod && <span>📅 파견일자: <strong>{eventPeriod}</strong></span>}
            {editTarget.manager && <span>👤 담당: {editTarget.manager}</span>}
          </div>
          {/* 주소 정보 */}
          {(siteAddress || bizAddress) && (
            <div className="grid grid-cols-1 gap-1.5 pt-1.5 border-t border-slate-200">
              {siteAddress && (
                <div className="flex items-start gap-1.5">
                  <MapPin className="h-3 w-3 text-blue-400 mt-0.5 shrink-0" />
                  <span><span className="font-semibold text-blue-600">현장주소:</span> {siteAddress}</span>
                </div>
              )}
              {bizAddress && (
                <div className="flex items-start gap-1.5">
                  <Building2 className="h-3 w-3 text-purple-400 mt-0.5 shrink-0" />
                  <span><span className="font-semibold text-purple-600">사업장주소:</span> {bizAddress}</span>
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 pt-1.5 border-t border-slate-200">
            <span>공급가: <strong>{formatKRW(supplyPrice)}</strong></span>
            <span>VAT: <strong>{formatKRW(vat)}</strong></span>
            <span className="font-bold text-blue-700">청구: {formatKRW(invoiceAmt)}</span>
            {balance > 0 && <span className="font-bold text-red-600">잔액: {formatKRW(balance)}</span>}
          </div>
        </div>

        {/* 사업자 정보 */}
        <section>
          <h4 className="text-sm font-semibold text-gray-700 mb-2.5 flex items-center gap-1.5">
            <Receipt className="h-4 w-4 text-blue-500" />공급받는자 (세금계산서용)
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-xs">사업자등록번호</label>
              <Input
                value={form.biz_number}
                onChange={e => setForm(f => ({ ...f, biz_number: e.target.value }))}
                placeholder="000-00-00000"
                className="font-mono"
              />
            </div>
            <div>
              <label className="label-xs">상호 (법인명)</label>
              <Input value={form.corp_name} onChange={e => setForm(f => ({ ...f, corp_name: e.target.value }))} placeholder="업체 상호명" />
            </div>
            <div>
              <label className="label-xs">대표자명</label>
              <Input value={form.rep_name} onChange={e => setForm(f => ({ ...f, rep_name: e.target.value }))} placeholder="홍길동" />
            </div>
            <div>
              <label className="label-xs">이메일 (전자세금계산서)</label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="tax@company.com" />
            </div>
            <div>
              <label className="label-xs">연락처</label>
              <Input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="010-0000-0000" />
            </div>
            <div>
              <label className="label-xs">내용(품목)</label>
              <Input value={form.item_description} onChange={e => setForm(f => ({ ...f, item_description: e.target.value }))} placeholder="예) 행사 도우미 파견" />
            </div>
            <div className="col-span-2">
              <label className="label-xs">사업장주소</label>
              <Input value={form.site_address} onChange={e => setForm(f => ({ ...f, site_address: e.target.value }))} placeholder="서울특별시 중구 ..." />
            </div>
          </div>
        </section>

        {/* 세금계산서 발행 메모 */}
        <section>
          <label className="label-xs">발행 메모</label>
          <div className="flex flex-wrap gap-1 mb-1.5">
            {INVOICE_REQUEST_PRESETS.map(p => (
              <button
                key={p}
                onClick={() => setForm(f => ({ ...f, invoice_request: p }))}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  form.invoice_request === p
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <Textarea
            value={form.invoice_request}
            onChange={e => setForm(f => ({ ...f, invoice_request: e.target.value }))}
            placeholder="예) 100% 선발행 후 입금&#10;계약금 후불 — 별도 발행 필요"
            rows={2}
          />
        </section>

        {/* 입금 현황 */}
        <section>
          <h4 className="text-sm font-semibold text-gray-700 mb-2.5">입금 현황</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-xs">수령금액</label>
              <Input
                type="number"
                value={form.received_amount}
                onChange={e => setForm(f => ({ ...f, received_amount: e.target.value }))}
                placeholder="0"
              />
            </div>
            <div>
              <label className="label-xs">입금 상태</label>
              <Select value={form.deposit_status} onChange={e => setForm(f => ({ ...f, deposit_status: e.target.value }))}>
                {DEPOSIT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </Select>
            </div>
          </div>
          {/* 잔액 계산 표시 */}
          <div className="mt-2 p-2.5 bg-gray-50 rounded-lg border border-gray-200 text-xs flex gap-4">
            <span>청구: <strong>{formatKRW(invoiceAmt)}</strong></span>
            <span>수령: <strong className="text-green-700">{formatKRW(receivedNum)}</strong></span>
            <span className={`font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
              잔액: {formatKRW(balance)}
            </span>
          </div>
        </section>

        {/* 진행 상태 */}
        <section>
          <label className="label-xs">진행 상태</label>
          <Select value={form.progress} onChange={e => setForm(f => ({ ...f, progress: e.target.value }))}>
            {PROGRESS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </Select>
        </section>

        {/* 세금계산서 발행 완료 */}
        <label className={`flex items-center gap-3 cursor-pointer p-3 rounded-xl border-2 transition-colors ${
          form.tax_invoice_issued
            ? 'border-green-400 bg-green-50'
            : 'border-gray-200 bg-white hover:border-gray-300'
        }`}>
          <input
            type="checkbox"
            checked={form.tax_invoice_issued}
            onChange={e => setForm(f => ({ ...f, tax_invoice_issued: e.target.checked }))}
            className="w-5 h-5 accent-green-600"
          />
          <CheckCircle className={`h-5 w-5 ${form.tax_invoice_issued ? 'text-green-600' : 'text-gray-300'}`} />
          <div>
            <div className={`text-sm font-semibold ${form.tax_invoice_issued ? 'text-green-700' : 'text-gray-600'}`}>
              세금계산서 발행 완료
            </div>
            <div className="text-xs text-gray-400">체크하면 "발행 완료" 탭으로 이동합니다.</div>
          </div>
        </label>
      </DialogContent>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>취소</Button>
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          <Save className="h-4 w-4" />
          {saving ? '저장 중...' : '저장'}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
