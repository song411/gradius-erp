'use client'

// 알림 켜기/끄기 — 휴대폰 더보기 탭
// 안드로이드 크롬은 바로 된다. 아이폰은 홈 화면에 추가한 아이콘으로 연 상태에서만 된다 (iOS 16.4+).
import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Bell, BellOff, BellRing, Send } from 'lucide-react'

function b64ToU8(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

type Status = 'checking' | 'unsupported' | 'need-install' | 'off' | 'on' | 'blocked'

export default function PushSettings() {
  const [status, setStatus]   = useState<Status>('checking')
  const [busy, setBusy]       = useState(false)
  const [devices, setDevices] = useState<number | null>(null)
  const [label, setLabel]     = useState('')

  const refresh = useCallback(async () => {
    if (typeof window === 'undefined') return
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (!supported) { setStatus(ios && !standalone ? 'need-install' : 'unsupported'); return }
    if (Notification.permission === 'denied') { setStatus('blocked'); return }
    try {
      // 브라우저가 답을 안 주는 경우가 있다 — 3초 넘으면 '꺼짐'으로 보고 버튼을 보여준다
      const timeout = new Promise<null>(res => setTimeout(() => res(null), 3000))
      const probe = (async () => {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js')
        return reg ? await reg.pushManager.getSubscription() : null
      })()
      const sub = await Promise.race([probe, timeout])
      setStatus(sub ? 'on' : 'off')
    } catch { setStatus('off') }
    try {
      const r = await fetch('/api/push/subscribe', { cache: 'no-store' })
      const j = await r.json()
      setDevices(Array.isArray(j.devices) ? j.devices.length : null)
    } catch { /* 표시만 못 할 뿐 */ }
    try { setLabel(localStorage.getItem('push_label') || '') } catch { /* 무시 */ }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function enable() {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setStatus(perm === 'denied' ? 'blocked' : 'off'); toast.info('알림 권한을 허용해야 켤 수 있습니다.'); return }
      const keyRes = await fetch('/api/push/key', { cache: 'no-store' })
      const { publicKey, error } = await keyRes.json()
      if (!publicKey) throw new Error(error || '키를 받지 못했습니다')
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(publicKey) })
      const res = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON(), label: label.trim() }) })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || '저장 실패')
      try { localStorage.setItem('push_label', label.trim()) } catch { /* 무시 */ }
      toast.success('알림을 켰습니다. 테스트를 보내 확인해 보세요.')
      await refresh()
    } catch (e) {
      toast.error('알림 켜기 실패: ' + (e as Error).message)
    } finally { setBusy(false) }
  }

  async function disable() {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      const sub = reg ? await reg.pushManager.getSubscription() : null
      if (sub) {
        await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) })
        await sub.unsubscribe()
      }
      toast.success('이 기기의 알림을 껐습니다.')
      await refresh()
    } catch (e) {
      toast.error('끄기 실패: ' + (e as Error).message)
    } finally { setBusy(false) }
  }

  async function test(digest = false) {
    setBusy(true)
    try {
      const r = await fetch('/api/push/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ digest }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || '실패')
      toast.success(j.skipped ? j.skipped : `보냄 ${j.sent}대${j.failed ? ` · 실패 ${j.failed}대` : ''}. 잠시 뒤 알림을 확인하세요.`)
    } catch (e) {
      toast.error('테스트 실패: ' + (e as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <section className="rounded-2xl bg-white border-2 border-gray-200 p-4 space-y-3">
      <p className="font-bold text-gray-900 flex items-center gap-1.5 text-base">
        {status === 'on' ? <BellRing className="h-5 w-5 text-green-600" /> : <Bell className="h-5 w-5 text-gray-500" />}
        알림
        {devices !== null && <span className="text-2xs font-semibold text-gray-400 ml-auto">켜진 기기 {devices}대</span>}
      </p>
      <p className="text-sm text-gray-600 leading-relaxed">
        크루가 셀프 체크인하면, 현장 기록이 올라오면 휴대폰으로 알립니다. "지금 요약 받기"를 누르면 오늘 행사·연락할 문의·미수·반영 전 기록을 알림 한 줄로 받습니다.
      </p>

      {status === 'checking' && <p className="text-sm text-gray-400">확인 중…</p>}
      {status === 'need-install' && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">아이폰은 먼저 <b>홈 화면에 추가</b>한 아이콘으로 열어야 알림을 켤 수 있습니다. (Safari 공유 → 홈 화면에 추가)</p>
      )}
      {status === 'unsupported' && <p className="text-sm text-gray-500">이 브라우저는 알림을 지원하지 않습니다. 크롬(안드로이드)이나 홈 화면 앱(아이폰)으로 열어 주세요.</p>}
      {status === 'blocked' && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">알림이 차단되어 있습니다. 휴대폰 설정 → 이 사이트(앱) → 알림 허용으로 바꾼 뒤 다시 시도하세요.</p>}

      {status === 'off' && (
        <>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="이 기기 이름 (예: 사장님 아이폰)"
            className="h-11 w-full rounded-xl border-2 border-gray-300 bg-white px-3 text-sm focus:border-gray-900 focus:outline-none" />
          <button onClick={enable} disabled={busy} className="h-12 w-full rounded-xl bg-gray-900 text-white font-extrabold text-base active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2">
            <Bell className="h-5 w-5" />{busy ? '켜는 중…' : '이 기기에서 알림 켜기'}
          </button>
        </>
      )}
      {status === 'on' && (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => test(false)} disabled={busy} className="h-12 rounded-xl bg-blue-600 text-white font-bold text-sm active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5"><Send className="h-4 w-4" />테스트 보내기</button>
          <button onClick={() => test(true)} disabled={busy} className="h-12 rounded-xl bg-white border-2 border-blue-300 text-blue-700 font-bold text-sm active:scale-[0.98] disabled:opacity-50">지금 요약 받기</button>
          <button onClick={disable} disabled={busy} className="h-11 col-span-2 rounded-xl bg-white border-2 border-gray-300 text-gray-600 font-bold text-sm active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5"><BellOff className="h-4 w-4" />이 기기 알림 끄기</button>
        </div>
      )}
      <p className="text-2xs text-gray-400">테스트와 요약은 켜진 모든 기기로 갑니다.</p>
    </section>
  )
}
