'use client'

import { useMemo, useState } from 'react'
import type { Inquiry, Assignment } from '@/lib/supabase/types'
import { X, Copy, Check, Send } from 'lucide-react'
import { toast } from 'sonner'
import { eventDatesOf } from '@/components/schedule/matrixCore'
import {
  buildOutreachMessage, defaultFields, dayTimeSkeleton, emptyFieldLabels,
  type OutreachFields,
} from '@/lib/outreach'

// 섭외 문구 생성기 — 배정한 크루에게 "이 현장 가능하세요?" 하고 물을 때 쓴다.
// ─────────────────────────────────────────────────────────
// 공지문 생성기(AnnounceModal)가 '확정된 사람에게 오늘 안내'라면, 이쪽은
// 그 앞 단계다. 양식은 lib/outreach.ts 한 곳에 있고 AI 비서도 같은 것을 쓴다.
//
// 카카오는 외부에서 자동 발송이 안 되므로 여기서도 '작성 + 복사'가 최선이다.
// 대신 누구까지 복사했는지를 표시해 둔다 — 한 명씩 보내다 보면 꼭 빠뜨린다.

interface Props {
  inquiry: Inquiry
  assignments: Assignment[]
  onClose: () => void
}

export default function OutreachModal({ inquiry, assignments, onClose }: Props) {
  const dates = useMemo(() => eventDatesOf(inquiry), [inquiry])

  const [fields, setFields] = useState<OutreachFields>(() => ({
    ...defaultFields(inquiry, dates),
    // 며칠짜리면 '6일(화): ' 까지 깔아둔다. 시간은 사람이 채운다 —
    // 날마다 몇 시인지는 ERP에 없는 값이라 지어낼 수 없다.
    extra: dayTimeSkeleton(dates),
  }))
  const set = (k: keyof OutreachFields) => (v: string) =>
    setFields(prev => ({ ...prev, [k]: v }))

  // 배정된 크루 — 취소는 빼고, 이름 중복도 뺀다
  const crew = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    assignments.forEach(a => {
      if (a.status === '취소') return
      const name = (a.staff_name || '').trim()
      if (!name || seen.has(name)) return
      seen.add(name)
      out.push(name)
    })
    return out
  }, [assignments])

  const [picked, setPicked] = useState<string | null>(null)   // 지금 보고 있는 사람
  const [sent, setSent] = useState<Set<string>>(new Set())    // 복사한 사람
  const [copiedNow, setCopiedNow] = useState(false)

  const message = useMemo(
    () => buildOutreachMessage(fields, picked ?? undefined),
    [fields, picked],
  )
  const blanks = emptyFieldLabels(fields)

  async function copy(name?: string) {
    const text = name !== undefined ? buildOutreachMessage(fields, name) : message
    try {
      await navigator.clipboard.writeText(text)
      if (name) setSent(prev => new Set(prev).add(name))
      setCopiedNow(true)
      setTimeout(() => setCopiedNow(false), 1600)
      toast.success(name ? `${name}님 문구를 복사했습니다` : '복사됐습니다')
    } catch {
      toast.error('복사 실패 — 오른쪽 문구를 직접 선택해 복사해주세요')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4" style={{ zIndex: 9999 }} onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-gradient-to-r from-sky-500 to-indigo-500 shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">💬 섭외 문구 생성</h2>
            <p className="text-sky-50 text-xs mt-0.5">{inquiry.company_name} · {inquiry.event_name}</p>
          </div>
          <button onClick={onClose} className="text-sky-50 hover:text-white p-1"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2">
          {/* 좌: 입력 — 라벨 순서는 사장님이 쓰시던 양식 그대로 */}
          <div className="p-4 space-y-2.5 border-r border-gray-100">
            <Field label="행사명"><input value={fields.event_name} onChange={e => set('event_name')(e.target.value)} className={inputCls} /></Field>
            <Field label="장소"><input value={fields.location} onChange={e => set('location')(e.target.value)} className={inputCls} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="일시"><input value={fields.period} onChange={e => set('period')(e.target.value)} className={inputCls} placeholder="10월 6일 ~ 10월 8일" /></Field>
              <Field label="시간"><input value={fields.time} onChange={e => set('time')(e.target.value)} className={inputCls} placeholder="일자별 다름" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="서비스종류"><input value={fields.service_type} onChange={e => set('service_type')(e.target.value)} className={inputCls} placeholder="행사스탭" /></Field>
              <Field label="페이"><input value={fields.pay} onChange={e => set('pay')(e.target.value)} className={inputCls} placeholder="시급12000" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="복장"><input value={fields.attire} onChange={e => set('attire')(e.target.value)} className={inputCls} placeholder="협의" /></Field>
              <Field label="식사"><input value={fields.meal} onChange={e => set('meal')(e.target.value)} className={inputCls} placeholder="1만원제공" /></Field>
            </div>
            <Field label="특이사항"><input value={fields.notes} onChange={e => set('notes')(e.target.value)} className={inputCls} /></Field>
            <Field label="일자별 시간 (선택)">
              <textarea
                value={fields.extra}
                onChange={e => set('extra')(e.target.value)}
                rows={dates.length > 1 ? Math.min(dates.length + 1, 6) : 3}
                className={`${inputCls} font-mono`}
                placeholder={'6일(화): 8시 ~ 18시\n7일(수): 9시 30분 ~ 18시'}
              />
            </Field>

            {blanks.length > 0 && (
              <p className="text-xs text-rose-600">
                비어 있는 칸: {blanks.join(', ')} — 보내기 전에 채우세요.
              </p>
            )}
          </div>

          {/* 우: 사람 고르기 + 미리보기 */}
          <div className="p-4 bg-gray-50 flex flex-col min-h-[420px]">
            <p className="text-xs font-semibold text-gray-500 mb-1.5">
              배정된 크루 {crew.length}명
              <span className="text-gray-400 font-normal"> — 이름을 누르면 그 사람 문구가 됩니다</span>
            </p>
            {crew.length === 0 ? (
              <p className="text-xs text-gray-400 mb-2">아직 배정된 크루가 없습니다. 이름 없이 &apos;00님&apos; 으로 만들어집니다.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {crew.map(name => (
                  <button
                    key={name}
                    onClick={() => setPicked(picked === name ? null : name)}
                    className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 transition-colors ${
                      picked === name
                        ? 'bg-sky-500 border-sky-500 text-white font-semibold'
                        : sent.has(name)
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                    title={sent.has(name) ? '복사함' : undefined}
                  >
                    {sent.has(name) && <Check className="h-3 w-3" />}
                    {name}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500">
                미리보기 {picked ? <span className="text-sky-600">· {picked}님</span> : <span className="text-gray-400">· 이름 없음</span>}
              </p>
              <button
                onClick={() => copy(picked ?? undefined)}
                className="flex items-center gap-1.5 text-xs font-semibold bg-sky-500 hover:bg-sky-600 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                {copiedNow ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedNow ? '복사됨' : '복사하기'}
              </button>
            </div>
            <pre className="flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800 bg-white border border-gray-200 rounded-xl p-3.5 font-sans overflow-y-auto">
              {message}
            </pre>

            {crew.length > 0 && (
              <p className="mt-2 text-xs text-gray-500">
                <Send className="inline h-3 w-3 mr-1" />
                {sent.size}/{crew.length}명 복사함 — 복사한 사람은 초록으로 표시됩니다
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-sky-400'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
