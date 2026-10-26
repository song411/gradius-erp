'use client'

// 현장 기록
// ─────────────────────────────────────────────────────────
// 현장(휴대폰)에서: 행사 고르고 → 칩 하나 → 한 줄 → 저장. 숫자는 선택.
// 사무실(PC)에서: '반영 대기함'을 보며 지급·부대비용·배정·견적에 손으로 반영하고 "반영됨"을 남긴다.
//
// 이 화면은 돈을 쓰지 않는다. 유일한 예외는 '부대비용으로 등록' 버튼 — 사람이 누를 때만
// event_expenses 에 한 줄 생긴다 (부대비용 수동 입력 원칙 그대로, 버튼이 곧 수동 입력이다).

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { db } from '@/lib/supabase/api'
import { formatKRW, todayKST } from '@/lib/utils'
import { coversDate } from '@/components/schedule/matrixCore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import RelatedLinks from '@/components/ui/RelatedLinks'
import { EXPENSE_CATEGORIES } from '@/components/payouts/ExpensesSection'
import { toast } from 'sonner'
import { Clock, Users, Banknote, Receipt, AlertCircle, Database, Copy, Search, Check, Undo2, Inbox, PenLine, ChevronDown, ChevronRight } from 'lucide-react'
import type { Inquiry, FieldLog, FieldLogKind } from '@/lib/supabase/types'

