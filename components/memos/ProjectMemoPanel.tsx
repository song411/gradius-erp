'use client'

import { useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/supabase/api'
import type { ProjectMemo, ProjectMemoType } from '@/lib/supabase/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  Plus, Trash2, MessageSquare, Users, Star, ChevronDown, ChevronUp, StickyNote
} from 'lucide-react'

const MEMO_TYPES: { key: ProjectMemoType; label: string; icon: React.ReactNode; placeholder: string }[] = [
  {
    key: '인원추천',
    label: '인원추천',
    icon: <Users className="h-3.5 w-3.5" />,
    placeholder: '예:\n이순철 (주차 경험, 교원대 출석수업 참여자)\n김태옥 (나이 많음, 안성 거주, 어린이날 행사 참여)\n엄정인 (교원대 어린이날 에이스)',
  },
  {
    key: '운영메모',
    label: '운영메모',
    icon: <StickyNote className="h-3.5 w-3.5" />,
    placeholder: '운영 관련 참고사항, 주의사항 등을 입력하세요',
  },
  {
    key: '피드백',
    label: '피드백',
    icon: <Star className="h-3.5 w-3.5" />,
    placeholder: '좋았던 점:\n아쉬운 점:\n개선사항:',
  },
]

interface Props {
  inquiryId: string
  compact?: boolean
}

export default function ProjectMemoPanel({ inquiryId, compact = false }: Props) {
  const [memos, setMemos] = useState<ProjectMemo[]>([])
  const [activeTab, setActiveTab] = useState<ProjectMemoType>('인원추천')
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [content, setContent] = useState('')
  const [author, setAuthor] = useState('')
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await db.list<ProjectMemo>('project_memos', {
        filters: { inquiry_id: inquiryId },
        order: 'created_at',
        asc: false,
      })
      setMemos(data)
    } catch {
      // 테이블 미생성 등 에러 시 빈 목록 유지
    } finally {
      setLoading(false)
    }
  }, [inquiryId])

  useEffect(() => { load() }, [load])

  async function handleAdd() {
    if (!content.trim()) { toast.error('내용을 입력해주세요'); return }
    setSaving(true)
    try {
      await db.insert('project_memos', {
        inquiry_id: inquiryId,
        type: compact ? '인원추천' : activeTab,
        content: content.trim(),
        author: author.trim() || '미지정',
      })
      toast.success('메모가 저장되었습니다')
      setContent('')
      setAuthor('')
      setShowForm(false)
      load()
    } catch (e) {
      toast.error('저장 실패: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('이 메모를 삭제하시겠습니까?')) return
    await db.delete('project_memos', id)
    toast.success('삭제되었습니다')
    load()
  }

  // ── compact 모드: 배정 뷰 우측 패널에 인원추천 메모 + 추가 폼 ──
  if (compact) {
    const recMemos = memos.filter(m => m.type === '인원추천')
    return (
      <div className="bg-indigo-50 border border-indigo-100 rounded-lg mx-4 mt-3 mb-1">
        {/* 헤더 */}
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-2 text-xs font-medium text-indigo-700 hover:text-indigo-900 transition-colors flex-1"
          >
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span>인원추천 메모 {recMemos.length > 0 && `(${recMemos.length}건)`}</span>
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => { setShowForm(v => !v); setExpanded(true) }}
            className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 bg-white border border-indigo-200 rounded px-2 py-0.5 transition-colors"
          >
            <Plus className="h-3 w-3" />
            추천메모 추가
          </button>
        </div>

        {expanded && (
          <div className="px-3 pb-3 space-y-2">
            {/* 추가 폼 */}
            {showForm && (
              <div className="bg-white rounded-lg p-2.5 border border-indigo-200 space-y-1.5">
                <Input
                  placeholder="작성자 이름 (예: 송무재)"
                  value={author}
                  onChange={e => setAuthor(e.target.value)}
                  className="text-xs h-7"
                />
                <Textarea
                  placeholder={'예:\n이순철 (주차 경험, 교원대 참여자)\n김태옥 (나이 많음, 어린이날 행사 참여)'}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  rows={4}
                  className="text-xs resize-none"
                />
                <div className="flex gap-1.5 justify-end">
                  <Button size="sm" variant="outline" className="h-6 text-[11px] px-2" onClick={() => { setShowForm(false); setContent(''); setAuthor('') }}>
                    취소
                  </Button>
                  <Button size="sm" className="h-6 text-[11px] px-2" onClick={handleAdd} disabled={saving}>
                    {saving ? '저장 중...' : '저장'}
                  </Button>
                </div>
              </div>
            )}

            {/* 메모 목록 */}
            {loading ? (
              <div className="flex justify-center py-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-400" />
              </div>
            ) : recMemos.length === 0 && !showForm ? (
              <p className="text-[11px] text-indigo-400 text-center py-1">등록된 추천 메모가 없습니다</p>
            ) : (
              recMemos.map(m => (
                <div key={m.id} className="bg-white rounded-lg p-2.5 group">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[11px] font-semibold text-indigo-600">추천인: {m.author}</span>
                    <span className="text-[10px] text-gray-300 ml-auto">{m.created_at?.slice(0, 10)}</span>
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-400 ml-1"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">{m.content}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    )
  }

  // ── 풀 모드: 문의 상세 페이지 내 탭 패널 ──
  const filtered = memos.filter(m => m.type === activeTab)
  const activeMeta = MEMO_TYPES.find(t => t.key === activeTab)!

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* 탭 헤더 */}
      <div className="flex items-center border-b border-gray-100 px-4 pt-1 gap-1">
        <div className="flex gap-1 flex-1">
          {MEMO_TYPES.map(t => {
            const count = memos.filter(m => m.type === t.key).length
            return (
              <button
                key={t.key}
                onClick={() => { setActiveTab(t.key); setShowForm(false) }}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === t.key
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.icon}
                {t.label}
                {count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    activeTab === t.key ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'
                  }`}>{count}</span>
                )}
              </button>
            )
          })}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs mb-1"
          onClick={() => setShowForm(v => !v)}
        >
          <Plus className="h-3.5 w-3.5" />
          메모 추가
        </Button>
      </div>

      <div className="p-4 space-y-3">
        {/* 추가 폼 */}
        {showForm && (
          <div className="bg-gray-50 rounded-lg p-3 space-y-2 border border-gray-200">
            <Input
              placeholder="작성자 이름 (예: 송무재)"
              value={author}
              onChange={e => setAuthor(e.target.value)}
              className="text-sm h-8"
            />
            <Textarea
              placeholder={activeMeta.placeholder}
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={5}
              className="text-sm resize-none"
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setShowForm(false); setContent(''); setAuthor('') }}>
                취소
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={handleAdd} disabled={saving}>
                {saving ? '저장 중...' : '저장'}
              </Button>
            </div>
          </div>
        )}

        {/* 메모 목록 */}
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p>등록된 {activeMeta.label} 메모가 없습니다</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-1.5 text-xs text-indigo-500 hover:underline"
            >
              + 첫 메모 작성하기
            </button>
          </div>
        ) : (
          filtered.map(m => (
            <div key={m.id} className="bg-gray-50 rounded-lg p-3.5 group hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-semibold text-gray-700">{m.author}</span>
                <span className="text-xs text-gray-400">{m.created_at?.slice(0, 10)}</span>
                <button
                  onClick={() => handleDelete(m.id)}
                  className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 p-0.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{m.content}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
