'use client'

import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/supabase/api'
import { toast } from 'sonner'
import { RefreshCw, Save, X, Trash2, AlertTriangle, ChevronDown, Lock, ShieldCheck } from 'lucide-react'

const ADMIN_CODE = process.env.NEXT_PUBLIC_ADMIN_CODE || 'GUARDIUS2026'
const SESSION_KEY = 'erp_admin_unlocked'

// ── 패스코드 잠금 화면 ─────────────────────────────────────
function AdminLockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode]       = useState('')
  const [error, setError]     = useState(false)
  const [shaking, setShaking] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (code === ADMIN_CODE) {
      sessionStorage.setItem(SESSION_KEY, '1')
      onUnlock()
    } else {
      setError(true)
      setShaking(true)
      setCode('')
      setTimeout(() => setShaking(false), 500)
    }
  }

  return (
    <div className="flex items-center justify-center h-full min-h-[60vh]">
      <div className={`bg-white rounded-2xl shadow-2xl border-2 border-gray-100 p-10 w-full max-w-sm text-center transition-all ${shaking ? 'animate-bounce' : ''}`}>
        <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Lock className="h-8 w-8 text-white" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">DB 관리자 접근</h2>
        <p className="text-sm text-gray-400 mb-6">관리자 코드를 입력하세요</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={code}
            onChange={e => { setCode(e.target.value); setError(false) }}
            placeholder="관리자 코드 입력"
            autoFocus
            className={`w-full border-2 rounded-xl px-4 py-3 text-center text-lg tracking-widest font-mono focus:outline-none transition-colors ${
              error ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 focus:border-gray-900'
            }`}
          />
          {error && <p className="text-sm text-red-500 font-medium">코드가 올바르지 않습니다.</p>}
          <button
            type="submit"
            className="w-full bg-gray-900 text-white font-semibold py-3 rounded-xl hover:bg-gray-700 transition-colors"
          >
            확인
          </button>
        </form>
      </div>
    </div>
  )
}

// 관리 가능한 테이블 목록 (표시명 + 테이블명)
const TABLES = [
  { id: 'inquiries',       label: '문의',        emoji: '📋' },
  { id: 'customers',       label: '고객사',       emoji: '🏢' },
  { id: 'estimates',       label: '견적',         emoji: '📄' },
  { id: 'settlements',     label: '정산/청구',    emoji: '💰' },
  { id: 'assignments',     label: '인원배정',     emoji: '👥' },
  { id: 'payouts',         label: '지급',         emoji: '💸' },
  { id: 'staff',           label: '크루',         emoji: '🧑' },
  { id: 'attendances',     label: '출석',         emoji: '✅' },
  { id: 'estimate_items',  label: '견적 항목',    emoji: '📝' },
  { id: 'roles',           label: '역할',         emoji: '🎭' },
]

// 숨길 컬럼 (너무 길거나 편집 불필요)
const HIDDEN_COLS = new Set(['created_at', 'updated_at'])

// 편집 불가 컬럼
const READONLY_COLS = new Set(['id'])

type Row = Record<string, unknown>

interface EditCell {
  rowId: string
  col: string
  value: string
}

function formatCell(val: unknown): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'boolean') return val ? 'true' : 'false'
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

export default function AdminContent() {
  const [unlocked, setUnlocked] = useState(false)

  // 세션에 잠금 해제 여부 확인
  useEffect(() => {
    if (sessionStorage.getItem(SESSION_KEY) === '1') setUnlocked(true)
  }, [])

  if (!unlocked) return <AdminLockScreen onUnlock={() => setUnlocked(true)} />

  return <AdminInner />
}

