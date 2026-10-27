'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import * as XLSX from 'xlsx'
import { db } from '@/lib/supabase/api'
import type { Inquiry, Assignment, Payout, Settlement, EventExpense, FieldLog, Role, Factor } from '@/lib/supabase/types'
import { formatKRW, formatDate } from '@/lib/utils'
import { isHeadOfficeAssignment } from '@/lib/finance'
import { overtimeRateFor, describeOvertime } from '@/lib/overtime'
import PayoutForm, { type PayoutPrefill } from './PayoutForm'
import BulkPayoutModal from './BulkPayoutModal'
import ExpensesSection from './ExpensesSection'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Search, Users, Wallet, CheckCircle2, Clock,
  AlertCircle, Plus, PencilLine, Trash2, Building2,
  UserX, Download, ChevronRight, Layers, Receipt,
} from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

// 구간별 단가 파싱 유틸
interface PaySegment { rate: number; days: number }
function parseSegments(memo?: string | null): PaySegment[] | null {
  if (!memo) return null
  try {
    const p = JSON.parse(memo)
    if (Array.isArray(p.segments) && p.segments.length > 0) return p.segments
  } catch {}
  return null
}
function segmentTotal(segs: PaySegment[]) {
  return segs.reduce((s, seg) => s + (seg.rate || 0) * (seg.days || 1), 0)
}
// payout.notes에서 구간 추출
function parseNotesSegments(notes?: string | null): PaySegment[] | null {
  if (!notes) return null
  try {
    const p = JSON.parse(notes)
    if (p && typeof p === 'object' && Array.isArray(p.segments) && p.segments.length > 0) return p.segments
  } catch {}
  return null
}
// payout.notes에서 메모 텍스트만 추출
function parseNotesMemo(notes?: string | null): string {
  if (!notes) return ''
  try {
    const p = JSON.parse(notes)
    if (p && typeof p === 'object' && Array.isArray(p.segments)) return p.memo || ''
  } catch {}
  return notes
}

// 무급 인원 감지 — 본사 판정은 lib/finance.ts 한 곳(isHeadOfficeAssignment)을 쓴다
function isHQ(a: Assignment) {
  return a.is_payable === false || isHeadOfficeAssignment(a)
}

// 배정완료 → 완료 자동 전환
// 조건: ① 배정 1명 이상 ② 행사종료 후 5일 경과 ③ 유급 전인원 지급검토완료 이상 (본사 전원이면 ③ 자동충족)
async function tryAutoComplete(inq: Inquiry, assignList: Assignment[], payoutList: Payout[]): Promise<boolean> {
  if (inq.status !== '배정완료' || !inq.event_end) return false
  const fiveDaysAfter = new Date(inq.event_end)
  fiveDaysAfter.setDate(fiveDaysAfter.getDate() + 5)
  if (new Date() < fiveDaysAfter) return false
  const inqPayouts = payoutList.filter(p => p.inquiry_id === inq.id)
  const inqAssigns = assignList.filter(a => a.inquiry_id === inq.id && isActiveAssignment(a, inqPayouts))
  if (!inqAssigns.length) return false
  const payableLeaders = inqAssigns.filter(a => !isHQ(a) && a.role_type !== '팀원')
  if (payableLeaders.length > 0) {
    const ids = new Set(payableLeaders.map(a => a.id))
    const pays = inqPayouts.filter(p => ids.has(p.assignment_id || ''))
    if (pays.length < payableLeaders.length) return false // 미등록 인원 있음
    if (!pays.every(p => ['검토완료', '확인완료', '완료', '지급완료'].includes(p.status))) return false
  }
  await db.update('inquiries', inq.id, { status: '완료' })
  toast.success(`${inq.company_name} — 조건 충족으로 자동 완료 처리되었습니다.`, { duration: 5000 })
  return true
}

const STATUS_STYLE: Record<string, string> = {
  '대기':     'bg-amber-100 text-amber-700 border border-amber-200',
  '확인완료': 'bg-blue-100 text-blue-700 border border-blue-200',
  '검토완료': 'bg-blue-100 text-blue-700 border border-blue-200',
  '완료':     'bg-green-100 text-green-700 border border-green-200',
  '지급완료': 'bg-green-100 text-green-700 border border-green-200',
  '미지급':   'bg-red-100 text-red-600 border border-red-200',
  '보류':     'bg-gray-100 text-gray-600 border border-gray-200',
}
const STATUS_LABEL: Record<string, string> = {
  '대기': '대기', '확인완료': '검토완료', '검토완료': '검토완료',
  '완료': '입금완료', '지급완료': '입금완료', '미지급': '미지급', '보류': '보류',
}

function isDone(p: Payout) { return p.status === '완료' || p.status === '지급완료' }

// 지급 대상이 되는 배정인지 — 취소된 사람은 아니고, 후보는 지급 기록이 있을 때만이다.
// 취소 제외는 lib/finance.ts·출석부와 같은 기준. 옛 행사에 후보로 남은 사람이 45명이나 되는데
// 이들을 '미등록'으로 세면 끝난 행사가 처리필요로 올라오고, 반대로 무조건 빼면
// 후보 상태 그대로 지급까지 끝난 옛 행사(3건)가 지급할 사람이 없는 처리필요가 된다.
function isActiveAssignment(a: Assignment, payouts: Payout[]) {
  if (a.status === '취소') return false
  if (a.status === '후보') return payouts.some(p => p.assignment_id === a.id)
  return true
}
function isPending(p: Payout) { return !isDone(p) }

