'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, AlertTriangle, ArrowUpRight, Loader2 } from 'lucide-react'
import type { Draft } from '@/lib/ai/draft'

// AI가 채워 보여주는 카드. 저장 버튼은 사람 손에 있다.
// ─────────────────────────────────────────────────────────
// 누르기 전까지는 아무 일도 일어나지 않는다. 그래서 AI가 잘못 만들어도
// 데이터가 망가지지 않는다.

const won = (n: number) => `${Math.round(n || 0).toLocaleString()}원`

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  const empty = value === undefined || value === null || value === '' || value === 0
  return (
    <div className="flex gap-2 py-[3px]">
      <span className="w-20 shrink-0 text-cyan-400/60">{label}</span>
      <span className={empty ? 'text-slate-600' : 'text-slate-200'}>
        {empty ? '(비어 있음)' : String(value)}
      </span>
    </div>
  )
}

export default function ProposalCard({ draft }: { draft: Draft }) {
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<{ message: string; href: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  async function apply() {
    if (saving || done) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || '저장에 실패했습니다.')
      setDone({ message: data.message, href: data.href })
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류')
    } finally {
      setSaving(false)
    }
  }

  if (dismissed) return null

  const isInquiry = draft.kind === 'inquiry'
  const f = isInquiry ? (draft.fields as Record<string, unknown>) : null
  const title = draft.kind === 'inquiry' ? '문의 접수 초안'
    : draft.kind === 'estimate' ? '견적서 초안' : '배정 초안'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="ml-[38px] rounded-xl border border-amber-400/35 bg-amber-400/[0.05] p-3.5"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-2xs tracking-wider text-amber-300">
          ▸ {title}
        </span>
        {isInquiry && (
          <span className="rounded border border-amber-400/30 px-1.5 py-0.5 font-mono text-2xs text-amber-300/80">
            확신도 {draft.confidence}%
          </span>
        )}
        <span className="ml-auto font-mono text-2xs text-slate-500">아직 저장 안 됨</span>
      </div>

      {/* ── 문의 초안 ── */}
      {isInquiry && f && (
        <div className="text-xs">
          <Row label="거래처" value={f.company_name as string} />
          <Row label="행사명" value={f.event_name as string} />
          <Row label="기간" value={[f.event_start, f.event_end].filter(Boolean).join(' ~ ') as string} />
          <Row label="장소" value={f.location as string} />
          <Row label="인원" value={f.required_staff ? `${f.required_staff}명` : ''} />
          <Row label="시간" value={f.event_time as string} />
          <Row label="페이" value={f.pay_detail as string} />
          <Row label="복장" value={f.attire as string} />
        </div>
      )}

      {/* ── 견적 초안 ── */}
      {!isInquiry && draft.kind === 'estimate' && (
        <div className="text-xs">
          <p className="mb-1.5 text-slate-300">
            {draft.company_name} · {draft.event_name}
          </p>
          <div className="overflow-x-auto rounded-lg border border-amber-400/15">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-amber-400/10 text-amber-300/90">
                  <th className="px-2 py-1 text-left font-medium">품목</th>
                  <th className="px-2 py-1 text-right font-medium">인원</th>
                  <th className="px-2 py-1 text-right font-medium">일수</th>
                  <th className="px-2 py-1 text-right font-medium">청구단가</th>
                  <th className="px-2 py-1 text-right font-medium">소계</th>
                </tr>
              </thead>
              <tbody>
                {draft.items.map((it, i) => (
                  <tr key={i} className="border-t border-amber-400/10 text-slate-300">
                    <td className="px-2 py-1">{it.role_name}{it.is_leader && ' (팀장)'}</td>
                    <td className="px-2 py-1 text-right">{it.quantity}</td>
                    <td className="px-2 py-1 text-right">{it.days}</td>
                    <td className="px-2 py-1 text-right">{won(it.unit_price)}</td>
                    <td className="px-2 py-1 text-right">{won(it.quantity * it.days * it.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-slate-300">
            <span>공급가 <b className="text-slate-100">{won(draft.totals.supply)}</b></span>
            <span>부가세 {won(draft.totals.vat)}</span>
            <span>합계 <b className="text-slate-100">{won(draft.totals.total)}</b></span>
            <span>원가 {won(draft.totals.cost)}</span>
            <span>
              이익률{' '}
              <b className={draft.totals.profit_rate >= 30 ? 'text-emerald-400' : 'text-rose-400'}>
                {draft.totals.profit_rate}%
              </b>
            </span>
          </div>
        </div>
      )}

      {/* ── 배정 초안 ── */}
      {draft.kind === 'assignment' && (
        <div className="text-xs">
          <p className="mb-1.5 text-slate-300">
            {draft.company_name} · {draft.event_name}
          </p>
          <div className="overflow-x-auto rounded-lg border border-amber-400/15">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-amber-400/10 text-amber-300/90">
                  <th className="px-2 py-1 text-left font-medium">이름</th>
                  <th className="px-2 py-1 text-left font-medium">직무</th>
                  <th className="px-2 py-1 text-right font-medium">지급단가</th>
                  <th className="px-2 py-1 text-right font-medium">일수</th>
                  <th className="px-2 py-1 text-right font-medium">지급예정</th>
                </tr>
              </thead>
              <tbody>
                {draft.rows.map((r, i) => (
                  <tr key={i} className="border-t border-amber-400/10 text-slate-300">
                    <td className="whitespace-nowrap px-2 py-1">
                      {r.staff_name}{r.role_type === '팀장' && ' (팀장)'}
                      {r.warn && <span className="ml-1 text-rose-400">⚠</span>}
                    </td>
                    <td className="px-2 py-1">{r.job_type}</td>
                    <td className="px-2 py-1 text-right">{won(r.pay_rate)}</td>
                    <td className="px-2 py-1 text-right">{r.work_days}일</td>
                    <td className="px-2 py-1 text-right">{won(r.pay_rate * r.work_days)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-slate-300">
            <span>인원 <b className="text-slate-100">{draft.totals.people}명</b></span>
            <span>지급 예정 <b className="text-slate-100">{won(draft.totals.payTotal)}</b></span>
            <span className="text-slate-500">상태: 배정중</span>
          </div>
        </div>
      )}

      {/* 경고 — 비어 있는 칸 / 이익률 미달 */}
      {((isInquiry && draft.missing.length > 0) ||
        (draft.kind === 'estimate' && draft.warnings.length > 0) ||
        (draft.kind === 'assignment' && (draft.warnings.length > 0 || draft.rows.some(r => r.warn)))) && (
        <div className="mt-2 flex gap-1.5 rounded-lg border border-rose-400/25 bg-rose-400/[0.06] px-2.5 py-1.5 text-2xs text-rose-300">
          <AlertTriangle className="mt-[1px] h-3 w-3 shrink-0" />
          <div>
            {isInquiry && `비어 있는 칸: ${draft.missing.join(', ')} — 저장 후 문의 화면에서 채우셔야 합니다.`}
            {draft.kind === 'estimate' && draft.warnings.map((w, i) => <p key={i}>{w}</p>)}
            {draft.kind === 'assignment' && (
              <>
                {draft.rows.filter(r => r.warn).map((r, i) => (
                  <p key={`r${i}`}>{r.staff_name} — {r.warn}</p>
                ))}
                {draft.warnings.map((w, i) => <p key={`w${i}`}>{w}</p>)}
              </>
            )}
          </div>
        </div>
      )}

      {/* 버튼 */}
      <div className="mt-3 flex items-center gap-2">
        {done ? (
          <>
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <Check className="h-3.5 w-3.5" /> {done.message}
            </span>
            <a
              href={done.href}
              className="ml-auto flex items-center gap-1 rounded-lg border border-emerald-400/40 px-2.5 py-1 text-2xs text-emerald-300 transition-colors hover:bg-emerald-400/10"
            >
              보러 가기 <ArrowUpRight className="h-3 w-3" />
            </a>
          </>
        ) : (
          <>
            <button
              onClick={apply}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-400/15 px-3 py-1.5 text-xs font-medium text-amber-200 transition-all hover:border-amber-300 hover:bg-amber-400/25 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {saving ? '저장 중…' : '이대로 입력'}
            </button>
            <button
              onClick={() => setDismissed(true)}
              disabled={saving}
              className="rounded-lg border border-slate-600/50 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-300 disabled:opacity-40"
            >
              안 할래요
            </button>
            {error && <span className="text-2xs text-rose-400">{error}</span>}
          </>
        )}
      </div>
    </motion.div>
  )
}
