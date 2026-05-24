'use client'

import { useState, useCallback } from 'react'
import { db } from '@/lib/supabase/api'
import { STATUS_COLORS, formatKRW } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, MessageSquare, FileText, Users, Building2, UserCheck, CreditCard } from 'lucide-react'
import Link from 'next/link'
import type { Inquiry, Staff, Customer, Estimate, Assignment, Settlement } from '@/lib/supabase/types'

interface SearchResults {
  inquiries: Inquiry[]
  staff: Staff[]
  customers: Customer[]
  estimates: Estimate[]
  assignments: Assignment[]
  settlements: Settlement[]
}

const ICONS = {
  inquiries: MessageSquare,
  staff: Users,
  customers: Building2,
  estimates: FileText,
  assignments: UserCheck,
  settlements: CreditCard,
}

const LABELS = {
  inquiries: '문의',
  staff: '직원',
  customers: '고객사',
  estimates: '견적',
  assignments: '배정',
  settlements: '정산',
}

const HREFS: Record<string, (id: string) => string> = {
  inquiries: (id) => `/inquiries/${id}`,
  staff: (id) => `/staff`,
  customers: (id) => `/customers`,
  estimates: (id) => `/estimates`,
  assignments: (id) => `/contracts`,
  settlements: (id) => `/settlements`,
}

