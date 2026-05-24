'use client'

import { useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/supabase/api'
import { STATUS_COLORS, formatKRW } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter, DialogClose
} from '@/components/ui/dialog'
import { Plus, Search, Edit2, Trash2, Clock, CheckCircle } from 'lucide-react'
import type { Attendance, AttendanceStatus, Assignment } from '@/lib/supabase/types'

const STATUS_OPTIONS: AttendanceStatus[] = ['출석', '지각', '결근', '조퇴', '외출']

const STATUS_ICON: Record<AttendanceStatus, string> = {
  '출석': '✅',
  '지각': '⚠️',
  '결근': '❌',
  '조퇴': '🔶',
  '외출': '🔵',
}

export default function AttendanceContent() {
  const [records, setRecords] = useState<(Attendance & { assignments?: Assignment })[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState<Attendance | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    assignment_id: '',
    staff_name: '',
    work_date: '',
    clock_in: '',
    clock_out: '',
    work_hours: '',
    daily_pay: '',
    status: '출석' as AttendanceStatus,
    reason: '',
    notes: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    const [recs, asgns] = await Promise.all([
      db.list<Attendance & { assignments?: Assignment }>('attendances', {
        select: '*, assignments(staff_name, job_type, event_name, inquiry_id)',
        order: 'work_date', asc: false, limit: 200,
      }),
      db.list<Assignment>('assignments', {
        filters: { status: '확정' },
        order: 'assigned_at', asc: false,
      }),
    ])
    setRecords(recs)
    setAssignments(asgns)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    const today = new Date().toISOString().slice(0, 10)
    setEditTarget(null)
    setForm({
      assignment_id: '',
      staff_name: '',
      work_date: today,
      clock_in: '09:00',
      clock_out: '18:00',
      work_hours: '8',
      daily_pay: '',
      status: '출석',
      reason: '',
      notes: '',
    })
    setError('')
    setShowModal(true)
  }

  function openEdit(r: Attendance) {
    setEditTarget(r)
    setForm({
      assignment_id: r.assignment_id || '',
      staff_name: r.staff_name || '',
      work_date: r.work_date,
      clock_in: r.clock_in || '',
      clock_out: r.clock_out || '',
      work_hours: String(r.work_hours || ''),
      daily_pay: String(r.daily_pay || ''),
      status: r.status,
      reason: r.reason || '',
      notes: r.notes || '',
    })
    setError('')
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.staff_name.trim() && !form.assignment_id) {
      setError('직원명 또는 배정 기록을 선택해주세요.')
      return
    }

    setSaving(true)
    setError('')

    const selectedAsgn = assignments.find(a => a.id === form.assignment_id)

    const payload = {
      assignment_id: form.assignment_id || null,
      staff_name: form.staff_name.trim() || selectedAsgn?.staff_name || null,
      work_date: form.work_date,
      clock_in: form.clock_in || null,
      clock_out: form.clock_out || null,
      work_hours: form.work_hours ? Number(form.work_hours) : null,
      daily_pay: Number(form.daily_pay) || 0,
      status: form.status,
      reason: form.reason || null,
      notes: form.notes || null,
    }

    try {
      if (editTarget) {
        await db.update('attendances', editTarget.id, payload)
      } else {
        await db.insert('attendances', payload)
      }
    } catch (e) {
      setSaving(false); setError((e as Error).message); return
    }

    setSaving(false)
    setShowModal(false)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('이 출석 기록을 삭제하시겠습니까?')) return
    await db.delete('attendances', id)
    load()
  }

  const filtered = records.filter(r => {
    const matchSearch = !searchText || r.staff_name?.toLowerCase().includes(searchText.toLowerCase())
    const matchDate = !filterDate || r.work_date === filterDate
    const matchStatus = !filterStatus || r.status === filterStatus
    return matchSearch && matchDate && matchStatus
  })

  const todayStr = new Date().toISOString().slice(0, 10)
  const todayRecords = records.filter(r => r.work_date === todayStr)
  const stats = {
    totalToday: todayRecords.length,
    present: todayRecords.filter(r => r.status === '출석').length,
    late: todayRecords.filter(r => r.status === '지각').length,
    absent: todayRecords.filter(r => r.status === '결근').length,
  }

  return (
    <>
      <div className="grid grid-cols-4 gap-4 mb-5">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-xs text-gray-500">오늘 기록</p>
          <p className="text-2xl font-bold text-gray-900">{stats.totalToday}명</p>
        </div>
        <div className="bg-white rounded-xl border border-green-200 p-4 text-center">
          <p className="text-xs text-green-600">출석</p>
          <p className="text-2xl font-bold text-green-700">{stats.present}명</p>
        </div>
        <div className="bg-white rounded-xl border border-yellow-200 p-4 text-center">
          <p className="text-xs text-yellow-600">지각</p>
          <p className="text-2xl font-bold text-yellow-700">{stats.late}명</p>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-4 text-center">
          <p className="text-xs text-red-600">결근</p>
          <p className="text-2xl font-bold text-red-700">{stats.absent}명</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="직원명 검색..."
            className="pl-9"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />
        </div>
        <Input
          type="date"
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          className="w-40"
        />
        <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-28">
          <option value="">전체 상태</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          출석 기록
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>날짜</th>
                    <th>직원명</th>
                    <th>출근</th>
                    <th>퇴근</th>
                    <th>근무시간</th>
                    <th>일당</th>
                    <th>상태</th>
                    <th>사유</th>
                    <th className="text-right">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center text-gray-400 py-10">출석 기록이 없습니다.</td>
                    </tr>
                  ) : (
                    filtered.map(r => (
                      <tr key={r.id}>
                        <td className="font-medium">{r.work_date}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">
                              {r.staff_name?.[0] || '?'}
                            </div>
                            <span>{r.staff_name || '-'}</span>
                          </div>
                        </td>
                        <td className="text-gray-600 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {r.clock_in || '-'}
                        </td>
                        <td className="text-gray-600">{r.clock_out || '-'}</td>
                        <td className="text-gray-600">{r.work_hours ? `${r.work_hours}h` : '-'}</td>
                        <td>{r.daily_pay ? formatKRW(r.daily_pay) : '-'}</td>
                        <td>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-600'}`}>
                            {STATUS_ICON[r.status]} {r.status}
                          </span>
                        </td>
                        <td className="text-gray-500 text-xs">{r.reason || '-'}</td>
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(r)} title="수정">
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" onClick={() => handleDelete(r.id)}
                              className="text-red-500 hover:text-red-700" title="삭제"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showModal} onClose={() => setShowModal(false)} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editTarget ? '출석 수정' : '출석 기록'}</DialogTitle>
          <DialogClose onClose={() => setShowModal(false)} />
        </DialogHeader>
        <DialogContent className="space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">배정 기록 연결</label>
              <Select
                value={form.assignment_id}
                onChange={e => {
                  const asgn = assignments.find(a => a.id === e.target.value)
                  setForm(f => ({
                    ...f,
                    assignment_id: e.target.value,
                    staff_name: asgn?.staff_name || f.staff_name,
                  }))
                }}
              >
                <option value="">선택 안 함 (직접 입력)</option>
                {assignments.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.staff_name} - {a.event_name || a.job_type}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">직원명</label>
              <Input
                value={form.staff_name}
                onChange={e => setForm(f => ({ ...f, staff_name: e.target.value }))}
                placeholder="직원명 직접 입력"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">근무일 *</label>
              <Input
                type="date"
                value={form.work_date}
                onChange={e => setForm(f => ({ ...f, work_date: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">출근 시간</label>
              <Input
                type="time"
                value={form.clock_in}
                onChange={e => setForm(f => ({ ...f, clock_in: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">퇴근 시간</label>
              <Input
                type="time"
                value={form.clock_out}
                onChange={e => setForm(f => ({ ...f, clock_out: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">근무 시간 (h)</label>
              <Input
                type="number"
                value={form.work_hours}
                onChange={e => setForm(f => ({ ...f, work_hours: e.target.value }))}
                step="0.5"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">일당 (원)</label>
              <Input
                type="number"
                value={form.daily_pay}
                onChange={e => setForm(f => ({ ...f, daily_pay: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">출석 상태</label>
              <Select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as AttendanceStatus }))}
              >
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_ICON[s]} {s}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">사유</label>
              <Input
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="지각/결근 사유 등"
              />
            </div>
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowModal(false)}>취소</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : (editTarget ? '수정 완료' : '기록')}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  )
}
