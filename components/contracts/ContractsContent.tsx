'use client'

import { useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/supabase/api'
import { STATUS_COLORS, formatKRW, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter, DialogClose
} from '@/components/ui/dialog'
import { Plus, Search, Edit2, Trash2, Users } from 'lucide-react'
import type { Assignment, AssignmentStatus, Inquiry, Staff } from '@/lib/supabase/types'

const STATUS_OPTIONS: AssignmentStatus[] = ['후보', '배정중', '확정', '취소']

const emptyForm = {
  inquiry_id: '',
  staff_id: '',
  staff_name: '',
  staff_type: '본사',
  job_type: '',
  phone: '',
  bank_name: '',
  account_number: '',
  id_number: '',
  pay_rate: '',
  work_days: '',
  status: '후보' as AssignmentStatus,
  start_date: '',
  end_date: '',
  team_code: '',
  memo: '',
  is_payable: true,
  is_present: true,
}

export default function ContractsContent() {
  const [assignments, setAssignments] = useState<(Assignment & { inquiries?: Inquiry; staff?: Staff })[]>([])
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState<Assignment | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [asgns, inqs, staff] = await Promise.all([
      db.list<Assignment & { inquiries?: Inquiry; staff?: Staff }>('assignments', {
        select: '*, inquiries(event_name, company_name, status), staff(name, phone)',
        order: 'assigned_at', asc: false,
      }),
      db.list<Inquiry>('inquiries', {
        inFilter: { status: ['체결', '배정완료', '진행중'] },
        order: 'created_at', asc: false,
      }),
      db.list<Staff>('staff', {
        neqFilter: { recommend: '보류' },
        order: 'recommend', asc: true,
      }),
    ])
    setAssignments(asgns)
    setInquiries(inqs)
    setStaffList(staff)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditTarget(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  function openEdit(asgn: Assignment) {
    setEditTarget(asgn)
    setForm({
      inquiry_id: asgn.inquiry_id || '',
      staff_id: asgn.staff_id || '',
      staff_name: asgn.staff_name || '',
      staff_type: asgn.staff_type || '본사',
      job_type: asgn.job_type || '',
      phone: asgn.phone || '',
      bank_name: asgn.bank_name || '',
      account_number: asgn.account_number || '',
      id_number: asgn.id_number || '',
      pay_rate: String(asgn.pay_rate || ''),
      work_days: String(asgn.work_days || ''),
      status: asgn.status,
      start_date: asgn.start_date || '',
      end_date: asgn.end_date || '',
      team_code: asgn.team_code || '',
      memo: asgn.memo || '',
      is_payable: asgn.is_payable,
      is_present: asgn.is_present,
    })
    setError('')
    setShowModal(true)
  }

  // 직원 선택 시 자동 채우기
  function handleStaffSelect(staffId: string) {
    const staff = staffList.find(s => s.id === staffId)
    setForm(f => ({
      ...f,
      staff_id: staffId,
      staff_name: staff?.name || '',
      phone: staff?.phone || f.phone,
    }))
  }

  async function handleSave() {
    if (!form.inquiry_id) { setError('문의를 선택해주세요.'); return }
    if (!form.staff_name.trim()) { setError('직원명을 입력해주세요.'); return }

    setSaving(true)
    setError('')

    const payload = {
      inquiry_id: form.inquiry_id,
      staff_id: form.staff_id || null,
      staff_name: form.staff_name.trim(),
      staff_type: form.staff_type,
      job_type: form.job_type || null,
      phone: form.phone || null,
      bank_name: form.bank_name || null,
      account_number: form.account_number || null,
      id_number: form.id_number || null,
      pay_rate: Number(form.pay_rate) || 0,
      work_days: Number(form.work_days) || 0,
      status: form.status,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      team_code: form.team_code || null,
      memo: form.memo || null,
      is_payable: form.is_payable,
      is_present: form.is_present,
    }

    try {
      if (editTarget) {
        await db.update('assignments', editTarget.id, payload)
      } else {
        await db.insert('assignments', payload)
        // 확정 배정 시 문의 상태 업데이트
        if (form.status === '확정') {
          await db.update('inquiries', form.inquiry_id, { status: '배정완료' })
        }
      }
    } catch (e) {
      setSaving(false); setError((e as Error).message); return
    }

    setSaving(false)
    setShowModal(false)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('이 배정 기록을 삭제하시겠습니까?')) return
    await db.delete('assignments', id)
    load()
  }

  async function handleStatusChange(id: string, status: AssignmentStatus, inquiryId?: string) {
    await db.update('assignments', id, { status })
    // 확정 시 문의 상태 업데이트
    if (status === '확정' && inquiryId) {
      await db.update('inquiries', inquiryId, { status: '배정완료' })
    }
    load()
  }

  const filtered = assignments.filter(a => {
    const matchSearch = !searchText || [a.staff_name, a.inquiries?.event_name, a.inquiries?.company_name]
      .some(v => v?.toLowerCase().includes(searchText.toLowerCase()))
    const matchStatus = !filterStatus || a.status === filterStatus
    return matchSearch && matchStatus
  })

  // 집계
  const stats = {
    total: assignments.length,
    confirmed: assignments.filter(a => a.status === '확정').length,
    pending: assignments.filter(a => a.status === '후보').length,
    totalPay: assignments
      .filter(a => a.status === '확정' && a.is_payable)
      .reduce((sum, a) => sum + (a.total_pay || a.pay_rate * a.work_days), 0),
  }

  return (
    <>
      {/* 집계 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-xs text-gray-500">전체 배정</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}건</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-xs text-gray-500">확정</p>
          <p className="text-2xl font-bold text-green-700">{stats.confirmed}건</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-xs text-gray-500">후보/배정중</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.pending}건</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-xs text-gray-500">예상 지급액 합계</p>
          <p className="text-xl font-bold text-blue-700">{formatKRW(stats.totalPay)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="직원명, 행사명, 업체명 검색..."
            className="pl-9"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />
        </div>
        <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-32">
          <option value="">전체 상태</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          배정 등록
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
                    <th>직원명</th>
                    <th>행사명</th>
                    <th>직무</th>
                    <th>근무기간</th>
                    <th>일수</th>
                    <th>지급단가</th>
                    <th>지급합계</th>
                    <th>상태</th>
                    <th className="text-right">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center text-gray-400 py-10">배정 기록이 없습니다.</td>
                    </tr>
                  ) : (
                    filtered.map(asgn => (
                      <tr key={asgn.id}>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">
                              {asgn.staff_name?.[0] || '?'}
                            </div>
                            <span className="font-medium">{asgn.staff_name || '-'}</span>
                          </div>
                        </td>
                        <td className="text-sm">{asgn.inquiries?.event_name || asgn.event_name || '-'}</td>
                        <td className="text-sm text-gray-600">{asgn.job_type || '-'}</td>
                        <td className="text-sm text-gray-600">
                          {formatDate(asgn.start_date)}
                          {asgn.end_date ? ` ~ ${formatDate(asgn.end_date)}` : ''}
                        </td>
                        <td className="text-center">{asgn.work_days}일</td>
                        <td>{formatKRW(asgn.pay_rate)}</td>
                        <td className="font-semibold">{formatKRW(asgn.total_pay || asgn.pay_rate * asgn.work_days)}</td>
                        <td>
                          <Select
                            value={asgn.status}
                            onChange={e => handleStatusChange(asgn.id, e.target.value as AssignmentStatus, asgn.inquiry_id || undefined)}
                            className="w-24 h-8 text-xs"
                          >
                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                          </Select>
                        </td>
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(asgn)} title="수정">
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" onClick={() => handleDelete(asgn.id)}
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

      {/* 배정 등록/수정 다이얼로그 */}
      <Dialog open={showModal} onClose={() => setShowModal(false)} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editTarget ? '배정 수정' : '배정 등록'}</DialogTitle>
          <DialogClose onClose={() => setShowModal(false)} />
        </DialogHeader>
        <DialogContent className="space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">연결 문의 *</label>
              <Select
                value={form.inquiry_id}
                onChange={e => setForm(f => ({ ...f, inquiry_id: e.target.value }))}
              >
                <option value="">문의 선택</option>
                {inquiries.map(i => (
                  <option key={i.id} value={i.id}>
                    [{i.status}] {i.company_name} - {i.event_name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">직원 선택 (본사)</label>
              <Select
                value={form.staff_id}
                onChange={e => handleStaffSelect(e.target.value)}
              >
                <option value="">직원 선택</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id}>
                    [{s.recommend}] {s.name} {s.region ? `(${s.region})` : ''}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">직원명 *</label>
              <Input
                value={form.staff_name}
                onChange={e => setForm(f => ({ ...f, staff_name: e.target.value }))}
                placeholder="직원명 (외부인력 직접 입력)"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">직원 구분</label>
              <Select
                value={form.staff_type}
                onChange={e => setForm(f => ({ ...f, staff_type: e.target.value }))}
              >
                <option value="본사">본사</option>
                <option value="외부">외부</option>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">직무</label>
              <Input
                value={form.job_type}
                onChange={e => setForm(f => ({ ...f, job_type: e.target.value }))}
                placeholder="행사도우미, 안내도우미 등"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">연락처</label>
              <Input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="010-0000-0000"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">지급단가 (일)</label>
              <Input
                type="number"
                value={form.pay_rate}
                onChange={e => setForm(f => ({ ...f, pay_rate: e.target.value }))}
                placeholder="일당"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">근무일수</label>
              <Input
                type="number"
                value={form.work_days}
                onChange={e => setForm(f => ({ ...f, work_days: e.target.value }))}
                placeholder="일"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">근무 시작일</label>
              <Input
                type="date"
                value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">근무 종료일</label>
              <Input
                type="date"
                value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">은행명</label>
              <Input
                value={form.bank_name}
                onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                placeholder="국민은행, 신한은행 등"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">계좌번호</label>
              <Input
                value={form.account_number}
                onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))}
                placeholder="계좌번호"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">상태</label>
              <Select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as AssignmentStatus }))}
              >
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">팀 코드</label>
              <Input
                value={form.team_code}
                onChange={e => setForm(f => ({ ...f, team_code: e.target.value }))}
                placeholder="팀 구분 코드"
              />
            </div>

            <div className="col-span-2 flex gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_payable}
                  onChange={e => setForm(f => ({ ...f, is_payable: e.target.checked }))}
                  className="w-4 h-4 rounded"
                />
                지급 대상
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_present}
                  onChange={e => setForm(f => ({ ...f, is_present: e.target.checked }))}
                  className="w-4 h-4 rounded"
                />
                현장 참여
              </label>
            </div>

            {form.pay_rate && form.work_days && (
              <div className="col-span-2 bg-blue-50 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  예상 지급액: <strong>{formatKRW(Number(form.pay_rate) * Number(form.work_days))}</strong>
                  {' '}({form.pay_rate}원 × {form.work_days}일)
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">메모</label>
            <Textarea
              value={form.memo}
              onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
              placeholder="특이사항"
              rows={2}
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowModal(false)}>취소</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : (editTarget ? '수정 완료' : '배정 등록')}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  )
}
