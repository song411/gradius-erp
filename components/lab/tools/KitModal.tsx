'use client'

import { useState, useEffect } from 'react'
import { X, Plus, ChevronRight, CheckCircle2, Clock, Send, Trash2, Tag, Save } from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/lib/supabase/api'

// ── 타입 ─────────────────────────────────────────────────────────
type Category = '피드백' | '기획서' | '데이터점검' | '리서치'
type Status   = '아이디어' | '검토중' | '개발예정' | '완료'
type Priority = '낮음' | '보통' | '높음' | '긴급'

interface Note {
  id: string
  category: Category
  template_type: string
  title: string
  content: string
  author: string
  status: Status
  priority: Priority
  tags: string[]
  created_at: string
}

// ── 템플릿 정의 ──────────────────────────────────────────────────
interface Template {
  type: string
  name: string
  emoji: string
  placeholder: string
  fields: { key: string; label: string; placeholder: string }[]
}

const TEMPLATES: Record<Category, Template[]> = {
  피드백: [
    {
      type: 'page_note',
      name: '페이지별 사용 노트',
      emoji: '📝',
      placeholder: '어떤 페이지를 사용하면서 느낀 점을 자유롭게 적어주세요.',
      fields: [
        { key: 'page', label: '페이지명', placeholder: '예: 견적관리, 인원배정, 지급관리' },
        { key: 'problem', label: '발견한 문제 / 불편한 점', placeholder: '어떤 상황에서 불편했나요?' },
        { key: 'expected', label: '기대했던 동작', placeholder: '어떻게 되었으면 좋겠나요?' },
        { key: 'suggestion', label: '개선 제안', placeholder: '아이디어가 있다면 자유롭게' },
      ],
    },
    {
      type: 'onboarding',
      name: '신규 사용자 관찰 기록',
      emoji: '👀',
      placeholder: '처음 ERP를 사용할 때 막혔던 지점을 기록해 주세요.',
      fields: [
        { key: 'stuck_point', label: '막힌 지점', placeholder: '어디서 10초 이상 헤맸나요?' },
        { key: 'reason', label: '이유', placeholder: '왜 헷갈렸나요?' },
        { key: 'better', label: '이렇게 바뀌면 좋겠다', placeholder: '직관적인 개선 방향' },
      ],
    },
    {
      type: 'missing',
      name: '"없어서 불편한 것" 리스트',
      emoji: '🚫',
      placeholder: '있었으면 좋겠는데 없는 기능들을 나열해 주세요.',
      fields: [
        { key: 'feature', label: '없는 기능', placeholder: '예: 행사별 첨부파일 업로드' },
        { key: 'use_case', label: '언제 필요한가', placeholder: '어떤 상황에서 이 기능이 필요한가요?' },
        { key: 'impact', label: '없어서 어떤 불편이 있나', placeholder: '현재 어떻게 대처하고 있나요?' },
      ],
    },
  ],
  기획서: [
    {
      type: 'feature_request',
      name: '기능 개선 요청서',
      emoji: '⚙️',
      placeholder: '개발자에게 전달할 기능 개선 요청을 상세히 작성해 주세요.',
      fields: [
        { key: 'feature_name', label: '기능명', placeholder: '예: 견적서 PDF 출력 기능' },
        { key: 'current', label: '현재 상태', placeholder: '지금 어떻게 동작하나요?' },
        { key: 'why', label: '왜 불편한가 (현장 사례)', placeholder: '실제로 어떤 상황에서 문제가 됐나요?' },
        { key: 'want', label: '원하는 동작', placeholder: '이렇게 바뀌면 좋겠다' },
        { key: 'related', label: '관련 페이지/버튼', placeholder: '예: 견적관리 > 목록 > 저장 버튼' },
        { key: 'db_change', label: '예상 DB 변화 (있다면)', placeholder: '새 컬럼이나 테이블이 필요할까요?' },
      ],
    },
    {
      type: 'bug_report',
      name: '버그 리포트',
      emoji: '🐛',
      placeholder: '발견한 버그를 재현 가능하게 기록해 주세요.',
      fields: [
        { key: 'where', label: '발생 위치', placeholder: '예: 지급관리 > 지급완료 버튼 클릭 시' },
        { key: 'steps', label: '재현 순서', placeholder: '1. ... 2. ... 3. ...' },
        { key: 'actual', label: '실제로 일어난 일', placeholder: '어떤 오류가 나타났나요?' },
        { key: 'expected', label: '원래 되어야 하는 동작', placeholder: '정상 동작은 무엇인가요?' },
        { key: 'env', label: '환경 (브라우저, 기기)', placeholder: '예: Chrome / 맥북 / 모바일' },
      ],
    },
    {
      type: 'new_feature',
      name: '신규 기능 제안서',
      emoji: '💡',
      placeholder: '새로운 기능 아이디어를 제안해 주세요.',
      fields: [
        { key: 'idea', label: '아이디어 한 줄 요약', placeholder: '예: 크루에게 카카오 알림톡 자동 발송' },
        { key: 'background', label: '배경 / 필요성', placeholder: '왜 이 기능이 필요한가요?' },
        { key: 'detail', label: '기능 상세 설명', placeholder: '어떻게 동작하면 좋을지 설명해 주세요' },
        { key: 'reference', label: '참고 레퍼런스 (있다면)', placeholder: '비슷한 서비스나 화면 예시' },
      ],
    },
  ],
  데이터점검: [
    {
      type: 'crew_check',
      name: '크루 정보 누락 체크',
      emoji: '👥',
      placeholder: '크루 데이터 중 누락된 항목을 점검해 주세요.',
      fields: [
        { key: 'crew_name', label: '크루 이름', placeholder: '점검 대상 크루명' },
        { key: 'missing', label: '누락된 항목', placeholder: '예: 사진, 자격증번호, 이수증, 성범죄회보' },
        { key: 'action', label: '처리 방법', placeholder: '어떻게 수집/보완할 예정인가요?' },
      ],
    },
    {
      type: 'customer_check',
      name: '고객사 정보 완성도 점검',
      emoji: '🏢',
      placeholder: '고객사 데이터 품질을 점검해 주세요.',
      fields: [
        { key: 'company', label: '고객사명', placeholder: '점검 대상 고객사명' },
        { key: 'missing', label: '누락/오류 항목', placeholder: '예: 사업자번호, 담당자 이메일, 주소' },
        { key: 'note', label: '비고', placeholder: '특이사항 또는 처리 방법' },
      ],
    },
    {
      type: 'migration',
      name: '과거 데이터 마이그레이션',
      emoji: '📦',
      placeholder: '구글시트나 기존 자료에서 ERP로 옮길 데이터를 기록해 주세요.',
      fields: [
        { key: 'source', label: '출처', placeholder: '예: 2024년 구글시트, 엑셀 파일' },
        { key: 'data_type', label: '데이터 종류', placeholder: '예: 행사 이력, 크루 정보, 정산 내역' },
        { key: 'count', label: '대략적인 건수', placeholder: '예: 약 50건' },
        { key: 'status', label: '진행 상태', placeholder: '예: 완료, 진행 중, 대기' },
      ],
    },
  ],
  리서치: [
    {
      type: 'competitor',
      name: '경쟁사 조사',
      emoji: '🔍',
      placeholder: '경쟁 서비스나 레퍼런스를 조사한 내용을 기록해 주세요.',
      fields: [
        { key: 'company', label: '조사 대상', placeholder: '서비스명 또는 회사명' },
        { key: 'features', label: '주요 기능', placeholder: '우리와 비교해서 눈에 띄는 기능' },
        { key: 'good', label: '좋은 점 (벤치마킹 포인트)', placeholder: '우리도 참고할 만한 것' },
        { key: 'gap', label: '우리와의 차별점', placeholder: '우리가 더 낫거나 부족한 부분' },
      ],
    },
    {
      type: 'automation',
      name: '반복업무 자동화 후보',
      emoji: '⚡',
      placeholder: '자동화하면 좋을 반복 업무를 기록해 주세요.',
      fields: [
        { key: 'task', label: '업무명', placeholder: '예: 월말 지급 명세서 출력' },
        { key: 'frequency', label: '빈도', placeholder: '예: 매주 월요일, 매월 25일' },
        { key: 'time_spent', label: '소요 시간', placeholder: '예: 약 30분' },
        { key: 'how', label: '자동화 방법 아이디어', placeholder: '어떻게 자동화하면 좋을까요?' },
      ],
    },
    {
      type: 'integration',
      name: '외부 연동 가능성 조사',
      emoji: '🔗',
      placeholder: '연동하면 유용할 외부 서비스/API를 기록해 주세요.',
      fields: [
        { key: 'service', label: '서비스/API명', placeholder: '예: 카카오 알림톡, 국세청 사업자 조회' },
        { key: 'purpose', label: '연동 목적', placeholder: '어떤 문제를 해결하나요?' },
        { key: 'feasibility', label: '가능성 / 비용', placeholder: '무료 API인지, 비용이 어느 정도인지' },
      ],
    },
  ],
}

