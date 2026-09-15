'use client'

// 운영 캘린더 공용 데이터 훅
// ─────────────────────────────────────────────────────────
// 표 / 월 달력 / 주간 / 크루 뷰가 모두 같은 데이터를 쓴다.
// 뷰마다 각자 조회하면 뷰를 바꿀 때마다 같은 쿼리가 다시 나가고,
// 무엇보다 화면끼리 숫자가 어긋날 수 있다. 조회는 여기 한 곳에서만 한다.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { db } from '@/lib/supabase/api'
import type { Assignment, Estimate, EstimateItem, Inquiry } from '@/lib/supabase/types'
import {
  CONTRACTED_STATUSES, CONFIG_TAG, EMPTY_CONFIG,
  type JobBase, type MemoRecord,
  fmt, cleanStaffName, parseConfigs, buildJobs, splitByDate, coversDate, getDateRange,
} from './matrixCore'

// ─── 타입 ─────────────────────────────────────────────────
export interface EventBase {
  inq: Inquiry
  jobs: JobBase[]
  hasFinalEstimate: boolean
  discountLabel: string | null   // 할인이 걸려 있으면 청구단가에 주의 표시
  memoCount: number              // 스케줄 설정 레코드를 뺀 실제 메모 수
  latestMemo: string | null      // 가장 최근 메모 한 줄 (툴팁)
  /** 어느 견적 직무에도 붙지 못한 배정 인원 수.
   *  이 인원이 있으면 다른 직무의 '미배정'은 사람이 없다는 뜻이 아니다. */
  unassignedJob: number
}

export interface Conflict {
  name: string
  events: string[]
  dates: string[]
}

export interface ScheduleData {
  inquiries: Inquiry[]
  events: EventBase[]
  /** 이 범위에 걸친 체결 이상 행사 */
  rangeInqs: Inquiry[]
  /** 조회한 날짜 전체 (from ~ to) */
  rangeDates: string[]
  conflicts: Conflict[]
  /** 중복배정이 발생한 날짜 집합. 달력 칸에 경고를 찍는 데 쓴다. */
  conflictDates: Set<string>
  busy: boolean
}

// ═════════════════════════════════════════════════════════
/** 날짜 범위로 조회한다 (월이 아니라).
 *
 *  월 단위로 조회하면 달력 격자의 앞뒤 칸(9월 격자의 8/30·8/31)에 걸친 행사가
 *  빠지고, 주가 달을 넘나드는 주간 뷰는 아예 성립하지 않는다.
 *  화면에 보이는 날짜를 그대로 넘겨받아 그 범위만 조회한다. */
