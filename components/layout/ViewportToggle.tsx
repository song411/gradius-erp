'use client'

import { useEffect, useState } from 'react'
import { Monitor, Smartphone } from 'lucide-react'

const STORAGE_KEY = 'erp_viewport_mode'
const DESKTOP_VIEWPORT = 'width=1280, initial-scale=0.35'
const MOBILE_VIEWPORT  = 'width=device-width, initial-scale=1'

export default function ViewportToggle() {
  const [isDesktop, setIsDesktop] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
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
  }, [])

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

  if (!visible) return null

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
