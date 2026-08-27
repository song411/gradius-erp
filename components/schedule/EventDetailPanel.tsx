'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/lib/supabase/api'
import type {
  Assignment, Attendance, Estimate, EstimateItem, EventExpense, Inquiry, Payout, ProjectMemo,
} from '@/lib/supabase/types'
import { Dialog, DialogClose, DialogHeader } from '@/components/ui/dialog'
import { qtyUnit, daysUnit } from '@/lib/estimateUnits'
import ProjectMemoPanel from '@/components/memos/ProjectMemoPanel'
import {
  DOW, EMPTY_CONFIG,
  type JobBase, type ScheduleConfig,
  fmt, cleanStaffName, getDateRange, parseConfigs, buildJobs, makeCell,
  cellState, STATE_STYLE, STATUS_CHIP, actualPayRate, marginRate, payRateSuspicious,
} from './matrixCore'

interface Props {
  inquiry: Inquiry
  onClose: () => void
}

interface Loaded {
  estimate: Estimate | null
  items: EstimateItem[]
  jobs: JobBase[]
  assignments: Assignment[]     // 취소 제외
  cancelled: Assignment[]
  payouts: Payout[]
  attendances: Attendance[]
  expenses: EventExpense[]
  config: ScheduleConfig
}

// ─── 보조 표시 ────────────────────────────────────────────
function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">{label}</div>
      <div className="text-xs text-gray-800 break-words">{value === 0 ? 0 : (value || '-')}</div>
    </div>
  )
}

