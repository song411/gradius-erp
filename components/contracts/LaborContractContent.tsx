'use client'

// 근로계약서 만들기 — 배정 한 건(?a=배정id) 또는 행사 전체(?inq=문의id)
// ─────────────────────────────────────────────────────────
// 왼쪽에서 칸을 고치고 오른쪽 미리보기를 보며 인쇄한다. DB 에는 아무것도 쓰지 않는다.
// 값을 채우는 규칙·조문 글귀는 lib/laborContract.ts, 종이 모양은 LaborContractDoc.tsx.
// 인쇄는 견적서와 같은 방식 — 미리보기 HTML 을 새 창에 넣고 window.print().

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { db } from '@/lib/supabase/api'
import { todayKST } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Printer, AlertTriangle, RotateCcw } from 'lucide-react'
import LaborContractDoc from './LaborContractDoc'
import {
  buildContractFields, missingFields, FIELD_LABELS, PER_PERSON_KEYS, VARIANT_DESC,
  type ContractFields, type ContractVariant,
} from '@/lib/laborContract'
import type { Assignment, Inquiry, Staff } from '@/lib/supabase/types'

type Person = { assignment: Assignment; staff: Staff | null }
type Overrides = Partial<Omit<ContractFields, 'variant'>>
type FieldKey = keyof Overrides

// 화면에서 고치는 순서. 긴 글은 Textarea
const EDIT_ORDER: { key: FieldKey; long?: boolean }[] = [
  { key: 'workerName' }, { key: 'workerPhone' }, { key: 'workerIdNumber' }, { key: 'workerBirth' }, { key: 'workerAddress' }, { key: 'hireDate' },
  { key: 'periodText', long: true }, { key: 'positionText' }, { key: 'dutyText', long: true }, { key: 'placeText', long: true },
  { key: 'hoursText' }, { key: 'payMethodText', long: true }, { key: 'dailyPayText' }, { key: 'totalPayText' }, { key: 'signDate' },
]

