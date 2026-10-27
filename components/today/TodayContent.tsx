'use client'

// 오늘 현장 — 휴대폰 전용 화면
// ─────────────────────────────────────────────────────────
// 사무실 ERP는 PC 화면 기준이라 현장에서 휴대폰으로는 보기 어렵다. 이 화면은 그 반대다.
// 사이드바 없음, 글자 큼, 이번 주 행사만. 행사 카드를 누르면 크루 명단·전화·출석·한 줄 기록.
//
// 읽는 표는 사무실 화면과 같다(inquiries·assignments·attendances·field_logs). 새 표 없음.
// 쓰는 것은 field_logs 한 줄뿐 — 현장 기록(/field)과 같은 칸에 같은 모양으로 들어가므로
// 사무실 반영 대기함에서 똑같이 보인다. 돈·배정 표는 여기서 건드리지 않는다.

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { db } from '@/lib/supabase/api'
import { todayKST } from '@/lib/utils'
import { coversDate, eventDatesOf } from '@/components/schedule/matrixCore'
import { EVAL_FIELDS, evalTotal, saveEvaluation, type EvalScores } from '@/lib/evaluation'
import { toast } from 'sonner'
import {
  MapPin, Phone, Clock, Users, ChevronDown, ChevronUp, RefreshCw, Monitor,
  PenLine, Share, MoreVertical, X, CheckCircle2, Crown, Star,
} from 'lucide-react'
import type { Inquiry, Assignment, Attendance, FieldLog, FieldLogKind, Evaluation } from '@/lib/supabase/types'