function Money({ label, value, suffix = '원', tone }: {
  label: string; value: number | null; suffix?: string
  tone?: 'good' | 'bad' | 'warn' | 'plain'
}) {
  const color = tone === 'good' ? 'text-green-700'
    : tone === 'bad'  ? 'text-red-600'
    : tone === 'warn' ? 'text-amber-600'
    : 'text-gray-900'
  return (
    <div className={`rounded-lg border px-3 py-2 ${
      tone === 'warn' ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200 bg-white'
    }`}>
      <div className="text-[10px] font-semibold text-gray-400 tracking-wide">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${color}`}>
        {value === null ? '-' : `${fmt(value)}${value ? suffix : ''}`}
      </div>
    </div>
  )
}

function Section({ title, note, children }: {
  title: string; note?: string; children: React.ReactNode
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h3 className="text-xs font-extrabold text-gray-700 tracking-wide">{title}</h3>
        {note && <span className="text-[10px] text-gray-400">{note}</span>}
      </div>
      {children}
    </section>
  )
}

/** 주민번호는 뒷자리를 가린다.
 *  주민번호 형식(숫자 13자리)이 아니면 아무것도 보여주지 않는다 —
 *  이 칸에 비밀번호 같은 엉뚱한 값이 저장된 레코드가 실제로 있어서,
 *  "형식이 아니면 원본 노출"로 두면 그대로 새어나간다. */
function maskId(v?: string) {
  if (!v) return '-'
  const digits = v.replace(/\D/g, '')
  if (digits.length !== 13) return '형식 아님'
  return `${digits.slice(0, 6)}-${digits[6]}******`
}

const ATT_COLOR: Record<string, string> = {
  출석: 'bg-green-50 text-green-700 border-green-200',
  지각: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  결근: 'bg-red-50 text-red-700 border-red-200',
  조퇴: 'bg-orange-50 text-orange-700 border-orange-200',
  외출: 'bg-blue-50 text-blue-700 border-blue-200',
}

const PAY_COLOR: Record<string, string> = {
  지급완료: 'bg-green-50 text-green-700 border-green-200',
  검토완료: 'bg-blue-50 text-blue-700 border-blue-200',
  대기:     'bg-gray-50 text-gray-500 border-gray-200',
  보류:     'bg-orange-50 text-orange-700 border-orange-200',
  미지급:   'bg-red-50 text-red-700 border-red-200',
}

// ═════════════════════════════════════════════════════════
export default function EventDetailPanel({ inquiry, onClose }: Props) {
  const [data, setData]       = useState<Loaded | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ests, assignsAll, memoRows, payouts, attendances, expenses] = await Promise.all([
        db.list<Estimate>('estimates',    { filters: { inquiry_id: inquiry.id }, order: 'created_at', asc: false }),
        db.list<Assignment>('assignments', { filters: { inquiry_id: inquiry.id }, order: 'assigned_at', asc: true }),
        db.list<ProjectMemo>('project_memos', { filters: { inquiry_id: inquiry.id }, order: 'created_at', asc: false })
          .catch(() => [] as ProjectMemo[]),
        db.list<Payout>('payouts',        { filters: { inquiry_id: inquiry.id }, order: 'created_at', asc: true })
          .catch(() => [] as Payout[]),
        db.list<Attendance>('attendances', { filters: { inquiry_id: inquiry.id }, order: 'work_date', asc: true })
          .catch(() => [] as Attendance[]),
        db.list<EventExpense>('event_expenses', { filters: { inquiry_id: inquiry.id }, order: 'created_at', asc: true })
          .catch(() => [] as EventExpense[]),
      ])

      const estimate = ests.find(e => e.is_final) ?? null
      const items = estimate
        ? await db.list<EstimateItem>('estimate_items', {
            filters: { estimate_id: estimate.id }, order: 'sort_order', asc: true,
          })
        : []

      const config = parseConfigs(
        memoRows.map(m => ({ id: m.id, inquiry_id: m.inquiry_id, content: m.content })),
      ).get(inquiry.id) ?? EMPTY_CONFIG

      const live      = assignsAll.filter(a => a.status !== '취소')
      const cancelled = assignsAll.filter(a => a.status === '취소')

      setData({
        estimate,
        items,
        jobs: buildJobs(items, live, config),
        assignments: live,
        cancelled,
        payouts,
        attendances,
        expenses,
        config,
      })
    } catch (e) {
      toast.error('상세 조회 실패: ' + (e as Error).message)
      onClose()
    } finally {
      setLoading(false)
    }
  }, [inquiry.id, onClose])

  useEffect(() => {
    let alive = true
    // 마이크로태스크로 미뤄 effect 동기 구간에서 setState하지 않는다
    Promise.resolve().then(() => { if (alive) load() })
    return () => { alive = false }
  }, [load])

  const start = inquiry.event_start?.substring(0, 10) ?? ''
  const end   = inquiry.event_end?.substring(0, 10) || start
  const dates = start ? getDateRange(start, end) : []

  // ── 금액 집계 ───────────────────────────────────────────
  const est = data?.estimate ?? null
  const supply = est?.supply_price ?? 0

  // 실제 인건비: assignments의 total_pay (없으면 단가 × 일수), 무급 인력 제외
  const laborActual = (data?.assignments ?? [])
    .filter(a => a.is_payable !== false)
    .reduce((s, a) => s + (a.total_pay ?? (a.pay_rate || 0) * (a.work_days || 1)), 0)

  const expenseTotal = (data?.expenses ?? []).reduce((s, x) => s + (x.amount || 0), 0)
  const realProfit   = supply ? supply - laborActual - expenseTotal : null
  const realRate     = supply && realProfit !== null ? (realProfit / supply) * 100 : null

  // 실제 인건비는 배정 단가·근무일수가 다 채워진 뒤에야 맞는다.
  // 아직 지급 전이거나, 견적 시점의 예상지급만 들어가 있거나, 팀 단위 일괄지급으로
  // 한 건에 몰려 있으면 합계가 실제와 어긋난다. 숫자를 감추지 말고
  // 믿을 수 없는 숫자임을 분명히 표시한다.
  const payables = (data?.assignments ?? []).filter(a => a.is_payable !== false)
  const zeroPay  = payables.filter(a => !(a.pay_rate || 0))
  const cost     = est?.cost_price ?? 0
  // 실제 인건비가 견적 원가의 60% 미만이면 단가나 근무일수가 덜 채워진 것으로 본다
  const farBelowCost = cost > 0 && laborActual < cost * 0.6
  const laborReasons = [
    zeroPay.length > 0
      ? `${payables.length}명 중 ${zeroPay.length}명의 지급단가가 0원 (${
          zeroPay.map(a => cleanStaffName(a.staff_name)).slice(0, 5).join(', ')
        }${zeroPay.length > 5 ? ` 외 ${zeroPay.length - 5}명` : ''})`
      : null,
    farBelowCost
      ? `합계 ${fmt(laborActual)}원이 견적 원가 ${fmt(cost)}원의 ${
          Math.round((laborActual / cost) * 100)}%뿐 — 아직 지급 전이거나, 견적 시점 예상지급만 들어가 있거나, 팀 일괄지급으로 한 건에 몰려 있을 수 있습니다`
      : null,
  ].filter(Boolean) as string[]
  const laborThin = laborReasons.length > 0

  const paidTotal = (data?.payouts ?? [])
    .filter(p => p.status === '지급완료')
    .reduce((s, p) => s + (p.final_pay || 0), 0)
  const payoutTotal = (data?.payouts ?? []).reduce((s, p) => s + (p.final_pay || 0), 0)

  const discountLabel = est && est.discount_type && est.discount_type !== 'none' && (est.discount_value ?? 0) > 0
    ? (est.discount_label
        || (est.discount_type === 'percentage'
              ? `${est.discount_value}% 할인`
              : `${fmt(est.discount_value ?? 0)}원 할인`))
    : null

  // 배정 id → 지급 상태
  const payoutByAsgn = new Map<string, Payout>()
  ;(data?.payouts ?? []).forEach(p => { if (p.assignment_id) payoutByAsgn.set(p.assignment_id, p) })

  return (
    <Dialog open onClose={onClose} className="max-w-[1280px]">
      <DialogHeader className="sticky top-0 bg-white z-10">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-extrabold text-gray-900 truncate">
              {inquiry.event_name || '(행사명 없음)'}
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">
              {inquiry.status}
            </span>
            {inquiry.inquiry_code && (
              <span className="text-[10px] text-gray-400 font-mono">{inquiry.inquiry_code}</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {inquiry.company_name || '-'}
            {start && ` · ${start}${end !== start ? ` ~ ${end}` : ''} (${dates.length}일)`}
            {inquiry.event_time && ` · ${inquiry.event_time}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/inquiries/${inquiry.id}`}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-400"
          >
            <ExternalLink className="h-3.5 w-3.5" /> 문의 상세
          </Link>
          <DialogClose onClose={onClose} />
        </div>
      </DialogHeader>

      <div className="p-5 space-y-6">
        {loading || !data ? (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">불러오는 중…</div>
        ) : (
          <>
            {/* ── 1. 행사 개요 ── */}
            <Section title="행사 개요">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3">
                <Field label="고객사"   value={inquiry.company_name} />
                <Field label="담당자"   value={inquiry.contact_name} />
                <Field label="연락처"   value={inquiry.phone} />
                <Field label="장소"     value={inquiry.location} />
                <Field label="행사시간" value={inquiry.event_time} />
                <Field label="서비스"   value={inquiry.service_type} />
                <Field label="카테고리" value={inquiry.category} />
                <Field label="복장"     value={inquiry.attire} />
                <Field label="식사"     value={inquiry.meal} />
                <Field label="주차"     value={inquiry.parking} />
                <Field label="관계"     value={inquiry.relationship} />
                <Field label="날짜메모" value={inquiry.date_memo} />
              </div>
              {(inquiry.notes || inquiry.memo || inquiry.consult_notes) && (
                <div className="rounded-lg border border-gray-200 p-3 space-y-2">
                  {inquiry.notes && <Field label="특이사항" value={inquiry.notes} />}
                  {inquiry.memo && <Field label="메모" value={inquiry.memo} />}
                  {inquiry.consult_notes && <Field label="상담 메모" value={inquiry.consult_notes} />}
                </div>
              )}
            </Section>

            {/* ── 2. 금액 ── */}
            <Section
              title="금액"
              note={est
                ? `확정 견적 ${est.version_label ? `(${est.version_label})` : ''} 기준`
                : '확정(최종) 견적이 없어 청구 금액을 산출할 수 없습니다'}
            >
              {discountLabel && (
                <div className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                  <span>
                    이 견적에는 <b>{discountLabel}</b>이 적용되어 있습니다.
                    아래 품목별 청구단가는 <b>할인 반영 전</b> 값이므로, 실제 청구액은 총 청구금액을 기준으로 보세요.
                  </span>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                <Money label="공급가액"        value={est ? est.supply_price : null} />
                <Money label="부가세"          value={est ? est.vat : null} />
                <Money label="총 청구금액"     value={est ? est.total_price : null} />
                <Money label="견적 원가"       value={est ? est.cost_price : null} />
                <Money
                  label={laborThin ? '실제 인건비 (미완)' : '실제 인건비'}
                  value={laborActual}
                  tone={laborThin ? 'warn' : 'plain'}
                />
                <Money label="부대비용"        value={expenseTotal} />
                <Money
                  label={laborThin ? '실이익 (참고용)' : '실이익 (공급가−인건비−부대)'}
                  value={realProfit}
                  tone={laborThin ? 'warn' : realProfit === null ? 'plain' : realProfit < 0 ? 'bad' : 'good'}
                />
              </div>
              {laborThin && (
                <div className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                  <span>
                    <b>실제 인건비가 덜 집계돼 실이익·실이익률이 실제보다 높게 나옵니다.</b>{' '}
                    수익 판단은 견적 이익률
                    {est?.profit_rate != null ? ` ${est.profit_rate.toFixed(1)}%` : ''}를 기준으로 하세요.
                    <ul className="list-disc list-inside mt-1 space-y-0.5">
                      {laborReasons.map(r => <li key={r}>{r}</li>)}
                    </ul>
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
                {est?.profit_rate != null && (
                  <span className="font-semibold text-gray-700">견적 이익률 {est.profit_rate.toFixed(1)}%</span>
                )}
                {realRate !== null && (
                  <span className={laborThin ? 'text-amber-600' : realRate < 0 ? 'text-red-600 font-semibold' : 'font-semibold text-gray-700'}>
                    실이익률 {realRate.toFixed(1)}%{laborThin ? ' (참고용)' : ''}
                  </span>
                )}
                <span>지급 예정 합계 {fmt(payoutTotal)}원 · 지급완료 {fmt(paidTotal)}원</span>
              </div>
            </Section>

            {/* ── 3. 견적 품목 ── */}
            <Section title="견적 품목" note={`${data.items.length}건`}>
              {data.items.length === 0 ? (
                <p className="text-xs text-gray-400">확정 견적 품목이 없습니다.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="px-2 py-2 text-left font-bold text-[11px] text-gray-600">구분</th>
                        <th className="px-2 py-2 text-left font-bold text-[11px] text-gray-600">품목 / 직무</th>
                        <th className="px-2 py-2 text-left font-bold text-[11px] text-gray-600">스펙</th>
                        <th className="px-2 py-2 text-center font-bold text-[11px] text-gray-600">수량</th>
                        <th className="px-2 py-2 text-center font-bold text-[11px] text-gray-600">
                          {data.items.every(it => daysUnit(it.days_unit) === '일') ? '일수' : '단위'}
                        </th>
                        <th className="px-2 py-2 text-right font-bold text-[11px] text-gray-600">청구단가</th>
                        <th className="px-2 py-2 text-right font-bold text-[11px] text-gray-600">지급단가</th>
                        <th className="px-2 py-2 text-right font-bold text-[11px] text-gray-600">청구 소계</th>
                        <th className="px-2 py-2 text-right font-bold text-[11px] text-gray-600">마진</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map(it => {
                        const sub = it.unit_price * it.quantity * (it.days || 1) - (it.discount || 0)
                        const mr  = marginRate(it.unit_price, it.pay_unit_price || 0)
                        return (
                          <tr key={it.id} className="border-t border-gray-100">
                            <td className="px-2 py-1.5 text-gray-500">{it.item_type || '-'}</td>
                            <td className="px-2 py-1.5 font-semibold text-gray-800">
                              {it.role_name || '-'}
                              {it.is_leader && <span className="ml-1 text-[9px] text-indigo-500 font-bold">팀장</span>}
                              {it.vat_exempt && <span className="ml-1 text-[9px] text-gray-400">면세</span>}
                            </td>
                            <td className="px-2 py-1.5 text-gray-500">{it.spec || '-'}</td>
                            <td className="px-2 py-1.5 text-center tabular-nums">
                              {it.quantity}
                              <span className="text-gray-400">{qtyUnit(it.quantity_unit)}</span>
                            </td>
                            <td className="px-2 py-1.5 text-center tabular-nums">
                              {it.days || 1}
                              <span className="text-gray-400">{daysUnit(it.days_unit)}</span>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {it.original_unit_price ? (
                                <span className="text-gray-300 line-through mr-1">{fmt(it.original_unit_price)}</span>
                              ) : null}
                              <span className="font-semibold">{fmt(it.unit_price)}</span>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">
                              {fmt(it.pay_unit_price)}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{fmt(sub)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {mr === null ? '-' : (
                                <span className={mr < 0 ? 'text-red-600 font-bold' : mr < 20 ? 'text-orange-600' : ''}>
                                  {mr.toFixed(1)}%
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* ── 4. 날짜 × 직무 매트릭스 ── */}
            <Section
              title="날짜별 배정 매트릭스"
              note={Object.keys(data.config.requiredOverrides).length > 0
                ? '필요인원 일부는 인원배정 화면에서 손으로 조정된 값입니다'
                : undefined}
            >
              {dates.length === 0 || data.jobs.length === 0 ? (
                <p className="text-xs text-gray-400">
                  {dates.length === 0 ? '행사 날짜가 설정되지 않았습니다.' : '직무 정보가 없습니다.'}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="border-collapse text-xs">
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-10 bg-gray-100 border border-gray-200 px-2 py-2 text-left
                          font-bold text-[11px] text-gray-600 min-w-[130px]">
                          직무 / 필요
                        </th>
                        {dates.map(d => {
                          const dt = new Date(d + 'T00:00:00')
                          const we = dt.getDay() === 0 || dt.getDay() === 6
                          return (
                            <th key={d} className={`border border-gray-200 px-1.5 py-1.5 text-center min-w-[110px]
                              ${we ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>
                              <div className="font-bold">{dt.getMonth() + 1}/{dt.getDate()}</div>
                              <div className="text-[10px] font-normal text-gray-400">{DOW[dt.getDay()]}</div>
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {data.jobs.map(job => (
                        <tr key={job.jobType}>
                          <td className="sticky left-0 z-10 bg-gray-50 border border-gray-200 px-2 py-1.5 align-top min-w-[130px]">
                            <div className="font-semibold text-gray-700">{job.label}</div>
                            <div className="text-[10px] text-gray-400">
                              {job.required > 0 ? `필요 ${job.required}명` : '견적 외'}
                              {job.billRate ? ` · 청구 ${fmt(job.billRate)}` : ''}
                            </div>
                          </td>
                          {dates.map(d => {
                            const c   = makeCell(job, d)
                            const st  = cellState(c.total, job.required)
                            const sty = STATE_STYLE[st]
                            const act = actualPayRate(c)
                            return (
                              <td key={d} className="border border-gray-100 px-1.5 py-1.5 align-top min-w-[110px]">
                                <div className="flex items-center justify-between mb-1 gap-1">
                                  <span className={`text-[10px] font-bold px-1 py-0.5 rounded border leading-none ${sty.chip}`}>
                                    {job.required > 0 ? `${c.total}/${job.required}` : `${c.total}명`}
                                  </span>
                                  {act.value > 0 && (
                                    <span className={`text-[9px] tabular-nums ${
                                      payRateSuspicious(job.billRate, act) ? 'text-amber-600 font-bold' : 'text-gray-400'
                                    }`}
                                      title={payRateSuspicious(job.billRate, act)
                                        ? '지급단가가 청구단가보다 큽니다 — 팀 일괄지급이거나 총액이 한 건에 잡힌 경우일 수 있습니다'
                                        : undefined}>
                                      {fmt(act.value)}
                                    </span>
                                  )}
                                  {act.mixed && (
                                    <span className="text-[9px] text-orange-500" title={act.list.map(v => fmt(v)).join(' / ')}>
                                      혼재
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-0.5">
                                  {c.pinned.map(a => (
                                    <span key={a.id}
                                      className={`text-[10px] leading-none px-1 py-0.5 rounded border
                                        ${STATUS_CHIP[a.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                                      {cleanStaffName(a.staff_name)}
                                    </span>
                                  ))}
                                  {c.allPeriod.map(a => (
                                    <span key={a.id}
                                      className="text-[10px] leading-none px-1 py-0.5 rounded border border-dashed border-gray-300 text-gray-500"
                                      title="날짜 미지정 = 전체기간 투입">
                                      {cleanStaffName(a.staff_name)}<span className="text-[9px] text-gray-400 ml-0.5">전</span>
                                    </span>
                                  ))}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* ── 5. 배정 인원 명단 ── */}
            <Section
              title="배정 인원"
              note={`${data.assignments.length}명${data.cancelled.length ? ` · 취소 ${data.cancelled.length}명` : ''}`}
            >
              {data.assignments.length === 0 ? (
                <p className="text-xs text-gray-400">배정된 인원이 없습니다.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-100">
                        {['이름', '직무', '역할', '배정상태', '지급단가', '일수', '총 지급액',
                          '지급상태', '연락처', '은행 / 계좌', '주민번호', '투입일'].map(h => (
                          <th key={h} className="px-2 py-2 text-left font-bold text-[11px] text-gray-600 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.assignments.map(a => {
                        const po = a.id ? payoutByAsgn.get(a.id) : undefined
                        const total = a.total_pay ?? (a.pay_rate || 0) * (a.work_days || 1)
                        const wd = Array.isArray(a.work_dates) ? a.work_dates : []
                        return (
                          <tr key={a.id} className="border-t border-gray-100">
                            <td className="px-2 py-1.5 font-semibold text-gray-800 whitespace-nowrap">
                              {cleanStaffName(a.staff_name)}
                              {a.is_payable === false && (
                                <span className="ml-1 text-[9px] text-purple-500 font-bold">무급</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-gray-600">{a.job_type || '-'}</td>
                            <td className="px-2 py-1.5 text-gray-600">
                              {a.role_type || a.staff_type || '-'}
                            </td>
                            <td className="px-2 py-1.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border
                                ${STATUS_CHIP[a.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                                {a.status}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{fmt(a.pay_rate)}</td>
                            <td className="px-2 py-1.5 text-center tabular-nums">{a.work_days || 1}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{fmt(total)}</td>
                            <td className="px-2 py-1.5">
                              {po ? (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border
                                  ${PAY_COLOR[po.status] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                                  {po.status}
                                  {po.final_pay ? ` ${fmt(po.final_pay)}` : ''}
                                </span>
                              ) : (
                                <span className="text-[10px] text-gray-300">지급건 없음</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{a.phone || '-'}</td>
                            <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">
                              {a.bank_name || a.account_number
                                ? `${a.bank_name || '-'} ${a.account_number || ''}`
                                : '-'}
                            </td>
                            <td className="px-2 py-1.5 text-gray-400 whitespace-nowrap font-mono text-[10px]">
                              {maskId(a.id_number)}
                            </td>
                            <td className="px-2 py-1.5 text-gray-500 text-[10px] max-w-[220px]">
                              {wd.length > 0
                                ? wd.map(d => d.substring(5)).join(', ')
                                : <span className="text-gray-400">전체기간 (날짜 미지정)</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {data.cancelled.length > 0 && (
                <p className="text-[11px] text-gray-400">
                  취소된 배정: {data.cancelled.map(a => cleanStaffName(a.staff_name)).join(', ')}
                </p>
              )}
            </Section>

            {/* ── 6. 부대비용 ── */}
            <Section title="부대비용" note={`${data.expenses.length}건 · 합계 ${fmt(expenseTotal)}원`}>
              {data.expenses.length === 0 ? (
                <p className="text-xs text-gray-400">기록된 부대비용이 없습니다.</p>
              ) : (
                <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                  {data.expenses.map(x => (
                    <div key={x.id} className="flex items-center gap-3 px-3 py-1.5 text-xs">
                      <span className="font-semibold text-gray-700 min-w-[80px]">{x.category}</span>
                      <span className="tabular-nums font-semibold text-gray-900 min-w-[90px] text-right">
                        {fmt(x.amount)}원
                      </span>
                      <span className="text-gray-400 text-[11px]">{x.spent_on || '-'}</span>
                      <span className="text-gray-500 truncate">{x.memo || ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* ── 7. 출석 ── */}
            <Section title="출석 기록" note={`${data.attendances.length}건`}>
              {data.attendances.length === 0 ? (
                <p className="text-xs text-gray-400">출석 기록이 없습니다.</p>
              ) : (
                <div className="space-y-1.5">
                  {dates.filter(d => data.attendances.some(r => r.work_date?.substring(0, 10) === d)).map(d => {
                    const rows = data.attendances.filter(r => r.work_date?.substring(0, 10) === d)
                    return (
                      <div key={d} className="flex items-start gap-2 text-xs">
                        <span className="font-semibold text-gray-600 min-w-[52px] tabular-nums">{d.substring(5)}</span>
                        <div className="flex flex-wrap gap-1">
                          {rows.map(r => (
                            <span key={r.id}
                              className={`text-[10px] px-1.5 py-0.5 rounded border
                                ${ATT_COLOR[r.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}
                              title={[r.clock_in, r.clock_out].filter(Boolean).join(' ~ ') || undefined}>
                              {cleanStaffName(r.staff_name)} {r.status}
                            </span>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Section>

            {/* ── 8. 메모 (기존 project_memos 패널 재사용 — 작성·삭제 가능) ── */}
            <Section title="메모" note="인원추천 · 운영메모 · 피드백">
              <ProjectMemoPanel inquiryId={inquiry.id} />
            </Section>

          </>
        )}
      </div>
    </Dialog>
  )
}
