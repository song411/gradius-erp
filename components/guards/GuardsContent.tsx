'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { db } from '@/lib/supabase/api'
import type { GuardProfile, Staff } from '@/lib/supabase/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Search, Plus, Save, Trash2, UserCheck, FileText,
  Upload, X, ExternalLink, AlertCircle, ShieldCheck,
  RefreshCw, ChevronRight, Link2,
} from 'lucide-react'
import { toast } from 'sonner'

const JOB_CATEGORIES = ['신변보호', '시설경비', '호송경비', '기계경비', '특수경비', '혼합']

// 파일 업로드 유틸 - 경로는 타임스탬프 기반으로 생성 (한글 경로 오류 방지)
async function uploadFile(file: File, guardName: string, docType: string): Promise<string> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const ts = Date.now()
  // 폴더명: guard_<타임스탬프> 형태로 영문만 사용
  const folderKey = `guard_${ts}`
  const path = `${folderKey}/${docType}_${ts}.${ext}`
  const formData = new FormData()
  formData.append('file', file)
  formData.append('path', path)
  formData.append('bucket', 'guard-documents')

  const res = await fetch('/api/storage', { method: 'POST', body: formData })
  if (!res.ok) {
    const e = await res.json()
    throw new Error(e.error || '업로드 실패')
  }
  const { url } = await res.json()
  return url
}

