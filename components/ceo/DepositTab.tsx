'use client'

import { useState, useMemo } from 'react'
import { db } from '@/lib/supabase/api'
import { formatKRW } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Building2, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import type { CeoData } from './CeoContent'
import type { Settlement, Inquiry } from '@/lib/supabase/types'
import { toast } from 'sonner'

type DepositStatus = '입금완료' | '부분입금' | '미입금'
const DEPOSIT_COLOR: Record<DepositStatus, string> = {
  '미입금':  'bg-red-100 text-red-700',
  '부분입금': 'bg-yellow-100 text-yellow-700',
  '입금완료': 'bg-green-100 text-green-700',
}
const STATUS_ORDER: Record<DepositStatus, number> = {
  '미입금': 0, '부분입금': 1, '입금완료': 2,
}

export default function DepositTab({ data }: { data: CeoData }) {
  const { settlements, inquiries, reload } = data
  const [filter, setFilter]         = useState<'' | DepositStatus>('')
  const [editId, setEditId]         = useState<string | null>(null)
  const [editAmt, setEditAmt]       = useState('')
  const [saving, setSaving]         = useState(false)

  // 정산 + 문의 조인
  const rows = useMemo(() => {
    return settlements
      .map(s => ({
        ...s,
        inquiry: inquiries.find(q => q.id === s.inquiry_id),
      }))
      .filter(s => !filter || s.deposit_status === filter)
      .sort((a, b) => {
        const ao = STATUS_ORDER[(a.deposit_status as DepositStatus)] ?? 3
        const bo = STATUS_ORDER[(b.deposit_status as DepositStatus)] ?? 3
        return ao - bo
      })
  }, [settlements, inquiries, filter])

  // 요약
  const unpaid   = settlements.filter(s => s.deposit_status === '미입금')
  const partial  = settlements.filter(s => s.deposit_status === '부분입금')
  const complete = settlements.filter(s => s.deposit_status === '입금완료')
  const totalUnpaid = unpaid.reduce((s, r) => s + (r.balance || r.supply_price - r.received_amount), 0)

  async function handleSaveAmount(sett: Settlement) {
    const amt = Number(editAmt)
    if (isNaN(amt) || amt < 0) { toast.error('올바른 금액을 입력해주세요.'); return }
    setSaving(true)
    try {
      const newDeposit: DepositStatus =
        amt === 0                 ? '미입금' :
        amt >= sett.supply_price  ? '입금완료' : '부분입금'

      await db.update('settlements', sett.id, {
        received_amount: amt,
        deposit_status:  newDeposit,
      })
      toast.success('입금 정보가 업데이트되었습니다.')
      setEditId(null)
      reload()
    } catch {
      toast.error('저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function handleQuickDeposit(sett: Settlement, pct: number) {
    const amt = Math.round(sett.supply_price * pct)
    setSaving(true)
    try {
      const newDeposit: DepositStatus = pct >= 1 ? '입금완료' : '부분입금'
      await db.update('settlements', sett.id, {
        received_amount: amt,
        deposit_status:  newDeposit,
      })
      toast.success(`${pct * 100}% 입금 확인 처리되었습니다.`)
      reload()
    } catch {
      toast.error('처리 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-700 mb-1">
            <AlertCircle className="h-4 w-4" />
            <span className="text-xs font-semibold">미입금</span>
          </div>
          <p className="text-2xl font-bold text-red-700">{unpaid.length}<span className="text-sm font-normal ml-0.5">건</span></p>
          <p className="text-xs text-red-500 mt-0.5">{formatKRW(totalUnpaid)}</p>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-yellow-700 mb-1">
            <Clock className="h-4 w-4" />
            <span className="text-xs font-semibold">부분입금</span>
          </div>
          <p className="text-2xl font-bold text-yellow-700">{partial.length}<span className="text-sm font-normal ml-0.5">건</span></p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-700 mb-1">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-xs font-semibold">입금완료</span>
          </div>
          <p className="text-2xl font-bold text-green-700">{complete.length}<span className="text-sm font-normal ml-0.5">건</span></p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-700 mb-1">
            <Building2 className="h-4 w-4" />
            <span className="text-xs font-semibold">전체</span>
          </div>
          <p className="text-2xl font-bold text-blue-700">{settlements.length}<span className="text-sm font-normal ml-0.5">건</span></p>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex gap-2">
        {(['', '미입금', '부분입금', '입금완료'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-sm px-3 py-1.5 rounded-full border font-medium transition-colors ${
              filter === f
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
            }`}
          >
            {f || '전체'}
          </button>
        ))}
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">업체명</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500">행사명</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">청구금액</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">받은금액</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">미수금</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500">입금상태</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">데이터가 없습니다.</td></tr>
              )}
              {rows.map(s => {
                const balance = s.balance ?? (s.supply_price - s.received_amount)
                const isEditing = editId === s.id
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{s.company_name || s.inquiry?.company_name || '-'}</td>
                    <td className="px-3 py-3 text-gray-600 text-xs max-w-[160px] truncate">{s.inquiry?.event_name || '-'}</td>
                    <td className="px-3 py-3 text-right font-semibold">{formatKRW(s.invoice_amount || s.supply_price)}</td>
                    <td className="px-3 py-3 text-right">
                      {isEditing ? (
                        <div className="flex items-center gap-1 justify-end">
                          <Input
                            type="number"
                            value={editAmt}
                            onChange={e => setEditAmt(e.target.value)}
                            className="w-32 h-7 text-xs text-right"
                            autoFocus
                          />
                          <Button size="sm" className="h-7 text-xs" onClick={() => handleSaveAmount(s)} disabled={saving}>저장</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditId(null)}>취소</Button>
                        </div>
                      ) : (
                        <button
                          className="text-blue-700 font-semibold hover:underline"
                          onClick={() => { setEditId(s.id); setEditAmt(String(s.received_amount)) }}
                        >
                          {formatKRW(s.received_amount)}
                        </button>
                      )}
                    </td>
                    <td className={`px-3 py-3 text-right font-bold ${balance > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {balance > 0 ? formatKRW(balance) : '-'}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${DEPOSIT_COLOR[s.deposit_status as DepositStatus] || 'bg-gray-100 text-gray-500'}`}>
                        {s.deposit_status || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {s.deposit_status !== '입금완료' && !isEditing && (
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            size="sm" variant="outline" className="text-xs h-7"
                            onClick={() => handleQuickDeposit(s, 0.5)}
                            disabled={saving}
                          >
                            50%
                          </Button>
                          <Button
                            size="sm" variant="outline" className="text-xs h-7"
                            onClick={() => handleQuickDeposit(s, 1)}
                            disabled={saving}
                          >
                            전액
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