function AdminInner() {
  const [selectedTable, setSelectedTable] = useState(TABLES[0].id)
  const [rows, setRows]           = useState<Row[]>([])
  const [columns, setColumns]     = useState<string[]>([])
  const [loading, setLoading]     = useState(false)
  const [editCell, setEditCell]   = useState<EditCell | null>(null)
  const [search, setSearch]       = useState('')
  const [showHidden, setShowHidden] = useState(false)

  const loadTable = useCallback(async (table: string) => {
    setLoading(true)
    setEditCell(null)
    setSearch('')
    try {
      const data = await db.list<Row>(table, { order: 'created_at', asc: false })
      setRows(data)
      if (data.length > 0) {
        setColumns(Object.keys(data[0]))
      } else {
        setColumns([])
      }
    } catch {
      toast.error('데이터 조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadTable(selectedTable) }, [selectedTable, loadTable])

  const visibleCols = columns.filter(c => showHidden || !HIDDEN_COLS.has(c))

  const filteredRows = search
    ? rows.filter(row =>
        Object.values(row).some(v =>
          String(v ?? '').toLowerCase().includes(search.toLowerCase())
        )
      )
    : rows

  function startEdit(rowId: string, col: string, currentVal: unknown) {
    if (READONLY_COLS.has(col)) return
    setEditCell({ rowId, col, value: formatCell(currentVal) })
  }

  async function saveEdit() {
    if (!editCell) return
    const { rowId, col, value } = editCell

    // 원본 행 찾기
    const originalRow = rows.find(r => String(r.id) === rowId)
    if (!originalRow) return

    // 타입 추론해서 변환
    const originalVal = originalRow[col]
    let parsedVal: unknown = value
    if (value === '') {
      parsedVal = null
    } else if (typeof originalVal === 'number') {
      parsedVal = Number(value)
      if (isNaN(parsedVal as number)) { toast.error('숫자 형식이 올바르지 않습니다.'); return }
    } else if (typeof originalVal === 'boolean') {
      parsedVal = value === 'true'
    }

    try {
      await db.update(selectedTable, rowId, { [col]: parsedVal })
      setRows(prev => prev.map(r => r.id === rowId ? { ...r, [col]: parsedVal } : r))
      toast.success(`저장됐습니다.`)
      setEditCell(null)
    } catch {
      toast.error('저장 실패')
    }
  }

  async function deleteRow(rowId: string) {
    const row = rows.find(r => String(r.id) === rowId)
    const preview = row ? Object.entries(row).slice(1, 3).map(([, v]) => String(v ?? '')).join(' / ') : rowId
    if (!confirm(`삭제하면 복구할 수 없습니다.\n\n[${preview}]\n\n정말 삭제하겠습니까?`)) return
    try {
      await db.delete(selectedTable, rowId)
      setRows(prev => prev.filter(r => r.id !== rowId))
      toast.success('삭제됐습니다.')
    } catch {
      toast.error('삭제 실패')
    }
  }

  const currentTableMeta = TABLES.find(t => t.id === selectedTable)

  return (
    <div className="flex h-full overflow-hidden bg-gray-50">

      {/* ─── 좌측: 테이블 목록 ─── */}
      <div className="w-48 shrink-0 bg-gray-900 flex flex-col overflow-hidden">
        <div className="px-3 py-3 border-b border-gray-700">
          <p className="text-[10px] text-gray-400 font-bold tracking-widest uppercase">테이블 선택</p>
        </div>
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {TABLES.map(t => (
            <button
              key={t.id}
              onClick={() => setSelectedTable(t.id)}
              className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedTable === t.id
                  ? 'bg-red-600 text-white font-semibold'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <span className="text-base leading-none">{t.emoji}</span>
              <span className="truncate">{t.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* ─── 우측: 테이블 뷰어 ─── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* 툴바 */}
        <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">{currentTableMeta?.emoji}</span>
            <span className="font-bold text-gray-800">{currentTableMeta?.label}</span>
            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{filteredRows.length}행</span>
          </div>

          {/* 경고 배너 */}
          <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-1">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
            <span className="text-xs text-red-600 font-medium">수정/삭제 시 복구 불가 — 신중하게 사용하세요</span>
          </div>

          <div className="flex-1" />

          {/* 검색 */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="검색..."
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:border-blue-400"
          />

          {/* 숨김 컬럼 토글 */}
          <button
            onClick={() => setShowHidden(v => !v)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              showHidden ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            <ChevronDown className="h-3.5 w-3.5" />
            {showHidden ? '날짜 숨기기' : '날짜 보기'}
          </button>

          {/* 새로고침 */}
          <button
            onClick={() => loadTable(selectedTable)}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>

        {/* 편집 중 저장 바 */}
        {editCell && (
          <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center gap-3 shrink-0">
            <span className="text-xs text-blue-700 font-semibold">편집 중: <span className="font-bold">{editCell.col}</span></span>
            <input
              autoFocus
              value={editCell.value}
              onChange={e => setEditCell(prev => prev ? { ...prev, value: e.target.value } : null)}
              onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditCell(null) }}
              className="flex-1 max-w-sm border border-blue-300 rounded-lg px-3 py-1 text-sm focus:outline-none focus:border-blue-500 bg-white"
              placeholder="값 입력 후 Enter"
            />
            <button onClick={saveEdit}
              className="flex items-center gap-1 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors font-semibold">
              <Save className="h-3.5 w-3.5" />저장
            </button>
            <button onClick={() => setEditCell(null)}
              className="flex items-center gap-1 text-xs border border-gray-200 text-gray-500 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
              <X className="h-3.5 w-3.5" />취소
            </button>
          </div>
        )}

        {/* 테이블 */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-300" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            {search ? '검색 결과가 없습니다.' : '데이터가 없습니다.'}
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-gray-100 border-b-2 border-gray-300">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 whitespace-nowrap border-r border-gray-200 w-10">#</th>
                  {visibleCols.map(col => (
                    <th key={col} className="px-3 py-2.5 text-left font-semibold text-gray-600 whitespace-nowrap border-r border-gray-200 min-w-[80px]">
                      {col}
                      {READONLY_COLS.has(col) && <span className="ml-1 text-gray-300">(읽기전용)</span>}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-center font-semibold text-gray-500 w-16">삭제</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, idx) => {
                  const rowId = String(row.id)
                  return (
                    <tr key={rowId}
                      className={`border-b border-gray-100 hover:bg-yellow-50/50 transition-colors ${
                        editCell?.rowId === rowId ? 'bg-blue-50/40' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                      }`}>
                      <td className="px-3 py-2 text-gray-300 border-r border-gray-100 text-center">{idx + 1}</td>
                      {visibleCols.map(col => {
                        const val = row[col]
                        const isEditing = editCell?.rowId === rowId && editCell?.col === col
                        const isReadonly = READONLY_COLS.has(col)
                        return (
                          <td key={col}
                            onClick={() => !isReadonly && startEdit(rowId, col, val)}
                            className={`px-3 py-2 border-r border-gray-100 max-w-[200px] ${
                              isEditing
                                ? 'bg-blue-100 ring-2 ring-inset ring-blue-400'
                                : isReadonly
                                  ? 'text-gray-300 cursor-default'
                                  : 'cursor-pointer hover:bg-blue-50 hover:text-blue-700'
                            }`}
                          >
                            <div className="truncate" title={formatCell(val)}>
                              {val === null || val === undefined
                                ? <span className="text-gray-200 italic">null</span>
                                : typeof val === 'boolean'
                                  ? <span className={val ? 'text-green-600 font-semibold' : 'text-gray-400'}>{String(val)}</span>
                                  : <span>{String(val)}</span>
                              }
                            </div>
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => deleteRow(rowId)}
                          className="p-1 rounded hover:bg-red-100 text-gray-300 hover:text-red-500 transition-colors"
                          title="행 삭제"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 하단 안내 */}
        <div className="bg-white border-t border-gray-200 px-4 py-2 shrink-0">
          <p className="text-[11px] text-gray-400">
            💡 셀을 클릭하면 인라인 편집 · Enter로 저장 · Esc로 취소 · <span className="text-red-400 font-semibold">삭제는 복구 불가</span>
          </p>
        </div>
      </div>
    </div>
  )
}