// 문서 업로드 버튼 컴포넌트
function DocUpload({
  label, url, onUpload, onRemove, uploading,
}: {
  label: string
  url?: string
  onUpload: (file: File) => Promise<void>
  onRemove: () => void
  uploading: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      {url ? (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <ShieldCheck className="h-4 w-4 text-green-500 shrink-0" />
          <span className="text-xs text-green-700 flex-1 truncate">업로드 완료</span>
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="text-blue-500 hover:text-blue-700">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button onClick={onRemove} className="text-red-400 hover:text-red-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => ref.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 border-2 border-dashed border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? '업로드 중...' : 'JPG / PNG / PDF'}
        </button>
      )}
      <input
        ref={ref} type="file" className="hidden"
        accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
        onChange={async e => {
          const file = e.target.files?.[0]
          if (file) await onUpload(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

// 서류 만료 여부 체크
function ExpiryBadge({ dateStr }: { dateStr?: string }) {
  if (!dateStr) return null
  const expiry = new Date(dateStr)
  const today = new Date()
  const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return (
    <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">만료</span>
  )
  if (diffDays <= 30) return (
    <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-medium">D-{diffDays}</span>
  )
  return (
    <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">유효</span>
  )
}

type FormState = Omit<GuardProfile, 'id' | 'created_at' | 'updated_at'>

const emptyForm = (): FormState => ({
  name: '',
  staff_id: undefined,
  id_number: '',
  job_category: '신변보호',
  certificate_number: '',
  certificate_issued_at: '',
  certificate_issuer: '',
  crime_check_issued_at: '',
  crime_check_expiry: '',
  id_doc_url: '',
  certificate_doc_url: '',
  crime_check_doc_url: '',
  memo: '',
})

export default function GuardsContent() {
  const [guards, setGuards] = useState<GuardProfile[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<GuardProfile | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [isNew, setIsNew] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [g, s] = await Promise.all([
      db.list<GuardProfile>('guard_profiles', { order: 'created_at', asc: false }),
      db.list<Staff>('staff', { order: 'name', asc: true }),
    ])
    setGuards(g)
    setStaffList(s)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function selectGuard(g: GuardProfile) {
    setSelected(g)
    setIsNew(false)
    setForm({
      name: g.name,
      staff_id: g.staff_id,
      id_number: g.id_number || '',
      job_category: g.job_category || '신변보호',
      certificate_number: g.certificate_number || '',
      certificate_issued_at: g.certificate_issued_at || '',
      certificate_issuer: g.certificate_issuer || '',
      crime_check_issued_at: g.crime_check_issued_at || '',
      crime_check_expiry: g.crime_check_expiry || '',
      id_doc_url: g.id_doc_url || '',
      certificate_doc_url: g.certificate_doc_url || '',
      crime_check_doc_url: g.crime_check_doc_url || '',
      memo: g.memo || '',
    })
  }

  function startNew() {
    setSelected(null)
    setIsNew(true)
    setForm(emptyForm())
  }

  function set(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleUpload(docType: 'id_doc' | 'certificate_doc' | 'crime_check_doc', file: File) {
    const guardName = form.name || 'unknown'
    setUploading(prev => ({ ...prev, [docType]: true }))
    try {
      const url = await uploadFile(file, guardName, docType)
      setForm(prev => ({ ...prev, [`${docType}_url`]: url }))
      toast.success('파일 업로드 완료')
    } catch (e) {
      toast.error('업로드 실패: ' + (e as Error).message)
    } finally {
      setUploading(prev => ({ ...prev, [docType]: false }))
    }
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.warning('이름을 입력해 주세요.'); return }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name:                  form.name.trim(),
        staff_id:              form.staff_id || null,
        id_number:             form.id_number || null,
        job_category:          form.job_category || '신변보호',
        certificate_number:    form.certificate_number || null,
        certificate_issued_at: form.certificate_issued_at || null,
        certificate_issuer:    form.certificate_issuer || null,
        crime_check_issued_at: form.crime_check_issued_at || null,
        crime_check_expiry:    form.crime_check_expiry || null,
        id_doc_url:            form.id_doc_url || null,
        certificate_doc_url:   form.certificate_doc_url || null,
        crime_check_doc_url:   form.crime_check_doc_url || null,
        memo:                  form.memo || null,
      }

      if (isNew) {
        await db.insert('guard_profiles', payload)
        toast.success(`${form.name} 경호원이 등록되었습니다.`)
      } else if (selected) {
        await db.update('guard_profiles', selected.id, payload)
        toast.success(`${form.name} 정보가 수정되었습니다.`)
      }
      await load()
      setIsNew(false)
      setSelected(null)
      setForm(emptyForm())
    } catch (e) {
      toast.error('저장 실패: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selected) return
    if (!confirm(`"${selected.name}" 경호원 정보를 삭제하시겠습니까?`)) return
    await db.delete('guard_profiles', selected.id)
    toast.success('삭제되었습니다.')
    setSelected(null)
    setIsNew(false)
    setForm(emptyForm())
    load()
  }

  const filtered = guards.filter(g =>
    !search || g.name.includes(search) || (g.certificate_number || '').includes(search)
  )

  // 서류 완비 여부
  function docsComplete(g: GuardProfile) {
    return !!(g.id_doc_url && g.certificate_doc_url && g.crime_check_doc_url)
  }

  const showPanel = isNew || !!selected

  return (
    <div className="flex h-full bg-gray-50">

      {/* ── 좌 패널: 경호원 목록 ── */}
      <div className="w-72 shrink-0 flex flex-col border-r border-gray-200 bg-white">
        <div className="p-3 border-b border-gray-200 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
              경호원 관리
            </h2>
            <button onClick={load} className="text-gray-400 hover:text-gray-600">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="이름, 이수증번호 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Button size="sm" onClick={startNew} className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700">
            <Plus className="h-3.5 w-3.5" />
            신규 경호원 등록
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {loading ? (
            <div className="text-center py-10 text-gray-400 text-xs">불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-xs">등록된 경호원이 없습니다.</div>
          ) : filtered.map(g => {
            const complete = docsComplete(g)
            const isSelected = selected?.id === g.id
            return (
              <button
                key={g.id}
                onClick={() => selectGuard(g)}
                className={`w-full text-left rounded-xl border-2 p-2.5 transition-all ${
                  isSelected
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-100 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    complete ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {g.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-gray-800 truncate">{g.name}</span>
                      {g.staff_id && <Link2 className="h-3 w-3 text-purple-400 shrink-0" />}
                    </div>
                    <div className="text-[10px] text-gray-400 truncate">
                      {g.job_category || '미분류'} {g.certificate_number ? `· ${g.certificate_number}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    {complete
                      ? <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">서류완비</span>
                      : <span className="text-[9px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">서류미비</span>
                    }
                    <ExpiryBadge dateStr={g.crime_check_expiry} />
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* 통계 */}
        <div className="p-3 border-t border-gray-100 bg-gray-50">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-white rounded-lg p-1.5">
              <div className="text-sm font-bold text-blue-600">{guards.length}</div>
              <div className="text-[10px] text-gray-400">총 경호원</div>
            </div>
            <div className="bg-white rounded-lg p-1.5">
              <div className="text-sm font-bold text-green-600">{guards.filter(docsComplete).length}</div>
              <div className="text-[10px] text-gray-400">서류완비</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 우 패널: 등록/수정 폼 ── */}
      {showPanel ? (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-6 space-y-6">

            {/* 헤더 */}
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-800">
                {isNew ? '신규 경호원 등록' : `${selected?.name} 정보 수정`}
              </h3>
              <div className="flex gap-2">
                {!isNew && (
                  <Button variant="outline" size="sm" onClick={handleDelete}
                    className="text-red-500 border-red-200 hover:bg-red-50 text-xs h-8">
                    <Trash2 className="h-3.5 w-3.5" />삭제
                  </Button>
                )}
                <Button size="sm" onClick={handleSave} disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 text-xs h-8">
                  <Save className="h-3.5 w-3.5" />
                  {saving ? '저장 중...' : '저장'}
                </Button>
              </div>
            </div>

            {/* 기본 정보 */}
            <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
              <h4 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                <UserCheck className="h-4 w-4 text-blue-500" />기본 정보
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">성명 *</label>
                  <Input value={form.name} onChange={e => set('name', e.target.value)}
                    placeholder="홍길동" className="h-9 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">배치 경비업무</label>
                  <select
                    value={form.job_category}
                    onChange={e => set('job_category', e.target.value)}
                    className="w-full h-9 text-sm border border-gray-200 rounded-lg px-2 bg-white focus:outline-none focus:border-blue-400"
                  >
                    {JOB_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">주민등록번호</label>
                <Input value={form.id_number} onChange={e => set('id_number', e.target.value)}
                  placeholder="870930-1001341" className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  크루관리 연결 <span className="text-gray-400">(선택)</span>
                </label>
                <select
                  value={form.staff_id || ''}
                  onChange={e => setForm(prev => ({ ...prev, staff_id: e.target.value || undefined }))}
                  className="w-full h-9 text-sm border border-gray-200 rounded-lg px-2 bg-white focus:outline-none focus:border-blue-400"
                >
                  <option value="">연결 안함</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </section>

            {/* 이수증 정보 */}
            <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
              <h4 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-indigo-500" />신임경비교육 이수증
              </h4>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">이수증 교부번호</label>
                <Input value={form.certificate_number}
                  onChange={e => set('certificate_number', e.target.value)}
                  placeholder="대경합31일제21039018호" className="h-9 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">발급일</label>
                  <Input type="date" value={form.certificate_issued_at}
                    onChange={e => set('certificate_issued_at', e.target.value)}
                    className="h-9 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">발급기관</label>
                  <Input value={form.certificate_issuer}
                    onChange={e => set('certificate_issuer', e.target.value)}
                    placeholder="대경경비협회" className="h-9 text-sm" />
                </div>
              </div>
            </section>

            {/* 성범죄 회보서 */}
            <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
              <h4 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-green-500" />성범죄 회보서
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">발급일</label>
                  <Input type="date" value={form.crime_check_issued_at}
                    onChange={e => set('crime_check_issued_at', e.target.value)}
                    className="h-9 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    유효기간 <ExpiryBadge dateStr={form.crime_check_expiry} />
                  </label>
                  <Input type="date" value={form.crime_check_expiry}
                    onChange={e => set('crime_check_expiry', e.target.value)}
                    className="h-9 text-sm" />
                </div>
              </div>
            </section>

            {/* 서류 파일 업로드 */}
            <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
              <h4 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                <Upload className="h-4 w-4 text-orange-500" />서류 파일 업로드
              </h4>
              {!form.name.trim() && (
                <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  이름을 먼저 입력해야 파일을 업로드할 수 있습니다.
                </div>
              )}
              <div className="space-y-3">
                <DocUpload
                  label="신분증 사본"
                  url={form.id_doc_url}
                  uploading={!!uploading.id_doc}
                  onUpload={f => handleUpload('id_doc', f)}
                  onRemove={() => set('id_doc_url', '')}
                />
                <DocUpload
                  label="신임경비교육 이수증"
                  url={form.certificate_doc_url}
                  uploading={!!uploading.certificate_doc}
                  onUpload={f => handleUpload('certificate_doc', f)}
                  onRemove={() => set('certificate_doc_url', '')}
                />
                <DocUpload
                  label="성범죄 회보서"
                  url={form.crime_check_doc_url}
                  uploading={!!uploading.crime_check_doc}
                  onUpload={f => handleUpload('crime_check_doc', f)}
                  onRemove={() => set('crime_check_doc_url', '')}
                />
              </div>
            </section>

            {/* 메모 */}
            <section className="bg-white rounded-2xl border border-gray-200 p-5">
              <h4 className="text-sm font-bold text-gray-700 mb-3">메모</h4>
              <textarea
                value={form.memo}
                onChange={e => set('memo', e.target.value)}
                placeholder="특이사항, 담당자 메모 등"
                rows={3}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-blue-400"
              />
            </section>

          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
          <ShieldCheck className="h-16 w-16 mb-4 opacity-20" />
          <p className="text-sm font-medium">경호원을 선택하거나 신규 등록하세요</p>
          <p className="text-xs mt-1">신분증, 이수증, 성범죄 회보서를 통합 관리합니다</p>
          <Button size="sm" onClick={startNew} className="mt-4 bg-blue-600 hover:bg-blue-700 text-xs">
            <Plus className="h-3.5 w-3.5" />신규 경호원 등록
          </Button>
        </div>
      )}
    </div>
  )
}
