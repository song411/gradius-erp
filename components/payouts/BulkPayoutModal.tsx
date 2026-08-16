'use client'

import { useState, useEffect, useMemo } from 'react'
import { db } from '@/lib/supabase/api'
import type { Assignment, Staff } from '@/lib/supabase/types'
import { formatKRW } from '@/lib/utils'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Layers, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

// 구간별 단가 (인력배정에서 구간 설정 시 assignment.memo에 JSON 저장)
interface PaySegment { rate: number; days: number }
function parseSegments(memo?: string | null): PaySegment[] | null {
  if (!memo) return null
  try {
    const p = JSON.parse(memo)
    if (Array.isArray(p.segments) && p.segments.length > 0) return p.segments
  } catch {}
  return null
}
function segmentTotal(segs: PaySegment[]) {
  return segs.reduce((s, seg) => s + (seg.rate || 0) * (seg.days || 1), 0)
}

// PayoutForm과 동일한 공제율 옵션
const TAX_RATE_OPTIONS = [
  { label: '공제 없음', sub: '0%', value: 0 },
  { label: '0.9%', sub: '고용보험 등', value: 0.009 },
  { label: '3.3%', sub: '프리랜서 원천징수', value: 0.033 },
]

interface Props {
  open: boolean
  onClose: () => void
  assignments: Assignment[]       // 지급 미등록 유급 인원
  eventName: string
  inquiryId: string
  onSaved: () => void
}

