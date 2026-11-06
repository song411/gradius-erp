'use client'

// 크루 얼굴 사진 — 비공개 버킷의 경로를 받아 서명된 주소로 보여 준다. 없으면 이름 첫 글자.
// 같은 경로는 한 번만 서명 주소를 받는다(화면에 여러 번 나와도 요청 한 번).

import { useEffect, useState } from 'react'
import { signedPhotoUrl, CREW_BUCKET } from '@/lib/photos'

const cache = new Map<string, Promise<string>>()
function urlFor(path: string): Promise<string> {
  let p = cache.get(path)
  if (!p) { p = signedPhotoUrl(CREW_BUCKET, path); cache.set(path, p); p.catch(() => cache.delete(path)) }
  return p
}

export default function CrewPhoto({ path, name, size = 40, className = '' }: {
  path?: string | null
  name?: string | null
  size?: number
  className?: string
}) {
  const [url, setUrl] = useState<{ path: string; url: string } | null>(null)
  useEffect(() => {
    if (!path) return
    let alive = true
    urlFor(path).then(u => { if (alive) setUrl({ path, url: u }) }).catch(() => { /* 사진 없이 */ })
    return () => { alive = false }
  }, [path])

  const style = { width: size, height: size }
  if (path && url?.path === path) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url.url} alt={name || '크루'} style={style} className={`rounded-full object-cover shrink-0 bg-gray-100 ${className}`} />
  }
  return (
    <div style={{ ...style, fontSize: Math.max(11, Math.round(size * 0.38)) }}
      className={`rounded-full bg-gray-200 text-gray-600 flex items-center justify-center font-bold shrink-0 ${className}`}>
      {(name || '?')[0]}
    </div>
  )
}
