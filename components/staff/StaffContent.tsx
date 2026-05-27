'use client'

import { useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/supabase/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter, DialogClose
} from '@/components/ui/dialog'
import { Plus, Search, Edit2, Trash2, Star, SlidersHorizontal, X, Eye, EyeOff, FileSpreadsheet } from 'lucide-react'
import type { Staff, StaffRecommend } from '@/lib/supabase/types'
import CrewProfileCard from './CrewProfileCard'
import StaffExcelUpload from './StaffExcelUpload'

const RECOMMEND_OPTIONS: StaffRecommend[] = ['우선투입', '일반', '보류']

const emptyForm = {
  name: '',
  gender: '',
  age: '',
  height: '',
  english_skill: '',
  driving: '',
  region: '',
  available_jobs: '',
  certifications: '',
  recommend: '일반' as StaffRecommend,
  phone: '',
  bank_name: '',
  account_number: '',
  id_number: '',
  memo: '',
  attendance_score: '',
  performance_score: '',
  appearance_score: '',
  teamwork_score: '',
}

const RECOMMEND_COLOR: Record<string, string> = {
  '우선투입': 'bg-emerald-100 text-emerald-700',
  '일반': 'bg-gray-100 text-gray-600',
  '보류': 'bg-orange-100 text-orange-700',
}

// 평균 점수 5점 만점 기준 색상
const SCORE_COLOR = (avg: number) =>
  avg >= 4 ? 'text-emerald-600 font-bold' : avg >= 3 ? 'text-blue-600 font-semibold' : avg >= 2 ? 'text-yellow-600' : 'text-gray-500'

// 4개 항목의 평균 계산 (0점인 항목 포함해서 단순 평균)
function calcAvg(s: Staff) {
  const sum = (s.attendance_score || 0) + (s.performance_score || 0) +
              (s.appearance_score || 0) + (s.teamwork_score || 0)
  return sum / 4
}

// 필터 상태 타입
interface FilterState {
  search: string
  recommend: string
  gender: string
  english: string
  minScore: string
  job: string
  showFilters: boolean
}