const KINDS: { key: FieldLogKind; icon: React.ReactNode; hint: string; color: string }[] = [
  { key: '연장',     icon: <Clock className="h-4 w-4" />,       hint: '예) 2시간 연장, 전원 / 팀장만 1시간', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { key: '인원변경', icon: <Users className="h-4 w-4" />,       hint: '예) 김OO 추가 투입 / 이OO 불참, 박OO 대체', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { key: '추가지급', icon: <Banknote className="h-4 w-4" />,    hint: '예) 김OO 야간 3만원 추가 / 전원 교통비 1만원', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { key: '부대비용', icon: <Receipt className="h-4 w-4" />,     hint: '예) 주차비 2만원 / 생수 1.5만원 (영수증 보관)', color: 'bg-violet-100 text-violet-800 border-violet-300' },
  { key: '특이사항', icon: <AlertCircle className="h-4 w-4" />, hint: '예) 고객이 다음 행사도 문의 / 현장 동선 변경', color: 'bg-gray-100 text-gray-700 border-gray-300' },
]
const KIND_STYLE = Object.fromEntries(KINDS.map(k => [k.key, k.color])) as Record<string, string>

const APPLY_TARGETS = ['지급', '부대비용', '배정', '견적·정산', '출석', '해당없음'] as const

// 현장에서 적는 사람 — 기기에 기억해 둔다 (로그인 이름이 따로 없다)
const AUTHOR_KEY = 'field_log_author'

const SETUP_SQL = `CREATE TABLE IF NOT EXISTS field_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id  UUID NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT '특이사항',
  content     TEXT NOT NULL,
  hours       NUMERIC(5,1),
  headcount   INTEGER,
  amount      INTEGER,
  staff_name  TEXT,
  log_date    DATE,
  author      TEXT,
  applied_at  TIMESTAMPTZ,
  applied_to  TEXT,
  applied_note TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_field_logs_inquiry ON field_logs(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_field_logs_pending ON field_logs(created_at DESC) WHERE applied_at IS NULL;`

const OPS_STATUSES = ['체결', '배정완료', '진행중', '완료', '정산완료']

function fmtWhen(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d)
  const get = (t: string) => parts.find(x => x.type === t)?.value || ''
  return `${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}

function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00'); d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export default function FieldLogContent() {
  const searchParams = useSearchParams()
  const [tab, setTab]             = useState<'write' | 'inbox'>(searchParams.get('tab') === 'inbox' ? 'inbox' : 'write')
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [logs, setLogs]           = useState<FieldLog[]>([])
  const [ready, setReady]         = useState(true)
  const [loading, setLoading]     = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [inqs, lg] = await Promise.all([
      db.list<Inquiry>('inquiries', { inFilter: { status: OPS_STATUSES }, order: 'event_start', asc: false }),
      db.list<FieldLog>('field_logs', { order: 'created_at', asc: false }).then(r => { setReady(true); return r }).catch(() => { setReady(false); return [] as FieldLog[] }),
    ])
    setInquiries(inqs)
    setLogs(lg)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const pending = logs.filter(l => !l.applied_at)

  async function copySql() {
    try { await navigator.clipboard.writeText(SETUP_SQL); toast.success('SQL을 복사했습니다. Supabase → SQL Editor에 붙여넣고 실행하세요.', { duration: 6000 }) }
    catch { toast.error('복사 실패. supabase/migrations/017_field_logs.sql 파일을 열어 주세요.') }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" /></div>
  }

  if (!ready) {
    return (
      <div className="p-4 max-w-xl mx-auto">
        <div className="border-2 border-amber-300 bg-amber-50 rounded-xl p-4 space-y-2">
          <p className="text-sm font-bold text-amber-800 flex items-center gap-1.5"><Database className="h-4 w-4" />현장 기록 — 준비 한 단계 남았습니다</p>
          <p className="text-xs text-amber-700">기록을 담을 표(field_logs)가 아직 없습니다. 아래 SQL을 Supabase에서 한 번 실행하면 바로 쓸 수 있습니다. 기존 데이터는 건드리지 않습니다.</p>
          <Button size="sm" onClick={copySql} className="gap-1"><Copy className="h-3.5 w-3.5" />SQL 복사</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-3 md:p-5 space-y-4">
      {/* 탭 — 손가락으로 누르기 좋게 크게 */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setTab('write')}
          className={`h-12 rounded-xl border-2 font-bold text-sm flex items-center justify-center gap-2 ${tab === 'write' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>
          <PenLine className="h-4 w-4" />현장에서 적기
        </button>
        <button onClick={() => setTab('inbox')}
          className={`h-12 rounded-xl border-2 font-bold text-sm flex items-center justify-center gap-2 ${tab === 'inbox' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>
          <Inbox className="h-4 w-4" />반영 대기함
          {pending.length > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === 'inbox' ? 'bg-amber-300 text-amber-900' : 'bg-red-500 text-white'}`}>{pending.length}</span>}
        </button>
      </div>

      {tab === 'write'
        ? <WriteTab inquiries={inquiries} logs={logs} initialInquiryId={searchParams.get('inq')} onSaved={load} />
        : <InboxTab inquiries={inquiries} logs={logs} onChanged={load} />}
    </div>
  )
}

// ── 현장에서 적기 ──────────────────────────────────────────
function WriteTab({ inquiries, logs, initialInquiryId, onSaved }: {
  inquiries: Inquiry[]; logs: FieldLog[]; initialInquiryId: string | null; onSaved: () => void
}) {
  const today = todayKST()
  const [inqId, setInqId]       = useState<string>(initialInquiryId || '')
  const [search, setSearch]     = useState('')
  const [kind, setKind]         = useState<FieldLogKind>('연장')
  const [content, setContent]   = useState('')
  const [hours, setHours]       = useState('')
  const [headcount, setHeadcount] = useState('')
  const [amount, setAmount]     = useState('')
  const [staffName, setStaffName] = useState('')
  const [logDate, setLogDate]   = useState(today)
  const [author, setAuthor]     = useState('')
  const [saving, setSaving]     = useState(false)

  useEffect(() => {
    try { setAuthor(localStorage.getItem(AUTHOR_KEY) || '') } catch { /* 저장소 막힌 환경 */ }
  }, [])

  // 행사 고르기 — 오늘 열리는 것, 다가오는 것(7일), 막 끝난 것(14일) 순. 그 밖은 검색으로
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const hit = (i: Inquiry) => !q || [i.event_name, i.company_name, i.location].some(v => v?.toLowerCase().includes(q))
    const todayList    = inquiries.filter(i => coversDate(i, today) && hit(i))
    const upcoming     = inquiries.filter(i => !coversDate(i, today) && (i.event_start || '') > today && (i.event_start || '') <= addDays(today, 7) && hit(i))
    const justFinished = inquiries.filter(i => !coversDate(i, today) && (i.event_end || i.event_start || '') < today && (i.event_end || i.event_start || '') >= addDays(today, -14) && hit(i))
    const shownIds = new Set([...todayList, ...upcoming, ...justFinished].map(i => i.id))
    const others = q ? inquiries.filter(i => !shownIds.has(i.id) && hit(i)).slice(0, 20) : []
    return { todayList, upcoming, justFinished, others }
  }, [inquiries, search, today])

  const selected = inquiries.find(i => i.id === inqId)
  const kindMeta = KINDS.find(k => k.key === kind)!
  const myLogs = logs.filter(l => l.inquiry_id === inqId)

  async function save() {
    if (!inqId) { toast.info('행사를 먼저 고르세요.'); return }
    if (!content.trim()) { toast.info('한 줄만 적어 주세요. 숫자는 비워도 됩니다.'); return }
    setSaving(true)
    try {
      await db.insert('field_logs', {
        inquiry_id: inqId, kind, content: content.trim(),
        hours: hours ? Number(hours) : null,
        headcount: headcount ? Number(headcount) : null,
        amount: amount ? Math.round(Number(amount)) : null,
        staff_name: staffName.trim() || null,
        log_date: logDate || today,
        author: author.trim() || null,
      })
      try { localStorage.setItem(AUTHOR_KEY, author.trim()) } catch { /* 무시 */ }
      toast.success(`${kind} 기록 저장 — 사무실 반영 대기함에 들어갔습니다.`)
      setContent(''); setHours(''); setHeadcount(''); setAmount(''); setStaffName('')
      onSaved()
    } catch (e) {
      toast.error('저장 실패: ' + (e as Error).message)
    } finally { setSaving(false) }
  }

  const EventBtn = ({ i }: { i: Inquiry }) => (
    <button onClick={() => setInqId(i.id)}
      className={`w-full text-left px-3 py-2.5 rounded-lg border-2 ${inqId === i.id ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white hover:border-gray-400'}`}>
      <p className="text-sm font-bold truncate">{i.event_name}</p>
      <p className={`text-xs truncate ${inqId === i.id ? 'text-gray-300' : 'text-gray-500'}`}>
        {i.company_name} · {i.event_start?.slice(5, 10) || i.date_memo || '날짜 미정'}{i.event_end && i.event_end !== i.event_start ? `~${i.event_end.slice(5, 10)}` : ''}
      </p>
    </button>
  )

  return (
    <div className="space-y-4">
      {/* 1. 행사 */}
      <section className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-gray-500">1. 어느 행사</p>
          {selected && <button onClick={() => setInqId('')} className="text-xs text-blue-600">다른 행사</button>}
        </div>
        {selected ? (
          <div className="space-y-2">
            <EventBtn i={selected} />
            <RelatedLinks inquiryId={selected.id} eventName={selected.event_name} companyName={selected.company_name} hide={['입금', '고객사', '세금계산서', '현장기록']} compact />
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input placeholder="행사명·업체 검색" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-11" />
            </div>
            {groups.todayList.length > 0 && <Group label="오늘 진행 중" items={groups.todayList} render={i => <EventBtn key={i.id} i={i} />} />}
            {groups.upcoming.length > 0 && <Group label="곧 시작 (7일 안)" items={groups.upcoming} render={i => <EventBtn key={i.id} i={i} />} />}
            {groups.justFinished.length > 0 && <Group label="막 끝난 행사 (14일 안)" items={groups.justFinished} render={i => <EventBtn key={i.id} i={i} />} />}
            {groups.others.length > 0 && <Group label="검색 결과" items={groups.others} render={i => <EventBtn key={i.id} i={i} />} />}
            {!groups.todayList.length && !groups.upcoming.length && !groups.justFinished.length && !groups.others.length && (
              <p className="text-xs text-gray-400 py-3 text-center">{search ? '검색 결과가 없습니다' : '오늘 전후로 잡힌 행사가 없습니다. 행사명으로 검색해 보세요.'}</p>
            )}
          </>
        )}
      </section>

      {/* 2. 무슨 일 */}
      <section className={`bg-white rounded-xl border border-gray-200 p-3 space-y-3 ${!selected ? 'opacity-50 pointer-events-none' : ''}`}>
        <p className="text-xs font-bold text-gray-500">2. 무슨 일</p>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {KINDS.map(k => (
            <button key={k.key} onClick={() => setKind(k.key)}
              className={`h-12 rounded-xl border-2 text-sm font-bold flex items-center justify-center gap-1.5 ${kind === k.key ? k.color + ' ring-2 ring-offset-1 ring-gray-800' : 'bg-white text-gray-600 border-gray-200'}`}>
              {k.icon}{k.key}
            </button>
          ))}
        </div>
        <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder={kindMeta.hint} rows={3} className="text-base" />

        {/* 숫자는 선택 — 종류에 맞는 칸만 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {kind === '연장' && <Field label="연장 시간"><Input type="number" step="0.5" inputMode="decimal" value={hours} onChange={e => setHours(e.target.value)} placeholder="2" className="h-11" /></Field>}
          {(kind === '연장' || kind === '인원변경') && <Field label={kind === '연장' ? '해당 인원' : '인원 증감 (+2/-1)'}><Input type="number" inputMode="numeric" value={headcount} onChange={e => setHeadcount(e.target.value)} placeholder={kind === '연장' ? '전원이면 비움' : '+1'} className="h-11" /></Field>}
          {(kind === '추가지급' || kind === '부대비용') && <Field label="금액 (원)"><Input type="number" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} placeholder="30000" className="h-11" /></Field>}
          {(kind === '인원변경' || kind === '추가지급' || kind === '연장') && <Field label="관련 크루"><Input value={staffName} onChange={e => setStaffName(e.target.value)} placeholder="이름 (선택)" className="h-11" /></Field>}
          <Field label="날짜"><Input type="date" value={logDate} onChange={e => setLogDate(e.target.value)} className="h-11" /></Field>
          <Field label="적는 사람"><Input value={author} onChange={e => setAuthor(e.target.value)} placeholder="이름" className="h-11" /></Field>
        </div>

        <Button onClick={save} disabled={saving || !selected} className="w-full h-12 text-base font-bold">
          {saving ? '저장 중...' : '저장'}
        </Button>
        <p className="text-2xs text-gray-400">저장해도 지급·부대비용에 바로 들어가지 않습니다. 사무실에서 반영 대기함을 보고 반영합니다.</p>
      </section>

      {/* 이 행사에 쌓인 기록 */}
      {selected && myLogs.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
          <p className="text-xs font-bold text-gray-500">이 행사 기록 {myLogs.length}건 · 미반영 {myLogs.filter(l => !l.applied_at).length}건</p>
          {myLogs.map(l => <LogLine key={l.id} log={l} />)}
        </section>
      )}
    </div>
  )
}

