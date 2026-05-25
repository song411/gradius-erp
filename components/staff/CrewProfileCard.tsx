'use client'

import { useState } from 'react'
import type { Staff } from '@/lib/supabase/types'
import { X, Edit2, Star, Phone, MapPin, Languages, Car, CreditCard, FileText, Eye, EyeOff, IdCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { motion, AnimatePresence } from 'framer-motion'

// 추천등급별 헤더 테마
const THEME: Record<string, { bg: string; badge: string; text: string; ring: string }> = {
  '우선투입': {
    bg:    'from-emerald-600 to-teal-500',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    text:  'text-emerald-600',
    ring:  'ring-emerald-400',
  },
  '일반': {
    bg:    'from-blue-600 to-indigo-500',
    badge: 'bg-blue-100 text-blue-800 border-blue-200',
    text:  'text-blue-600',
    ring:  'ring-blue-400',
  },
  '보류': {
    bg:    'from-orange-500 to-amber-400',
    badge: 'bg-orange-100 text-orange-800 border-orange-200',
    text:  'text-orange-600',
    ring:  'ring-orange-400',
  },
}

// 점수 바 (0~5 범위)
function ScoreBar({ label, score, max = 5 }: { label: string; score: number; max?: number }) {
  const pct = Math.min(100, Math.round((score / max) * 100))
  const color = pct >= 80 ? 'bg-emerald-400' : pct >= 60 ? 'bg-blue-400' : pct >= 40 ? 'bg-yellow-400' : 'bg-red-400'
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-gray-500">{label}</span>
        <span className="font-semibold text-gray-700">{score}<span className="text-gray-400">/{max}</span></span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// 평균 점수 원형 게이지 (4개 항목의 평균, 0~5점 만점)
function ScoreCircle({ attendance, performance, appearance, teamwork }: {
  attendance: number; performance: number; appearance: number; teamwork: number
}) {
  const filled  = [attendance, performance, appearance, teamwork].filter(v => v > 0).length
  const avg     = filled > 0
    ? (attendance + performance + appearance + teamwork) / 4
    : 0
  const pct     = Math.min(100, (avg / 5) * 100)
  const r       = 36
  const circ    = 2 * Math.PI * r
  const dash    = circ * (pct / 100)
  const color   = avg >= 4 ? '#10B981' : avg >= 3 ? '#3B82F6' : avg >= 2 ? '#EAB308' : '#EF4444'

  return (
    <div className="flex flex-col items-center">
      <svg width="88" height="88" className="-rotate-90">
        <circle cx="44" cy="44" r={r} fill="none" stroke="#e5e7eb" strokeWidth="7" />
        <circle
          cx="44" cy="44" r={r} fill="none"
          stroke={color} strokeWidth="7"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="-mt-16 flex flex-col items-center">
        <span className="text-2xl font-bold text-gray-800">
          {avg > 0 ? avg.toFixed(1) : '-'}
        </span>
        <span className="text-[10px] text-gray-400 -mt-0.5">/ 5.0</span>
      </div>
      <span className="mt-10 text-xs font-semibold text-gray-500">평균 점수</span>
    </div>
  )
}

interface Props {
  staff: Staff
  onClose: () => void
  onEdit: (staff: Staff) => void
}

export default function CrewProfileCard({ staff, onClose, onEdit }: Props) {
  const theme = THEME[staff.recommend] || THEME['일반']
  const [showId, setShowId] = useState(false) // 주민등록번호 표시 토글

  const englishLabel: Record<string, string> = {
    '하': '영어 기초 (하)',
    '중': '영어 가능 (중)',
    '상': '영어 능숙 (상)',
    '원어민': '영어 원어민',
  }

  return (
    // 오버레이
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
    >
      {/* 카드 본체 */}
      <motion.div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 배너 */}
        <div className={`bg-gradient-to-r ${theme.bg} px-6 pt-6 pb-10 relative`}>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-end gap-5">
            {/* 아바타 */}
            <div className={`w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-3xl font-bold ring-2 ring-offset-2 ring-offset-transparent ${theme.ring} shadow-lg shrink-0`}>
              {staff.name[0]}
            </div>

            <div className="pb-1 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl font-bold text-white">{staff.name}</h2>
                {staff.certifications?.includes('본사직원') && (
                  <span className="text-xs bg-white/20 text-white rounded-full px-2 py-0.5 font-semibold">[본사]</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {staff.gender && <span className="text-white/80 text-sm">{staff.gender}</span>}
                {staff.age    && <span className="text-white/80 text-sm">· {staff.age}세</span>}
                {staff.height && <span className="text-white/80 text-sm">· {staff.height}cm</span>}
              </div>
              <span className={`inline-block mt-2 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${theme.badge} bg-white`}>
                {staff.recommend === '우선투입' && <Star className="inline h-3 w-3 mr-0.5 fill-current" />}
                {staff.recommend}
              </span>
            </div>
          </div>
        </div>

        {/* 본문 */}
        <div className="px-6 pb-6 -mt-4">
          <div className="grid grid-cols-3 gap-4">

            {/* 왼쪽: 점수 */}
            <div className="col-span-1 bg-gray-50 rounded-xl p-4 flex flex-col items-center gap-3">
              <ScoreCircle
                  attendance={staff.attendance_score}
                  performance={staff.performance_score}
                  appearance={staff.appearance_score}
                  teamwork={staff.teamwork_score}
                />
              <div className="w-full space-y-2">
                <ScoreBar label="근태" score={staff.attendance_score} max={5} />
                <ScoreBar label="수행능력" score={staff.performance_score} max={5} />
                <ScoreBar label="외모/용모" score={staff.appearance_score} max={5} />
                <ScoreBar label="팀워크" score={staff.teamwork_score} max={5} />
              </div>
            </div>

            {/* 오른쪽: 상세 정보 */}
            <div className="col-span-2 space-y-3 pt-4">

              {/* 가능 직무 */}
              {(staff.available_jobs || []).length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">가능 직무</p>
                  <div className="flex flex-wrap gap-1.5">
                    {staff.available_jobs!.map((job, i) => (
                      <span key={i} className="text-xs bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-2.5 py-0.5 font-medium">
                        {job}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 자격증 */}
              {(staff.certifications || []).filter(c => c !== '본사직원').length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">자격증 · 특기</p>
                  <div className="flex flex-wrap gap-1.5">
                    {staff.certifications!.filter(c => c !== '본사직원').map((c, i) => (
                      <span key={i} className="text-xs bg-purple-50 text-purple-700 border border-purple-100 rounded-full px-2.5 py-0.5 font-medium">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 기본 정보 */}
              <div className="grid grid-cols-2 gap-2">
                {staff.region && (
                  <InfoChip icon={<MapPin className="h-3.5 w-3.5" />} label="이동 가능 지역" value={staff.region} />
                )}
                {staff.english_skill && (
                  <InfoChip icon={<Languages className="h-3.5 w-3.5" />} label="영어 능력"
                    value={englishLabel[staff.english_skill] || staff.english_skill} />
                )}
                {staff.driving && (
                  <InfoChip icon={<Car className="h-3.5 w-3.5" />} label="운전면허" value={staff.driving} />
                )}
                {staff.phone && (
                  <InfoChip icon={<Phone className="h-3.5 w-3.5" />} label="연락처" value={staff.phone} />
                )}
                {staff.bank_name && staff.account_number && (
                  <InfoChip icon={<CreditCard className="h-3.5 w-3.5" />} label="계좌"
                    value={`${staff.bank_name} ${staff.account_number}`} className="col-span-2" />
                )}
                {staff.id_number && (
                  <div className="col-span-2 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1 text-gray-400">
                        <IdCard className="h-3.5 w-3.5" />
                        <span className="text-[10px] font-medium">주민등록번호</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowId(v => !v)}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                        title={showId ? '숨기기' : '보기'}
                      >
                        {showId ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <p className="text-xs font-semibold text-gray-700 font-mono tracking-wider">
                      {showId ? staff.id_number : '●●●●●●-●●●●●●●'}
                    </p>
                  </div>
                )}
              </div>

              {/* 메모 */}
              {staff.memo && (
                <div className="bg-yellow-50 border border-yellow-100 rounded-xl px-3 py-2.5">
                  <p className="text-[10px] font-semibold text-yellow-600 mb-1 flex items-center gap-1">
                    <FileText className="h-3 w-3" />메모
                  </p>
                  <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{staff.memo}</p>
                </div>
              )}
            </div>
          </div>

          {/* 하단 액션 */}
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>닫기</Button>
            <Button onClick={() => { onClose(); onEdit(staff) }} className="gap-1">
              <Edit2 className="h-3.5 w-3.5" />수정하기
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function InfoChip({
  icon, label, value, className = '',
}: { icon: React.ReactNode; label: string; value: string; className?: string }) {
  return (
    <div className={`bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 ${className}`}>
      <div className="flex items-center gap-1 text-gray-400 mb-0.5">
        {icon}
        <span className="text-[10px] font-medium">{label}</span>
      </div>
      <p className="text-xs font-semibold text-gray-700 truncate">{value}</p>
    </div>
  )
}
