'use client'

// 날짜 메모 작성 창
// ─────────────────────────────────────────────────────────
// 달력의 날짜 칸을 누르면 열린다. 그 날에 행사가 하나도 없어도 열린다 —
// 바로 그게 이 기능의 목적이다 ("9/30에 아무것도 없어도 메모를 넣을 수 있게").

import { useEffect, useState } from 'react'
import { X, Trash2, Plus } from 'lucide-react'
import type { CalendarNote } from '@/lib/supabase/types'
import { Dialog, DialogHeader } from '@/components/ui/dialog'
import { NOTE_COLORS, colorOf, type CalendarNotesApi } from './useCalendarNotes'
import { dowOf } from './dateUtils'

interface Props {
  date: string
  api: CalendarNotesApi
  onClose: () => void
}

export default function DayMemoModal({ date, api, onClose }: Props) {
  const notes = api.byDate.get(date) ?? []

  const [text,   setText]   = useState('')
  const [color,  setColor]  = useState('gray')
  const [author, setAuthor] = useState('')
  const [busy,   setBusy]   = useState(false)

  // 수정 중인 메모
  const [editId,    setEditId]    = useState<string | null>(null)
  const [editText,  setEditText]  = useState('')
  const [editColor, setEditColor] = useState('gray')

  // 작성자는 매번 치기 번거로우므로 브라우저에 남긴다
  useEffect(() => {
    let alive = true
    // 마이크로태스크로 미뤄 effect 동기 구간에서 setState하지 않는다
    Promise.resolve().then(() => {
      if (!alive) return
      try { setAuthor(localStorage.getItem('gradius.calendarNote.author') ?? '') } catch { /* 저장 차단 환경 */ }
    })
    return () => { alive = false }
  }, [])

  const md = `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`

  async function submit() {
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      await api.add(date, text, color, author)
      setText('')
      try { localStorage.setItem('gradius.calendarNote.author', author.trim()) } catch { /* 무시 */ }
    } catch { /* 토스트는 훅에서 띄운다 */ } finally { setBusy(false) }
  }

  async function saveEdit() {
    if (!editId || !editText.trim() || busy) return
    setBusy(true)
    try {
      await api.edit(editId, editText, editColor)
      setEditId(null)
    } catch { /* 토스트는 훅에서 */ } finally { setBusy(false) }
  }

  return (
    <Dialog open onClose={onClose}>
      <div className="w-[420px] max-w-[92vw]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-gray-900">{md}</span>
            <span className="text-xs text-gray-400">{dowOf(date)}요일</span>
            <span className="ml-auto text-xs text-gray-400">메모 {notes.length}건</span>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        </DialogHeader>

        <div className="p-3 space-y-3 max-h-[60vh] overflow-y-auto">
          {/* 기존 메모 */}
          {notes.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">아직 메모가 없습니다.</p>
          ) : (
            <div className="space-y-1.5">
              {notes.map(n => (
                <NoteRow
                  key={n.id}
                  note={n}
                  editing={editId === n.id}
                  editText={editText}
                  editColor={editColor}
                  busy={busy}
                  onStartEdit={() => { setEditId(n.id); setEditText(n.content); setEditColor(n.color ?? 'gray') }}
                  onChangeText={setEditText}
                  onChangeColor={setEditColor}
                  onSave={saveEdit}
                  onCancel={() => setEditId(null)}
                  onDelete={async () => {
                    setBusy(true)
                    try { await api.remove(n.id) } catch { /* 토스트는 훅에서 */ } finally { setBusy(false) }
                  }}
                />
              ))}
            </div>
          )}

          {/* 새 메모 */}
          <div className="border-t border-gray-200 pt-3 space-y-2">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                // 줄바꿈은 Shift+Enter. 짧은 쪽지가 대부분이라 Enter 를 저장에 쓴다.
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
              }}
              rows={2}
              placeholder="이 날에 남길 메모 (Enter 저장 · Shift+Enter 줄바꿈)"
              className="w-full text-xs px-2 py-1.5 rounded-lg border border-gray-200
                focus:border-blue-400 focus:outline-none resize-none"
            />
            <div className="flex items-center gap-1.5 flex-wrap">
              {NOTE_COLORS.map(c => (
                <button
                  key={c.key}
                  onClick={() => setColor(c.key)}
                  title={c.label}
                  className={`text-2xs px-1.5 py-0.5 rounded border transition ${c.chip}
                    ${color === c.key ? 'ring-2 ring-offset-1 ring-gray-400' : 'opacity-60 hover:opacity-100'}`}
                >
                  {c.label}
                </button>
              ))}
              <input
                value={author}
                onChange={e => setAuthor(e.target.value)}
                placeholder="작성자"
                className="ml-auto w-20 text-xs px-1.5 py-1 rounded border border-gray-200
                  focus:border-blue-400 focus:outline-none"
              />
              <button
                onClick={submit}
                disabled={!text.trim() || busy}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg
                  bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
                추가
              </button>
            </div>
          </div>

          <p className="text-2xs text-gray-400">
            이 메모는 달력에서 보기 위한 것입니다. 배정·금액·중복배정 계산에는 들어가지 않습니다.
          </p>
        </div>
      </div>
    </Dialog>
  )
}

// ─── 메모 한 줄 ───────────────────────────────────────────
function NoteRow({
  note, editing, editText, editColor, busy,
  onStartEdit, onChangeText, onChangeColor, onSave, onCancel, onDelete,
}: {
  note: CalendarNote
  editing: boolean
  editText: string
  editColor: string
  busy: boolean
  onStartEdit: () => void
  onChangeText: (v: string) => void
  onChangeColor: (v: string) => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  const c = colorOf(note.color)

  if (editing) {
    return (
      <div className="rounded-lg border border-blue-300 bg-blue-50/40 p-2 space-y-1.5">
        <textarea
          value={editText}
          onChange={e => onChangeText(e.target.value)}
          rows={2}
          className="w-full text-xs px-2 py-1 rounded border border-gray-200
            focus:border-blue-400 focus:outline-none resize-none"
        />
        <div className="flex items-center gap-1 flex-wrap">
          {NOTE_COLORS.map(x => (
            <button
              key={x.key}
              onClick={() => onChangeColor(x.key)}
              className={`text-2xs px-1.5 py-0.5 rounded border ${x.chip}
                ${editColor === x.key ? 'ring-2 ring-offset-1 ring-gray-400' : 'opacity-60'}`}
            >
              {x.label}
            </button>
          ))}
          <button
            onClick={onSave}
            disabled={busy}
            className="ml-auto text-xs px-2 py-0.5 rounded bg-blue-600 text-white font-semibold disabled:opacity-40"
          >
            저장
          </button>
          <button onClick={onCancel} className="text-xs px-2 py-0.5 rounded border border-gray-200 text-gray-500">
            취소
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-lg border px-2 py-1.5 flex items-start gap-2 ${c.chip}`}>
      <button
        onClick={onStartEdit}
        className="flex-1 min-w-0 text-left"
        title="누르면 수정합니다"
      >
        <div className="text-xs whitespace-pre-wrap break-words">{note.content}</div>
        {note.author && (
          <div className="text-2xs opacity-60 mt-0.5">{note.author}</div>
        )}
      </button>
      <button
        onClick={onDelete}
        disabled={busy}
        className="shrink-0 opacity-50 hover:opacity-100 disabled:opacity-20"
        title="삭제"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
