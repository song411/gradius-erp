'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Monitor, Smartphone } from 'lucide-react'

const STORAGE_KEY = 'erp_viewport_mode'
const DESKTOP_VIEWPORT = 'width=1280, initial-scale=0.35'
const MOBILE_VIEWPORT  = 'width=device-width, initial-scale=1'

export default function ViewportToggle() {
  const pathname = usePathname()
  // 휴대폰 틀(/m)과 크루 공개 페이지(/c 체크인, /s 서명)에서는 손대지 않는다 — 저장된 '데스크탑 모드'도 적용하지 않고
  // 버튼도 안 보인다. 크루 화면은 전부 휴대폰 기준 (사장님 2026-11-06)
  const skip = pathname === '/m' || pathname.startsWith('/m/') || pathname.startsWith('/today')
    || pathname.startsWith('/c/') || pathname.startsWith('/s/')
  const [isDesktop, setIsDesktop] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // 건너뛰는 화면이면 혹시 남아 있을 데스크탑 폭을 휴대폰 폭으로 되돌려 둔다
    if (skip) { applyMode(false); return }
    // 모바일 기기에서만 버튼 표시 (터치 스크린 감지)
    const isMobileDevice = window.matchMedia('(max-width: 1024px)').matches
    if (!isMobileDevice) return
    setVisible(true)

    // 저장된 설정 불러오기
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'desktop') {
      applyMode(true)
      setIsDesktop(true)
    }
  }, [skip])

  function applyMode(desktop: boolean) {
    let meta = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'viewport'
      document.head.appendChild(meta)
    }
    meta.content = desktop ? DESKTOP_VIEWPORT : MOBILE_VIEWPORT
  }

  function toggle() {
    const next = !isDesktop
    applyMode(next)
    setIsDesktop(next)
    localStorage.setItem(STORAGE_KEY, next ? 'desktop' : 'mobile')
  }

  if (!visible || skip) return null

  return (
    <button
      onClick={toggle}
      title={isDesktop ? '모바일 모드로 전환' : '데스크탑 모드로 전환'}
      className="fixed bottom-5 right-5 z-50 flex items-center gap-1.5 px-3 py-2 rounded-full shadow-lg text-xs font-semibold transition-all active:scale-95"
      style={{
        background: isDesktop ? '#1e40af' : '#374151',
        color: '#fff',
        boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
      }}
    >
      {isDesktop ? (
        <><Smartphone className="h-3.5 w-3.5" />모바일</>
      ) : (
        <><Monitor className="h-3.5 w-3.5" />데스크탑</>
      )}
    </button>
  )
}