export default function BulkPayoutModal({ open, onClose, assignments, eventName, inquiryId, onSaved }: Props) {
  const [taxRate, setTaxRate]   = useState(0.033)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [saving, setSaving]     = useState(false)
  // 배정에 계좌가 없는 인원은 스태프 DB에서 보충 조회
  const [staffMap, setStaffMap] = useState<Record<string, Staff>>({})

  // 배정에 계좌가 빠진 인원의 staff_id — 부모가 매 렌더마다 새 배열을 넘겨도
  // 문자열이라 값이 같으면 아래 조회가 다시 돌지 않는다.
  const needIdsKey = Array.from(new Set(
    assignments
      .filter(a => a.staff_id && (!a.bank_name || !a.account_number))
      .map(a => a.staff_id as string)
  )).sort().join(',')

  // 모달은 열릴 때마다 새로 마운트되므로 초기화는 불필요 — 계좌 보충 조회만 수행
  useEffect(() => {
    if (!needIdsKey) return

    let cancelled = false
    db.list<Staff>('staff', { inFilter: { id: needIdsKey.split(',') } })
      .then(list => {
        if (cancelled) return
        const map: Record<string, Staff> = {}
        list.forEach(s => { map[s.id] = s })
        setStaffMap(map)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [needIdsKey])

  // 인원별 계산 결과
  const rows = useMemo(() => assignments.map(a => {
    const segs = parseSegments(a.memo)
    const base = segs ? segmentTotal(segs) : (a.pay_rate || 0) * (a.work_days || 1)
    const deduction = Math.floor(base * taxRate)
    const staff = a.staff_id ? staffMap[a.staff_id] : undefined
    const bankName      = a.bank_name      || staff?.bank_name      || ''
    const accountNumber = a.account_number || staff?.account_number || ''
    return {
      assign: a, segs, base, deduction,
      finalPay: base - deduction,
      bankName, accountNumber,
      idNumber: a.id_number || staff?.id_number || '',
      noAccount: !bankName && !accountNumber,
      included: !excluded.has(a.id),
    }
  }), [assignments, taxRate, staffMap, excluded])

  const selected  = rows.filter(r => r.included)
  const sumBase   = selected.reduce((s, r) => s + r.base, 0)
  const sumDeduct = selected.reduce((s, r) => s + r.deduction, 0)
  const sumFinal  = selected.reduce((s, r) => s + r.finalPay, 0)
  const noAccountCount = selected.filter(r => r.noAccount).length
  const zeroAmountCount = selected.filter(r => r.base <= 0).length

  function toggle(id: string) {
    setExcluded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleRegister(status: '대기' | '확인완료') {
    if (!selected.length) { toast.info('선택된 인원이 없습니다.'); return }
    setSaving(true)
    try {
      // PayoutForm 신규 등록과 동일한 형태로 생성 (수당·비과세는 0, 이후 개별 수정)
      const payloads = selected.map(({ assign, segs, base, deduction, finalPay, bankName, accountNumber, idNumber }) => {
        const start = assign.start_date || ''
        const end   = assign.end_date || ''
        return {
          assignment_id: assign.id,
          inquiry_id: assign.inquiry_id || inquiryId || null,
          staff_name: assign.staff_name || '',
          site_name: eventName || '',
          dispatch_period: (start && end ? `${start} ~ ${end}` : start) || null,
          dispatch_days: assign.work_days || 1,
          base_pay: base,
          overtime_pay: 0,
          meal_pay: 0,
          transport_pay: 0,
          bonus: 0,
          non_taxable_pay: 0,
          subtotal: base,
          tax_deduction: deduction,
          final_pay: finalPay,
          status,
          bank_name: bankName || null,
          account_number: accountNumber || null,
          id_number: idNumber || null,
          notes: segs ? JSON.stringify({ segments: segs, memo: '' }) : null,
        }
      })
      await db.insert('payouts', payloads)
      toast.success(
        `${payloads.length}명 지급 등록 완료 (${status === '대기' ? '대기' : '검토완료'} · 총 ${formatKRW(sumFinal)})`
      )
      onSaved()
      onClose()
    } catch (e) {
      toast.error('일괄 등록 실패: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-orange-500" />
          일괄 지급등록
          <span className="text-xs font-normal text-gray-400">미등록 {assignments.length}명</span>
        </DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>

      <DialogContent className="space-y-4">
        {/* 공제율 선택 */}
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-2">원천공제율 — 전원 동일 적용</p>
          <div className="grid grid-cols-3 gap-2">
            {TAX_RATE_OPTIONS.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => setTaxRate(o.value)}
                className={`rounded-xl border-2 px-3 py-2 text-left transition-all ${
                  taxRate === o.value
                    ? 'border-blue-500 bg-blue-50 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-blue-300'
                }`}
              >
                <p className={`text-sm font-bold ${taxRate === o.value ? 'text-blue-700' : 'text-gray-700'}`}>{o.label}</p>
                <p className="text-[10px] text-gray-400">{o.sub}</p>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">
            등록 후 개별 수정에서 사람마다 다르게 바꿀 수 있습니다.
          </p>
        </div>

        {/* 대상 인원 목록 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-600">등록 대상 ({selected.length}/{rows.length}명)</p>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => setExcluded(excluded.size ? new Set() : new Set(rows.map(r => r.assign.id)))}
                className="text-[10px] text-blue-600 hover:underline"
              >
                {excluded.size ? '전체 선택' : '전체 해제'}
              </button>
            )}
          </div>
          <div className="border-2 border-gray-200 rounded-xl divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {rows.map(r => (
              <label
                key={r.assign.id}
                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                  r.included ? 'hover:bg-blue-50/40' : 'bg-gray-50 opacity-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={r.included}
                  onChange={() => toggle(r.assign.id)}
                  className="w-4 h-4 rounded shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {r.assign.role_type === '팀장' && (
                      <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.5 rounded">[팀장]</span>
                    )}
                    <span className="text-sm font-semibold text-gray-800">{r.assign.staff_name}</span>
                    {r.assign.job_type && <span className="text-[10px] text-gray-400">{r.assign.job_type}</span>}
                    {r.noAccount && (
                      <span className="text-[10px] text-orange-500 flex items-center gap-0.5">
                        <AlertCircle className="h-3 w-3" />계좌 미입력
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap mt-0.5 text-[10px] text-gray-500">
                    {r.segs ? r.segs.map((seg, i) => (
                      <span key={i} className="bg-indigo-50 text-indigo-700 px-1 py-0.5 rounded font-medium">
                        {formatKRW(seg.rate)}×{seg.days}일
                      </span>
                    )) : (
                      <span>{formatKRW(r.assign.pay_rate)} × {r.assign.work_days}일</span>
                    )}
                    <span>= 기본 <strong className="text-gray-700">{formatKRW(r.base)}</strong></span>
                    {r.deduction > 0 && <span className="text-red-400">공제 -{formatKRW(r.deduction)}</span>}
                  </div>
                </div>
                <p className="text-sm font-extrabold text-blue-700 shrink-0">{formatKRW(r.finalPay)}</p>
              </label>
            ))}
          </div>
        </div>

        {/* 합계 */}
        <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-sm">
          <div className="flex justify-between text-gray-500">
            <span>기본급 소계</span>
            <span>{formatKRW(sumBase)}</span>
          </div>
          {sumDeduct > 0 && (
            <div className="flex justify-between text-red-500 text-xs">
              <span>공제 ({(taxRate * 100).toFixed(1)}%)</span>
              <span>- {formatKRW(sumDeduct)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base text-blue-700 border-t border-gray-200 pt-1">
            <span>최종 지급액 합계</span>
            <span>{formatKRW(sumFinal)}</span>
          </div>
        </div>

        {/* 경고 */}
        {(noAccountCount > 0 || zeroAmountCount > 0) && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 space-y-0.5">
            {noAccountCount > 0 && (
              <p className="text-[11px] text-orange-700">
                ⚠ 계좌 정보가 없는 인원 {noAccountCount}명 — 등록은 되지만 이체목록 엑셀에서 계좌가 빕니다.
              </p>
            )}
            {zeroAmountCount > 0 && (
              <p className="text-[11px] text-orange-700">
                ⚠ 금액이 0원인 인원 {zeroAmountCount}명 — 배정 단가가 비어 있습니다. 등록 후 개별 수정이 필요합니다.
              </p>
            )}
          </div>
        )}
      </DialogContent>

      <div className="px-5 pb-1">
        <p className="text-[10px] text-gray-400 leading-relaxed">
          <span className="font-medium text-gray-500">대기로 등록</span> — 금액을 나중에 검토 &nbsp;/&nbsp;
          <span className="font-medium text-gray-500">검토완료로 등록</span> — 금액 확정, 바로 입금 처리 가능
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>취소</Button>
        <Button
          variant="outline"
          onClick={() => handleRegister('대기')}
          disabled={saving || !selected.length}
          className="text-gray-600 border-gray-300"
        >
          {saving ? '등록 중...' : `💾 대기로 등록 (${selected.length}명)`}
        </Button>
        <Button
          onClick={() => handleRegister('확인완료')}
          disabled={saving || !selected.length}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {saving ? '등록 중...' : `✓ 검토완료로 등록 (${selected.length}명)`}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
