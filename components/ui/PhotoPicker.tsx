'use client'

// 사진 고르기·미리보기·썸네일 — 현장 기록(휴대폰·PC)이 같이 쓴다
// ─────────────────────────────────────────────────────────
// PhotoPicker: 카메라/앨범에서 고른 파일을 미리 보여 주고 지울 수 있게. 올리는 건 저장 버튼을 누를 때(uploadPhoto).
// PhotoThumbs: 저장된 사진 주소를 작은 썸네일로. 누르면 새 탭에서 원본.

import { useEffect, useMemo } from 'react'
import { Camera, X } from 'lucide-react'
import type { PhotoRef } from '@/lib/photos'

export function PhotoPicker({ files, onChange, max = 6, size = 'md' }: {
  files: File[]
  onChange: (files: File[]) => void
  max?: number
  size?: 'md' | 'lg'
}) {
  const previews = useMemo(() => files.map(f => URL.createObjectURL(f)), [files])
  useEffect(() => () => { previews.forEach(u => URL.revokeObjectURL(u)) }, [previews])
  const box = size === 'lg' ? 'h-16 w-16' : 'h-12 w-12'
  return (
    <div className="flex flex-wrap items-center gap-2">
      {previews.map((src, i) => (
        <div key={i} className={`relative ${box} rounded-lg overflow-hidden border border-gray-300 bg-gray-100`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="h-full w-full object-cover" />
          <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} title="빼기"
            className="absolute -top-0 -right-0 h-5 w-5 rounded-bl-lg bg-black/60 text-white flex items-center justify-center"><X className="h-3 w-3" /></button>
        </div>
      ))}
      {files.length < max && (
        <label className={`${box} rounded-lg border-2 border-dashed border-gray-400 bg-white flex flex-col items-center justify-center text-gray-500 cursor-pointer active:scale-95`} title="사진 붙이기">
          <Camera className="h-5 w-5" />
          <span className="text-2xs font-bold">사진</span>
          <input type="file" accept="image/*" multiple className="hidden"
            onChange={e => { const picked = Array.from(e.target.files || []); if (picked.length) onChange([...files, ...picked].slice(0, max)); e.target.value = '' }} />
        </label>
      )}
    </div>
  )
}

export function PhotoThumbs({ photos, size = 'md' }: { photos?: PhotoRef[] | null; size?: 'sm' | 'md' }) {
  if (!photos || photos.length === 0) return null
  const box = size === 'sm' ? 'h-9 w-9' : 'h-14 w-14'
  return (
    <div className="flex flex-wrap gap-1.5">
      {photos.map((p, i) => (
        <a key={p.path || i} href={p.url} target="_blank" rel="noreferrer" title="원본 보기"
          className={`${box} rounded-md overflow-hidden border border-gray-200 bg-gray-100 block`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt="" loading="lazy" className="h-full w-full object-cover" />
        </a>
      ))}
    </div>
  )
}
