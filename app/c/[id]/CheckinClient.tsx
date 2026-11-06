'use client'

// 크루 셀프 출석 체크인 (휴대폰)
// 이름 누르기 → 본인 확인(전화 뒷 4자리) → 안전교육 서약서 읽고 체크 → 손가락 서명 → 출석.
// 세 단계가 한 바닥 시트 안에서 이어진다. 담당자가 먼저 출결을 적어 둔 사람도 서명만 따로 할 수 있다.

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, MapPin, CalendarDays, Clock, ShieldCheck, PenLine, Eraser, X } from 'lucide-react'
import type { CheckinView, RosterItem } from '@/lib/checkin'
import SignaturePad, { type SignaturePadHandle } from '@/components/contracts/SignaturePad'
import { PLEDGE_TITLE, PLEDGE_LEAD, PLEDGE_TRAINING, PLEDGE_OATH } from '@/lib/safetyPledge'
import { getFix, type GeoFix } from '@/lib/geo'

function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr)
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${day})`
}

export default function CheckinClient({ inquiryId, view, codeFromQr = '' }: { inquiryId: string; view: CheckinView; codeFromQr?: string }) {
  const router = useRouter()
  // 서버 컴포넌트 재조회(router.refresh) 완료까지 대기 상태 유지
  const [refreshing, startRefresh] = useTransition()
  const [pending, setPending] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // 바닥 시트 — 누른 사람과 입력값
  const [picked, setPicked] = useState<RosterItem | null>(null)
  const [last4, setLast4] = useState('')
  // 현장 코드 — 팀장 화면의 QR 을 찍고 왔으면 채워져 있고, 아니면 숫자를 받는다
  const [siteCode, setSiteCode] = useState(codeFromQr)
  // 위치 — 시트를 열 때 한 번. 거부·실패면 null 로 두고 출석은 그대로 받는다 (거리 기록만 빠진다)
  const [fix, setFix] = useState<GeoFix | null | 'asking'>('asking')
  const [pledged, setPledged] = useState(false)
  const [hasInk, setHasInk] = useState(false)
  const [sheetError, setSheetError] = useState('')
  const padRef = useRef<SignaturePadHandle>(null)

  function open(item: RosterItem) {
    setPicked(item); setLast4(''); setPledged(false); setHasInk(false); setSheetError('')
    setFix('asking'); getFix().then(f => setFix(f))
  }

  async function submit() {
    if (!picked) return
    const signature = padRef.current?.toDataURL()
    if (!/^\d{4}$/.test(last4)) { setSheetError('전화번호 뒷 4자리를 입력해 주세요.'); return }
    if (!/^\d{6}$/.test(siteCode)) { setSheetError('현장 코드 6자리를 입력해 주세요. 팀장 화면에 있습니다.'); return }
    if (!pledged) { setSheetError('안전교육 서약 확인에 체크해 주세요.'); return }
    if (!signature) { setSheetError('서명을 그려 주세요.'); return }
    setPending(picked.assignmentId); setSheetError('')
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inquiryId, assignmentId: picked.assignmentId, action: 'checkin', last4, siteCode, pledged, signature, ...(fix && fix !== 'asking' ? { lat: fix.lat, lng: fix.lng, acc: fix.acc } : {}) }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setSheetError(json.error || '처리하지 못했습니다.'); return }
      setPicked(null)
      startRefresh(() => router.refresh())
    } catch {
      setSheetError('연결에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally { setPending(null) }
  }

  async function cancel(item: RosterItem) {
    if (pending) return
    if (!confirm(`${item.name}님 출석을 취소할까요? 서명도 함께 지워집니다.`)) return
    setPending(item.assignmentId); setNotice(null)
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inquiryId, assignmentId: item.assignmentId, action: 'cancel' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setNotice(json.error || '처리하지 못했습니다.'); return }
      startRefresh(() => router.refresh())
    } catch {
      setNotice('연결에 실패했습니다. 잠시 후 다시 시도해주세요.')
    } finally { setPending(null) }
  }

  const doneCount = view.roster.filter(r => r.status).length
  const signedCount = view.roster.filter(r => r.signed).length

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-200 px-5 py-4">
        <p className="text-xs text-gray-400">{view.companyName}</p>
        <h1 className="text-lg font-bold text-gray-900 mt-0.5">{view.eventName}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-500">
          <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatDateLong(view.workDate)}</span>
          {view.eventTime && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{view.eventTime}</span>}
          {view.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{view.location}</span>}
        </div>
      </div>

      {!view.isToday && (
        <div className="mx-4 mt-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-800">
          오늘은 행사일이 아닙니다. <b>{formatDateLong(view.workDate)}</b> 출석으로 기록됩니다.
        </div>
      )}

      <div className="mx-4 mt-3 rounded-xl bg-white border border-gray-200 px-4 py-3 text-sm text-gray-700">
        본인 이름을 누르고, 전화번호 뒷 4자리 → 현장 코드(팀장 화면의 QR·숫자) → 안전교육 서약서 확인 → 서명 순서로 진행하면 출석이 됩니다.
      </div>

      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">본인 이름을 눌러주세요</p>
        <span className="text-xs text-gray-400">출석 {doneCount} · 서명 {signedCount} / {view.roster.length}명</span>
      </div>

      {notice && (
        <div className="mx-4 mb-2 rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-xs text-red-700">{notice}</div>
      )}

      {/* 명단 */}
      <div className="px-4 space-y-2">
        {view.roster.length === 0 && <p className="text-center text-sm text-gray-400 py-10">배정된 인원이 없습니다.</p>}
        {view.roster.map(item => {
          const checked = !!item.status
          const busy = pending === item.assignmentId || refreshing
          const canCancel = checked && item.selfCheckin && item.status === '출석'
          const needSign = checked && !item.signed
          return (
            <div key={item.assignmentId}
              className={`rounded-2xl border px-4 py-3.5 flex items-center gap-3 transition-colors ${
                checked && item.signed ? 'border-green-300 bg-green-50' : checked ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'}`}>
              <button onClick={() => (!checked || needSign) && open(item)} disabled={(checked && !needSign) || busy}
                className="flex-1 flex items-center gap-3 text-left disabled:cursor-default">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center text-base font-bold shrink-0 ${
                  checked && item.signed ? 'bg-green-500 text-white' : checked ? 'bg-amber-400 text-white' : 'bg-blue-100 text-blue-700'}`}>
                  {checked && item.signed ? <CheckCircle2 className="h-6 w-6" /> : checked ? <PenLine className="h-5 w-5" /> : item.name[0]}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-semibold text-gray-900">{item.name}</span>
                    {item.isLeader && <span className="text-2xs font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">팀장</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {checked
                      ? `${item.status}${item.clockIn ? ` · ${item.clockIn}` : ''}${item.signed ? ' · 서명 완료' : ' · 서명이 아직 없습니다. 눌러서 서명'}`
                      : item.jobType || '탭하여 출석'}
                  </p>
                </div>
              </button>

              {pending === item.assignmentId ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 shrink-0" />
              ) : canCancel ? (
                <button onClick={() => cancel(item)} disabled={busy} className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 shrink-0 disabled:opacity-40">취소</button>
              ) : !checked ? (
                <span className="text-xs font-bold text-blue-600 shrink-0">출석</span>
              ) : needSign ? (
                <span className="text-xs font-bold text-amber-700 shrink-0">서명</span>
              ) : null}
            </div>
          )
        })}
      </div>

      {/* 바닥 시트: 본인 확인 → 서약 → 서명 */}
      {picked && (
        <div className="fixed inset-0 z-20 bg-black/40 flex items-end" onClick={() => !pending && setPicked(null)}>
          <div className="w-full max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-base font-extrabold text-gray-900">{picked.name}님 출석</p>
              <button type="button" onClick={() => setPicked(null)} className="h-9 w-9 flex items-center justify-center text-gray-400"><X className="h-5 w-5" /></button>
            </div>

            {!picked.hasPhone ? (
              <p className="text-sm text-gray-600">회사에 전화번호가 등록되어 있지 않아 본인 확인을 할 수 없습니다. 현장 담당자에게 말씀해 주세요.</p>
            ) : (
              <div className="space-y-4">
                <section>
                  <p className="font-extrabold text-gray-900 flex items-center gap-1.5 mb-1.5"><ShieldCheck className="h-5 w-5 text-gray-700" />1. 본인 확인</p>
                  <label className="text-sm text-gray-600 block mb-1">회사에 등록된 전화번호 뒷 4자리</label>
                  <input value={last4} onChange={e => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" maxLength={4} placeholder="0000"
                    className="h-14 w-44 rounded-xl border-2 border-gray-300 px-4 text-2xl font-extrabold tracking-[0.3em] text-center focus:border-gray-900 focus:outline-none" />
                </section>

                <section>
                  <p className="font-extrabold text-gray-900 flex items-center gap-1.5 mb-1.5"><MapPin className="h-5 w-5 text-gray-700" />2. 현장 코드</p>
                  {codeFromQr && siteCode === codeFromQr ? (
                    <p className="text-sm text-green-700 font-bold">QR로 들어와서 현장 코드가 채워졌습니다. ({siteCode})</p>
                  ) : (
                    <>
                      <label className="text-sm text-gray-600 block mb-1">팀장 휴대폰 화면에 보이는 6자리 숫자</label>
                      <input value={siteCode} onChange={e => setSiteCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="000000"
                        className="h-14 w-56 rounded-xl border-2 border-gray-300 px-4 text-2xl font-extrabold tracking-[0.25em] text-center focus:border-gray-900 focus:outline-none" />
                    </>
                  )}
                </section>

                <section className="rounded-2xl border-2 border-gray-200 p-4">
                  <p className="font-extrabold text-gray-900 mb-1">3. {PLEDGE_TITLE}</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{PLEDGE_LEAD}</p>
                  <ul className="mt-2 space-y-1 text-sm text-gray-700">
                    {PLEDGE_TRAINING.map((t, i) => <li key={i} className="flex gap-2"><span className="text-gray-400">{i + 1}.</span><span>{t}</span></li>)}
                  </ul>
                  <ul className="mt-2 space-y-1 text-sm text-gray-700">
                    {PLEDGE_OATH.map((t, i) => <li key={i} className="flex gap-2"><span className="text-gray-400">·</span><span>{t}</span></li>)}
                  </ul>
                  <label className="mt-3 flex items-start gap-3">
                    <input type="checkbox" checked={pledged} onChange={e => setPledged(e.target.checked)} className="mt-1 h-5 w-5" />
                    <span className="text-sm font-bold text-gray-900">위 교육을 받았고 서약 내용을 읽고 동의합니다.</span>
                  </label>
                </section>

                <section>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="font-extrabold text-gray-900 flex items-center gap-1.5"><PenLine className="h-5 w-5 text-gray-700" />4. 서명</p>
                    <button type="button" onClick={() => padRef.current?.clear()} className="h-9 px-3 rounded-full border-2 border-gray-300 text-sm font-bold text-gray-600 flex items-center gap-1 active:scale-95"><Eraser className="h-4 w-4" />지우기</button>
                  </div>
                  <SignaturePad ref={padRef} height={160} onChange={setHasInk} />
                </section>

                {sheetError && <p className="text-sm font-bold text-red-600">{sheetError}</p>}

                <button type="button" onClick={submit} disabled={!!pending || last4.length !== 4 || siteCode.length !== 6 || !pledged || !hasInk}
                  className="h-14 w-full rounded-2xl bg-gray-900 text-white text-lg font-extrabold active:scale-[0.98] disabled:opacity-40">
                  {pending ? '저장 중…' : picked.status ? '서명하고 확인' : '서명하고 출석'}
                </button>
                <p className="text-xs text-gray-500">서명 시각과 기기 정보가 출석 기록과 함께 저장되고, 출석부 서명란에 찍힙니다.</p>
                <p className="text-xs text-gray-500">위치: {fix === 'asking' ? '확인 중…' : fix ? `확인됨 (오차 ±${fix.acc}m) · 현장과의 거리가 기록됩니다` : '허용 안 됨 · 거리 기록 없이 출석됩니다'}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
