'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { db } from '@/lib/supabase/api'
import { HQ_STAFF_NAMES, needsTaxInvoice } from '@/lib/finance'
import type { Inquiry, Settlement, Payout, Assignment, Customer, EstimateItem, Estimate, EventExpense } from '@/lib/supabase/types'
import { BarChart3, Receipt, Banknote, Building2, TrendingUp } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

// 탭별 컴포넌트
import OverviewTab   from './OverviewTab'
import TaxInvoiceTab from './TaxInvoiceTab'
import PaymentTab    from './PaymentTab'
import DepositTab    from './DepositTab'
import ProfitTab     from './ProfitTab'

// closings 테이블이 없으므로 settlements 기반으로 세금계산서 관리
export interface CeoData {
  inquiries:     Inquiry[]
  settlements:   Settlement[]
  payouts:       Payout[]
  assignments:   Assignment[]
  customers:     Customer[]
  estimateItems: EstimateItem[]   // 견적서 품목 (inquiry_id 기준)
  estimates:     Estimate[]       // 견적서 (prev_total_price 등 변경 이력용)
  expenses:      EventExpense[]   // 행사별 부대비용 (실제 지출) — 수익에서 차감
  reload:        () => void
}

const TABS = [
  { id: 'overview',  label: '경영현황',    icon: BarChart3  },
  { id: 'tax',       label: '세금계산서',  icon: Receipt    },
  { id: 'payment',   label: '인력비 지급', icon: Banknote   },
  { id: 'deposit',   label: '업체 입금',   icon: Building2  },
  { id: 'profit',    label: '수익 보고',   icon: TrendingUp },
] as const

type TabId = typeof TABS[number]['id']

function isTabId(v: string | null): v is TabId {
  return TABS.some(t => t.id === v)
}

export default function CeoContent() {
  // 탭을 URL(?tab=)에 남긴다 — 새로고침하거나 링크를 공유해도 보던 탭이 유지된다
  const searchParams = useSearchParams()
  const initialTab = searchParams.get('tab')
  const [tab, setTabState]    = useState<TabId>(isTabId(initialTab) ? initialTab : 'overview')
  const [data, setData]       = useState<Omit<CeoData, 'reload'> | null>(null)

  function setTab(id: TabId) {
    setTabState(id)
    const url = new URL(window.location.href)
    if (id === 'overview') url.searchParams.delete('tab')
    else url.searchParams.set('tab', id)
    window.history.replaceState(null, '', url.toString())
  }

  // 처음 한 번만 전체 스피너를 보여준다. 버튼을 눌러 다시 불러올 때는 데이터를 그대로 둔 채
  // 뒤에서 갱신한다 — 예전엔 매번 스피너로 바뀌면서 탭이 다시 마운트돼 검색어·기간·정렬이 전부 초기화됐다.
  const load = useCallback(async () => {
    const [inquiries, settlements, payouts, assignments, customers, estimateItems, estimates, expenses] = await Promise.all([
      db.list<Inquiry>('inquiries'),
      db.list<Settlement>('settlements'),
      db.list<Payout>('payouts', { order: 'created_at', asc: false }),
      db.list<Assignment>('assignments', { order: 'assigned_at', asc: false }),
      db.list<Customer>('customers'),
      db.list<EstimateItem>('estimate_items'),
      db.list<Estimate>('estimates'),
      // 010 마이그레이션 전이면 테이블이 없다 — 실패해도 빈 목록으로 넘어간다
      db.list<EventExpense>('event_expenses', { order: 'created_at', asc: false }).catch(() => []),
    ])
    setData({ inquiries, settlements, payouts, assignments, customers, estimateItems, estimates, expenses })
  }, [])

  useEffect(() => { load() }, [load])

  // 탭 배지 카운트
  function getBadge(id: TabId) {
    if (!data) return 0
    if (id === 'tax') {
      // settlements.tax_invoice_issued = false → 미발행
      return data.settlements.filter(s =>
        needsTaxInvoice(data.inquiries.find(q => q.id === s.inquiry_id)) && !s.tax_invoice_issued
      ).length
    }
    if (id === 'payment') {
      // 본사 인원 제외, 미지급(대기+검토완료) 건수
      return data.payouts.filter(p =>
        !(p.staff_name && HQ_STAFF_NAMES.has(p.staff_name)) &&
        !['지급완료', '완료'].includes(p.status)
      ).length
    }
    if (id === 'deposit') {
      return data.settlements.filter(s => s.deposit_status === '미입금').length
    }
    return 0
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    )
  }

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
                  <span className={`text-2xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
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
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {tab === 'overview'  && <OverviewTab   data={ceoData} />}
            {tab === 'tax'       && <TaxInvoiceTab data={ceoData} />}
            {tab === 'payment'   && <PaymentTab    data={ceoData} />}
            {tab === 'deposit'   && <DepositTab    data={ceoData} />}
            {tab === 'profit'    && <ProfitTab     data={ceoData} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
