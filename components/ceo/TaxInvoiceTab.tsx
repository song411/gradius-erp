'use client'

import { useState } from 'react'
import { db } from '@/lib/supabase/api'
import { formatKRW } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, CheckCircle2, AlertCircle, Receipt, MapPin, Building2 } from 'lucide-react'
import type { CeoData } from './CeoContent'
import type { Settlement, Inquiry, Customer } from '@/lib/supabase/types'
import { toast } from 'sonner'

// 체결 이후 단계만 세금계산서 관리 대상
const TAX_STATUSES = ['체결', '배정완료', '진행중', '완료', '정산완료']

interface SettRow extends Settlement {
  inquiry?: Inquiry
  customer?: Customer
}

export default function TaxInvoiceTab({ data }: { data: CeoData }) {
  const { settlements, inquiries, customers, reload } = data
  const [historyOpen, setHistoryOpen] = useState(false)
  const [processing, setProcessing]   = useState<string | null>(null)

  // 고객사 맵 (id → customer)
  const customerMap = new Map(customers.map(c => [c.id, c]))

  // 체결 이후 정산 건만 대상
  const rows: SettRow[] = settlements
    .map(s => {
      const inquiry  = inquiries.find(q => q.id === s.inquiry_id)
      const customer = inquiry?.customer_id ? customerMap.get(inquiry.customer_id) : undefined
      return { ...s, inquiry, customer }
    })
    .filter(s => TAX_STATUSES.includes(s.inquiry?.status || ''))
    .sort((a, b) => (a.inquiry?.event_start || '').localeCompare(b.inquiry?.event_start || ''))

  const unissued = rows.filter(s => !s.tax_invoice_issued)
  const issued   = rows.filter(s => s.tax_invoice_issued)

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

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard icon={<AlertCircle className="h-5 w-5" />} label="미발행" count={unissued.length} color="red"
          sub={formatKRW(unissued.reduce((s, r) => s + r.supply_price, 0))} />
        <SummaryCard
          icon={<CheckCircle2 className="h-5 w-5" />} label="발행완료" count={issued.length} color="green"
          sub={formatKRW(issued.reduce((s, r) => s + r.supply_price, 0))}
          onClick={() => setHistoryOpen(v => !v)}
          active={historyOpen}
        />
        <SummaryCard icon={<Receipt className="h-5 w-5" />} label="전체 체결" count={rows.length} color="blue"
          sub={formatKRW(rows.reduce((s, r) => s + r.supply_price, 0))} />
      </div>

      {/* 미발행 목록 */}
      <div className="bg-white rounded-xl border-2 border-red-200 overflow-hidden shadow-sm">
        <div className="bg-red-50 px-4 py-3 border-b-2 border-red-200 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <h3 className="font-bold text-red-700 text-sm">미발행 세금계산서 ({unissued.length}건)</h3>
        </div>
        {unissued.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">미발행 건이 없습니다 ✅</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {unissued.map(s => (
              <TaxRow
                key={s.id}
                row={s}
                action={
                  <Button
                    size="sm"
                    onClick={() => handleIssue(s.id)}
                    disabled={processing === s.id}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                  >
                    {processing === s.id ? '처리중...' : '발행완료 처리'}
                  </Button>
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* 발행완료 이력 (접기/펼치기) */}
      <div className="bg-white rounded-xl border-2 border-green-200 overflow-hidden shadow-sm">
        <button
          className="w-full bg-green-50 px-4 py-3 border-b-2 border-green-200 flex items-center justify-between hover:bg-green-100 transition-colors"
          onClick={() => setHistoryOpen(v => !v)}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <h3 className="font-semibold text-green-700 text-sm">발행완료 이력 ({issued.length}건)</h3>
          </div>
          {historyOpen
            ? <ChevronDown className="h-4 w-4 text-green-600" />
            : <ChevronRight className="h-4 w-4 text-green-600" />
          }
        </button>

        {historyOpen && (
          issued.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">발행 이력이 없습니다.</div>
          ) : (
            <div className="divide-y divide-gray-100 opacity-80">
              {issued.map(s => (
                <TaxRow
                  key={s.id}
                  row={s}
                  issued
                  action={
                    <Button
                      size="sm" variant="ghost"
                      className="text-xs text-gray-500 hover:text-red-600"
                      onClick={() => handleRevert(s.id)}
                      disabled={processing === s.id}
                    >
                      되돌리기
                    </Button>
                  }
                />
              ))}
            </div>
          )
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

  // 현장주소: 파견 행사장 주소 (inquiry.location → settlement.site_address 순)
  const siteAddr = inq?.location || row.site_address || null

  // 사업장주소: 세금계산서용 회사 등록 주소 (settlement.biz_address 우선, 없으면 customers.address)
  const bizAddr = row.biz_address || row.customer?.address || null

  // 잔액
  const balance = row.balance ?? (row.invoice_amount - row.received_amount)

  return (
    <div>
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
        onClick={() => setOpen(v => !v)}
      >
        <div className="shrink-0 text-gray-400">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-gray-800">
              {row.company_name || inq?.company_name || '업체명 미정'}
            </span>
            {inq?.event_name && (
              <span className="text-xs text-gray-400 truncate">| {inq.event_name}</span>
            )}
            {inq?.status && (
              <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{inq.status}</span>
            )}
            {inq?.category && (
              <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">{inq.category}</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5 flex-wrap">
            {eventPeriod && <span>📅 {eventPeriod}</span>}
            {siteAddr && <span className="truncate max-w-[180px]">📍 {siteAddr}</span>}
            {inq?.required_staff ? <span>👤 {inq.required_staff}명</span> : null}
            <span>공급가: {formatKRW(row.supply_price)}</span>
            <span>청구액: {formatKRW(row.invoice_amount || row.supply_price + row.vat)}</span>
            {balance > 0 && <span className="text-red-500">잔액: {formatKRW(balance)}</span>}
          </div>
          {(row.item_description) && (
            <div className="text-[11px] text-gray-400 mt-0.5">
              📋 품목: <span className="text-gray-600">{row.item_description}</span>
            </div>
          )}
        </div>
        {issued && (
          <span className="text-xs text-green-600 shrink-0 font-medium">✓ 발행완료</span>
        )}
        <div onClick={e => e.stopPropagation()}>{action}</div>
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

function SummaryCard({ label, count, color, icon, sub, onClick, active }: {
  label: string; count: number; color: string; icon: React.ReactNode; sub: string
  onClick?: () => void; active?: boolean
}) {
  const styles: Record<string, string> = {
    red:   'bg-red-50 border-2 border-red-300 text-red-700 shadow-sm',
    green: 'bg-green-50 border-2 border-green-300 text-green-700 shadow-sm',
    blue:  'bg-blue-50 border-2 border-blue-300 text-blue-700 shadow-sm',
  }
  const activeStyles: Record<string, string> = {
    green: 'ring-2 ring-green-400',
  }
  return (
    <div
      className={`rounded-xl p-4 flex items-start gap-3 ${styles[color]} ${onClick ? 'cursor-pointer hover:brightness-95 transition-all select-none' : ''} ${active && activeStyles[color] ? activeStyles[color] : ''}`}
      onClick={onClick}
    >
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold opacity-80">{label}</p>
          {onClick && (
            <span className="text-[10px] opacity-60">{active ? '▲ 접기' : '▼ 보기'}</span>
          )}
        </div>
        <p className="text-2xl font-extrabold">{count}<span className="text-sm font-normal ml-0.5">건</span></p>
        {sub && <p className="text-xs font-medium opacity-70 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}