function Group({ label, items, render }: { label: string; items: Inquiry[]; render: (i: Inquiry) => React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-2xs font-bold text-gray-400 uppercase tracking-wider">{label}</p>
      {items.map(render)}
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-2xs font-semibold text-gray-500 block mb-1">{label}</label>{children}</div>
}

function LogLine({ log }: { log: FieldLog }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${log.applied_at ? 'border-gray-100 bg-gray-50 opacity-70' : 'border-amber-200 bg-amber-50/60'}`}>
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className={`px-1.5 py-0.5 rounded font-bold border ${KIND_STYLE[log.kind] || KIND_STYLE['특이사항']}`}>{log.kind}</span>
        <span className="text-gray-500">{log.log_date?.slice(5) || ''}</span>
        {log.author && <span className="text-gray-400">· {log.author}</span>}
        <span className="text-gray-400 ml-auto">{fmtWhen(log.created_at)}</span>
      </div>
      <p className="text-sm text-gray-800 mt-1 whitespace-pre-line">{log.content}</p>
      <Numbers log={log} />
      {log.applied_at && <p className="text-2xs text-green-700 mt-1">✓ 반영됨 · {log.applied_to}{log.applied_note ? ` · ${log.applied_note}` : ''} · {fmtWhen(log.applied_at)}</p>}
    </div>
  )
}
function Numbers({ log }: { log: FieldLog }) {
  const parts: string[] = []
  if (log.hours != null) parts.push(`${log.hours}시간`)
  if (log.headcount != null) parts.push(`${log.headcount > 0 ? '+' : ''}${log.headcount}명`)
  if (log.amount != null) parts.push(formatKRW(log.amount))
  if (log.staff_name) parts.push(log.staff_name)
  if (!parts.length) return null
  return <p className="text-xs text-gray-600 mt-0.5 font-semibold">{parts.join(' · ')}</p>
}

// ── 반영 대기함 (사무실) ────────────────────────────────────
function InboxTab({ inquiries, logs, onChanged }: { inquiries: Inquiry[]; logs: FieldLog[]; onChanged: () => void }) {
  const [showDone, setShowDone] = useState(false)
  const [busy, setBusy]         = useState<string | null>(null)
  const [applyId, setApplyId]   = useState<string | null>(null)
  const [applyTo, setApplyTo]   = useState<string>('지급')
  const [applyNote, setApplyNote] = useState('')
  const [expCategory, setExpCategory] = useState('기타')
  const [openEvents, setOpenEvents] = useState<Set<string>>(new Set())

  const inqMap = new Map(inquiries.map(i => [i.id, i]))
  const list = logs.filter(l => showDone ? !!l.applied_at : !l.applied_at)

  // 행사별로 묶는다 — 반영은 행사 단위로 지급·정산 화면을 열어 놓고 하는 일이라
  const byEvent = new Map<string, FieldLog[]>()
  list.forEach(l => { const a = byEvent.get(l.inquiry_id) || []; a.push(l); byEvent.set(l.inquiry_id, a) })
  const eventIds = [...byEvent.keys()].sort((a, b) => {
    const ea = inqMap.get(a)?.event_start || '', eb = inqMap.get(b)?.event_start || ''
    return eb.localeCompare(ea)
  })

  async function markApplied(log: FieldLog, to: string, note: string) {
    setBusy(log.id)
    try {
      await db.update('field_logs', log.id, { applied_at: new Date().toISOString(), applied_to: to, applied_note: note || null })
      toast.success(`반영됨으로 표시 (${to})`)
      setApplyId(null); setApplyNote('')
      onChanged()
    } catch (e) { toast.error('실패: ' + (e as Error).message) }
    finally { setBusy(null) }
  }
  async function revert(log: FieldLog) {
    if (!confirm('반영 표시를 지우고 대기함으로 되돌립니다. (지급·부대비용에 이미 넣은 것은 그대로입니다)')) return
    setBusy(log.id)
    try {
      await db.update('field_logs', log.id, { applied_at: null, applied_to: null, applied_note: null })
      onChanged()
    } catch (e) { toast.error('실패: ' + (e as Error).message) }
    finally { setBusy(null) }
  }
  // 부대비용은 여기서 직접 만든다 — 사람이 이 버튼을 누르는 것이 곧 '직접 입력'이다
  async function registerExpense(log: FieldLog) {
    if (!log.amount) { toast.info('금액이 없어 등록할 수 없습니다. 반영 표시만 하거나, 기록에 금액을 적어 주세요.'); return }
    if (!confirm(`${inqMap.get(log.inquiry_id)?.event_name || '이 행사'}에 부대비용 ${expCategory} ${formatKRW(log.amount)}을 등록합니다.`)) return
    setBusy(log.id)
    try {
      await db.insert('event_expenses', { inquiry_id: log.inquiry_id, category: expCategory, amount: log.amount, memo: `[현장기록] ${log.content}`, spent_on: log.log_date || null })
      await db.update('field_logs', log.id, { applied_at: new Date().toISOString(), applied_to: '부대비용', applied_note: `${expCategory} ${formatKRW(log.amount)} 등록` })
      toast.success(`부대비용 ${formatKRW(log.amount)} 등록 완료`)
      onChanged()
    } catch (e) { toast.error('등록 실패: ' + (e as Error).message) }
    finally { setBusy(null) }
  }

  if (list.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center space-y-3">
        <p className="text-sm text-gray-500">{showDone ? '반영된 기록이 없습니다.' : '반영 대기 중인 현장 기록이 없습니다 ✅'}</p>
        <button onClick={() => setShowDone(v => !v)} className="text-xs text-blue-600 underline">{showDone ? '대기함 보기' : '반영된 것 보기'}</button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">{showDone ? `반영된 기록 ${list.length}건` : `반영 대기 ${list.length}건 · 행사 ${eventIds.length}개`}</p>
        <button onClick={() => setShowDone(v => !v)} className="text-xs text-blue-600 underline">{showDone ? '대기함 보기' : '반영된 것 보기'}</button>
      </div>

      {eventIds.map(eid => {
        const inq = inqMap.get(eid)
        const items = byEvent.get(eid) || []
        const open = !openEvents.has(eid)   // 기본은 펼침, 누르면 접힘
        const sum = { hours: items.reduce((a, l) => a + (l.hours || 0), 0), amount: items.reduce((a, l) => a + (l.amount || 0), 0) }
        return (
          <div key={eid} className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
            <button onClick={() => setOpenEvents(p => { const n = new Set(p); if (n.has(eid)) n.delete(eid); else n.add(eid); return n })}
              className="w-full px-4 py-3 flex items-center gap-2 text-left bg-gray-50 border-b border-gray-200">
              {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{inq?.event_name || '(행사 없음)'}</p>
                <p className="text-xs text-gray-500">{inq?.company_name} · {inq?.event_start?.slice(0, 10)}{inq?.event_end && inq.event_end !== inq.event_start ? ` ~ ${inq.event_end.slice(0, 10)}` : ''} · {items.length}건
                  {sum.hours > 0 ? ` · 연장 ${sum.hours}h` : ''}{sum.amount > 0 ? ` · ${formatKRW(sum.amount)}` : ''}</p>
              </div>
              <span className="text-xs font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">{items.length}</span>
            </button>
            {open && (
              <div className="p-3 space-y-2">
                {inq && <RelatedLinks inquiryId={inq.id} eventName={inq.event_name} companyName={inq.company_name} hide={['입금', '고객사', '현장기록']} compact />}
                {items.map(l => (
                  <div key={l.id} className="rounded-lg border border-gray-200 px-3 py-2 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className={`px-1.5 py-0.5 rounded font-bold border ${KIND_STYLE[l.kind] || KIND_STYLE['특이사항']}`}>{l.kind}</span>
                      <span className="text-gray-500">{l.log_date || ''}</span>
                      {l.author && <span className="text-gray-400">· {l.author}</span>}
                      <span className="text-gray-400 ml-auto">{fmtWhen(l.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-800 whitespace-pre-line">{l.content}</p>
                    <Numbers log={l} />
                    {l.applied_at ? (
                      <div className="flex items-center gap-2 text-2xs text-green-700">
                        ✓ 반영됨 · {l.applied_to}{l.applied_note ? ` · ${l.applied_note}` : ''} · {fmtWhen(l.applied_at)}
                        <button onClick={() => revert(l)} disabled={busy === l.id} className="ml-auto text-gray-400 hover:text-red-600 flex items-center gap-0.5"><Undo2 className="h-3 w-3" />되돌리기</button>
                      </div>
                    ) : applyId === l.id ? (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Select value={applyTo} onChange={e => setApplyTo(e.target.value)} className="h-8 text-xs w-32">
                          {APPLY_TARGETS.map(t => <option key={t} value={t}>{t}</option>)}
                        </Select>
                        <Input value={applyNote} onChange={e => setApplyNote(e.target.value)} placeholder="메모 (예: 김OO 연장수당 6만원)" className="h-8 text-xs flex-1 min-w-[160px]" />
                        <Button size="sm" className="h-8 text-xs gap-1" disabled={busy === l.id} onClick={() => markApplied(l, applyTo, applyNote)}><Check className="h-3 w-3" />반영됨</Button>
                        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setApplyId(null)}>취소</Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {l.kind === '부대비용' && l.amount ? (
                          <>
                            <Select value={expCategory} onChange={e => setExpCategory(e.target.value)} className="h-8 text-xs w-28">
                              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </Select>
                            <Button size="sm" className="h-8 text-xs gap-1 bg-violet-600 hover:bg-violet-700" disabled={busy === l.id} onClick={() => registerExpense(l)}>
                              <Receipt className="h-3 w-3" />부대비용으로 등록 ({formatKRW(l.amount)})
                            </Button>
                          </>
                        ) : null}
                        <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => {
                          setApplyId(l.id); setApplyNote('')
                          setApplyTo(l.kind === '추가지급' || l.kind === '연장' ? '지급' : l.kind === '인원변경' ? '배정' : l.kind === '부대비용' ? '부대비용' : '해당없음')
                        }}>
                          <Check className="h-3 w-3" />반영 완료 표시
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
