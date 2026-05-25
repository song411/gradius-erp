'use client'

import { useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/supabase/api'
import { getCustomerType } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter, DialogClose
} from '@/components/ui/dialog'
import { Plus, Search, Edit2, Trash2, Building2, User } from 'lucide-react'
import type { Customer } from '@/lib/supabase/types'

const emptyForm = {
  company_name: '',
  rep_name: '',
  biz_number: '',
  biz_type: '',
  biz_item: '',
  address: '',
  email: '',
  contact_name: '',
  phone: '',
  memo: '',
}

export default function CustomersContent() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [filterType, setFilterType] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState<Customer | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const custs = await db.list<Customer>('customers', { order: 'created_at', asc: false })
    setCustomers(custs)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditTarget(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  function openEdit(c: Customer) {
    setEditTarget(c)
    setForm({
      company_name: c.company_name,
      rep_name: c.rep_name || '',
      biz_number: c.biz_number || '',
      biz_type: c.biz_type || '',
      biz_item: c.biz_item || '',
      address: c.address || '',
      email: c.email || '',
      contact_name: c.contact_name || '',
      phone: c.phone || '',
      memo: c.memo || '',
    })
    setError('')
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.company_name.trim()) { setError('업체명을 입력해주세요.'); return }

    setSaving(true)
    setError('')

    const customerType = getCustomerType(form.biz_number)

    const payload = {
      company_name: form.company_name.trim(),
      rep_name: form.rep_name || null,
      biz_number: form.biz_number || null,
      biz_type: form.biz_type || null,
      biz_item: form.biz_item || null,
      address: form.address || null,
      email: form.email || null,
      contact_name: form.contact_name || null,
      phone: form.phone || null,
      memo: form.memo || null,
      customer_type: customerType,
    }

    try {
      if (editTarget) {
        await db.update('customers', editTarget.id, payload)
      } else {
        await db.insert('customers', payload)
      }
    } catch (e) {
      setSaving(false); setError((e as Error).message); return
    }

    setSaving(false)
    setShowModal(false)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('이 고객사를 삭제하시겠습니까?')) return
    await db.delete('customers', id)
    load()
  }

  const filtered = customers.filter(c => {
    const matchSearch = !searchText || [c.company_name, c.contact_name, c.phone, c.biz_number]
      .some(v => v?.toLowerCase().includes(searchText.toLowerCase()))
    const matchType = !filterType || getCustomerType(c.biz_number) === filterType
    return matchSearch && matchType
  })

  const stats = {
    total: customers.length,
    corp: customers.filter(c => getCustomerType(c.biz_number) === '법인').length,
    personal: customers.filter(c => getCustomerType(c.biz_number) === '개인').length,
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-xs text-gray-500">전체 고객사</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}개</p>
        </div>
        <div className="bg-white rounded-xl border border-blue-200 p-4 text-center">
          <p className="text-xs text-blue-600">법인</p>
          <p className="text-2xl font-bold text-blue-700">{stats.corp}개</p>
        </div>
        <div className="bg-white rounded-xl border border-purple-200 p-4 text-center">
          <p className="text-xs text-purple-600">개인</p>
          <p className="text-2xl font-bold text-purple-700">{stats.personal}개</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="업체명, 담당자, 연락처, 사업자번호 검색..."
            className="pl-9"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
          />
        </div>
        <Select value={filterType} onChange={e => setFilterType(e.target.value)} className="w-28">
          <option value="">전체</option>
          <option value="법인">법인</option>
          <option value="개인">개인</option>
        </Select>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          고객사 등록
        </Button>
      </div>

      <div className="erp-card">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="erp-table">
                <thead>
                  <tr>
                    <th>업체명</th>
                    <th>구분</th>
                    <th>대표자</th>
                    <th>담당자</th>
                    <th>연락처</th>
                    <th>사업자번호</th>
                    <th>업태</th>
                    <th>이메일</th>
                    <th className="text-right">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9}><div className="erp-empty"><p>고객사가 없습니다.</p></div></td>
                    </tr>
                  ) : (
                    filtered.map(c => {
                      const type = getCustomerType(c.biz_number)
                      return (
                        <tr key={c.id}>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                                {type === '법인' ? (
                                  <Building2 className="h-3.5 w-3.5 text-indigo-600" />
                                ) : (
                                  <User className="h-3.5 w-3.5 text-purple-600" />
                                )}
                              </div>
                              <span className="font-medium">{c.company_name}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              type === '법인' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                            }`}>
                              {type}
                            </span>
                          </td>
                          <td className="text-gray-600">{c.rep_name || '-'}</td>
                          <td className="text-gray-600">{c.contact_name || '-'}</td>
                          <td className="text-gray-600">{c.phone || '-'}</td>
                          <td className="text-gray-500 text-xs">{c.biz_number || '-'}</td>
                          <td className="text-gray-500 text-xs">{c.biz_type || '-'}</td>
                          <td className="text-gray-500 text-xs">{c.email || '-'}</td>
                          <td className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(c)} title="수정">
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="icon" onClick={() => handleDelete(c.id)}
                                className="text-red-500 hover:text-red-700" title="삭제"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={showModal} onClose={() => setShowModal(false)} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editTarget ? '고객사 수정' : '고객사 등록'}</DialogTitle>
          <DialogClose onClose={() => setShowModal(false)} />
        </DialogHeader>
        <DialogContent className="space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">업체명 *</label>
              <Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="업체명" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">대표자명</label>
              <Input value={form.rep_name} onChange={e => setForm(f => ({ ...f, rep_name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                사업자번호
                <span className="ml-2 text-xs font-normal text-gray-400">
                  (입력 시 법인, 미입력 시 개인)
                </span>
              </label>
              <Input value={form.biz_number} onChange={e => setForm(f => ({ ...f, biz_number: e.target.value }))} placeholder="000-00-00000" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">업태</label>
              <Input value={form.biz_type} onChange={e => setForm(f => ({ ...f, biz_type: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">종목</label>
              <Input value={form.biz_item} onChange={e => setForm(f => ({ ...f, biz_item: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">담당자</label>
              <Input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">연락처</label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="010-0000-0000" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">이메일</label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">주소</label>
              <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">메모</label>
            <Textarea value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} rows={2} />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowModal(false)}>취소</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : (editTarget ? '수정 완료' : '등록')}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  )
}