const CATEGORY_LIST: Category[] = ['피드백', '기획서', '데이터점검', '리서치']
const CATEGORY_META: Record<Category, { emoji: string; color: string }> = {
  피드백:   { emoji: '💬', color: 'from-blue-500 to-blue-700' },
  기획서:   { emoji: '⚙️', color: 'from-violet-500 to-purple-700' },
  데이터점검: { emoji: '🔎', color: 'from-emerald-500 to-teal-700' },
  리서치:   { emoji: '🔍', color: 'from-amber-500 to-orange-600' },
}
const STATUS_META: Record<Status, { label: string; color: string; icon: React.ReactNode }> = {
  '아이디어': { label: '아이디어', color: 'bg-gray-100 text-gray-600', icon: <Plus className="h-3 w-3" /> },
  '검토중':   { label: '검토중',   color: 'bg-blue-100 text-blue-700', icon: <Clock className="h-3 w-3" /> },
  '개발예정': { label: '개발예정', color: 'bg-amber-100 text-amber-700', icon: <Send className="h-3 w-3" /> },
  '완료':     { label: '완료',     color: 'bg-green-100 text-green-700', icon: <CheckCircle2 className="h-3 w-3" /> },
}
const PRIORITY_META: Record<Priority, { color: string }> = {
  낮음: { color: 'bg-gray-100 text-gray-500' },
  보통: { color: 'bg-blue-100 text-blue-600' },
  높음: { color: 'bg-orange-100 text-orange-600' },
  긴급: { color: 'bg-red-100 text-red-600' },
}

