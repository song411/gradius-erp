'use client'

// 손가락 서명판 — 캔버스에 선을 긋고 PNG(data URL)로 꺼낸다
// ─────────────────────────────────────────────────────────
// 휴대폰 화면 폭에 맞춰 늘어나고, 고해상도 화면에서도 선이 뭉개지지 않게 devicePixelRatio 만큼 키워 그린다.

import { forwardRef, useImperativeHandle, useRef, useEffect, useState } from 'react'

export interface SignaturePadHandle {
  /** 선이 하나라도 있으면 PNG data URL, 없으면 null */
  toDataURL: () => string | null
  clear: () => void
}

const SignaturePad = forwardRef<SignaturePadHandle, { height?: number; onChange?: (hasInk: boolean) => void }>(
  function SignaturePad({ height = 180, onChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const drawing = useRef(false)
    const last = useRef<{ x: number; y: number } | null>(null)
    const [hasInk, setHasInk] = useState(false)

    // 캔버스 실제 픽셀 크기를 화면 크기 × DPR 로 맞춘다
    useEffect(() => {
      const c = canvasRef.current
      if (!c) return
      const resize = () => {
        const dpr = window.devicePixelRatio || 1
        const w = c.clientWidth
        // 크기를 바꾸면 내용이 지워지므로 그려 둔 것을 옮겨 담는다
        const keep = c.width > 0 && c.height > 0 ? c.toDataURL() : null
        c.width = Math.round(w * dpr); c.height = Math.round(height * dpr)
        const ctx = c.getContext('2d')
        if (!ctx) return
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.5; ctx.strokeStyle = '#111'
        if (keep) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, w, height); img.src = keep }
      }
      resize()
      window.addEventListener('resize', resize)
      return () => window.removeEventListener('resize', resize)
    }, [height])

    function pos(e: React.PointerEvent<HTMLCanvasElement>) {
      const r = e.currentTarget.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    function down(e: React.PointerEvent<HTMLCanvasElement>) {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      drawing.current = true
      last.current = pos(e)
    }
    function move(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawing.current || !last.current) return
      e.preventDefault()
      const ctx = e.currentTarget.getContext('2d')
      if (!ctx) return
      const p = pos(e)
      ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke()
      last.current = p
      if (!hasInk) { setHasInk(true); onChange?.(true) }
    }
    function up(e: React.PointerEvent<HTMLCanvasElement>) {
      if (drawing.current && last.current) {
        // 점 하나만 찍어도 보이게
        const ctx = e.currentTarget.getContext('2d')
        if (ctx) { ctx.beginPath(); ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill() }
        if (!hasInk) { setHasInk(true); onChange?.(true) }
      }
      drawing.current = false; last.current = null
    }

    useImperativeHandle(ref, () => ({
      toDataURL: () => (hasInk && canvasRef.current ? canvasRef.current.toDataURL('image/png') : null),
      clear: () => {
        const c = canvasRef.current
        const ctx = c?.getContext('2d')
        if (c && ctx) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore() }
        setHasInk(false); onChange?.(false)
      },
    }), [hasInk, onChange])

    return (
      <div className="relative rounded-2xl border-2 border-dashed border-gray-400 bg-white overflow-hidden" style={{ height }}>
        {!hasInk && <p className="absolute inset-0 flex items-center justify-center text-gray-300 text-base pointer-events-none select-none">여기에 손가락으로 서명해 주세요</p>}
        <canvas ref={canvasRef} className="block w-full h-full touch-none" style={{ height }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
      </div>
    )
  },
)

export default SignaturePad
