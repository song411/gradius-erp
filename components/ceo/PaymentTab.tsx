'use client'

import { useState, useMemo } from 'react'
import { db } from '@/lib/supabase/api'
import { formatKRW } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, Clock, AlertTriangle, CheckCircle2, FileSpreadsheet, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { CeoData } from './CeoContent'
import type { Payout, Inquiry, Assignment } from '@/lib/supabase/types'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'

// D-Day: 행사종료일 + 14일 기준
function calcDDay(eventEnd?: string): number | null {
  if (!eventEnd) return null
  const deadline = new Date(eventEnd)
  deadline.setDate(deadline.getDate() + 14)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function DDayBadge({ dday }: { dday: number | null }) {
  if (dday === null) return null
  if (dday < 0)   return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-600 text-white">D+{Math.abs(dday)} 초과</span>
  if (dday <= 3)  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white">D-{dday}</span>
  if (dday <= 7)  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-500 text-white">D-{dday}</span>
  if (dday <= 14) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-500 text-white">D-{dday}</span>
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">D-{dday}</span>
}

function StatusBadge({ status, isHQ }: { status: string; isHQ: boolean }) {
  if (isHQ) return <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">[본사] 지급없음</span>
  const s: Record<string, string> = {
    '대기':    'bg-gray-100 text-gray-600',
    '검토완료': 'bg-blue-100 text-blue-700',
    '확인완료': 'bg-blue-100 text-blue-700',
    '지급완료': 'bg-green-100 text-green-700',
    '완료':    'bg-green-100 text-green-700',
    '보류':    'bg-orange-100 text-orange-700',
    '미지급':  'bg-red-100 text-red-600',
  }
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s[status] || 'bg-gray-100 text-gray-600'}`}>{status}</span>
}

// 본사 인원 고정 명단 (이름으로 판별 — DB의 is_payable 필드가 true로 잘못 저장됨)
const HQ_STAFF_NAMES = new Set(['최규성', '송무재', '여지은', '김영찬'])

// 본사 인원 판별: 이름이 HQ 명단에 있으면 지급불필요
const isHQByMap  = (p: Payout, _asgMap: Map<string, Assignment>) =>
  !!(p.staff_name && HQ_STAFF_NAMES.has(p.staff_name))

const isRealDone = (p: Payout, asgMap: Map<string, Assignment>) =>
  isHQByMap(p, asgMap) || p.status === '지급완료' || p.status === '완료'
const isPending  = (p: Payout, asgMap: Map<string, Assignment>) =>
  !isHQByMap(p, asgMap) && !['지급완료', '완료'].includes(p.status)

interface GroupInfo {
  key:           string
  inquiry?:      Inquiry
  payouts:       Payout[]
  dday:          number | null
  totalFinalPay: number   // 실제 지급 대상 합계 (본사 제외)
  pendingCount:  number   // 처리 필요 수 (본사 제외, 미완료)
  doneCount:     number   // 완료 수 (지급완료 + 본사)
  allDone:       boolean
}

type ViewTab = 'pending' | 'done' | 'all'
type Period = '전체' | '이번달' | '이번분기' | '올해'
const PERIOD_BTNS: Period[] = ['전체', '이번달', '이번분기', '올해']
function isInPeriod(dateStr: string | undefined | null, period: Period): boolean {
  if (period === '전체') return true
  if (!dateStr) return false
  const d = new Date(dateStr); const now = new Date()
  if (period === '이번달') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  if (period === '이번분기') return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3)
  if (period === '올해') return d.getFullYear() === now.getFullYear()
  return true
}

export default function PaymentTab({ data }: { data: CeoData }) {
  const { payouts, inquiries, assignments, reload } = data

  // assignment_id → Assignment 빠른 조회 맵
  const asgMap = useMemo(
    () => new Map(assignments.map(a => [a.id, a])),
    [assignments]
  )
  const [viewTab, setViewTab]           = useState<ViewTab>('pending')
  const [search, setSearch]             = useState('')
  const [period, setPeriod]             = useState<Period>('전체')
  const [openGroups, setOpenGroups]     = useState<Set<string>>(new Set())
  const [processing, setProcessing]     = useState<string | null>(null)

  const { pendingGroups, doneGroups } = useMemo(() => {
    const map = new Map<string, { inquiry?: Inquiry; payouts: Payout[] }>()

    for (const p of payouts) {
      const key = p.inquiry_id || 'none'
      if (!map.has(key)) {
        map.set(key, { inquiry: inquiries.find(q => q.id === p.inquiry_id), payouts: [] })
      }
      map.get(key)!.payouts.push(p)
    }

    const all: GroupInfo[] = Array.from(map.entries()).map(([key, val]) => {
      // 본사 인원(is_payable=false)은 지급완료 여부와 무관하게 완료 처리
      const pendingCount = val.payouts.filter(p => isPending(p, asgMap)).length
      const doneCount    = val.payouts.filter(p => isRealDone(p, asgMap)).length
      const payable      = val.payouts.filter(p => !isHQByMap(p, asgMap))

      return {
        key,
        inquiry:       val.inquiry,
        payouts:       val.payouts,
        dday:          calcDDay(val.inquiry?.event_end),
        totalFinalPay: payable.reduce((s, p) => s + p.final_pay, 0),
        pendingCount,
        doneCount,
        allDone: pendingCount === 0,
      }
    })

    const pendingGroups = all
      .filter(g => !g.allDone)
      .sort((a, b) => (a.dday ?? 9999) - (b.dday ?? 9999))

    const doneGroups = all
      .filter(g => g.allDone && g.payouts.length > 0)
      .sort((a, b) => (b.inquiry?.event_start || '').localeCompare(a.inquiry?.event_start || ''))

    const allGroups = all.sort((a, b) =>
      (b.inquiry?.event_start || '').localeCompare(a.inquiry?.event_start || ''))

    return { pendingGroups, doneGroups, allGroups }
  }, [payouts, inquiries, asgMap])

  function toggleGroup(key: string) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // 지급 상태 업데이트 — paid_at 전용 라우트(/api/payouts/[id]) 사용
  async function patchPayoutStatus(payoutId: string, status: string, extra?: Record<string, unknown>) {
    const res = await fetch(`/api/payouts/${payoutId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...extra }),
    })
    const text = await res.text()
    if (!res.ok) {
      let detail = text
      try { detail = JSON.parse(text).error || text } catch { /* 무시 */ }
      throw new Error(`HTTP ${res.status}: ${detail}`)
    }
    return text
  }

  async function handleMarkPaid(payoutId: string) {
    setProcessing(payoutId)
    try {
      // 지급완료 처리 시 현재 시각을 paid_at 으로 함께 기록
      await patchPayoutStatus(payoutId, '지급완료', { paid_at: new Date().toISOString() })
      toast.success('지급완료로 처리되었습니다.')
      reload()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`지급완료 오류: ${msg}`, { duration: 8000 })
    } finally {
      setProcessing(null)
    }
  }

  async function handleRevertPaid(payoutId: string, staffName: string) {
    if (!confirm(`"${staffName}" 지급완료를 검토완료로 되돌리겠습니까?`)) return
    setProcessing(payoutId)
    try {
      // 되돌리기 시 paid_at 초기화
      await patchPayoutStatus(payoutId, '검토완료', { paid_at: null })
      toast.success('검토완료로 되돌렸습니다.')
      reload()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`되돌리기 오류: ${msg}`, { duration: 8000 })
    } finally {
      setProcessing(null)
    }
  }

  // 전체 이체명단 엑셀 (검토완료 건만, 행사별 시트 분리)
  function handleExcel() {
    const wb = XLSX.utils.book_new()
    let totalSheets = 0

    for (const g of pendingGroups) {
      const readyPayouts = g.payouts.filter(p =>
        !isHQByMap(p, asgMap) && (p.status === '검토완료' || p.status === '확인완료')
      )
      if (readyPayouts.length === 0) continue

      const rows = readyPayouts.map(p => ({
        '이름':     p.staff_name || '',
        '은행':     p.bank_name || '',
        '계좌번호': p.account_number || '',
        '이체금액': p.final_pay,
        '메모':     g.inquiry?.event_name || p.site_name || '',
      }))

      const sheetName = (g.inquiry?.event_name || '미정').slice(0, 31) // Excel 시트명 최대 31자
      const ws = XLSX.utils.json_to_sheet(rows)
      // 열 너비 설정
      ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 30 }]
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
      totalSheets++
    }

    if (totalSheets === 0) { toast.warning('검토완료 상태의 이체 대상이 없습니다.'); return }
    const filename = `이체명단_검토완료_${new Date().toLocaleDateString('ko-KR').replace(/\. /g, '').replace('.', '')}.xlsx`
    XLSX.writeFile(wb, filename)
    toast.success(`${totalSheets}개 행사 이체명단을 다운로드했습니다.`)
  }

  // 개별 행사 이체명단 엑셀 (검토완료 건)
  function handleGroupExcel(g: GroupInfo) {
    const readyPayouts = g.payouts.filter(p =>
      !isHQByMap(p, asgMap) && (p.status === '검토완료' || p.status === '확인완료')
    )
    if (readyPayouts.length === 0) { toast.warning('검토완료 상태의 이체 대상이 없습니다.'); return }

    const rows = readyPayouts.map(p => ({
      '이름':     p.staff_name || '',
      '은행':     p.bank_name || '',
      '계좌번호': p.account_number || '',
      '이체금액': p.final_pay,
      '메모':     g.inquiry?.event_name || p.site_name || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 30 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, (g.inquiry?.event_name || '이체명단').slice(0, 31))
    XLSX.writeFile(wb, `이체명단_${g.inquiry?.event_name || ''}_${new Date().toLocaleDateString('ko-KR').replace(/\. /g, '').replace('.', '')}.xlsx`)
    toast.success('이체명단을 다운로드했습니다.')
  }

  const overdueCount  = pendingGroups.filter(g => g.dday !== null && g.dday < 0).length
  const totalPending  = pendingGroups.reduce((s, g) => s + g.pendingCount, 0)
  const pendingAmount = payouts.filter(p => isPending(p, asgMap)).reduce((s, p) => s + p.final_pay, 0)

  // 검색 + 기간 필터 적용
  const filterGroups = (groups: GroupInfo[]) => {
    const q = search.trim().toLowerCase()
    return groups
      .filter(g => isInPeriod(
        viewTab === 'done' ? g.payouts.find(p => p.paid_at)?.paid_at : g.inquiry?.event_start,
        period
      ))
      .filter(g => {
        if (!q) return true
        const eventName = (g.inquiry?.event_name || '').toLowerCase()
        const company   = (g.inquiry?.company_name || '').toLowerCase()
        const staffHit  = g.payouts.some(p => (p.staff_name || '').toLowerCase().includes(q))
        return eventName.includes(q) || company.includes(q) || staffHit
      })
  }

  const baseGroups   = viewTab === 'pending' ? pendingGroups : viewTab === 'done' ? doneGroups : allGroups
  const activeGroups = filterGroups(baseGroups)

  return (
    <div className="space-y-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={<Clock className="h-5 w-5" />}         label="지급 대기" sub="처리 필요"
          count={totalPending}      amount={pendingAmount}  color="blue" />
        <StatCard icon={<AlertTriangle className="h-5 w-5" />} label="D-Day 초과" sub="기한 경과"
          count={overdueCount}      amount={0}              color="red" />
        <StatCard icon={<CheckCircle2 className="h-5 w-5" />}  label="지급완료" sub="이력 탭에서 전체 확인"
          count={doneGroups.length} amount={0}              color="green" />
      </div>

      {/* 검색 + 기간 필터 */}
      <div className="space-y-2">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="행사명, 업체명, 직원명 검색..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-1">
            {PERIOD_BTNS.map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`text-xs px-3 py-1.5 rounded-full border-2 font-semibold transition-colors ${period === p ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-300 hover:border-amber-400'}`}>
                {p}
              </button>
            ))}
          </div>
        </div>
        {(search || period !== '전체') && (
          <p className="text-xs text-gray-400 px-1">결과 {activeGroups.length}건</p>
        )}
      </div>
      {/* 탭 + 엑셀 버튼 */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          <TabBtn active={viewTab === 'pending'} onClick={() => setViewTab('pending')}
            label={`처리 필요 (${pendingGroups.length})`} color="red" />
          <TabBtn active={viewTab === 'done'}    onClick={() => setViewTab('done')}
            label={`지급완료 이력 (${doneGroups.length})`} color="green" />
          <TabBtn active={viewTab === 'all'}     onClick={() => setViewTab('all')}
            label={`전체보기 (${allGroups.length})`} color="blue" />
        </div>
        <Button variant="outline" onClick={handleExcel} className="gap-2 text-sm border-green-300 text-green-700 hover:bg-green-50">
          <FileSpreadsheet className="h-4 w-4" />
          검토완료 이체명단 전체 엑셀
        </Button>
      </div>

      {/* 처리 필요 탭: 기존 아코디언 */}
      {viewTab === 'pending' && (
        activeGroups.length === 0 ? (
          <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
            처리 대기 중인 지급 건이 없습니다 ✅
          </div>
        ) : (
          <div className="space-y-2">
            {activeGroups.map(g => (
              <GroupRow
                key={g.key}
                g={g}
                asgMap={asgMap}
                openGroups={openGroups}
                toggleGroup={toggleGroup}
                processing={processing}
                handleMarkPaid={handleMarkPaid}
                handleGroupExcel={handleGroupExcel}
                done={false}
              />
            ))}
          </div>
        )
      )}

      {/* 지급완료 탭: 전체 평면 테이블 */}
      {viewTab === 'done' && (() => {
        const doneRows = activeGroups.flatMap(g =>
          g.payouts
            .filter(p => !isHQByMap(p, asgMap) && (p.status === '지급완료' || p.status === '완료'))
            .map(p => ({ p, g }))
        ).sort((a, b) => (b.p.paid_at || '').localeCompare(a.p.paid_at || ''))

        const totalAmt = doneRows.reduce((s, { p }) => s + p.final_pay, 0)

        return doneRows.length === 0 ? (
          <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
            완료된 지급 이력이 없습니다.
          </div>
        ) : (
          <div className="bg-white rounded-xl border overflow-hidden">
            {/* 테이블 헤더 요약 */}
            <div className="px-5 py-3 border-b bg-green-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm font-bold text-green-800">지급완료 전체 이력</span>
                <span className="text-xs text-green-600 bg-green-100 rounded-full px-2 py-0.5">{doneRows.length}건</span>
              </div>
              <span className="text-sm font-extrabold text-blue-700">{formatKRW(totalAmt)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">입금일</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">행사명</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">업체명</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">이름</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">품목</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">은행</th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">계좌번호</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">실수령액</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-gray-500"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {doneRows.map(({ p, g }) => {
                    const asg = p.assignment_id ? asgMap.get(p.assignment_id) : null
                    return (
                      <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                          {p.paid_at
                            ? new Date(p.paid_at).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })
                            : <span className="text-gray-300">-</span>
                          }
                        </td>
                        <td className="px-3 py-2.5 text-xs font-medium text-gray-800 max-w-[140px] truncate">
                          {g.inquiry?.event_name || '-'}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[100px] truncate">
                          {g.inquiry?.company_name || '-'}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-gray-800 whitespace-nowrap">
                          {p.staff_name || '-'}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">{asg?.job_type || '-'}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">{p.bank_name || '-'}</td>
                        <td className="px-3 py-2.5 text-xs font-mono text-gray-400">{p.account_number || '-'}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-blue-700 whitespace-nowrap">
                          {formatKRW(p.final_pay)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            onClick={() => handleRevertPaid(p.id, p.staff_name || '')}
                            disabled={processing === p.id}
                            className="text-[10px] text-orange-600 border border-orange-300 rounded-lg px-2 py-1 hover:bg-orange-50 transition-colors whitespace-nowrap disabled:opacity-40"
                          >
                            {processing === p.id ? '...' : '↩ 되돌리기'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="border-t-2 bg-gray-50">
                  <tr>
                    <td colSpan={7} className="px-4 py-3 text-xs font-bold text-gray-600">합계 ({doneRows.length}명)</td>
                    <td className="px-4 py-3 text-right font-extrabold text-blue-700">{formatKRW(totalAmt)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })()}

      {/* 전체보기 탭: pending + done 합산 아코디언 */}
      {viewTab === 'all' && (
        activeGroups.length === 0 ? (
          <div className="bg-white rounded-xl border p-12 text-center text-gray-400">
            표시할 데이터가 없습니다.
          </div>
        ) : (
          <div className="space-y-2">
            {activeGroups.map(g => (
              <GroupRow
                key={g.key}
                g={g}
                asgMap={asgMap}
                openGroups={openGroups}
                toggleGroup={toggleGroup}
                processing={processing}
                handleMarkPaid={handleMarkPaid}
                handleGroupExcel={handleGroupExcel}
                done={g.allDone}
              />
            ))}
          </div>
        )
      )}
    </div>
  )
}

// ─── 그룹 행 ───────────────────────────────────────────
function GroupRow({ g, asgMap, openGroups, toggleGroup, processing, handleMarkPaid, handleGroupExcel, done }: {
  g: GroupInfo
  asgMap: Map<string, Assignment>
  openGroups: Set<string>
  toggleGroup: (key: string) => void
  processing: string | null
  handleMarkPaid: (id: string) => void
  handleGroupExcel: (g: GroupInfo) => void
  done: boolean
}) {
  const isOpen = openGroups.has(g.key)

  const urgentBorder = done ? '' :
    g.dday === null ? '' :
    g.dday < 0      ? 'border-l-4 border-l-red-500' :
    g.dday <= 3     ? 'border-l-4 border-l-red-400' :
    g.dday <= 7     ? 'border-l-4 border-l-orange-400' :
    g.dday <= 14    ? 'border-l-4 border-l-yellow-400' : ''

  const hqCount   = g.payouts.filter(p => isHQByMap(p, asgMap)).length
  const paidCount = g.payouts.filter(p => !isHQByMap(p, asgMap) && (p.status === '지급완료' || p.status === '완료')).length

  // 품목 목록 (assignments에서 job_type 조회)
  const jobTypes = [...new Set(
    g.payouts
      .map(p => p.assignment_id ? asgMap.get(p.assignment_id)?.job_type : null)
      .filter(Boolean)
  )] as string[]

  const hasExcel = !done && g.payouts.some(p => !isHQByMap(p, asgMap) && (p.status === '검토완료' || p.status === '확인완료'))

  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${urgentBorder}`}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50" onClick={() => toggleGroup(g.key)}>
        {isOpen
          ? <ChevronDown  className="h-4 w-4 text-gray-400 shrink-0" />
          : <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-gray-800">
              {g.inquiry?.event_name || '행사명 미정'}
            </span>
            {g.inquiry?.company_name && (
              <span className="text-xs text-gray-400">{g.inquiry.company_name}</span>
            )}
            {!done && <DDayBadge dday={g.dday} />}
            {done && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">✓ 완료</span>}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
            {g.inquiry?.event_start && (
              <span>📅 {g.inquiry.event_start.slice(0,10)}{g.inquiry.event_end ? ` ~ ${g.inquiry.event_end.slice(0,10)}` : ''}</span>
            )}
            {!done && g.dday !== null && g.dday >= 0 && g.inquiry?.event_end && (
              <span className="text-orange-500 font-medium">
                이체마감: {new Date(new Date(g.inquiry.event_end).getTime() + 14 * 86400000).toLocaleDateString('ko-KR')}
              </span>
            )}
          </div>
          {jobTypes.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {jobTypes.map(jt => (
                <span key={jt} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">{jt}</span>
              ))}
            </div>
          )}
        </div>
        <div className="text-right shrink-0 space-y-1">
          <p className="text-sm font-bold text-gray-800">{formatKRW(g.totalFinalPay)}</p>
          <p className="text-[10px] text-gray-400">
            {hqCount > 0 && <span className="text-slate-400">[본사]{hqCount} </span>}
            {!done && <span>대기 {g.pendingCount}명 · </span>}
            완료 {paidCount}명
          </p>
          {hasExcel && (
            <button
              onClick={e => { e.stopPropagation(); handleGroupExcel(g) }}
              className="flex items-center gap-1 ml-auto text-xs font-semibold text-white bg-green-600 hover:bg-green-700 px-2.5 py-1 rounded-lg transition-colors"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />이체명단
            </button>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">이름</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">품목</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">은행</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">계좌번호</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">총지급</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">실수령</th>
                <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500">상태</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {g.payouts.map(p => {
                const hq = isHQByMap(p, asgMap)
                const asg = p.assignment_id ? asgMap.get(p.assignment_id) : null
                return (
                  <tr key={p.id} className={`hover:bg-gray-50 ${hq ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-2.5 font-medium text-gray-800">
                      {p.staff_name || '-'}
                      {hq && <span className="ml-1 text-[10px] text-slate-400 font-normal">[본사]</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500">{asg?.job_type || '-'}</td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs">{hq ? '-' : (p.bank_name || '-')}</td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs font-mono">{hq ? '-' : (p.account_number || '-')}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500">{hq ? '-' : formatKRW(p.subtotal || p.final_pay)}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-blue-700">{hq ? <span className="text-gray-400 font-normal">-</span> : formatKRW(p.final_pay)}</td>
                    <td className="px-3 py-2.5 text-center"><StatusBadge status={p.status} isHQ={hq} /></td>
                    <td className="px-4 py-2.5 text-right">
                      {!hq && (p.status === '검토완료' || p.status === '확인완료') && (
                        <Button size="sm" variant="outline" className="text-xs h-7"
                          onClick={() => handleMarkPaid(p.id)} disabled={processing === p.id}>
                          {processing === p.id ? '처리중...' : '지급완료'}
                        </Button>
                      )}
                      {!hq && (p.status === '지급완료' || p.status === '완료') && (
                        <span className="text-xs text-green-600 font-semibold">✓ 완료</span>
                      )}
                      {hq && <span className="text-xs text-slate-400">-</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 font-semibold">
                <td colSpan={3} className="px-4 py-2 text-xs text-gray-500">합계 (본사 제외)</td>
                <td className="px-3 py-2 text-right text-sm">{formatKRW(g.payouts.filter(p => !isHQByMap(p, asgMap)).reduce((s, p) => s + (p.subtotal || p.final_pay), 0))}</td>
                  <td className="px-3 py-2 text-right text-sm text-blue-700">{formatKRW(g.totalFinalPay)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── 작은 탭 버튼 ───────────────────────────────────────
function TabBtn({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color: string }) {
  const activeStyle = color === 'red'
    ? 'bg-white text-red-700 shadow-sm'
    : color === 'blue'
    ? 'bg-white text-blue-700 shadow-sm'
    : 'bg-white text-green-700 shadow-sm'
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${active ? activeStyle : 'text-gray-500 hover:text-gray-700'}`}
    >
      {label}
    </button>
  )
}

function StatCard({ icon, label, sub, count, amount, color, onClick, clickable }: {
  icon: React.ReactNode; label: string; sub: string; count: number; amount: number; color: string
  onClick?: () => void; clickable?: boolean
}) {
  const styles: Record<string, string> = {
    blue:  'bg-blue-50 border-2 border-blue-300 text-blue-700 shadow-sm',
    red:   'bg-red-50 border-2 border-red-300 text-red-700 shadow-sm',
    green: 'bg-green-50 border-2 border-green-300 text-green-700 shadow-sm',
  }
  return (
    <div
      className={`rounded-xl p-4 ${styles[color]} ${clickable ? 'cursor-pointer hover:brightness-95 active:scale-[0.99] transition-all' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <div>
          <p className="font-bold text-sm">{label}</p>
          <p className="text-[10px] opacity-70">{sub}</p>
        </div>
        {clickable && <span className="ml-auto text-[10px] opacity-50">클릭 ▶</span>}
      </div>
      <p className="text-2xl font-extrabold">{count}<span className="text-sm font-normal ml-0.5">건</span></p>
      {amount > 0 && <p className="text-xs mt-1 font-semibold opacity-80">{formatKRW(amount)}</p>}
    </div>
  )
}
