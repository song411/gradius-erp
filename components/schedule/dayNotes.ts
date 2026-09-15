'use client'

// 날짜별 표시 메모 저장
// ─────────────────────────────────────────────────────────
// 정기·장기 행사는 기간이 연속이어도 실제로는 띄엄띄엄 돈다 (금토 5주 연속 등).
// 그런데 시스템은 event_start~event_end 를 통째로 근무일로 본다.
// 이걸 데이터 모델에서 고치면 견적·배정·지급·중복판정이 전부 딸려오고,
// 한 번 잘못 넣으면 다른 화면 숫자가 어긋난다.
//
// 그래서 계산은 건드리지 않고 "사람이 보고 판단하는 표시"만 남긴다.
// 틀려도 아무것도 안 망가지고, 맞으면 운영 캘린더에서 한눈에 읽힌다.
//
// 저장 위치는 인원배정 화면(ScheduleView)이 이미 쓰는 project_memos 의
// '[스케줄_설정]' 레코드다. 새 테이블도, 스키마 변경도 필요 없다.

import { db } from '@/lib/supabase/api'
import { CONFIG_TAG, EMPTY_CONFIG, type DayNote, type ScheduleConfig } from './matrixCore'

interface MemoRow { id: string; inquiry_id: string; content: string }

/** 같은 레코드에 직무 설정(직무 추가·숨김·필요인원)이 함께 들어 있다.
 *  통째로 덮어쓰면 인원배정 화면에서 조정한 값이 날아가므로,
 *  저장 직전에 최신을 다시 읽어 합친 뒤 쓴다. */
export async function saveDayNotes(
  inquiryId: string,
  dayNotes: Record<string, DayNote>,
): Promise<void> {
  const rows = await db.list<MemoRow>('project_memos', {
    filters: { inquiry_id: inquiryId }, order: 'created_at', asc: true,
  })
  const rec = rows.find(m => m.content?.startsWith(CONFIG_TAG))

  let base: ScheduleConfig = EMPTY_CONFIG
  if (rec) {
    try {
      const p = JSON.parse(rec.content.slice(CONFIG_TAG.length + 1))
      base = {
        customJobs:        p.customJobs        ?? [],
        hiddenJobs:        p.hiddenJobs        ?? [],
        requiredOverrides: p.requiredOverrides ?? {},
        labelOverrides:    p.labelOverrides    ?? {},
        dayNotes:          p.dayNotes          ?? {},
      }
    } catch {
      /* 깨진 설정이면 기본값 위에 얹는다 — 메모 때문에 화면이 멈추지는 않게 */
    }
  }

  // 빈 메모는 아예 지운다. 두면 설정이 계속 불어나고 '표시 없음'과 구분도 안 된다.
  const clean: Record<string, DayNote> = {}
  Object.entries(dayNotes).forEach(([date, n]) => {
    const text = n.text?.trim()
    if (n.off || text) clean[date] = { ...(n.off ? { off: true } : {}), ...(text ? { text } : {}) }
  })

  const next: ScheduleConfig = { ...base, dayNotes: clean }
  const content = `${CONFIG_TAG}\n${JSON.stringify(next)}`

  if (rec) {
    await db.update('project_memos', rec.id, { content })
  } else {
    // type 은 NOT NULL 이다. 빼면 insert 가 통째로 실패한다.
    // 설정 레코드는 사람이 쓴 메모가 아니므로 메모 목록에서는 CONFIG_TAG 로 걸러낸다.
    await db.insert('project_memos', { inquiry_id: inquiryId, content, type: '운영메모' })
  }
}

/** 표시용 요약 — '운영 10일 / 휴무 20일' 같은 한 줄 */
export function summarizeDayNotes(dates: string[], notes: Record<string, DayNote>) {
  const off = dates.filter(d => notes[d]?.off).length
  const memo = dates.filter(d => notes[d]?.text).length
  return { total: dates.length, off, on: dates.length - off, memo }
}
