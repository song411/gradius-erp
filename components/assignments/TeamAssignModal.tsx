'use client'

import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/supabase/api'
import type { Staff } from '@/lib/supabase/types'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Search, Plus, X, Users, UserCheck, UserX } from 'lucide-react'
import { formatKRW } from '@/lib/utils'

export interface TeamAssignData {
  leader: Staff
  leaderPresent: boolean        // 팀장 현장 참여 여부
  leaderJobType: string
  perPersonRate: number         // 1인 단가
  totalPayRate: number          // 팀 총 지급액 = 1인단가 × 현장참여인원 (팀장에게 일괄)
  presentCount: number          // 현장 참여 총 인원
  members: { name: string }[]  // 하위 멤버 (이름만)
}

interface Props {
  open: boolean
  onClose: () => void
  defaultJobType: string
  defaultPayRate: number
  onAssign: (data: TeamAssignData) => void
}

export default function TeamAssignModal({ open, onClose, defaultJobType, defaultPayRate, onAssign }: Props) {
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(false)
  const [searchName, setSearchName] = useState('')

  // 팀장 선택
  const [leader, setLeader] = useState<Staff | null>(null)
  const [leaderPresent, setLeaderPresent] = useState(true)
  const [leaderJobType, setLeaderJobType] = useState(defaultJobType)
  const [leaderPayRate, setLeaderPayRate] = useState(String(defaultPayRate))

  // 하위 멤버
  const [members, setMembers] = useState<{ name: string }[]>([{ name: '' }])

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
      setLeader(null)
      setLeaderPresent(true)
      setLeaderJobType(defaultJobType)
      setLeaderPayRate(String(defaultPayRate))
      setMembers([{ name: '' }])
      setSearchName('')
    }
  }, [open, defaultJobType, defaultPayRate, loadStaff])

  const filtered = staffList.filter(s =>
    !searchName || (s.name || '').includes(searchName)
  )

  function addMember() {
    setMembers(m => [...m, { name: '' }])
  }

  function removeMember(i: number) {
    setMembers(m => m.filter((_, idx) => idx !== i))
  }

  function updateMember(i: number, name: string) {
    setMembers(m => m.map((mem, idx) => idx === i ? { name } : mem))
  }

  function handleConfirm() {
    if (!leader) return
    const validMembers = members.filter(m => m.name.trim())
    const perPerson = Number(leaderPayRate) || 0
    onAssign({
      leader,
      leaderPresent,
      leaderJobType,
      perPersonRate: perPerson,
      totalPayRate: perPerson * totalHeadcount,
      presentCount: totalHeadcount,
      members: validMembers,
    })
    onClose()
  }

  const totalHeadcount = (leaderPresent ? 1 : 0) + members.filter(m => m.name.trim()).length

  return (
    <Dialog open={open} onClose={onClose} className="max-w-3xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-600" />
          팀 배정 (프리팀)
        </DialogTitle>
        <DialogClose onClose={onClose} />
      </DialogHeader>

      <DialogContent className="p-0">
        <div className="flex h-[560px]">

          {/* 좌: 팀장 선택 */}
          <div className="w-64 flex flex-col border-r border-gray-200">
            <div className="p-3 border-b border-gray-100 bg-gray-50">
              <p className="text-xs font-semibold text-gray-600 mb-2">① 팀장 선택</p>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input
                  placeholder="이름 검색..."
                  value={searchName}
                  onChange={e => setSearchName(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-16">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                </div>
              ) : filtered.map(s => {
                const isCompany = s.certifications?.includes('본사직원')
                return (
                  <div
                    key={s.id}
                    onClick={() => setLeader(s)}
                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-gray-100 hover:bg-blue-50 transition-colors ${leader?.id === s.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''}`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isCompany ? 'bg-purple-100 text-purple-700' : s.gender === '여' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>
                      {s.name?.[0] || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">
                        {isCompany && <span className="text-purple-600 font-bold">[본사] </span>}
                        {s.name}
                      </p>
                      <p className="text-[10px] text-gray-400">{s.gender} · ★{s.total_score || 0}</p>
                    </div>
                    {leader?.id === s.id && <UserCheck className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 우: 팀 구성 */}
          <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-4">

            {/* 팀장 정보 */}
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">② 팀장 설정</p>
              {!leader ? (
                <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center text-gray-400 text-xs">
                  좌측에서 팀장을 선택해주세요
                </div>
              ) : (
                <div className="bg-blue-50 rounded-lg p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">
                      {leader.name?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">
                        {leader.certifications?.includes('본사직원') && <span className="text-purple-600">[본사] </span>}
                        {leader.name} <span className="text-xs text-gray-500 font-normal">팀장</span>
                      </p>
                      {leader.phone && <p className="text-xs text-gray-500">{leader.phone}</p>}
                    </div>
                  </div>

                  {/* 팀장 현장 참여 여부 */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setLeaderPresent(true)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${leaderPresent ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-500 border-gray-200 hover:border-green-300'}`}
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      현장 참여
                    </button>
                    <button
                      onClick={() => setLeaderPresent(false)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${!leaderPresent ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-500 border-gray-200 hover:border-orange-300'}`}
                    >
                      <UserX className="h-3.5 w-3.5" />
                      현장 불참
                    </button>
                  </div>
                  {!leaderPresent && (
                    <p className="text-[11px] text-orange-600 bg-orange-50 rounded px-2 py-1">
                      팀장이 현장에 불참하더라도 지급액은 팀장에게 일괄 지급됩니다.
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block">직무</label>
                      <Input
                        value={leaderJobType}
                        onChange={e => setLeaderJobType(e.target.value)}
                        className="h-7 text-xs"
                        placeholder="행사스탭, 안전요원 등"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block">1인 단가</label>
                      <Input
                        type="number"
                        value={leaderPayRate}
                        onChange={e => setLeaderPayRate(e.target.value)}
                        className="h-7 text-xs"
                        placeholder="1인 기준 단가"
                      />
                    </div>
                  </div>
                  {leaderPayRate && (
                    <div className="bg-blue-50 rounded p-2 text-xs space-y-0.5">
                      <p className="text-gray-500">
                        현장 참여: <strong className="text-gray-800">{totalHeadcount}명</strong>
                        {' '}({leaderPresent ? '팀장 포함' : '팀장 불참'})
                      </p>
                      <p className="text-blue-700 font-semibold">
                        총 지급액: {formatKRW(Number(leaderPayRate))} × {totalHeadcount}명
                        {' = '}{formatKRW(Number(leaderPayRate) * totalHeadcount)}
                        {' → '}{leader.name}에게 일괄 지급
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 하위 멤버 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-600">③ 하위 멤버 (이름만 입력)</p>
                <span className="text-xs text-gray-400">현장 인원 합계: <strong className="text-gray-700">{totalHeadcount}명</strong></span>
              </div>
              <div className="space-y-1.5">
                {members.map((m, i) => (
                  <div key={i} className="flex gap-1.5">
                    <Input
                      value={m.name}
                      onChange={e => updateMember(i, e.target.value)}
                      placeholder={`멤버 ${i + 1} 이름`}
                      className="h-8 text-sm flex-1"
                    />
                    {members.length > 1 && (
                      <button
                        onClick={() => removeMember(i)}
                        className="text-gray-300 hover:text-red-400 shrink-0 px-1"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="mt-2 w-full text-xs h-7" onClick={addMember}>
                <Plus className="h-3.5 w-3.5" /> 멤버 추가
              </Button>
            </div>

            {/* 요약 */}
            {leader && (
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                <p className="font-semibold text-gray-700">배정 요약</p>
                <p>팀장: {leader.name} ({leaderPresent ? '현장참여' : '현장불참'})</p>
                <p>하위멤버: {members.filter(m => m.name.trim()).length}명</p>
              <p>현장 총인원: {totalHeadcount}명 ({leaderPresent ? '팀장 포함' : '팀장 불참'})</p>
              <p className="text-blue-700 font-medium">
                지급: {formatKRW(Number(leaderPayRate))} × {totalHeadcount}명 = {formatKRW(Number(leaderPayRate) * totalHeadcount)} → {leader.name} 일괄
              </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>취소</Button>
        <Button onClick={handleConfirm} disabled={!leader}>
          <Users className="h-4 w-4" />
          팀 배정 등록
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
