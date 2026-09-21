'use client'

// 영업 보드 — 체결 전 현황
// ─────────────────────────────────────────────────────────
// 운영 캘린더가 체결된 건을 맡는다면 이 화면은 그 앞을 맡는다.
// 단계는 저장하지 않고 이미 있는 데이터(견적 유무·발송 여부·상태)에서
// 끌어낸다. 판정 규칙은 전부 lib/pipeline.ts에 있다 — 화면은 그리기만 한다.
//
// 여기 보이는 '진행 중' 금액은 아직 남의 돈이다. 매출·수익 집계에는
// 들어가지 않는다 (그 경계는 lib/finance.ts의 NON_COUNTABLE이 긋는다).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { db } from '@/lib/supabase/api'
import {
  buildBoard, sortCards, dueToday, isRecentlyConcluded, isLiveStage, winRate, shortKRW,
  PIPELINE_STAGES, STAGE_DESC, STALE_RULES, RECENT_CONCLUDED_DAYS, ACTIVITY_TYPE, SORT_MODES,
  today, dayDiff, kstDay,
  type PipelineCard, type PipelineStage, type Signal, type MemoLike, type SortKey,
} from '@/lib/pipeline'
import type { Estimate, Inquiry } from '@/lib/supabase/types'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import CardDrawer from './CardDrawer'
import PipelineCalendar from './PipelineCalendar'
import {
  Search, AlertTriangle, Send, Inbox, TrendingUp, CalendarClock, RefreshCw,
  MessageSquare, MapPin, Rows3, Rows2, Clock, Moon, Phone, Users, Trophy, ArrowDownWideNarrow,
  LayoutGrid, CalendarDays,
} from 'lucide-react'

// ─── 신호등 ───────────────────────────────────────────────
const SIGNAL_BAR: Record<Signal, string> = {
  alert: 'border-l-red-500',
  warn:  'border-l-amber-400',
  ok:    'border-l-gray-200',
}

const SIGNAL_TEXT: Record<Signal, string> = {
  alert: 'text-red-600',
  warn:  'text-amber-600',
  ok:    'text-gray-400',
}

const SIGNAL_DOT: Record<Signal, string> = {
  alert: 'bg-red-500',
  warn:  'bg-amber-400',
  ok:    'bg-gray-300',
}

// ─── 구분 탭 ──────────────────────────────────────────────
// 전체는 단계별 보드로, 나머지는 그 묶음만 넓게 편다.
// 실측(2026-09-21): 견적을 일괄 발송한 뒤 35건이 '체결 전' 한 칸에 몰렸다.
// 칸을 균등하게 나누면 제일 중요한 묶음이 화면의 1/5만 쓴다.
type TabKey = 'all' | 'before_send' | 'pending' | 'won' | 'lost'

const TABS: Array<{
  key: TabKey
  label: string
  hint: string
  /** null이면 전체 */
  stages: PipelineStage[] | null
  tone: string      // 눌렸을 때
  idle: string      // 안 눌렸을 때
}> = [
  { key: 'all',         label: '전체',        hint: '단계별로 보기',
    stages: null,
    tone: 'border-slate-800 bg-slate-800 text-white',
    idle: 'border-gray-200 bg-white text-gray-600 hover:border-gray-400' },
  { key: 'before_send', label: '견적 발송 전', hint: '아직 안 보낸 건',
    stages: ['접수', '견적작성'],
    tone: 'border-orange-500 bg-orange-500 text-white',
    idle: 'border-gray-200 bg-white text-gray-600 hover:border-orange-300' },
  { key: 'pending',     label: '체결 전',     hint: '견적서 발송 완료 건',
    stages: ['체결 전'],
    tone: 'border-blue-600 bg-blue-600 text-white',
    idle: 'border-blue-300 bg-blue-50 text-blue-800 hover:border-blue-500' },
  { key: 'won',         label: '체결',        hint: '계약된 건',
    stages: ['체결'],
    tone: 'border-emerald-600 bg-emerald-600 text-white',
    idle: 'border-gray-200 bg-white text-gray-600 hover:border-emerald-300' },
  { key: 'lost',        label: '미체결',      hint: '놓친 건',
    stages: ['미체결'],
    tone: 'border-gray-600 bg-gray-600 text-white',
    idle: 'border-gray-200 bg-white text-gray-600 hover:border-gray-400' },
]