function groupByInquiry(inquiries: Inquiry[], assignments: Assignment[], payouts: Payout[]) {
  return inquiries.map(inq => {
    const inqPayouts     = payouts.filter(p => p.inquiry_id === inq.id)
    const inqAssigns     = assignments.filter(a => a.inquiry_id === inq.id && isActiveAssignment(a, inqPayouts))
    const hqAssigns      = inqAssigns.filter(isHQ)
    const payableAssigns = inqAssigns.filter(a => !isHQ(a))
    const payableLeaders = payableAssigns.filter(a => a.role_type !== '팀원')

    const totalFinal     = inqPayouts.reduce((s, p) => s + (p.final_pay || 0), 0)
    const unregistered   = payableLeaders.filter(a => !inqPayouts.find(p => p.assignment_id === a.id)).length

    // 지급 상태는 외부(유급) 인원의 지급 기록만 기준으로 판단
    // → 본사 인원 지급 기록 무시, 미등록 인원(후보 미확정)도 무시
    const payableLeaderIds = new Set(payableLeaders.map(a => a.id))
    const payablePayouts   = inqPayouts.filter(p => payableLeaderIds.has(p.assignment_id || ''))
    const pendingCount     = payablePayouts.filter(p => p.status === '대기').length
    const confirmedCount   = payablePayouts.filter(p => p.status === '검토완료' || p.status === '확인완료').length
    const paidCount        = payablePayouts.filter(isDone).length

    // 처리 상태 판단
    const isHqOnly = inqAssigns.length > 0 && payableLeaders.length === 0

    // 완료 조건: 유급 인원이 전부 지급 등록돼 있고, 그 기록이 전부 입금완료.
    // 예전엔 '등록된 기록만' 봐서 8명 중 4명만 등록·입금해도 지급완료 탭으로 넘어갔다.
    // 후보·취소는 isActiveAssignment에서 이미 뺐으므로 여기서 미등록은 진짜 미등록이다.
    const allRegisteredPaid = payablePayouts.length > 0 && payablePayouts.every(isDone)
    const allDone           = isHqOnly || (allRegisteredPaid && unregistered === 0)
    const needsAction       = !isHqOnly && !allDone

    return {
      inq, inqAssigns, hqAssigns, payableAssigns, payableLeaders, inqPayouts,
      totalFinal, pendingCount, confirmedCount, paidCount, unregistered,
      isHqOnly, allDone, needsAction,
    }
  })
}

type LeftTab = 'pending' | 'done'

