'use client'

// 체결 전 한 건의 작업 창
// ─────────────────────────────────────────────────────────
// 영업 보드에서 카드를 누르면 열린다. 여기서 하는 일은 셋뿐이다.
//   ① 다음에 뭘 하기로 했는지 적는다
//   ② 오늘 무슨 얘기를 했는지 남긴다
//   ③ 끝난 건이면 왜 끝났는지 적고 닫는다
// 그 외 수정(금액·일정·인원)은 문의 상세가 맡는다. 두 군데서 같은 값을
// 고치게 만들면 어느 쪽이 최신인지 아무도 모르게 된다.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { db } from '@/lib/supabase/api'
import { formatKRW } from '@/lib/utils'
import {
  LOST_REASONS, DEAD_STATUSES, CONTACT_KINDS, ACTIVITY_TYPE,
  isDead, splitActivity, cleanNote, type PipelineCard, type ContactKind,
} from '@/lib/pipeline'
import type { InquiryStatus, ProjectMemo } from '@/lib/supabase/types'
import {
  Dialog, DialogHeader, DialogTitle, DialogContent, DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Phone, Mail, Users, MessageSquare, ExternalLink, Trash2, Flag, CalendarClock, FileText,
} from 'lucide-react'

const KIND_ICON: Record<string, React.ReactNode> = {
  '통화':      <Phone className="h-3.5 w-3.5" />,
  '메일·문자': <Mail className="h-3.5 w-3.5" />,
  '미팅':      <Users className="h-3.5 w-3.5" />,
  '기타':      <MessageSquare className="h-3.5 w-3.5" />,
}

const AUTHOR_KEY = 'gradius.pipeline.author'

/** 요약표 한 칸. 값이 없으면 줄을 만들지 않는다 — 빈 라벨만 늘어놓으면 표가 시끄럽다. */
function Field({ label, value, href }: { label: string; value?: string | null; href?: string }) {
  const v = (value ?? '').trim()
  if (!v || v === 'null') return null
  return (
    <div className="min-w-0">
      <dt className="text-2xs text-gray-400">{label}</dt>
      <dd className="truncate text-xs font-medium text-gray-800" title={v}>
        {href
          ? <a href={href} className="text-blue-600 hover:underline">{v}</a>
          : v}
      </dd>
    </div>
  )
}

interface Props {
  card: PipelineCard
  onClose: () => void
  /** 저장이 끝나 목록을 다시 읽어야 할 때 */
  onChanged: () => void
}

