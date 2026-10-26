'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { db } from '@/lib/supabase/api'
import EstimateItemsTable from './EstimateItemsTable'
import RelatedLinks from '@/components/ui/RelatedLinks'
import EstimateHistoryList from '@/components/estimates/EstimateHistoryList'
import { historyOf, type HistoryEntry } from '@/lib/estimateHistory'
import { formatKRW } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronDown, ChevronRight, CheckCircle2, AlertCircle, Receipt, MapPin, Building2, Search, Copy, Layers, X } from 'lucide-react'
import type { CeoData } from './CeoContent'
import type { Settlement, Inquiry, Customer, EstimateItem, Estimate } from '@/lib/supabase/types'
import { toast } from 'sonner'
import { itemsOfInquiry } from '@/lib/estimateItems'

// 체결 이후 단계만 세금계산서 관리 대상 — 기준은 lib/finance.ts (체결 관리 화면과 같은 것)
import { needsTaxInvoice } from '@/lib/finance'
import { PeriodFilter, isInPeriodFn, type PeriodState } from './PeriodFilter'

interface SettRow extends Settlement {
  inquiry?: Inquiry
  customer?: Customer
  items?: EstimateItem[]
  finalEstimate?: Estimate
}

type ViewTab = 'unissued' | 'issued' | 'all'
type SortKey = '기본순' | '경과일순(긴급)' | '최신순' | '처리순'

// ── 합산 발행 ────────────────────────────────────────────
// 같은 거래처 판정 키. 사업자번호가 있으면 숫자만 남겨 비교하고, 없으면 상호, 그것도 없으면 업체명.
// 어떤 건은 업체명만, 어떤 건은 사업자번호만 들어 있는 경우가 실제로 있어 완벽하진 않다 —
// 그래서 최종 선택은 사람이 체크박스로 한다. 키는 '같은 업체 N건' 힌트와 전체 선택에만 쓴다.
function bizKey(s: Settlement & { inquiry?: Inquiry }): string {
  const num = (s.biz_number || '').replace(/[^0-9]/g, '')
  if (num.length >= 10) return `n:${num}`
  const name = (s.corp_name || s.company_name || s.inquiry?.company_name || '').trim().toLowerCase()
  return name ? `c:${name}` : `id:${s.id}`
}

