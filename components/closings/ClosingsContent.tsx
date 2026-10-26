'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { db } from '@/lib/supabase/api'
import { formatKRW } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Search, Edit2, Receipt, CheckCircle, AlertCircle, Clock, Copy,
} from 'lucide-react'
import type { Settlement, Inquiry, Customer } from '@/lib/supabase/types'
import ClosingForm from './ClosingForm'
import Link from 'next/link'
import { needsTaxInvoice } from '@/lib/finance'

type SettRow = Settlement & { inquiries?: Inquiry }
type TabKey = 'not_issued' | 'issued' | 'all'
type SortKey = '최신순' | '행사일순' | '경과일순' | '처리순'

// 행사 종료일 기준 경과일 — CEO 세금계산서 탭과 같은 계산
function elapsedDays(dateStr?: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - d.getTime()) / 86400000)
}
function ElapsedBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="text-gray-300 text-xs">-</span>
  const text = days < 0 ? `D-${Math.abs(days)}` : days === 0 ? '오늘' : `D+${days}`
  const cls = days < 0 ? 'bg-blue-50 text-blue-600' : days === 0 ? 'bg-gray-100 text-gray-600'
    : days <= 14 ? 'bg-yellow-100 text-yellow-700' : days <= 30 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
  return <span className={`text-xs px-1.5 py-0.5 rounded font-semibold whitespace-nowrap ${cls}`}>{text}</span>
}
// 발행완료 처리 시각 (UTC → 한국시간)
function formatIssuedAt(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d)
  const get = (t: string) => parts.find(x => x.type === t)?.value || ''
  return `${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}

export default function ClosingsContent() {
  const [settlements, setSettlements] = useState<SettRow[]>([])
  const [customers, setCustomers]     = useState<Customer[]>([])
  const [loading, setLoading]         = useState(true)
  const [searchText, setSearchText]   = useState('')
  const [activeTab, setActiveTab]     = useState<TabKey>('not_issued')
  const [sortKey, setSortKey]         = useState<SortKey>('최신순')

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

  // '미발행'은 체결 이후 건만 센다 — 취소·보류된 문의의 정산까지 미발행으로 세면
  // CEO 세금계산서 탭(같은 기준으로 거른다)과 건수가 달라진다
  const unissuedRows = settlements.filter(s => !s.tax_invoice_issued && needsTaxInvoice(s.inquiries))

  // 탭 필터
  const filtered = settlements.filter(s => {
    const matchSearch = !searchText ||
      [s.company_name, s.corp_name, s.inquiries?.event_name, s.biz_number]
        .some(v => v?.toLowerCase().includes(searchText.toLowerCase()))

    if (activeTab === 'not_issued') return matchSearch && !s.tax_invoice_issued && needsTaxInvoice(s.inquiries)
    if (activeTab === 'issued')     return matchSearch && !!s.tax_invoice_issued
    return matchSearch
  }).sort((a, b) => {
    if (sortKey === '행사일순') return (a.inquiries?.event_start || '9999').localeCompare(b.inquiries?.event_start || '9999')
    if (sortKey === '경과일순') {
      const ad = elapsedDays(a.inquiries?.event_end || a.inquiries?.event_start) ?? -9999
      const bd = elapsedDays(b.inquiries?.event_end || b.inquiries?.event_start) ?? -9999
      return bd - ad
    }
    if (sortKey === '처리순') return (b.tax_invoice_issued_at || '').localeCompare(a.tax_invoice_issued_at || '')
    return 0  // 최신순: 불러온 순서(created_at 내림차순)
  })

  // KPI
  const notIssued  = unissuedRows.length
  const issued     = settlements.filter(s =>  s.tax_invoice_issued).length
  const totalAmt   = settlements.reduce((a, s) => a + (s.invoice_amount || 0), 0)
  const receivedAmt = settlements.reduce((a, s) => a + (s.received_amount || 0), 0)

  const TABS = [
    { key: 'not_issued' as TabKey, label: '세금계산서 미발행', icon: <AlertCircle className="h-4 w-4" />, count: notIssued },
    { key: 'issued'     as TabKey, label: '발행 완료',          icon: <CheckCircle  className="h-4 w-4" />, count: issued },
    { key: 'all'        as TabKey, label: '전체',               icon: <Receipt      className="h-4 w-4" />, count: settlements.length },
  ]

  async function copyBizNumber(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`사업자번호 복사됨: ${value}`)
    } catch {
      toast.error('복사에 실패했습니다. 직접 선택해서 복사해 주세요.')
    }
  }

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

      {/* 정렬 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-gray-500 font-bold shrink-0">정렬:</span>
        {(['최신순', '행사일순', '경과일순', ...(activeTab === 'not_issued' ? [] : ['처리순' as const])] as SortKey[]).map(s => (
          <button key={s} onClick={() => setSortKey(s)}
            title={s === '경과일순' ? '행사가 끝난 지 오래된 건부터 — 발행이 급한 순서' : s === '처리순' ? '발행완료를 누른 시각 순' : undefined}
            className={`text-xs px-3 py-1.5 rounded-full border-2 font-semibold transition-colors ${sortKey === s ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-600'}`}>
            {s}
          </button>
        ))}
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); if (tab.key === 'not_issued' && sortKey === '처리순') setSortKey('최신순') }}
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
                    <th>행사일</th>
                    <th>경과</th>
                    <th>사업자번호</th>
                    <th>대표자</th>
                    <th>메모 (입금·발행)</th>
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
                      <td colSpan={13}><div className="erp-empty"><p>데이터가 없습니다.</p></div></td>
                    </tr>
                  ) : filtered.map(s => (
                    <tr key={s.id} className={`transition-colors ${s.tax_invoice_issued ? 'hover:bg-gray-50' : 'hover:bg-red-50'}`}>
                      <td className="font-medium">{s.company_name || s.corp_name || '-'}</td>
                      <td className="text-sm text-gray-600">
                        {s.inquiries?.id
                          ? <Link href={`/inquiries/${s.inquiries.id}`} className="hover:text-blue-700 hover:underline" title="문의 상세로">{s.inquiries.event_name || s.site_name || '-'}</Link>
                          : (s.inquiries?.event_name || s.site_name || '-')}
                        {s.inquiries?.status && !needsTaxInvoice(s.inquiries) && (
                          <span className="ml-1 text-2xs text-gray-400 bg-gray-100 px-1 rounded" title="체결 이후 상태가 아니라 미발행 집계에서 빠집니다">{s.inquiries.status}</span>
                        )}
                      </td>
                      <td className="text-xs text-gray-600 whitespace-nowrap">{s.inquiries?.event_start?.slice(0, 10) || <span className="text-gray-300">-</span>}</td>
                      <td><ElapsedBadge days={elapsedDays(s.inquiries?.event_end || s.inquiries?.event_start)} /></td>
                      <td className="font-mono text-sm">
                        {s.biz_number
                          ? <button
                              type="button"
                              onClick={() => copyBizNumber(s.biz_number!)}
                              title="클릭하면 복사됩니다"
                              className="inline-flex items-center gap-1 hover:text-blue-600"
                            >
                              {s.biz_number}<Copy className="h-3 w-3 text-gray-400" />
                            </button>
                          : <span className="text-gray-300 text-xs italic">미입력</span>}
                      </td>
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
                          ? <div className="whitespace-nowrap">
                              <span className="text-xs text-green-600 font-semibold flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" />발행완료
                                {s.tax_invoice_group && (
                                  <Link
                                    href={`/ceo?tab=tax&group=${encodeURIComponent(s.tax_invoice_group)}`}
                                    className="ml-1 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-1 py-0.5 rounded"
                                    title={`묶음 ${s.tax_invoice_group} — 누르면 같이 발행된 건을 모아 봅니다`}>
                                    합산
                                  </Link>
                                )}
                              </span>
                              {formatIssuedAt(s.tax_invoice_issued_at) && (
                                <span className="text-2xs text-gray-400" title="발행완료 처리 시각">🕒 {formatIssuedAt(s.tax_invoice_issued_at)}</span>
                              )}
                            </div>
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