export default function SearchContent() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return

    setLoading(true)
    const q = query.trim()

    const [inqs, staff, custs, ests, asgns, setts] = await Promise.all([
      db.list<Inquiry>('inquiries', {
        or: `event_name.ilike.%${q}%,company_name.ilike.%${q}%,contact_name.ilike.%${q}%`,
        limit: 10,
      }),
      db.list<Staff>('staff', {
        or: `name.ilike.%${q}%,phone.ilike.%${q}%,region.ilike.%${q}%`,
        limit: 10,
      }),
      db.list<Customer>('customers', {
        or: `company_name.ilike.%${q}%,contact_name.ilike.%${q}%,phone.ilike.%${q}%,biz_number.ilike.%${q}%`,
        limit: 10,
      }),
      db.list<Estimate>('estimates', {
        or: `event_name.ilike.%${q}%,company_name.ilike.%${q}%`,
        limit: 10,
      }),
      db.list<Assignment>('assignments', {
        or: `staff_name.ilike.%${q}%,event_name.ilike.%${q}%,job_type.ilike.%${q}%`,
        limit: 10,
      }),
      db.list<Settlement>('settlements', {
        or: `company_name.ilike.%${q}%,site_name.ilike.%${q}%`,
        limit: 10,
      }),
    ])

    setResults({
      inquiries: inqs,
      staff,
      customers: custs,
      estimates: ests,
      assignments: asgns,
      settlements: setts,
    })
    setSearched(true)
    setLoading(false)
  }, [query])

  const totalCount = results
    ? Object.values(results).reduce((sum, arr) => sum + arr.length, 0)
    : 0

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 검색창 */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            placeholder="업체명, 행사명, 직원명, 연락처 등 검색..."
            className="pl-12 h-12 text-base rounded-xl"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <Button onClick={handleSearch} disabled={loading} className="h-12 px-6" size="lg">
          {loading ? '검색 중...' : '검색'}
        </Button>
      </div>

      {/* 검색 결과 요약 */}
      {searched && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Search className="h-4 w-4" />
          <span>
            <strong>"{query}"</strong> 검색 결과: 총 <strong>{totalCount}건</strong>
          </span>
        </div>
      )}

      {/* 결과 */}
      {results && (
        <div className="space-y-4">
          {/* 문의 */}
          {results.inquiries.length > 0 && (
            <ResultSection
              label="문의"
              icon={MessageSquare}
              count={results.inquiries.length}
            >
              {results.inquiries.map(inq => (
                <Link key={inq.id} href={`/inquiries`}>
                  <div className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
                    <div>
                      <p className="font-medium text-sm">{inq.event_name}</p>
                      <p className="text-xs text-gray-500">{inq.company_name} · {inq.event_start?.slice(0, 10)}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[inq.status] || 'bg-gray-100 text-gray-600'}`}>
                      {inq.status}
                    </span>
                  </div>
                </Link>
              ))}
            </ResultSection>
          )}

          {/* 직원 */}
          {results.staff.length > 0 && (
            <ResultSection label="직원" icon={Users} count={results.staff.length}>
              {results.staff.map(s => (
                <Link key={s.id} href="/staff">
                  <div className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-bold shrink-0">
                      {s.name[0]}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{s.name}</p>
                      <p className="text-xs text-gray-500">
                        {s.region} · {s.phone} · {s.recommend}
                      </p>
                    </div>
                    <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                      s.recommend === '우선투입' ? 'bg-green-100 text-green-700' :
                      s.recommend === '보류' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {s.recommend}
                    </span>
                  </div>
                </Link>
              ))}
            </ResultSection>
          )}

          {/* 고객사 */}
          {results.customers.length > 0 && (
            <ResultSection label="고객사" icon={Building2} count={results.customers.length}>
              {results.customers.map(c => (
                <Link key={c.id} href="/customers">
                  <div className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
                    <div>
                      <p className="font-medium text-sm">{c.company_name}</p>
                      <p className="text-xs text-gray-500">
                        {c.contact_name} · {c.phone} · {c.biz_number || '사업자번호 없음'}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      c.customer_type === '법인' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                    }`}>
                      {c.customer_type}
                    </span>
                  </div>
                </Link>
              ))}
            </ResultSection>
          )}

          {/* 견적 */}
          {results.estimates.length > 0 && (
            <ResultSection label="견적" icon={FileText} count={results.estimates.length}>
              {results.estimates.map(e => (
                <Link key={e.id} href="/estimates">
                  <div className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
                    <div>
                      <p className="font-medium text-sm">{e.event_name || '-'}</p>
                      <p className="text-xs text-gray-500">{e.company_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-blue-700">{formatKRW(e.supply_price)}</p>
                      <p className="text-xs text-gray-400">{e.send_status || '미발송'}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </ResultSection>
          )}

          {/* 배정 */}
          {results.assignments.length > 0 && (
            <ResultSection label="배정" icon={UserCheck} count={results.assignments.length}>
              {results.assignments.map(a => (
                <Link key={a.id} href="/contracts">
                  <div className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
                    <div>
                      <p className="font-medium text-sm">{a.staff_name}</p>
                      <p className="text-xs text-gray-500">{a.event_name} · {a.job_type}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[a.status] || 'bg-gray-100 text-gray-600'}`}>
                      {a.status}
                    </span>
                  </div>
                </Link>
              ))}
            </ResultSection>
          )}

          {/* 정산 */}
          {results.settlements.length > 0 && (
            <ResultSection label="정산" icon={CreditCard} count={results.settlements.length}>
              {results.settlements.map(s => (
                <Link key={s.id} href="/settlements">
                  <div className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
                    <div>
                      <p className="font-medium text-sm">{s.company_name} · {s.site_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatKRW(s.supply_price)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[s.deposit_status] || 'bg-gray-100 text-gray-600'}`}>
                        {s.deposit_status}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </ResultSection>
          )}

          {searched && totalCount === 0 && (
            <div className="text-center py-16 text-gray-400">
              <Search className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">검색 결과가 없습니다</p>
              <p className="text-sm mt-1">다른 검색어를 사용해보세요.</p>
            </div>
          )}
        </div>
      )}

      {/* 초기 상태 */}
      {!searched && (
        <div className="text-center py-20 text-gray-400">
          <Search className="h-14 w-14 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium text-gray-500">통합 검색</p>
          <p className="text-sm mt-1">업체명, 행사명, 직원명, 연락처 등을 입력하세요</p>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {['삼성', '김민준', '010', '행사도우미', '서울'].map(kw => (
              <button
                key={kw}
                onClick={() => { setQuery(kw); }}
                className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full hover:bg-gray-200 transition-colors"
              >
                {kw}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ResultSection({
  label, icon: Icon, count, children
}: {
  label: string
  icon: React.ElementType
  count: number
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="py-3 px-4 border-b border-gray-100">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="h-4 w-4 text-blue-600" />
          {label}
          <span className="ml-auto text-xs font-normal text-gray-500">{count}건</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2">
        {children}
      </CardContent>
    </Card>
  )
}
