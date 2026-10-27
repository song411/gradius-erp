'use client'

// 할 일 — 사무실 화면 여러 곳에 흩어진 '처리해야 할 것'을 숫자 카드로 모은다.
// 전부 읽기만 한다. 기준은 각 화면이 쓰는 lib 의 규칙 그대로:
//   연락할 문의 = lib/pipeline dueToday, 계산서 = lib/finance needsTaxInvoice, 지급 = 본사 제외(isHeadOfficePayout)
// 여기서 숫자를 따로 세기 시작하면 PC 화면과 어긋난다 — 규칙이 바뀌면 lib 를 고친다.

import { useEffect, useState, useCallback, useMemo } from 'react'
import { db } from '@/lib/supabase/api'
import { formatKRW, todayKST } from '@/lib/utils'
import { buildBoard, dueToday, kstDay, dayDiff } from '@/lib/pipeline'
import { needsTaxInvoice, isCountable, dedupeSettlements, isHeadOfficePayout } from '@/lib/finance'
import { unpaidNotice, invoiceNotice } from '@/lib/sms'
import { MobileHeader, ErrorBox, CountCard, Row, More } from '@/components/mobile/ui'
import type { Inquiry, Estimate, Settlement, Payout, FieldLog } from '@/lib/supabase/types'

const SHOW = 8