export default function CardDrawer({ card, onClose, onChanged }: Props) {
  const inq = card.inq

  // ── 다음 할 일 ──────────────────────────────────────────
  const [action,   setAction]   = useState(inq.next_action ?? '')
  const [actionAt, setActionAt] = useState((inq.next_action_at ?? '').substring(0, 10))
  const [savingAction, setSavingAction] = useState(false)

  // ── 활동 기록 ───────────────────────────────────────────
  const [logs, setLogs] = useState<ProjectMemo[]>([])
  const [kind, setKind] = useState<ContactKind>('통화')
  const [body, setBody] = useState('')
  const [author, setAuthor] = useState(() => {
    // 이 창은 카드를 누른 뒤에만 뜬다 = 서버 렌더를 거치지 않는다.
    // 그래서 첫 state에서 바로 읽어도 하이드레이션이 어긋나지 않는다.
    try { return localStorage.getItem(AUTHOR_KEY) ?? '' } catch { return '' }
  })
  const [savingLog, setSavingLog] = useState(false)

  // ── 결론 ────────────────────────────────────────────────
  const [lostStatus, setLostStatus] = useState<InquiryStatus>('미체결')
  const [lostReason, setLostReason] = useState<string>(inq.lost_reason ?? '')
  const [savingLost, setSavingLost] = useState(false)

  const loadLogs = useCallback(async () => {
    try {
      const rows = await db.list<ProjectMemo>('project_memos', {
        filters: { inquiry_id: inq.id, type: ACTIVITY_TYPE },
        order: 'created_at',
        asc: false,
      })
      setLogs(rows)
    } catch {
      // 마이그레이션 전이면 '영업활동' 유형이 막혀 있을 수 있다. 빈 목록으로 둔다.
      setLogs([])
    }
  }, [inq.id])

  // effect 동기 구간에서 setState하지 않도록 한 박자 미룬다
  useEffect(() => { void Promise.resolve().then(loadLogs) }, [loadLogs])

  // ── 저장 ────────────────────────────────────────────────
  async function saveAction() {
    setSavingAction(true)
    try {
      await db.update('inquiries', inq.id, {
        next_action: action.trim() || null,
        next_action_at: actionAt || null,
      })
      toast.success(action.trim() ? '다음 할 일을 저장했습니다' : '다음 할 일을 지웠습니다')
      onChanged()
    } catch (e) {
      toast.error('저장 실패: ' + (e as Error).message)
    } finally {
      setSavingAction(false)
    }
  }

  async function addLog() {
    if (!body.trim()) { toast.error('내용을 입력해주세요'); return }
    setSavingLog(true)
    try {
      await db.insert('project_memos', {
        inquiry_id: inq.id,
        type: ACTIVITY_TYPE,
        content: `[${kind}] ${body.trim()}`,
        author: author.trim() || '미지정',
      })
      try { localStorage.setItem(AUTHOR_KEY, author.trim()) } catch { /* 무시 */ }
      setBody('')
      toast.success('기록했습니다')
      loadLogs()
    } catch (e) {
      toast.error('기록 실패: ' + (e as Error).message)
    } finally {
      setSavingLog(false)
    }
  }

  async function removeLog(id: string) {
    if (!confirm('이 기록을 삭제하시겠습니까?')) return
    try {
      await db.delete('project_memos', id)
      loadLogs()
    } catch (e) {
      toast.error('삭제 실패: ' + (e as Error).message)
    }
  }

  async function conclude() {
    if (!lostReason) { toast.error('사유를 골라주세요'); return }
    if (!confirm(`"${inq.event_name}" 건을 ${lostStatus}(으)로 닫습니다. 계속할까요?`)) return
    setSavingLost(true)
    try {
      await db.update('inquiries', inq.id, {
        status: lostStatus,
        lost_reason: lostReason,
        // 끝난 건에 할 일이 남아 있으면 '오늘의 후속'에 계속 뜬다
        next_action: null,
        next_action_at: null,
      })
      // 왜 닫혔는지는 이력에도 남긴다. 나중에 같은 고객을 다시 만날 때 이게 근거가 된다.
      try {
        await db.insert('project_memos', {
          inquiry_id: inq.id,
          type: ACTIVITY_TYPE,
          content: `[기타] ${lostStatus} 처리 — 사유: ${lostReason}`,
          author: author.trim() || '미지정',
        })
      } catch { /* 기록 실패가 상태 변경을 되돌릴 이유는 없다 */ }
      toast.success(`${lostStatus}(으)로 닫았습니다`)
      onChanged()
      onClose()
    } catch (e) {
      toast.error('처리 실패: ' + (e as Error).message)
    } finally {
      setSavingLost(false)
    }
  }

  async function reopen() {
    if (!confirm('이 건을 다시 진행 중으로 되돌릴까요?')) return
    try {
      // 견적이 있으면 '견적', 없으면 '접수'로 — 단계는 데이터에서 다시 계산된다
      await db.update('inquiries', inq.id, {
        status: card.estimates.length > 0 ? '견적' : '접수',
        lost_reason: null,
      })
      toast.success('다시 진행 중으로 돌렸습니다')
      onChanged()
      onClose()
    } catch (e) {
      toast.error('처리 실패: ' + (e as Error).message)
    }
  }

  const dead = isDead(inq)
  const won  = card.stage === '체결'

  return (
    <Dialog open onClose={onClose} className="max-w-2xl">
      <DialogHeader>
        <div className="min-w-0">
          <DialogTitle className="truncate">{inq.event_name || '(행사명 없음)'}</DialogTitle>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {inq.company_name || '고객사 미상'}
            {inq.contact_name ? ` · ${inq.contact_name}` : ''}
            {inq.phone ? ` · ${inq.phone}` : ''}
          </p>
        </div>
        <DialogClose onClose={onClose} />
      </DialogHeader>

      <DialogContent className="space-y-6">
        {/* 요약 — 카드에서 잘린 값까지 여기서는 다 보여준다 */}
        <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold text-gray-900">{card.stage}</span>
            {card.stallText && <span>{card.stallText}</span>}
            {card.dday != null && (
              <span className={card.dday >= 0 ? 'font-medium text-orange-600' : 'text-gray-400'}>
                {card.dday >= 0 ? `행사까지 D-${card.dday}` : `행사일 ${-card.dday}일 지남`}
              </span>
            )}
            <div className="ml-auto flex items-center gap-3">
              <Link
                href={`/estimates?search=${encodeURIComponent(inq.company_name || '')}`}
                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
              >
                견적 <ExternalLink className="h-3 w-3" />
              </Link>
              <Link
                href={`/inquiries/${inq.id}`}
                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
              >
                문의 상세 <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>

          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-gray-200 pt-2 sm:grid-cols-3">
            <Field label="일정" value={
              (card.when.label ?? card.when.memo ?? '미정')
              + (card.when.days > 1 ? ` (${card.when.days}일)` : '')} />
            <Field label="시간" value={card.when.time + (card.when.night ? ' · 야간' : '')} />
            <Field label="직무" value={inq.service_type} />
            <Field label="인원" value={inq.required_staff ? `${inq.required_staff}명` : null} />
            <Field label="장소" value={inq.location} />
            <Field label="담당자" value={inq.contact_name} />
            <Field label="연락처" value={inq.phone} href={
              inq.phone ? `tel:${inq.phone.replace(/[^0-9+]/g, '')}` : undefined} />
            <Field label="청구" value={card.amount > 0 ? formatKRW(card.amount) : null} />
            <Field label="수익률" value={card.profitRate != null ? `${card.profitRate}%` : null} />
            <Field label="지급단가" value={inq.pay_detail} />
            {card.onsite.map(bit => {
              const [k, ...rest] = bit.split(' ')
              return <Field key={k} label={k} value={rest.join(' ')} />
            })}
          </dl>
        </div>

        {/* 견적 — 여러 안을 냈으면 어느 게 최종인지가 중요하다 */}
        {card.estimates.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">
              견적 {card.estimates.length}건
            </h3>
            <ul className="space-y-1">
              {card.estimates.map(est => (
                <li key={est.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg bg-gray-50 px-3 py-1.5 text-xs">
                  <span className="font-semibold text-gray-800">{est.version_label || 'A안'}</span>
                  {est.is_final && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-2xs font-bold text-amber-700">
                      최종
                    </span>
                  )}
                  <span className="text-gray-700">{formatKRW(est.total_price)}</span>
                  <span className="ml-auto text-gray-400">
                    {est.send_status === '발송완료'
                      ? `발송 ${est.sent_at?.substring(0, 10) ?? '일자 미상'}${est.send_method ? ` · ${est.send_method}` : ''}`
                      : '미발송'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 고객이 보낸 원문 — 다시 견적 낼 때 제일 먼저 다시 읽는 글이다 */}
        {(cleanNote(inq.notes) || cleanNote(inq.consult_notes)) && (
          <section>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 mb-2">
              <FileText className="h-4 w-4 text-gray-500" />
              문의 원문
            </h3>
            {cleanNote(inq.notes) && (
              <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                <p className="whitespace-pre-line break-words text-sm leading-relaxed text-gray-800">
                  {cleanNote(inq.notes)}
                </p>
                <p className="mt-1.5 text-2xs text-gray-400">고객이 보낸 내용</p>
              </div>
            )}
            {cleanNote(inq.consult_notes) && (
              <div className="mt-2 rounded-lg bg-blue-50 px-3 py-2">
                <p className="whitespace-pre-line break-words text-sm leading-relaxed text-gray-800">
                  {cleanNote(inq.consult_notes)}
                </p>
                <p className="mt-1.5 text-2xs text-blue-500">상담 내용 (내부)</p>
              </div>
            )}
          </section>
        )}

        {/* ① 다음 할 일 */}
        <section>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 mb-2">
            <CalendarClock className="h-4 w-4 text-blue-600" />
            다음 할 일
          </h3>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="예: 담당자 재통화 / 수정 견적 발송"
              value={action}
              onChange={e => setAction(e.target.value)}
              className="flex-1"
            />
            <Input
              type="date"
              value={actionAt}
              onChange={e => setActionAt(e.target.value)}
              className="sm:w-40"
            />
            <Button onClick={saveAction} disabled={savingAction} className="sm:w-20">
              {savingAction ? '저장…' : '저장'}
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            날짜를 넣으면 그 날 보드 맨 위 &lsquo;오늘의 후속&rsquo;에 올라옵니다.
          </p>
        </section>

        {/* ② 활동 기록 */}
        <section>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 mb-2">
            <MessageSquare className="h-4 w-4 text-indigo-600" />
            접촉 이력
            {logs.length > 0 && (
              <span className="text-xs font-normal text-gray-400">{logs.length}건</span>
            )}
          </h3>

          <div className="space-y-2">
            <div className="flex gap-2">
              <Select
                value={kind}
                onChange={e => setKind(e.target.value as ContactKind)}
                className="w-32 h-9 text-xs"
              >
                {CONTACT_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
              </Select>
              <Input
                placeholder="작성자"
                value={author}
                onChange={e => setAuthor(e.target.value)}
                className="w-28 h-9 text-xs"
              />
            </div>
            <Textarea
              placeholder="무슨 얘기를 했는지 한두 줄로. 예: 예산 800 이하 원함, 내주 화요일 내부 회의 후 회신"
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={2}
              className="text-sm"
            />
            <div className="flex justify-end">
              <Button size="sm" variant="secondary" onClick={addLog} disabled={savingLog}>
                {savingLog ? '기록 중…' : '기록 추가'}
              </Button>
            </div>
          </div>

          {logs.length > 0 && (
            <ul className="mt-3 space-y-1.5 max-h-56 overflow-y-auto">
              {logs.map(log => {
                const { kind: k, body: text } = splitActivity(log.content)
                return (
                  <li key={log.id} className="group flex gap-2 rounded-lg bg-gray-50 px-3 py-2">
                    <span className="mt-0.5 text-gray-400 shrink-0">
                      {KIND_ICON[k] ?? KIND_ICON['기타']}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800 whitespace-pre-line break-words">{text}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {k} · {log.author || '미지정'} · {log.created_at?.substring(0, 10)}
                      </p>
                    </div>
                    <button
                      onClick={() => removeLog(log.id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity shrink-0"
                      title="삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* ③ 결론 */}
        <section className="border-t border-gray-100 pt-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 mb-2">
            <Flag className="h-4 w-4 text-gray-500" />
            결론
          </h3>

          {won ? (
            <p className="text-sm text-gray-700">
              계약된 건입니다. 이후 운영은 운영 캘린더에서 봅니다.
            </p>
          ) : dead ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-700">
                {inq.status}
                {inq.lost_reason ? ` — ${inq.lost_reason}` : ''}
              </span>
              <Button size="sm" variant="outline" onClick={reopen} className="ml-auto">
                다시 진행 중으로
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row gap-2">
                <Select
                  value={lostStatus}
                  onChange={e => setLostStatus(e.target.value as InquiryStatus)}
                  className="sm:w-32"
                >
                  {DEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
                <Select
                  value={lostReason}
                  onChange={e => setLostReason(e.target.value)}
                  className="flex-1"
                >
                  <option value="">사유를 고르세요</option>
                  {LOST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </Select>
                <Button variant="outline" onClick={conclude} disabled={savingLost}>
                  {savingLost ? '처리 중…' : '닫기'}
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                사유는 다음 견적의 근거가 됩니다. 상태만 바꾸면 왜 졌는지가 남지 않습니다.
              </p>
            </>
          )}
        </section>
      </DialogContent>
    </Dialog>
  )
}
