'use client'

// 운영 캘린더 날짜 메모
// ─────────────────────────────────────────────────────────
// 행사에 딸리지 않고 날짜 그 자체에 붙는 쪽지다.
// 행사가 하나도 없는 날에도 적을 수 있어야 하므로 inquiry_id 에 묶지 않는다.
//
// ★ 보기 전용 — 중복배정 판정·금액·마진·배정 인원 어디에도 들어가지 않는다.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { db } from '@/lib/supabase/api'
import type { CalendarNote } from '@/lib/supabase/types'

/** 지금은 단일 조직이다. 멀티테넌시 대비로 컬럼과 조회 조건만 미리 잡아둔다. */
export const ORG_ID = '가디어스'

/** 메모 색 — 분류가 아니라 눈에 띄게 하는 용도다 */
export const NOTE_COLORS: Array<{ key: string; label: string; chip: string; dot: string }> = [
  { key: 'gray',   label: '기본', chip: 'bg-gray-100 text-gray-700 border-gray-300',       dot: 'bg-gray-400' },
  { key: 'amber',  label: '주의', chip: 'bg-amber-100 text-amber-800 border-amber-300',    dot: 'bg-amber-400' },
  { key: 'red',    label: '중요', chip: 'bg-red-100 text-red-700 border-red-300',          dot: 'bg-red-400' },
  { key: 'blue',   label: '안내', chip: 'bg-blue-100 text-blue-700 border-blue-300',       dot: 'bg-blue-400' },
  { key: 'green',  label: '확인', chip: 'bg-green-100 text-green-700 border-green-300',    dot: 'bg-green-400' },
]

export const colorOf = (key?: string | null) =>
  NOTE_COLORS.find(c => c.key === key) ?? NOTE_COLORS[0]

export interface CalendarNotesApi {
  /** 'YYYY-MM-DD' → 그 날의 메모들 */
  byDate: Map<string, CalendarNote[]>
  loading: boolean
  /** 테이블이 아직 없으면 true — 화면을 막지 않고 안내만 띄운다 */
  missingTable: boolean
  add: (date: string, content: string, color: string, author: string) => Promise<void>
  edit: (id: string, content: string, color: string) => Promise<void>
  remove: (id: string) => Promise<void>
  reload: () => void
}

export function useCalendarNotes(from: string, to: string): CalendarNotesApi {
  const [rows, setRows] = useState<CalendarNote[]>([])
  const [loading, setLoading] = useState(true)
  const [missingTable, setMissingTable] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    // 마이크로태스크로 미뤄 effect 동기 구간에서 setState하지 않는다
    Promise.resolve().then(async () => {
      if (!alive) return
      setLoading(true)
      try {
        const data = await db.list<CalendarNote>('calendar_notes', {
          filters: { org_id: ORG_ID },
          order: 'created_at', asc: true,
        })
        if (!alive) return
        // 범위 필터는 화면에서 건다 — 달을 넘길 때마다 재조회하지 않아도 되고,
        // 메모는 건수가 적어 전부 들고 있어도 부담이 없다.
        setRows(data)
        setMissingTable(false)
      } catch (e) {
        if (!alive) return
        // 마이그레이션(012_calendar_notes.sql)을 아직 안 돌렸을 수 있다.
        // 이 경우 달력 전체가 멈추면 안 되므로 조용히 비우고 안내만 남긴다.
        setRows([])
        setMissingTable(true)
        void e
      } finally {
        if (alive) setLoading(false)
      }
    })
    return () => { alive = false }
  }, [tick])

  const byDate = useMemo(() => {
    const m = new Map<string, CalendarNote[]>()
    rows.forEach(n => {
      const d = n.note_date?.substring(0, 10)
      if (!d || d < from || d > to) return
      const arr = m.get(d)
      if (arr) arr.push(n); else m.set(d, [n])
    })
    return m
  }, [rows, from, to])

  const reload = useCallback(() => setTick(t => t + 1), [])

  const add = useCallback(async (date: string, content: string, color: string, author: string) => {
    const text = content.trim()
    if (!text) return
    try {
      await db.insert('calendar_notes', {
        org_id: ORG_ID, note_date: date, content: text,
        color: color || null, author: author.trim() || null,
      })
      reload()
    } catch (e) {
      toast.error('메모 저장 실패: ' + (e as Error).message)
      throw e
    }
  }, [reload])

  const edit = useCallback(async (id: string, content: string, color: string) => {
    const text = content.trim()
    if (!text) return
    try {
      await db.update('calendar_notes', id, {
        content: text, color: color || null, updated_at: new Date().toISOString(),
      })
      reload()
    } catch (e) {
      toast.error('메모 수정 실패: ' + (e as Error).message)
      throw e
    }
  }, [reload])

  const remove = useCallback(async (id: string) => {
    try {
      await db.delete('calendar_notes', id)
      reload()
    } catch (e) {
      toast.error('메모 삭제 실패: ' + (e as Error).message)
      throw e
    }
  }, [reload])

  return { byDate, loading, missingTable, add, edit, remove, reload }
}
