'use client'

import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/supabase/api'
import type { Staff } from '@/lib/supabase/types'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Search, Star, MapPin, Briefcase, UserCheck } from 'lucide-react'
import { formatKRW } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  // 배정 대상 직무 / 기본 단가 (견적에서 가져온 값)
  jobType: string
  defaultPayRate: number
  // 배정 콜백
  onAssign: (staff: Staff | null, staffName: string, staffType: string, payRate: number, jobType: string) => void
}

const JOB_OPTIONS = ['전체', '스탭', '스텝', '안전', '주차', '드라이버', '의전', '경호', '도슨트', '프로모터', '서빙', '설치', '경비', '나레이터', 'MC', '기타']
const REGION_OPTIONS = ['전체', '서울', '경기', '인천', '부산', '대구', '대전', '광주', '수원', '평택', '천안', '여주', '정선', '전국']
const RECOMMEND_OPTIONS = ['전체', '우선투입', '일반', '보류']
const GENDER_OPTIONS = ['전체', '남', '여']

function ScoreDots({ score }: { score: number }) {
  const s = Math.round(score)
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          className={`w-2 h-2 rounded-full ${i <= s ? 'bg-yellow-400' : 'bg-gray-200'}`}
        />
      ))}
    </div>
  )
}

export default function StaffSearchModal({ open, onClose, jobType, defaultPayRate, onAssign }: Props) {
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(false)

  // 필터 상태
  const [searchName, setSearchName] = useState('')
  const [filterGender, setFilterGender] = useState('전체')
  const [filterJob, setFilterJob] = useState('전체')
  const [filterRegion, setFilterRegion] = useState('전체')
  const [filterRecommend, setFilterRecommend] = useState('전체')
  const [minScore, setMinScore] = useState(0)

  // 선택된 스탭 + 배정 폼
  const [selected, setSelected] = useState<Staff | null>(null)
  const [assignPayRate, setAssignPayRate] = useState(String(defaultPayRate))
  const [assignJobType, setAssignJobType] = useState(jobType)
  const [assignStaffType, setAssignStaffType] = useState('외부')

  // 외부 직접 입력 모드
  const [manualMode, setManualMode] = useState(false)
  const [manualName, setManualName] = useState('')

  const loadStaff = useCallback(async () => {
    setLoading(true)
    const list = await db.list<Staff>('staff', {
      neqFilter: { recommend: '보류' },
      order: 'name', asc: true,
    })
    setStaffList(list)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (open) {
      loadStaff()
      setSelected(null)
      setManualMode(false)
      setManualName('')
      setAssignPayRate(String(defaultPayRate))
      setAssignJobType(jobType)
    }
  }, [open, defaultPayRate, jobType, loadStaff])

  // 필터링
  const filtered = staffList.filter(s => {
    const jobs = Array.isArray(s.available_jobs) ? s.available_jobs : []
    const nameOk = !searchName || (s.name || '').includes(searchName)
    const genderOk = filterGender === '전체' || s.gender === filterGender
    const jobOk = filterJob === '전체' || jobs.some(j => j.includes(filterJob) || filterJob.includes(j))
    const regionOk = filterRegion === '전체' || (s.region || '').includes(filterRegion)
    const recOk = filterRecommend === '전체' || s.recommend === filterRecommend
    const scoreOk = !minScore || (s.total_score || 0) >= minScore
    return nameOk && genderOk && jobOk && regionOk && recOk && scoreOk
  })

  function handleSelect(staff: Staff) {
    setSelected(staff)
    setManualMode(false)
    // 본사 직원이면 staffType = 본사, 아니면 외부
    setAssignStaffType('외부')
  }

  function handleConfirm() {
    const payRate = Number(assignPayRate) || 0
    if (manualMode) {
      if (!manualName.trim()) return
      onAssign(null, manualName.trim(), assignStaffType, payRate, assignJobType)
    } else {
      if (!selected) return
      onAssign(selected, selected.name, assignStaffType, payRate, assignJobType)
    }
    onClose()
  }

  const recommendBadge = (r: string) => {
    if (r === '우선투입') return 'bg-green-100 text-green-700'
    if (r === '보류') return 'bg-red-100 text-red-700'
    return 'bg-gray-100 text-gray-600'
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-w-4xl">
      <DialogHeader>
        <DialogTitle>스탭 검색 · 배정</DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>

      <DialogContent className="p-0">
        <div className="flex h-[600px]">
          {/* 좌: 검색 + 목록 */}
          <div className="flex-1 flex flex-col border-r border-gray-200">
            {/* 필터 바 */}
            <div className="p-3 border-b border-gray-100 space-y-2 bg-gray-50">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <Input
                    placeholder="이름 검색..."
                    value={searchName}
                    onChange={e => setSearchName(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                <Select value={filterGender} onChange={e => setFilterGender(e.target.value)} className="w-20 h-8 text-xs">
                  {GENDER_OPTIONS.map(g => <option key={g} value={g}>{g === '전체' ? '성별' : g}</option>)}
                </Select>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Select value={filterJob} onChange={e => setFilterJob(e.target.value)} className="h-7 text-xs flex-1 min-w-[80px]">
                  {JOB_OPTIONS.map(j => <option key={j} value={j}>{j === '전체' ? '직종 전체' : j}</option>)}
                </Select>
                <Select value={filterRegion} onChange={e => setFilterRegion(e.target.value)} className="h-7 text-xs flex-1 min-w-[80px]">
                  {REGION_OPTIONS.map(r => <option key={r} value={r}>{r === '전체' ? '지역 전체' : r}</option>)}
                </Select>
                <Select value={filterRecommend} onChange={e => setFilterRecommend(e.target.value)} className="h-7 text-xs flex-1 min-w-[80px]">
                  {RECOMMEND_OPTIONS.map(r => <option key={r} value={r}>{r === '전체' ? '추천 전체' : r}</option>)}
                </Select>
                <Select value={String(minScore)} onChange={e => setMinScore(Number(e.target.value))} className="h-7 text-xs w-24">
                  <option value="0">점수 전체</option>
                  <option value="3">3점 이상</option>
                  <option value="4">4점 이상</option>
                  <option value="5">5점</option>
                </Select>
              </div>
              <p className="text-xs text-gray-400">검색 결과: {filtered.length}명</p>
            </div>

            {/* 목록 */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-20">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex items-center justify-center h-20 text-gray-400 text-sm">검색 결과 없음</div>
              ) : (
                filtered.map(s => (
                  <div
                    key={s.id}
                    onClick={() => handleSelect(s)}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-gray-100 hover:bg-blue-50 transition-colors ${selected?.id === s.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
                  >
                    {/* 아바타 */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${s.gender === '여' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>
                      {s.name?.[0] || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium">{s.name}</span>
                        <span className="text-xs text-gray-400">{s.gender} {s.age ? `${s.age}세` : ''}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${recommendBadge(s.recommend)}`}>
                          {s.recommend}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <ScoreDots score={s.total_score || 0} />
                        {s.region && (
                          <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
                            <MapPin className="h-2.5 w-2.5" />{s.region.split(',')[0]}
                          </span>
                        )}
                        {Array.isArray(s.available_jobs) && s.available_jobs.length > 0 && (
                          <span className="text-[10px] text-gray-500">
                            {s.available_jobs.slice(0, 3).join('/')}
                          </span>
                        )}
                      </div>
                    </div>
                    {selected?.id === s.id && (
                      <UserCheck className="h-4 w-4 text-blue-600 shrink-0" />
                    )}
                  </div>
                ))
              )}
            </div>

            {/* 직접 입력 버튼 */}
            <div className="p-3 border-t border-gray-200">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => { setManualMode(true); setSelected(null) }}
              >
                + 스탭 DB에 없는 인력 직접 입력
              </Button>
            </div>
          </div>

          {/* 우: 배정 정보 입력 */}
          <div className="w-72 flex flex-col p-4 bg-gray-50">
            <h4 className="text-sm font-semibold text-gray-700 mb-4">배정 정보</h4>

            {!selected && !manualMode ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-400">
                <Search className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm">좌측에서 스탭을 선택하거나<br />직접 입력해주세요</p>
              </div>
            ) : (
              <div className="space-y-3 flex-1">
                {/* 선택된 스탭 정보 */}
                {selected && !manualMode && (
                  <div className="bg-white rounded-lg p-3 border border-blue-200">
                    <p className="text-sm font-semibold text-blue-800">{selected.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {selected.gender} · {selected.age}세 · ★{selected.total_score || 0}
                    </p>
                    {selected.region && (
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3" />{selected.region}
                      </p>
                    )}
                    {selected.phone && (
                      <p className="text-xs text-gray-500 mt-0.5">{selected.phone}</p>
                    )}
                  </div>
                )}

                {/* 직접 입력 */}
                {manualMode && (
                  <div>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">인력명 *</label>
                    <Input
                      value={manualName}
                      onChange={e => setManualName(e.target.value)}
                      placeholder="이름 입력"
                      className="h-8 text-sm"
                    />
                  </div>
                )}

                {/* 직무 */}
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block flex items-center gap-1">
                    <Briefcase className="h-3 w-3" /> 직무
                  </label>
                  <Input
                    value={assignJobType}
                    onChange={e => setAssignJobType(e.target.value)}
                    placeholder="행사스탭, 안전요원 등"
                    className="h-8 text-sm"
                  />
                </div>

                {/* 구분 */}
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">구분</label>
                  <Select value={assignStaffType} onChange={e => setAssignStaffType(e.target.value)} className="h-8 text-sm">
                    <option value="외부">외부 (지급 대상)</option>
                    <option value="본사">본사 (지급 불필요)</option>
                  </Select>
                </div>

                {/* 지급 단가 */}
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">
                    지급 단가 (일)
                    {defaultPayRate > 0 && (
                      <span className="text-gray-400 ml-1">견적: {formatKRW(defaultPayRate)}</span>
                    )}
                  </label>
                  <Input
                    type="number"
                    value={assignPayRate}
                    onChange={e => setAssignPayRate(e.target.value)}
                    placeholder="일당"
                    className="h-8 text-sm"
                  />
                  {assignPayRate && (
                    <p className="text-xs text-blue-600 mt-1">{formatKRW(Number(assignPayRate))}/일</p>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4 space-y-2">
              <Button
                className="w-full"
                onClick={handleConfirm}
                disabled={!selected && !manualMode || (manualMode && !manualName.trim())}
              >
                배정 확정
              </Button>
              <Button variant="outline" className="w-full" onClick={onClose}>취소</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
