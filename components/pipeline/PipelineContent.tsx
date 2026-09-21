'use client'

// 영업 보드 — 체결 전 현황
// ─────────────────────────────────────────────────────────
// 운영 캘린더가 체결된 건을 맡는다면 이 화면은 그 앞을 맡는다.
// 단계는 저장하지 않고 이미 있는 데이터(견적 유무·발송 여부·상태)에서
// 끌어낸다. 판정 규칙은 전부 lib/pipeline.ts에 있다 — 화면은 그리기만 한다.
//
// 여기 보이는 금액은 아직 남의 돈이다. 매출·수익 집계에는 절대 들어가지
// 않는다 (그 경계는 lib/finance.ts의 NON_COUNTABLE이 긋는다).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { db } from '@/lib/supabase/api'
import { formatKRW } from '@/lib/utils'
import {
  buildBoard, sortCards, dueToday, isDead, isRecentlyConcluded,
  PIPELINE_STAGES, STAGE_DESC, STALE_RULES, RECENT_CONCLUDED_DAYS, ACTIVITY_TYPE,
  today, dayDiff, kstDay,
  type PipelineCard, type PipelineStage, type Signal, type MemoLike,
} from '@/lib/pipeline'
import type { Estimate, Inquiry } from '@/lib/supabase/types'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import CardDrawer from './CardDrawer'
import {
  Search, AlertTriangle, Send, Inbox, TrendingUp, CalendarClock, RefreshCw,
  MessageSquare, MapPin, User, Rows3, Rows2,
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

const DETAIL_KEY = 'gradius.pipeline.detail'

export default function PipelineContent() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [memos,     setMemos]     = useState<MemoLike[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [onlyRisky, setOnlyRisky] = useState(false)
  const [showOldConcluded, setShowOldConcluded] = useState(false)
  // 카드에 적어둔 내용까지 펼칠지. 서버 렌더에서는 localStorage를 읽을 수 없어
  // 첫 렌더는 기본값으로 그리고 마운트 뒤에 갈아끼운다 (viewPrefs와 같은 방식).
  const [detail, setDetail] = useState(true)
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
      } catch { /* 저장이 막힌 브라우저 — 기본값으로 둔다 */ }
    })
  }, [])

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

  // 체결되어 보드를 떠났으면 find가 비고, 창은 저절로 닫힌다.
  const openCard = useMemo(
    () => allCards.find(c => c.inq.id === openId) ?? null,
    [allCards, openId],
  )

  const visible = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    return allCards.filter(c => {
      if (onlyRisky && c.signal === 'ok' && !c.overdue) return false
      if (!q) return true
      return [
        c.inq.company_name, c.inq.event_name, c.inq.contact_name, c.inq.location,
        c.inq.next_action, c.lastNote?.text,   // 적어둔 내용으로도 찾을 수 있어야 한다
      ].some(v => v?.toLowerCase().includes(q))
    })
  }, [allCards, searchText, onlyRisky])

  const byStage = useMemo(() => {
    const map = {} as Record<PipelineStage, PipelineCard[]>
    PIPELINE_STAGES.forEach(s => { map[s] = [] })
    visible.forEach(c => { map[c.stage].push(c) })
    PIPELINE_STAGES.forEach(s => { map[s] = sortCards(map[s]) })
    return map
  }, [visible])

  // ── 집계 (검색·필터와 무관하게 전체 기준) ────────────────
  const live       = allCards.filter(c => !isDead(c.inq))
  const waiting    = live.filter(c => c.stage === '발송대기')
  const riskyCount = live.filter(c => c.signal === 'alert').length
  const liveAmount = live.reduce((s, c) => s + c.amount, 0)
  const followUps  = dueToday(allCards)

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
        <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50/70 p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <CalendarClock className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-semibold text-blue-900">
              오늘의 후속 {followUps.length}건
            </h2>
            <span className="text-[11px] text-blue-500">
              오늘까지 하기로 한 일입니다
            </span>
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

      {/* 집계 */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <StatCard
          icon={<Inbox className="h-5 w-5" />}
          label="진행 중"
          value={`${live.length}건`}
          color="blue"
        />
        <StatCard
          icon={<Send className="h-5 w-5" />}
          label="답변 대기"
          value={`${waiting.length}건`}
          color="green"
        />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="손 놓은 건"
          value={`${riskyCount}건`}
          color={riskyCount > 0 ? 'red' : 'gray'}
          hint={`${STALE_RULES['발송대기']!.alert}일 이상 무응답 등`}
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="진행 중 견적 합계"
          value={formatKRW(liveAmount)}
          color="purple"
          hint="아직 남의 돈 — 매출 아님"
        />
      </div>

      {/* 검색 */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[14rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="업체명, 행사명, 담당자 검색..."
            className="pl-9"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />
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
          주의만 보기
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
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 h-10 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          title="새로고침"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* 보드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {PIPELINE_STAGES.map(stage => {
          const all = byStage[stage]
          // 끝난 건은 계속 쌓이기만 한다. 최근 것만 펼쳐 살아 있는 칸을 가리지 않게 한다.
          const folded = stage === '결론' && !showOldConcluded
          const shown  = folded ? all.filter(c => isRecentlyConcluded(c)) : all
          const hidden = all.length - shown.length

          return (
            <section key={stage} className="rounded-xl bg-gray-50 border border-gray-200">
              <header className="px-3 py-2.5 border-b border-gray-200">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-sm font-bold text-gray-900">{stage}</h2>
                  <span className="text-xs font-semibold text-gray-500">{all.length}</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {stage === '결론' && folded
                    ? `최근 ${RECENT_CONCLUDED_DAYS}일 내 ${shown.length}건`
                    : STAGE_DESC[stage]}
                </p>
              </header>

              <div className="p-2 space-y-2 min-h-[6rem]">
                {shown.length === 0 ? (
                  <p className="text-[11px] text-gray-300 text-center py-6">비어 있음</p>
                ) : (
                  shown.map(c => (
                    <BoardCard key={c.inq.id} card={c} detail={detail} onOpen={() => setOpenId(c.inq.id)} />
                  ))
                )}

                {stage === '결론' && (hidden > 0 || showOldConcluded) && (
                  <button
                    onClick={() => setShowOldConcluded(v => !v)}
                    className="w-full rounded-lg border border-dashed border-gray-300 py-1.5 text-[11px] text-gray-500 hover:bg-white hover:text-gray-700 transition-colors"
                  >
                    {showOldConcluded ? '접기' : `이전 ${hidden}건 더 보기`}
                  </button>
                )}
              </div>
            </section>
          )
        })}
      </div>

      {openCard && (
        <CardDrawer
          card={openCard}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
    </>
  )
}

// ═════════════════════════════════════════════════════════
function BoardCard({
  card, detail, onOpen,
}: { card: PipelineCard; detail: boolean; onOpen: () => void }) {
  const inq = card.inq
  // 행사가 코앞인데 아직 체결 전이면 무응답 일수보다 이쪽이 급하다
  const imminent = card.dday != null && card.dday >= 0 && card.dday <= 7 && !isDead(inq)

  // 어디서·누구와 하는 일인지.
  // 담당자가 업체명과 같은 건이 27건 있다(학교·개인 문의). 그대로 두면
  // 같은 글자가 카드에 두 번 찍혀 칸만 잡아먹는다.
  const contact = inq.contact_name && inq.contact_name !== inq.company_name
    ? inq.contact_name : null
  const whoWhere = [inq.location, contact].filter(Boolean)

  return (
    <button
      onClick={onOpen}
      className={[
        'w-full text-left rounded-lg border border-gray-200 border-l-4 bg-white p-2.5',
        'hover:shadow-md hover:border-gray-300 transition-all',
        SIGNAL_BAR[card.signal],
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <p className="flex-1 min-w-0 text-xs font-semibold text-gray-900 truncate">
          {inq.company_name || '고객사 미상'}
        </p>
        {card.expired ? (
          <span className="shrink-0 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">
            D+{-card.dday!}
          </span>
        ) : imminent && (
          <span className="shrink-0 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">
            {card.dday === 0 ? 'D-DAY' : `D-${card.dday}`}
          </span>
        )}
      </div>

      <p className="mt-0.5 text-[11px] text-gray-600 line-clamp-2 break-words">
        {inq.event_name || '(행사명 없음)'}
      </p>

      {detail && whoWhere.length > 0 && (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-gray-400 truncate">
          {inq.location
            ? <MapPin className="h-3 w-3 shrink-0" />
            : <User className="h-3 w-3 shrink-0" />}
          <span className="truncate">{whoWhere.join(' · ')}</span>
        </p>
      )}

      <p className="mt-1 text-[11px] text-gray-400 truncate">
        {[
          inq.event_start?.substring(5, 10),
          inq.required_staff ? `${inq.required_staff}명` : null,
          card.amount > 0 ? formatKRW(card.amount) : null,
          // 여러 안을 냈으면 카드에서 바로 보여야 한다 — 금액이 그중 하나라는 뜻이니까
          card.estimates.length > 1 ? `견적 ${card.estimates.length}안` : null,
        ].filter(Boolean).join(' · ') || '일정·금액 미정'}
      </p>

      {card.stallText && (
        <p className={`mt-1.5 flex items-center gap-1.5 text-[11px] font-medium ${SIGNAL_TEXT[card.signal]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${SIGNAL_DOT[card.signal]}`} />
          {card.stallText}
        </p>
      )}

      {isDead(inq) && inq.lost_reason && (
        <p className="mt-1.5 text-[11px] text-gray-500">사유: {inq.lost_reason}</p>
      )}

      {/* 적어둔 내용 — 이게 없으면 카드는 그냥 목록일 뿐이다 */}
      {detail && card.lastNote && (
        <div className="mt-1.5 rounded bg-gray-50 px-2 py-1.5">
          <p className="text-[11px] leading-snug text-gray-700 line-clamp-3 break-words whitespace-pre-line">
            <MessageSquare className="mr-1 inline h-3 w-3 -translate-y-px text-gray-400" />
            <span className="text-gray-400">[{card.lastNote.kind}]</span>{' '}
            {card.lastNote.text}
          </p>
          <p className="mt-0.5 text-[10px] text-gray-400">
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
        <p className="mt-1.5 flex items-center gap-1 text-[10px] text-gray-400">
          <MessageSquare className="h-3 w-3" />
          기록 {card.noteCount}건
        </p>
      )}

      {inq.next_action && (
        <p className={`mt-1.5 truncate text-[11px] ${card.overdue ? 'font-semibold text-red-600' : 'text-blue-700'}`}>
          ▸ {inq.next_action_at ? `${inq.next_action_at.substring(5, 10)} ` : ''}
          {inq.next_action}
        </p>
      )}
    </button>
  )
}

// ═════════════════════════════════════════════════════════
function StatCard({
  icon, label, value, color, hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: 'blue' | 'green' | 'red' | 'purple' | 'gray'
  hint?: string
}) {
  const tone = {
    blue:   'bg-blue-50 text-blue-600',
    green:  'bg-green-50 text-green-600',
    red:    'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
    gray:   'bg-gray-100 text-gray-400',
  }[color]

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`rounded-lg p-2 ${tone}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-lg font-bold text-gray-900 truncate">{value}</p>
          {hint && <p className="text-[10px] text-gray-400 truncate">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
