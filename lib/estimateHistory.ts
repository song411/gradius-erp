// 견적 변경 이력
// ─────────────────────────────────────────────────────────
// 견적을 고칠 때마다 '고치기 직전 상태'를 estimate_versions 에 한 줄 남긴다.
// 읽을 때 연속한 두 상태를 비교해 "스탭 1명 → 2명 · 팀장 단가 200,000 → 220,000 (10-26 14:02)"
// 처럼 사람이 읽는 말로 바꾼다 (실무자 요청: 품목 변화와 바꾼 날짜가 보이게).
//
// 왜 스냅샷인가: 변경 전후를 따로 적으면 적는 쪽마다 빠뜨린다. 상태를 통째로 남기고
// 읽을 때 비교하면 어떤 칸이 바뀌어도 잡힌다. 전체 변경 로그 설계(기록부터, 번역은 읽을 때)와 같은 방향.
//
// estimate_versions 에는 2026-05 이전에 옮겨 온 옛 행(한글 키 items_json, 38줄)이 있다.
// 새 스냅샷은 meta_json.kind = 'revision' 으로 표시해 그것과 섞이지 않게 한다.

import type { Estimate, EstimateItem, EstimateVersion } from '@/lib/supabase/types'

const SUPPORT_TYPES = ['지원품목']

export interface SnapshotItem {
  role_name: string
  item_type: string
  quantity: number
  days: number
  unit_price: number
  pay_unit_price: number
  is_leader: boolean
}

export interface RevisionMeta {
  kind: 'revision'
  estimate_id: string
  estimate_code?: string | null
  version_label?: string | null
  total_price: number
  supply_price: number
  vat: number
  discount_type?: string | null
  discount_value?: number | null
  discount_label?: string | null
}

export interface Snapshot {
  at: string                 // 이 상태가 끝난(= 고친) 시각. 현재 상태면 ''
  items: SnapshotItem[]
  supply: number
  total: number
  vat: number
  discountText: string
}