export default function TodoContent() {
  const today = todayKST()
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [inquiries, setInquiries]     = useState<Inquiry[]>([])
  const [estimates, setEstimates]     = useState<Estimate[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [payouts, setPayouts]         = useState<Payout[]>([])
  const [logs, setLogs]               = useState<FieldLog[]>([])

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [inqs, ests, setts, pays, lg] = await Promise.all([
        db.list<Inquiry>('inquiries', { order: 'created_at', asc: false }),
        db.list<Estimate>('estimates', { order: 'created_at', asc: false }),
        db.list<Settlement>('settlements', { order: 'created_at', asc: false }),
        db.list<Payout>('payouts', { order: 'created_at', asc: false }),
        db.list<FieldLog>('field_logs', { order: 'created_at', asc: false }).catch(() => [] as FieldLog[]),
      ])
      setInquiries(inqs); setEstimates(ests); setSettlements(setts); setPayouts(pays); setLogs(lg)
    } catch (e) {
      setError((e as Error).message || '불러오지 못했습니다')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const inqMap = useMemo(() => new Map(inquiries.map(i => [i.id, i])), [inquiries])

  // ① 연락할 문의 — 영업 보드의 '오늘까지 하기로 한 일' 그대로
  const cards = useMemo(() => buildBoard(inquiries, estimates), [inquiries, estimates])
  const due = useMemo(() => dueToday(cards), [cards])

  // ② 견적 안 보낸 접수 — 견적이 하나도 없는 접수 상태 문의 (견적 관리의 '견적 대기')
  const noEstimate = useMemo(() => cards.filter(c => c.stage === '접수' && c.inq.status === '접수'), [cards])

  // ③ 행사 끝났는데 입금 안 됨 — 잔액 > 0, 세는 대상, 행사 종료일이 지난 것
  const unpaid = useMemo(() => dedupeSettlements(settlements)
    .map(s => ({ s, inq: s.inquiry_id ? inqMap.get(s.inquiry_id) : undefined }))
    .filter(({ s, inq }) => (s.balance || 0) > 0 && isCountable(inq) && ((inq?.event_end || inq?.event_start || '') < today))
    .sort((a, b) => (b.s.balance || 0) - (a.s.balance || 0)), [settlements, inqMap, today])
  const unpaidSum = unpaid.reduce((a, { s }) => a + (s.balance || 0), 0)

  // ④ 세금계산서 미발행 — CEO 세금계산서 탭과 같은 기준
  const unissued = useMemo(() => settlements
    .map(s => ({ s, inq: s.inquiry_id ? inqMap.get(s.inquiry_id) : undefined }))
    .filter(({ s, inq }) => needsTaxInvoice(inq) && !s.tax_invoice_issued)
    .sort((a, b) => (a.inq?.event_start || '').localeCompare(b.inq?.event_start || '')), [settlements, inqMap])
  const unissuedSum = unissued.reduce((a, { s }) => a + (s.invoice_amount || 0), 0)

  // ⑤ 지급 대기 — 금액은 잡혔는데 아직 안 나간 것. 본사 인원 행은 지급이 없는 게 정상이라 뺀다
  const pendingPay = useMemo(() => payouts
    .filter(p => ['대기', '검토완료', '확인완료'].includes(p.status) && (p.final_pay || 0) > 0 && !isHeadOfficePayout(p)), [payouts])
  const pendingSum = pendingPay.reduce((a, p) => a + (p.final_pay || 0), 0)
  // 행사별로 묶어 보여준다
  const pendingBySite = useMemo(() => {
    const m = new Map<string, { site: string; n: number; sum: number }>()
    pendingPay.forEach(p => {
      const k = p.inquiry_id || p.site_name || '?'
      const g = m.get(k) || { site: p.site_name || inqMap.get(p.inquiry_id || '')?.event_name || '(행사 미상)', n: 0, sum: 0 }
      g.n++; g.sum += p.final_pay || 0; m.set(k, g)
    })
    return [...m.values()].sort((a, b) => b.sum - a.sum)
  }, [pendingPay, inqMap])

  // ⑥ 현장 기록 반영 전
  const pendingLogs = useMemo(() => logs.filter(l => !l.applied_at), [logs])

  const total = due.length + noEstimate.length + unpaid.length + unissued.length + pendingBySite.length + pendingLogs.length

  return (
    <div className="max-w-lg mx-auto">
      <MobileHeader kicker="가디어스 · 할 일" title="오늘 챙길 것" sub={loading ? '' : `${total}건`} onRefresh={load} loading={loading} />
      <div className="px-4 pt-4 space-y-3">
        {error && <ErrorBox message={error} onRetry={load} />}
        {loading && inquiries.length === 0 && !error && <p className="text-center text-gray-400 py-16 text-base">불러오는 중…</p>}
        {!loading && !error && (
          <>
            <CountCard title="연락하기로 한 문의" count={due.length} hint="오늘까지 하기로 한 다음 행동 (지난 것 포함)" tone="bad" pcHref="/pipeline" pcLabel="영업 보드에서 처리">
              {due.slice(0, SHOW).map(c => {
                const late = dayDiff(kstDay(c.inq.next_action_at!), today)
                return <Row key={c.inq.id} title={`${c.inq.company_name || '(업체 미상)'} · ${c.inq.event_name || ''}`}
                  desc={c.inq.next_action || '다음 행동 미기재'} right={late > 0 ? `${late}일 지남` : '오늘'} tone={late > 0 ? 'bad' : 'warn'} tel={c.inq.phone} />
              })}
              <More n={due.length - SHOW} />
            </CountCard>

            <CountCard title="견적 안 보낸 접수" count={noEstimate.length} hint="접수됐는데 견적이 하나도 없는 문의" tone="warn" pcHref="/estimates" pcLabel="견적 관리에서 작성">
              {noEstimate.slice(0, SHOW).map(c => (
                <Row key={c.inq.id} title={`${c.inq.company_name || '(업체 미상)'} · ${c.inq.event_name || ''}`}
                  desc={`접수 ${(c.inq.created_at || '').slice(5, 10)}${c.inq.event_start ? ` · 행사 ${c.inq.event_start.slice(5, 10)}` : ''}`}
                  right={c.dday !== null ? (c.dday < 0 ? '행사 지남' : `D-${c.dday}`) : undefined} tone={c.dday !== null && c.dday <= 3 ? 'bad' : undefined} tel={c.inq.phone} />
              ))}
              <More n={noEstimate.length - SHOW} />
            </CountCard>

            <CountCard title="행사 끝났는데 입금 안 됨" count={unpaid.length} amount={`미수 ${formatKRW(unpaidSum)}`} hint="잔액이 남은 정산, 행사 종료일 지난 것" tone="bad" pcHref="/settlements" pcLabel="정산/청구에서 확인">
              {unpaid.slice(0, SHOW).map(({ s, inq }) => (
                <Row key={s.id} title={s.company_name || inq?.company_name || '(업체 미상)'} desc={`${inq?.event_name || s.site_name || ''} · ${(inq?.event_end || inq?.event_start || '').slice(5, 10)}`}
                  right={formatKRW(s.balance || 0)} tone="bad" tel={s.contact_phone || inq?.phone}
                  sms={unpaidNotice({ company: s.company_name || inq?.company_name, eventName: inq?.event_name || s.site_name, amount: s.balance || 0 })} />
              ))}
              <More n={unpaid.length - SHOW} />
            </CountCard>

            <CountCard title="세금계산서 미발행" count={unissued.length} amount={formatKRW(unissuedSum)} hint="체결 이후 건 중 발행 처리 안 된 것" tone="warn" pcHref="/ceo" pcLabel="CEO 세금계산서 탭에서 발행">
              {unissued.slice(0, SHOW).map(({ s, inq }) => (
                <Row key={s.id} title={s.company_name || '(업체 미상)'} desc={`${inq?.event_name || ''} · ${(inq?.event_start || '').slice(5, 10)}`} right={formatKRW(s.invoice_amount || 0)}
                  tel={s.contact_phone || inq?.phone} sms={invoiceNotice({ company: s.company_name, eventName: inq?.event_name, amount: s.invoice_amount || 0 })} />
              ))}
              <More n={unissued.length - SHOW} />
            </CountCard>

            <CountCard title="크루 지급 대기" count={pendingBySite.length} amount={`${pendingPay.length}명 ${formatKRW(pendingSum)}`} hint="금액은 잡혔는데 아직 송금 전 (행사 단위)" tone="warn" pcHref="/payouts" pcLabel="지급 관리에서 처리">
              {pendingBySite.slice(0, SHOW).map(g => (
                <Row key={g.site} title={g.site} desc={`${g.n}명`} right={formatKRW(g.sum)} tone="warn" />
              ))}
              <More n={pendingBySite.length - SHOW} />
            </CountCard>

            <CountCard title="현장 기록 반영 전" count={pendingLogs.length} hint="현장에서 적은 한 줄, 사무실에서 아직 안 봄" pcHref="/field" pcLabel="반영 대기함 열기">
              {pendingLogs.slice(0, SHOW).map(l => (
                <Row key={l.id} title={`${l.kind} · ${inqMap.get(l.inquiry_id)?.event_name || ''}`} desc={l.content} right={(l.log_date || l.created_at || '').slice(5, 10)} />
              ))}
              <More n={pendingLogs.length - SHOW} />
            </CountCard>

            <p className="text-2xs text-gray-400 px-1 pt-1">숫자는 PC 화면과 같은 규칙으로 셉니다. 처리는 각 PC 화면에서 합니다.</p>
          </>
        )}
      </div>
    </div>
  )
}