// ── 작성 폼 ──────────────────────────────────────────────────────
function WriteForm({
  category,
  template,
  onSave,
  onCancel,
}: {
  category: Category
  template: Template
  onSave: () => void
  onCancel: () => void
}) {
  const [title, setTitle]     = useState('')
  const [author, setAuthor]   = useState('')
  const [priority, setPriority] = useState<Priority>('보통')
  const [fields, setFields]   = useState<Record<string, string>>({})
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags]       = useState<string[]>([])
  const [saving, setSaving]   = useState(false)

  function addTag() {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) setTags(p => [...p, t])
    setTagInput('')
  }

  // 필드 내용을 마크다운 형식으로 합치기
  function buildContent() {
    return template.fields
      .map(f => `**${f.label}**\n${fields[f.key] || '(미입력)'}`)
      .join('\n\n')
  }

  async function handleSave() {
    if (!title.trim()) { toast.error('제목을 입력해 주세요'); return }
    if (!author.trim()) { toast.error('작성자를 입력해 주세요'); return }
    setSaving(true)
    try {
      await db.insert('improvement_notes', {
        category,
        template_type: template.type,
        title: title.trim(),
        content: buildContent(),
        author: author.trim(),
        status: '아이디어',
        priority,
        tags,
      })
      toast.success('저장되었습니다!')
      onSave()
    } catch {
      toast.error('저장에 실패했습니다')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center gap-3 p-5 border-b border-gray-100">
        <span className="text-2xl">{template.emoji}</span>
        <div>
          <div className="text-xs text-gray-400 font-medium">{category}</div>
          <div className="text-base font-bold text-gray-900">{template.name}</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* 제목 + 작성자 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">제목 *</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="한 줄로 요약해 주세요"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">작성자 *</label>
            <input value={author} onChange={e => setAuthor(e.target.value)}
              placeholder="이름 또는 닉네임"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-400" />
          </div>
        </div>

        {/* 우선순위 */}
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1.5 block">우선순위</label>
          <div className="flex gap-2">
            {(['낮음', '보통', '높음', '긴급'] as Priority[]).map(p => (
              <button key={p} onClick={() => setPriority(p)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                  priority === p
                    ? PRIORITY_META[p].color + ' border-current ring-1 ring-current'
                    : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-400'
                }`}>{p}</button>
            ))}
          </div>
        </div>

        {/* 템플릿 필드 */}
        {template.fields.map(f => (
          <div key={f.key}>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">{f.label}</label>
            <textarea value={fields[f.key] || ''} onChange={e => setFields(p => ({ ...p, [f.key]: e.target.value }))}
              placeholder={f.placeholder} rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-400 resize-none" />
          </div>
        ))}

        {/* 태그 */}
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1.5 block">태그</label>
          <div className="flex gap-2 flex-wrap mb-2">
            {tags.map(t => (
              <span key={t} className="flex items-center gap-1 bg-violet-100 text-violet-700 text-xs px-2 py-0.5 rounded-full">
                #{t}
                <button onClick={() => setTags(p => p.filter(x => x !== t))}><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTag()}
              placeholder="태그 입력 후 Enter"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-violet-400" />
            <button onClick={addTag}
              className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs hover:bg-gray-200">
              <Tag className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 하단 버튼 */}
      <div className="flex gap-2 p-4 border-t border-gray-100">
        <button onClick={onCancel}
          className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">
          취소
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex-1 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-2">
          <Save className="h-4 w-4" />
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  )
}

// ── 노트 카드 ─────────────────────────────────────────────────────
function NoteCard({ note, onDelete, onStatusChange }: {
  note: Note
  onDelete: (id: string) => void
  onStatusChange: (id: string, status: Status) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const sm = STATUS_META[note.status]
  const pm = PRIORITY_META[note.priority]

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${sm.color}`}>
                {sm.icon}{sm.label}
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${pm.color}`}>
                {note.priority}
              </span>
              <span className="text-[10px] text-gray-400">{note.category}</span>
            </div>
            <div className="font-semibold text-gray-900 text-sm truncate">{note.title}</div>
            <div className="text-xs text-gray-400 mt-0.5">{note.author} · {new Date(note.created_at).toLocaleDateString('ko-KR')}</div>
          </div>
          <button onClick={() => setExpanded(p => !p)}
            className={`text-gray-400 hover:text-gray-600 transition-transform ${expanded ? 'rotate-90' : ''}`}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* 태그 */}
        {note.tags?.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-2">
            {note.tags.map(t => (
              <span key={t} className="text-[10px] bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded-full">#{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* 펼친 내용 */}
      {expanded && (
        <div className="border-t border-gray-50 px-4 py-3">
          <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans leading-relaxed">{note.content}</pre>

          {/* 상태 변경 */}
          <div className="mt-3 flex items-center justify-between">
            <div className="flex gap-1 flex-wrap">
              {(['아이디어', '검토중', '개발예정', '완료'] as Status[]).map(s => (
                <button key={s} onClick={() => onStatusChange(note.id, s)}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all ${
                    note.status === s
                      ? STATUS_META[s].color + ' border-current'
                      : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-400'
                  }`}>{s}</button>
              ))}
            </div>
            <button onClick={() => onDelete(note.id)}
              className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 메인 모달 ─────────────────────────────────────────────────────