export default function PayoutsContent() {
  const [inquiries, setInquiries]     = useState<Inquiry[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [payouts, setPayouts]         = useState<Payout[]>([])
  const [expenses, setExpenses]       = useState<EventExpense[]>([])
  // event_expenses 테이블 존재 여부 — 010 마이그레이션 실행 전이면 false
  const [expensesReady, setExpensesReady] = useState(true)
  const [loading, setLoading]         = useState(false)
  const [search, setSearch]           = useState('')
  const [leftTab, setLeftTab]         = useState<LeftTab>('pending')
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [formOpen, setFormOpen]       = useState(false)
  const [formAssignment, setFormAssignment] = useState<Assignment | null>(null)
  const [formPayout, setFormPayout]   = useState<Payout | null>(null)
  const [bulkOpen, setBulkOpen]       = useState(false)
  // 현장 기록 대기함에서 "지급에 반영"으로 넘어온 경우: ?inquiry=<문의id>&fromLog=<기록id>
  // 그 행사를 고르고, 기록의 사람이 명단에 있으면 지급 폼을 금액이 채워진 채 연다.
  // 이름이 없거나('전원') 안 맞으면 행사만 열어 두고, 사람을 고를 때마다 금액을 채운다.
  // 저장되면 기록을 '지급 반영'으로 표시한다 — 기록 자체는 돈을 쓰지 않는다
  const searchParams = useSearchParams()
  const [pendingLog, setPendingLog] = useState<FieldLog | null>(null)
  const [rateTables, setRateTables] = useState<{ roles: Role[]; factors: Factor[] }>({ roles: [], factors: [] })
  const deepLinkDone = useRef(false)

  // 기록 금액이 있으면 그대로. 연장인데 금액이 없고 시간만 있으면 직무표에서 제안 단가(lib/overtime)
  const prefillOf = (log: FieldLog | null, asgn?: Assignment | null): PayoutPrefill | null => {
    if (!log) return null
    const memo = `[현장기록 ${log.log_date || log.created_at.slice(0, 10)}] ${log.content}`
    if (log.kind === '연장') {
      if (log.amount) return { overtime_pay: log.amount, memo }
      const hours = log.hours && log.hours > 0 ? log.hours : 0
      const rate = hours ? overtimeRateFor(asgn?.job_type, rateTables.roles, rateTables.factors) : null
      if (rate) {
        const amt = rate.payHourly * hours
        return { overtime_pay: amt, memo: `${memo}\n제안 ${amt.toLocaleString()}원 = ${describeOvertime(rate, hours, 'pay')}${rate.assumed ? ' ※확인 필요' : ''}` }
      }
      return { memo: `${memo} (금액 없음 — 직접 입력)` }
    }
    if (log.kind === '추가지급') return { bonus: log.amount || 0, memo }
    return { memo }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [inqList, assignList, payoutList, expenseList] = await Promise.all([
        db.list<Inquiry>('inquiries', { order: 'event_start', asc: false }),
        db.list<Assignment>('assignments', { order: 'assigned_at', asc: false }),
        db.list<Payout>('payouts', { order: 'created_at', asc: false }),
        // 010 마이그레이션 전이면 테이블이 없다 — 부대비용 때문에 지급관리가
        // 통째로 안 열리면 안 되므로 실패해도 null 로 넘어간다.
        // null(테이블 없음)과 []( 지출 0건)은 구분해야 안내 배너를 띄울 수 있다.
        db.list<EventExpense>('event_expenses', { order: 'created_at', asc: true }).catch(() => null),
      ])
      setExpenses(expenseList ?? [])
      setExpensesReady(expenseList !== null)
      const PAYOUT_STATUSES = ['체결', '배정완료', '진행중', '완료', '정산완료']
      const filtered = inqList.filter(inq => PAYOUT_STATUSES.includes(inq.status))
      setInquiries(filtered)
      setAssignments(assignList)
      setPayouts(payoutList)
      // 배정완료 → 완료 자동 전환 체크 (페이지 로드 시)
      const candidates = filtered.filter(inq => inq.status === '배정완료' && inq.event_end)
      const results = await Promise.all(candidates.map(inq => tryAutoComplete(inq, assignList, payoutList)))
      if (results.some(Boolean)) {
        const updated = await db.list<Inquiry>('inquiries', { order: 'event_start', asc: false })
        setInquiries(updated.filter(inq => PAYOUT_STATUSES.includes(inq.status)))
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // 현장 기록 → 지급: 목록이 뜬 뒤 한 번만
  useEffect(() => {
    const inqId = searchParams.get('inquiry'), logId = searchParams.get('fromLog')
    if (deepLinkDone.current || !inqId || inquiries.length === 0) return
    deepLinkDone.current = true
    if (!inquiries.some(i => i.id === inqId)) { toast.error('그 행사를 지급 관리에서 찾을 수 없습니다 (체결 전이거나 취소된 건).'); return }
    setSelectedId(inqId)
    if (!logId) return
    ;(async () => {
      const [rows, roles, factors] = await Promise.all([
        db.list<FieldLog>('field_logs', { filters: { id: logId }, limit: 1 }).catch(() => [] as FieldLog[]),
        db.list<Role>('roles').catch(() => [] as Role[]),
        db.list<Factor>('factors').catch(() => [] as Factor[]),
      ])
      setRateTables({ roles, factors })
      const log = rows[0]
      if (!log) { toast.error('그 현장 기록을 찾을 수 없습니다.'); return }
      setPendingLog(log)
      const name = (log.staff_name || '').replace(/\s/g, '')
      const inqAssigns = assignments.filter(a => a.inquiry_id === inqId && a.status !== '취소' && a.status !== '후보')
      const hit = name ? inqAssigns.filter(a => (a.staff_name || '').replace(/\s/g, '').includes(name)) : []
      if (hit.length === 1) {
        const a = hit[0]
        const inq = inquiries.find(i => i.id === inqId)
        setFormAssignment({ ...a, inquiry_id: inqId, event_name: inq?.event_name || '' } as Assignment)
        setFormPayout(payouts.find(p => p.assignment_id === a.id) || null)
        setFormOpen(true)
        toast.info(`${a.staff_name} 지급 폼에 현장 기록 "${log.content.slice(0, 30)}"을 채웠습니다. 확인 후 저장하세요.`, { duration: 7000 })
      } else {
        toast.info(name
          ? `"${log.staff_name}"과 맞는 배정이 ${hit.length}명입니다. 아래 명단에서 사람을 골라 지급을 열면 금액이 채워집니다.`
          : '기록에 이름이 없습니다. 아래 명단에서 사람을 골라 지급을 열면 금액이 채워집니다.', { duration: 8000 })
      }
    })()
  }, [inquiries, assignments, payouts, searchParams])

  // 지급 폼 저장 뒤: 현장 기록에서 온 것이면 기록을 '지급 반영'으로 표시
  async function handleFormSaved() {
    if (pendingLog && formAssignment) {
      const p = prefillOf(pendingLog, formAssignment)
      const what = p?.overtime_pay ? `연장수당 ${formatKRW(p.overtime_pay)}` : p?.bonus ? `기타수당 ${formatKRW(p.bonus)}` : '지급 메모'
      try {
        await db.update('field_logs', pendingLog.id, {
          applied_at: new Date().toISOString(), applied_to: '지급',
          applied_note: `${formAssignment.staff_name || ''} ${what}`.trim(),
        })
        toast.success('현장 기록을 "지급 반영"으로 표시했습니다.')
      } catch (e) { toast.error('기록 반영 표시 실패: ' + (e as Error).message) }
      setPendingLog(null)
    }
    load()
  }

  const grouped = groupByInquiry(inquiries, assignments, payouts)
  const searchLower = search.toLowerCase()
  const searchFiltered = grouped.filter(({ inq }) =>
    !searchLower ||
    (inq.company_name || '').toLowerCase().includes(searchLower) ||
    (inq.event_name || '').toLowerCase().includes(searchLower)
  )

  // 탭별 분류
  const pendingGroups = searchFiltered.filter(g => !g.allDone)
  const doneGroups    = searchFiltered.filter(g => g.allDone)
  const activeGroups  = leftTab === 'pending' ? pendingGroups : doneGroups

  const selectedGroup  = grouped.find(g => g.inq.id === selectedId)
  const selectedInquiry = selectedGroup?.inq

  const payableLeaders = (selectedGroup?.payableLeaders || [])
  const hqAssigns      = selectedGroup?.hqAssigns || []
  const currentPayouts = selectedGroup?.inqPayouts || []
  const unregistered   = (selectedGroup?.unregistered || 0)

  // 지급 미등록 유급 인원 — 일괄 지급등록 대상
  const unregisteredAssigns = payableLeaders.filter(
    a => !currentPayouts.find(p => p.assignment_id === a.id)
  )

  function getTeamMembers(teamCode: string | undefined) {
    if (!teamCode) return []
    return assignments.filter(a => a.team_code === teamCode && a.role_type === '팀원' && a.inquiry_id === selectedId)
  }

  const currentExpenses  = expenses.filter(e => e.inquiry_id === selectedId)
  const expenseTotal     = currentExpenses.reduce((s, e) => s + (e.amount || 0), 0)

  const payoutTotalFinal     = currentPayouts.reduce((s, p) => s + (p.final_pay || 0), 0)
  const payoutTotalBase      = currentPayouts.reduce((s, p) => s + (p.subtotal || 0), 0)
  const payoutTotalDeduction = currentPayouts.reduce((s, p) => s + (p.tax_deduction || 0), 0)

  // ── 정산완료 자동 전환: 인건비 전액 지급 + 입금완료 시 문의 상태 자동 변경 ──
  async function checkAndAutoSettle(inquiryId: string) {
    const inq = inquiries.find(i => i.id === inquiryId)
    if (inq?.status === '정산완료') return
    const setts = await db.list<Settlement>('settlements', { filters: { inquiry_id: inquiryId } })
    if (!setts.length) return
    const allDeposited = setts.every(s => s.deposit_status === '입금완료')
    if (!allDeposited) return
    await db.update('inquiries', inquiryId, { status: '정산완료' })
    toast.success('입금 및 인건비 지급 완료 — 자동으로 정산완료 처리되었습니다.', { duration: 5000 })
  }

  // CEO 지급 탭과 같은 값('지급완료' + paid_at)으로 남긴다. 예전엔 '완료'만 쓰고 paid_at을 비워
  // CEO 완료 이력에 입금일이 '-'로 나오고 기간 필터에서 빠졌다. 읽는 쪽은 모두 두 값을 다 받는다.
  const PAID = () => ({ status: '지급완료' as const, paid_at: new Date().toISOString() })

  async function handleSinglePaid(payoutId: string) {
    try {
      await db.update('payouts', payoutId, PAID())
      toast.success('입금완료로 처리했습니다.')
    } catch (e) {
      toast.error(`입금완료 처리 실패: ${(e as Error).message}`)
      return
    }
    if (selectedId) await checkAndAutoSettle(selectedId)
    load()
  }

  async function handleSingleConfirm(payoutId: string) {
    try {
      await db.update('payouts', payoutId, { status: '확인완료' })
      toast.success('검토완료로 처리했습니다.')
      load()
    } catch (e) {
      toast.error(`검토완료 처리 실패: ${(e as Error).message}`)
    }
  }

  // 등록된 '대기' 건을 검토완료로 올리기만 한다.
  // 미등록 인원을 여기서 자동 생성하지 않는다 — 금액을 아무도 보지 않은 채
  // '검토완료'가 되어버리고, 공제율도 고를 수 없기 때문. 등록은 '일괄 지급등록'이 담당.
  async function handleBulkConfirm() {
    if (!selectedGroup) return

    const toUpdate = currentPayouts.filter(p => p.status === '대기')
    const unregCount = unregisteredAssigns.length

    if (!toUpdate.length) {
      if (unregCount) {
        toast.warning(`검토할 대기 건이 없습니다. 미등록 ${unregCount}명은 '일괄 지급등록'으로 먼저 등록해 주세요.`, { duration: 6000 })
      } else {
        toast.info('검토할 지급 건이 없습니다.')
      }
      return
    }

    await Promise.all(toUpdate.map(p => db.update('payouts', p.id, { status: '확인완료' })))

    if (unregCount) {
      toast.warning(`${toUpdate.length}건 검토완료 — 미등록 ${unregCount}명이 남아 있습니다. '일괄 지급등록'을 눌러 주세요.`, { duration: 6000 })
    } else {
      toast.success(`전체 검토완료 (${toUpdate.length}건)`)
    }
    load()
  }

  async function handleBulkPaid() {
    const toPay = currentPayouts.filter(p => p.status === '검토완료' || p.status === '확인완료')
    if (!toPay.length) { toast.info('입금 처리할 검토완료 건이 없습니다.'); return }
    if (!confirm(`검토완료 ${toPay.length}건을 모두 입금완료로 바꾸겠습니까?`)) return
    try {
      await Promise.all(toPay.map(p => db.update('payouts', p.id, PAID())))
    } catch (e) {
      toast.error(`입금완료 처리 실패: ${(e as Error).message}`); load(); return
    }
    toast.success(`${toPay.length}건 입금 완료 처리`)
    if (selectedId) await checkAndAutoSettle(selectedId)
    load()
  }

  async function handleDelete(payout: Payout) {
    if (!confirm(`${payout.staff_name} 지급 기록을 삭제하겠습니까?`)) return
    await db.delete('payouts', payout.id)
    toast.success('삭제되었습니다.')
    load()
  }

  function openForm(assignment: Assignment, payout: Payout | null = null) {
    setFormAssignment({ ...assignment, inquiry_id: selectedId || '', event_name: selectedInquiry?.event_name || '' } as Assignment)
    setFormPayout(payout)
    setFormOpen(true)
  }

  function handleExportExcel() {
    const confirmed = currentPayouts.filter(p =>
      p.status === '확인완료' || p.status === '검토완료' || p.status === '완료' || p.status === '지급완료'
    )
    if (!confirmed.length) { toast.info('검토완료 상태 이상의 지급 건만 내보낼 수 있습니다.'); return }
    const eventName = selectedInquiry?.event_name || '행사'
    const dateStr = new Date().toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\. /g, '').replace('.', '')
    const rows = confirmed.map(p => ({
      '이름': p.staff_name || '', '은행': p.bank_name || '',
      '계좌번호': p.account_number || '', '이체금액': p.final_pay || 0,
      '메모': parseNotesMemo(p.notes) || `${eventName} ${p.dispatch_period || ''}`.trim(),
    }))
    rows.push({ '이름': `합계 (${rows.length}명)`, '은행': '', '계좌번호': '', '이체금액': rows.reduce((s, r) => s + r['이체금액'], 0), '메모': '' })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 30 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '이체목록')
    XLSX.writeFile(wb, `이체목록_${eventName}_${dateStr}.xlsx`)
    toast.success(`${confirmed.length}건 엑셀 다운로드 완료`)
  }

  return (
    <div className="flex h-full overflow-hidden bg-gray-50">

      {/* ─── 좌측: 행사 목록 패널 (50%) ─── */}
      <div className="w-1/2 shrink-0 border-r-2 border-gray-200 bg-white flex flex-col overflow-hidden shadow-sm">

        {/* 검색 */}
        <div className="p-3 border-b-2 border-gray-200 bg-gray-50">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <Input placeholder="행사명/의뢰처 검색" value={search}
              onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-sm" />
          </div>
        </div>

        {/* 탭 */}
        <div className="flex border-b-2 border-gray-200">
          <button
            onClick={() => setLeftTab('pending')}
            className={`flex-1 py-2.5 text-xs font-bold transition-colors ${leftTab === 'pending'
              ? 'bg-white text-blue-700 border-b-2 border-blue-500'
              : 'bg-gray-50 text-gray-500 hover:text-gray-700'}`}
          >
            처리 필요
            {pendingGroups.length > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-2xs rounded-full px-1.5 py-0.5">{pendingGroups.length}</span>
            )}
          </button>
          <button
            onClick={() => setLeftTab('done')}
            className={`flex-1 py-2.5 text-xs font-bold transition-colors ${leftTab === 'done'
              ? 'bg-white text-green-700 border-b-2 border-green-500'
              : 'bg-gray-50 text-gray-500 hover:text-gray-700'}`}
          >
            지급완료
            {doneGroups.length > 0 && (
              <span className="ml-1.5 bg-green-100 text-green-700 text-2xs rounded-full px-1.5 py-0.5">{doneGroups.length}</span>
            )}
          </button>
        </div>

        {/* 목록 */}
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="text-center text-xs text-gray-400 mt-8">로딩 중...</p>}

          <AnimatePresence mode="wait">
            <motion.div key={leftTab}
              initial={{ opacity: 0, x: leftTab === 'pending' ? -8 : 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="p-2">
              {activeGroups.length === 0 && !loading && (
                <div className="text-center py-12 text-xs text-gray-400">
                  {leftTab === 'pending' ? '처리 필요한 행사가 없습니다 ✅' : '완료된 행사가 없습니다.'}
                </div>
              )}
              {/* 2열 그리드 */}
              <div className="grid grid-cols-2 gap-2">
                {activeGroups.map(({ inq, hqAssigns: hq, payableLeaders: leaders, inqPayouts, totalFinal, pendingCount, confirmedCount, paidCount, unregistered: unreg, isHqOnly, allDone, needsAction }) => {
                  const isSelected = inq.id === selectedId
                  return (
                    <button key={inq.id} onClick={() => setSelectedId(inq.id)}
                      className={`text-left rounded-xl border-2 p-3 transition-all hover:shadow-md ${
                        isSelected
                          ? 'bg-blue-50 border-blue-400 shadow-sm'
                          : 'bg-white border-gray-200 hover:border-blue-300'
                      }`}>
                      {/* 행사명 + 상태 뱃지 */}
                      <div className="flex items-start justify-between gap-1 mb-1.5">
                        <p className="text-xs font-bold text-gray-800 leading-snug line-clamp-2 flex-1">{inq.event_name || '(행사명 없음)'}</p>
                        {allDone && !isHqOnly && <span className="text-2xs bg-green-500 text-white rounded-full px-1.5 py-0.5 font-bold shrink-0">완료</span>}
                        {isHqOnly && <span className="text-2xs bg-purple-500 text-white rounded-full px-1.5 py-0.5 font-bold shrink-0">본사</span>}
                        {needsAction && <span className="text-2xs bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold shrink-0">처리필요</span>}
                      </div>
                      {/* 의뢰처 */}
                      <p className="text-2xs text-gray-500 font-medium truncate">{inq.company_name}</p>
                      {/* 날짜 */}
                      {inq.event_start && (
                        <p className="text-2xs text-gray-400 mt-0.5">
                          {formatDate(inq.event_start)}{inq.event_end && inq.event_end !== inq.event_start ? ` ~ ${formatDate(inq.event_end)}` : ''}
                        </p>
                      )}
                      {/* 장소 */}
                      {inq.location && <p className="text-2xs text-gray-400 truncate mt-0.5">📍 {inq.location}</p>}

                      {/* 인원 구성 */}
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {isHqOnly && <span className="text-2xs bg-purple-100 text-purple-700 rounded-full px-1.5 py-0.5">🏢 본사 전원</span>}
                        {leaders.length > 0 && <span className="text-2xs bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5">외부 {leaders.length}명</span>}
                        {hq.length > 0 && !isHqOnly && <span className="text-2xs bg-purple-50 text-purple-600 rounded-full px-1.5 py-0.5">본사 {hq.length}</span>}
                      </div>

                      {/* 지급 상태 */}
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {unreg > 0 && <span className="text-2xs bg-orange-100 text-orange-700 rounded-full px-1.5 py-0.5 font-bold">⚠ {unreg}미등록</span>}
                        {pendingCount > 0 && <span className="text-2xs bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5">대기 {pendingCount}</span>}
                        {confirmedCount > 0 && <span className="text-2xs bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5">검토 {confirmedCount}</span>}
                        {paidCount > 0 && <span className="text-2xs bg-green-100 text-green-700 rounded-full px-1.5 py-0.5">완료 {paidCount}</span>}
                      </div>

                      {/* 금액 */}
                      {totalFinal > 0 && (
                        <p className="text-xs font-extrabold text-blue-600 mt-2">{formatKRW(totalFinal)}</p>
                      )}
                    </button>
                  )
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ─── 우측: 지급 현황 ─── */}
      {selectedInquiry ? (
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* 현장 기록 반영 중 — 사람을 고르면 폼에 금액이 채워진다 */}
          {pendingLog && pendingLog.inquiry_id === selectedInquiry.id && (
            <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-2 flex items-center gap-3 text-xs shrink-0">
              <span className="font-bold text-emerald-800">현장 기록 반영 중</span>
              <span className="text-emerald-900 flex-1 truncate">[{pendingLog.kind}] {pendingLog.content}{pendingLog.amount ? ` · ${formatKRW(pendingLog.amount)}` : ' · 금액 없음 (폼에서 직접 입력)'}</span>
              <span className="text-emerald-700">사람을 골라 지급을 열면 금액이 채워집니다</span>
              <button onClick={() => setPendingLog(null)} className="text-emerald-600 hover:text-emerald-900 font-semibold">취소</button>
            </div>
          )}

          {/* 행사 헤더 */}
          <div className="bg-white border-b-2 border-gray-200 px-5 py-3 flex items-start justify-between shadow-sm shrink-0">
            <div>
              <h2 className="text-base font-extrabold text-gray-900">{selectedInquiry.event_name || '(행사명 없음)'}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {selectedInquiry.company_name} · {selectedInquiry.event_start ? formatDate(selectedInquiry.event_start) : ''} · {selectedInquiry.location || ''}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              {!selectedGroup?.isHqOnly && (
                <>
                  {unregisteredAssigns.length > 0 && (
                    <Button size="sm" onClick={() => setBulkOpen(true)}
                      className="bg-orange-500 hover:bg-orange-600 text-xs h-7 gap-1">
                      <Layers className="h-3.5 w-3.5" />일괄 지급등록 {unregisteredAssigns.length}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={handleBulkConfirm}
                    className="text-blue-600 border-blue-300 text-xs h-7 gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />전체 검토완료
                  </Button>
                  <Button size="sm" onClick={handleBulkPaid}
                    className="bg-green-600 hover:bg-green-700 text-xs h-7 gap-1">
                    <Wallet className="h-3.5 w-3.5" />전체 입금완료
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportExcel}
                    className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 text-xs h-7 gap-1 font-semibold">
                    <Download className="h-3.5 w-3.5" />이체목록 엑셀
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* 합계 요약 바 */}
          {!selectedGroup?.isHqOnly && (
            <div className="bg-white border-b border-gray-200 px-5 py-2 flex gap-5 text-sm flex-wrap items-center shrink-0">
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-gray-400" />
                <span className="text-gray-500 text-xs">외부</span>
                <span className="font-bold">{payableLeaders.length}명</span>
              </div>
              {hqAssigns.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <UserX className="h-4 w-4 text-purple-400" />
                  <span className="text-purple-600 text-xs">본사</span>
                  <span className="font-bold text-purple-700">{hqAssigns.length}명</span>
                </div>
              )}
              <div className="w-px h-4 bg-gray-200" />
              {payoutTotalBase > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-gray-500 text-xs">소계</span>
                  <span className="font-semibold text-sm">{formatKRW(payoutTotalBase)}</span>
                </div>
              )}
              {payoutTotalDeduction > 0 && (
                <div className="flex items-center gap-1 text-red-500">
                  <span className="text-xs">공제</span>
                  <span className="font-semibold text-sm">-{formatKRW(payoutTotalDeduction)}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 text-blue-700">
                <Wallet className="h-4 w-4" />
                <span className="text-xs">최종 지급</span>
                <span className="font-extrabold text-base">{formatKRW(payoutTotalFinal)}</span>
              </div>
              {expenseTotal > 0 && (
                <div className="flex items-center gap-1.5 text-rose-600">
                  <Receipt className="h-4 w-4" />
                  <span className="text-xs">부대비용</span>
                  <span className="font-bold text-sm">-{formatKRW(expenseTotal)}</span>
                </div>
              )}
            </div>
          )}

          {/* 본사 전원 행사 안내 */}
          {selectedGroup?.isHqOnly && (
            <div className="bg-purple-50 border-b-2 border-purple-200 px-5 py-3 flex items-center gap-3 shrink-0">
              <UserX className="h-5 w-5 text-purple-500 shrink-0" />
              <div>
                <p className="text-sm font-bold text-purple-700">본사 인원 전원 투입 행사</p>
                <p className="text-xs text-purple-500">인력비 지급 없음 · 수익률 100%</p>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-3">

            {/* ── 1. 등록된 지급 목록 ── */}
            {currentPayouts.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-1">지급 등록 내역</p>
                <div className="space-y-2">
                  {currentPayouts.map(payout => {
                    const assign = assignments.find(a => a.id === payout.assignment_id)
                    const teamMembers = assign?.role_type === '팀장' ? getTeamMembers(assign.team_code) : []
                    const done = isDone(payout)
                    return (
                      <div key={payout.id}
                        className={`bg-white rounded-xl border-2 p-4 flex items-start gap-3 transition-shadow hover:shadow-sm ${
                          done ? 'border-green-200' : 'border-gray-200'
                        }`}>
                        <div className="mt-0.5 shrink-0">
                          {done && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                          {(payout.status === '확인완료' || payout.status === '검토완료') && <CheckCircle2 className="h-5 w-5 text-blue-500" />}
                          {payout.status === '대기' && <Clock className="h-5 w-5 text-amber-500" />}
                          {(payout.status === '보류' || payout.status === '미지급') && <AlertCircle className="h-5 w-5 text-gray-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-gray-800">
                              {isHQ(assign!) && <span className="text-purple-600 text-xs">[본사] </span>}
                              {assign?.role_type === '팀장' && <span className="text-indigo-600 text-xs">[팀장] </span>}
                              {payout.staff_name}
                            </span>
                            <span className={`text-2xs rounded-full px-2 py-0.5 font-semibold ${STATUS_STYLE[payout.status] || 'bg-gray-100 text-gray-500'}`}>
                              {STATUS_LABEL[payout.status] || payout.status}
                            </span>
                            {assign?.job_type && <span className="text-2xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{assign.job_type}</span>}
                          </div>
                          {teamMembers.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1 items-center">
                              <span className="text-2xs text-indigo-500 font-semibold">팀원:</span>
                              {teamMembers.map(m => (
                                <span key={m.id} className="text-2xs bg-indigo-50 text-indigo-600 rounded-full px-2 py-0.5">
                                  {m.staff_name}{!m.is_present && <span className="text-gray-400 ml-0.5">(불참)</span>}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500">
                            <span>📅 {payout.dispatch_period || '-'} ({payout.dispatch_days}일)</span>
                            {(() => {
                              const segs = parseNotesSegments(payout.notes) || (assign ? parseSegments(assign.memo) : null)
                              if (segs && segs.length > 0) {
                                return (
                                  <span className="flex items-center gap-1 flex-wrap">
                                    {segs.map((seg, i) => (
                                      <span key={i} className="bg-indigo-50 text-indigo-700 px-1 py-0.5 rounded text-2xs font-medium">
                                        {formatKRW(seg.rate)}×{seg.days}일
                                      </span>
                                    ))}
                                    = 기본 <strong className="text-gray-700">{formatKRW(payout.base_pay)}</strong>
                                  </span>
                                )
                              }
                              return <span>기본 {formatKRW(payout.base_pay)}</span>
                            })()}
                            {payout.overtime_pay > 0  && <span>야근 +{formatKRW(payout.overtime_pay)}</span>}
                            {payout.meal_pay > 0      && <span>식비 +{formatKRW(payout.meal_pay)}</span>}
                            {payout.transport_pay > 0 && <span>교통 +{formatKRW(payout.transport_pay)}</span>}
                            {payout.bonus > 0         && <span>기타 +{formatKRW(payout.bonus)}</span>}
                            {payout.tax_deduction > 0 && <span className="text-red-400">공제 -{formatKRW(payout.tax_deduction)}</span>}
                          </div>
                          {payout.bank_name && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                              <Building2 className="h-3 w-3" />{payout.bank_name} {payout.account_number}
                            </div>
                          )}
                          {(() => {
                            const memoText = parseNotesMemo(payout.notes)
                            return memoText ? (
                              <p className="mt-1 text-2xs text-gray-400 bg-gray-50 rounded-lg px-2 py-1">{memoText}</p>
                            ) : null
                          })()}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-extrabold text-blue-700 text-base">{formatKRW(payout.final_pay)}</p>
                          <div className="flex gap-1 mt-1.5 justify-end items-center">
                            {!done && (
                              <>
                                <button onClick={() => { if (assign) openForm(assign, payout) }}
                                  className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                                  <PencilLine className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => handleDelete(payout)}
                                  className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                            {payout.status === '대기' && (
                              <button onClick={() => handleSingleConfirm(payout.id)}
                                className="text-2xs bg-blue-600 text-white rounded-lg px-2.5 py-1 hover:bg-blue-700 whitespace-nowrap font-semibold transition-colors">
                                검토완료 →
                              </button>
                            )}
                            {(payout.status === '검토완료' || payout.status === '확인완료') && (
                              <button onClick={() => handleSinglePaid(payout.id)}
                                className="text-2xs bg-green-600 text-white rounded-lg px-2.5 py-1 hover:bg-green-700 whitespace-nowrap font-semibold transition-colors">
                                입금완료 →
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── 2. 미등록 유급 인원 ── */}
            {unregistered > 0 && (
              <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-orange-700 flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4" />
                    지급 미등록 인력 ({unregistered}명) — 지급 등록이 필요합니다
                  </p>
                  <Button size="sm" onClick={() => setBulkOpen(true)}
                    className="bg-orange-500 hover:bg-orange-600 text-xs h-7 gap-1 shrink-0">
                    <Layers className="h-3.5 w-3.5" />일괄 지급등록
                  </Button>
                </div>
                {unregisteredAssigns.map(assign => {
                  const teamMembers = assign.role_type === '팀장' ? getTeamMembers(assign.team_code) : []
                  const segsAmt = parseSegments(assign.memo)
                  const baseAmt = segsAmt ? segmentTotal(segsAmt) : (assign.pay_rate || 0) * (assign.work_days || 1)
                  return (
                    <div key={assign.id}
                      className="flex items-start justify-between bg-white border border-orange-200 rounded-lg px-3 py-2.5 gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {assign.role_type === '팀장' && <span className="text-2xs text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.5 rounded">[팀장]</span>}
                          <span className="text-sm font-semibold text-gray-800">{assign.staff_name}</span>
                          {assign.job_type && <span className="text-xs text-gray-400">{assign.job_type}</span>}
                          {segsAmt ? (
                            <span className="text-xs text-gray-600 flex items-center gap-1 flex-wrap">
                              {segsAmt.map((seg, i) => (
                                <span key={i} className="bg-indigo-50 text-indigo-700 px-1 py-0.5 rounded text-2xs font-medium">
                                  {formatKRW(seg.rate)}×{seg.days}일
                                </span>
                              ))}
                              = <strong className="text-gray-800">{formatKRW(baseAmt)}</strong>
                            </span>
                          ) : (
                            <span className="text-xs text-gray-600">
                              {formatKRW(assign.pay_rate)} × {assign.work_days}일 = <strong className="text-gray-800">{formatKRW(baseAmt)}</strong>
                            </span>
                          )}
                        </div>
                        {teamMembers.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            <span className="text-2xs text-indigo-500 font-semibold">팀원:</span>
                            {teamMembers.map(m => (
                              <span key={m.id} className="text-2xs bg-indigo-50 text-indigo-600 rounded-full px-2 py-0.5">
                                {m.staff_name}{!m.is_present && <span className="text-gray-400 ml-0.5">(불참)</span>}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button size="sm" variant="outline"
                        className="h-7 text-xs border-orange-400 text-orange-600 hover:bg-orange-100 shrink-0 font-semibold"
                        onClick={() => openForm(assign, null)}>
                        <Plus className="h-3.5 w-3.5 mr-1" />지급 등록
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── 3. 부대비용 (실제 지출) — 지급과 달리 상태 없음 ── */}
            <ExpensesSection
              inquiryId={selectedInquiry.id}
              expenses={currentExpenses}
              ready={expensesReady}
              onChanged={load}
            />

            {/* ── 4. 본사 인원 (항상 표시) ── */}
            {hqAssigns.length > 0 && (
              <div className={`border-2 rounded-xl p-4 space-y-3 ${selectedGroup?.isHqOnly ? 'border-purple-300 bg-purple-50' : 'border-purple-200 bg-purple-50/40'}`}>
                <p className="text-xs font-bold text-purple-700 flex items-center gap-1.5">
                  <UserX className="h-4 w-4" />
                  본사 인원 ({hqAssigns.length}명) — 지급 없음
                </p>
                <div className="flex flex-wrap gap-2">
                  {hqAssigns.map(assign => (
                    <div key={assign.id}
                      className="flex items-center gap-1.5 bg-white border-2 border-purple-200 rounded-full px-3 py-1.5 shadow-sm">
                      <span className="text-xs font-bold text-purple-700">{assign.staff_name}</span>
                      {assign.job_type && <span className="text-2xs text-gray-400">{assign.job_type}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 배정 자체가 없을 때 */}
            {payableLeaders.length === 0 && hqAssigns.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <Users className="h-10 w-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">배정된 인력이 없습니다.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <Wallet className="h-14 w-14 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">왼쪽에서 행사를 선택하세요</p>
            <p className="text-xs mt-1 opacity-70">처리 필요 {pendingGroups.length}건 · 완료 {doneGroups.length}건</p>
          </div>
        </div>
      )}

      {formOpen && formAssignment && (
        <PayoutForm open={formOpen} onClose={() => setFormOpen(false)}
          assignment={formAssignment} payout={formPayout} onSaved={handleFormSaved}
          prefill={pendingLog && pendingLog.inquiry_id === formAssignment.inquiry_id ? prefillOf(pendingLog, formAssignment) : null} />
      )}

      {bulkOpen && selectedInquiry && (
        <BulkPayoutModal
          open={bulkOpen}
          onClose={() => setBulkOpen(false)}
          assignments={unregisteredAssigns}
          eventName={selectedInquiry.event_name || ''}
          inquiryId={selectedInquiry.id}
          onSaved={load}
        />
      )}
    </div>
  )
}
