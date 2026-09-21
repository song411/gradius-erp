'use client'

// 운영 캘린더 보기 설정 (뷰 / 레이어 / 밀도)
// ─────────────────────────────────────────────────────────
// 같은 달력을 보더라도 배정 담당은 인원이, 정산 담당은 금액이 중요하다.
// 모두에게 다 보여주면 칸이 좁아 아무것도 안 읽히므로, 무엇을 얹을지 고르게 한다.
// 고른 값은 브라우저에 저장해 다음에 들어와도 자기 화면이 그대로 남게 한다.

import { useCallback, useEffect, useState } from 'react'

// ─── 뷰 ───────────────────────────────────────────────────
export type ViewMode = 'month' | 'week' | 'table'

export const VIEW_LABEL: Record<ViewMode, string> = {
  month: '월',
  week:  '주',
  table: '표',
}

/** 레이어 설정이 의미 있는 뷰 (표는 컬럼이 고정이라 해당 없음) */
export const LAYERED_VIEWS: ViewMode[] = ['month', 'week']

// ─── 레이어 ───────────────────────────────────────────────
/** 달력 칸에 얹을 수 있는 정보 조각.
 *  행사명은 레이어가 아니다 — 끄면 달력이 무의미해지므로 항상 나온다. */
export type LayerKey =
  | 'company' | 'staffing' | 'warn' | 'crew'
  | 'money' | 'site' | 'onsite' | 'status' | 'memo'

export const LAYERS: Array<{ key: LayerKey; label: string; hint: string }> = [
  { key: 'company',  label: '고객사',    hint: '행사명 아래에 고객사를 함께 표시합니다.' },
  { key: 'staffing', label: '배정 현황',  hint: '그 날 배정 인원 / 필요 인원을 3/4 형태로 표시합니다.' },
  { key: 'warn',     label: '경고',      hint: '인원이 모자라거나 같은 크루가 두 곳에 잡힌 날을 색으로 표시합니다.' },
  { key: 'crew',     label: '크루 이름',  hint: '그 날 투입되는 크루 이름을 칩으로 나열합니다. 밀도를 높여야 잘 보입니다.' },
  { key: 'money',    label: '금액',      hint: '행사의 청구 합계를 표시합니다 (행사 전체 기준, 그 날 금액이 아닙니다).' },
  { key: 'site',     label: '장소·시간',  hint: '행사 장소와 시간을 표시합니다.' },
  { key: 'onsite',   label: '복장·식사·주차', hint: '현장 준비물 정보를 표시합니다.' },
  { key: 'status',   label: '상태',      hint: '체결 / 배정완료 / 진행중 등 행사 상태를 표시합니다.' },
  { key: 'memo',     label: '메모',      hint: '메모가 달린 행사에 표시를 답니다.' },
]

// ─── 밀도 ─────────────────────────────────────────────────
/** 달력 칸은 근본적으로 좁다. 레이어를 여러 개 켜면 밀도를 올려야 읽힌다. */
export type Density = 'compact' | 'normal' | 'detail'

export const DENSITY_LABEL: Record<Density, string> = {
  compact: '간략',
  normal:  '보통',
  detail:  '상세',
}

/** 밀도별 날짜 칸 최소 높이 (px).
 *  2026-09-21 글자 척도를 한 단계 올리면서(11/13/15px) 같은 내용이
 *  더 높이 차지하게 됐다. 칸 높이를 안 올리면 칩이 잘려 보인다. */
export const DENSITY_MIN_H: Record<Density, number> = {
  compact: 104,
  normal:  148,
  detail:  224,
}

// ─── 프리셋 ───────────────────────────────────────────────
// 체크박스 9개를 매번 만지는 사람은 없다. 역할별 한 번 클릭을 기본 동선으로 둔다.
export interface Preset {
  key: string
  label: string
  hint: string
  layers: LayerKey[]
  density: Density
}

export const PRESETS: Preset[] = [
  {
    key: 'ops',
    label: '운영',
    hint: '현장을 돌리는 사람 기준 — 누가 어디에 몇 명 들어가는지, 준비물은 무엇인지.',
    layers: ['company', 'staffing', 'warn', 'crew', 'site', 'onsite', 'memo'],
    density: 'detail',
  },
  {
    key: 'money',
    label: '정산',
    hint: '돈 기준 — 청구 금액과 행사 상태.',
    layers: ['company', 'money', 'status', 'staffing'],
    density: 'normal',
  },
  {
    key: 'glance',
    label: '한눈에',
    hint: '가장 깔끔한 화면 — 행사명과 문제가 있는 날만.',
    layers: ['warn', 'status'],
    density: 'compact',
  },
]