export function useScheduleData(from: string, to: string): ScheduleData {
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [events,    setEvents]    = useState<EventBase[]>([])
  const [loadingInq,   setLoadingInq]   = useState(true)
  const [loadingMonth, setLoadingMonth] = useState(false)

  const rangeDates = useMemo(() => getDateRange(from, to), [from, to])

  // ── 행사 전체 1회 조회 (월 이동 시 재조회 불필요) ──────
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const rows = await db.list<Inquiry>('inquiries', { order: 'event_start', asc: false })
        if (alive) setInquiries(rows)
      } catch (e) {
        toast.error('행사 조회 실패: ' + (e as Error).message)
      } finally {
        if (alive) setLoadingInq(false)
      }
    })()
    return () => { alive = false }
  }, [])

  // ── 이 범위에 걸쳐 있는 체결 이상 행사 ──────────────────
  // 월 문자열이 아니라 실제 날짜로 겹침을 본다 (행사기간과 조회범위가 겹치면 포함)
  const rangeInqs = useMemo(() => inquiries.filter(inq => {
    if (!CONTRACTED_STATUSES.includes(inq.status)) return false
    const s = inq.event_start?.substring(0, 10)
    if (!s) return false
    const e = inq.event_end?.substring(0, 10) || s
    return s <= to && from <= e
  }), [inquiries, from, to])

  // ── 월 단위 상세 조회 (견적 / 배정 / 스케줄설정) ────────
  // 대상 행사 id로 in 필터를 걸어 4개 쿼리로 끝낸다 (행사별 개별 조회 = N+1 금지)
  const loadMonth = useCallback(async (inqs: Inquiry[]) => {
    if (inqs.length === 0) { setEvents([]); return }
    setLoadingMonth(true)
    try {
      const ids = inqs.map(i => i.id)

      const [ests, assigns, memos] = await Promise.all([
        db.list<Estimate>('estimates',       { inFilter: { inquiry_id: ids }, order: 'created_at', asc: false }),
        db.list<Assignment>('assignments',   { inFilter: { inquiry_id: ids }, order: 'assigned_at', asc: true }),
        db.list<MemoRecord>('project_memos', { inFilter: { inquiry_id: ids }, order: 'created_at', asc: true })
          .catch(() => [] as MemoRecord[]),
      ])

      // 행사별 최종 확정 견적 (is_final, created_at desc 정렬이므로 첫 건이 최신)
      const finalByInq = new Map<string, Estimate>()
      ests.forEach(e => {
        if (!e.is_final || !e.inquiry_id) return
        if (!finalByInq.has(e.inquiry_id)) finalByInq.set(e.inquiry_id, e)
      })

      const finalIds = [...finalByInq.values()].map(e => e.id)
      const items = finalIds.length
        ? await db.list<EstimateItem>('estimate_items', {
            inFilter: { estimate_id: finalIds }, order: 'sort_order', asc: true,
          })
        : []

      const itemsByEst = new Map<string, EstimateItem[]>()
      items.forEach(it => {
        if (!it.estimate_id) return
        const arr = itemsByEst.get(it.estimate_id)
        if (arr) arr.push(it); else itemsByEst.set(it.estimate_id, [it])
      })

      const asgnByInq = new Map<string, Assignment[]>()
      assigns.filter(a => a.status !== '취소').forEach(a => {
        if (!a.inquiry_id) return
        const arr = asgnByInq.get(a.inquiry_id)
        if (arr) arr.push(a); else asgnByInq.set(a.inquiry_id, [a])
      })

      const cfgByInq = parseConfigs(memos)

      // 메모 표시용 집계 — 스케줄 설정 레코드는 메모가 아니므로 제외
      const memoByInq = new Map<string, { count: number; latest: string }>()
      memos.forEach(m => {
        if (!m.content || m.content.startsWith(CONFIG_TAG)) return
        const cur = memoByInq.get(m.inquiry_id)
        if (cur) cur.count += 1
        else memoByInq.set(m.inquiry_id, { count: 1, latest: m.content })
      })

      const built: EventBase[] = inqs.map(inq => {
        const est  = finalByInq.get(inq.id)
        const its  = est ? (itemsByEst.get(est.id) ?? []) : []
        const cfg  = cfgByInq.get(inq.id) ?? EMPTY_CONFIG
        const disc = est && est.discount_type && est.discount_type !== 'none' && (est.discount_value ?? 0) > 0
          ? (est.discount_label
              || (est.discount_type === 'percentage'
                    ? `${est.discount_value}% 할인`
                    : `${fmt(est.discount_value ?? 0)}원 할인`))
          : null
        const memo = memoByInq.get(inq.id)
        const jobs = buildJobs(its, asgnByInq.get(inq.id) ?? [], cfg)
        return {
          inq,
          jobs,
          unassignedJob: jobs.filter(g => g.unmatched)
            .reduce((n, g) => n + g.assignments.length, 0),
          hasFinalEstimate: !!est,
          discountLabel: disc,
          memoCount: memo?.count ?? 0,
          latestMemo: memo?.latest ?? null,
        }
      })

      setEvents(built)
    } catch (e) {
      toast.error('상세 조회 실패: ' + (e as Error).message)
      setEvents([])
    } finally {
      setLoadingMonth(false)
    }
  }, [])

  useEffect(() => {
    if (loadingInq) return
    let alive = true
    // 마이크로태스크로 미뤄 effect 동기 구간에서 setState하지 않는다
    Promise.resolve().then(() => { if (alive) loadMonth(rangeInqs) })
    return () => { alive = false }
  }, [rangeInqs, loadingInq, loadMonth])

  // ── 중복배정 (날짜 단위로만 판정 가능하므로 별도 집계) ──
  const { conflicts, conflictDates } = useMemo(() => {
    // (크루, 행사조합) → 날짜 목록
    const acc = new Map<string, Conflict>()
    const hot = new Set<string>()
    rangeDates.forEach(date => {
      const where = new Map<string, Set<string>>()
      events.forEach(ev => {
        if (!coversDate(ev.inq.event_start, ev.inq.event_end, date)) return
        const title = ev.inq.event_name || ev.inq.company_name || '(무제)'
        ev.jobs.forEach(job => {
          const { pinned, allPeriod } = splitByDate(job.assignments, date)
          for (const a of [...pinned, ...allPeriod]) {
            const name = cleanStaffName(a.staff_name)
            if (name === '(미상)') continue
            const set = where.get(name) ?? new Set<string>()
            set.add(title)
            where.set(name, set)
          }
        })
      })
      where.forEach((set, name) => {
        if (set.size < 2) return
        hot.add(date)
        const evs = [...set].sort()
        const key = `${name}|${evs.join('|')}`
        const cur = acc.get(key)
        if (cur) cur.dates.push(date)
        else acc.set(key, { name, events: evs, dates: [date] })
      })
    })
    return {
      conflicts: [...acc.values()].sort((a, b) => a.dates[0].localeCompare(b.dates[0])),
      conflictDates: hot,
    }
  }, [events, rangeDates])

  return {
    inquiries, events, rangeInqs, rangeDates,
    conflicts, conflictDates,
    busy: loadingInq || loadingMonth,
  }
}
