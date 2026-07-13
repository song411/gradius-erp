'use client'

import { useEffect, useState } from 'react'
import { db } from '@/lib/supabase/api'
import { X, RefreshCw, Calculator, Pencil, BarChart3, Save, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'

// ── 타입 ─────────────────────────────────────────────────
interface FixedCost { l: string; a: number }
interface RoleRow {
  id: string; role_code: string; role_name: string
  base_price: number; pay_price: number; leader_bonus: number
  fixed_costs: FixedCost[]; is_published: boolean
}
interface FactorRow {
  id: string; role_id: string; factor_name: string; description?: string | null
  add_price: number; add_pay_price: number; level: string; alert?: string | null
}
interface GuideRow {
  id: string; role_id: string; consult_points?: string | null
  market_avg_price?: number | null; competitor_price?: number | null; past_contract_price?: number | null
}

// UI 전용 데이터(디자인/설명) — 변경 빈도가 낮아 DB에 넣지 않고 코드에 상수로 유지
const JOB_META: Record<string, { emoji: string; cc: string; cb: string; cat: string; what: string; confuse: string }> = {
  staff:    { emoji: '🟦', cc: '#2471A3', cb: '#EBF5FB', cat: '운영 직군', what: '공연·전시·컨퍼런스 현장에서 관객 안내, 동선 유도, 등록 처리, QR 체크인 보조 등 행사 운영 전반을 지원.', confuse: '군중 통제·신체 제지 업무가 있으면 경비업(혼잡경비) → 경비업 허가 필요.' },
  parking:  { emoji: '🅿️', cc: '#2471A3', cb: '#EBF5FB', cat: '운영 직군', what: '차량 유도·주차 보조·발렛 파킹 담당. 발렛은 고객 차량을 직접 운전하므로 보험 처리가 핵심.', confuse: '발렛요원은 운전직. 운전경력 1년 미만 절대 불가.' },
  safety:   { emoji: '🦺', cc: '#2471A3', cb: '#EBF5FB', cat: '운영 직군', what: '행사장 위험 구역 통제, 비상 상황 대응, CPR 응급처치 1차 대응.', confuse: '군중 통제·신체 제지=경비원(허가 필요). 무대 앞 배리어 통제가 있으면 경비업법 위반.' },
  promoter: { emoji: '📣', cc: '#6C3483', cb: '#F4ECF7', cat: '홍보 직군', what: '제품 시연·샘플링·판촉·브랜드 홍보 수행.', confuse: '외모형(이미지 중심) vs 세일즈형(판매 전환율 KPI). 유형 확인 필수.' },
  narrator: { emoji: '🎤', cc: '#6C3483', cb: '#F4ECF7', cat: '홍보 직군', what: '전시회·신제품 발표회·박람회에서 마이크를 잡고 스크립트를 전달하는 전문 진행 인력.', confuse: '나레이터 ≠ MC. 나레이터는 정해진 스크립트 전달.' },
  mascot:   { emoji: '🐻', cc: '#6C3483', cb: '#F4ECF7', cat: '홍보 직군', what: '캐릭터 슈트 착용 홍보·퍼포먼스. 밀폐 환경·고강도 신체 노동.', confuse: '1인 8시간 풀타임 배치 = 법 위반. 반드시 2인 1조 교대.' },
  docent:   { emoji: '🖼️', cc: '#1E8449', cb: '#EAFAF1', cat: '전문 직군', what: '미술관·박람회·전시회 작품 해설, 관람객 스토리텔링.', confuse: '도슨트 ≠ 진행요원. 전문 지식과 연구 기간이 필요.' },
  mc:       { emoji: '🎙️', cc: '#1E8449', cb: '#EAFAF1', cat: '전문 직군', what: '행사·시상식·컨퍼런스 프로그램 전체를 이끄는 사회자.', confuse: 'MC ≠ 나레이터. MC는 전체 운영·돌발 대처.' },
  protocol: { emoji: '🎀', cc: '#784212', cb: '#FEF9E7', cat: '의전 직군', what: '기공식·협약식·시상식·VIP 영접에서 의전 서비스 제공.', confuse: '의전도우미 ≠ 프로모터. 의전은 품격·격식, 프로모터는 판매·홍보.' },
  driver:   { emoji: '🚗', cc: '#784212', cb: '#FEF9E7', cat: '의전 직군', what: '임원·VIP 이동 담당 전문 운전. 의전·보안 마인드 필수.', confuse: '수행기사 ≠ 일반 운전기사. 1년 미만 경력 불가.' },
  guard:    { emoji: '🛡️', cc: '#C0392B', cb: '#FDECEA', cat: '보안 직군', what: '특정인 신변 보호(신변보호) 또는 행사장 출입·혼잡 관리(행사경비).', confuse: '경비업 허가 없이 경호 서비스 = 3년 이하 징역 또는 3,000만원 벌금.' },
}

function fmt(n: number | null | undefined) { return Math.round(n || 0).toLocaleString('ko-KR') }

// 숫자로 저장하는 필드 목록 (인라인 편집 시 타입 변환용)
const NUMBER_FIELDS = new Set(['base_price', 'pay_price', 'leader_bonus', 'add_price', 'add_pay_price', 'market_avg_price', 'competitor_price', 'past_contract_price'])

interface EditTarget { table: 'roles' | 'factors' | 'guides'; id: string; field: string; value: string }

interface Props { onClose: () => void }

export default function PricingSimModal({ onClose }: Props) {
  const [roles, setRoles]     = useState<RoleRow[]>([])
  const [factors, setFactors] = useState<FactorRow[]>([])
  const [guides, setGuides]   = useState<GuideRow[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [isLeader, setIsLeader] = useState(false)
  const [tab, setTab] = useState<'calc' | 'edit' | 'market'>('calc')
  const [changer, setChanger] = useState('')
  const [editing, setEditing] = useState<EditTarget | null>(null)

  async function loadAll() {
    setLoading(true)
    try {
      const [r, f, g] = await Promise.all([
        db.list<RoleRow>('roles', { order: 'role_name', asc: true }),
        db.list<FactorRow>('factors', { order: 'factor_name', asc: true }),
        db.list<GuideRow>('guides', { order: 'id', asc: true }),
      ])
      setRoles(r)
      setFactors(f)
      setGuides(g)
      if (r.length > 0 && !selectedRoleId) setSelectedRoleId(r[0].id)
    } catch {
      toast.error('단가 데이터 조회 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const role = roles.find(r => r.id === selectedRoleId) || null
  const roleFactors = factors.filter(f => f.role_id === selectedRoleId)
  const roleGuide = guides.find(g => g.role_id === selectedRoleId) || null
  const meta = role ? JOB_META[role.role_code] : null

  function selectRole(id: string) {
    setSelectedRoleId(id)
    setChecked(new Set())
    setIsLeader(false)
  }

  function toggleFactor(id: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function calcPrice() {
    if (!role) return { crew: 0, client: 0, margin: 0, sub: 0, mgmt: 0, profit: 0, varAdd: 0, fcTotal: 0, leaderAdd: 0 }
    const checkedFactors = roleFactors.filter(f => checked.has(f.id))
    const varAdd = checkedFactors.reduce((s, f) => s + f.add_price, 0)
    const payAdd = checkedFactors.reduce((s, f) => s + f.add_pay_price, 0)
    const fcTotal = (role.fixed_costs || []).reduce((s, f) => s + f.a, 0)
    const leaderAdd = isLeader ? role.leader_bonus : 0
    const sub = role.base_price + varAdd + fcTotal + leaderAdd
    const mgmt = Math.round(sub * 0.06)
    const profit = Math.round((sub + mgmt) * 0.10)
    const client = sub + mgmt + profit
    const crew = role.pay_price + payAdd
    return { crew, client, margin: client - crew, sub, mgmt, profit, varAdd, fcTotal, leaderAdd }
  }
  const P = calcPrice()
  const marginPct = P.client > 0 ? Math.round((P.margin / P.client) * 100) : 0

  // ── 인라인 편집 + 이력 기록 ────────────────────────────────
  function startEdit(table: EditTarget['table'], id: string, field: string, currentVal: unknown) {
    setEditing({ table, id, field, value: currentVal === null || currentVal === undefined ? '' : String(currentVal) })
  }

  async function saveEdit() {
    if (!editing) return
    if (!changer.trim()) { toast.error('수정자 이름을 먼저 입력해 주세요'); return }
    const { table, id, field, value } = editing

    const list = table === 'roles' ? roles : table === 'factors' ? factors : guides
    const original = (list as { id: string }[]).find(r => r.id === id) as Record<string, unknown> | undefined
    if (!original) return
    const oldVal = original[field]

    let parsedVal: unknown = value
    if (NUMBER_FIELDS.has(field)) {
      parsedVal = value === '' ? 0 : Number(value)
      if (isNaN(parsedVal as number)) { toast.error('숫자 형식이 올바르지 않습니다.'); return }
    } else if (value === '') {
      parsedVal = null
    }

    try {
      await db.update(table, id, { [field]: parsedVal })
      await db.insert('pricing_history', {
        table_name: table, row_id: id, field_name: field,
        old_value: oldVal === null || oldVal === undefined ? null : String(oldVal),
        new_value: parsedVal === null ? null : String(parsedVal),
        changed_by: changer.trim(),
      })
      if (table === 'roles') setRoles(prev => prev.map(r => r.id === id ? { ...r, [field]: parsedVal } : r))
      if (table === 'factors') setFactors(prev => prev.map(r => r.id === id ? { ...r, [field]: parsedVal } : r))
      if (table === 'guides') setGuides(prev => prev.map(r => r.id === id ? { ...r, [field]: parsedVal } : r))
      toast.success('저장됐습니다.')
      setEditing(null)
    } catch {
      toast.error('저장 실패')
    }
  }

  async function togglePublished(r: RoleRow) {
    if (!changer.trim()) { toast.error('수정자 이름을 먼저 입력해 주세요'); return }
    const next = !r.is_published
    try {
      await db.update('roles', r.id, { is_published: next })
      await db.insert('pricing_history', {
        table_name: 'roles', row_id: r.id, field_name: 'is_published',
        old_value: String(r.is_published), new_value: String(next), changed_by: changer.trim(),
      })
      setRoles(prev => prev.map(x => x.id === r.id ? { ...x, is_published: next } : x))
      toast.success(next ? '발행됨 — 견적서 작성 화면에 노출됩니다.' : '발행 취소됨 — 견적서 작성 화면에서 숨겨집니다.')
    } catch {
      toast.error('저장 실패')
    }
  }

  // ── 편집 가능한 값 렌더 (클릭하면 인라인 편집) ─────────────
  function EditableValue({ table, id, field, value, suffix = '' }: { table: EditTarget['table']; id: string; field: string; value: unknown; suffix?: string }) {
    const isEditingThis = editing && editing.table === table && editing.id === id && editing.field === field
    if (isEditingThis) {
      return (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={editing.value}
            onChange={e => setEditing(prev => prev ? { ...prev, value: e.target.value } : null)}
            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null) }}
            className="border border-blue-400 rounded px-1.5 py-0.5 text-sm w-28 focus:outline-none"
          />
          <button onClick={saveEdit} className="text-blue-600 hover:text-blue-800"><Save className="h-3.5 w-3.5" /></button>
        </span>
      )
    }
    return (
      <button
        onClick={() => startEdit(table, id, field, value)}
        className="underline decoration-dotted decoration-gray-300 hover:decoration-blue-400 hover:text-blue-600 text-left"
        title="클릭해서 수정"
      >
        {NUMBER_FIELDS.has(field) ? fmt(value as number) : String(value ?? '—')}{suffix}
      </button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex flex-col" style={{ zIndex: 9999 }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-rose-700 to-orange-700 shrink-0">
        <div>
          <h2 className="text-lg font-extrabold text-white">💰 가디어스 단가 시뮬레이터</h2>
          <p className="text-rose-100 text-xs mt-0.5">11개 직종 견적 계산 · 단가 편집 · 시장 단가 비교 (스마트연구소 · BETA)</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadAll} disabled={loading} className="text-rose-100 hover:text-white p-1.5 rounded-lg disabled:opacity-40">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={onClose} className="text-rose-100 hover:text-white p-1.5 rounded-lg"><X className="h-5 w-5" /></button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden bg-gray-50">
        {/* 좌측: 직종 선택 */}
        <div className="w-56 shrink-0 bg-white border-r border-gray-200 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-400 text-sm">불러오는 중...</div>
          ) : roles.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-xs">데이터가 없습니다.<br />마이그레이션 시드가 적용됐는지 확인해 주세요.</div>
          ) : (
            <nav className="py-2">
              {roles.map(r => {
                const m = JOB_META[r.role_code]
                return (
                  <button
                    key={r.id}
                    onClick={() => selectRole(r.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                      selectedRoleId === r.id ? 'bg-rose-50 border-l-4 border-rose-500 font-semibold' : 'border-l-4 border-transparent hover:bg-gray-50'
                    }`}
                  >
                    <span>{m?.emoji || '👤'}</span>
                    <span className="flex-1 truncate">{r.role_name}</span>
                    {!r.is_published && <span className="text-[10px] bg-gray-200 text-gray-500 rounded px-1.5 py-0.5">초안</span>}
                  </button>
                )
              })}
            </nav>
          )}
        </div>

        {/* 우측: 본문 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {role && (
            <>
              {/* 탭 */}
              <div className="flex items-center gap-1 px-4 pt-3 bg-white border-b border-gray-200 shrink-0">
                <TabBtn active={tab === 'calc'} onClick={() => setTab('calc')} icon={<Calculator className="h-3.5 w-3.5" />} label="견적 계산" />
                <TabBtn active={tab === 'edit'} onClick={() => setTab('edit')} icon={<Pencil className="h-3.5 w-3.5" />} label="단가 편집" />
                <TabBtn active={tab === 'market'} onClick={() => setTab('market')} icon={<BarChart3 className="h-3.5 w-3.5" />} label="시장 단가" />
                <div className="flex-1" />
                <label className={`text-xs px-2.5 py-1.5 rounded-full font-semibold ${role.is_published ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                  {role.is_published ? '발행됨 (견적서에 노출)' : '초안 (견적서 미노출)'}
                </label>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {tab === 'calc' && (
                  <div className="max-w-2xl space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{meta?.emoji}</span>
                      <h3 className="text-base font-bold text-gray-800">{role.role_name}</h3>
                      {meta && <span className="text-xs rounded-full px-2 py-0.5" style={{ background: meta.cb, color: meta.cc }}>{meta.cat}</span>}
                    </div>
                    {meta && (
                      <div className="text-sm text-gray-600 bg-white border border-gray-200 rounded-xl p-3 space-y-1">
                        <p>{meta.what}</p>
                        <p className="text-amber-700 bg-amber-50 rounded px-2 py-1 text-xs">⚠️ {meta.confuse}</p>
                      </div>
                    )}

                    {role.leader_bonus > 0 && (
                      <label className="flex items-center gap-2 text-sm bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 cursor-pointer">
                        <input type="checkbox" checked={isLeader} onChange={() => setIsLeader(v => !v)} />
                        팀장·수퍼바이저 배정 (+{fmt(role.leader_bonus)}원)
                      </label>
                    )}

                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 text-xs">
                          <tr><th className="w-8 py-2"></th><th className="text-left py-2">레벨</th><th className="text-left py-2">가산 옵션</th><th className="text-right py-2 pr-3">단가 영향</th></tr>
                        </thead>
                        <tbody>
                          {roleFactors.length === 0 && (
                            <tr><td colSpan={4} className="text-center text-gray-400 text-xs py-4">등록된 가산 옵션이 없습니다.</td></tr>
                          )}
                          {roleFactors.map(f => (
                            <tr key={f.id} className={checked.has(f.id) ? 'bg-rose-50/60' : ''}>
                              <td className="text-center"><input type="checkbox" checked={checked.has(f.id)} onChange={() => toggleFactor(f.id)} /></td>
                              <td className="py-1.5"><LevelBadge level={f.level} /></td>
                              <td className="py-1.5">
                                {f.factor_name}
                                {f.alert && <span className="ml-1.5 text-[10px] bg-red-100 text-red-600 rounded px-1.5 py-0.5">{f.alert}</span>}
                              </td>
                              <td className="text-right pr-3 py-1.5 font-semibold text-gray-700">+{fmt(f.add_price)}원</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="grid grid-cols-3 gap-3 text-center mb-4">
                        <div>
                          <div className="text-xs text-gray-400">크루 지급 단가</div>
                          <div className="text-lg font-extrabold text-gray-800">{fmt(P.crew)}원</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400">클라이언트 청구가</div>
                          <div className="text-lg font-extrabold text-emerald-600">{fmt(P.client)}원</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-400">예상 마진</div>
                          <div className="text-lg font-extrabold text-gray-800">{fmt(P.margin)}원 <span className="text-xs text-gray-400">({marginPct}%)</span></div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 space-y-0.5 border-t border-gray-100 pt-3">
                        <Row label="기본 단가" val={role.base_price} />
                        {P.leaderAdd > 0 && <Row label="팀장 가산" val={P.leaderAdd} />}
                        {P.varAdd > 0 && <Row label="옵션 가산 합계" val={P.varAdd} />}
                        {(role.fixed_costs || []).map((fc, i) => <Row key={i} label={`${fc.l} (고정 원가)`} val={fc.a} />)}
                        <Row label="소계" val={P.sub} bold />
                        <Row label="일반관리비 (6%)" val={P.mgmt} />
                        <Row label="이익 (10%)" val={P.profit} />
                        <Row label="최종 청구가 (VAT 별도)" val={P.client} bold big />
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-400">수치는 팀이 스마트연구소에서 직접 입력·관리하는 참고값입니다. VAT 별도.</p>
                  </div>
                )}

                {tab === 'edit' && (
                  <div className="max-w-3xl space-y-4">
                    <ChangerInput changer={changer} setChanger={setChanger} />
                    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-gray-700">{role.role_name} — 기본 단가</h4>
                        <button
                          onClick={() => togglePublished(role)}
                          className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold ${
                            role.is_published ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                          }`}
                        >
                          <ShieldAlert className="h-3.5 w-3.5" />
                          {role.is_published ? '발행됨 · 클릭해서 초안으로' : '초안 · 클릭해서 발행'}
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <Field label="클라이언트 청구 기본가">
                          <EditableValue table="roles" id={role.id} field="base_price" value={role.base_price} suffix="원" />
                        </Field>
                        <Field label="크루 지급 기본가">
                          <EditableValue table="roles" id={role.id} field="pay_price" value={role.pay_price} suffix="원" />
                        </Field>
                        <Field label="팀장 가산">
                          <EditableValue table="roles" id={role.id} field="leader_bonus" value={role.leader_bonus} suffix="원" />
                        </Field>
                      </div>
                      {(role.fixed_costs || []).length > 0 && (
                        <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
                          고정 원가: {role.fixed_costs.map(fc => `${fc.l} ${fmt(fc.a)}원`).join(' · ')} (편집은 후속 작업)
                        </p>
                      )}
                    </div>

                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 text-xs">
                          <tr><th className="text-left py-2 pl-3">레벨</th><th className="text-left py-2">옵션명</th><th className="text-right py-2">청구가 가산</th><th className="text-right py-2">지급가 가산</th><th className="text-left py-2 pr-3">경고</th></tr>
                        </thead>
                        <tbody>
                          {roleFactors.map(f => (
                            <tr key={f.id} className="border-t border-gray-100">
                              <td className="py-2 pl-3"><LevelBadge level={f.level} /></td>
                              <td className="py-2">{f.factor_name}</td>
                              <td className="py-2 text-right"><EditableValue table="factors" id={f.id} field="add_price" value={f.add_price} suffix="원" /></td>
                              <td className="py-2 text-right"><EditableValue table="factors" id={f.id} field="add_pay_price" value={f.add_pay_price} suffix="원" /></td>
                              <td className="py-2 pr-3"><EditableValue table="factors" id={f.id} field="alert" value={f.alert ?? ''} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {tab === 'market' && (
                  <div className="max-w-2xl space-y-4">
                    <ChangerInput changer={changer} setChanger={setChanger} />
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <h4 className="text-sm font-bold text-gray-700 mb-3">{role.role_name} — 시장 단가 비교</h4>
                      {roleGuide ? (
                        <div className="space-y-3 text-sm">
                          <div className="grid grid-cols-2 gap-4">
                            <Field label="지킴 (경쟁사) 단가">
                              <EditableValue table="guides" id={roleGuide.id} field="competitor_price" value={roleGuide.competitor_price} suffix="원" />
                            </Field>
                            <Field label="시장 평균">
                              <EditableValue table="guides" id={roleGuide.id} field="market_avg_price" value={roleGuide.market_avg_price} suffix="원" />
                            </Field>
                          </div>
                          <Field label="비고 / 조사 메모">
                            <EditableValue table="guides" id={roleGuide.id} field="consult_points" value={roleGuide.consult_points ?? ''} />
                          </Field>
                          <Field label="과거 체결가 (참고)">
                            <EditableValue table="guides" id={roleGuide.id} field="past_contract_price" value={roleGuide.past_contract_price} suffix="원" />
                          </Field>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">이 직종은 아직 시장 데이터가 없습니다. (원본 자료에 경쟁사 공개 단가가 제한적인 직종)</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
        active ? 'border-rose-600 text-rose-700' : 'border-transparent text-gray-400 hover:text-gray-600'
      }`}
    >
      {icon}{label}
    </button>
  )
}

function LevelBadge({ level }: { level: string }) {
  const cls = level === '★★' ? 'bg-red-100 text-red-600' : level === '★' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
  return <span className={`text-[11px] font-bold rounded px-1.5 py-0.5 ${cls}`}>{level}</span>
}

function Row({ label, val, bold = false, big = false }: { label: string; val: number; bold?: boolean; big?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? 'font-bold text-gray-700' : ''} ${big ? 'text-sm pt-1' : ''}`}>
      <span>{label}</span><span>{val < 0 ? '' : '+'}{fmt(val)}원</span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="font-semibold text-gray-700">{children}</div>
    </div>
  )
}

function ChangerInput({ changer, setChanger }: { changer: string; setChanger: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
      <span className="text-xs font-semibold text-blue-700 shrink-0">수정자 *</span>
      <input
        value={changer}
        onChange={e => setChanger(e.target.value)}
        placeholder="이름을 입력해야 저장 및 발행이 가능합니다"
        className="flex-1 bg-white border border-blue-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-400"
      />
    </div>
  )
}
