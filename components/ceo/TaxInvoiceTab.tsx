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
      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard icon={<AlertCircle className="h-5 w-5" />} label="미발행" count={unissued.length} color="red"
          sub={formatKRW(unissued.reduce((s, r) => s + r.supply_price, 0))} />
        <SummaryCard icon={<CheckCircle2 className="h-5 w-5" />} label="발행완료" count={issued.length} color="green"
          sub={formatKRW(issued.reduce((s, r) => s + r.supply_price, 0))} />
        <SummaryCard icon={<Receipt className="h-5 w-5" />} label="전체 체결" count={rows.length} color="blue"
          sub={formatKRW(rows.reduce((s, r) => s + r.supply_price, 0))} />
      </div>

      {/* 미발행 목록 */}
      <div className="bg-white rounded-xl border border-red-100 overflow-hidden">
        <div className="bg-red-50 px-4 py-3 border-b border-red-100 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <h3 className="font-semibold text-red-700 text-sm">미발행 세금계산서 ({unissued.length}건)</h3>
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
      <div className="bg-white rounded-xl border border-green-100 overflow-hidden">
        <button
          className="w-full bg-green-50 px-4 py-3 border-b border-green-100 flex items-center justify-between hover:bg-green-100 transition-colors"
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
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5 flex-wrap">
            {eventPeriod && <span>📅 {eventPeriod}</span>}
            <span>공급가: {formatKRW(row.supply_price)}</span>
            <span>청구액: {formatKRW(row.invoice_amount || row.supply_price + row.vat)}</span>
            {balance > 0 && <span className="text-red-500">잔액: {formatKRW(balance)}</span>}
          </div>
        </div>
        {issued && (
          <span className="text-xs text-green-600 shrink-0 font-medium">✓ 발행완료</span>
        )}
        <div onClick={e => e.stopPropagation()}>{action}</div>
      </div>

      {/* 세금계산서 상세 정보 */}
      {open && (
        <div className="bg-gray-50 px-8 py-4 border-t border-dashed border-gray-200 space-y-3">
          {/* 세금계산서 발행정보 */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">세금계산서 발행 정보</p>
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
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">주소 정보</p>
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
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">금액 정보</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <AmountItem label="💰 공급가액"      value={row.supply_price} />
              <AmountItem label="💰 부가세"         value={row.vat} />
              <AmountItem label="💰 청구금액(합계)" value={row.invoice_amount || row.supply_price + row.vat} highlight />
              <AmountItem label="🔴 잔액"           value={balance} danger={balance > 0} />
            </div>
          </div>

          {/* 메모 */}
          {row.invoice_request && (
            <div className="bg-yellow-50 border border-yellow-100 rounded-lg px-3 py-2">
              <p className="text-[10px] text-yellow-600 font-semibold mb-1">메모</p>
              <p className="text-xs text-gray-700 whitespace-pre-line">{row.invoice_request}</p>
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
      <span className="text-[10px] text-gray-400 font-semibold block">{label}</span>
      <span className="text-xs text-gray-700 font-medium">{value}</span>
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

function SummaryCard({ label, count, color, icon, sub }: {
  label: string; count: number; color: string; icon: React.ReactNode; sub: string
}) {
  const styles: Record<string, string> = {
    red:   'bg-red-50 border-red-200 text-red-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    blue:  'bg-blue-50 border-blue-200 text-blue-700',
  }
  return (
    <div className={`rounded-xl border p-4 flex items-start gap-3 ${styles[color]}`}>
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div>
        <p className="text-xs opacity-70">{label}</p>
        <p className="text-2xl font-bold">{count}<span className="text-sm font-normal ml-0.5">건</span></p>
        {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}
