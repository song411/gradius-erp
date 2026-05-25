'use client'

import { useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/supabase/api'
import type { Inquiry, Settlement, Payout, Assignment, Customer } from '@/lib/supabase/types'
import { BarChart3, Receipt, Banknote, Building2, TrendingUp } from 'lucide-react'

// 탭별 컴포넌트
import OverviewTab   from './OverviewTab'
import TaxInvoiceTab from './TaxInvoiceTab'
import PaymentTab    from './PaymentTab'
import DepositTab    from './DepositTab'
import ProfitTab     from './ProfitTab'

// closings 테이블이 없으므로 settlements 기반으로 세금계산서 관리
export interface CeoData {
  inquiries:   Inquiry[]
  settlements: Settlement[]
  payouts:     Payout[]
  assignments: Assignment[]
  customers:   Customer[]
  reload:      () => void
}

const TABS = [
  { id: 'overview',  label: '경영현황',    icon: BarChart3  },
  { id: 'tax',       label: '세금계산서',  icon: Receipt    },
  { id: 'payment',   label: '인력비 지급', icon: Banknote   },
  { id: 'deposit',   label: '업체 입금',   icon: Building2  },
  { id: 'profit',    label: '수익 보고',   icon: TrendingUp },
] as const

type TabId = typeof TABS[number]['id']

export default function CeoContent() {
  const [tab, setTab]         = useState<TabId>('overview')
  const [data, setData]       = useState<Omit<CeoData, 'reload'> | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [inquiries, settlements, payouts, assignments, customers] = await Promise.all([
      db.list<Inquiry>('inquiries'),
      db.list<Settlement>('settlements'),
      db.list<Payout>('payouts', { order: 'created_at', asc: false }),
      db.list<Assignment>('assignments', { order: 'assigned_at', asc: false }),
      db.list<Customer>('customers'),
    ])
    setData({ inquiries, settlements, payouts, assignments, customers })
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // 탭 배지 카운트
  function getBadge(id: TabId) {
    if (!data) return 0
    if (id === 'tax') {
      // settlements.tax_invoice_issued = false → 미발행
      return data.settlements.filter(s =>
        ['체결', '배정완료', '진행중', '완료', '정산완료'].includes(
          data.inquiries.find(q => q.id === s.inquiry_id)?.status || ''
        ) && !s.tax_invoice_issued
      ).length
    }
    if (id === 'payment') {
      // 본사 인원 제외, 미지급(대기+검토완료) 건수
      const HQ = new Set(['최규성', '송무재', '여지은', '김영찬'])
      return data.payouts.filter(p =>
        !(p.staff_name && HQ.has(p.staff_name)) &&
        !['지급완료', '완료'].includes(p.status)
      ).length
    }
    if (id === 'deposit') {
      return data.settlements.filter(s => s.deposit_status === '미입금').length
    }
    return 0
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    )
  }

  if (!data) return null

  const ceoData: CeoData = { ...data, reload: load }

  return (
    <div className="flex flex-col h-full">
      {/* 탭 네비게이션 */}
      <div className="border-b-2 border-amber-200 bg-white px-4 shrink-0 shadow-sm">
        <nav className="flex gap-0.5">
          {TABS.map(({ id, label, icon: Icon }) => {
            const badge  = getBadge(id)
            const active = tab === id
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-4 py-3.5 text-sm font-semibold border-b-[3px] transition-all whitespace-nowrap ${
                  active
                    ? 'border-amber-500 text-amber-700 bg-amber-50'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
                {badge > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
                    active ? 'bg-amber-200 text-amber-800' : 'bg-red-500 text-white'
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="flex-1 overflow-y-auto p-5 bg-gray-50">
        {tab === 'overview'  && <OverviewTab   data={ceoData} />}
        {tab === 'tax'       && <TaxInvoiceTab data={ceoData} />}
        {tab === 'payment'   && <PaymentTab    data={ceoData} />}
        {tab === 'deposit'   && <DepositTab    data={ceoData} />}
        {tab === 'profit'    && <ProfitTab     data={ceoData} />}
      </div>
    </div>
  )
}
