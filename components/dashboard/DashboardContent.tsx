'use client'

import { useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/supabase/api'
import { formatKRW, formatNumber, STATUS_COLORS } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  TrendingUp, Users, FileText, AlertCircle, CheckCircle,
  Clock, ArrowRight, CalendarDays, Zap, Wallet, UserX,
  ChevronLeft, ChevronRight, BarChart2, Building2,
} from 'lucide-react'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Line,
} from 'recharts'
import type { Inquiry, Settlement, Assignment, Payout } from '@/lib/supabase/types'

// 파이프라인 전체 단계
const ALL_PIPELINE = [
  { status: '접수',    color: '#3B82F6' },
  { status: '견적',    color: '#8B5CF6' },
  { status: '체결',    color: '#6366F1' },
  { status: '배정완료', color: '#06B6D4' },
  { status: '진행중',  color: '#EAB308' },
  { status: '완료',    color: '#22C55E' },
  { status: '정산완료', color: '#10B981' },
]
const CHART_COLORS = ['#3B82F6', '#8B5CF6', '#22C55E', '#EAB308', '#EF4444', '#06B6D4', '#F97316', '#EC4899']

const TABS = [
  { id: 'overview',    label: '현황',     icon: BarChart2 },
  { id: 'calendar',   label: '캘린더',   icon: CalendarDays },
  { id: 'dispatch',   label: '파견분석', icon: Users },
  { id: 'clients',    label: '고객사현황', icon: Building2 },
] as const
type TabId = typeof TABS[number]['id']

