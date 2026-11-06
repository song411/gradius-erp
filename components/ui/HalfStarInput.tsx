'use client'

// 반 개 단위 별점 입력 — 휴대폰 현장 화면과 PC 현장 평가 모드가 같이 쓴다
// ─────────────────────────────────────────────────────────
// 별 하나가 왼쪽 반(x.5)·오른쪽 반(x) 두 개의 버튼이다. 엄지로 누르는 걸 전제로
// 별 하나를 40~56px 로 크게 둔다. 값은 lib/evaluation 의 snapHalf 로만 바뀐다(0.5~5).

import { Star } from 'lucide-react'
import { snapHalf } from '@/lib/evaluation'

type Size = 'md' | 'lg'

// md 는 360px 폰에서 "라벨 + 별 다섯 + 점수" 가 한 줄(약 260px)에 들어가는 크기
const BOX: Record<Size, string>  = { md: 'h-9 w-9', lg: 'h-14 w-14' }
const ICON: Record<Size, string> = { md: 'h-7 w-7', lg: 'h-11 w-11' }

export function HalfStarInput({ value, onChange, size = 'md', tone = 'amber', className = '' }: {
  value: number
  onChange: (v: number) => void
  size?: Size
  /** amber = 현장 화면, purple = 출석부 현장 평가 모드 */
  tone?: 'amber' | 'purple'
  className?: string
}) {
  const on = tone === 'purple' ? 'text-purple-500 fill-purple-500' : 'text-amber-400 fill-amber-400'
  return (
    <div role="group" aria-label="별점" className={`flex items-center gap-0.5 ${className}`}>
      {[1, 2, 3, 4, 5].map(i => {
        const fill = value >= i ? 'full' : value >= i - 0.5 ? 'half' : 'none'
        return (
          <div key={i} className={`relative shrink-0 ${BOX[size]}`}>
            {/* 바탕 별(빈 별) */}
            <Star className={`absolute inset-0 m-auto ${ICON[size]} text-gray-300`} />
            {/* 채워진 별 — 반 개면 왼쪽 절반만 보이게 자른다 */}
            {fill !== 'none' && (
              <Star className={`absolute inset-0 m-auto ${ICON[size]} ${on}`}
                style={fill === 'half' ? { clipPath: 'inset(0 50% 0 0)' } : undefined} />
            )}
            {/* 누르는 영역: 왼쪽 반 = i-0.5, 오른쪽 반 = i */}
            <button type="button" aria-label={`${i - 0.5}점`} aria-pressed={value === i - 0.5}
              onClick={() => onChange(snapHalf(i - 0.5))}
              className="absolute inset-y-0 left-0 w-1/2 rounded-l-lg active:bg-black/5" />
            <button type="button" aria-label={`${i}점`} aria-pressed={value === i}
              onClick={() => onChange(snapHalf(i))}
              className="absolute inset-y-0 right-0 w-1/2 rounded-r-lg active:bg-black/5" />
          </div>
        )
      })}
    </div>
  )
}
