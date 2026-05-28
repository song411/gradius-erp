'use client'

import { useState } from 'react'
import { db } from '@/lib/supabase/api'
import { formatKRW } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronDown, ChevronRight, CheckCircle2, AlertCircle, Receipt, MapPin, Building2, Search } from 'lucide-react'
import type { CeoData } from './CeoContent'
import type { Settlement, Inquiry, Customer, EstimateItem } from '@/lib/supabase/types'
import { toast } from 'sonner'

// 체결 이후 단계만 세금계산서 관리 대상
const TAX_STATUSES = ['체결', '배정완료', '진행중', '완료', '정산완료']

import { PeriodFilter, isInPeriodFn, type PeriodState } from './PeriodFilter'

interface SettRow extends Settlement {
  inquiry?: Inquiry
  customer?: Customer
  items?: EstimateItem[]
}

type ViewTab = 'unissued' | 'issued' | 'all'
type SortKey = '기본순' | '경과일순(긴급)' | '최신순'

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
  const { settlements, inquiries, customers, estimateItems, reload } = data
  const [viewTab, setViewTab]         = useState<ViewTab>('unissued')
  const [sortKey, setSortKey]         = useState<SortKey>('기본순')
  const [processing, setProcessing]   = useState<string | null>(null)
  const [search, setSearch]           = useState('')
  const [periodState, setPeriodState] = useState<PeriodState>({ period: '전체', customFrom: '', customTo: '' })

  // 고객사 맵 (id → customer)
  const customerMap = new Map(customers.map(c => [c.id, c]))

  // 체결 이후 정산 건만 대상
  const rows: SettRow[] = settlements
    .map(s => {
      const inquiry  = inquiries.find(q => q.id === s.inquiry_id)
      const customer = inquiry?.customer_id ? customerMap.get(inquiry.customer_id) : undefined
      const items    = estimateItems.filter(it => it.inquiry_id === s.inquiry_id)
      return { ...s, inquiry, customer, items }
    })
    .filter(s => TAX_STATUSES.includes(s.inquiry?.status || ''))
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
    return list  // 기본순: event_start 오름차순 (이미 rows에서 정렬됨)
  }

  const base    = viewTab === 'unissued' ? unissued : viewTab === 'issued' ? issued : periodFiltered
  const current = sortList(applySearch(base))

  async function handleIssue(id: string) {
    setProcessing(id)
    try {
      await db.update('settlements', id, { tax_invoice_issued: true })
      toast.success('발행완료로 처리되었습니다.')
      reload()
    } catch {
      toast.error('처리 중 오류가 발생했습니다.')
    } finally {
      setProcessing(null)
    }
  }

  async function handleRevert(id: string) {
    if (!confirm('발행완료를 취소하고 미발행으로 되돌리시겠습니까?')) return
    setProcessing(id)
    try {
      await db.update('settlements', id, { tax_invoice_issued: false })
      toast.success('미발행으로 되돌렸습니다.')
      reload()
    } catch {
      toast.error('처리 중 오류가 발생했습니다.')
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
          {(['기본순', '경과일순(긴급)', '최신순'] as SortKey[]).map(s => (
            <button key={s} onClick={() => setSortKey(s)}
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
          onClick={() => setViewTab('unissued')}
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
            <span className="ml-auto text-[10px] text-red-500 font-bold self-end">▶ 보는 중</span>
          )}
        </button>

        <button
          onClick={() => setViewTab('issued')}
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
            <span className="ml-auto text-[10px] text-green-600 font-bold self-end">▶ 보는 중</span>
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
            <span className="ml-auto text-[10px] text-blue-600 font-bold self-end">▶ 보는 중</span>
          )}
        </button>
      </div>

      {/* 목록 */}
      <div className={`bg-white rounded-xl overflow-hidden shadow-sm border-2 ${
        viewTab === 'unissued' ? 'border-red-200' : viewTab === 'issued' ? 'border-green-200' : 'border-blue-200'
      }`}>
        <div className={`px-4 py-3 border-b-2 flex items-center gap-2 ${
          viewTab === 'unissued' ? 'bg-red-50 border-red-200' : viewTab === 'issued' ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'
        }`}>
          {viewTab === 'unissued' ? <AlertCircle className="h-4 w-4 text-red-600" />
            : viewTab === 'issued' ? <CheckCircle2 className="h-4 w-4 text-green-600" />
            : <Receipt className="h-4 w-4 text-blue-600" />}
          <h3 className={`font-bold text-sm ${viewTab === 'unissued' ? 'text-red-700' : viewTab === 'issued' ? 'text-green-700' : 'text-blue-700'}`}>
            {viewTab === 'unissued' ? `미발행 세금계산서 (${current.length}건)` : viewTab === 'issued' ? `발행완료 이력 (${current.length}건)` : `전체 목록 (${current.length}건)`}
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
                issued={viewTab === 'issued'}
                action={viewTab === 'unissued' ? (
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
                    onClick={() => handleRevert(s.id)}
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
    </div>
  )
}

// 세금계산서 행 컴포넌트
function TaxRow({
  row, action, issued = false,
}: {
  row: SettRow
  action: React.ReactNode
  issued?: boolean
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
        className="flex items-start gap-3 px-4 py-3.5 hover:bg-gray-50 cursor-pointer"
        onClick={() => setOpen(v => !v)}
      >
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
                      <span className="text-[10px] text-blue-400 font-semibold block">현장주소</span>
                      <span className="text-xs text-gray-700">{siteAddr}</span>
                    </div>
                  </div>
                )}
                {bizAddr && (
                  <div className="flex items-start gap-1.5 bg-purple-50 rounded-lg px-3 py-2">
                    <Building2 className="h-3.5 w-3.5 text-purple-400 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-[10px] text-purple-400 font-semibold block">사업장주소</span>
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
          </div>

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
      <span className="text-[10px] text-gray-500 font-bold block mb-0.5">{label}</span>
      <span className="text-sm text-gray-800 font-semibold">{value}</span>
    </div>
  )
}

function AmountItem({ label, value, highlight, danger }: {
  label: string; value: number; highlight?: boolean; danger?: boolean
}) {
  return (
    <div className={`rounded-lg px-3 py-2 ${highlight ? 'bg-indigo-50' : danger && value > 0 ? 'bg-red-50' : 'bg-white border border-gray-100'}`}>
      <span className="text-[10px] text-gray-400 font-semibold block">{label}</span>
      <span className={`text-xs font-bold ${highlight ? 'text-indigo-700' : danger && value > 0 ? 'text-red-600' : 'text-gray-700'}`}>
        {formatKRW(value)}
      </span>
    </div>
  )
}
