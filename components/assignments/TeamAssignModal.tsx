'use client'

import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/supabase/api'
import type { Staff } from '@/lib/supabase/types'
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Plus, X, Users, UserCheck, UserX } from 'lucide-react'
import { formatKRW } from '@/lib/utils'

// 멤버별 개별 단가 + 일수 포함
export interface TeamMember {
  name: string
  rate: number   // 개별 일급
  days: number   // 개별 참여 일수
}

export interface TeamAssignData {
  leader: Staff
  leaderPresent: boolean
  leaderJobType: string
  leaderRate: number      // 팀장 개별 일급
  leaderDays: number      // 팀장 참여 일수
  totalPayRate: number    // 합산 지급액 (팀장에게 일괄)
  members: TeamMember[]   // 이름 + 개별 단가 + 일수
  // 하위호환: 기존 코드가 참조하는 필드
  perPersonRate: number
  presentCount: number
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

  // 팀장
  const [leader, setLeader] = useState<Staff | null>(null)
  const [leaderPresent, setLeaderPresent] = useState(true)
  const [leaderJobType, setLeaderJobType] = useState(defaultJobType)
  const [leaderRate, setLeaderRate] = useState(String(defaultPayRate))
  const [leaderDays, setLeaderDays] = useState('1')

  // 하위 멤버 (이름 + 단가 + 일수)
  const [members, setMembers] = useState<TeamMember[]>([{ name: '', rate: defaultPayRate, days: 1 }])

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
      setLeaderRate(String(defaultPayRate))
      setLeaderDays('1')
      setMembers([{ name: '', rate: defaultPayRate, days: 1 }])
      setSearchName('')
    }
  }, [open, defaultJobType, defaultPayRate, loadStaff])

  const filtered = staffList.filter(s =>
    !searchName || (s.name || '').includes(searchName)
  )

  function addMember() {
    setMembers(m => [...m, { name: '', rate: Number(leaderRate) || 0, days: 1 }])
  }
  function removeMember(i: number) {
    setMembers(m => m.filter((_, idx) => idx !== i))
  }
  function updateMember(i: number, field: keyof TeamMember, value: string | number) {
    setMembers(m => m.map((mem, idx) => idx === i ? { ...mem, [field]: value } : mem))
  }

  // 유효 멤버 (이름 있는 것만)
  const validMembers = members.filter(m => m.name.trim())

  // 개별 금액 계산
  const leaderPay  = leaderPresent ? (Number(leaderRate) || 0) * (Number(leaderDays) || 1) : 0
  const memberPays = validMembers.map(m => (m.rate || 0) * (m.days || 1))
  const totalPay   = leaderPay + memberPays.reduce((s, v) => s + v, 0)
  const totalHeadcount = (leaderPresent ? 1 : 0) + validMembers.length

  function handleConfirm() {
    if (!leader) return
    onAssign({
      leader,
      leaderPresent,
      leaderJobType,
      leaderRate: Number(leaderRate) || 0,
      leaderDays: Number(leaderDays) || 1,
      totalPayRate: totalPay,
      members: validMembers,
      // 하위호환
      perPersonRate: Number(leaderRate) || 0,
      presentCount: totalHeadcount,
    })
    onClose()
  }

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
        <div className="flex h-[600px]">

          {/* 좌: 팀장 선택 */}
          <div className="w-56 flex flex-col border-r border-gray-200 shrink-0">
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
          <div className="flex-1 flex flex-col overflow-y-auto p-4 space-y-4">

            {/* ② 팀장 설정 */}
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">② 팀장 설정</p>
              {!leader ? (
                <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center text-gray-400 text-xs">
                  좌측에서 팀장을 선택해주세요
                </div>
              ) : (
                <div className="bg-blue-50 rounded-lg p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
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

                  {/* 현장 참여 여부 */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setLeaderPresent(true)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${leaderPresent ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-500 border-gray-200 hover:border-green-300'}`}
                    >
                      <UserCheck className="h-3.5 w-3.5" />현장 참여
                    </button>
                    <button
                      onClick={() => setLeaderPresent(false)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${!leaderPresent ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-500 border-gray-200 hover:border-orange-300'}`}
                    >
                      <UserX className="h-3.5 w-3.5" />현장 불참
                    </button>
                  </div>

                  {/* 팀장 단가 + 일수 */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block">직무</label>
                      <Input
                        value={leaderJobType}
                        onChange={e => setLeaderJobType(e.target.value)}
                        className="h-7 text-xs"
                        placeholder="직무"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block">일급 (원)</label>
                      <Input
                        type="number"
                        value={leaderRate}
                        onChange={e => setLeaderRate(e.target.value)}
                        className="h-7 text-xs"
                        placeholder="일급"
                        disabled={!leaderPresent}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 mb-1 block">참여 일수</label>
                      <Input
                        type="number"
                        value={leaderDays}
                        onChange={e => setLeaderDays(e.target.value)}
                        className="h-7 text-xs"
                        min={1}
                        placeholder="일수"
                        disabled={!leaderPresent}
                      />
                    </div>
                  </div>

                  {leaderPresent && (
                    <div className="bg-white rounded px-2 py-1 text-xs flex items-center gap-1 text-blue-700">
                      <span className="text-gray-500">팀장:</span>
                      {formatKRW(Number(leaderRate))} × {leaderDays}일 =
                      <strong>{formatKRW(leaderPay)}</strong>
                    </div>
                  )}
                  {!leaderPresent && (
                    <p className="text-[11px] text-orange-600 bg-orange-50 rounded px-2 py-1">
                      팀장 불참 — 지급액은 팀원 합산 후 팀장 명의로 일괄 지급됩니다.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ③ 하위 멤버 (개별 단가+일수) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-600">③ 하위 멤버 (개별 단가·일수 입력)</p>
                <span className="text-xs text-gray-400">총 {totalHeadcount}명</span>
              </div>

              {/* 헤더 */}
              <div className="grid grid-cols-[1fr_90px_60px_20px] gap-1.5 mb-1 px-1">
                <span className="text-[10px] text-gray-400">이름</span>
                <span className="text-[10px] text-gray-400">일급 (원)</span>
                <span className="text-[10px] text-gray-400">일수</span>
                <span />
              </div>

              <div className="space-y-1.5">
                {members.map((m, i) => (
                  <div key={i} className="grid grid-cols-[1fr_90px_60px_20px] gap-1.5 items-center">
                    <Input
                      value={m.name}
                      onChange={e => updateMember(i, 'name', e.target.value)}
                      placeholder={`멤버 ${i + 1} 이름`}
                      className="h-8 text-sm"
                    />
                    <Input
                      type="number"
                      value={m.rate || ''}
                      onChange={e => updateMember(i, 'rate', Number(e.target.value))}
                      placeholder="일급"
                      className="h-8 text-xs px-1"
                    />
                    <Input
                      type="number"
                      value={m.days || ''}
                      onChange={e => updateMember(i, 'days', Math.max(1, Number(e.target.value)))}
                      placeholder="일수"
                      className="h-8 text-xs px-1"
                      min={1}
                    />
                    {members.length > 1 ? (
                      <button onClick={() => removeMember(i)} className="text-gray-300 hover:text-red-400">
                        <X className="h-4 w-4" />
                      </button>
                    ) : <span />}
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="mt-2 w-full text-xs h-7" onClick={addMember}>
                <Plus className="h-3.5 w-3.5" /> 멤버 추가
              </Button>
            </div>

            {/* ④ 합산 요약 */}
            {leader && (
              <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1.5 border border-gray-200">
                <p className="font-semibold text-gray-700 mb-2">지급 내역 요약</p>

                {/* 팀장 행 */}
                {leaderPresent && (
                  <div className="flex items-center justify-between text-gray-600">
                    <span className="font-medium text-indigo-700">[팀장] {leader.name}</span>
                    <span>{formatKRW(Number(leaderRate))} × {leaderDays}일 = <strong className="text-gray-800">{formatKRW(leaderPay)}</strong></span>
                  </div>
                )}

                {/* 멤버 행 */}
                {validMembers.map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-gray-600">
                    <span>{m.name}</span>
                    <span>{formatKRW(m.rate)} × {m.days}일 = <strong className="text-gray-800">{formatKRW(m.rate * m.days)}</strong></span>
                  </div>
                ))}

                <div className="border-t border-gray-300 pt-1.5 flex items-center justify-between">
                  <span className="text-gray-500">합산 → <strong className="text-blue-700">{leader.name}</strong>에게 일괄 지급</span>
                  <span className="font-bold text-blue-700 text-sm">{formatKRW(totalPay)}</span>
                </div>
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
