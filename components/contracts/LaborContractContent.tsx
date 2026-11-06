'use client'

// 근로계약서 만들기 — 배정 한 건(?a=배정id) 또는 행사 전체(?inq=문의id)
// ─────────────────────────────────────────────────────────
// 왼쪽에서 칸을 고치고 오른쪽 미리보기를 보며 인쇄하거나, 서명 링크를 만들어 카톡으로 보낸다.
// 값을 채우는 규칙·조문 글귀는 lib/laborContract.ts, 종이 모양은 LaborContractDoc.tsx.
// 인쇄는 견적서와 같은 방식 — 미리보기 HTML 을 새 창에 넣고 window.print().
//
// 서명 링크: "링크 만들기"를 누른 순간의 계약서 내용이 labor_contracts 에 통째로 저장되고
// 크루는 /s/<token> 에서 서명한다. 서명이 끝난 건은 저장된 내용+서명 이미지로 보여 준다(원본).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { db } from '@/lib/supabase/api'
import { todayKST } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Printer, AlertTriangle, RotateCcw, Link2, Copy, CheckCircle2, Clock, RefreshCw } from 'lucide-react'
import LaborContractDoc from './LaborContractDoc'
import {
  buildContractFields, missingFields, FIELD_LABELS, PER_PERSON_KEYS, VARIANT_DESC, makeToken, signLinkMessage, fmtSignedAt,
  formatIdNumber, accountTextOf, splitAccount,
  type ContractFields, type ContractVariant,
} from '@/lib/laborContract'
import { saveStaffContact } from '@/lib/evaluation'
import type { Assignment, Inquiry, Staff, LaborContract } from '@/lib/supabase/types'

type Person = { assignment: Assignment; staff: Staff | null }
type Overrides = Partial<Omit<ContractFields, 'variant'>>
type FieldKey = keyof Overrides