const DETAIL_KEY = 'gradius.pipeline.detail'
const SORT_KEY   = 'gradius.pipeline.sort'
const VIEW_KEY   = 'gradius.pipeline.view'

export default function PipelineContent() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [memos,     setMemos]     = useState<MemoLike[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [onlyRisky, setOnlyRisky] = useState(false)
  const [tab, setTab] = useState<TabKey>('all')
  const [showOldConcluded, setShowOldConcluded] = useState(false)
  // 카드에 적어둔 내용까지 펼칠지. 서버 렌더에서는 localStorage를 읽을 수 없어
  // 첫 렌더는 기본값으로 그리고 마운트 뒤에 갈아끼운다 (viewPrefs와 같은 방식).
  const [detail, setDetail] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('urgent')
  const [view, setView] = useState<'board' | 'calendar'>('board')
  // 카드 객체가 아니라 id만 들고 있는다. 객체를 들고 있으면 저장 직후
  // 창 안의 값이 예전 값으로 남아, 그걸 맞추는 동기화 코드가 또 필요해진다.
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [inqs, ests, mms] = await Promise.all([
        db.list<Inquiry>('inquiries', { order: 'created_at', asc: false }),
        db.list<Estimate>('estimates', { order: 'created_at', asc: false }),
        // 카드에 최근 기록 한 줄을 띄우려면 목록 단계에서 같이 읽어야 한다.
        // 카드마다 따로 조회하면 화면 하나에 수십 번 왕복한다.
        db.list<MemoLike>('project_memos', {
          filters: { type: ACTIVITY_TYPE }, order: 'created_at', asc: false,
        }).catch(() => []),
      ])
      setInquiries(inqs)
      setEstimates(ests)
      setMemos(mms)
    } catch (e) {
      toast.error('조회 실패: ' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  // effect 동기 구간에서 setState하면 렌더가 연쇄된다.
  // 마이크로태스크로 한 박자 미룬다 (viewPrefs·useScheduleData와 같은 방식).
  useEffect(() => { void Promise.resolve().then(load) }, [load])

  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        const saved = localStorage.getItem(DETAIL_KEY)
        if (saved !== null) setDetail(saved === '1')
        const savedSort = localStorage.getItem(SORT_KEY)
        // 모르는 값은 버린다 — 예전 버전이거나 사람이 고쳤을 수 있다
        if (SORT_MODES.some(m => m.key === savedSort)) setSortKey(savedSort as SortKey)
        const savedView = localStorage.getItem(VIEW_KEY)
        if (savedView === 'board' || savedView === 'calendar') setView(savedView)
      } catch { /* 저장이 막힌 브라우저 — 기본값으로 둔다 */ }
    })
  }, [])

  function changeSort(key: SortKey) {
    setSortKey(key)
    try { localStorage.setItem(SORT_KEY, key) } catch { /* 무시 */ }
  }

  function changeView(next: 'board' | 'calendar') {
    setView(next)
    try { localStorage.setItem(VIEW_KEY, next) } catch { /* 무시 */ }
  }

  function toggleDetail() {
    setDetail(v => {
      const next = !v
      try { localStorage.setItem(DETAIL_KEY, next ? '1' : '0') } catch { /* 무시 */ }
      return next
    })
  }

  const allCards = useMemo(
    () => buildBoard(inquiries, estimates, memos),
    [inquiries, estimates, memos],
  )

  // 창을 열어둔 사이 건이 사라졌으면 find가 비고, 창은 저절로 닫힌다.
  const openCard = useMemo(
    () => allCards.find(c => c.inq.id === openId) ?? null,
    [allCards, openId],
  )

  // ── 무엇을 화면에 올릴 것인가 ────────────────────────────
  // 끝난 건(실측: 체결 178 · 미체결 111)을 다 펼치면 살아 있는 건이 묻힌다.
  // 기본은 최근 30일, 펼치기는 사용자가 고른다.
  const onBoard = useMemo(
    () => allCards.filter(c =>
      isLiveStage(c.stage) || showOldConcluded || isRecentlyConcluded(c)),
    [allCards, showOldConcluded],
  )

  const matchesSearch = useCallback((c: PipelineCard) => {
    const q = searchText.trim().toLowerCase()
    if (!q) return true
    return [
      c.inq.company_name, c.inq.event_name, c.inq.contact_name, c.inq.location,
      c.inq.phone, c.inq.service_type,
      c.inq.next_action, c.lastNote?.text,   // 적어둔 내용으로도 찾을 수 있어야 한다
    ].some(v => v?.toLowerCase().includes(q))
  }, [searchText])

  const visible = useMemo(
    () => onBoard.filter(c => {
      if (onlyRisky && c.signal === 'ok' && !c.overdue) return false
      return matchesSearch(c)
    }),
    [onBoard, onlyRisky, matchesSearch],
  )

  const byStage = useMemo(() => {
    const map = {} as Record<PipelineStage, PipelineCard[]>
    PIPELINE_STAGES.forEach(s => { map[s] = [] })
    visible.forEach(c => { map[c.stage].push(c) })
    PIPELINE_STAGES.forEach(s => { map[s] = sortCards(map[s], sortKey) })
    return map
  }, [visible, sortKey])

  /** 탭 하나가 품는 카드 (검색·필터 적용 후) */
  const cardsOfTab = useCallback(
    (stages: PipelineStage[] | null) =>
      sortCards(stages === null ? visible : visible.filter(c => stages.includes(c.stage)), sortKey),
    [visible, sortKey],
  )

  const activeTab = TABS.find(t => t.key === tab)!
  const tabCards  = cardsOfTab(activeTab.stages)

  // ── 집계 (검색·필터와 무관하게 전체 기준) ────────────────
  const live       = allCards.filter(c => isLiveStage(c.stage))
  const waiting    = live.filter(c => c.stage === '체결 전')
  const riskyCount = live.filter(c => c.signal === 'alert').length
  const liveAmount = live.reduce((s, c) => s + c.amount, 0)
  const followUps  = dueToday(allCards)
  const score      = winRate(allCards)

  const hiddenOld = allCards.filter(
    c => !isLiveStage(c.stage) && !isRecentlyConcluded(c)).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <>
      {/* 오늘의 후속 — 오늘까지 하기로 한 일 */}
      {followUps.length > 0 && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/70 p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <CalendarClock className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-blue-900">
              오늘의 후속 {followUps.length}건
            </h2>
            <span className="text-xs text-blue-500">오늘까지 하기로 한 일입니다</span>
          </div>
          <ul className="flex flex-wrap gap-2">
            {followUps.map(c => {
              const late = dayDiff(kstDay(c.inq.next_action_at!), today())
              return (
                <li key={c.inq.id}>
                  <button
                    onClick={() => setOpenId(c.inq.id)}
                    className="flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-left text-xs hover:border-blue-400 hover:shadow-sm transition-all"
                  >
                    <span className="font-medium text-gray-900 max-w-[10rem] truncate">
                      {c.inq.company_name || c.inq.event_name}
                    </span>
                    <span className="text-gray-600 max-w-[14rem] truncate">
                      {c.inq.next_action}
                    </span>
                    <span className={late > 0 ? 'font-semibold text-red-600' : 'text-blue-600'}>
                      {late > 0 ? `${late}일 지남` : '오늘'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* ── 구분 탭 ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
        {TABS.map(t => {
          const n = cardsOfTab(t.stages).length
          const on = t.key === tab
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-pressed={on}
              className={[
                'rounded-xl border-2 px-3 py-2.5 text-left transition-all',
                on ? `${t.tone} shadow-md` : t.idle,
              ].join(' ')}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-base font-bold whitespace-nowrap">{t.label}</span>
                <span className="text-3xl font-extrabold leading-none tabular-nums">{n}</span>
              </div>
              <p className={`mt-0.5 text-xs ${on ? 'text-white/75' : 'text-gray-400'}`}>
                {t.hint}
              </p>
            </button>
          )
        })}
      </div>

      {/* 집계 */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mb-4">
        <StatCard icon={<Inbox className="h-5 w-5" />} label="진행 중"
          value={`${live.length}건`} color="blue" />
        <StatCard icon={<Send className="h-5 w-5" />} label="답변 대기"
          value={`${waiting.length}건`} color="green" />
        <StatCard icon={<AlertTriangle className="h-5 w-5" />} label="손 놓은 건"
          value={`${riskyCount}건`} color={riskyCount > 0 ? 'red' : 'gray'}
          hint={`${STALE_RULES['체결 전']!.alert}일 이상 무응답 등`} />
        <StatCard icon={<TrendingUp className="h-5 w-5" />} label="진행 중 견적"
          value={shortKRW(liveAmount)} color="purple" hint="아직 남의 돈 — 매출 아님" />
        <StatCard icon={<Trophy className="h-5 w-5" />} label={`최근 ${RECENT_CONCLUDED_DAYS}일 승률`}
          value={score.rate != null ? `${score.rate}%` : '-'} color="emerald"
          hint={`체결 ${score.won} · 미체결 ${score.lost}`} />
      </div>

      {/* 검색 · 보기 */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="inline-flex overflow-hidden rounded-lg border border-gray-300">
          {([['board', '보드', <LayoutGrid key="b" className="h-4 w-4" />],
             ['calendar', '캘린더', <CalendarDays key="c" className="h-4 w-4" />]] as const).map(
            ([k, label, icon]) => (
              <button
                key={k}
                onClick={() => changeView(k)}
                aria-pressed={view === k}
                className={[
                  'inline-flex items-center gap-1.5 px-3 h-10 text-sm font-semibold transition-colors',
                  view === k ? 'bg-slate-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50',
                ].join(' ')}
              >
                {icon}{label}
              </button>
            ))}
        </div>
        <div className="relative flex-1 min-w-[14rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="업체명, 행사명, 담당자, 번호, 적어둔 내용..."
            className="pl-9"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />
        </div>
        {/* 정렬 — 아침에 훑을 때와 이번 주 행사를 챙길 때는 보고 싶은 순서가 다르다 */}
        <div className="relative">
          <ArrowDownWideNarrow className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Select
            value={sortKey}
            onChange={e => changeSort(e.target.value as SortKey)}
            title={SORT_MODES.find(m => m.key === sortKey)?.hint}
            className="h-10 w-44 pl-8 text-sm font-medium"
          >
            {SORT_MODES.map(m => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </Select>
        </div>
        <button
          onClick={() => setOnlyRisky(v => !v)}
          className={[
            'inline-flex items-center gap-2 rounded-lg border px-3 h-10 text-sm font-medium transition-colors',
            onlyRisky
              ? 'border-red-300 bg-red-50 text-red-700'
              : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50',
          ].join(' ')}
        >
          <AlertTriangle className="h-4 w-4" />
          주의만
        </button>
        <button
          onClick={toggleDetail}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 h-10 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          title={detail ? '카드를 간략하게 — 적어둔 내용을 접습니다' : '카드에 적어둔 내용까지 펼칩니다'}
        >
          {detail ? <Rows2 className="h-4 w-4" /> : <Rows3 className="h-4 w-4" />}
          {detail ? '간략히' : '자세히'}
        </button>
        <button
          onClick={load}
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 h-10 text-gray-600 hover:bg-gray-50 transition-colors"
          title="새로고침"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* ── 본문 ──────────────────────────────────────────── */}
      {view === 'calendar' ? (
        <PipelineCalendar
          // 전체 탭에서는 체결 건을 칩으로 또 그리지 않는다 — 그날 확정 인원은
          // 이미 칸마다 숫자로 나오므로 두 번 그리면 달력만 시끄러워진다.
          cards={tab === 'all' ? tabCards.filter(c => isLiveStage(c.stage)) : tabCards}
          allCards={allCards}
          onOpen={setOpenId}
        />
      ) : tab === 'all' ? (
        // 전체: 단계별 보드
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 items-start">
          {PIPELINE_STAGES.map(stage => {
            const list = byStage[stage]
            const done = !isLiveStage(stage)
            const focus = stage === '체결 전'
            return (
              <section
                key={stage}
                className={[
                  'rounded-xl border',
                  focus ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200 bg-gray-50',
                ].join(' ')}
              >
                <header className={`px-3 py-2.5 border-b ${focus ? 'border-blue-200' : 'border-gray-200'}`}>
                  <div className="flex items-baseline gap-2">
                    <h2 className={`text-sm font-bold ${focus ? 'text-blue-900' : 'text-gray-900'}`}>
                      {stage}
                    </h2>
                    <span className="text-xs font-semibold text-gray-500">{list.length}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {done && !showOldConcluded ? `최근 ${RECENT_CONCLUDED_DAYS}일` : STAGE_DESC[stage]}
                  </p>
                </header>
                <div className="p-2 space-y-2 min-h-[6rem]">
                  {list.length === 0 ? (
                    <p className="text-xs text-gray-300 text-center py-6">비어 있음</p>
                  ) : (
                    list.map(c => (
                      <BoardCard key={c.inq.id} card={c} detail={detail}
                        onOpen={() => setOpenId(c.inq.id)} />
                    ))
                  )}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        // 구분 탭: 그 묶음만 넓게
        <section>
          <div className="mb-2 flex items-baseline gap-2">
            <h2 className="text-base font-bold text-gray-900">{activeTab.label}</h2>
            <span className="text-sm font-semibold text-gray-500">{tabCards.length}건</span>
            <span className="text-xs text-gray-400">{activeTab.hint}</span>
            <span className="ml-auto text-xs text-gray-400">
              {SORT_MODES.find(m => m.key === sortKey)?.label}
            </span>
          </div>
          {tabCards.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center text-sm text-gray-400">
              해당하는 건이 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 items-start">
              {tabCards.map(c => (
                <BoardCard key={c.inq.id} card={c} detail={detail}
                  onOpen={() => setOpenId(c.inq.id)} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* 끝난 건 더 보기 */}
      {(hiddenOld > 0 || showOldConcluded) && (
        <button
          onClick={() => setShowOldConcluded(v => !v)}
          className="mt-4 w-full rounded-lg border border-dashed border-gray-300 py-2 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
        >
          {showOldConcluded
            ? `최근 ${RECENT_CONCLUDED_DAYS}일만 보기`
            : `${RECENT_CONCLUDED_DAYS}일 이전에 끝난 건 ${hiddenOld}건 더 보기`}
        </button>
      )}

      {openCard && (
        <CardDrawer card={openCard} onClose={() => setOpenId(null)} onChanged={load} />
      )}
    </>
  )
}

// ═════════════════════════════════════════════════════════
function BoardCard({
  card, detail, onOpen,
}: { card: PipelineCard; detail: boolean; onOpen: () => void }) {
  const inq = card.inq
  const when = card.when
  const live = isLiveStage(card.stage)

  // 담당자가 업체명과 같은 건이 27건 있다(학교·개인 문의). 그대로 두면
  // 같은 글자가 카드에 두 번 찍혀 칸만 잡아먹는다.
  const contact = inq.contact_name && inq.contact_name !== inq.company_name
    ? inq.contact_name : null

  // 언제 하는 일인가. 날짜가 아예 없는 건이 30%라 date_memo까지 봐야 한다.
  const whenText = when.label
    ? when.label + (when.days > 1 ? ` (${when.days}일)` : '')
    : when.memo || '일정 미정'

  // 행사일까지 며칠 — 끝난 건에도 보여준다.
  // 미체결인데 행사일이 아직 남았으면 되돌릴 여지가 있다는 뜻이다.
  const dday = card.dday
  const ddayBadge = dday == null ? null
    : card.expired            ? { text: `D+${-dday}`, cls: 'bg-gray-200 text-gray-600' }
    : card.stage === '미체결' ? (dday >= 0
        ? { text: `D-${dday}`, cls: 'bg-amber-100 text-amber-700' }   // 아직 기회가 있다
        : { text: `D+${-dday}`, cls: 'bg-gray-100 text-gray-400' })
    : !live                   ? { text: dday >= 0 ? `D-${dday}` : `D+${-dday}`,
                                  cls: 'bg-emerald-50 text-emerald-700' }
    : dday <= 7               ? { text: dday === 0 ? 'D-DAY' : `D-${dday}`,
                                  cls: 'bg-orange-100 text-orange-700' }
    :                           { text: `D-${dday}`, cls: 'bg-gray-100 text-gray-500' }

  return (
    // button이 아니라 div인 이유: 안에 전화 걸기 링크가 들어간다.
    // button 안에 a를 넣을 수 없어 역할과 키보드 조작을 직접 얹는다.
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() }
      }}
      className={[
        'w-full cursor-pointer rounded-lg border border-gray-200 border-l-4 bg-white p-2.5 text-left',
        'hover:shadow-md hover:border-gray-300 transition-all',
        'focus:outline-none focus:ring-2 focus:ring-blue-400',
        SIGNAL_BAR[card.signal],
      ].join(' ')}
    >
      {/* 업체명 + 남은 날 */}
      <div className="flex items-start gap-2">
        <p className="flex-1 min-w-0 text-xs font-semibold text-gray-900 truncate">
          {inq.company_name || '고객사 미상'}
        </p>
        {ddayBadge && (
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-2xs font-bold ${ddayBadge.cls}`}>
            {ddayBadge.text}
          </span>
        )}
      </div>

      <p className="mt-0.5 text-xs text-gray-600 line-clamp-2 break-words">
        {inq.event_name || '(행사명 없음)'}
      </p>

      {/* 무슨 일을 몇 명 — 사람을 넣을 수 있는지가 수주 판단의 절반이다 */}
      {(inq.service_type || inq.required_staff) && (
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
          {inq.service_type && (
            <span className="max-w-full truncate rounded bg-indigo-50 px-1.5 py-0.5 text-2xs font-semibold text-indigo-700">
              {inq.service_type}
            </span>
          )}
          {!!inq.required_staff && (
            <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-gray-700">
              <Users className="h-3 w-3 text-gray-400" />
              {inq.required_staff}명
            </span>
          )}
        </div>
      )}

      {/* 언제 — 야간은 크루 구하기와 단가가 달라지므로 눈에 띄게 */}
      <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
        <Clock className="h-3 w-3 shrink-0 text-gray-400" />
        <span className="truncate">
          {whenText}
          {when.time && ` · ${when.time}`}
        </span>
        {when.night && (
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-50 px-1 text-2xs font-semibold text-amber-700">
            <Moon className="h-2.5 w-2.5" />야간
          </span>
        )}
      </p>

      {/* 어디서 · 누구와 */}
      {detail && (inq.location || contact) && (
        <p className="mt-1 flex items-center gap-1 text-xs text-gray-400">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{[inq.location, contact].filter(Boolean).join(' · ')}</span>
        </p>
      )}

      {/* 전화번호 — 보고 바로 걸 수 있어야 한다 (모바일에서 누르면 전화 앱) */}
      {detail && inq.phone && (
        <a
          href={`tel:${inq.phone.replace(/[^0-9+]/g, '')}`}
          onClick={e => e.stopPropagation()}
          className="mt-1 inline-flex items-center gap-1 rounded text-xs font-medium text-blue-600 hover:underline"
        >
          <Phone className="h-3 w-3" />
          {inq.phone}
        </a>
      )}

      {/* 돈 — 얼마 받고 얼마 주는가 */}
      <p className="mt-1 text-xs text-gray-400 truncate">
        {[
          card.amount > 0 ? shortKRW(card.amount) : null,
          detail && card.profitRate != null ? `수익률 ${card.profitRate}%` : null,
          detail && inq.pay_detail?.trim() ? `지급 ${inq.pay_detail.trim()}` : null,
          // 여러 안을 냈으면 금액이 그중 하나라는 뜻이다
          card.estimates.length > 1 ? `견적 ${card.estimates.length}안` : null,
        ].filter(Boolean).join(' · ') || '금액 미정'}
      </p>

      {card.stallText && (
        <p className={`mt-1.5 flex items-center gap-1.5 text-xs font-medium ${SIGNAL_TEXT[card.signal]}`}>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SIGNAL_DOT[card.signal]}`} />
          {card.stallText}
        </p>
      )}

      {/* 끝난 건은 언제 어떻게 끝났는지 */}
      {!live && (
        <p className="mt-1.5 text-xs text-gray-500">
          {card.stage === '체결' ? '체결' : inq.status}
          {inq.lost_reason ? ` · ${inq.lost_reason}` : ''}
          {card.concludedOn ? ` · ${card.concludedOn.substring(5).replace('-', '/')}` : ''}
        </p>
      )}

      {/* 적어둔 내용 — 이게 없으면 카드는 그냥 목록일 뿐이다 */}
      {detail && card.lastNote && (
        <div className="mt-1.5 rounded bg-gray-50 px-2 py-1.5">
          <p className="text-xs leading-snug text-gray-700 line-clamp-3 break-words whitespace-pre-line">
            <MessageSquare className="mr-1 inline h-3 w-3 -translate-y-px text-gray-400" />
            <span className="text-gray-400">[{card.lastNote.kind}]</span>{' '}
            {card.lastNote.text}
          </p>
          <p className="mt-0.5 text-2xs text-gray-400">
            {card.lastNote.source === '활동'
              ? [card.lastNote.author, card.lastNote.on?.substring(5)].filter(Boolean).join(' · ')
              // 원문은 고객이 보낸 글이다. 우리가 적은 것처럼 보이면 안 된다.
              : card.lastNote.source === '문의'
                ? '고객이 보낸 내용 · 아직 기록 없음'
                : '상담 내용 · 아직 기록 없음'}
            {card.noteCount > 1 && ` · 기록 ${card.noteCount}건`}
          </p>
        </div>
      )}

      {/* 간략 모드에서도 기록이 있다는 사실 자체는 알려준다 */}
      {!detail && card.noteCount > 0 && (
        <p className="mt-1.5 flex items-center gap-1 text-2xs text-gray-400">
          <MessageSquare className="h-3 w-3" />
          기록 {card.noteCount}건
        </p>
      )}

      {inq.next_action && (
        <p className={`mt-1.5 truncate text-xs ${card.overdue ? 'font-semibold text-red-600' : 'text-blue-700'}`}>
          ▸ {inq.next_action_at ? `${inq.next_action_at.substring(5, 10)} ` : ''}
          {inq.next_action}
        </p>
      )}

      {/* 현장 준비물 — 체결되면 그대로 크루 모집 공지에 들어간다 */}
      {detail && card.onsite.length > 0 && (
        <p className="mt-1.5 border-t border-gray-100 pt-1 text-2xs text-gray-400 line-clamp-2">
          {card.onsite.join(' · ')}
        </p>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════
function StatCard({
  icon, label, value, color, hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: 'blue' | 'green' | 'red' | 'purple' | 'gray' | 'emerald'
  hint?: string
}) {
  const tone = {
    blue:    'bg-blue-50 text-blue-600',
    green:   'bg-green-50 text-green-600',
    red:     'bg-red-50 text-red-600',
    purple:  'bg-purple-50 text-purple-600',
    gray:    'bg-gray-100 text-gray-400',
    emerald: 'bg-emerald-50 text-emerald-600',
  }[color]

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`rounded-lg p-2 ${tone}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900 truncate">{value}</p>
          {hint && <p className="text-2xs text-gray-400 truncate">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