/** 저장 직전에 남길 한 줄 — estimate_versions insert 에 그대로 넣는다 */
export function snapshotPayload(est: Estimate, items: EstimateItem[]): Record<string, unknown> {
  const d = new Date()
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const meta: RevisionMeta = {
    kind: 'revision', estimate_id: est.id, estimate_code: est.estimate_code, version_label: est.version_label,
    total_price: est.total_price, supply_price: est.supply_price, vat: est.vat,
    discount_type: est.discount_type, discount_value: est.discount_value, discount_label: est.discount_label,
  }
  const snapItems: SnapshotItem[] = items.map(it => ({
    role_name: it.role_name || '', item_type: it.item_type || '인력',
    quantity: it.quantity, days: it.days, unit_price: it.unit_price, pay_unit_price: it.pay_unit_price,
    is_leader: !!it.is_leader,
  }))
  return {
    version_code: `REV-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    inquiry_id: est.inquiry_id || null,
    version_name: est.version_label || null,
    items_json: snapItems,
    supply_total: est.supply_price,
    cost_total: est.cost_price,
    item_count: snapItems.length,
    meta_json: meta,
  }
}

export function isRevision(v: EstimateVersion): boolean {
  return (v.meta_json as Partial<RevisionMeta> | undefined)?.kind === 'revision'
}

function discountTextOf(type?: string | null, value?: number | null, label?: string | null): string {
  if (!type || type === 'none' || !value) return ''
  return `${label || '할인'} ${type === 'amount' ? value.toLocaleString() + '원' : value + '%'}`
}

function fromRevision(v: EstimateVersion): Snapshot {
  const m = v.meta_json as Partial<RevisionMeta>
  return {
    at: v.created_at,
    items: (v.items_json as SnapshotItem[]) || [],
    supply: m.supply_price ?? v.supply_total ?? 0,
    total: m.total_price ?? 0,
    vat: m.vat ?? 0,
    discountText: discountTextOf(m.discount_type, m.discount_value, m.discount_label),
  }
}

function fromCurrent(est: Estimate, items: EstimateItem[]): Snapshot {
  return {
    at: '',
    items: items.map(it => ({
      role_name: it.role_name || '', item_type: it.item_type || '인력',
      quantity: it.quantity, days: it.days, unit_price: it.unit_price, pay_unit_price: it.pay_unit_price,
      is_leader: !!it.is_leader,
    })),
    supply: est.supply_price, total: est.total_price, vat: est.vat,
    discountText: discountTextOf(est.discount_type, est.discount_value, est.discount_label),
  }
}

// 품목을 이름으로 묶는다. 같은 이름이 두 줄이면 인원은 합치고 일수·단가는 첫 줄 것을 쓴다
interface Agg { qty: number; days: number; unit: number; pay: number; leader: boolean }
function aggregate(items: SnapshotItem[]): Map<string, Agg> {
  const m = new Map<string, Agg>()
  items.forEach(it => {
    if (!it.role_name || SUPPORT_TYPES.includes(it.item_type)) return
    const key = it.role_name.trim()
    const a = m.get(key)
    if (a) { a.qty += it.quantity }
    else m.set(key, { qty: it.quantity, days: it.days, unit: it.unit_price, pay: it.pay_unit_price, leader: it.is_leader })
  })
  return m
}

const won = (n: number) => n.toLocaleString()

/** 두 상태의 차이를 사람이 읽는 줄로 */
export function diffSnapshots(before: Snapshot, after: Snapshot): string[] {
  const out: string[] = []
  const a = aggregate(before.items), b = aggregate(after.items)
  const names = new Set([...a.keys(), ...b.keys()])
  names.forEach(name => {
    const x = a.get(name), y = b.get(name)
    if (x && !y) { out.push(`${name} 삭제 (${x.qty}명 × ${x.days}일 × ${won(x.unit)})`); return }
    if (!x && y) { out.push(`${name} 추가 (${y.qty}명 × ${y.days}일 × ${won(y.unit)})`); return }
    if (!x || !y) return
    const parts: string[] = []
    if (x.qty  !== y.qty)  parts.push(`${x.qty}명 → ${y.qty}명`)
    if (x.days !== y.days) parts.push(`${x.days}일 → ${y.days}일`)
    if (x.unit !== y.unit) parts.push(`단가 ${won(x.unit)} → ${won(y.unit)}`)
    if (x.pay  !== y.pay)  parts.push(`지급단가 ${won(x.pay)} → ${won(y.pay)}`)
    if (parts.length) out.push(`${name} ${parts.join(', ')}`)
  })
  if (before.discountText !== after.discountText) {
    out.push(before.discountText && after.discountText
      ? `할인 ${before.discountText} → ${after.discountText}`
      : after.discountText ? `할인 추가 (${after.discountText})` : `할인 삭제 (${before.discountText})`)
  }
  if (before.total !== after.total) out.push(`합계 ${won(before.total)} → ${won(after.total)}`)
  else if (before.supply !== after.supply) out.push(`공급가 ${won(before.supply)} → ${won(after.supply)}`)
  return out
}

export interface HistoryEntry {
  at: string          // 고친 시각 (ISO)
  changes: string[]   // 비어 있으면 '금액·품목은 그대로' (메모·주소 같은 칸만 바뀐 것)
}

/** 한 견적의 변경 이력 — 오래된 것부터.
 *  스냅샷은 '고치기 직전' 상태라서, 스냅샷 i 의 변경 내용은 i 와 i+1(없으면 현재)을 비교한 것이고
 *  바뀐 시각은 스냅샷 i 가 남겨진 시각이다. */
export function historyOf(est: Estimate, items: EstimateItem[], versions: EstimateVersion[]): HistoryEntry[] {
  const revs = versions
    .filter(v => isRevision(v) && (v.meta_json as Partial<RevisionMeta> | undefined)?.estimate_id === est.id)
    .sort((x, y) => x.created_at.localeCompare(y.created_at))
    .map(fromRevision)
  const seq = [...revs, fromCurrent(est, items)]
  const out: HistoryEntry[] = []
  for (let i = 0; i < seq.length - 1; i++) {
    out.push({ at: seq[i].at, changes: diffSnapshots(seq[i], seq[i + 1]) })
  }
  return out
}

/** 이력 시각 표시 — 한국시간 "10-26 14:02" */
export function formatRevisionAt(iso: string, withYear = false): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(d)
  const get = (t: string) => parts.find(x => x.type === t)?.value || ''
  return `${withYear ? get('year') + '-' : ''}${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}