export default function KitModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab]               = useState<'write' | 'list'>('list')
  const [selCategory, setSelCategory] = useState<Category>('피드백')
  const [selTemplate, setSelTemplate] = useState<Template | null>(null)
  const [notes, setNotes]           = useState<Note[]>([])
  const [filterCat, setFilterCat]   = useState<Category | '전체'>('전체')
  const [filterStatus, setFilterStatus] = useState<Status | '전체'>('전체')
  const [loading, setLoading]       = useState(false)

  async function loadNotes() {
    setLoading(true)
    try {
      const data = await db.list('improvement_notes', { order: 'created_at', asc: false })
      setNotes((data as Note[]) || [])
    } catch {
      toast.error('노트를 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadNotes() }, [])

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    try {
      await db.delete('improvement_notes', id)
      setNotes(p => p.filter(n => n.id !== id))
      toast.success('삭제되었습니다')
    } catch {
      toast.error('삭제에 실패했습니다')
    }
  }

  async function handleStatusChange(id: string, status: Status) {
    try {
      await db.update('improvement_notes', id, { status })
      setNotes(p => p.map(n => n.id === id ? { ...n, status } : n))
    } catch {
      toast.error('상태 변경에 실패했습니다')
    }
  }

  const filteredNotes = notes.filter(n => {
    if (filterCat !== '전체' && n.category !== filterCat) return false
    if (filterStatus !== '전체' && n.status !== filterStatus) return false
    return true
  })

  // 작성 폼 화면
  if (selTemplate) {
    return (
      <div className="flex flex-col h-[90vh] max-h-[700px]">
        <WriteForm
          category={selCategory}
          template={selTemplate}
          onSave={() => { setSelTemplate(null); setTab('list'); loadNotes() }}
          onCancel={() => setSelTemplate(null)}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[90vh] max-h-[760px]">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛠️</span>
            <span className="text-lg font-extrabold text-gray-900">ERP 고도화 준비키트</span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">피드백 · 기획서 · 데이터 점검 · 리서치를 체계적으로 관리하세요</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 px-6 py-3 border-b border-gray-100">
        <button onClick={() => setTab('list')}
          className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
            tab === 'list' ? 'bg-violet-600 text-white' : 'text-gray-500 hover:bg-gray-100'
          }`}>목록 ({notes.length})</button>
        <button onClick={() => setTab('write')}
          className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
            tab === 'write' ? 'bg-violet-600 text-white' : 'text-gray-500 hover:bg-gray-100'
          }`}>+ 새로 작성</button>
      </div>

      {/* ── 작성 탭 ── */}
      {tab === 'write' && (
        <div className="flex-1 overflow-y-auto p-5">
          {CATEGORY_LIST.map(cat => {
            const meta = CATEGORY_META[cat]
            return (
              <div key={cat} className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">{meta.emoji}</span>
                  <span className="font-bold text-gray-800 text-sm">{cat}</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {TEMPLATES[cat].map(tmpl => (
                    <button key={tmpl.type}
                      onClick={() => { setSelCategory(cat); setSelTemplate(tmpl) }}
                      className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-violet-300 hover:bg-violet-50 text-left transition-all group">
                      <span className="text-xl">{tmpl.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-800 group-hover:text-violet-700">{tmpl.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5 truncate">{tmpl.placeholder}</div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-violet-400 flex-shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── 목록 탭 ── */}
      {tab === 'list' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 필터 */}
          <div className="px-5 py-3 flex gap-2 flex-wrap border-b border-gray-50">
            <div className="flex gap-1 flex-wrap">
              {(['전체', ...CATEGORY_LIST] as (Category | '전체')[]).map(c => (
                <button key={c} onClick={() => setFilterCat(c)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                    filterCat === c ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-500 border-gray-200 hover:border-violet-300'
                  }`}>{c}</button>
              ))}
            </div>
            <div className="flex gap-1 flex-wrap">
              {(['전체', '아이디어', '검토중', '개발예정', '완료'] as (Status | '전체')[]).map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                    filterStatus === s ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                  }`}>{s}</button>
              ))}
            </div>
          </div>

          {/* 노트 목록 */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {loading ? (
              <div className="text-center py-12 text-gray-400 text-sm">불러오는 중...</div>
            ) : filteredNotes.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">📭</div>
                <div className="text-gray-400 text-sm">아직 작성된 노트가 없어요</div>
                <button onClick={() => setTab('write')}
                  className="mt-4 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700">
                  첫 노트 작성하기
                </button>
              </div>
            ) : (
              filteredNotes.map(note => (
                <NoteCard key={note.id} note={note}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
