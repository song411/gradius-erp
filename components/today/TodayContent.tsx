'use client'

// 오늘 현장 — 휴대폰 전용 화면
// ─────────────────────────────────────────────────────────
// 사무실 ERP는 PC 화면 기준이라 현장에서 휴대폰으로는 보기 어렵다. 이 화면은 그 반대다.
// 사이드바 없음, 글자 큼, 이번 주 행사만. 행사 카드를 누르면 크루 명단·전화·출석·한 줄 기록.
//
// 읽는 표는 사무실 화면과 같다(inquiries·assignments·attendances·field_logs). 새 표 없음.
// 쓰는 것은 field_logs 한 줄뿐 — 현장 기록(/field)과 같은 칸에 같은 모양으로 들어가므로
// 사무실 반영 대기함에서 똑같이 보인다. 돈·배정 표는 여기서 건드리지 않는다.

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { db } from '@/lib/supabase/api'
import { todayKST } from '@/lib/utils'
import { coversDate, eventDatesOf } from '@/components/schedule/matrixCore'
import {
  EVAL_FIELDS, QUICK_SCORES, evalTotal, guideForScore, saveEvaluation, snapHalf,
  PROFILE_FIELDS, profileFormOf, profileChips, profilePatch, saveStaffProfile,
  type EvalScores, type EvalScoreKey, type ProfileForm,
} from '@/lib/evaluation'
import { HalfStarInput } from '@/components/ui/HalfStarInput'
import SiteCodePanel from './SiteCodePanel'
import { fmtDistance, isFar, getFix } from '@/lib/geo'
import { ensureLinksForCrew } from '@/lib/contractLinks'
import { groupLinkMessage } from '@/lib/laborContract'
import { uploadPhoto, deletePhotos } from '@/lib/photos'
import { PhotoPicker, PhotoThumbs } from '@/components/ui/PhotoPicker'
import { toast } from 'sonner'
import {
  MapPin, Phone, Clock, Users, ChevronDown, ChevronUp, RefreshCw, Monitor,
  PenLine, Share, MoreVertical, X, CheckCircle2, Crown, Star, Trash2, QrCode, Link2, FileSignature,
} from 'lucide-react'
import type { Inquiry, Assignment, Attendance, AttendanceStatus, FieldLog, FieldLogKind, Evaluation, Staff } from '@/lib/supabase/types'

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
// 출석 — 칩을 누르면 바로 '출석', 다시 누르면 상태 고르기. 출석부(PC)·셀프 체크인(/c/)과 같은 모양으로 저장한다
const ATT_STATUSES: AttendanceStatus[] = ['출석', '지각', '결근', '조퇴', '외출']
const FIELD_NOTE = '현장 화면'
function nowHHMM(): string { return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(11, 16) }
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
  // 크루 프로필(키·몸무게·MBTI 등) — 평가 칸에서 확인·보정하는 용도. 키는 배정 id
  const [staffMap, setStaffMap]       = useState<Record<string, Staff>>({})
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
      if (ids.length === 0) { setAssignments([]); setAttendances([]); setEvaluations([]); setLogs([]); setStaffMap({}); return }
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
      // 크루 프로필은 덤 — 못 읽어도 평가는 된다
      // 배정에 staff_id 가 있으면 그걸로, 없으면 이름으로 크루관리에서 찾는다 (동명이인은 전화번호로 가른다).
      // 배정만 되고 크루관리와 안 이어진 사람도 이전 평가·누적 점수가 보여야 한다 (정광영 건, 2026-11-06)
      const staffIds = [...new Set(asgns.map(a => a.staff_id).filter((x): x is string => !!x))]
      const byId = staffIds.length ? await db.list<Staff>('staff', { inFilter: { id: staffIds } }).catch(() => [] as Staff[]) : []
      const names = [...new Set(asgns.filter(a => !a.staff_id && a.staff_name).map(a => a.staff_name as string))]
      const byName = names.length ? await db.list<Staff>('staff', { inFilter: { name: names } }).catch(() => [] as Staff[]) : []
      const m: Record<string, Staff> = {}
      for (const a of asgns) {
        let hit: Staff | undefined
        if (a.staff_id) hit = byId.find(st => st.id === a.staff_id)
        else {
          const same = byName.filter(st => st.name === a.staff_name)
          const digits = (a.phone || '').replace(/\D/g, '')
          hit = same.length === 1 ? same[0] : same.find(st => digits && (st.phone || '').replace(/\D/g, '') === digits)
        }
        if (hit) m[a.id] = hit
      }
      setStaffMap(m)
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
              evaluations={evaluations} staffMap={staffMap}
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
                evaluations={evaluations} staffMap={staffMap}
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
                      evaluations={evaluations} staffMap={staffMap}
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
  staffMap: Record<string, Staff>
  logs: FieldLog[]
  open: boolean
  onToggle: () => void
  author: string
  onAuthor: (v: string) => void
  onSaved: () => void
}

