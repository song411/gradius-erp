'use client'

// 근로계약서 서명 화면 (휴대폰) — 계약서 전문 → 손가락 서명 → 동의. 본인 확인은 두지 않는다(사장님 결정 2026-11-06)
// 서명이 끝나면 같은 링크가 서명 완료본이 된다 (근로자가 언제든 다시 열어 볼 수 있음 = 교부).

import { useRef, useState } from 'react'
import { CheckCircle2, Eraser, PenLine } from 'lucide-react'
import LaborContractDoc from '@/components/contracts/LaborContractDoc'
import SignaturePad, { type SignaturePadHandle } from '@/components/contracts/SignaturePad'
import { fmtSignedAt, type ContractFields } from '@/lib/laborContract'

export default function SignClient({ token, staffName, fields, status, signedAt, signatureData, stampSrc, contentHash }: {
  token: string
  staffName: string
  fields: ContractFields
  status: string
  signedAt?: string | null
  signatureData?: string | null
  stampSrc?: string | null
  contentHash?: string | null
}) {
  const padRef = useRef<SignaturePadHandle>(null)
  const [agreed, setAgreed]   = useState(false)
  const [hasInk, setHasInk]   = useState(false)
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')
  const [done, setDone]       = useState<{ signedAt: string; signature: string; hash: string } | null>(
    status === '서명완료' && signatureData ? { signedAt: signedAt || '', signature: signatureData, hash: contentHash || '' } : null,
  )

  async function submit() {
    setError('')
    const signature = padRef.current?.toDataURL()
    if (!signature) { setError('서명을 그려 주세요.'); return }
    if (!agreed) { setError('계약 내용 확인에 체크해 주세요.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, signature, agreed }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || '서명에 실패했습니다.'); return }
      setDone({ signedAt: data.signed_at, signature, hash: data.content_hash || '' })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      setError('연결에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    } finally { setBusy(false) }
  }

  const locked = status !== '대기' && !done

  return (
    <div className="min-h-screen bg-gray-100 pb-16">
      <header className="sticky top-0 z-10 bg-gray-900 text-white px-4 py-3">
        <p className="text-xs text-gray-300">주식회사 가디어스</p>
        <p className="text-base font-extrabold">{staffName ? `${staffName}님 ` : ''}근로계약서{done ? ' · 서명 완료' : ''}</p>
      </header>

      {done ? (
        <div className="mx-3 mt-3 rounded-2xl bg-green-50 border-2 border-green-300 p-4 flex items-start gap-3">
          <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
          <div>
            <p className="font-extrabold text-green-800">서명이 완료되었습니다.</p>
            <p className="text-sm text-green-700 mt-0.5">{done.signedAt ? fmtSignedAt(done.signedAt) : ''} · 이 링크를 열면 언제든 서명한 계약서를 다시 볼 수 있습니다.</p>
          </div>
        </div>
      ) : locked ? (
        <div className="mx-3 mt-3 rounded-2xl bg-gray-50 border-2 border-gray-300 p-4 text-sm text-gray-600">이 계약서는 서명을 받을 수 없는 상태입니다. 담당자에게 문의해 주세요.</div>
      ) : (
        <div className="mx-3 mt-3 rounded-2xl bg-white border-2 border-gray-200 p-4 text-sm text-gray-700">
          아래 계약서를 끝까지 읽어 주세요. 맨 아래에서 손가락으로 서명하면 끝납니다.
        </div>
      )}

      {/* 계약서 본문 — 휴대폰 폭에 맞춰 흐르게 */}
      <div className="mx-3 mt-3 rounded-2xl bg-white border border-gray-200 overflow-hidden">
        <LaborContractDoc fields={fields} fluid signature={done ? { dataUrl: done.signature, signedAt: done.signedAt } : undefined} stampSrc={stampSrc} seal={done?.hash ? { hash: done.hash } : undefined} />
      </div>

      {!done && !locked && (
        <div className="mx-3 mt-4 space-y-4">
          <section className="rounded-2xl bg-white border-2 border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="font-extrabold text-gray-900 flex items-center gap-1.5"><PenLine className="h-5 w-5 text-gray-700" />서명</p>
              <button type="button" onClick={() => padRef.current?.clear()} className="h-9 px-3 rounded-full border-2 border-gray-300 text-sm font-bold text-gray-600 flex items-center gap-1 active:scale-95"><Eraser className="h-4 w-4" />지우기</button>
            </div>
            <SignaturePad ref={padRef} onChange={setHasInk} />
          </section>

          <label className="flex items-start gap-3 rounded-2xl bg-white border-2 border-gray-200 p-4">
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-1 h-5 w-5" />
            <span className="text-sm text-gray-800">위 근로계약서의 내용을 모두 읽고 이해했으며, 이에 동의하고 계약서를 교부받았음을 확인합니다.</span>
          </label>

          {error && <p className="text-sm font-bold text-red-600 px-1">{error}</p>}

          <button type="button" onClick={submit} disabled={busy || !hasInk || !agreed}
            className="h-14 w-full rounded-2xl bg-gray-900 text-white text-lg font-extrabold active:scale-[0.98] disabled:opacity-40">
            {busy ? '저장 중…' : '서명하고 계약 완료'}
          </button>
          <p className="text-xs text-gray-500 px-1">서명 시각과 접속 기기 정보가 계약서와 함께 저장됩니다.</p>
        </div>
      )}
    </div>
  )
}
