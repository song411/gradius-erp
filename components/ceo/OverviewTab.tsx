'use client'

import { useState } from 'react'
import { formatKRW } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { Activity } from 'lucide-react'
import type { CeoData } from './CeoContent'

export default function OverviewTab({ data }: { data: CeoData }) {
  const { inquiries, settlements, payouts } = data
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  const availableYears = [
    new Date().getFullYear(),
    new Date().getFullYear() - 1,
    new Date().getFullYear() - 2,
  ]

  // inquiry당 settlement 중복 제거 (inquiry_id별 첫 번째 레코드만 사용)
  // → 동일 inquiry에 settlement가 2건 이상일 때 이중 집계 방지
  const dedupedSettlements = Array.from(
    settlements.reduce<Map<string, typeof settlements[0]>>((m, s) => {
      if (s.inquiry_id && !m.has(s.inquiry_id)) m.set(s.inquiry_id, s)
      return m
    }, new Map()).values()
  )

  // inquiry.event_start 기준 월별 데이터 (행사 시작월에만 집계, 이중 잡힘 방지)
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const month = String(i + 1).padStart(2, '0')
    const key   = `${selectedYear}-${month}`

    const monthInqs   = inquiries.filter(q => q.event_start?.startsWith(key))
    const monthInqIds = new Set(monthInqs.map(q => q.id))

    // deduped settlement 사용
    const monthSets = dedupedSettlements.filter(s => s.inquiry_id && monthInqIds.has(s.inquiry_id))
    const revenue   = monthSets.reduce((s, r) => s + (r.supply_price || 0), 0)

    const monthPays = payouts.filter(p =>
      p.inquiry_id && monthInqIds.has(p.inquiry_id) &&
      (p.status === '지급완료' || p.status === '완료')
    )
    const payout = monthPays.reduce((s, p) => s + (p.final_pay || 0), 0)
    const profit = revenue - payout

    const inqCount  = monthInqs.length
    const completed = monthInqs.filter(q => ['완료', '정산완료'].includes(q.status)).length

    return {
      month: `${i + 1}월`,
      revenue, payout, profit,
      inquiryCount: inqCount,
      completedCount: completed,
      profitRate: revenue > 0 ? Math.round((profit / revenue) * 100) : 0,
    }
  })

  // 연간 집계 (동일한 deduped 기준)
  const yearInqs   = inquiries.filter(q => q.event_start?.startsWith(String(selectedYear)))
  const yearInqIds = new Set(yearInqs.map(q => q.id))
  const yearSets   = dedupedSettlements.filter(s => s.inquiry_id && yearInqIds.has(s.inquiry_id))
  const yearRevenue  = yearSets.reduce((s, r) => s + (r.supply_price || 0), 0)
  const yearPayouts  = payouts.filter(p => p.inquiry_id && yearInqIds.has(p.inquiry_id) && (p.status === '지급완료' || p.status === '완료'))
  const yearPayout   = yearPayouts.reduce((s, p) => s + (p.final_pay || 0), 0)
  const yearProfit   = yearRevenue - yearPayout
  const yearReceived = yearSets.reduce((s, r) => s + (r.received_amount || 0), 0)
  const yearUnpaid   = yearSets.reduce((s, r) => s + (r.balance || 0), 0)
  const yearProfitRate = yearRevenue > 0 ? Math.round((yearProfit / yearRevenue) * 100) : 0
  const yearContracted = yearInqs.filter(q => !['접수', '견적', '미체결', '보류', '취소'].includes(q.status)).length
  const completionRate = yearInqs.length > 0 ? Math.round((yearContracted / yearInqs.length) * 100) : 0

  // 고객사별 누적 매출 Top10 (deduped 기준)
  const clientRevenue = Object.entries(
    dedupedSettlements.reduce<Record<string, number>>((acc, s) => {
      const name = s.company_name || '미정'
      acc[name] = (acc[name] || 0) + (s.supply_price || 0)
      return acc
    }, {})
  ).sort(([, a], [, b]) => b - a).slice(0, 10).map(([name, value]) => ({ name, value }))

  const depositStats = [
    { name: '입금완료', value: settlements.filter(s => s.deposit_status === '입금완료').length, fill: '#22C55E' },
    { name: '부분입금', value: settlements.filter(s => s.deposit_status === '부분입금').length, fill: '#EAB308' },
    { name: '미입금',   value: settlements.filter(s => s.deposit_status === '미입금').length,   fill: '#EF4444' },
  ]

  return (
    <div className="space-y-6">
      {/* 연도 선택 */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-700">기준 연도:</span>
        <Select value={String(selectedYear)} onChange={e => setSelectedYear(Number(e.target.value))} className="w-28">
          {availableYears.map(y => <option key={y} value={y}>{y}년</option>)}
        </Select>
      </div>

      {/* 연간 KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPIBox label="연매출" value={formatKRW(yearRevenue)} icon="💰" color="blue" />
        <KPIBox label="매출총이익" value={formatKRW(yearProfit)} icon="📈" color="green" />
        <KPIBox label="수익률" value={`${yearProfitRate}%`} icon="🎯" color="purple" />
        <KPIBox label="수금액" value={formatKRW(yearReceived)} icon="✅" color="cyan" />
        <KPIBox label="미수금" value={formatKRW(yearUnpaid)} icon="⚠️" color="red" />
        <KPIBox label="체결율" value={`${completionRate}%`} icon="🏆" color="orange" />
      </div>

      {/* 월별 매출/수익 추이 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-600" />
            {selectedYear}년 월별 매출/수익 추이 (행사일 기준)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={monthlyData} margin={{ top: 5, right: 5, bottom: 5, left: 10 }}>
              <defs>
                <linearGradient id="revGradCeo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="profGradCeo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22C55E" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={v => `${Math.round(v / 10000)}만`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatKRW(Number(v))} />
              <Legend />
              <Area type="monotone" dataKey="revenue" name="매출" stroke="#3B82F6" fill="url(#revGradCeo)" strokeWidth={2} />
              <Area type="monotone" dataKey="profit"  name="수익" stroke="#22C55E" fill="url(#profGradCeo)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 월별 수익률 */}
        <Card>
          <CardHeader><CardTitle>월별 수익률 (%)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Bar dataKey="profitRate" name="수익률" radius={[4, 4, 0, 0]}>
                  {monthlyData.map((e, idx) => (
                    <Cell key={idx} fill={e.profitRate >= 20 ? '#22C55E' : e.profitRate >= 10 ? '#EAB308' : '#EF4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 고객사별 매출 TOP 10 */}
        <Card>
          <CardHeader><CardTitle>고객사별 누적 매출 TOP 10</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={clientRevenue} layout="vertical" margin={{ top: 5, right: 40, bottom: 5, left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis type="number" tickFormatter={v => `${Math.round(v / 10000)}만`} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={70} />
                <Tooltip formatter={(v) => formatKRW(Number(v))} />
                <Bar dataKey="value" name="매출" fill="#3B82F6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 월별 문의 건수 */}
        <Card>
          <CardHeader><CardTitle>월별 문의 건수</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthlyData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="inquiryCount"  name="신규 문의" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="completedCount" name="완료"    stroke="#22C55E" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 입금 현황 */}
        <Card>
          <CardHeader><CardTitle>전체 입금 현황</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie data={depositStats} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                    {depositStats.map((s, i) => <Cell key={i} fill={s.fill} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                {depositStats.map(s => (
                  <div key={s.name} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.fill }} />
                    <span className="text-sm text-gray-600">{s.name}</span>
                    <span className="text-sm font-bold">{s.value}건</span>
                    <span className="text-xs text-gray-400">
                      ({settlements.length > 0 ? Math.round((s.value / settlements.length) * 100) : 0}%)
                    </span>
                  </div>
                ))}
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500">총 {settlements.length}건</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 월별 상세 테이블 */}
      <Card>
        <CardHeader><CardTitle>{selectedYear}년 월별 상세 현황</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>월</th><th>매출</th><th>수익</th><th>수익률</th>
                  <th>지급액</th><th>문의수</th><th>완료수</th>
                </tr>
              </thead>
              <tbody>
                {monthlyData.map((row, i) => (
                  <tr key={i} className={row.revenue > 0 ? '' : 'opacity-40'}>
                    <td className="font-medium">{row.month}</td>
                    <td>{row.revenue > 0 ? formatKRW(row.revenue) : '-'}</td>
                    <td className={`font-semibold ${row.profit > 0 ? 'text-green-700' : ''}`}>
                      {row.profit > 0 ? formatKRW(row.profit) : '-'}
                    </td>
                    <td>
                      {row.profitRate > 0 && (
                        <span className={`text-sm font-semibold ${row.profitRate >= 20 ? 'text-green-600' : row.profitRate >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {row.profitRate}%
                        </span>
                      )}
                    </td>
                    <td>{row.payout > 0 ? formatKRW(row.payout) : '-'}</td>
                    <td className="text-center">{row.inquiryCount || '-'}</td>
                    <td className="text-center">{row.completedCount || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function KPIBox({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  const style: Record<string, string> = {
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
    green:  'bg-green-50 border-green-200 text-green-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    cyan:   'bg-cyan-50 border-cyan-200 text-cyan-700',
    red:    'bg-red-50 border-red-200 text-red-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
  }
  return (
    <div className={`rounded-xl border p-4 text-center ${style[color]}`}>
      <p className="text-xl mb-1">{icon}</p>
      <p className="text-xs text-gray-600 font-medium">{label}</p>
      <p className={`text-lg font-bold mt-1 ${style[color].split(' ').find(c => c.startsWith('text-'))}`}>{value}</p>
    </div>
  )
}
