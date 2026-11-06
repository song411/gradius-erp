'use client'

// 공용 서명 링크 화면 (휴대폰) — 이름 목록 → 내 이름 누르기 → 전화 뒷 4자리 → 개인 계약서로 이동
// 서명이 끝난 이름은 회색으로 잠긴다. 잘못 서명했으면 사무실에서 '새 링크'를 만든다.

import { useState } from 'react'
import { CheckCircle2, ChevronRight, ShieldCheck, X } from 'lucide-react'

export interface GroupItem { id: string; name: string; signed: boolean; hasPhone: boolean }

export default function GroupSignClient({ eventName, companyName, period, items }: {
  eventName: string; companyName: string; period: string; items: GroupItem[]
}) {
  const [picked, setPicked] = useState<GroupItem | null>(null)
  const [last4, setLast4]   = useState('')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState('')

  function open(item: GroupItem) {
    if (item.signed) return
    setPicked(item); setLast4(''); setError('')
  }

  async function verify() {
    if (!picked) return
    if (!/^\d{4}$/.test(last4)) { setError('전화번호 뒷 4자리를 입력해 주세요.'); return }
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/sign/find', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contractId: picked.id, last4 }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.token) { setError(data.error || '확인에 실패했습니다.'); return }
      window.location.href = `/s/${data.token}`
    } catch {
      setError('연결에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    } finally { setBusy(false) }
  }

  const remaining = items.filter(i => !i.signed).length

  return (
    <div className="min-h-screen bg-gray-100 pb-16">
      <header className="sticky top-0 z-10 bg-gray-900 text-white px-4 py-3">
        <p className="text-xs text-gray-300">{companyName || '주식회사 가디어스'}</p>
        <p className="text-base font-extrabold">{eventName} 근로계약서 서명</p>
        {period && <p className="text-xs text-gray-300 mt-0.5">{period}</p>}
      </header>

      <div className="mx-3 mt-3 rounded-2xl bg-white border-2 border-gray-200 p-4 text-sm text-gray-700">
        본인 이름을 누르고 전화번호 뒷 4자리를 넣으면 내 계약서가 열립니다. 읽고 서명하면 끝입니다.
        {items.length > 0 && <span className="block mt-1 text-xs text-gray-500">서명 남은 사람 {remaining}명 / 전체 {items.length}명</span>}
      </div>

      {items.length === 0 ? (
        <p className="mx-3 mt-3 text-sm text-gray-500 text-center">아직 준비된 계약서가 없습니다. 담당자에게 문의해 주세요.</p>
      ) : (
        <ul className="mx-3 mt-3 space-y-2">
          {items.map(item => (
            <li key={item.id}>
              <button type="button" disabled={item.signed} onClick={() => open(item)}
                className={`w-full h-14 px-4 rounded-2xl border-2 flex items-center justify-between text-left active:scale-[0.99] ${
                  item.signed ? 'bg-gray-100 border-gray-200 text-gray-400' : 'bg-white border-gray-300 text-gray-900'}`}>
                <span className="text-lg font-extrabold">{item.name}</span>
                {item.signed
                  ? <span className="text-sm font-bold text-green-600 flex items-center gap-1"><CheckCircle2 className="h-5 w-5" />서명완료</span>
                  : <ChevronRight className="h-5 w-5 text-gray-400" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 본인 확인 */}
      {picked && (
        <div className="fixed inset-0 z-20 bg-black/40 flex items-end" onClick={() => !busy && setPicked(null)}>
          <div className="w-full bg-white rounded-t-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-base font-extrabold text-gray-900 flex items-center gap-1.5"><ShieldCheck className="h-5 w-5" />{picked.name}님 본인 확인</p>
              <button type="button" onClick={() => setPicked(null)} className="h-9 w-9 flex items-center justify-center text-gray-400"><X className="h-5 w-5" /></button>
            </div>
            {picked.hasPhone ? (
              <>
                <label className="text-sm text-gray-600 block mb-1">회사에 등록된 전화번호 뒷 4자리</label>
                <input value={last4} onChange={e => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" maxLength={4} placeholder="0000" autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') verify() }}
                  className="h-14 w-44 rounded-xl border-2 border-gray-300 px-4 text-2xl font-extrabold tracking-[0.3em] text-center focus:border-gray-900 focus:outline-none" />
                {error && <p className="text-sm font-bold text-red-600 mt-2">{error}</p>}
                <button type="button" onClick={verify} disabled={busy || last4.length !== 4}
                  className="mt-4 h-14 w-full rounded-2xl bg-gray-900 text-white text-lg font-extrabold active:scale-[0.98] disabled:opacity-40">
                  {busy ? '확인 중…' : '내 계약서 열기'}
                </button>
                <p className="text-xs text-gray-500 mt-2">본인이 아니면 열리지 않습니다. 번호가 바뀌었으면 담당자에게 알려 주세요.</p>
              </>
            ) : (
              <p className="text-sm text-gray-600">회사에 전화번호가 등록되어 있지 않아 여기서는 열 수 없습니다. 담당자에게 개인 링크를 요청해 주세요.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