export default function StaffContent() {
  const [staffList, setStaffList]     = useState<Staff[]>([])
  const [loading, setLoading]         = useState(true)
  const [filters, setFilters]         = useState<FilterState>({
    search: '', recommend: '', gender: '', english: '', minScore: '', job: '', showFilters: false,
  })
  const [profileStaff, setProfileStaff] = useState<Staff | null>(null) // 프로필 카드용
  const [showModal, setShowModal]     = useState(false)
  const [editTarget, setEditTarget]   = useState<Staff | null>(null)
  const [form, setForm]               = useState(emptyForm)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')
  const [showIdNumber, setShowIdNumber] = useState(false) // 주민등록번호 표시 토글
  const [showExcelUpload, setShowExcelUpload] = useState(false) // 엑셀 일괄 등록 모달

  const load = useCallback(async () => {
    setLoading(true)
    const staff = await db.list<Staff>('staff', { order: 'total_score', asc: false })
    setStaffList(staff)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function setFilter(key: keyof FilterState, value: string | boolean) {
    setFilters(f => ({ ...f, [key]: value }))
  }

  function openCreate() {
    setEditTarget(null)
    setForm(emptyForm)
    setError('')
    setShowModal(true)
  }

  function openEdit(s: Staff) {
    setEditTarget(s)
    setForm({
      name: s.name,
      gender: s.gender || '',
      age: String(s.age || ''),
      height: String(s.height || ''),
      english_skill: s.english_skill || '',
      driving: s.driving || '',
      region: s.region || '',
      available_jobs: (s.available_jobs || []).join(', '),
      certifications: (s.certifications || []).join(', '),
      recommend: s.recommend,
      phone: s.phone || '',
      bank_name: s.bank_name || '',
      account_number: s.account_number || '',
      id_number: s.id_number || '',
      memo: s.memo || '',
      attendance_score: String(s.attendance_score || ''),
      performance_score: String(s.performance_score || ''),
      appearance_score: String(s.appearance_score || ''),
      teamwork_score: String(s.teamwork_score || ''),
    })
    setError('')
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('이름을 입력해주세요.'); return }

    setSaving(true)
    setError('')

    const attendance  = Number(form.attendance_score)  || 0
    const performance = Number(form.performance_score) || 0
    const appearance  = Number(form.appearance_score)  || 0
    const teamwork    = Number(form.teamwork_score)    || 0
    // total_score = 4개 합산 (최대 20점, 소수점 포함)
    const totalScore  = Math.round((attendance + performance + appearance + teamwork) * 100) / 100

    const payload = {
      name: form.name.trim(),
      gender: form.gender || null,
      age: form.age ? Number(form.age) : null,
      height: form.height ? Number(form.height) : null,
      english_skill: form.english_skill || null,
      driving: form.driving || null,
      region: form.region || null,
      available_jobs: form.available_jobs
        ? form.available_jobs.split(',').map(s => s.trim()).filter(Boolean) : [],
      certifications: form.certifications
        ? form.certifications.split(',').map(s => s.trim()).filter(Boolean) : [],
      recommend: form.recommend,
      phone: form.phone || null,
      bank_name: form.bank_name || null,
      account_number: form.account_number || null,
      id_number: form.id_number || null,
      memo: form.memo || null,
      attendance_score: attendance,
      performance_score: performance,
      appearance_score: appearance,
      teamwork_score: teamwork,
      total_score: totalScore,
    }

    try {
      if (editTarget) {
        await db.update('staff', editTarget.id, payload)
      } else {
        await db.insert('staff', payload)
      }
    } catch (e) {
      setSaving(false); setError((e as Error).message); return
    }

    setSaving(false)
    setShowModal(false)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm('이 크루 정보를 삭제하시겠습니까?')) return
    await db.delete('staff', id)
    load()
  }

  // 다중 필터 적용
  const filtered = staffList.filter(s => {
    if (filters.search) {
      const q = filters.search.toLowerCase()
      const hit = [s.name, s.region, s.phone, ...(s.available_jobs || []), ...(s.certifications || [])]
        .some(v => v?.toLowerCase().includes(q))
      if (!hit) return false
    }
    if (filters.recommend && s.recommend !== filters.recommend) return false
    if (filters.gender    && s.gender   !== filters.gender) return false
    if (filters.english   && s.english_skill !== filters.english) return false
    if (filters.minScore) {
      const min = Number(filters.minScore)
      if (!isNaN(min) && s.total_score < min) return false
    }
    if (filters.job) {
      const q = filters.job.toLowerCase()
      const hit = (s.available_jobs || []).some(j => j.toLowerCase().includes(q))
      if (!hit) return false
    }
    return true
  })

  const stats = {
    total:    staffList.length,
    priority: staffList.filter(s => s.recommend === '우선투입').length,
    normal:   staffList.filter(s => s.recommend === '일반').length,
    hold:     staffList.filter(s => s.recommend === '보류').length,
  }

  const activeFilterCount = [
    filters.recommend, filters.gender, filters.english, filters.minScore, filters.job,
  ].filter(Boolean).length

  return (
    <>
      {/* 집계 요약 */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label: '전체 크루', value: stats.total, color: 'border-gray-200 text-gray-900' },
          { label: '우선투입', value: stats.priority, color: 'border-emerald-200 text-emerald-700' },
          { label: '일반',     value: stats.normal,   color: 'border-blue-200 text-blue-700' },
          { label: '보류',     value: stats.hold,     color: 'border-orange-200 text-orange-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`bg-white rounded-xl border p-4 text-center ${color}`}>
            <p className="text-xs opacity-70">{label}</p>
            <p className={`text-2xl font-bold ${color.split(' ').find(c => c.startsWith('text-'))}`}>{value}명</p>
          </div>
        ))}
      </div>

      {/* 검색 / 필터 바 */}
      <div className="space-y-2 mb-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="이름, 지역, 연락처, 직무 검색..."
              className="pl-9"
              value={filters.search}
              onChange={e => setFilter('search', e.target.value)}
            />
          </div>
          <Button
            variant={filters.showFilters ? 'default' : 'outline'}
            onClick={() => setFilter('showFilters', !filters.showFilters)}
            className="gap-1.5"
          >
            <SlidersHorizontal className="h-4 w-4" />
            상세 필터
            {activeFilterCount > 0 && (
              <span className="bg-red-500 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center font-bold">
                {activeFilterCount}
              </span>
            )}
          </Button>
          <Button variant="outline" onClick={() => setShowExcelUpload(true)} className="gap-1">
            <FileSpreadsheet className="h-4 w-4" />
            엑셀 일괄 등록
          </Button>
          <Button onClick={openCreate} className="gap-1">
            <Plus className="h-4 w-4" />
            크루 등록
          </Button>
        </div>

        {/* 상세 필터 패널 */}
        {filters.showFilters && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1 min-w-[100px]">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">추천등급</label>
              <Select value={filters.recommend} onChange={e => setFilter('recommend', e.target.value)} className="h-8 text-sm">
                <option value="">전체</option>
                {RECOMMEND_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
            </div>
            <div className="flex flex-col gap-1 min-w-[80px]">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">성별</label>
              <Select value={filters.gender} onChange={e => setFilter('gender', e.target.value)} className="h-8 text-sm">
                <option value="">전체</option>
                <option value="남">남성</option>
                <option value="여">여성</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1 min-w-[120px]">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">영어 능력</label>
              <Select value={filters.english} onChange={e => setFilter('english', e.target.value)} className="h-8 text-sm">
                <option value="">전체</option>
                <option value="하">하 (기초)</option>
                <option value="중">중 (가능)</option>
                <option value="상">상 (능숙)</option>
                <option value="원어민">원어민</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1 min-w-[100px]">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">최소 평점</label>
              <Input
                type="number" min={0} max={20} placeholder="예: 14"
                value={filters.minScore}
                onChange={e => setFilter('minScore', e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[120px]">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">직무 포함</label>
              <Input
                placeholder="예: 도우미"
                value={filters.job}
                onChange={e => setFilter('job', e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost" size="sm"
                className="text-red-500 gap-1 self-end h-8"
                onClick={() => setFilters(f => ({
                  ...f, recommend: '', gender: '', english: '', minScore: '', job: '',
                }))}
              >
                <X className="h-3.5 w-3.5" />필터 초기화
              </Button>
            )}
          </div>
        )}

        {/* 결과 카운트 */}
        <p className="text-xs text-gray-400 px-1">
          {filtered.length === staffList.length
            ? `전체 ${staffList.length}명`
            : `검색 결과 ${filtered.length}명 / 전체 ${staffList.length}명`}
        </p>
      </div>

      {/* 테이블 */}
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
                  <th>이름</th>
                  <th>추천등급</th>
                  <th>성별</th>
                  <th>지역</th>
                  <th>연락처</th>
                  <th>가능직무</th>
                  <th>영어</th>
                  <th>평점</th>
                  <th className="text-right">액션</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9}><div className="erp-empty"><p>조건에 맞는 크루가 없습니다.</p></div></td>
                  </tr>
                  ) : (
                    filtered.map(s => (
                      <tr
                        key={s.id}
                        className="cursor-pointer hover:bg-blue-50/60 transition-colors"
                        onClick={() => setProfileStaff(s)}
                      >
                        <td>
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                              ${s.recommend === '우선투입' ? 'bg-emerald-100 text-emerald-700' :
                                s.recommend === '보류'    ? 'bg-orange-100 text-orange-700' :
                                                            'bg-blue-100 text-blue-700'}`}>
                              {s.name[0]}
                            </div>
                            <span className="font-medium hover:text-blue-700">{s.name}</span>
                            {s.certifications?.includes('본사직원') && (
                              <span className="text-[10px] bg-slate-100 text-slate-500 px-1 rounded">[본사]</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RECOMMEND_COLOR[s.recommend]}`}>
                            {s.recommend === '우선투입' && <Star className="inline h-3 w-3 mr-0.5 fill-current" />}
                            {s.recommend}
                          </span>
                        </td>
                        <td className="text-gray-600">{s.gender || '-'}</td>
                        <td className="text-gray-600 text-sm">{s.region || '-'}</td>
                        <td className="text-gray-600 text-sm">{s.phone || '-'}</td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {(s.available_jobs || []).slice(0, 2).map((job, i) => (
                              <span key={i} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                                {job}
                              </span>
                            ))}
                            {(s.available_jobs || []).length > 2 && (
                              <span className="text-xs text-gray-400">+{s.available_jobs!.length - 2}</span>
                            )}
                          </div>
                        </td>
                        <td className="text-gray-600 text-sm">
                          {s.english_skill
                            ? <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                s.english_skill === '원어민' ? 'bg-purple-100 text-purple-700' :
                                s.english_skill === '상'    ? 'bg-indigo-100 text-indigo-700' :
                                s.english_skill === '중'    ? 'bg-blue-50 text-blue-600' :
                                                              'bg-gray-100 text-gray-500'}`}>
                                {s.english_skill}
                              </span>
                            : <span className="text-gray-300">-</span>}
                        </td>
                        <td>
                          <span className={SCORE_COLOR(calcAvg(s))}>
                            {calcAvg(s).toFixed(1)}
                            <span className="text-gray-300 font-normal">/5</span>
                          </span>
                        </td>
                        <td className="text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(s)} title="수정">
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" onClick={() => handleDelete(s.id)}
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
      </div>

      {/* 엑셀 일괄 등록 모달 */}
      {showExcelUpload && (
        <StaffExcelUpload
          existingStaff={staffList}
          onClose={() => setShowExcelUpload(false)}
          onDone={() => { setShowExcelUpload(false); load() }}
        />
      )}

      {/* 프로필 카드 모달 */}
      {profileStaff && (
        <CrewProfileCard
          staff={profileStaff}
          onClose={() => setProfileStaff(null)}
          onEdit={(s) => { setProfileStaff(null); openEdit(s) }}
        />
      )}

      {/* 크루 등록/수정 다이얼로그 */}
      <Dialog open={showModal} onClose={() => setShowModal(false)} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editTarget ? '크루 수정' : '크루 등록'}</DialogTitle>
          <DialogClose onClose={() => setShowModal(false)} />
        </DialogHeader>
        <DialogContent className="space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">이름 *</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="성명" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">추천 등급</label>
              <Select value={form.recommend} onChange={e => setForm(f => ({ ...f, recommend: e.target.value as StaffRecommend }))}>
                {RECOMMEND_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">성별</label>
              <Select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                <option value="">선택</option>
                <option value="남">남</option>
                <option value="여">여</option>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">나이</label>
              <Input type="number" value={form.age} onChange={e => setForm(f => ({ ...f, age: e.target.value }))} placeholder="세" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">키 (cm)</label>
              <Input type="number" value={form.height} onChange={e => setForm(f => ({ ...f, height: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">이동가능지역</label>
              <Input value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} placeholder="서울, 경기 등" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">연락처</label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="010-0000-0000" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">영어능력</label>
              <Select value={form.english_skill} onChange={e => setForm(f => ({ ...f, english_skill: e.target.value }))}>
                <option value="">선택</option>
                <option value="하">하 (기초)</option>
                <option value="중">중 (가능)</option>
                <option value="상">상 (능숙)</option>
                <option value="원어민">원어민</option>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">운전면허</label>
              <Input value={form.driving} onChange={e => setForm(f => ({ ...f, driving: e.target.value }))} placeholder="1종, 2종, 없음" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">은행명</label>
              <Input value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">계좌번호</label>
              <Input value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">주민등록번호</label>
              <div className="relative">
                <Input
                  type={showIdNumber ? 'text' : 'password'}
                  value={form.id_number}
                  onChange={e => setForm(f => ({ ...f, id_number: e.target.value }))}
                  placeholder="예: 900101-1234567"
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowIdNumber(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  title={showIdNumber ? '숨기기' : '보기'}
                >
                  {showIdNumber ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">가능 직무 (쉼표 구분)</label>
            <Input value={form.available_jobs} onChange={e => setForm(f => ({ ...f, available_jobs: e.target.value }))} placeholder="행사도우미, 전시도우미, 안내도우미" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">자격증 · 특기 (쉼표 구분)</label>
            <Input value={form.certifications} onChange={e => setForm(f => ({ ...f, certifications: e.target.value }))} placeholder="바리스타, 조리사, 본사직원 등" />
          </div>

          {/* 평가 점수 */}
          <div>
            <h4 className="text-xs font-semibold text-gray-700 mb-2">평가 점수 (각 0~5점, 합계 20점)</h4>
            <div className="grid grid-cols-4 gap-3">
              {[
                { key: 'attendance_score',  label: '근태' },
                { key: 'performance_score', label: '수행' },
                { key: 'appearance_score',  label: '외모' },
                { key: 'teamwork_score',    label: '팀워크' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="text-xs text-gray-500 mb-1 block">{label} <span className="text-gray-300">/5</span></label>
                  <Input
                    type="number" min={0} max={5} step={0.5}
                    value={(form as Record<string, string>)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="text-center"
                  />
                </div>
              ))}
            </div>
            {(form.attendance_score || form.performance_score || form.appearance_score || form.teamwork_score) && (
              <p className="text-xs text-blue-600 mt-1">
                합계: {(
                  (Number(form.attendance_score) || 0) + (Number(form.performance_score) || 0) +
                  (Number(form.appearance_score) || 0) + (Number(form.teamwork_score) || 0)
                ).toFixed(1)}
                <span className="text-gray-400"> / 20 &nbsp;|&nbsp; 평균: </span>
                {(
                  ((Number(form.attendance_score) || 0) + (Number(form.performance_score) || 0) +
                  (Number(form.appearance_score) || 0) + (Number(form.teamwork_score) || 0)) / 4
                ).toFixed(2)}
                <span className="text-gray-400"> / 5</span>
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">총평 / 메모</label>
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
