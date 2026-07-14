'use client'

import { useMemo, useState } from 'react'
import type { Inquiry, Assignment } from '@/lib/supabase/types'
import { X, Copy, Check, Crown } from 'lucide-react'
import { toast } from 'sonner'

// 단톡방 공지문 생성기 — 배정 확정된 크루 명단 + 행사 정보를 사장님이 쓰던 형식 그대로 뽑아
// 원클릭 복사 → 카카오 단톡방에 붙여넣는다. (카카오는 외부 자동 게시가 불가하므로 "작성+복사"가 최선)

interface Props {
  inquiry: Inquiry
  assignments: Assignment[]
  onClose: () => void
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// 'YYYY-MM-DD' → 로컬 Date (UTC 밀림 방지)
function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtMd(s: string): string {
  const d = parseYmd(s)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}
function fmtMdDow(s: string): string {
  const d = parseYmd(s)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`
}

export default function AnnounceModal({ inquiry, assignments, onClose }: Props) {
  // ── 근무일 후보: 행사 기간(start~end) + 배정의 work_dates 합집합 ──
  const dateOptions = useMemo(() => {
    const set = new Set<string>()
    if (inquiry.event_start) {
      const start = parseYmd(inquiry.event_start)
      const end = parseYmd(inquiry.event_end || inquiry.event_start)
      for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) set.add(ymd(d))
    }
    assignments.forEach(a => (a.work_dates || []).forEach(wd => wd && set.add(wd)))
    return Array.from(set).sort()
  }, [inquiry, assignments])

  const todayStr = ymd(new Date())
  const defaultDate = dateOptions.find(d => d >= todayStr) || dateOptions[0] || inquiry.event_start || ''

  const [workDate, setWorkDate] = useState(defaultDate)
  const [siteName, setSiteName] = useState(inquiry.location || inquiry.event_name || '')
  const [mapLink, setMapLink] = useState('')
  const [special, setSpecial] = useState('')
  const [attire, setAttire] = useState(
    inquiry.attire && inquiry.attire !== '미정' ? inquiry.attire : ''
  )
  const [contact, setContact] = useState('')
  const [gatherMin, setGatherMin] = useState('10')
  const [workTime, setWorkTime] = useState(inquiry.event_time || '')
  const [copied, setCopied] = useState(false)

  // ── 선택 근무일의 크루 (취소 제외, 해당일 근무자만, 이름 중복 제거) ──
  const crew = useMemo(() => {
    const seen = new Set<string>()
    return assignments.filter(a => {
      if (a.status === '취소') return false
      const name = (a.staff_name || '').trim()
      if (!name) return false
      const worksThisDay = !a.work_dates || a.work_dates.length === 0 || a.work_dates.includes(workDate)
      if (!worksThisDay) return false
      if (seen.has(name)) return false
      seen.add(name)
      return true
    })
  }, [assignments, workDate])

  // ── 팀장 지정 (초기값: role_type === '팀장') ──
  const [leaders, setLeaders] = useState<Set<string>>(() => {
    const s = new Set<string>()
    assignments.forEach(a => { if (a.role_type === '팀장' && a.staff_name) s.add(a.staff_name.trim()) })
    return s
  })
  function toggleLeader(name: string) {
    setLeaders(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

  const startTime = workTime.split('~')[0].trim()

  // ── 공지문 생성 ──
  const message = useMemo(() => {
    const leaderNames = crew.map(c => c.staff_name!.trim()).filter(n => leaders.has(n))
    const subNames = crew.map(c => c.staff_name!.trim()).filter(n => !leaders.has(n))

    const period = inquiry.event_start
      ? (inquiry.event_end && inquiry.event_end !== inquiry.event_start
          ? `${fmtMd(inquiry.event_start)} ~ ${fmtMd(inquiry.event_end)}`
          : fmtMd(inquiry.event_start))
      : ''

    const lines: string[] = []
    lines.push(startTime ? `오늘 ${startTime} 시작입니다!☺️` : `오늘 근무 안내입니다!☺️`)
    if (special.trim()) lines.push(`☆${special.trim()}☆`)
    lines.push('출근자들 글을 꾹 눌러 체크 부탁드립니다:)')
    lines.push('')
    if (siteName.trim()) lines.push(`[${siteName.trim()}]`)
    if (mapLink.trim()) lines.push(mapLink.trim())
    if (period) lines.push(`[${period}]`)
    lines.push('')
    if (workDate) lines.push(`📌 ${fmtMdDow(workDate)}`)
    if (workTime.trim()) lines.push(`⏰ 근무 시간: ${workTime.trim()} ⏰`)
    if (gatherMin.trim()) lines.push(` - ${gatherMin.trim()}분전 집결 부탁드립니다 :)`)
    lines.push('')
    lines.push(`👥 투입 인원: ${crew.length}명`)
    leaderNames.forEach(n => lines.push(`@${n} 팀장`))
    if (subNames.length) lines.push(subNames.map(n => `@${n}`).join(' '))
    if (attire.trim()) {
      lines.push('')
      lines.push(`복장 : ${attire.trim()}`)
    }
    if (contact.trim()) {
      lines.push('')
      lines.push(`도착하시면 ${contact.trim()}으로 전화주세요 :)`)
    }
    return lines.join('\n')
  }, [crew, leaders, startTime, special, siteName, mapLink, workDate, inquiry, gatherMin, attire, contact, workTime])

  async function copy() {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      toast.success('복사됐습니다 — 단톡방에 붙여넣으세요')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('복사 실패 — 아래 문구를 직접 선택해 복사해주세요')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4" style={{ zIndex: 9999 }} onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-gradient-to-r from-amber-500 to-orange-500 shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">📢 단톡방 공지문 생성</h2>
            <p className="text-amber-50 text-xs mt-0.5">{inquiry.company_name} · {inquiry.event_name}</p>
          </div>
          <button onClick={onClose} className="text-amber-50 hover:text-white p-1"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2">
          {/* 좌: 입력 */}
          <div className="p-4 space-y-3 border-r border-gray-100">
            <Field label="근무일">
              <select
                value={workDate}
                onChange={e => setWorkDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-amber-400"
              >
                {dateOptions.length === 0 && <option value="">일정 미정</option>}
                {dateOptions.map(d => <option key={d} value={d}>{fmtMdDow(d)}</option>)}
              </select>
            </Field>

            <Field label="현장명 (자동)">
              <input value={siteName} onChange={e => setSiteName(e.target.value)} className={inputCls} placeholder="현장·장소명" />
            </Field>

            <Field label="네이버 지도 링크">
              <input value={mapLink} onChange={e => setMapLink(e.target.value)} className={inputCls} placeholder="https://naver.me/... (붙여넣기)" />
            </Field>

            <Field label="특별 안내 (선택)">
              <input value={special} onChange={e => setSpecial(e.target.value)} className={inputCls} placeholder="예: 개인텀블러 꼭 지참 부탁드려요" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="집결 (분 전)">
                <input value={gatherMin} onChange={e => setGatherMin(e.target.value)} className={inputCls} placeholder="10" />
              </Field>
              <Field label="근무시간">
                <input value={workTime} onChange={e => setWorkTime(e.target.value)} className={inputCls} placeholder="예: 10:00 ~ 18:00" />
              </Field>
            </div>

            <Field label="복장">
              <input value={attire} onChange={e => setAttire(e.target.value)} className={inputCls} placeholder="예: 개인청바지 + 유니폼 제공" />
            </Field>

            <Field label="도착 연락처">
              <input value={contact} onChange={e => setContact(e.target.value)} className={inputCls} placeholder="예: 010-0000-0000" />
            </Field>

            {/* 팀장 지정 */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1.5">
                크루 {crew.length}명 — 팀장 지정 <span className="text-gray-400 font-normal">(체크하면 맨 위 · &quot;팀장&quot; 표기)</span>
              </p>
              {crew.length === 0 ? (
                <p className="text-xs text-gray-400">이 날짜에 배정된 크루가 없습니다.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {crew.map(c => {
                    const name = c.staff_name!.trim()
                    const isLeader = leaders.has(name)
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleLeader(name)}
                        className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 transition-colors ${
                          isLeader
                            ? 'bg-amber-100 border-amber-300 text-amber-700 font-semibold'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {isLeader && <Crown className="h-3 w-3" />}
                        {name}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 우: 미리보기 */}
          <div className="p-4 bg-gray-50 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500">미리보기</p>
              <button
                onClick={copy}
                className="flex items-center gap-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? '복사됨' : '복사하기'}
              </button>
            </div>
            <pre className="flex-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-gray-800 bg-white border border-gray-200 rounded-xl p-3.5 font-sans overflow-y-auto">
              {message}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-amber-400'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