// ── 유틸
function toYM(d: string) { return d.substring(0, 7) }
function dDay(dateStr: string) {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const d   = new Date(dateStr); d.setHours(0, 0, 0, 0)
  return Math.ceil((d.getTime() - now.getTime()) / 86400000)
}
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function DashboardContent() {
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  const [inquiries,   setInquiries]   = useState<Inquiry[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [payouts,     setPayouts]     = useState<Payout[]>([])
  const [staffCount,  setStaffCount]  = useState(0)
  const [customerCount, setCustomerCount] = useState(0)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    async function load() {
      const [inqs, setts, assigns, pays, staffIds, custIds] = await Promise.all([
        db.list<Inquiry>('inquiries', { order: 'event_start', asc: false }),
        db.list<Settlement>('settlements'),
        db.list<Assignment>('assignments', { order: 'assigned_at', asc: false }),
        db.list<Payout>('payouts', { order: 'created_at', asc: false }),
        db.list('staff', { select: 'id' }),
        db.list('customers', { select: 'id' }),
      ])
      setInquiries(inqs)
      setSettlements(setts)
      setAssignments(assigns)
      setPayouts(pays)
      setStaffCount(staffIds.length)
      setCustomerCount(custIds.length)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  // ── 공통 파생 데이터
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const todayStr    = now.toISOString().split('T')[0]
  const thisMonth   = toYM(todayStr)
  const in7Days     = new Date(now); in7Days.setDate(in7Days.getDate() + 7)

  const settlementMap  = new Map(settlements.map(s => [s.inquiry_id, s]))
  const assignCountMap = assignments.reduce<Map<string, number>>((m, a) => {
    if (a.inquiry_id) m.set(a.inquiry_id, (m.get(a.inquiry_id) || 0) + 1)
    return m
  }, new Map())

  // ── 실제 지급액 계산 (payouts.final_pay 우선, fallback: settlement.payout_amount)
  // 이관 데이터는 payouts 레코드가 없어 settlement.payout_amount도 0일 수 있음
  const payoutByInquiry = payouts.reduce<Map<string, number>>((m, p) => {
    if (p.inquiry_id) m.set(p.inquiry_id, (m.get(p.inquiry_id) || 0) + (p.final_pay || 0))
    return m
  }, new Map())

  function getActualPayout(inquiryId: string | undefined, settPayout: number): number {
    if (!inquiryId) return settPayout
    const fromPayouts = payoutByInquiry.get(inquiryId)
    // payouts 레코드가 존재하면 그 값 사용, 없으면 settlement 값 fallback
    return (fromPayouts !== undefined && fromPayouts > 0) ? fromPayouts : settPayout
  }

  // payouts 테이블에 실제 데이터가 있는지 여부
  const hasRealPayoutData = payouts.length > 0

  // 이번달 체결 매출 (event_start 기준)
  const thisMonthSetts = inquiries
    .filter(i => i.event_start && toYM(i.event_start) === thisMonth)
    .map(i => settlementMap.get(i.id)).filter(Boolean) as Settlement[]
  const monthlyRevenue = thisMonthSetts.reduce((s, r) => s + (r.supply_price || 0), 0)
  // 이번달 총청구액 (VAT 포함)
  const monthlyInvoice = thisMonthSetts.reduce((s, r) => s + (r.invoice_amount || r.supply_price + r.vat || 0), 0)
  // 이번달 수익: 공급가액 - 실제지급액(payouts 우선)
  const monthlyPayout  = thisMonthSetts.reduce((s, r) => s + getActualPayout(r.inquiry_id, r.payout_amount), 0)
  const monthlyProfit  = monthlyRevenue - monthlyPayout
  // 이번달 신규 문의 수 (created_at 기준)
  const monthlyNewInquiries = inquiries.filter(i => i.created_at?.startsWith(thisMonth)).length

  const unpaidAmount = settlements
    .filter(s => s.deposit_status !== '입금완료')
    .reduce((s, r) => s + (r.balance || 0), 0)

  const activeInquiries = inquiries.filter(i => ['접수','견적','체결','배정완료','진행중'].includes(i.status))

  // ── 2026년 연간 KPI (event_start 기준)
  const YEAR = String(now.getFullYear())
  const inqsYear  = inquiries.filter(i => i.event_start?.startsWith(YEAR))
  const settsYear  = inqsYear.map(i => settlementMap.get(i.id)).filter(Boolean) as Settlement[]
  const rev2026    = settsYear.reduce((s, r) => s + (r.supply_price || 0), 0)
  // 연간 지급액: payouts 우선, 없으면 settlement.payout_amount
  const payout2026 = settsYear.reduce((s, r) => s + getActualPayout(r.inquiry_id, r.payout_amount), 0)
  const profit2026 = rev2026 - payout2026
  // 체결율: 체결 이상 / 전체 문의
  const contractedStatuses = ['체결', '배정완료', '진행중', '완료', '정산완료']
  const contractRate = inquiries.length > 0
    ? Math.round((inquiries.filter(i => contractedStatuses.includes(i.status)).length / inquiries.length) * 100)
    : 0

  // 오늘 진행중 (체결 이상 + 날짜 기반)
  const happeningToday = inquiries.filter(i => {
    if (!i.event_start || ['접수','견적','미체결','보류','취소'].includes(i.status)) return false
    const s = i.event_start.substring(0, 10)
    const e = i.event_end   ? i.event_end.substring(0, 10) : s
    return s <= todayStr && todayStr <= e
  })

  // 이번주 준비 필요 (체결/배정완료 상태, 7일 이내, 아직 시작 안 한 것)
  const prepThisWeek = inquiries.filter(i => {
    if (!i.event_start) return false
    if (!['체결', '배정완료'].includes(i.status)) return false
    const s = new Date(i.event_start); s.setHours(0,0,0,0)
    return s > now && s <= in7Days
  })

  // 미배정 체결건
  const unassigned = inquiries.filter(i =>
    ['체결', '배정완료'].includes(i.status) && (assignCountMap.get(i.id) || 0) === 0
  )

  // 12개월 차트 (event_start 기준)
  const monthlyChart = Array.from({ length: 12 }, (_, i) => {
    const d   = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    const key = toYM(d.toISOString())
    const label = `${d.getMonth() + 1}월`
    const sInMonth = inquiries
      .filter(inq => inq.event_start && toYM(inq.event_start) === key)
      .map(inq => settlementMap.get(inq.id)).filter(Boolean) as Settlement[]
    const revenue   = sInMonth.reduce((s, r) => s + (r.supply_price || 0), 0)
    const payoutAmt = sInMonth.reduce((s, r) => s + getActualPayout(r.inquiry_id, r.payout_amount), 0)
    const profit    = revenue - payoutAmt
    // 지급액이 0이면 수익률 계산 제외 (이관 데이터 오염 방지)
    const hasData   = payoutAmt > 0
    return { label, revenue, profit, profitRate: (revenue > 0 && hasData) ? Math.round((profit / revenue) * 100) : 0 }
  })

  // 상태 분포
  const statusDist = Object.entries(
    inquiries.reduce<Record<string, number>>((a, i) => { a[i.status] = (a[i.status]||0)+1; return a }, {})
  ).map(([name, value]) => ({ name, value }))

  // 미수금 Top5
  const unpaidTop5 = [...settlements]
    .filter(s => s.deposit_status !== '입금완료' && (s.balance||0) > 0)
    .sort((a, b) => (b.balance||0) - (a.balance||0)).slice(0, 5)

  return (
    <div className="space-y-4">
      {/* 탭 헤더 */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all
                ${activeTab === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ══════════════ 탭 1: 현황 ══════════════ */}
      {activeTab === 'overview' && (
        <OverviewTab
          inquiries={inquiries}
          settlements={settlements}
          happeningToday={happeningToday}
          prepThisWeek={prepThisWeek}
          unassigned={unassigned}
          activeInquiries={activeInquiries}
          monthlyRevenue={monthlyRevenue}
          monthlyInvoice={monthlyInvoice}
          monthlyProfit={monthlyProfit}
          monthlyPayout={monthlyPayout}
          monthlySettCount={thisMonthSetts.length}
          monthlyNewInquiries={monthlyNewInquiries}
          unpaidAmount={unpaidAmount}
          unpaidTop5={unpaidTop5}
          staffCount={staffCount}
          customerCount={customerCount}
          monthlyChart={monthlyChart}
          statusDist={statusDist}
          assignCountMap={assignCountMap}
          todayStr={todayStr}
          year={YEAR}
          rev2026={rev2026}
          payout2026={payout2026}
          profit2026={profit2026}
          contractRate={contractRate}
          hasRealPayoutData={hasRealPayoutData}
          settsYearCount={settsYear.length}
        />
      )}

      {/* ══════════════ 탭 2: 캘린더 ══════════════ */}
      {activeTab === 'calendar' && (
        <CalendarTab inquiries={inquiries} />
      )}

      {/* ══════════════ 탭 3: 파견분석 ══════════════ */}
      {activeTab === 'dispatch' && (
        <AssignmentTab assignments={assignments} inquiries={inquiries} />
      )}

      {/* ══════════════ 탭 4: 고객사현황 ══════════════ */}
      {activeTab === 'clients' && (
        <ClientsTab inquiries={inquiries} settlements={settlements} payoutByInquiry={payoutByInquiry} />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════
// 탭 1: 현황
// ═══════════════════════════════════════════
function OverviewTab({
  inquiries, settlements, happeningToday, prepThisWeek, unassigned,
  activeInquiries, monthlyRevenue, monthlyInvoice, monthlyProfit, monthlyPayout,
  monthlySettCount, monthlyNewInquiries,
  unpaidAmount, unpaidTop5, staffCount, customerCount,
  monthlyChart, statusDist, assignCountMap, todayStr,
  year, rev2026, payout2026, profit2026, contractRate, hasRealPayoutData, settsYearCount,
}: {
  inquiries: Inquiry[]; settlements: Settlement[]
  happeningToday: Inquiry[]; prepThisWeek: Inquiry[]; unassigned: Inquiry[]
  activeInquiries: Inquiry[]; monthlyRevenue: number; monthlyInvoice: number
  monthlyProfit: number; monthlyPayout: number; monthlySettCount: number; monthlyNewInquiries: number
  unpaidAmount: number; unpaidTop5: Settlement[]; staffCount: number; customerCount: number
  monthlyChart: { label: string; revenue: number; profit: number; profitRate: number }[]
  statusDist: { name: string; value: number }[]
  assignCountMap: Map<string, number>; todayStr: string
  year: string; rev2026: number; payout2026: number; profit2026: number; contractRate: number
  hasRealPayoutData: boolean; settsYearCount: number
}) {
  const thisMonth = todayStr.substring(0, 7)
  const thisMonthCompleted = inquiries.filter(i =>
    ['완료','정산완료'].includes(i.status) && i.updated_at?.startsWith(thisMonth)
  ).length
  // 이번달 수익률 (payouts 데이터가 있어야 의미있는 수치)
  const monthlyProfitRate = monthlyRevenue > 0 && monthlyPayout > 0
    ? `수익률 ${Math.round((monthlyProfit / monthlyRevenue) * 100)}%`
    : monthlyRevenue > 0 ? '지급액 미입력' : '-'

  return (
    <div className="space-y-4">
      {/* 알림 배너 */}
      {(happeningToday.length > 0 || unassigned.length > 0 || prepThisWeek.length > 0) && (
        <div className="space-y-2">
          {happeningToday.length > 0 && (
            <AlertBanner color="yellow" icon={<Zap className="h-4 w-4 text-yellow-600" />}
              title={`오늘 진행 중인 행사 ${happeningToday.length}건`}>
              {happeningToday.map(inq => (
                <Link key={inq.id} href={`/inquiries/${inq.id}`}
                  className="text-xs bg-yellow-100 text-yellow-800 rounded-full px-2.5 py-0.5 hover:bg-yellow-200">
                  {inq.event_name || inq.company_name} [{inq.status}]
                </Link>
              ))}
            </AlertBanner>
          )}
          {prepThisWeek.length > 0 && (
            <AlertBanner color="blue" icon={<CalendarDays className="h-4 w-4 text-blue-600" />}
              title={`이번주 준비해야 할 행사 ${prepThisWeek.length}건 — 배정 · 견적 확인 필요`}>
              {prepThisWeek.map(inq => {
                const dd = dDay(inq.event_start!)
                return (
                  <Link key={inq.id} href={`/inquiries/${inq.id}`}
                    className="text-xs bg-blue-100 text-blue-800 rounded-full px-2.5 py-0.5 hover:bg-blue-200">
                    D-{dd} {inq.event_name || inq.company_name}
                  </Link>
                )
              })}
            </AlertBanner>
          )}
          {unassigned.length > 0 && (
            <AlertBanner color="red" icon={<UserX className="h-4 w-4 text-red-500" />}
              title={`인원 미배정 체결건 ${unassigned.length}건 — 인원 배정 페이지로 이동하세요`}>
              {unassigned.slice(0, 8).map(inq => (
                <Link key={inq.id} href="/assignments"
                  className="text-xs bg-red-100 text-red-700 rounded-full px-2.5 py-0.5 hover:bg-red-200">
                  {inq.event_name || inq.company_name}
                  {inq.event_start && <span className="ml-1 opacity-60">{inq.event_start.substring(5,10)}</span>}
                </Link>
              ))}
              {unassigned.length > 8 && <span className="text-xs text-red-400">+{unassigned.length-8}건</span>}
            </AlertBanner>
          )}
        </div>
      )}

      {/* ① 연간 KPI — 핵심 지표 (대형 강조 카드) */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-700 rounded-2xl p-5 shadow-lg">
        <p className="text-xs font-semibold text-slate-400 mb-4 tracking-wider uppercase">
          {year}년 연간 현황
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 연간 매출 */}
          <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
            <p className="text-xs text-slate-300 mb-1">{year}년 매출</p>
            <p className="text-2xl font-bold text-white leading-tight">{formatKRW(rev2026)}</p>
            <p className="text-[11px] text-slate-400 mt-1">체결 {settsYearCount}건 공급가액 합계</p>
          </div>
          {/* 영업이익 */}
          <div className="bg-emerald-500/20 rounded-xl p-4 border border-emerald-500/30">
            <p className="text-xs text-emerald-300 mb-1">영업이익</p>
            <p className="text-2xl font-bold text-emerald-200 leading-tight">{formatKRW(profit2026)}</p>
            <p className="text-[11px] text-emerald-400 mt-1">
              {rev2026 > 0 && payout2026 > 0
                ? `이익률 ${Math.round((profit2026 / rev2026) * 100)}%`
                : '지급관리 입력 후 정확'}
            </p>
          </div>
          {/* 총 지급액 */}
          <div className="bg-orange-500/20 rounded-xl p-4 border border-orange-500/30">
            <p className="text-xs text-orange-300 mb-1">총 지급액</p>
            <p className="text-2xl font-bold text-orange-200 leading-tight">{formatKRW(payout2026)}</p>
            <p className="text-[11px] text-orange-400 mt-1">
              {hasRealPayoutData ? '지급관리 확인 기준' : '* 지급관리 미입력'}
            </p>
          </div>
          {/* 체결율 */}
          <div className="bg-purple-500/20 rounded-xl p-4 border border-purple-500/30">
            <p className="text-xs text-purple-300 mb-1">문의 체결율</p>
            <p className="text-2xl font-bold text-purple-200 leading-tight">{contractRate}%</p>
            <p className="text-[11px] text-purple-400 mt-1">체결↑ / 전체 {inquiries.length}건</p>
          </div>
        </div>
      </div>

      {/* ② 보조 지표 (소형 카드 4개) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="총 체결건수" value={`${inquiries.filter(i => ['체결','배정완료','진행중','완료','정산완료'].includes(i.status)).length}건`} />
        <StatCard label="총 미수금 합계" value={formatKRW(unpaidAmount)} highlight="red" />
        <StatCard label="이번달 총청구액" value={formatKRW(monthlyInvoice)} sub="VAT 포함" />
        <StatCard label="이번달 매출" value={formatKRW(monthlyRevenue)} sub="공급가액" />
      </div>

      {/* 보조 통계 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="등록 직원" value={`${formatNumber(staffCount)}명`} />
        <StatCard label="등록 고객사" value={`${formatNumber(customerCount)}개`} />
        <StatCard label="이번달 완료" value={`${thisMonthCompleted}건`} />
        <StatCard label="입금 완료율"
          value={settlements.length > 0
            ? `${Math.round((settlements.filter(s=>s.deposit_status==='입금완료').length/settlements.length)*100)}%`
            : '-'} />
      </div>

      {/* 파이프라인 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-600" />
            진행 파이프라인
            <span className="text-xs font-normal text-gray-400">클릭 → 해당 문의 목록</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1.5 flex-wrap">
            {ALL_PIPELINE.map((stage, idx) => {
              const cnt = inquiries.filter(i=>i.status===stage.status).length
              return (
                <div key={stage.status} className="flex items-center gap-1.5 shrink-0">
                  <Link href={`/inquiries?status=${stage.status}`}>
                    <div className="rounded-xl px-4 py-3 text-center min-w-[78px] text-white cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg"
                      style={{ backgroundColor: stage.color }}>
                      <div className="text-2xl font-bold">{cnt}</div>
                      <div className="text-[11px] font-medium opacity-90 mt-0.5">{stage.status}</div>
                    </div>
                  </Link>
                  {idx < ALL_PIPELINE.length - 1 && <ArrowRight className="h-3 w-3 text-gray-300 shrink-0" />}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* 차트 2개 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">
              월별 매출 · 수익 추이
              <span className="text-xs font-normal text-gray-400 ml-2">행사 시작일 기준 12개월</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={210}>
              <ComposedChart data={monthlyChart} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="l" tickFormatter={v=>`${Math.round(v/10000)}만`} tick={{ fontSize: 10 }} width={42} />
                <YAxis yAxisId="r" orientation="right" tickFormatter={v=>`${v}%`} tick={{ fontSize: 10 }} width={32} />
                <Tooltip formatter={(v, n) => n==='수익률' ? [`${v}%`, n] : [formatKRW(Number(v)), n]} />
                <Bar yAxisId="l" dataKey="revenue" name="매출" fill="#3B82F6" radius={[3,3,0,0]} opacity={0.85} />
                <Bar yAxisId="l" dataKey="profit"  name="수익" fill="#22C55E" radius={[3,3,0,0]} opacity={0.85} />
                <Line yAxisId="r" type="monotone" dataKey="profitRate" name="수익률" stroke="#F97316" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">문의 상태 분포</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie data={statusDist} cx="50%" cy="50%" outerRadius={72} dataKey="value"
                  label={({ name, value }) => `${name} ${value}`} labelLine={false}>
                  {statusDist.map((_,i) => <Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 미수금 + 최근문의 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />미수금 현황
              <Link href="/settlements" className="ml-auto text-xs text-blue-600 font-normal hover:underline">전체보기</Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {unpaidTop5.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600 text-sm py-6 justify-center">
                <CheckCircle className="h-4 w-4" />미수금이 없습니다
              </div>
            ) : (
              <div className="space-y-2">
                {unpaidTop5.map(s => (
                  <div key={s.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.company_name || '-'}</p>
                      <p className="text-xs text-gray-400 truncate">{s.site_name || s.dispatch_period || '-'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-red-600">{formatKRW(s.balance || 0)}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${s.deposit_status==='부분입금' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>
                        {s.deposit_status}
                      </span>
                    </div>
                  </div>
                ))}
                <div className="border-t pt-2 flex justify-between text-xs text-gray-500 font-medium">
                  <span>총 미수금</span>
                  <span className="text-red-600 font-bold">{formatKRW(unpaidAmount)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-sm">최근 문의</CardTitle>
            <Link href="/inquiries" className="text-xs text-blue-600 hover:underline">전체보기</Link>
          </CardHeader>
          <CardContent className="p-0">
            <table className="erp-table">
              <thead><tr><th>업체명</th><th>행사명</th><th>상태</th><th>행사일</th><th>배정</th></tr></thead>
              <tbody>
                {inquiries.slice(0, 8).map(inq => {
                  const cnt = assignCountMap.get(inq.id) || 0
                  return (
                    <tr key={inq.id}>
                      <td className="font-medium text-xs">{inq.company_name || '-'}</td>
                      <td><Link href={`/inquiries/${inq.id}`} className="hover:text-blue-600 text-xs truncate block max-w-[110px]">{inq.event_name || '-'}</Link></td>
                      <td><span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLORS[inq.status]||'bg-gray-100 text-gray-500'}`}>{inq.status}</span></td>
                      <td className="text-gray-400 text-xs">{inq.event_start?.substring(0,10)||'-'}</td>
                      <td className="text-center text-xs">
                        {['체결','배정완료','진행중','완료'].includes(inq.status)
                          ? <span className={cnt===0?'text-red-500 font-semibold':'text-green-600'}>{cnt===0?'미배정':`${cnt}명`}</span>
                          : <span className="text-gray-300">-</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════
// 탭 2: 캘린더
// ═══════════════════════════════════════════
// 체결 이상 상태만 캘린더에 표시
const CONTRACTED_STATUSES = ['체결', '배정완료', '진행중', '완료', '정산완료']

function CalendarTab({ inquiries }: { inquiries: Inquiry[] }) {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-indexed

  const firstDay  = new Date(year, month, 1)
  const lastDay   = new Date(year, month + 1, 0)
  const startWDay = firstDay.getDay()   // 0=일
  const totalDays = lastDay.getDate()

  // 체결 이상 행사만 필터링
  const contractedInqs = inquiries.filter(inq => CONTRACTED_STATUSES.includes(inq.status))

  // 이 달의 행사
  const monthKey = `${year}-${String(month+1).padStart(2,'0')}`
  const monthInqs = contractedInqs.filter(inq => {
    if (!inq.event_start) return false
    const s = inq.event_start.substring(0,7)
    const e = inq.event_end   ? inq.event_end.substring(0,7) : s
    return s <= monthKey && monthKey <= e
  })

  // 날짜(1~31) → 행사 배열
  function getEventsOnDay(day: number): Inquiry[] {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    return monthInqs.filter(inq => {
      const s = inq.event_start?.substring(0,10) || ''
      const e = inq.event_end?.substring(0,10)   || s
      return s <= dateStr && dateStr <= e
    })
  }

  const prevMonth = () => { if (month===0){setMonth(11);setYear(y=>y-1)} else setMonth(m=>m-1) }
  const nextMonth = () => { if (month===11){setMonth(0);setYear(y=>y+1)} else setMonth(m=>m+1) }

  const todayStr = now.toISOString().split('T')[0]
  const todayDay = now.getFullYear()===year && now.getMonth()===month ? now.getDate() : -1

  // 달력 그리드 (빈 칸 포함)
  const cells: (number|null)[] = [
    ...Array(startWDay).fill(null),
    ...Array.from({ length: totalDays }, (_,i) => i+1),
  ]
  // 6행 맞추기
  while (cells.length % 7 !== 0) cells.push(null)

  const STATUS_DOT: Record<string, string> = {
    '체결': 'bg-indigo-400', '배정완료': 'bg-cyan-400', '진행중': 'bg-yellow-400',
    '완료': 'bg-green-400', '정산완료': 'bg-emerald-400', '견적': 'bg-purple-400', '접수': 'bg-blue-400',
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <button onClick={prevMonth} className="p-1.5 rounded hover:bg-gray-100"><ChevronLeft className="h-4 w-4" /></button>
            <CardTitle className="text-base">{year}년 {month+1}월</CardTitle>
            <button onClick={nextMonth} className="p-1.5 rounded hover:bg-gray-100"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </CardHeader>
        <CardContent>
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((d,i) => (
              <div key={d} className={`text-center text-xs font-semibold py-1.5
                ${i===0?'text-red-500':i===6?'text-blue-500':'text-gray-500'}`}>{d}</div>
            ))}
          </div>
          {/* 날짜 그리드 */}
          <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
            {cells.map((day, idx) => {
              const events = day ? getEventsOnDay(day) : []
              const isToday = day === todayDay
              const colIdx  = idx % 7
              return (
                <div key={idx}
                  className={`bg-white min-h-[80px] p-1.5 flex flex-col
                    ${!day ? 'bg-gray-50' : ''}
                    ${isToday ? 'ring-2 ring-inset ring-blue-500' : ''}`}>
                  {day && (
                    <>
                      <span className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full
                        ${isToday ? 'bg-blue-600 text-white' :
                          colIdx===0 ? 'text-red-500' :
                          colIdx===6 ? 'text-blue-500' : 'text-gray-700'}`}>
                        {day}
                      </span>
                      <div className="flex flex-col gap-0.5 flex-1">
                        {events.slice(0,3).map(inq => (
                          <Link key={inq.id} href={`/inquiries/${inq.id}`}>
                            <div className={`text-[10px] rounded px-1 py-0.5 leading-tight truncate text-white
                              ${STATUS_DOT[inq.status] || 'bg-gray-400'}`}>
                              {inq.event_name || inq.company_name || '-'}
                            </div>
                          </Link>
                        ))}
                        {events.length > 3 && (
                          <span className="text-[10px] text-gray-400">+{events.length-3}건</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* 이달 행사 목록 */}
      <Card>
        <CardHeader><CardTitle className="text-sm">{month+1}월 행사 목록 ({monthInqs.length}건)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="erp-table">
            <thead><tr><th>행사일</th><th>업체명</th><th>행사명</th><th>상태</th></tr></thead>
            <tbody>
              {monthInqs.length === 0
                ? <tr><td colSpan={4} className="text-center text-gray-400 py-8">이달 행사가 없습니다.</td></tr>
                : [...monthInqs]
                    .sort((a,b) => (a.event_start||'').localeCompare(b.event_start||''))
                    .map(inq => (
                      <tr key={inq.id}>
                        <td className="text-xs text-gray-500">
                          {inq.event_start?.substring(5,10)}
                          {inq.event_end && inq.event_end!==inq.event_start ? ` ~ ${inq.event_end.substring(5,10)}` : ''}
                        </td>
                        <td className="font-medium text-sm">{inq.company_name||'-'}</td>
                        <td><Link href={`/inquiries/${inq.id}`} className="hover:text-blue-600 text-sm">{inq.event_name||'-'}</Link></td>
                        <td><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[inq.status]||'bg-gray-100 text-gray-500'}`}>{inq.status}</span></td>
                      </tr>
                    ))
              }
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════
// 탭 3: 배정현황
// ═══════════════════════════════════════════
function AssignmentTab({ assignments, inquiries }: { assignments: Assignment[]; inquiries: Inquiry[] }) {
  // 직원별 투입 횟수
  const staffCnt = assignments.reduce<Record<string, number>>((m, a) => {
    const name = a.staff_name || '(미상)'
    m[name] = (m[name]||0) + 1; return m
  }, {})
  const staffRank = Object.entries(staffCnt)
    .sort((a,b) => b[1]-a[1]).slice(0,15)
    .map(([name, count]) => ({ name, count }))

  // 직종별 투입
  const jobCnt = assignments.reduce<Record<string, number>>((m, a) => {
    const job = a.job_type || '기타'
    m[job] = (m[job]||0) + 1; return m
  }, {})
  const jobDist = Object.entries(jobCnt)
    .sort((a,b) => b[1]-a[1]).slice(0,8)
    .map(([name, value]) => ({ name, value }))

  // 월별 투입 인원 — inquiry.event_start 기준 (이관 데이터 assigned_at 오염 방지)
  const now = new Date()
  const inqStartMap = new Map(inquiries.map(i => [i.id, i.event_start]))
  const monthlyAssigns = Array.from({ length: 12 }, (_, i) => {
    const d   = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    // 해당 월에 event_start가 있는 inquiry_id 집합
    const inqIds = new Set(
      inquiries.filter(inq => inq.event_start?.startsWith(key)).map(inq => inq.id)
    )
    return {
      label: `${d.getMonth()+1}월`,
      count: assignments.filter(a => a.inquiry_id && inqIds.has(a.inquiry_id)).length,
    }
  })

  const totalPayable = assignments.filter(a => a.is_payable !== false).length
  const totalFree    = assignments.filter(a => a.is_payable === false).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="전체 배정 건수" value={`${assignments.length}건`} />
        <StatCard label="유급 인원" value={`${totalPayable}명`} />
        <StatCard label="본사 인원" value={`${totalFree}명`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 직원 투입 랭킹 */}
        <Card>
          <CardHeader><CardTitle className="text-sm">직원별 투입 횟수 Top 15</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={staffRank} layout="vertical" margin={{ left: 60, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={60} />
                <Tooltip />
                <Bar dataKey="count" name="투입 횟수" fill="#3B82F6" radius={[0,3,3,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* 직종별 분포 */}
          <Card>
            <CardHeader><CardTitle className="text-sm">직종별 투입 분포</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={jobDist} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={28} />
                  <Tooltip />
                  <Bar dataKey="value" name="투입 수" fill="#8B5CF6" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 월별 투입 추이 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                월별 파견 인원 추이 (12개월)
                <span className="text-xs font-normal text-gray-400 ml-1">행사 시작일 기준</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={monthlyAssigns} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} width={28} />
                  <Tooltip />
                  <Bar dataKey="count" name="파견 인원" fill="#06B6D4" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════
// 탭 4: 고객사현황
// ═══════════════════════════════════════════
function ClientsTab({ inquiries, settlements, payoutByInquiry }: {
  inquiries: Inquiry[]; settlements: Settlement[]
  payoutByInquiry: Map<string, number>
}) {
  // 고객사별 문의 건수
  const cntMap = inquiries.reduce<Record<string, number>>((m, i) => {
    const name = i.company_name || '(미상)'
    m[name] = (m[name]||0)+1; return m
  }, {})
  const cntRank = Object.entries(cntMap).sort((a,b)=>b[1]-a[1]).slice(0,10)
    .map(([name, count]) => ({ name, count }))

  // 고객사별 매출
  const revMap = settlements.reduce<Record<string, number>>((m, s) => {
    const name = s.company_name || '(미상)'
    m[name] = (m[name]||0) + (s.supply_price||0); return m
  }, {})
  const revRank = Object.entries(revMap).sort((a,b)=>b[1]-a[1]).slice(0,10)
    .map(([name, value]) => ({ name, value }))

  // 고객사별 수익 (payouts 우선 사용)
  const profitMap = settlements.reduce<Record<string, number>>((m, s) => {
    const name      = s.company_name || '(미상)'
    const actualPay = payoutByInquiry.get(s.inquiry_id || '')
    const payout    = (actualPay !== undefined && actualPay > 0) ? actualPay : s.payout_amount
    m[name] = (m[name] || 0) + (s.supply_price - payout)
    return m
  }, {})

  // 종합 테이블
  const allClients = [...new Set([...Object.keys(cntMap), ...Object.keys(revMap)])]
    .map(name => ({
      name,
      count:  cntMap[name]    || 0,
      rev:    revMap[name]    || 0,
      profit: profitMap[name] || 0,
      rate:   revMap[name]   > 0 ? Math.round(((profitMap[name]||0)/revMap[name])*100) : 0,
    }))
    .sort((a,b) => b.rev - a.rev).slice(0, 20)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 매출 Top 10 */}
        <Card>
          <CardHeader><CardTitle className="text-sm">고객사별 매출 Top 10</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={revRank} layout="vertical" margin={{ left: 80, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tickFormatter={v=>`${Math.round(v/10000)}만`} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                <Tooltip formatter={v => formatKRW(Number(v))} />
                <Bar dataKey="value" name="매출" fill="#3B82F6" radius={[0,3,3,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 문의 건수 Top 10 */}
        <Card>
          <CardHeader><CardTitle className="text-sm">고객사별 문의 건수 Top 10</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={cntRank} layout="vertical" margin={{ left: 80, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                <Tooltip />
                <Bar dataKey="count" name="건수" fill="#8B5CF6" radius={[0,3,3,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* 종합 테이블 */}
      <Card>
        <CardHeader><CardTitle className="text-sm">고객사 종합 현황 Top 20</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="erp-table">
            <thead>
              <tr>
                <th>고객사</th>
                <th className="text-right">문의 건수</th>
                <th className="text-right">총 매출</th>
                <th className="text-right">수익</th>
                <th className="text-right">수익률</th>
              </tr>
            </thead>
            <tbody>
              {allClients.map((c, i) => (
                <tr key={c.name}>
                  <td className="font-medium text-sm">
                    <span className="text-gray-400 text-xs mr-1">{i+1}.</span>
                    {c.name}
                  </td>
                  <td className="text-right text-sm">{c.count}건</td>
                  <td className="text-right text-sm font-semibold">{formatKRW(c.rev)}</td>
                  <td className="text-right text-sm text-blue-600">{formatKRW(c.profit)}</td>
                  <td className={`text-right text-sm font-bold ${c.rate>=20?'text-green-600':c.rate>=10?'text-blue-600':c.rate>=0?'text-orange-500':'text-red-500'}`}>
                    {c.rate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

// ── 공통 서브 컴포넌트 ──
function AlertBanner({ color, icon, title, children }: {
  color: 'yellow'|'blue'|'red'; icon: React.ReactNode; title: string; children: React.ReactNode
}) {
  const cls = {
    yellow: 'bg-yellow-50 border-yellow-300',
    blue:   'bg-blue-50 border-blue-200',
    red:    'bg-red-50 border-red-200',
  }
  return (
    <div className={`border rounded-xl px-4 py-3 flex items-start gap-3 ${cls[color]}`}>
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-800 mb-1">{title}</p>
        <div className="flex flex-wrap gap-1.5">{children}</div>
      </div>
    </div>
  )
}

function KPICard({ title, sub, value, badge, color, icon }: {
  title: string; sub?: string; value: string; badge?: string
  color: 'blue'|'purple'|'red'|'green'; icon: React.ReactNode
}) {
  const g = { blue:'from-blue-600 to-blue-500', purple:'from-purple-600 to-purple-500',
               red:'from-red-500 to-orange-400', green:'from-green-600 to-emerald-500' }
  return (
    <div className={`rounded-xl p-5 text-white bg-gradient-to-br ${g[color]} shadow-sm`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium opacity-90">{title}</span>
        <div className="opacity-70">{icon}</div>
      </div>
      <div className="text-2xl font-bold leading-tight">{value}</div>
      <div className="flex items-center justify-between mt-1">
        {sub && <p className="text-xs opacity-70">{sub}</p>}
        {badge && <span className="text-xs bg-white/20 rounded-full px-2 py-0.5">{badge}</span>}
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, highlight }: {
  label: string; value: string; sub?: string; highlight?: 'red' | 'blue'
}) {
  const valColor = highlight === 'red' ? 'text-red-600' : highlight === 'blue' ? 'text-blue-700' : 'text-gray-900'
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className={`text-xl font-bold mt-1 ${valColor}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function AnnualCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string
  color: 'blue' | 'green' | 'orange' | 'purple'
}) {
  const border = {
    blue:   'border-blue-200 text-blue-700',
    green:  'border-green-200 text-green-700',
    orange: 'border-orange-200 text-orange-700',
    purple: 'border-purple-200 text-purple-700',
  }
  const bg = {
    blue:   'bg-blue-50',
    green:  'bg-green-50',
    orange: 'bg-orange-50',
    purple: 'bg-purple-50',
  }
  return (
    <div className={`rounded-xl border p-4 ${bg[color]} ${border[color]}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
      {sub && <p className="text-[10px] mt-0.5 opacity-60">{sub}</p>}
    </div>
  )
}
