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
import {
  buildFinanceIndex, dedupeSettlements, toRows, countableRows, sumRows,
  inPeriod, unpaidTotal, contractStats,
} from '@/lib/finance'

export default function OverviewTab({ data }: { data: CeoData }) {
  const { inquiries, settlements, payouts, expenses, assignments } = data
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  const availableYears = [
    new Date().getFullYear(),
    new Date().getFullYear() - 1,
    new Date().getFullYear() - 2,
  ]

  // 돈을 세는 규칙은 lib/finance.ts 한 곳에 있다 — 대시보드·수익보고·정산청구와 같은 것.
  const inqMap    = new Map(inquiries.map(q => [q.id, q]))
  const finIndex  = buildFinanceIndex(payouts, expenses, assignments)
  const countable = countableRows(toRows(dedupeSettlements(settlements), inqMap, finIndex))

  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const key  = `${selectedYear}-${String(i + 1).padStart(2, '0')}`
    const rows = countable.filter(r => inPeriod(r, key))
    const t    = sumRows(rows)
    const monthInqs = rows.map(r => r.inquiry).filter(Boolean) as typeof inquiries
    return {
      month: `${i + 1}월`,
      revenue: t.revenue, payout: t.payout, expense: t.expense, profit: t.profit,
      inquiryCount: monthInqs.length,
      completedCount: monthInqs.filter(q => ['완료', '정산완료'].includes(q.status)).length,
      profitRate: t.profitRate,
    }
  })

  const yearRows   = countable.filter(r => inPeriod(r, String(selectedYear)))
  const yearTotals = sumRows(yearRows)
  const yearRevenue  = yearTotals.revenue
  const yearPayout   = yearTotals.payout
  const yearExpense  = yearTotals.expense
  const yearProfit   = yearTotals.profit
  const yearReceived = yearRows.reduce((s, r) => s + (r.settlement.received_amount || 0), 0)
  // 미수금은 기간 실적이 아니라 '지금 못 받은 잔액'이라 연도로 자르지 않는다.
  // 작년 미수금도 못 받은 건 여전히 못 받은 돈이다.
  const totalUnpaid  = unpaidTotal(settlements)
  const yearProfitRate = yearTotals.profitRate

  // 체결율은 문의에서 세야 한다.
  // 예전에는 yearInqs(정산에서 뽑아낸 목록)로 셌는데, 그 목록은 이미 '체결 이상'만
  // 남긴 것이라 분자와 분모가 같아져 언제나 100%가 나왔다. 실측 181/181.
  //
  // 분모는 '결정이 난 건'만 본다 — 체결됐거나 미체결로 끝난 것.
  // 아직 접수·견적·보류로 살아 있는 건을 분모에 넣으면, 이번 달에 문의가 많이
  // 들어올수록 체결율이 떨어지는 이상한 숫자가 된다. 아직 진 게 아니기 때문이다.
  // (스마트랩 단가 시뮬레이터의 '체결율(결정건 기준)'과 같은 기준)
  const yearAll = inquiries.filter(q =>
    (q.event_start || q.created_at || '').startsWith(String(selectedYear)))
  const contract = contractStats(yearAll)
  const completionRate = contract.rate

  // 고객사별 누적 매출 Top10 — 매출을 세는 대상이 다른 지표와 같아야 한다
  const clientRevenue = Object.entries(
    countable.reduce<Record<string, number>>((acc, r) => {
      const name = r.settlement.company_name || '미정'
      acc[name] = (acc[name] || 0) + r.revenue
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
        {/* 다른 KPI는 선택 연도 기준이지만 미수금만 전체 기간이라 라벨에 밝힌다 */}
        <KPIBox label="미수금 (전체기간)" value={formatKRW(totalUnpaid)} icon="⚠️" color="red" />
        <KPIBox
          label="체결율"
          value={`${completionRate}%`}
          sub={contract.decided > 0
            ? `체결 ${contract.won} / 결정 ${contract.decided}건` +
              (contract.pending ? ` · 진행중 ${contract.pending}` : '')
            : '결정된 건 없음'}
          icon="🏆" color="orange"
        />
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

function KPIBox({ label, value, icon, color, sub }: {
  label: string; value: string; icon: string; color: string
  /** 값 아래 한 줄 — 무엇을 무엇으로 나눈 것인지 밝힐 때 쓴다 */
  sub?: string
}) {
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
      {sub && <p className="text-2xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}