// 화면에서 고치는 순서. 긴 글은 Textarea
const EDIT_ORDER: { key: FieldKey; long?: boolean }[] = [
  { key: 'workerName' }, { key: 'workerPhone' }, { key: 'workerIdNumber' }, { key: 'workerBirth' }, { key: 'workerAccount' },
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
  const [contracts, setContracts] = useState<LaborContract[]>([])        // 서명 링크(최신이 앞)
  const [variant, setVariant] = useState<ContractVariant>('상세')
  const [common, setCommon]   = useState<Overrides>({})                       // 모두에게 적용
  const [each, setEach]       = useState<Record<string, Overrides>>({})       // 한 명씩
  const [target, setTarget]   = useState<string>('')                          // '' = 전체(공통), 아니면 배정 id
  const [showSigned, setShowSigned] = useState(true)                          // 서명 끝난 사람은 서명본으로 보기
  const [linking, setLinking] = useState(false)
  const docsRef = useRef<HTMLDivElement>(null)

  const loadContracts = useCallback(async (assignmentIds: string[]) => {
    if (!assignmentIds.length) { setContracts([]); return }
    try {
      const rows = await db.list<LaborContract>('labor_contracts', { inFilter: { assignment_id: assignmentIds }, order: 'created_at', asc: false })
      setContracts(rows)
    } catch { setContracts([]) }   // 020 표가 아직 없어도 계약서 인쇄는 된다
  }, [])

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true); setError('')
      try {
        let list: Person[] = []
        if (aId) {
          const a = await db.single<Assignment>('assignments', aId)
          if (!a) throw new Error('배정을 찾지 못했습니다')
          const [inq, st] = await Promise.all([
            a.inquiry_id ? db.single<Inquiry>('inquiries', a.inquiry_id) : Promise.resolve(null),
            a.staff_id ? db.single<Staff>('staff', a.staff_id) : Promise.resolve(null),
          ])
          if (!alive) return
          list = [{ assignment: a, staff: st }]
          setInquiry(inq); setPeople(list); setTarget(a.id)
        } else if (inqId) {
          const inq = await db.single<Inquiry>('inquiries', inqId)
          if (!inq) throw new Error('행사를 찾지 못했습니다')
          const asgns = (await db.list<Assignment>('assignments', { filters: { inquiry_id: inqId }, order: 'assigned_at', asc: true }))
            .filter(a => a.status === '확정')
          const ids = [...new Set(asgns.map(a => a.staff_id).filter((x): x is string => !!x))]
          const staffList = ids.length ? await db.list<Staff>('staff', { inFilter: { id: ids } }) : []
          if (!alive) return
          list = asgns.map(a => ({ assignment: a, staff: staffList.find(s => s.id === a.staff_id) || null }))
          setInquiry(inq); setPeople(list); setTarget('')
        } else {
          throw new Error('배정(?a=) 또는 행사(?inq=)를 지정해야 합니다. 인원 배정 화면의 계약서 버튼으로 들어오세요.')
        }
        await loadContracts(list.map(p => p.assignment.id))
      } catch (e) {
        if (alive) setError((e as Error).message)
      } finally { if (alive) setLoading(false) }
    }
    load()
    return () => { alive = false }
  }, [aId, inqId, loadContracts])

  // 양식을 바꾸면 자동값이 달라지므로 손으로 고친 것도 비운다
  function changeVariant(v: ContractVariant) { setVariant(v); setCommon({}); setEach({}) }

  const docs = useMemo(() => people.map(p => {
    const base = buildContractFields({ assignment: p.assignment, inquiry, staff: p.staff, variant, today })
    const latest = contracts.find(c => c.assignment_id === p.assignment.id && c.status !== '취소') || null
    const live = { ...base, ...common, ...(each[p.assignment.id] || {}) } as ContractFields
    const signed = latest?.status === '서명완료' ? latest : null
    return {
      id: p.assignment.id,
      person: p,
      latest,
      signed,
      fields: live,
      // 화면·인쇄에 쓰는 것: 서명이 끝났고 서명본 보기면 저장된 원본
      shown: signed && showSigned ? (signed.fields as unknown as ContractFields) : live,
      signature: signed && showSigned && signed.signature_data ? { dataUrl: signed.signature_data, signedAt: signed.signed_at || '' } : undefined,
    }
  }), [people, inquiry, variant, today, common, each, contracts, showSigned])

  const current = target ? docs.find(d => d.id === target) : docs[0]
  const editingAll = !target
  const anySigned = docs.some(d => d.signed)

  function setField(key: FieldKey, value: string) {
    if (editingAll) setCommon(c => ({ ...c, [key]: value }))
    else setEach(m => ({ ...m, [target]: { ...(m[target] || {}), [key]: value } }))
  }
  function reset() { setCommon({}); setEach({}) }

  // 전화·주민번호·계좌가 비어 있으면 계약서 화면에서 바로 적고 크루관리에도 저장한다 — 다음 계약서부터는 자동으로 들어온다
  const SAVABLE: Partial<Record<FieldKey, string>> = { workerPhone: '전화번호', workerIdNumber: '주민등록번호', workerAccount: '지급계좌' }
  const [savingKey, setSavingKey] = useState<FieldKey | null>(null)
  function staffValueOf(st: Staff, key: FieldKey): string {
    if (key === 'workerPhone') return (st.phone || '').trim()
    if (key === 'workerIdNumber') return formatIdNumber(st.id_number)
    if (key === 'workerAccount') return accountTextOf(st.bank_name, st.account_number)
    return ''
  }
  async function saveToStaff(d: typeof docs[number], key: FieldKey) {
    const staffId = d.person.assignment.staff_id
    const value = (d.fields[key] || '').trim()
    if (!staffId || !value) return
    setSavingKey(key)
    try {
      const patch = key === 'workerPhone' ? { phone: value }
        : key === 'workerIdNumber' ? { id_number: value }
        : splitAccount(value)
      await saveStaffContact(staffId, patch)
      setPeople(ps => ps.map(p => p.assignment.id === d.id && p.staff ? { ...p, staff: { ...p.staff, ...patch } } : p))
      // 손으로 적은 값이 이제 자동값과 같아졌으니 덮어쓰기 기록은 지운다
      setEach(m => { const next = { ...(m[d.id] || {}) }; delete next[key]; return { ...m, [d.id]: next } })
      toast.success(`${d.fields.workerName} ${SAVABLE[key]} 저장 — 다음 계약서부터 자동으로 들어옵니다`)
    } catch (e) {
      toast.error('저장 실패: ' + (e as Error).message)
    } finally { setSavingKey(null) }
  }

  const warnings = docs.flatMap(d => {
    const miss = missingFields(d.fields)
    return miss.length ? [`${d.fields.workerName || '(이름 없음)'}: ${miss.join(', ')}`] : []
  })

  // ── 서명 링크 ───────────────────────────────────────
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const linkOf = (c: LaborContract) => `${origin}/s/${c.token}`

  /** 한 명 링크 만들기. 대기 중인 링크가 있으면 내용만 갱신(링크 유지), 없으면 새로 만든다 */
  async function makeLink(d: typeof docs[number]): Promise<LaborContract | null> {
    const phone = d.fields.workerPhone || d.person.assignment.phone || d.person.staff?.phone || ''
    const payload = {
      assignment_id: d.id, inquiry_id: inquiry?.id || null, staff_id: d.person.assignment.staff_id || null,
      staff_name: d.fields.workerName, phone, variant, fields: d.fields, status: '대기',
    }
    if (d.latest && d.latest.status === '대기') {
      const rows = await db.update<LaborContract>('labor_contracts', d.latest.id, { ...payload, updated_at: new Date().toISOString() })
      return rows[0] || ({ ...d.latest, ...payload } as unknown as LaborContract)
    }
    const rows = await db.insert<LaborContract>('labor_contracts', { ...payload, token: makeToken() })
    return rows[0] || null
  }

  async function makeLinks(only?: string) {
    setLinking(true)
    try {
      const targets = docs.filter(d => (only ? d.id === only : !d.signed))
      let n = 0
      for (const d of targets) { if (await makeLink(d)) n++ }
      await loadContracts(docs.map(d => d.id))
      if (n) toast.success(`서명 링크 ${n}개 준비됨. 아래에서 복사해 카톡으로 보내세요.`)
    } catch (e) {
      toast.error('링크 만들기 실패: ' + (e as Error).message + ' (020 마이그레이션을 실행했는지 확인)')
    } finally { setLinking(false) }
  }

  async function copyText(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); toast.success(`${what} 복사됨`) }
    catch { toast.info(text, { duration: 15000 }) }
  }
  function copyAll() {
    const lines = docs.filter(d => d.latest).map(d => signLinkMessage(d.fields.workerName, inquiry?.event_name || '', linkOf(d.latest!)))
    if (!lines.length) { toast.error('먼저 링크를 만드세요'); return }
    copyText(lines.join('\n\n'), `링크 ${lines.length}개`)
  }

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
      <aside className="w-[380px] shrink-0 border-r border-gray-200 bg-white overflow-y-auto p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Button onClick={handlePrint} className="flex-1 h-10 font-bold"><Printer className="h-4 w-4" />인쇄 / PDF 저장 ({docs.length}장)</Button>
          <Button variant="outline" onClick={reset} title="자동값으로 되돌리기" className="h-10"><RotateCcw className="h-4 w-4" /></Button>
        </div>
        <p className="text-xs text-gray-500">{inquiry?.company_name} · {inquiry?.event_name} · {inquiry?.event_start?.slice(0, 10)}{inquiry?.event_end && inquiry.event_end !== inquiry.event_start ? `~${inquiry.event_end.slice(5, 10)}` : ''}</p>

        {/* 서명 링크 */}
        <section className="rounded-xl border-2 border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-extrabold text-emerald-900 flex items-center gap-1"><Link2 className="h-4 w-4" />서명 링크</p>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={linking} onClick={() => makeLinks()} className="h-7 text-xs border-emerald-400 text-emerald-800 bg-white">
                {linking ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}{docs.length > 1 ? '전원 링크 만들기' : '링크 만들기'}
              </Button>
              {docs.length > 1 && <Button size="sm" variant="outline" onClick={copyAll} className="h-7 text-xs border-emerald-400 text-emerald-800 bg-white"><Copy className="h-3.5 w-3.5" />전체 복사</Button>}
            </div>
          </div>
          <ul className="space-y-1">
            {docs.map(d => (
              <li key={d.id} className="flex items-center gap-1.5 text-xs">
                <span className="font-bold text-gray-800 w-16 truncate">{d.fields.workerName || '(이름 없음)'}</span>
                {d.signed ? (
                  <span className="inline-flex items-center gap-0.5 text-emerald-700 font-bold"><CheckCircle2 className="h-3.5 w-3.5" />서명완료 <span className="font-normal text-gray-500">{fmtSignedAt(d.signed.signed_at || '')}</span></span>
                ) : d.latest ? (
                  <span className="inline-flex items-center gap-0.5 text-amber-700 font-bold"><Clock className="h-3.5 w-3.5" />서명 대기</span>
                ) : (
                  <span className="text-gray-400">링크 없음</span>
                )}
                <span className="ml-auto flex gap-1">
                  {d.latest && (
                    <button type="button" onClick={() => copyText(signLinkMessage(d.fields.workerName, inquiry?.event_name || '', linkOf(d.latest!)), `${d.fields.workerName} 링크`)}
                      className="h-6 px-2 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50" title="카톡에 붙여넣을 문구 복사">복사</button>
                  )}
                  {!d.signed && (
                    <button type="button" disabled={linking} onClick={() => makeLinks(d.id)}
                      className="h-6 px-2 rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50" title={d.latest ? '지금 화면 내용으로 링크 내용을 갱신 (주소는 그대로)' : '이 사람 링크 만들기'}>{d.latest ? '갱신' : '만들기'}</button>
                  )}
                  {d.signed && (
                    <button type="button" disabled={linking} onClick={() => { if (confirm(`${d.fields.workerName}님은 이미 서명했습니다. 새 링크를 만들면 다시 서명을 받아야 합니다. 계속할까요?`)) makeLinks(d.id) }}
                      className="h-6 px-2 rounded-full border border-gray-300 bg-white text-gray-500 hover:bg-gray-50" title="내용이 바뀌어 다시 서명받아야 할 때">새 링크</button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {anySigned && (
            <label className="flex items-center gap-2 text-xs text-gray-700 pt-1">
              <input type="checkbox" checked={showSigned} onChange={e => setShowSigned(e.target.checked)} />서명 끝난 사람은 서명본(서명 당시 내용)으로 보기·인쇄
            </label>
          )}
          <p className="text-2xs text-gray-500">링크를 만든 순간의 내용이 저장되어 크루에게 보입니다. 내용을 고쳤으면 ‘갱신’을 눌러야 반영됩니다. 링크를 아는 사람만 열 수 있으니 본인에게만 보내세요.</p>
        </section>

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
            <p className="text-2xs text-amber-700 mt-1">비어 있는 칸은 아래에서 직접 적을 수 있고, 전화·주민번호·계좌는 크루관리에도 저장할 수 있습니다.</p>
          </div>
        )}

        {current && (
          <div className="space-y-2">
            {current.signed && showSigned && <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1.5">서명본을 보는 중입니다. 아래 수정은 새 링크를 만들 때만 쓰입니다.</p>}
            {EDIT_ORDER.map(({ key, long }) => {
              const perPerson = PER_PERSON_KEYS.includes(key)
              const disabled = editingAll && docs.length > 1 && perPerson
              const hidden = (variant === '상세' && key === 'workerBirth') || (variant === '기본' && key === 'workerIdNumber')
              if (hidden) return null
              const val = current.fields[key] || ''
              return (
                <div key={key}>
                  <label className="text-xs font-bold text-gray-600 mb-0.5 block">{FIELD_LABELS[key]}{disabled && <span className="text-gray-400 font-normal"> · 사람마다 다름</span>}</label>
                  {long
                    ? <Textarea value={val} disabled={disabled} rows={2} onChange={e => setField(key, e.target.value)} className="text-sm" />
                    : <Input value={val} disabled={disabled} type={key === 'signDate' ? 'date' : 'text'} onChange={e => setField(key, e.target.value)}
                        placeholder={SAVABLE[key] && !val ? '비어 있음 — 여기에 적으면 됩니다' : undefined} className="h-9 text-sm" />}
                  {SAVABLE[key] && !disabled && current.person.staff && val.trim() && val.trim() !== staffValueOf(current.person.staff, key) && (
                    <button type="button" disabled={savingKey !== null} onClick={() => saveToStaff(current, key)}
                      className="mt-1 text-xs font-bold text-emerald-700 hover:underline disabled:opacity-50">
                      {savingKey === key ? '저장 중…' : `이 ${SAVABLE[key]} 크루관리에도 저장 (다음부터 자동)`}
                    </button>
                  )}
                  {SAVABLE[key] && !current.person.staff && !val.trim() && (
                    <p className="mt-0.5 text-2xs text-gray-400">크루관리에 연결되지 않은 사람이라 여기 적은 값은 이 계약서에만 쓰입니다.</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <p className="text-2xs text-gray-400">여기서 고친 값은 인쇄와 서명 링크에만 쓰이고 배정·크루 정보는 바뀌지 않습니다. 크루 정보가 틀리면 크루관리에서 고치세요.</p>
      </aside>

      {/* 오른쪽: 미리보기 */}
      <div className="flex-1 overflow-auto bg-gray-200 p-6">
        <div ref={docsRef} className="space-y-6">
          {docs.map(d => (
            <div key={d.id} className="shadow-lg"><LaborContractDoc fields={d.shown} signature={d.signature} /></div>
          ))}
        </div>
      </div>
    </div>
  )
}
