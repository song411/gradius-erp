'use client'

import { useState, useEffect } from 'react'
import { db } from '@/lib/supabase/api'
import type { Assignment, Payout, Staff } from '@/lib/supabase/types'
import { formatKRW, formatDate } from '@/lib/utils'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Calculator, User, CreditCard, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

// 공제율 옵션
const TAX_RATE_OPTIONS = [
  { label: '없음 (0%)', value: 0 },
  { label: '0.9% (고용보험 등)', value: 0.009 },
  { label: '3.3% (프리랜서 원천징수)', value: 0.033 },
]

interface Props {
  open: boolean
  onClose: () => void
  assignment: Assignment
  payout: Payout | null       // null = 신규 등록
  onSaved: () => void
}

export default function PayoutForm({ open, onClose, assignment, payout, onSaved }: Props) {
  const [saving, setSaving] = useState(false)

  // 지급 항목
  const [basePay, setBasePay]         = useState('')
  const [overtimePay, setOvertimePay] = useState('0')
  const [mealPay, setMealPay]         = useState('0')
  const [transportPay, setTransportPay] = useState('0')
  const [bonus, setBonus]             = useState('0')

  // 공제율
  const [taxRate, setTaxRate] = useState(0.033)

  // 계좌/신원 정보
  const [bankName, setBankName]           = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [idNumber, setIdNumber]           = useState('')
  const [notes, setNotes]                 = useState('')

  // 기간 정보
  const [dispatchPeriod, setDispatchPeriod] = useState('')
  const [dispatchDays, setDispatchDays]     = useState('')

  // staff 정보 자동 로드
  const [staffLoaded, setStaffLoaded] = useState(false)

  useEffect(() => {
    if (!open) return

    if (payout) {
      // 기존 지급 수정
      setBasePay(String(payout.base_pay || 0))
      setOvertimePay(String(payout.overtime_pay || 0))
      setMealPay(String(payout.meal_pay || 0))
      setTransportPay(String(payout.transport_pay || 0))
      setBonus(String(payout.bonus || 0))
      // 공제율 역산
      const sub = (payout.base_pay || 0) + (payout.overtime_pay || 0) + (payout.meal_pay || 0) + (payout.transport_pay || 0) + (payout.bonus || 0)
      const rate = sub > 0 ? (payout.tax_deduction || 0) / sub : 0.033
      const closest = TAX_RATE_OPTIONS.reduce((a, b) =>
        Math.abs(b.value - rate) < Math.abs(a.value - rate) ? b : a
      )
      setTaxRate(closest.value)
      setBankName(payout.bank_name || '')
      setAccountNumber(payout.account_number || '')
      setIdNumber(payout.id_number || '')
      setNotes(payout.notes || '')
      setDispatchPeriod(payout.dispatch_period || '')
      setDispatchDays(String(payout.dispatch_days || assignment.work_days || 1))
    } else {
      // 신규 등록 - 배정 데이터로 자동 채우기
      const autoBase = (assignment.pay_rate || 0) * (assignment.work_days || 1)
      setBasePay(String(autoBase))
      setOvertimePay('0')
      setMealPay('0')
      setTransportPay('0')
      setBonus('0')
      setTaxRate(0.033)
      setBankName(assignment.bank_name || '')
      setAccountNumber(assignment.account_number || '')
      setIdNumber(assignment.id_number || '')
      setNotes('')
      const start = assignment.start_date || ''
      const end = assignment.end_date || ''
      setDispatchPeriod(start && end ? `${start} ~ ${end}` : start || '')
      setDispatchDays(String(assignment.work_days || 1))
      setStaffLoaded(false)

      // staff DB에서 계좌/주민번호 자동 로드 (assignment에 없을 경우)
      if (assignment.staff_id && (!assignment.bank_name || !assignment.account_number)) {
        db.single<Staff>('staff', assignment.staff_id).then(staff => {
          if (staff) {
            if (!assignment.bank_name) setBankName(staff.bank_name || '')
            if (!assignment.account_number) setAccountNumber(staff.account_number || '')
            if (!assignment.id_number) setIdNumber(staff.id_number || '')
            setStaffLoaded(true)
          }
        })
      }
    }
  }, [open, assignment, payout])

  // 계산
  const subtotal = [basePay, overtimePay, mealPay, transportPay, bonus]
    .reduce((s, v) => s + (Number(v) || 0), 0)
  const taxDeduction = Math.floor(subtotal * taxRate)
  const finalPay = subtotal - taxDeduction

  async function handleSave(newStatus?: string) {
    setSaving(true)
    const payload = {
      assignment_id: assignment.id,
      inquiry_id: assignment.inquiry_id || null,
      staff_name: assignment.staff_name || '',
      site_name: assignment.event_name || '',
      dispatch_period: dispatchPeriod || null,
      dispatch_days: Number(dispatchDays) || assignment.work_days || 1,
      base_pay: Number(basePay) || 0,
      overtime_pay: Number(overtimePay) || 0,
      meal_pay: Number(mealPay) || 0,
      transport_pay: Number(transportPay) || 0,
      bonus: Number(bonus) || 0,
      subtotal,
      tax_deduction: taxDeduction,
      final_pay: finalPay,
      status: newStatus || payout?.status || '대기',
      bank_name: bankName || null,
      account_number: accountNumber || null,
      id_number: idNumber || null,
      notes: notes || null,
    }
    try {
      if (payout) {
        await db.update('payouts', payout.id, payload)
        toast.success('지급 정보가 수정되었습니다.')
      } else {
        await db.insert('payouts', payload)
        toast.success('지급 요청이 등록되었습니다.')
      }
      onSaved()
      onClose()
    } catch (e) {
      toast.error('저장 실패: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // DB enum에 '검토완료'가 없으면 '확인완료'로 저장 (Supabase에서 ALTER TYPE 실행 후 '검토완료'로 변경)
  async function handleConfirm() {
    await handleSave('확인완료')
  }

  const isTeamLeader = assignment.role_type === '팀장'
  const noAccountInfo = !bankName && !accountNumber

  return (
    <Dialog open={open} onClose={onClose} className="max-w-xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-blue-600" />
          {payout ? '지급 수정' : '지급 등록'}
        </DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>

      <DialogContent className="space-y-4">
        {/* 배정 정보 요약 */}
        <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-gray-400" />
            <span className="font-semibold">
              {assignment.staff_type === '본사' && <span className="text-purple-600 text-xs font-bold">[본사] </span>}
              {isTeamLeader && <span className="text-indigo-600 text-xs font-bold">[팀장] </span>}
              {assignment.staff_name}
            </span>
            <span className="text-xs text-gray-400">{assignment.job_type}</span>
          </div>
          <div className="flex gap-4 text-xs text-gray-500">
            <span>배정단가: {formatKRW(assignment.pay_rate)}</span>
            <span>일수: {assignment.work_days}일</span>
            <span>기준금액: <strong className="text-gray-800">{formatKRW((assignment.pay_rate || 0) * (assignment.work_days || 1))}</strong></span>
          </div>
          {isTeamLeader && (
            <p className="text-xs text-indigo-600 bg-indigo-50 rounded px-2 py-0.5">
              팀 전체 지급 (팀원 포함 일괄 지급)
            </p>
          )}
        </div>

        {/* 파견 기간 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">파견 기간</label>
            <Input
              value={dispatchPeriod}
              onChange={e => setDispatchPeriod(e.target.value)}
              placeholder="2026-03-15 ~ 2026-03-16"
              className="h-8 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">파견 일수</label>
            <Input
              type="number"
              value={dispatchDays}
              onChange={e => setDispatchDays(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>

        {/* 지급 항목 */}
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2">지급 항목</p>
          <div className="space-y-2">
            {[
              { label: '기본급', value: basePay, setter: setBasePay, highlight: true },
              { label: '야근수당', value: overtimePay, setter: setOvertimePay },
              { label: '식비', value: mealPay, setter: setMealPay },
              { label: '교통비', value: transportPay, setter: setTransportPay },
              { label: '실비/기타', value: bonus, setter: setBonus },
            ].map(({ label, value, setter, highlight }) => (
              <div key={label} className="flex items-center gap-3">
                <label className={`text-xs w-20 shrink-0 ${highlight ? 'font-semibold text-gray-700' : 'text-gray-500'}`}>
                  {label}
                </label>
                <Input
                  type="number"
                  value={value}
                  onChange={e => setter(e.target.value)}
                  className={`h-8 text-sm flex-1 ${highlight ? 'border-blue-200 bg-blue-50/30' : ''}`}
                />
                <span className="text-xs text-gray-400 w-24 text-right shrink-0">
                  {formatKRW(Number(value) || 0)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 공제 + 합계 */}
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-gray-600 w-20 shrink-0">공제율</label>
            <Select
              value={String(taxRate)}
              onChange={e => setTaxRate(Number(e.target.value))}
              className="h-8 text-sm flex-1"
            >
              {TAX_RATE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
          <div className="border-t border-gray-200 pt-2 space-y-1 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>소계</span>
              <span>{formatKRW(subtotal)}</span>
            </div>
            {taxDeduction > 0 && (
              <div className="flex justify-between text-red-500 text-xs">
                <span>공제 ({(taxRate * 100).toFixed(1)}%)</span>
                <span>- {formatKRW(taxDeduction)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base text-blue-700 border-t border-gray-200 pt-1">
              <span>최종 지급액</span>
              <span>{formatKRW(finalPay)}</span>
            </div>
          </div>
        </div>

        {/* 계좌 정보 */}
        <div>
          <div className="flex items-center gap-1 mb-2">
            <CreditCard className="h-3.5 w-3.5 text-gray-400" />
            <p className="text-xs font-semibold text-gray-600">계좌 정보</p>
            {staffLoaded && <span className="text-[10px] text-green-600 bg-green-50 rounded px-1">스탭 DB 자동입력</span>}
            {noAccountInfo && (
              <span className="text-[10px] text-orange-500 flex items-center gap-0.5">
                <AlertCircle className="h-3 w-3" />계좌 미입력
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 mb-1 block">은행</label>
              <Input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="국민은행" className="h-8 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-gray-500 mb-1 block">계좌번호</label>
              <Input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="000-000-000000" className="h-8 text-sm" />
            </div>
          </div>
          <div className="mt-2">
            <label className="text-[10px] text-gray-500 mb-1 block">주민등록번호 (공제 신고용)</label>
            <Input value={idNumber} onChange={e => setIdNumber(e.target.value)} placeholder="000000-0000000" className="h-8 text-sm" />
          </div>
        </div>

        {/* 메모 */}
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">메모</label>
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="공제 없음, 식비포함, 현금지급 등"
            rows={2}
            className="text-sm"
          />
        </div>
      </DialogContent>

      {/* 버튼 안내 문구 */}
      <div className="px-4 pb-1">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          <span className="font-medium text-gray-500">💾 임시저장</span> — 금액 입력 후 나중에 검토 (대기 상태) &nbsp;→&nbsp;
          <span className="font-medium text-gray-500">✓ 금액검토 완료</span> — HR 검토 확인 (검토완료 상태) &nbsp;→&nbsp;
          <span className="font-medium text-gray-600">입금완료</span> — 실제 입금 시 목록에서 처리
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>취소</Button>
        <Button variant="outline" onClick={() => handleSave()} disabled={saving} className="text-gray-600 border-gray-300">
          {saving ? '저장 중...' : '💾 임시저장 (대기)'}
        </Button>
        <Button onClick={handleConfirm} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
          {saving ? '처리 중...' : '✓ 금액검토 완료'}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