export default function LaborContractContent() {
  const params = useSearchParams()
  const aId = params.get('a') || ''
  const inqId = params.get('inq') || ''
  const today = todayKST()

  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [inquiry, setInquiry] = useState<Inquiry | null>(null)
  const [people, setPeople]   = useState<Person[]>([])
  const [variant, setVariant] = useState<ContractVariant>('상세')
  const [common, setCommon]   = useState<Overrides>({})                       // 모두에게 적용
  const [each, setEach]       = useState<Record<string, Overrides>>({})       // 한 명씩
  const [target, setTarget]   = useState<string>('')                          // '' = 전체(공통), 아니면 배정 id
  const docsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true); setError('')
      try {
        if (aId) {
          const a = await db.single<Assignment>('assignments', aId)
          if (!a) throw new Error('배정을 찾지 못했습니다')
          const [inq, st] = await Promise.all([
            a.inquiry_id ? db.single<Inquiry>('inquiries', a.inquiry_id) : Promise.resolve(null),
            a.staff_id ? db.single<Staff>('staff', a.staff_id) : Promise.resolve(null),
          ])
          if (!alive) return
          setInquiry(inq); setPeople([{ assignment: a, staff: st }]); setTarget(a.id)
        } else if (inqId) {
          const inq = await db.single<Inquiry>('inquiries', inqId)
          if (!inq) throw new Error('행사를 찾지 못했습니다')
          const asgns = (await db.list<Assignment>('assignments', { filters: { inquiry_id: inqId }, order: 'assigned_at', asc: true }))
            .filter(a => a.status === '확정')
          const ids = [...new Set(asgns.map(a => a.staff_id).filter((x): x is string => !!x))]
          const staffList = ids.length ? await db.list<Staff>('staff', { inFilter: { id: ids } }) : []
          if (!alive) return
          setInquiry(inq)
          setPeople(asgns.map(a => ({ assignment: a, staff: staffList.find(s => s.id === a.staff_id) || null })))
          setTarget('')
        } else {
          throw new Error('배정(?a=) 또는 행사(?inq=)를 지정해야 합니다. 인원 배정 화면의 계약서 버튼으로 들어오세요.')
        }
      } catch (e) {
        if (alive) setError((e as Error).message)
      } finally { if (alive) setLoading(false) }
    }
    load()
    return () => { alive = false }
  }, [aId, inqId])

  // 양식을 바꾸면 자동값이 달라지므로 손으로 고친 것도 비운다
  function changeVariant(v: ContractVariant) { setVariant(v); setCommon({}); setEach({}) }

  const docs = useMemo(() => people.map(p => {
    const base = buildContractFields({ assignment: p.assignment, inquiry, staff: p.staff, variant, today })
    return { id: p.assignment.id, fields: { ...base, ...common, ...(each[p.assignment.id] || {}) } as ContractFields }
  }), [people, inquiry, variant, today, common, each])

  const current = target ? docs.find(d => d.id === target) : docs[0]
  const editingAll = !target

  function setField(key: FieldKey, value: string) {
    if (editingAll) setCommon(c => ({ ...c, [key]: value }))
    else setEach(m => ({ ...m, [target]: { ...(m[target] || {}), [key]: value } }))
  }
  function reset() { setCommon({}); setEach({}) }

  const warnings = docs.flatMap(d => {
    const miss = missingFields(d.fields)
    return miss.length ? [`${d.fields.workerName || '(이름 없음)'}: ${miss.join(', ')}`] : []
  })

  function handlePrint() {
    if (!docsRef.current) return
    const win = window.open('', '_blank')
    if (!win) return
    const title = `근로계약서_${inquiry?.event_name || ''}${docs.length === 1 ? `_${docs[0].fields.workerName}` : ''}`
    win.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"/><title>${title}</title><style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;background:#fff}
      .labor-contract-page{page-break-after:always}
      .labor-contract-page:last-child{page-break-after:auto}
      @media print{@page{size:A4;margin:12mm} .labor-contract-page{width:auto !important;min-height:0 !important;padding:0 !important}}
    </style></head><body>${docsRef.current.innerHTML}</body></html>`)
    win.document.close(); win.print()
  }

  if (loading) return <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" /></div>
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>
  if (!docs.length) return <div className="p-6 text-sm text-gray-500">확정된 크루가 없습니다. 배정 상태를 ‘확정’으로 바꾼 뒤 다시 여세요.</div>

  return (
    <div className="flex h-full">
      {/* 왼쪽: 고치는 칸 */}
      <aside className="w-[360px] shrink-0 border-r border-gray-200 bg-white overflow-y-auto p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Button onClick={handlePrint} className="flex-1 h-10 font-bold"><Printer className="h-4 w-4" />인쇄 / PDF 저장 ({docs.length}장)</Button>
          <Button variant="outline" onClick={reset} title="자동값으로 되돌리기" className="h-10"><RotateCcw className="h-4 w-4" /></Button>
        </div>
        <p className="text-xs text-gray-500">{inquiry?.company_name} · {inquiry?.event_name} · {inquiry?.event_start?.slice(0, 10)}{inquiry?.event_end && inquiry.event_end !== inquiry.event_start ? `~${inquiry.event_end.slice(5, 10)}` : ''}</p>

        <div>
          <label className="text-xs font-bold text-gray-600 mb-1 block">양식</label>
          <Select value={variant} onChange={e => changeVariant(e.target.value as ContractVariant)}>
            <option value="상세">상세 (용인 주차요원 양식)</option>
            <option value="기본">기본 (노무사 자문 양식)</option>
          </Select>
          <p className="text-2xs text-gray-400 mt-1">{VARIANT_DESC[variant]}</p>
        </div>

        {docs.length > 1 && (
          <div>
            <label className="text-xs font-bold text-gray-600 mb-1 block">수정 대상</label>
            <Select value={target} onChange={e => setTarget(e.target.value)}>
              <option value="">전체 공통 (업무·장소·시간 등)</option>
              {docs.map(d => <option key={d.id} value={d.id}>{d.fields.workerName || '(이름 없음)'}</option>)}
            </Select>
            <p className="text-2xs text-gray-400 mt-1">이름·전화·주민번호·기간·일당은 사람마다 달라서 한 명을 골라야 고칠 수 있습니다.</p>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
            <p className="font-bold flex items-center gap-1 mb-1"><AlertTriangle className="h-3.5 w-3.5" />빈 칸이 있습니다</p>
            {warnings.map(w => <p key={w}>{w}</p>)}
            <p className="text-2xs text-amber-700 mt-1">주소·주민번호는 크루관리에 적어 두면 다음부터 자동으로 들어옵니다.</p>
          </div>
        )}

        {current && (
          <div className="space-y-2">
            {EDIT_ORDER.map(({ key, long }) => {
              const perPerson = PER_PERSON_KEYS.includes(key)
              const disabled = editingAll && docs.length > 1 && perPerson
              const hidden = (variant === '상세' && (key === 'workerBirth' || key === 'hireDate')) || (variant === '기본' && key === 'workerIdNumber')
              if (hidden) return null
              const val = current.fields[key] || ''
              return (
                <div key={key}>
                  <label className="text-xs font-bold text-gray-600 mb-0.5 block">{FIELD_LABELS[key]}{disabled && <span className="text-gray-400 font-normal"> · 사람마다 다름</span>}</label>
                  {long
                    ? <Textarea value={val} disabled={disabled} rows={2} onChange={e => setField(key, e.target.value)} className="text-sm" />
                    : <Input value={val} disabled={disabled} type={key === 'signDate' ? 'date' : 'text'} onChange={e => setField(key, e.target.value)} className="h-9 text-sm" />}
                </div>
              )
            })}
          </div>
        )}
        <p className="text-2xs text-gray-400">여기서 고친 값은 인쇄에만 쓰이고 저장되지 않습니다. 크루 정보가 틀리면 크루관리에서 고치세요.</p>
      </aside>

      {/* 오른쪽: 미리보기 */}
      <div className="flex-1 overflow-auto bg-gray-200 p-6">
        <div ref={docsRef} className="space-y-6">
          {docs.map(d => (
            <div key={d.id} className="shadow-lg"><LaborContractDoc fields={d.fields} /></div>
          ))}
        </div>
      </div>
    </div>
  )
}