// 운영 단계의 행사만. 현장 기록 화면과 같은 기준
const OPS_STATUSES = ['체결', '배정완료', '진행중', '완료', '정산완료']
const KINDS: FieldLogKind[] = ['연장', '인원변경', '추가지급', '부대비용', '특이사항']
const KIND_HINT: Record<FieldLogKind, string> = {
  연장:     '예) 2시간 연장, 전원',
  인원변경: '예) 김OO 불참, 박OO 대체',
  추가지급: '예) 김OO 야간 3만원 추가',
  부대비용: '예) 주차비 2만원 (영수증 보관)',
  특이사항: '예) 고객이 다음 행사도 문의',
}
// 현장 기록 화면과 같은 키 — 한 번 적은 이름을 두 화면이 같이 쓴다
const AUTHOR_KEY = 'field_log_author'
const INSTALL_HINT_KEY = 'today_install_hint_dismissed'
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
function fmtDay(ymd: string): string {
  const d = new Date(ymd + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAY[d.getDay()]})`
}
function fmtWhen(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d)
  const g = (t: string) => p.find(x => x.type === t)?.value || ''
  return `${g('month')}/${g('day')} ${g('hour')}:${g('minute')}`
}

// beforeinstallprompt 는 표준 타입에 없다 (안드로이드 크롬 전용)
interface InstallPromptEvent extends Event { prompt: () => Promise<void> }

export default function TodayContent() {
  const today = todayKST()
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [inquiries, setInquiries]     = useState<Inquiry[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [attendances, setAttendances] = useState<Attendance[]>([])
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [logs, setLogs]               = useState<FieldLog[]>([])
  const [openId, setOpenId]           = useState<string | null>(null)
  const [showPast, setShowPast]       = useState(false)
  const [author, setAuthor]           = useState('')
  const [installHint, setInstallHint] = useState(false)
  const [installEvt, setInstallEvt]   = useState<InstallPromptEvent | null>(null)
  const [isIOS, setIsIOS]             = useState(false)

  // ── 휴대폰 화면 고정 ───────────────────────────────────
  // ViewportToggle 이 '데스크탑 모드'를 저장해 두었어도 이 화면은 휴대폰 폭으로 본다.
  // 이 화면의 존재 이유가 그것이다.
  useEffect(() => {
    const fix = () => {
      const meta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null
      if (meta) meta.content = 'width=device-width, initial-scale=1, viewport-fit=cover'
    }
    fix()
    const t = setTimeout(fix, 50)
    try { setAuthor(localStorage.getItem(AUTHOR_KEY) || '') } catch { /* 저장소 막힘 */ }

    // 홈 화면 추가 안내 — 이미 앱으로 열었거나, 한 번 닫았으면 안 띄운다
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true
    let dismissed = false
    try { dismissed = localStorage.getItem(INSTALL_HINT_KEY) === '1' } catch { /* 무시 */ }
    setIsIOS(/iPhone|iPad|iPod/i.test(navigator.userAgent))
    setInstallHint(!standalone && !dismissed)

    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvt(e as InstallPromptEvent) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => { clearTimeout(t); window.removeEventListener('beforeinstallprompt', onPrompt) }
  }, [])

  // ── 불러오기 ───────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const all = await db.list<Inquiry>('inquiries', { inFilter: { status: OPS_STATUSES }, order: 'event_start', asc: false })
      // 지난 7일 ~ 앞으로 7일 안에 운영일이 하나라도 걸리는 행사만
      const from = addDays(today, -7), to = addDays(today, 7)
      const inWindow = all.filter(i => eventDatesOf(i).some(d => d >= from && d <= to))
      setInquiries(inWindow)
      const ids = inWindow.map(i => i.id)
      if (ids.length === 0) { setAssignments([]); setAttendances([]); setEvaluations([]); setLogs([]); return }
      const [asgns, atts, lg] = await Promise.all([
        db.list<Assignment>('assignments', { inFilter: { inquiry_id: ids }, order: 'assigned_at', asc: true }),
        db.list<Attendance>('attendances', { inFilter: { inquiry_id: ids }, order: 'work_date', asc: true }),
        // 현장 기록은 덤 — 실패해도 행사 목록은 떠야 한다
        db.list<FieldLog>('field_logs', { inFilter: { inquiry_id: ids }, order: 'created_at', asc: false }).catch(() => [] as FieldLog[]),
      ])
      setAssignments(asgns)
      setAttendances(atts)
      setLogs(lg)
      // 평가는 배정 id 로 찾는다 (id 가 많아도 db.list 가 알아서 끊어 묻는다)
      const evals = await db.list<Evaluation>('evaluations', { inFilter: { assignment_id: asgns.map(a => a.id) }, order: 'evaluated_at', asc: false }).catch(() => [] as Evaluation[])
      setEvaluations(evals)
    } catch (e) {
      setError((e as Error).message || '불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [today])

  useEffect(() => { load() }, [load])

  // ── 묶기: 오늘 / 다가오는 7일 / 지난 7일 ──────────────
  const groups = useMemo(() => {
    const next = (i: Inquiry) => eventDatesOf(i).find(d => d > today) || ''
    const last = (i: Inquiry) => [...eventDatesOf(i)].reverse().find(d => d < today) || ''
    const todayList = inquiries.filter(i => coversDate(i, today))
      .sort((a, b) => (a.event_time || '').localeCompare(b.event_time || ''))
    const upcoming = inquiries.filter(i => !coversDate(i, today) && next(i) && next(i) <= addDays(today, 7))
      .sort((a, b) => next(a).localeCompare(next(b)))
    const past = inquiries.filter(i => !coversDate(i, today) && !upcoming.includes(i) && last(i) >= addDays(today, -7))
      .sort((a, b) => last(b).localeCompare(last(a)))
    return { todayList, upcoming, past }
  }, [inquiries, today])

  function dismissHint() {
    setInstallHint(false)
    try { localStorage.setItem(INSTALL_HINT_KEY, '1') } catch { /* 무시 */ }
  }
  async function install() {
    if (!installEvt) return
    await installEvt.prompt()
    setInstallEvt(null)
    dismissHint()
  }

  return (
    <div className="max-w-lg mx-auto pb-24">
      {/* 상단 바 */}
      <header className="sticky top-0 z-20 bg-gray-900 text-white px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-2xs text-gray-400 font-semibold tracking-wider">가디어스 · 현장</p>
          <h1 className="text-lg font-extrabold leading-tight">오늘 현장 <span className="text-gray-300 font-semibold">{fmtDay(today)}</span></h1>
        </div>
        <button onClick={load} disabled={loading} title="새로고침"
          className="h-11 w-11 rounded-full bg-gray-800 flex items-center justify-center active:scale-95">
          <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <Link href="/" title="PC 화면으로" className="h-11 w-11 rounded-full bg-gray-800 flex items-center justify-center active:scale-95">
          <Monitor className="h-5 w-5" />
        </Link>
      </header>

      <div className="px-4 pt-4 space-y-5">
        {/* 홈 화면 추가 안내 */}
        {installHint && (
          <div className="rounded-2xl bg-blue-50 border border-blue-200 p-4 relative">
            <button onClick={dismissHint} className="absolute top-2 right-2 h-9 w-9 flex items-center justify-center text-blue-400" title="닫기"><X className="h-5 w-5" /></button>
            <p className="font-bold text-blue-900 text-base pr-8">홈 화면에 추가하면 앱처럼 열립니다</p>
            {installEvt ? (
              <button onClick={install} className="mt-3 h-12 w-full rounded-xl bg-blue-600 text-white font-bold text-base active:scale-[0.98]">앱으로 설치</button>
            ) : isIOS ? (
              <p className="text-sm text-blue-800 mt-2 leading-relaxed">
                Safari 아래 <Share className="inline h-4 w-4 -mt-0.5" /> 공유 버튼 → <b>홈 화면에 추가</b>
              </p>
            ) : (
              <p className="text-sm text-blue-800 mt-2 leading-relaxed">
                브라우저 메뉴 <MoreVertical className="inline h-4 w-4 -mt-0.5" /> → <b>홈 화면에 추가</b> (또는 앱 설치)
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="rounded-2xl bg-red-50 border border-red-200 p-4">
            <p className="font-bold text-red-800">불러오지 못했습니다</p>
            <p className="text-sm text-red-700 mt-1 break-all">{error}</p>
            <button onClick={load} className="mt-3 h-11 px-5 rounded-xl bg-red-600 text-white font-bold">다시 시도</button>
          </div>
        )}

        {loading && inquiries.length === 0 && !error && (
          <p className="text-center text-gray-400 py-16 text-base">불러오는 중…</p>
        )}

        {!loading && !error && inquiries.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-base">앞뒤 일주일에 잡힌 행사가 없습니다.</p>
          </div>
        )}

        <Section title="오늘" count={groups.todayList.length} accent>
          {groups.todayList.map(i => (
            <EventCard key={i.id} inq={i} viewDate={today} isToday
              assignments={assignments.filter(a => a.inquiry_id === i.id)}
              attendances={attendances.filter(t => t.inquiry_id === i.id && t.work_date === today)}
              evaluations={evaluations}
              logs={logs.filter(l => l.inquiry_id === i.id)}
              open={openId === i.id} onToggle={() => setOpenId(openId === i.id ? null : i.id)}
              author={author} onAuthor={setAuthor} onSaved={load} />
          ))}
        </Section>

        <Section title="다가오는 7일" count={groups.upcoming.length}>
          {groups.upcoming.map(i => {
            const d = eventDatesOf(i).find(x => x > today) || today
            return (
              <EventCard key={i.id} inq={i} viewDate={d}
                assignments={assignments.filter(a => a.inquiry_id === i.id)}
                attendances={[]}
                evaluations={evaluations}
                logs={logs.filter(l => l.inquiry_id === i.id)}
                open={openId === i.id} onToggle={() => setOpenId(openId === i.id ? null : i.id)}
                author={author} onAuthor={setAuthor} onSaved={load} />
            )
          })}
        </Section>

        {groups.past.length > 0 && (
          <div>
            <button onClick={() => setShowPast(v => !v)}
              className="w-full h-12 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 font-semibold text-sm flex items-center justify-center gap-2">
              {showPast ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              지난 7일 행사 {groups.past.length}건 {showPast ? '접기' : '보기'}
            </button>
            {showPast && (
              <div className="mt-3 space-y-3">
                {groups.past.map(i => {
                  const d = [...eventDatesOf(i)].reverse().find(x => x < today) || today
                  return (
                    <EventCard key={i.id} inq={i} viewDate={d} isPast
                      assignments={assignments.filter(a => a.inquiry_id === i.id)}
                      attendances={attendances.filter(t => t.inquiry_id === i.id && t.work_date === d)}
                      evaluations={evaluations}
                      logs={logs.filter(l => l.inquiry_id === i.id)}
                      open={openId === i.id} onToggle={() => setOpenId(openId === i.id ? null : i.id)}
                      author={author} onAuthor={setAuthor} onSaved={load} />
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, count, accent, children }: { title: string; count: number; accent?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2 px-1">
        <h2 className={`text-base font-extrabold ${accent ? 'text-gray-900' : 'text-gray-600'}`}>{title}</h2>
        <span className="text-sm text-gray-400 font-semibold">{count}건</span>
      </div>
      {count === 0
        ? <p className="text-sm text-gray-400 px-1 py-2">없음</p>
        : <div className="space-y-3">{children}</div>}
    </section>
  )
}

interface CardProps {
  inq: Inquiry
  viewDate: string
  isToday?: boolean
  isPast?: boolean
  assignments: Assignment[]
  attendances: Attendance[]
  evaluations: Evaluation[]
  logs: FieldLog[]
  open: boolean
  onToggle: () => void
  author: string
  onAuthor: (v: string) => void
  onSaved: () => void
}

function EventCard({ inq, viewDate, isToday, isPast, assignments, attendances, evaluations, logs, open, onToggle, author, onAuthor, onSaved }: CardProps) {
  // 크루 한 명을 누르면 평가 칸이 펼쳐진다 (오늘·지난 행사만)
  const [evalFor, setEvalFor] = useState<string | null>(null)
  const canEval = !!(isToday || isPast)
  // 후보는 아직 사람이 아니다. 확정·배정중만 명단에 올린다
  const crew = assignments.filter(a => a.status === '확정' || a.status === '배정중')
  const evaluated = crew.filter(a => evaluations.some(e => e.assignment_id === a.id)).length
  const confirmed = crew.filter(a => a.status === '확정').length
  const present = attendances.filter(t => t.status === '출석' || t.status === '지각' || t.status === '조퇴' || t.status === '외출').length
  const pendingLogs = logs.filter(l => !l.applied_at).length
  const dates = eventDatesOf(inq)
  const multi = dates.length > 1
  const dateLabel = isToday
    ? (multi ? `오늘 · ${dates.indexOf(viewDate) + 1}/${dates.length}일차` : '오늘')
    : (multi ? `${fmtDay(viewDate)} 외 ${dates.length - 1}일` : fmtDay(viewDate))
  const mapUrl = inq.location ? `https://map.naver.com/v5/search/${encodeURIComponent(inq.location)}` : ''

  return (
    <article className={`rounded-2xl bg-white border-2 shadow-sm overflow-hidden ${isToday ? 'border-gray-900' : isPast ? 'border-gray-200 opacity-80' : 'border-gray-200'}`}>
      {/* 머리: 누르면 펼침 */}
      <button onClick={onToggle} className="w-full text-left p-4 active:bg-gray-50">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className={`text-2xs font-bold tracking-wider mb-1 ${isToday ? 'text-red-600' : 'text-gray-500'}`}>{dateLabel}{inq.event_time ? ` · ${inq.event_time}` : ''}</p>
            <h3 className="text-xl font-extrabold text-gray-900 leading-snug break-keep">{inq.event_name || '(행사명 없음)'}</h3>
            <p className="text-sm text-gray-500 mt-0.5">{inq.company_name}</p>
          </div>
          {open ? <ChevronUp className="h-6 w-6 text-gray-400 shrink-0 mt-1" /> : <ChevronDown className="h-6 w-6 text-gray-400 shrink-0 mt-1" />}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm font-semibold text-gray-700">
          <span className="inline-flex items-center gap-1"><Users className="h-4 w-4 text-gray-400" />확정 {confirmed}명{crew.length > confirmed ? ` (+${crew.length - confirmed} 배정중)` : ''}</span>
          {(isToday || isPast) && <span className="inline-flex items-center gap-1"><CheckCircle2 className={`h-4 w-4 ${present > 0 ? 'text-green-600' : 'text-gray-300'}`} />출석 {present}명</span>}
          {(isToday || isPast) && crew.length > 0 && <span className="inline-flex items-center gap-1"><Star className={`h-4 w-4 ${evaluated === crew.length ? 'text-amber-500' : 'text-gray-300'}`} />평가 {evaluated}/{crew.length}</span>}
          {pendingLogs > 0 && <span className="inline-flex items-center gap-1 text-amber-700"><PenLine className="h-4 w-4" />기록 {pendingLogs}건 반영 전</span>}
        </div>
      </button>

      {/* 장소: 누르면 지도 */}
      {inq.location && (
        <a href={mapUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50 text-sm text-blue-700 font-semibold active:bg-blue-50">
          <MapPin className="h-5 w-5 shrink-0" />
          <span className="flex-1 break-keep">{inq.location}</span>
          <span className="text-2xs text-blue-400 shrink-0">지도</span>
        </a>
      )}

      {open && (
        <div className="border-t border-gray-100">
          {/* 크루 명단 */}
          <div className="p-4">
            <p className="text-2xs font-bold text-gray-500 tracking-wider mb-2">크루 {crew.length}명{canEval && crew.length > 0 ? ' · 이름을 누르면 평가' : ''}</p>
            {crew.length === 0 ? (
              <p className="text-sm text-gray-400">배정된 크루가 없습니다.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {crew.map(a => {
                  const att = attendances.find(t => t.assignment_id === a.id)
                  const ev = evaluations.find(e => e.assignment_id === a.id)
                  const tel = (a.phone || '').replace(/[^0-9+]/g, '')
                  const isOpen = evalFor === a.id
                  return (
                    <li key={a.id} className="py-1">
                      <div className="flex items-center gap-3 py-1.5">
                        <button type="button" disabled={!canEval} onClick={() => setEvalFor(isOpen ? null : a.id)}
                          className={`flex-1 min-w-0 text-left -ml-2 pl-2 py-1 rounded-xl ${canEval ? 'active:bg-amber-50' : ''}`}>
                          <p className="text-base font-bold text-gray-900 flex items-center gap-1.5 flex-wrap">
                            {a.role_type === '팀장' && <Crown className="h-4 w-4 text-amber-500" />}
                            {a.staff_name || '이름 없음'}
                            {a.status === '배정중' && <span className="text-2xs font-semibold text-gray-400">배정중</span>}
                            {ev && (
                              <span className={`text-2xs font-bold px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 ${
                                ev.grade === '우수' ? 'bg-amber-100 text-amber-800' : ev.grade === '미흡' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                <Star className="h-3 w-3" />{ev.total_score} {ev.grade}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500">{a.job_type || '-'}{att?.clock_in ? ` · ${String(att.clock_in).slice(0, 5)} 체크인` : ''}</p>
                        </button>
                        {canEval && (
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                            !att ? 'bg-gray-100 text-gray-400'
                            : att.status === '출석' ? 'bg-green-100 text-green-700'
                            : att.status === '결근' ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'}`}>{att?.status || '미기록'}</span>
                        )}
                        {tel ? (
                          <a href={`tel:${tel}`} title={`${a.staff_name} 전화`}
                            className="h-11 w-11 rounded-full bg-green-600 text-white flex items-center justify-center shrink-0 active:scale-95">
                            <Phone className="h-5 w-5" />
                          </a>
                        ) : (
                          <span className="h-11 w-11 rounded-full bg-gray-100 text-gray-300 flex items-center justify-center shrink-0"><Phone className="h-5 w-5" /></span>
                        )}
                      </div>
                      {isOpen && (
                        <EvalPanel key={ev?.id || 'new'} assignment={a} existing={ev} siteName={inq.event_name || ''} author={author} onAuthor={onAuthor}
                          onClose={() => setEvalFor(null)} onSaved={onSaved} />
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* 한 줄 기록 */}
          <QuickLog inquiryId={inq.id} logDate={viewDate} logs={logs} author={author} onAuthor={onAuthor} onSaved={onSaved} />
        </div>
      )}
    </article>
  )
}

// 크루 한 명 평가 — 항목 다섯 줄에 1~5 버튼. 저장 규칙은 lib/evaluation.ts (출석부와 같은 함수)
function EvalPanel({ assignment, existing, siteName, author, onAuthor, onClose, onSaved }: {
  assignment: Assignment; existing?: Evaluation; siteName: string
  author: string; onAuthor: (v: string) => void; onClose: () => void; onSaved: () => void
}) {
  const init = (): EvalScores => ({
    attendance_score:   existing?.attendance_score   ?? 3,
    performance_score:  existing?.performance_score  ?? 3,
    appearance_score:   existing?.appearance_score   ?? 3,
    teamwork_score:     existing?.teamwork_score     ?? 3,
    adaptability_score: existing?.adaptability_score ?? 3,
  })
  const [scores, setScores]         = useState<EvalScores>(init)
  const [reRecommend, setReRec]     = useState<boolean>(existing?.re_recommend ?? true)
  const [strengths, setStrengths]   = useState(existing?.strengths || '')
  const [improvements, setImprove]  = useState(existing?.improvements || '')
  const [saving, setSaving]         = useState(false)
  const { total, grade } = evalTotal(scores)

  function setAll(v: number) {
    setScores({ attendance_score: v, performance_score: v, appearance_score: v, teamwork_score: v, adaptability_score: v })
  }

  async function save() {
    setSaving(true)
    try {
      const r = await saveEvaluation({
        assignmentId: assignment.id, staffId: assignment.staff_id, staffName: assignment.staff_name, siteName,
        scores, reRecommend, strengths: strengths.trim() || null, improvements: improvements.trim() || null,
        evaluator: author.trim() || null, existingId: existing?.id,
      })
      try { localStorage.setItem(AUTHOR_KEY, author.trim()) } catch { /* 무시 */ }
      toast.success(`${assignment.staff_name} 평가 저장 (${r.grade} · ${r.total}점)`)
      onSaved()
      onClose()
    } catch (e) {
      toast.error('평가 저장 실패: ' + (e as Error).message)
    } finally { setSaving(false) }
  }

  return (
    <div className="mt-1 mb-2 rounded-2xl border-2 border-amber-300 bg-amber-50/60 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-extrabold text-gray-900 flex items-center gap-1"><Star className="h-4 w-4 text-amber-500" />{assignment.staff_name} 평가{existing ? ' (수정)' : ''}</p>
        <button onClick={onClose} className="h-9 w-9 flex items-center justify-center text-gray-400" title="닫기"><X className="h-5 w-5" /></button>
      </div>
      {/* 한 번에 깔기 — 열 명 평가할 때 */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-2xs font-bold text-gray-500 mr-1">전부</span>
        {[3, 4, 5].map(v => (
          <button key={v} type="button" onClick={() => setAll(v)}
            className="h-9 px-3 rounded-full border-2 border-gray-300 bg-white text-sm font-bold text-gray-700 active:scale-95">{v}점</button>
        ))}
      </div>
      <div className="space-y-1.5">
        {EVAL_FIELDS.map(f => (
          <div key={f.key} className="flex items-center gap-2">
            <span className="w-9 text-sm font-bold text-gray-700 shrink-0">{f.label}</span>
            <div className="flex-1 grid grid-cols-5 gap-1">
              {[1, 2, 3, 4, 5].map(v => (
                <button key={v} type="button" onClick={() => setScores(s => ({ ...s, [f.key]: v }))}
                  className={`h-10 rounded-lg text-base font-bold border-2 active:scale-95 ${
                    scores[f.key] === v ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>{v}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3">
        <p className="text-sm font-extrabold text-gray-900">평점 {total} <span className={grade === '우수' ? 'text-amber-600' : grade === '미흡' ? 'text-red-600' : 'text-gray-500'}>{grade}</span></p>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setReRec(true)}
            className={`h-10 px-3 rounded-full text-sm font-bold border-2 ${reRecommend ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-500 border-gray-300'}`}>재투입 예</button>
          <button type="button" onClick={() => setReRec(false)}
            className={`h-10 px-3 rounded-full text-sm font-bold border-2 ${!reRecommend ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-500 border-gray-300'}`}>아니오</button>
        </div>
      </div>
      <input value={strengths} onChange={e => setStrengths(e.target.value)} placeholder="잘한 점 (선택)"
        className="mt-2 h-11 w-full rounded-xl border-2 border-gray-300 bg-white px-3 text-sm focus:border-gray-900 focus:outline-none" />
      <input value={improvements} onChange={e => setImprove(e.target.value)} placeholder="보완할 점 (선택)"
        className="mt-1.5 h-11 w-full rounded-xl border-2 border-gray-300 bg-white px-3 text-sm focus:border-gray-900 focus:outline-none" />
      <div className="flex gap-2 mt-2">
        <input value={author} onChange={e => onAuthor(e.target.value)} placeholder="평가자"
          className="h-12 w-28 rounded-xl border-2 border-gray-300 bg-white px-3 text-sm focus:border-gray-900 focus:outline-none" />
        <button onClick={save} disabled={saving}
          className="h-12 flex-1 rounded-xl bg-amber-500 text-white font-extrabold text-base active:scale-[0.98] disabled:opacity-50">
          {saving ? '저장 중…' : existing ? '평가 수정 저장' : '평가 저장'}
        </button>
      </div>
      <p className="text-2xs text-gray-500 mt-2">저장하면 이 크루의 누적 평점과 등급에 바로 반영됩니다. 잘못 눌렀으면 이름을 다시 눌러 고치세요.</p>
    </div>
  )
}

function QuickLog({ inquiryId, logDate, logs, author, onAuthor, onSaved }: {
  inquiryId: string; logDate: string; logs: FieldLog[]; author: string; onAuthor: (v: string) => void; onSaved: () => void
}) {
  const [kind, setKind]       = useState<FieldLogKind>('특이사항')
  const [content, setContent] = useState('')
  const [saving, setSaving]   = useState(false)

  async function save() {
    if (!content.trim()) { toast.info('한 줄만 적어 주세요.'); return }
    setSaving(true)
    try {
      // 현장 기록(/field)과 같은 칸. 숫자는 사무실에서 반영할 때 적는다
      await db.insert('field_logs', {
        inquiry_id: inquiryId, kind, content: content.trim(),
        log_date: logDate, author: author.trim() || null,
      })
      try { localStorage.setItem(AUTHOR_KEY, author.trim()) } catch { /* 무시 */ }
      toast.success(`${kind} 기록 저장 — 사무실 대기함으로 갔습니다.`)
      setContent('')
      onSaved()
    } catch (e) {
      toast.error('저장 실패: ' + (e as Error).message)
    } finally { setSaving(false) }
  }

  return (
    <div className="p-4 border-t border-gray-100 bg-amber-50/40">
      <p className="text-2xs font-bold text-gray-500 tracking-wider mb-2 flex items-center gap-1"><PenLine className="h-3.5 w-3.5" />한 줄 기록</p>
      <div className="flex flex-wrap gap-2 mb-2">
        {KINDS.map(k => (
          <button key={k} onClick={() => setKind(k)}
            className={`h-10 px-4 rounded-full text-sm font-bold border-2 active:scale-95 ${kind === k ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300'}`}>
            {k}
          </button>
        ))}
      </div>
      <textarea value={content} onChange={e => setContent(e.target.value)} rows={3} placeholder={KIND_HINT[kind]}
        className="w-full rounded-xl border-2 border-gray-300 bg-white p-3 text-base leading-relaxed focus:border-gray-900 focus:outline-none" />
      <div className="flex gap-2 mt-2">
        <input value={author} onChange={e => onAuthor(e.target.value)} placeholder="적는 사람"
          className="h-12 w-28 rounded-xl border-2 border-gray-300 bg-white px-3 text-sm focus:border-gray-900 focus:outline-none" />
        <button onClick={save} disabled={saving}
          className="h-12 flex-1 rounded-xl bg-gray-900 text-white font-extrabold text-base active:scale-[0.98] disabled:opacity-50">
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
      {logs.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {logs.slice(0, 3).map(l => (
            <li key={l.id} className="text-sm text-gray-700 flex gap-2">
              <span className="text-2xs font-bold text-gray-500 shrink-0 mt-0.5 w-12">{l.kind}</span>
              <span className="flex-1 break-keep">{l.content}</span>
              <span className={`text-2xs shrink-0 ${l.applied_at ? 'text-green-600' : 'text-amber-600'}`}>{l.applied_at ? '반영됨' : fmtWhen(l.created_at)}</span>
            </li>
          ))}
          {logs.length > 3 && <li className="text-2xs text-gray-400">외 {logs.length - 3}건</li>}
        </ul>
      )}
      <p className="text-2xs text-gray-400 mt-2 flex items-center gap-1"><Clock className="h-3 w-3" />키보드의 마이크로 말해서 적어도 됩니다</p>
    </div>
  )
}
