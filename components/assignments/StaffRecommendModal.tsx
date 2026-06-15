'use client'

import { useEffect, useState } from 'react'
import { db } from '@/lib/supabase/api'
import type { Staff, Inquiry, Assignment } from '@/lib/supabase/types'
import { X, Sparkles, UserPlus, AlertTriangle, CheckCircle2, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface RecommendResult {
  staff: Staff
  score: number
  reasons: string[]
  conflict: Assignment | null  // 겹치는 배정
}

interface Props {
  inquiry: Inquiry
  onClose: () => void
  onSelect: (staff: Staff) => void  // 배정에 추가 콜백
}

// 점수 계산
function calcScore(
  staff: Staff,
  inquiry: Inquiry,
  history: Assignment[],   // 해당 크루의 전체 배정 이력
  conflict: Assignment | null,
): { score: number; reasons: string[] } {
  let score = 0
  const reasons: string[] = []

  // 1. 지역 일치 (+25)
  const location = (inquiry.location || '').toLowerCase()
  const region   = (staff.region   || '').toLowerCase()
  if (region && location && (location.includes(region) || region.includes(location.slice(0, 2)))) {
    score += 25
    reasons.push(`${staff.region} 지역`)
  }

  // 2. 직무 경험 (+최대 20 = 회당 4, 최대 5회)
  const serviceType = inquiry.service_type || ''
  const sameJobCount = serviceType
    ? history.filter(a =>
        a.job_type && serviceType && (
          a.job_type.includes(serviceType) || serviceType.includes(a.job_type)
        )
      ).length
    : 0
  if (sameJobCount > 0) {
    const pts = Math.min(sameJobCount * 4, 20)
    score += pts
    reasons.push(`유사 직무 ${sameJobCount}회 경험`)
  }

  // 3. 종합 평점 (+최대 20)
  const totalScore = staff.total_score || 0
  if (totalScore > 0) {
    const pts = Math.round(totalScore * 4)
    score += pts
    reasons.push(`평점 ${totalScore.toFixed(1)}점`)
  }

  // 4. 근태 평점 (+최대 10)
  const attScore = staff.attendance_score || 0
  if (attScore > 0) {
    score += Math.round(attScore * 2)
  }

  // 5. 팀워크 평점 (+최대 5)
  const teamScore = staff.teamwork_score || 0
  if (teamScore > 0) {
    score += Math.round(teamScore * 1)
  }

  // 6. 같은 고객사 경험 (+10)
  const companyName = inquiry.company_name || ''
  const sameClient = history.some(a => a.event_name && companyName &&
    a.event_name.includes(companyName.slice(0, 2)))
  if (sameClient && companyName) {
    score += 10
    reasons.push(`${companyName} 경험`)
  }

  // 7. 최근 3개월 활동 (+5)
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const recentActivity = history.some(a => new Date(a.assigned_at) >= threeMonthsAgo)
  if (recentActivity) {
    score += 5
    reasons.push('최근 활동 중')
  }

  // 8. 추천 등급 (+5)
  if (staff.recommend === '우선투입') {
    score += 5
    reasons.push('우선투입 등급')
  }

  // 날짜 겹침 시 점수 표시용 패널티 (제외하지 않음, UI에서 별도 표시)
  if (conflict) {
    score = Math.max(0, score - 10)  // 가벼운 패널티만
  }

  return { score, reasons }
}

// 날짜 겹침 체크
function checkConflict(
  assignments: Assignment[],
  inquiryStart?: string,
  inquiryEnd?: string,
): Assignment | null {
  if (!inquiryStart) return null
  const iStart = new Date(inquiryStart)
  const iEnd   = inquiryEnd ? new Date(inquiryEnd) : iStart

  return assignments.find(a => {
    if (a.status === '취소') return false
    const aStart = a.start_date ? new Date(a.start_date) : null
    const aEnd   = a.end_date   ? new Date(a.end_date)   : aStart
    if (!aStart) return false
    return aStart <= iEnd && aEnd! >= iStart
  }) ?? null
}

export default function StaffRecommendModal({ inquiry, onClose, onSelect }: Props) {
  const [results, setResults] = useState<RecommendResult[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function run() {
      setLoading(true)
      // 전체 크루 + 전체 배정 이력 로드
      const [staffList, allAssignments] = await Promise.all([
        db.list<Staff>('staff', { order: 'total_score', asc: false, limit: 200 }),
        db.list<Assignment>('assignments', { order: 'assigned_at', asc: false, limit: 500 }),
      ])

      const computed: RecommendResult[] = staffList.map(staff => {
        const history  = allAssignments.filter(a => a.staff_id === staff.id)
        const conflict = checkConflict(history, inquiry.event_start, inquiry.event_end)
        const { score, reasons } = calcScore(staff, inquiry, history, conflict)
        return { staff, score, reasons, conflict }
      })

      // 점수 내림차순 정렬
      computed.sort((a, b) => b.score - a.score)
      setResults(computed)
      setLoading(false)
    }
    run()
  }, [inquiry])

  const available  = results.filter(r => !r.conflict)
  const conflicted = results.filter(r => r.conflict)

  function ScoreBar({ score }: { score: number }) {
    const pct = Math.min(100, score)
    const color = pct >= 70 ? 'bg-emerald-500' : pct >= 45 ? 'bg-yellow-400' : 'bg-gray-300'
    return (
      <div className="flex items-center gap-2 mt-1">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] font-bold text-gray-500 w-8 text-right">{score}점</span>
      </div>
    )
  }

  function StaffCard({ r, showConflict }: { r: RecommendResult; showConflict: boolean }) {
    return (
      <div className={`flex items-start gap-3 p-3 rounded-xl border transition-all
        ${showConflict
          ? 'bg-amber-50 border-amber-200'
          : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-sm'
        }`}>
        {/* 아바타 */}
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0
          ${showConflict ? 'bg-amber-400' : 'bg-gradient-to-br from-blue-500 to-indigo-600'}`}>
          {r.staff.name[0]}
        </div>

        {/* 정보 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-800 text-sm">{r.staff.name}</span>
            {r.staff.recommend === '우선투입' && (
              <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">우선투입</span>
            )}
            {r.staff.recommend === '보류' && (
              <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">보류</span>
            )}
            {showConflict && (
              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5">
                <AlertTriangle className="h-2.5 w-2.5" />일정 겹침
              </span>
            )}
          </div>

          {/* 추천 이유 */}
          <p className="text-[11px] text-gray-500 mt-0.5">
            {r.reasons.length > 0 ? r.reasons.join(' · ') : '데이터 부족'}
          </p>

          {/* 겹치는 행사 안내 */}
          {showConflict && r.conflict && (
            <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1">
              <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
              {r.conflict.event_name || '(행사명 없음)'}
              {r.conflict.start_date && ` (${r.conflict.start_date}${r.conflict.end_date ? ` ~ ${r.conflict.end_date}` : ''})`}
            </p>
          )}

          <ScoreBar score={r.score} />
        </div>

        {/* 버튼 */}
        <Button size="sm"
          onClick={() => onSelect(r.staff)}
          className={`shrink-0 text-xs h-7 ${showConflict
            ? 'bg-amber-500 hover:bg-amber-600 text-white'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}>
          <UserPlus className="h-3 w-3 mr-1" />
          추가
        </Button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden w-full max-w-lg"
        style={{ maxHeight: '85vh' }}>

        {/* 헤더 */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-5 py-4 flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-bold text-sm leading-tight">추천 인력</h2>
            <p className="text-blue-200 text-xs mt-0.5 truncate">
              {inquiry.event_name} · {inquiry.event_start} ~ {inquiry.event_end || '미정'}
            </p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <>
              {/* 가능 인력 */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-bold text-gray-700">배정 가능 ({available.length}명)</span>
                </div>
                <div className="space-y-2">
                  {available.slice(0, 10).map(r => (
                    <StaffCard key={r.staff.id} r={r} showConflict={false} />
                  ))}
                  {available.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">가능한 인력이 없습니다</p>
                  )}
                </div>
              </div>

              {/* 겹침 인력 */}
              {conflicted.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-bold text-gray-700">일정 겹침 — 확인 후 배정 가능 ({conflicted.length}명)</span>
                  </div>
                  <div className="space-y-2">
                    {conflicted.slice(0, 5).map(r => (
                      <StaffCard key={r.staff.id} r={r} showConflict={true} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 푸터 */}
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 shrink-0">
          <p className="text-[10px] text-gray-400 text-center">
            점수 기준: 지역·직무 경험·평점·고객사 이력·활동 여부 종합 산정
          </p>
        </div>
      </div>
    </div>
  )
}