// ─── 저장 형태 ────────────────────────────────────────────
export interface ViewPrefs {
  view: ViewMode
  layers: LayerKey[]
  density: Density
  /** 프리셋 그대로면 그 key, 손으로 고쳤으면 null */
  preset: string | null
}

const DEFAULT_PRESET = PRESETS[0]

export const DEFAULT_PREFS: ViewPrefs = {
  view: 'month',
  layers: DEFAULT_PRESET.layers,
  density: DEFAULT_PRESET.density,
  preset: DEFAULT_PRESET.key,
}

const STORAGE_KEY = 'gradius.schedule.viewPrefs.v1'

const VALID_LAYERS = new Set<string>(LAYERS.map(l => l.key))

/** 저장된 값은 사람이 고칠 수도, 예전 버전일 수도 있다. 모르는 값은 버리고 기본값으로. */
function sanitize(raw: unknown): ViewPrefs {
  if (!raw || typeof raw !== 'object') return DEFAULT_PREFS
  const p = raw as Partial<Record<keyof ViewPrefs, unknown>>
  const layers = Array.isArray(p.layers)
    ? (p.layers.filter(k => typeof k === 'string' && VALID_LAYERS.has(k)) as LayerKey[])
    : DEFAULT_PREFS.layers
  return {
    view:    p.view === 'table' || p.view === 'month' || p.view === 'week'
      ? p.view : DEFAULT_PREFS.view,
    layers,
    density: p.density === 'compact' || p.density === 'normal' || p.density === 'detail'
      ? p.density : DEFAULT_PREFS.density,
    preset:  typeof p.preset === 'string' && PRESETS.some(x => x.key === p.preset)
      ? p.preset : null,
  }
}

/** 레이어 조합이 어떤 프리셋과 정확히 같은지 — 같으면 그 프리셋으로 표시한다 */
export function matchPreset(layers: LayerKey[], density: Density): string | null {
  const key = [...layers].sort().join(',')
  const hit = PRESETS.find(p => [...p.layers].sort().join(',') === key && p.density === density)
  return hit?.key ?? null
}

// ═════════════════════════════════════════════════════════
/** 보기 설정 상태 + localStorage 동기화.
 *
 *  서버 렌더 시점에는 localStorage를 읽을 수 없으므로 첫 렌더는 항상 기본값이고,
 *  마운트 후 저장값으로 갈아끼운다. (기본값으로 먼저 그려야 하이드레이션이 어긋나지 않는다) */
export function useViewPrefs() {
  const [prefs, setPrefs] = useState<ViewPrefs>(DEFAULT_PREFS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    // 마이크로태스크로 미뤄 effect 동기 구간에서 setState하지 않는다
    // (useScheduleData의 월 조회와 같은 방식)
    Promise.resolve().then(() => {
      if (!alive) return
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) setPrefs(sanitize(JSON.parse(raw)))
      } catch {
        /* 사파리 프라이빗 모드 등 — 저장이 막혀도 화면은 기본값으로 돌아간다 */
      }
      setLoaded(true)
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!loaded) return   // 로드 전에 쓰면 저장된 설정을 기본값으로 덮어쓴다
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    } catch { /* 저장 실패는 화면 동작에 영향 없음 */ }
  }, [prefs, loaded])

  const setView = useCallback((view: ViewMode) => {
    setPrefs(p => ({ ...p, view }))
  }, [])

  const setDensity = useCallback((density: Density) => {
    setPrefs(p => ({ ...p, density, preset: matchPreset(p.layers, density) }))
  }, [])

  const toggleLayer = useCallback((key: LayerKey) => {
    setPrefs(p => {
      const layers = p.layers.includes(key)
        ? p.layers.filter(k => k !== key)
        : [...p.layers, key]
      return { ...p, layers, preset: matchPreset(layers, p.density) }
    })
  }, [])

  const applyPreset = useCallback((key: string) => {
    const hit = PRESETS.find(p => p.key === key)
    if (!hit) return
    setPrefs(p => ({ ...p, layers: hit.layers, density: hit.density, preset: hit.key }))
  }, [])

  const has = useCallback(
    (key: LayerKey) => prefs.layers.includes(key),
    [prefs.layers],
  )

  return { prefs, setView, setDensity, toggleLayer, applyPreset, has }
}
