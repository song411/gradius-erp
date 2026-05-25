'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { db } from '@/lib/supabase/api'
import { formatKRW } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Search, Edit2, Receipt, CheckCircle, AlertCircle, Clock,
} from 'lucide-react'
import type { Settlement, Inquiry, Customer } from '@/lib/supabase/types'
import ClosingForm from './ClosingForm'

type SettRow = Settlement & { inquiries?: Inquiry }
type TabKey = 'not_issued' | 'issued'

export default function ClosingsContent() {
  const [settlements, setSettlements] = useState<SettRow[]>([])
  const [customers, setCustomers]     = useState<Customer[]>([])
  const [loading, setLoading]         = useState(true)
  const [searchText, setSearchText]   = useState('')
  const [activeTab, setActiveTab]     = useState<TabKey>('not_issued')

  const [showForm, setShowForm]       = useState(false)
  const [editTarget, setEditTarget]   = useState<SettRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [data, custs] = await Promise.all([
      db.list<SettRow>('settlements', {
        select: '*, inquiries(id,company_name,event_name,status,event_start,event_end,location,customer_id)',
        order: 'created_at', asc: false,
      }),
      db.list<Customer>('customers'),
    ])
    setSettlements(data)
    setCustomers(custs)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openEdit(row: SettRow) {
    setEditTarget(row)
    setShowForm(true)
  }

  // 탭 필터
  const filtered = settlements.filter(s => {
    const matchSearch = !searchText ||
      [s.company_name, s.corp_name, s.inquiries?.event_name, s.biz_number]
        .some(v => v?.toLowerCase().includes(searchText.toLowerCase()))

    if (activeTab === 'not_issued') return matchSearch && !s.tax_invoice_issued
    if (activeTab === 'issued')     return matchSearch && !!s.tax_invoice_issued
    return matchSearch
  })

  // KPI
  const notIssued  = settlements.filter(s => !s.tax_invoice_issued).length
  const issued     = settlements.filter(s =>  s.tax_invoice_issued).length
  const totalAmt   = settlements.reduce((a, s) => a + (s.invoice_amount || 0), 0)
  const receivedAmt = settlements.reduce((a, s) => a + (s.received_amount || 0), 0)

  const TABS = [
    { key: 'not_issued' as TabKey, label: '세금계산서 미발행', icon: <AlertCircle className="h-4 w-4" />, count: notIssued },
    { key: 'issued'     as TabKey, label: '발행 완료',          icon: <CheckCircle  className="h-4 w-4" />, count: issued },
  ]

  return (
    <>
      {/* KPI */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <StatCard icon={<AlertCircle className="h-5 w-5" />} label="세금계산서 미발행" value={`${notIssued}건`}          color="red" />
        <StatCard icon={<CheckCircle  className="h-5 w-5" />} label="발행 완료"          value={`${issued}건`}             color="green" />
        <StatCard icon={<Receipt      className="h-5 w-5" />} label="총 청구금액"         value={formatKRW(totalAmt)}       color="blue" />
        <StatCard icon={<Clock        className="h-5 w-5" />} label="수령 완료"           value={formatKRW(receivedAmt)}    color="purple" />
      </div>

      {/* 검색 */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="업체명, 사업자번호, 행사명 검색..."
            className="pl-9"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {tab.icon}{tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
              {tab.count}
            </span>
          </button>
        ))}
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
                    <th>행사명</th>
                    <th>사업자번호</th>
                    <th>대표자</th>
                    <th>세금계산서 메모</th>
                    <th className="text-right">청구금액</th>
                    <th className="text-right">수령금액</th>
                    <th>입금상태</th>
                    <th>진행상태</th>
                    <th>세금계산서</th>
                    <th className="text-right">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={11}><div className="erp-empty"><p>데이터가 없습니다.</p></div></td>
                    </tr>
                  ) : filtered.map(s => (
                    <tr key={s.id} className={`transition-colors ${s.tax_invoice_issued ? 'hover:bg-gray-50' : 'hover:bg-red-50'}`}>
                      <td className="font-medium">{s.company_name || s.corp_name || '-'}</td>
                      <td className="text-sm text-gray-600">{s.inquiries?.event_name || s.site_name || '-'}</td>
                      <td className="font-mono text-sm">{s.biz_number || <span className="text-gray-300 text-xs italic">미입력</span>}</td>
                      <td className="text-sm">{s.rep_name || '-'}</td>
                      <td className="text-sm text-amber-700 max-w-[160px] truncate" title={s.invoice_request || ''}>
                        {s.invoice_request || <span className="text-gray-300 text-xs">-</span>}
                      </td>
                      <td className="text-right font-semibold">{formatKRW(s.invoice_amount)}</td>
                      <td className="text-right text-green-700">{s.received_amount ? formatKRW(s.received_amount) : '-'}</td>
                      <td><DepositBadge status={s.deposit_status} /></td>
                      <td><ProgressBadge progress={s.progress} /></td>
                      <td>
                        {s.tax_invoice_issued
                          ? <span className="text-xs text-green-600 font-semibold flex items-center gap-1"><CheckCircle className="h-3 w-3" />발행완료</span>
                          : <span className="text-xs text-red-500 font-semibold">미발행</span>}
                      </td>
                      <td className="text-right">
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => openEdit(s)}
                          title="세금계산서 정보 편집"
                          className="h-7 w-7"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          </div>
        )}
      </div>

      {/* 세금계산서 편집 폼 */}
      <ClosingForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onSaved={() => { load(); setShowForm(false) }}
        editTarget={editTarget}
        customers={customers}
      />
    </>
  )
}

// ── 배지 ─────────────────────────────────────────────────
function DepositBadge({ status }: { status?: string | null }) {
  const MAP: Record<string, string> = {
    '입금완료': 'bg-green-100 text-green-700',
    '부분입금': 'bg-yellow-100 text-yellow-700',
    '미입금':   'bg-red-100 text-red-600',
  }
  const s = status || '미입금'
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MAP[s] || 'bg-gray-100 text-gray-500'}`}>{s}</span>
}

function ProgressBadge({ progress }: { progress?: string | null }) {
  const MAP: Record<string, string> = {
    '계약체결': 'bg-blue-100 text-blue-700',
    '행사준비': 'bg-indigo-100 text-indigo-700',
    '행사종료': 'bg-orange-100 text-orange-700',
    '정산완료': 'bg-gray-100 text-gray-600',
  }
  const p = progress || '-'
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${MAP[p] || 'bg-gray-100 text-gray-500'}`}>{p}</span>
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const gradients: Record<string, string> = {
    blue:   'from-blue-600 to-blue-500',
    green:  'from-green-600 to-emerald-500',
    red:    'from-red-500 to-rose-500',
    purple: 'from-purple-600 to-purple-500',
  }
  return (
    <div className={`rounded-xl p-5 text-white bg-gradient-to-br ${gradients[color] || gradients.blue} shadow-sm`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium opacity-90">{label}</span>
        <div className="opacity-80">{icon}</div>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  )
}