function EventCard({ inq, viewDate, isToday, isPast, assignments, attendances, evaluations, staffMap, logs, open, onToggle, author, onAuthor, onSaved }: CardProps) {
  // 크루 한 명을 누르면 평가 칸이 펼쳐진다 (오늘·지난 행사만)
  const [evalFor, setEvalFor] = useState<string | null>(null)
  // 날짜로 막지 않는다 — 관리자가 행사 전날 평가·출석·링크를 미리 확인하고 시험해야 한다 (사장님 2026-11-06).
  // 시험으로 찍은 출석은 칩을 다시 눌러 '기록 지우기'로 지운다
  const canEval = true
  void isPast
  // 출석 칩 — 미기록이면 한 번에 '출석', 기록이 있으면 상태 고르기 줄이 펼쳐진다
  const [attFor, setAttFor] = useState<string | null>(null)
  const [showCode, setShowCode] = useState(false)   // 팀장이 크루에게 보여 주는 현장 QR·코드
  // 근로계약서 — 확정 크루 전원 링크를 준비하고(상세 양식, 자동 채움) 행사 공용 링크를 공유한다.
  // 칸을 고치거나 인쇄하는 건 PC 계약서 화면, 휴대폰은 "보내기"까지만 (사장님 2026-11-06)
  const [contractBusy, setContractBusy] = useState(false)
  async function shareContractLinks() {
    setContractBusy(true)
    try {
      const r = await ensureLinksForCrew({ inquiry: inq, assignments: crew, staffOf: a => staffMap[a.id] || null, variant: '상세', today: todayKST() })
      if (!r.total) { toast.error('확정된 크루가 없습니다'); return }
      const url = `${window.location.origin}/s/e/${inq.id}`
      const text = groupLinkMessage(inq.event_name || '', url)
      toast.success(`계약서 링크 준비: 새로 ${r.made}명, 이미 서명 ${r.signed}명 / 확정 ${r.total}명`)
      try {
        if (typeof navigator !== 'undefined' && navigator.share) await navigator.share({ text })
        else { await navigator.clipboard.writeText(text); toast.success('공용 링크 문구를 복사했습니다. 단톡방에 붙여넣으세요.') }
      } catch (e) { if ((e as Error).name !== 'AbortError') toast.info(text, { duration: 15000 }) }
    } catch (e) {
      toast.error('계약서 링크 실패: ' + (e as Error).message)
    } finally { setContractBusy(false) }
  }

  // 현장 기준점 — 이 폰 위치를 행사장 기준점으로 저장 (출석 QR 패널과 같은 길). 거리 기록·근처 판정의 기준
  async function setSiteAnchor(): Promise<void> {
    const fix = await getFix()
    if (!fix) { toast.info('위치 허용이 안 되어 기준점은 못 잡았습니다. 출석 QR에서 다시 시도하세요'); return }
    try {
      const res = await fetch('/api/site-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inq: inq.id, ...fix }) })
      if (res.ok) { toast.success(`현장 기준점을 지금 위치로 잡았습니다 (오차 ±${fix.acc}m)`); onSaved() }
      else toast.error('기준점 저장 실패 — 023 SQL 을 확인하세요')
    } catch { toast.error('기준점 저장 실패 (연결)') }
  }

  // 체크인 링크 — 휴대폰이면 공유 창(카톡 등), 아니면 복사. PC 출석부의 '출석 링크'와 같은 주소.
  // 누르는 김에 기준점도 잡는다 (사장님 2026-11-06). 공유 창은 손가락을 뗀 직후에만 열리므로 위치는 그 뒤에 받는다
  async function shareCheckinLink() {
    const url = `${window.location.origin}/c/${inq.id}`
    const text = `[가디어스] ${inq.event_name || ''} 출석 체크인\n행사장에 도착하면 아래 링크를 열어 본인 이름을 누르고 안전교육 확인 후 서명해 주세요. (위치 허용을 눌러 주세요)\n${url}`
    const shared = (async () => {
      try {
        if (typeof navigator !== 'undefined' && navigator.share) { await navigator.share({ text }); return }
        await navigator.clipboard.writeText(text)
        toast.success('체크인 링크 문구를 복사했습니다. 단톡방에 붙여넣으세요.')
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        toast.info(text, { duration: 15000 })
      }
    })()
    await Promise.all([shared, setSiteAnchor()])
  }
  const [attBusy, setAttBusy] = useState<string | null>(null)
  async function saveAttendance(a: Assignment, att: Attendance | undefined, status: AttendanceStatus | null) {
    setAttBusy(a.id)
    try {
      if (status === null) {
        if (att) { await db.delete('attendances', att.id); await db.update('assignments', a.id, { is_present: false }) }
        toast.success(`${a.staff_name} 출석 기록을 지웠습니다`)
      } else {
        // 출석부(PC) handleSaveAttendance 와 같은 모양. 시각은 오늘 처음 찍을 때만 자동
        const payload = {
          assignment_id: a.id, inquiry_id: inq.id, staff_name: a.staff_name || '', work_date: viewDate,
          clock_in: att?.clock_in || (isToday && status !== '결근' ? nowHHMM() : null),
          daily_pay: a.pay_rate || 0, status, notes: att?.notes || FIELD_NOTE,
        }
        if (att) await db.update('attendances', att.id, payload)
        else await db.insert('attendances', payload)
        await db.update('assignments', a.id, { is_present: status !== '결근' })
        toast.success(`${a.staff_name} ${status}${!att && payload.clock_in ? ` · ${payload.clock_in}` : ''}`)
      }
      setAttFor(null)
      onSaved()
    } catch (e) {
      toast.error('출석 저장 실패: ' + (e as Error).message)
    } finally { setAttBusy(null) }
  }
  // 후보는 아직 사람이 아니다. 확정·배정중만 명단에 올린다
  const crew = assignments.filter(a => a.status === '확정' || a.status === '배정중')
  const evaluated = crew.filter(a => evaluations.some(e => e.assignment_id === a.id)).length
  const confirmed = crew.filter(a => a.status === '확정').length
  const present = attendances.filter(t => t.work_date === viewDate && (t.status === '출석' || t.status === '지각' || t.status === '조퇴' || t.status === '외출')).length
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
            <div className="flex items-center justify-between mb-2 gap-2">
              <p className="text-2xs font-bold text-gray-500 tracking-wider">크루 {crew.length}명{canEval && crew.length > 0 ? ' · 이름 누르면 평가, 칩 누르면 출석' : ''}</p>
              <div className="flex gap-1.5 shrink-0">
                <button type="button" onClick={shareContractLinks} disabled={contractBusy} title="확정 크루 전원 근로계약서 링크를 만들고 공용 링크 공유"
                  className="h-9 px-2.5 rounded-full text-xs font-bold border-2 inline-flex items-center gap-1 bg-white text-emerald-700 border-emerald-600 active:scale-95 disabled:opacity-50">
                  <FileSignature className="h-4 w-4" />{contractBusy ? '준비 중…' : '계약서'}
                </button>
                <button type="button" onClick={shareCheckinLink} title="크루에게 보낼 체크인 링크 복사·공유"
                  className="h-9 px-3 rounded-full text-xs font-bold border-2 inline-flex items-center gap-1 bg-white text-blue-700 border-blue-600 active:scale-95">
                  <Link2 className="h-4 w-4" />체크인
                </button>
                <button type="button" onClick={() => setShowCode(v => !v)}
                  className={`h-9 px-3 rounded-full text-xs font-bold border-2 inline-flex items-center gap-1 shrink-0 active:scale-95 ${showCode ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-800 border-gray-800'}`}>
                  <QrCode className="h-4 w-4" />QR
                </button>
              </div>
            </div>
            <p className="text-2xs text-gray-500 -mt-1 mb-2">
              {inq.site_at
                ? `현장 기준점 ${fmtWhen(inq.site_at)} 설정됨${inq.site_acc ? ` (±${Math.round(inq.site_acc)}m)` : ''} · 체크인 링크나 출석 QR을 다시 누르면 지금 위치로 바뀝니다`
                : '현장 기준점 없음 · 체크인 링크나 출석 QR을 누르면 이 폰 위치로 잡힙니다'}
            </p>
            {showCode && <SiteCodePanel inquiryId={inq.id} isToday={!!isToday} />}
            {crew.length === 0 ? (
              <p className="text-sm text-gray-400">배정된 크루가 없습니다.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {crew.map(a => {
                  const att = attendances.find(t => t.assignment_id === a.id && t.work_date === viewDate)
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
                          <button type="button" disabled={attBusy === a.id}
                            onClick={() => att ? setAttFor(attFor === a.id ? null : a.id) : saveAttendance(a, att, '출석')}
                            title={att ? '누르면 출석 상태 바꾸기' : '누르면 출석 처리'}
                            className={`h-9 px-2.5 rounded-full text-xs font-bold border-2 shrink-0 active:scale-95 disabled:opacity-50 ${
                            !att ? 'bg-white text-gray-500 border-gray-300'
                            : att.status === '출석' ? 'bg-green-100 text-green-700 border-green-200'
                            : att.status === '결근' ? 'bg-red-100 text-red-700 border-red-200'
                            : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                            {attBusy === a.id ? '저장…' : att ? `${att.status}${att.signature_data ? ' ✍' : ''}${att.distance_m != null ? ` ${fmtDistance(att.distance_m)}${isFar(att.distance_m, att.acc, inq.site_acc) ? '⚠' : ''}` : ''}` : '출석 ✓'}
                          </button>
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
                      {attFor === a.id && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {ATT_STATUSES.map(st => (
                            <button key={st} type="button" disabled={attBusy === a.id} onClick={() => saveAttendance(a, att, st)}
                              className={`h-10 px-3 rounded-full text-sm font-bold border-2 active:scale-95 ${att?.status === st ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300'}`}>{st}</button>
                          ))}
                          <button type="button" disabled={attBusy === a.id} onClick={() => saveAttendance(a, att, null)}
                            className="h-10 px-3 rounded-full text-sm font-bold border-2 border-red-200 text-red-600 bg-white active:scale-95">기록 지우기</button>
                        </div>
                      )}
                      {isOpen && (
                        <EvalPanel key={ev?.id || 'new'} assignment={a} existing={ev} staff={staffMap[a.id]} siteName={inq.event_name || ''} author={author} onAuthor={onAuthor}
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

// 크루 한 명 평가 — 항목 다섯 줄에 반 개 단위 별점(0.5~5) + 크루 정보 확인(키·몸무게·MBTI 등).
// 점수 저장 규칙은 lib/evaluation.ts (출석부와 같은 함수). 크루 정보는 평가가 아니라 staff 프로필에 쓴다.
function EvalPanel({ assignment, existing, staff, siteName, author, onAuthor, onClose, onSaved }: {
  assignment: Assignment; existing?: Evaluation; staff?: Staff; siteName: string
  author: string; onAuthor: (v: string) => void; onClose: () => void; onSaved: () => void
}) {
  // 배정에 staff_id 가 없어도 이름으로 찾은 크루가 있으면 그 사람으로 본다 (이전 평가·누적 점수·정보 저장 모두)
  const staffId = assignment.staff_id || staff?.id || null
  const init = (): EvalScores => ({
    attendance_score:   existing?.attendance_score   ?? 3,
    performance_score:  existing?.performance_score  ?? 3,
    appearance_score:   existing?.appearance_score   ?? 3,
    teamwork_score:     existing?.teamwork_score     ?? 3,
    adaptability_score: existing?.adaptability_score ?? 3,
  })
  const [scores, setScores]         = useState<EvalScores>(init)
  const [lastKey, setLastKey]       = useState<EvalScoreKey | null>(null)
  const [reRecommend, setReRec]     = useState<boolean>(existing?.re_recommend ?? true)
  const [strengths, setStrengths]   = useState(existing?.strengths || '')
  const [improvements, setImprove]  = useState(existing?.improvements || '')
  const [saving, setSaving]         = useState(false)
  const { total, grade } = evalTotal(scores)

  // 이전 평가 — 같은 사람의 지난 평가(이번 배정 것은 빼고, 최근 순). 누르면 바로 보이게 펼쳐 둔다.
  // 이번 배정 평가가 아직 없으면 가장 최근 평가 점수로 별을 미리 채운다 — 사람이 건드리기 전에만.
  const [history, setHistory]       = useState<Evaluation[] | null>(staffId ? null : [])
  const [historyOpen, setHistoryOpen] = useState(true)
  const [prefillNote, setPrefillNote] = useState('')
  const touched = useRef(false)
  const existingId = existing?.id
  useEffect(() => {
    let alive = true
    if (!staffId) return
    db.list<Evaluation>('evaluations', { filters: { staff_id: staffId }, order: 'evaluated_at', asc: false, limit: 20 })
      .then(rows => {
        if (!alive) return
        const past = rows.filter(e => e.assignment_id !== assignment.id)
        setHistory(past)
        if (!existingId && past.length && !touched.current) {
          const last = past[0]
          setScores({
            attendance_score:   snapHalf(Number(last.attendance_score)   || 3),
            performance_score:  snapHalf(Number(last.performance_score)  || 3),
            appearance_score:   snapHalf(Number(last.appearance_score)   || 3),
            teamwork_score:     snapHalf(Number(last.teamwork_score)     || 3),
            adaptability_score: snapHalf(Number(last.adaptability_score) || 3),
          })
          setPrefillNote(`${(last.evaluated_at || '').slice(5, 10)} ${last.site_name || ''} 점수로 미리 채움`)
        }
      })
      .catch(() => { if (alive) setHistory([]) })
    return () => { alive = false }
  }, [assignment.id, staffId, existingId])

  // 크루 정보 — 비어 있는 핵심 칸(키·몸무게·MBTI)이 있으면 처음부터 펼쳐 둔다
  const baseProfile = profileFormOf(staff)
  const [profile, setProfile]       = useState<ProfileForm>(baseProfile)
  const [profileOpen, setProfileOpen] = useState<boolean>(!!staff && (!baseProfile.height || !baseProfile.weight || !baseProfile.mbti))
  const patch = profilePatch(baseProfile, profile)
  const changedCount = Object.keys(patch).length
  const chips = profileChips(profile)
  const lastField = lastKey ? EVAL_FIELDS.find(f => f.key === lastKey) : undefined
  const guideLine = lastField ? guideForScore(lastField.guide, scores[lastField.key]) : ''

  function setOne(key: EvalScoreKey, v: number) {
    touched.current = true
    setScores(s => ({ ...s, [key]: v }))
    setLastKey(key)
  }
  function setAll(v: number) {
    touched.current = true
    setScores({ attendance_score: v, performance_score: v, appearance_score: v, teamwork_score: v, adaptability_score: v })
    setLastKey(null)
  }

  async function save() {
    setSaving(true)
    try {
      const r = await saveEvaluation({
        assignmentId: assignment.id, staffId, staffName: assignment.staff_name, siteName,
        scores, reRecommend, strengths: strengths.trim() || null, improvements: improvements.trim() || null,
        evaluator: author.trim() || null, existingId: existing?.id,
      })
      // 크루 정보는 바뀐 칸만, 점수 칸은 손대지 않는다 (lib 가 걸러 준다)
      let wrote = 0
      // 이름으로만 찾은 사람이면 이 기회에 배정을 크루관리와 이어 둔다 (다음부터 바로 찾힘)
      if (!assignment.staff_id && staffId) await db.update('assignments', assignment.id, { staff_id: staffId }).catch(() => {})
      if (staffId && changedCount > 0) {
        try { wrote = await saveStaffProfile(staffId, patch) }
        catch (e) { toast.error('크루 정보 저장 실패: ' + (e as Error).message) }
      }
      try { localStorage.setItem(AUTHOR_KEY, author.trim()) } catch { /* 무시 */ }
      toast.success(`${assignment.staff_name} 평가 저장 (${r.grade} · ${r.total}점)${wrote ? ` · 크루 정보 ${wrote}칸 갱신` : ''}`)
      onSaved()
      onClose()
    } catch (e) {
      toast.error('평가 저장 실패: ' + (e as Error).message)
    } finally { setSaving(false) }
  }

  const pill = (active: boolean) =>
    `h-10 px-3 rounded-full text-sm font-bold border-2 active:scale-95 ${active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300'}`
  const inputCls = 'h-11 w-full rounded-xl border-2 border-gray-300 bg-white px-3 text-base focus:border-gray-900 focus:outline-none'

  return (
    <div className="mt-1 mb-2 rounded-2xl border-2 border-amber-300 bg-amber-50/60 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-extrabold text-gray-900 flex items-center gap-1"><Star className="h-4 w-4 text-amber-500" />{assignment.staff_name} 평가{existing ? ' (수정)' : ''}</p>
        <button onClick={onClose} className="h-9 w-9 flex items-center justify-center text-gray-400" title="닫기"><X className="h-5 w-5" /></button>
      </div>

      {/* 한 번에 깔기 — 열 명 평가할 때 */}
      <div className="flex items-center gap-1 mb-2 overflow-x-auto">
        <span className="text-2xs font-bold text-gray-500 mr-1 shrink-0">전부</span>
        {QUICK_SCORES.map(v => (
          <button key={v} type="button" onClick={() => setAll(v)}
            className="h-9 px-2.5 rounded-full border-2 border-gray-300 bg-white text-sm font-bold text-gray-700 active:scale-95 shrink-0">{v}</button>
        ))}
      </div>

      {/* 다섯 항목 — 별 왼쪽 반을 누르면 .5 */}
      <div className="space-y-1">
        {EVAL_FIELDS.map(f => (
          <div key={f.key} className="flex items-center gap-1.5">
            <span className="w-8 text-sm font-bold text-gray-700 shrink-0">{f.label}</span>
            <HalfStarInput value={scores[f.key]} onChange={v => setOne(f.key, v)} />
            <span className="ml-auto w-7 text-right text-base font-extrabold text-gray-900 tabular-nums">{scores[f.key]}</span>
          </div>
        ))}
      </div>
      <p className="text-2xs text-gray-500 mt-1.5 leading-relaxed">
        {lastField && guideLine
          ? <><b className="text-gray-700">{lastField.full} {scores[lastField.key]}점</b> · {guideLine}</>
          : '별 왼쪽 반을 누르면 3.5, 4.5처럼 반 점이 됩니다.'}
      </p>

      {/* 크루관리에 쌓인 누적 점수 — 평가 이력이 표에 없어도(엑셀로 들어온 사람) 이건 보인다 */}
      {staff && staff.total_score > 0 && (
        <p className="text-2xs text-gray-600 mt-2 leading-relaxed">
          <b className="text-gray-800">크루관리 누적 ★ {staff.total_score}</b> · {EVAL_FIELDS.map(f => `${f.label} ${staff[f.key] || '-'}`).join(' · ')}
        </p>
      )}

      {/* 이전 평가 — 같은 사람이 지난 행사에서 받은 점수 */}
      {history === null ? (
        <p className="text-2xs text-gray-400 mt-2">이전 평가 불러오는 중…</p>
      ) : history.length > 0 ? (
        <div className="mt-2 rounded-xl border border-gray-200 bg-white/80">
          <button type="button" onClick={() => setHistoryOpen(o => !o)} className="w-full flex items-center gap-2 px-3 h-10 text-left">
            <span className="text-sm font-extrabold text-gray-800 shrink-0">이전 평가 {history.length}회</span>
            <span className="flex-1 min-w-0 text-2xs text-gray-500 truncate">
              {prefillNote}
            </span>
            {historyOpen ? <ChevronUp className="h-5 w-5 text-gray-400 shrink-0" /> : <ChevronDown className="h-5 w-5 text-gray-400 shrink-0" />}
          </button>
          {historyOpen && (
            <ul className="px-3 pb-2 divide-y divide-gray-100">
              {history.slice(0, 10).map(e => (
                <li key={e.id} className="py-1.5 text-xs">
                  <p className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-gray-500">{(e.evaluated_at || '').slice(0, 10)}</span>
                    <span className="font-bold text-gray-800">{e.site_name || '-'}</span>
                    <span className={`font-bold ${e.grade === '우수' ? 'text-amber-700' : e.grade === '미흡' ? 'text-red-600' : 'text-gray-600'}`}>★ {e.total_score} {e.grade}</span>
                    {e.re_recommend === false && <span className="text-red-600 font-bold">재투입 아니오</span>}
                  </p>
                  <p className="text-gray-600">{EVAL_FIELDS.map(f => `${f.label} ${e[f.key]}`).join(' · ')}</p>
                  {(e.strengths || e.improvements) && (
                    <p className="text-gray-500">{e.strengths ? `잘한 점: ${e.strengths}` : ''}{e.strengths && e.improvements ? ' / ' : ''}{e.improvements ? `보완: ${e.improvements}` : ''}</p>
                  )}
                </li>
              ))}
              {history.length > 10 && <li className="py-1 text-2xs text-gray-400">최근 10회만 보입니다. 전체는 PC 크루관리에서.</li>}
            </ul>
          )}
        </div>
      ) : staffId ? (
        <p className="text-2xs text-gray-400 mt-2">이전 평가 없음 — 처음 평가받는 사람입니다.</p>
      ) : null}

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

      {/* 크루 정보 확인 — 평가표에 원래 있던 칸(키·몸무게·MBTI 등). 저장하면 크루관리 프로필이 갱신된다 */}
      {staff ? (
        <div className="mt-3 rounded-xl border-2 border-dashed border-gray-300 bg-white/70">
          <button type="button" onClick={() => setProfileOpen(o => !o)} className="w-full flex items-center gap-2 px-3 h-11 text-left">
            <span className="text-sm font-extrabold text-gray-800 shrink-0">크루 정보</span>
            <span className="flex-1 min-w-0 text-xs text-gray-500 truncate">
              {chips.length ? chips.join(' · ') : '아직 적힌 게 없어요'}
              {changedCount > 0 && <span className="ml-1 text-amber-700 font-bold">· {changedCount}칸 바뀜</span>}
            </span>
            {profileOpen ? <ChevronUp className="h-5 w-5 text-gray-400 shrink-0" /> : <ChevronDown className="h-5 w-5 text-gray-400 shrink-0" />}
          </button>
          {profileOpen && (
            <div className="px-3 pb-3 space-y-2.5">
              <div className="grid grid-cols-3 gap-2">
                {PROFILE_FIELDS.filter(f => f.kind === 'number').map(f => (
                  <label key={f.key} className="block">
                    <span className="text-2xs font-bold text-gray-500">{f.label} ({f.unit})</span>
                    <input type="number" inputMode="decimal" value={profile[f.key]} onChange={e => setProfile(p => ({ ...p, [f.key]: e.target.value }))}
                      className={`${inputCls} text-center`} />
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-2xs font-bold text-gray-500">MBTI</span>
                  <input value={profile.mbti} maxLength={4} autoCapitalize="characters" placeholder="ENFP"
                    onChange={e => setProfile(p => ({ ...p, mbti: e.target.value.toUpperCase() }))} className={`${inputCls} text-center uppercase`} />
                </label>
                <label className="block">
                  <span className="text-2xs font-bold text-gray-500">이동가능지역</span>
                  <input value={profile.region} placeholder="서울, 경기" onChange={e => setProfile(p => ({ ...p, region: e.target.value }))} className={inputCls} />
                </label>
              </div>
              {PROFILE_FIELDS.filter(f => f.kind === 'pick').map(f => (
                <div key={f.key} className="flex items-center gap-1.5 flex-wrap">
                  <span className="w-9 text-2xs font-bold text-gray-500 shrink-0">{f.label}</span>
                  {f.options.map(o => (
                    <button key={o} type="button" onClick={() => setProfile(p => ({ ...p, [f.key]: p[f.key] === o ? '' : o }))} className={pill(profile[f.key] === o)}>{o}</button>
                  ))}
                </div>
              ))}
              <p className="text-2xs text-gray-500">바뀐 칸만 크루관리에 저장됩니다. 비워 둔 칸은 지우지 않습니다.</p>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-2xs text-gray-500">크루관리에 연결되지 않은 사람이라 키·몸무게·MBTI는 여기서 못 적습니다. PC 크루관리에서 먼저 등록하세요.</p>
      )}

      <div className="flex gap-2 mt-3">
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
  const [photos, setPhotos]   = useState<File[]>([])     // 영수증·배치 사진. 저장할 때 줄여서 올린다 (lib/photos)
  const [saving, setSaving]   = useState(false)

  // 잘못 적은 기록 지우기 — 반영 전 것만 여기서. 반영된 것은 사무실 대기함에서
  async function remove(l: FieldLog) {
    if (!confirm(`이 기록을 지웁니다.\n[${l.kind}] ${l.content}`)) return
    try {
      await db.delete('field_logs', l.id)
      await deletePhotos(l.photos)
      toast.success('기록을 지웠습니다')
      onSaved()
    } catch (e) { toast.error('삭제 실패: ' + (e as Error).message) }
  }

  async function save() {
    if (!content.trim() && photos.length === 0) { toast.info('한 줄만 적어 주세요.'); return }
    setSaving(true)
    try {
      // 사진 먼저 올리고(줄여서) 주소만 기록에 붙인다
      const uploaded = []
      for (const f of photos) uploaded.push(await uploadPhoto(f, `field-logs/${inquiryId}`))
      // 현장 기록(/field)과 같은 칸. 숫자는 사무실에서 반영할 때 적는다
      await db.insert('field_logs', {
        inquiry_id: inquiryId, kind, content: content.trim() || (uploaded.length ? '(사진)' : ''),
        log_date: logDate, author: author.trim() || null,
        ...(uploaded.length ? { photos: uploaded } : {}),
      })
      try { localStorage.setItem(AUTHOR_KEY, author.trim()) } catch { /* 무시 */ }
      toast.success(`${kind} 기록 저장${uploaded.length ? ` · 사진 ${uploaded.length}장` : ''} — 사무실 대기함으로 갔습니다.`)
      setContent(''); setPhotos([])
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
      <div className="mt-2"><PhotoPicker files={photos} onChange={setPhotos} size="lg" /></div>
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
            <li key={l.id} className="text-sm text-gray-700 flex items-center gap-2">
              <span className="text-2xs font-bold text-gray-500 shrink-0 w-12">{l.kind}</span>
              <span className="flex-1 break-keep">{l.content}{l.photos && l.photos.length > 0 && <span className="ml-1 text-2xs text-gray-400">사진 {l.photos.length}</span>}<PhotoThumbs photos={l.photos} size="sm" /></span>
              <span className={`text-2xs shrink-0 ${l.applied_at ? 'text-green-600' : 'text-amber-600'}`}>{l.applied_at ? '반영됨' : fmtWhen(l.created_at)}</span>
              {!l.applied_at && (
                <button onClick={() => remove(l)} title="이 기록 지우기" className="h-9 w-9 -mr-2 flex items-center justify-center text-gray-300 active:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
          {logs.length > 3 && <li className="text-2xs text-gray-400">외 {logs.length - 3}건</li>}
        </ul>
      )}
      <p className="text-2xs text-gray-400 mt-2 flex items-center gap-1"><Clock className="h-3 w-3" />키보드의 마이크로 말해서 적어도 됩니다</p>
    </div>
  )
}