function newGroupId(): string {
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `TXG-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

// 016 마이그레이션 전이면 새 칸이 없어 PATCH가 실패한다. 그때는 발행완료만 기록하고 묶음 번호는 포기한다 —
// 발행 업무가 SQL 실행 순서 때문에 멈추면 안 된다.
function isMissingColumn(e: unknown): boolean {
  const msg = (e as Error)?.message || ''
  return /column|schema cache|does not exist/i.test(msg)
}

// 발행 처리 시각 — DB는 UTC로 저장되므로 한국시간으로 바꿔 "10-20 20:45"처럼 보여준다
function formatIssuedAt(iso?: string | null, withYear = false): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(d)
  const get = (t: string) => parts.find(x => x.type === t)?.value || ''
  const date = `${get('month')}-${get('day')}`
  return `${withYear ? get('year') + '-' : ''}${date} ${get('hour')}:${get('minute')}`
}

// 경과일 계산 유틸
function elapsedDays(dateStr?: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const today = new Date(); today.setHours(0,0,0,0)
  return Math.floor((today.getTime() - d.getTime()) / 86400000)
}

function ElapsedBadge({ days, label }: { days: number | null; label?: string }) {
  if (days === null) return <span className="text-gray-400 text-xs">-</span>
  const text = label || (days < 0 ? `D-${Math.abs(days)}` : days === 0 ? '오늘' : `D+${days}일`)
  if (days < 0) return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-semibold">{text}</span>
  if (days === 0) return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-semibold">{text}</span>
  if (days <= 14) return <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 font-semibold">{text}</span>
  if (days <= 30) return <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-semibold">{text}</span>
  return <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">{text}</span>
}

export default function TaxInvoiceTab({ data }: { data: CeoData }) {
  const { settlements, inquiries, customers, estimateItems, estimates, revisions, reload } = data
  const [viewTab, setViewTab]         = useState<ViewTab>('unissued')
  const [sortKey, setSortKey]         = useState<SortKey>('기본순')
  const [processing, setProcessing]   = useState<string | null>(null)
  const [search, setSearch]           = useState(() => {
    // 다른 화면의 바로가기(?q=행사명)로 들어오면 그 건만 보이게
    if (typeof window === 'undefined') return ''
    return new URLSearchParams(window.location.search).get('q') || ''
  })
  const [periodState, setPeriodState] = useState<PeriodState>({ period: '전체', customFrom: '', customTo: '' })
  // 합산 발행용 선택 (미발행 탭에서만)
  const [selected, setSelected]       = useState<Set<string>>(new Set())
  // 묶음 모아보기 — "합산 발행 N건" 배지를 누르면 그 묶음만 남긴다. 체결 관리 화면의
  // '합산' 배지에서 ?group= 으로 넘어올 수도 있다
  const searchParams = useSearchParams()
  const [groupFilter, setGroupFilter] = useState<string | null>(searchParams.get('group'))

  // 고객사 맵 (id → customer)
  const customerMap = new Map(customers.map(c => [c.id, c]))

  // 체결 이후 정산 건만 대상
  const rows: SettRow[] = settlements
    .map(s => {
      const inquiry       = inquiries.find(q => q.id === s.inquiry_id)
      const customer      = inquiry?.customer_id ? customerMap.get(inquiry.customer_id) : undefined
      // 확정 견적의 품목만 — 문의로 거르면 A안·B안 품목이 섞여 인원이 두 배로 보인다
      const items         = itemsOfInquiry(s.inquiry_id, estimates, estimateItems)
      const finalEstimate = estimates.find(e => e.inquiry_id === s.inquiry_id && e.is_final)
      return { ...s, inquiry, customer, items, finalEstimate }
    })
    .filter(s => needsTaxInvoice(s.inquiry))
    .sort((a, b) => (a.inquiry?.event_start || '').localeCompare(b.inquiry?.event_start || ''))

  // 기간 필터 적용
  const periodFiltered = rows.filter(s => isInPeriodFn(s.inquiry?.event_start, periodState))
  const unissued = periodFiltered.filter(s => !s.tax_invoice_issued)
  const issued   = periodFiltered.filter(s => s.tax_invoice_issued)

  const applySearch = (list: SettRow[]) => {
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter(s => {
      const company   = (s.company_name || s.corp_name || s.inquiry?.company_name || '').toLowerCase()
      const eventName = (s.inquiry?.event_name || '').toLowerCase()
      const siteName  = (s.site_name || '').toLowerCase()
      return company.includes(q) || eventName.includes(q) || siteName.includes(q)
    })
  }

  const sortList = (list: SettRow[]) => {
    if (sortKey === '경과일순(긴급)') {
      return [...list].sort((a, b) => {
        const ad = elapsedDays(a.inquiry?.event_end || a.inquiry?.event_start) ?? -9999
        const bd = elapsedDays(b.inquiry?.event_end || b.inquiry?.event_start) ?? -9999
        return bd - ad
      })
    }
    if (sortKey === '최신순') {
      return [...list].sort((a, b) =>
        (b.inquiry?.event_start || b.created_at || '').localeCompare(a.inquiry?.event_start || a.created_at || '')
      )
    }
    if (sortKey === '처리순') {
      // 발행완료를 누른 시각 기준 — 방금 누른 게 맨 위. 시각 기록이 없는 예전 건은 뒤로 보낸다
      return [...list].sort((a, b) => (b.tax_invoice_issued_at || '').localeCompare(a.tax_invoice_issued_at || ''))
    }
    return list  // 기본순: event_start 오름차순 (이미 rows에서 정렬됨)
  }

  // 묶음을 보는 중이면 탭·기간·검색과 무관하게 그 묶음 전부 — 한 장으로 나간 건은 한 번에 봐야 한다
  const groupRows = groupFilter ? rows.filter(r => r.tax_invoice_group === groupFilter) : []
  const base    = viewTab === 'unissued' ? unissued : viewTab === 'issued' ? issued : periodFiltered
  const current = groupFilter ? groupRows : sortList(applySearch(base))
  const groupSupply = groupRows.reduce((a, r) => a + (r.supply_price || 0), 0)
  const groupVat    = groupRows.reduce((a, r) => a + (r.vat || 0), 0)
  const groupTotal  = groupRows.reduce((a, r) => a + (r.invoice_amount || r.supply_price + r.vat), 0)
  const groupBalance = groupRows.reduce((a, r) => a + Math.max(0, r.balance ?? (r.invoice_amount - r.received_amount)), 0)

  // 같은 업체가 2건 이상인 키 → 건수 (지금 보고 있는 미발행 목록 기준)
  const dupCount = new Map<string, number>()
  if (viewTab === 'unissued') {
    current.forEach(s => { const k = bizKey(s); dupCount.set(k, (dupCount.get(k) || 0) + 1) })
  }
  const selectedRows = current.filter(s => selected.has(s.id))
  const selectedKey  = selectedRows.length ? bizKey(selectedRows[0]) : null
  const selSupply = selectedRows.reduce((a, s) => a + (s.supply_price || 0), 0)
  const selVat    = selectedRows.reduce((a, s) => a + (s.vat || 0), 0)
  const selTotal  = selectedRows.reduce((a, s) => a + (s.invoice_amount || s.supply_price + s.vat), 0)

  function toggleSelect(row: SettRow) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(row.id)) { next.delete(row.id); return next }
      // 다른 업체 건과는 섞이지 않게 — 세금계산서는 거래처 한 곳에 한 장이다
      if (selectedKey && bizKey(row) !== selectedKey) {
        toast.info('같은 업체 건끼리만 묶을 수 있습니다. 먼저 선택을 해제해 주세요.')
        return prev
      }
      next.add(row.id); return next
    })
  }
  function selectAllOf(row: SettRow) {
    const k = bizKey(row)
    setSelected(new Set(current.filter(s => bizKey(s) === k).map(s => s.id)))
  }

  // 홈택스 품목란에 붙일 문구 — "행사A 외 3건 행사인력 용역"
  function itemText(list: SettRow[]): string {
    const names = list.map(r => r.inquiry?.event_name || r.site_name || '').filter(Boolean)
    if (!names.length) return '행사인력 용역'
    return names.length === 1 ? `${names[0]} 행사인력 용역` : `${names[0]} 외 ${names.length - 1}건 행사인력 용역`
  }
  async function copyText(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); toast.success(`${what} 복사됨`) }
    catch { toast.error('복사에 실패했습니다.') }
  }

  // 발행완료 기록. 새 칸(발행일·묶음)이 아직 없으면 발행 여부만 남긴다.
  async function markIssued(ids: string[], group: string | null) {
    const full: Record<string, unknown> = { tax_invoice_issued: true, tax_invoice_issued_at: new Date().toISOString() }
    if (group) full.tax_invoice_group = group
    try {
      await db.updateMany('settlements', ids, full)
      return true
    } catch (e) {
      if (!isMissingColumn(e)) throw e
      await db.updateMany('settlements', ids, { tax_invoice_issued: true })
      toast.warning('발행완료는 기록했지만 묶음 번호·발행일은 저장하지 못했습니다. 016 SQL을 아직 실행하지 않은 것 같습니다.', { duration: 8000 })
      return false
    }
  }

  async function handleIssue(id: string) {
    setProcessing(id)
    try {
      await markIssued([id], null)
      toast.success('발행완료로 처리되었습니다.')
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
      reload()
    } catch (e) {
      toast.error(`처리 중 오류가 발생했습니다: ${(e as Error).message}`)
    } finally {
      setProcessing(null)
    }
  }

  async function handleIssueGroup() {
    if (selectedRows.length < 2) return
    const label = selectedRows[0].company_name || selectedRows[0].corp_name || selectedRows[0].inquiry?.company_name || '이 업체'
    if (!confirm(`${label} ${selectedRows.length}건을 세금계산서 한 장(공급가 ${formatKRW(selSupply)})으로 발행완료 처리합니다. 계속할까요?`)) return
    setProcessing('group')
    try {
      const gid = newGroupId()
      const saved = await markIssued(selectedRows.map(r => r.id), gid)
      toast.success(saved ? `${selectedRows.length}건 합산 발행완료 (묶음 ${gid})` : `${selectedRows.length}건 발행완료`)
      setSelected(new Set())
      reload()
    } catch (e) {
      toast.error(`처리 중 오류가 발생했습니다: ${(e as Error).message}`)
    } finally {
      setProcessing(null)
    }
  }

  async function handleRevert(row: SettRow) {
    // 묶음으로 발행한 건은 한 장을 취소하는 것이므로 묶음 전체를 되돌린다
    const mates = row.tax_invoice_group ? rows.filter(r => r.tax_invoice_group === row.tax_invoice_group) : [row]
    const msg = mates.length > 1
      ? `같이 발행된 ${mates.length}건을 모두 미발행으로 되돌립니다. 계속할까요?`
      : '발행완료를 취소하고 미발행으로 되돌리시겠습니까?'
    if (!confirm(msg)) return
    setProcessing(row.id)
    try {
      const ids = mates.map(m => m.id)
      try {
        await db.updateMany('settlements', ids, { tax_invoice_issued: false, tax_invoice_group: null, tax_invoice_issued_at: null })
      } catch (e) {
        if (!isMissingColumn(e)) throw e
        await db.updateMany('settlements', ids, { tax_invoice_issued: false })
      }
      toast.success(mates.length > 1 ? `${mates.length}건을 미발행으로 되돌렸습니다.` : '미발행으로 돌렸습니다.')
      reload()
    } catch (e) {
      toast.error(`처리 중 오류가 발생했습니다: ${(e as Error).message}`)
    } finally {
      setProcessing(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* 국세청 바로가기 버튼 */}
      <div className="flex gap-2 flex-wrap">
        <a href="https://www.hometax.go.kr" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
          <Receipt className="h-4 w-4" />
          홈택스 바로가기
        </a>
        <a href="https://www.hometax.go.kr/websquare/websquare.wss?w2xPath=/ui/pp/index_pp.xml&menuCd=MDU0020&contentCd=MDU0020" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
          <Receipt className="h-4 w-4" />
          전자세금계산서 발행
        </a>
        <a href="https://www.hometax.go.kr/websquare/websquare.wss?w2xPath=/ui/pp/index_pp.xml&menuCd=MDU0030" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm">
          <Receipt className="h-4 w-4" />
          세금계산서 조회
        </a>
      </div>

      {/* 검색 + 기간 필터 */}
      <div className="space-y-2">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="업체명, 행사명 검색..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <PeriodFilter value={periodState} onChange={setPeriodState} />
        </div>
        {/* 정렬 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-bold shrink-0">정렬:</span>
          {(['기본순', '경과일순(긴급)', '최신순', ...(viewTab === 'unissued' ? [] : ['처리순' as const])] as SortKey[]).map(s => (
            <button key={s} onClick={() => setSortKey(s)}
              title={s === '처리순' ? '발행완료를 누른 시각 순 — 방금 처리한 건이 맨 위' : undefined}
              className={`text-xs px-3 py-1.5 rounded-full border-2 font-semibold transition-colors ${sortKey === s ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-600'}`}>
              {s}
            </button>
          ))}
        </div>
        {(search || periodState.period !== '전체' || periodState.customFrom || periodState.customTo) && (
          <p className="text-xs text-gray-400 px-1">검색 결과 {current.length}건</p>
        )}
      </div>

      {/* 탭 전환 — 미발행 / 발행완료 / 전체 */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => { setViewTab('unissued'); if (sortKey === '처리순') setSortKey('기본순') }}
          className={`rounded-xl p-4 flex items-start gap-3 border-2 transition-all text-left ${
            viewTab === 'unissued'
              ? 'bg-red-50 border-red-400 shadow-md ring-2 ring-red-300'
              : 'bg-white border-gray-200 hover:border-red-200 hover:bg-red-50/40'
          }`}
        >
          <AlertCircle className={`h-5 w-5 mt-0.5 shrink-0 ${viewTab === 'unissued' ? 'text-red-500' : 'text-gray-400'}`} />
          <div>
            <p className={`text-xs font-semibold ${viewTab === 'unissued' ? 'text-red-700' : 'text-gray-500'}`}>미발행</p>
            <p className={`text-2xl font-extrabold ${viewTab === 'unissued' ? 'text-red-700' : 'text-gray-700'}`}>
              {unissued.length}<span className="text-sm font-normal ml-0.5">건</span>
            </p>
            <p className={`text-xs font-medium mt-0.5 ${viewTab === 'unissued' ? 'text-red-600' : 'text-gray-400'}`}>
              {formatKRW(unissued.reduce((s, r) => s + r.supply_price, 0))}
            </p>
          </div>
          {viewTab === 'unissued' && (
            <span className="ml-auto text-2xs text-red-500 font-bold self-end">▶ 보는 중</span>
          )}
        </button>

        <button
          onClick={() => { setViewTab('issued'); setSortKey('처리순') }}
          className={`rounded-xl p-4 flex items-start gap-3 border-2 transition-all text-left ${
            viewTab === 'issued'
              ? 'bg-green-50 border-green-400 shadow-md ring-2 ring-green-300'
              : 'bg-white border-gray-200 hover:border-green-200 hover:bg-green-50/40'
          }`}
        >
          <CheckCircle2 className={`h-5 w-5 mt-0.5 shrink-0 ${viewTab === 'issued' ? 'text-green-500' : 'text-gray-400'}`} />
          <div>
            <p className={`text-xs font-semibold ${viewTab === 'issued' ? 'text-green-700' : 'text-gray-500'}`}>발행완료</p>
            <p className={`text-2xl font-extrabold ${viewTab === 'issued' ? 'text-green-700' : 'text-gray-700'}`}>
              {issued.length}<span className="text-sm font-normal ml-0.5">건</span>
            </p>
            <p className={`text-xs font-medium mt-0.5 ${viewTab === 'issued' ? 'text-green-600' : 'text-gray-400'}`}>
              {formatKRW(issued.reduce((s, r) => s + r.supply_price, 0))}
            </p>
          </div>
          {viewTab === 'issued' && (
            <span className="ml-auto text-2xs text-green-600 font-bold self-end">▶ 보는 중</span>
          )}
        </button>

        <button
          onClick={() => setViewTab('all')}
          className={`rounded-xl p-4 flex items-start gap-3 border-2 transition-all text-left ${
            viewTab === 'all'
              ? 'bg-blue-50 border-blue-400 shadow-md ring-2 ring-blue-300'
              : 'bg-white border-gray-200 hover:border-blue-200 hover:bg-blue-50/40'
          }`}
        >
          <Receipt className={`h-5 w-5 mt-0.5 shrink-0 ${viewTab === 'all' ? 'text-blue-500' : 'text-gray-400'}`} />
          <div>
            <p className={`text-xs font-semibold ${viewTab === 'all' ? 'text-blue-700' : 'text-gray-500'}`}>전체보기</p>
            <p className={`text-2xl font-extrabold ${viewTab === 'all' ? 'text-blue-700' : 'text-gray-700'}`}>
              {periodFiltered.length}<span className="text-sm font-normal ml-0.5">건</span>
            </p>
            <p className={`text-xs font-medium mt-0.5 ${viewTab === 'all' ? 'text-blue-600' : 'text-gray-400'}`}>
              {formatKRW(periodFiltered.reduce((s, r) => s + r.supply_price, 0))}
            </p>
          </div>
          {viewTab === 'all' && (
            <span className="ml-auto text-2xs text-blue-600 font-bold self-end">▶ 보는 중</span>
          )}
        </button>
      </div>

      {/* 묶음 모아보기 띠 */}
      {groupFilter && (
        <div className="bg-indigo-50 border-2 border-indigo-300 rounded-xl px-5 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-indigo-600" />
            <span className="font-bold text-sm text-indigo-800">
              묶음 {groupFilter} · {groupRows.length}건
              {groupRows[0] && <span className="font-medium text-indigo-600"> · {groupRows[0].company_name || groupRows[0].corp_name || groupRows[0].inquiry?.company_name || ''}</span>}
            </span>
          </div>
          {groupRows.length === 0 ? (
            <span className="text-xs text-indigo-600">이 묶음 번호로 발행된 건이 없습니다 (되돌렸거나 번호가 다릅니다)</span>
          ) : (
            <div className="flex items-center gap-3 text-xs text-indigo-700">
              <span>공급가 <b>{formatKRW(groupSupply)}</b></span>
              <span>부가세 <b>{formatKRW(groupVat)}</b></span>
              <span>합계 <b className="text-sm">{formatKRW(groupTotal)}</b></span>
              {groupBalance > 0 && <span className="text-red-600">미수 <b>{formatKRW(groupBalance)}</b></span>}
              {groupRows[0]?.tax_invoice_issued_at && <span className="text-indigo-500">처리 {formatIssuedAt(groupRows[0].tax_invoice_issued_at, true)}</span>}
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto">
            {groupRows.length > 0 && (
              <button
                onClick={() => copyText(itemText(groupRows), '품목 문구')}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100 flex items-center gap-1">
                <Copy className="h-3 w-3" />품목 문구 복사
              </button>
            )}
            <button onClick={() => setGroupFilter(null)} className="text-xs px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-1">
              <X className="h-3 w-3" />묶음 보기 닫기
            </button>
          </div>
        </div>
      )}

      {/* 목록 */}
      <div className={`bg-white rounded-xl overflow-hidden shadow-sm border-2 ${
        groupFilter ? 'border-indigo-300' : viewTab === 'unissued' ? 'border-red-200' : viewTab === 'issued' ? 'border-green-200' : 'border-blue-200'
      }`}>
        <div className={`px-4 py-3 border-b-2 flex items-center gap-2 ${
          viewTab === 'unissued' ? 'bg-red-50 border-red-200' : viewTab === 'issued' ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'
        }`}>
          {viewTab === 'unissued' ? <AlertCircle className="h-4 w-4 text-red-600" />
            : viewTab === 'issued' ? <CheckCircle2 className="h-4 w-4 text-green-600" />
            : <Receipt className="h-4 w-4 text-blue-600" />}
          <h3 className={`font-bold text-sm ${viewTab === 'unissued' ? 'text-red-700' : viewTab === 'issued' ? 'text-green-700' : 'text-blue-700'}`}>
            {groupFilter ? `같이 발행된 건 (${current.length}건)` : viewTab === 'unissued' ? `미발행 세금계산서 (${current.length}건)` : viewTab === 'issued' ? `발행완료 이력 (${current.length}건)` : `전체 목록 (${current.length}건)`}
          </h3>
        </div>

        {current.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">
            {viewTab === 'unissued' ? '미발행 건이 없습니다 ✅' : '발행 이력이 없습니다.'}
          </div>
        ) : (
          <div className={`divide-y divide-gray-100 ${viewTab === 'issued' ? 'opacity-80' : ''}`}>
            {current.map(s => (
              <TaxRow
                key={s.id}
                row={s}
                issued={viewTab === 'issued' || (!!groupFilter && !!s.tax_invoice_issued)}
                selectable={viewTab === 'unissued' && !groupFilter}
                selected={selected.has(s.id)}
                onToggle={() => toggleSelect(s)}
                dupCount={viewTab === 'unissued' && !groupFilter ? (dupCount.get(bizKey(s)) || 0) : 0}
                onSelectDup={() => selectAllOf(s)}
                groupMates={s.tax_invoice_group ? rows.filter(r => r.tax_invoice_group === s.tax_invoice_group && r.id !== s.id) : []}
                onShowGroup={s.tax_invoice_group ? () => setGroupFilter(s.tax_invoice_group!) : undefined}
                history={s.finalEstimate ? historyOf(s.finalEstimate, s.items || [], revisions) : []}
                action={!s.tax_invoice_issued ? (
                  <Button
                    size="sm"
                    onClick={() => handleIssue(s.id)}
                    disabled={processing === s.id}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                  >
                    {processing === s.id ? '처리중...' : '발행완료 처리'}
                  </Button>
                ) : (
                  <Button
                    size="sm" variant="ghost"
                    className="text-xs text-gray-500 hover:text-red-600"
                    onClick={() => handleRevert(s)}
                    disabled={processing === s.id}
                  >
                    되돌리기
                  </Button>
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* 합산 발행 바 — 미발행 탭에서 1건 이상 고르면 화면 아래에 붙는다 */}
      {viewTab === 'unissued' && !groupFilter && selectedRows.length > 0 && (
        <div className="sticky bottom-3 z-10 bg-gray-900 text-white rounded-xl shadow-xl px-5 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-amber-300" />
            <span className="font-bold text-sm">
              {selectedRows[0].company_name || selectedRows[0].corp_name || selectedRows[0].inquiry?.company_name || '업체'} · {selectedRows.length}건 선택
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-300">
            <span>공급가 <b className="text-white">{formatKRW(selSupply)}</b></span>
            <span>부가세 <b className="text-white">{formatKRW(selVat)}</b></span>
            <span>합계 <b className="text-amber-300 text-sm">{formatKRW(selTotal)}</b></span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => copyText(String(selSupply), '공급가액')}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 flex items-center gap-1">
              <Copy className="h-3 w-3" />공급가 복사
            </button>
            <button
              onClick={() => copyText(itemText(selectedRows), '품목 문구')}
              title={itemText(selectedRows)}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 flex items-center gap-1">
              <Copy className="h-3 w-3" />품목 문구 복사
            </button>
            <Button
              size="sm"
              onClick={handleIssueGroup}
              disabled={selectedRows.length < 2 || processing === 'group'}
              title={selectedRows.length < 2 ? '2건 이상 골라야 합산할 수 있습니다' : undefined}
              className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold">
              {processing === 'group' ? '처리중...' : `${selectedRows.length}건 합산 발행완료`}
            </Button>
            <button onClick={() => setSelected(new Set())} className="p-1.5 rounded-lg hover:bg-gray-700" title="선택 해제">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// 세금계산서 행 컴포넌트
function TaxRow({
  row, action, issued = false,
  selectable = false, selected = false, onToggle, dupCount = 0, onSelectDup, groupMates = [], onShowGroup, history = [],
}: {
  row: SettRow
  action: React.ReactNode
  issued?: boolean
  selectable?: boolean
  selected?: boolean
  onToggle?: () => void
  dupCount?: number          // 미발행 목록에서 같은 업체가 몇 건인지 (자기 포함)
  onSelectDup?: () => void   // 같은 업체 건 전부 선택
  groupMates?: SettRow[]     // 같은 묶음으로 발행된 다른 건들
  onShowGroup?: () => void   // 묶음만 모아 보기
  history?: HistoryEntry[]   // 확정 견적의 변경 이력
}) {
  const [open, setOpen] = useState(false)

  const inq = row.inquiry

  // 파견일자
  const eventPeriod = inq?.event_start
    ? inq.event_end && inq.event_end !== inq.event_start
      ? `${inq.event_start.slice(0,10)} ~ ${inq.event_end.slice(0,10)}`
      : inq.event_start.slice(0,10)
    : null

  // 현장주소
  const siteAddr = inq?.location || row.site_address || null

  // 사업장주소 (세금계산서용)
  const bizAddr = row.biz_address || row.customer?.address || null

  // 잔액
  const balance = row.balance ?? (row.invoice_amount - row.received_amount)

  // 견적서 품목 요약 (role_name 기준 중복 제거 후 나열)
  const itemSummary = (() => {
    if (!row.items || row.items.length === 0) return null
    const roleMap = new Map<string, number>()
    row.items.forEach(it => {
      if (!it.role_name) return
      roleMap.set(it.role_name, (roleMap.get(it.role_name) || 0) + (it.quantity || 1))
    })
    return Array.from(roleMap.entries())
      .map(([name, qty]) => `${name} ${qty}명`)
      .join(', ')
  })()

  return (
    <div>
      <div
        className={`flex items-start gap-3 px-4 py-3.5 hover:bg-gray-50 cursor-pointer ${selected ? 'bg-amber-50' : ''} ${row.tax_invoice_group ? 'border-l-4 border-indigo-300' : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            onClick={e => e.stopPropagation()}
            className="mt-1.5 h-4 w-4 accent-emerald-600 shrink-0 cursor-pointer"
            title="합산 발행할 건 고르기"
          />
        )}
        <div className="shrink-0 text-gray-400 mt-1">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </div>

        <div className="flex-1 min-w-0">
          {/* 행사명 — 가장 크게 */}
          {inq?.event_name && (
            <p className="font-bold text-gray-900 text-sm leading-tight mb-0.5 truncate">
              {inq.event_name}
            </p>
          )}

          {/* 업체명 + 상태 배지 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-800 font-semibold">
              {row.company_name || inq?.company_name || '업체명 미정'}
            </span>
            {inq?.status && (
              <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">{inq.status}</span>
            )}
            {inq?.category && (
              <span className="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-medium">{inq.category}</span>
            )}
            {issued && (
              <span className="text-xs text-green-700 font-semibold bg-green-50 px-1.5 py-0.5 rounded">✓ 발행완료</span>
            )}
            {row.tax_invoice_issued && (
              formatIssuedAt(row.tax_invoice_issued_at)
                ? <span className="text-xs text-gray-500 font-medium" title={`발행완료 처리 ${formatIssuedAt(row.tax_invoice_issued_at, true)}`}>🕒 {formatIssuedAt(row.tax_invoice_issued_at)}</span>
                : <span className="text-xs text-gray-400" title="시각 기록 칸이 생기기 전에 처리됐거나, 마감 편집 폼 체크로 처리된 건">처리시각 기록 없음</span>
            )}
            {row.tax_invoice_group && (
              <button
                onClick={e => { e.stopPropagation(); onShowGroup?.() }}
                className="text-xs text-indigo-700 font-semibold bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                title={`묶음 ${row.tax_invoice_group} — 누르면 같이 발행된 건만 모아 봅니다${groupMates.length ? '\n같이 발행: ' + groupMates.map(m => m.inquiry?.event_name || m.site_name || '').join(', ') : ''}`}>
                <Layers className="h-3 w-3" />합산 발행 {groupMates.length + 1}건
              </button>
            )}
            {selectable && dupCount >= 2 && (
              <button
                onClick={e => { e.stopPropagation(); onSelectDup?.() }}
                className="text-xs text-amber-800 font-semibold bg-amber-100 hover:bg-amber-200 px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                title="이 업체의 미발행 건을 모두 선택">
                <Layers className="h-3 w-3" />같은 업체 {dupCount}건 모두 선택
              </button>
            )}
            {/* 입금 상태 배지 — 메인 행에 바로 표시 */}
            {row.deposit_status === '입금완료'
              ? <span className="text-xs bg-green-100 text-green-700 font-semibold px-1.5 py-0.5 rounded">💰 입금완료</span>
              : row.deposit_status === '부분입금'
              ? <span className="text-xs bg-yellow-100 text-yellow-700 font-semibold px-1.5 py-0.5 rounded">💰 부분입금</span>
              : <span className="text-xs bg-red-50 text-red-600 font-semibold px-1.5 py-0.5 rounded">💰 미입금</span>
            }
            {balance > 0 && (
              <span className="text-xs bg-red-50 text-red-600 font-semibold px-1.5 py-0.5 rounded">잔액 {formatKRW(balance)}</span>
            )}
          </div>

          {/* 일정·장소·인원 + 경과일 */}
          <div className="flex items-center gap-3 text-xs text-gray-600 mt-1 flex-wrap">
            {eventPeriod && <span>📅 {eventPeriod}</span>}
            {siteAddr && <span className="truncate max-w-[180px]">📍 {siteAddr}</span>}
            {inq?.required_staff ? <span>👤 {inq.required_staff}명</span> : null}
            <ElapsedBadge days={elapsedDays(inq?.event_end || inq?.event_start)} />
          </div>

          {/* 견적서 품목 */}
          {itemSummary && (
            <p className="text-xs text-indigo-600 font-medium mt-0.5">
              📋 {itemSummary}
            </p>
          )}

          {/* 금액 요약 */}
          <div className="flex items-center gap-3 text-xs text-gray-600 font-medium mt-0.5 flex-wrap">
            <span>공급가 <b className="text-gray-800">{formatKRW(row.supply_price)}</b></span>
            <span>청구 <b className="text-gray-800">{formatKRW(row.invoice_amount || row.supply_price + row.vat)}</b></span>
          </div>
        </div>

        <div onClick={e => e.stopPropagation()} className="shrink-0 mt-1">{action}</div>
      </div>

      {/* 세금계산서 상세 정보 */}
      {open && (
        <div className="bg-slate-50 px-8 py-4 border-t-2 border-dashed border-gray-300 space-y-4">
          {/* 발행하다 견적이 잘못된 걸 알면 여기서 바로 그 견적으로 — 새 탭이라 이 자리는 그대로 */}
          <RelatedLinks inquiryId={row.inquiry_id} eventName={inq?.event_name} companyName={row.company_name || inq?.company_name} hide={['세금계산서']} />

          {/* 세금계산서 발행정보 */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3 border-b border-gray-100 pb-2">세금계산서 발행 정보</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <InfoItem label="🏢 사업자번호"   value={row.biz_number} />
              <InfoItem label="🏗️ 법인명"        value={row.corp_name} />
              <InfoItem label="👤 대표자"        value={row.rep_name} />
              <InfoItem label="📧 이메일"        value={row.email} />
              <InfoItem label="📞 연락처"        value={row.contact_phone} />
              <InfoItem label="📋 내용(품목)"    value={row.item_description} />
              {row.tax_invoice_issued && (
                <InfoItem label="🕒 발행완료 처리" value={formatIssuedAt(row.tax_invoice_issued_at, true) || '기록 없음'} />
              )}
            </div>
          </div>

          {/* 주소 정보 */}
          {(siteAddr || bizAddr) && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3 border-b border-gray-100 pb-2">주소 정보</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {siteAddr && (
                  <div className="flex items-start gap-1.5 bg-blue-50 rounded-lg px-3 py-2">
                    <MapPin className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-2xs text-blue-400 font-semibold block">현장주소</span>
                      <span className="text-xs text-gray-700">{siteAddr}</span>
                    </div>
                  </div>
                )}
                {bizAddr && (
                  <div className="flex items-start gap-1.5 bg-purple-50 rounded-lg px-3 py-2">
                    <Building2 className="h-3.5 w-3.5 text-purple-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-2xs text-purple-400 font-semibold block">사업장주소</span>
                      <span className="text-xs text-gray-700">{bizAddr}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 금액 정보 */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3 border-b border-gray-100 pb-2">금액 정보</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <AmountItem label="💰 공급가액"      value={row.supply_price} />
              <AmountItem label="💰 부가세"         value={row.vat} />
              <AmountItem label="💰 청구금액(합계)" value={row.invoice_amount || row.supply_price + row.vat} highlight />
              <AmountItem label="🔴 잔액"           value={balance} danger={balance > 0} />
            </div>
            {/* 견적 변경 이력 — 품목 단위로 "스탭 1명 → 2명", 고친 시각까지 */}
            {row.finalEstimate && (history.length > 0 || row.finalEstimate.prev_total_price != null) && (
              <div className="mt-3 pt-3 border-t border-dashed border-gray-200 space-y-1">
                <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider">견적 변경 이력 ({row.finalEstimate.version_label || 'A안'})</p>
                <EstimateHistoryList
                  entries={history}
                  legacy={{ prevTotal: row.finalEstimate.prev_total_price, prevItems: row.finalEstimate.prev_items_summary, total: row.finalEstimate.total_price, updatedAt: row.finalEstimate.updated_at }}
                />
                {row.finalEstimate.total_price !== (row.invoice_amount || row.supply_price + row.vat) && (
                  <p className="text-2xs text-orange-600">※ 확정 견적 합계 {formatKRW(row.finalEstimate.total_price)} 와 청구금액이 다릅니다</p>
                )}
              </div>
            )}
          </div>

          {/* 견적 품목 — 업체입금 탭과 같은 표. 홈택스 품목란을 채울 때 인원·단가를 여기서 본다 */}
          <EstimateItemsTable items={row.items || []} />

          {/* 같이 발행된 건 */}
          {groupMates.length > 0 && (
            <div className="bg-indigo-50 border-2 border-indigo-200 rounded-lg px-4 py-3">
              <p className="text-xs text-indigo-700 font-bold mb-1.5">🧾 세금계산서 한 장으로 같이 발행된 건 ({groupMates.length + 1}건 · 묶음 {row.tax_invoice_group})</p>
              <ul className="text-sm text-gray-700 space-y-0.5">
                <li className="font-semibold">· {row.inquiry?.event_name || row.site_name || '-'} — {formatKRW(row.supply_price)} (이 건)</li>
                {groupMates.map(m => (
                  <li key={m.id}>· {m.inquiry?.event_name || m.site_name || '-'} — {formatKRW(m.supply_price)}</li>
                ))}
              </ul>
              <p className="text-xs text-indigo-600 mt-1.5 flex items-center gap-2 flex-wrap">
                <span>공급가 합계 <b>{formatKRW(row.supply_price + groupMates.reduce((a, m) => a + (m.supply_price || 0), 0))}</b>
                {formatIssuedAt(row.tax_invoice_issued_at, true) && <> · 처리 {formatIssuedAt(row.tax_invoice_issued_at, true)}</>}</span>
                {onShowGroup && (
                  <button onClick={e => { e.stopPropagation(); onShowGroup() }} className="underline hover:text-indigo-800">묶음만 모아 보기 →</button>
                )}
              </p>
            </div>
          )}

          {/* 메모 */}
          {row.invoice_request && (
            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg px-4 py-3">
              <p className="text-xs text-yellow-700 font-bold mb-1">📝 메모</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{row.invoice_request}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function InfoItem({ label, value, className = '' }: { label: string; value?: string | null; className?: string }) {
  if (!value) return null
  return (
    <div className={className}>
      <span className="text-2xs text-gray-500 font-bold block mb-0.5">{label}</span>
      <span className="text-sm text-gray-800 font-semibold">{value}</span>
    </div>
  )
}

function AmountItem({ label, value, highlight, danger }: {
  label: string; value: number; highlight?: boolean; danger?: boolean
}) {
  return (
    <div className={`rounded-lg px-3 py-2 ${highlight ? 'bg-indigo-50' : danger && value > 0 ? 'bg-red-50' : 'bg-white border border-gray-100'}`}>
      <span className="text-2xs text-gray-400 font-semibold block">{label}</span>
      <span className={`text-xs font-bold ${highlight ? 'text-indigo-700' : danger && value > 0 ? 'text-red-600' : 'text-gray-700'}`}>
        {formatKRW(value)}
      </span>
    </div>
  )
}
