'use client'

import { useState } from 'react'
import { db } from '@/lib/supabase/api'
import type { EventExpense } from '@/lib/supabase/types'
import { formatKRW } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Receipt, Plus, Trash2, PencilLine, Check, X, Database, Copy } from 'lucide-react'
import { toast } from 'sonner'

// ★ 부대비용은 사람이 직접 입력할 때만 생긴다.
//   견적에 교통비·숙박비가 잡혀 있다고 해서 지급 처리 때 자동으로 만들지 않는다.
//   견적 금액은 고객에게 청구하려고 잡아둔 예상치일 뿐, 실제로 그만큼 썼다는
//   보장이 없기 때문이다. 자동 생성하면 쓰지도 않은 돈이 수익률을 깎는다.
//   (사용자 지침, 2026-08-16 — 이 파일이 event_expenses 의 유일한 입력 경로다)

// DB에는 CHECK을 걸지 않았다 — 분류 목록은 여기서만 관리한다.
export const EXPENSE_CATEGORIES = ['교통비', '숙박비', '식비', '장비·물품', '기타']

const CATEGORY_STYLE: Record<string, string> = {
  '교통비':    'bg-sky-100 text-sky-700',
  '숙박비':    'bg-violet-100 text-violet-700',
  '식비':      'bg-amber-100 text-amber-700',
  '장비·물품': 'bg-teal-100 text-teal-700',
  '기타':      'bg-gray-100 text-gray-600',
}

// 010 마이그레이션 SQL — 테이블이 없을 때 화면에서 바로 복사할 수 있게 둔다.
// supabase/migrations/010_event_expenses.sql 과 같은 내용이어야 한다.
const SETUP_SQL = `CREATE TABLE IF NOT EXISTS event_expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id  UUID REFERENCES inquiries(id) ON DELETE CASCADE,
  category    TEXT NOT NULL DEFAULT '기타',
  amount      INTEGER NOT NULL DEFAULT 0,
  memo        TEXT,
  spent_on    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_expenses_inquiry ON event_expenses(inquiry_id);`

interface Props {
  inquiryId: string
  expenses: EventExpense[]
  ready: boolean            // false = event_expenses 테이블이 아직 없음
  onChanged: () => void
}

export default function ExpensesSection({ inquiryId, expenses, ready, onChanged }: Props) {
  const [adding, setAdding]   = useState(false)
  const [editId, setEditId]   = useState<string | null>(null)
  const [saving, setSaving]   = useState(false)

  // 추가/수정 공용 입력 상태
  const [category, setCategory] = useState('교통비')
  const [amount, setAmount]     = useState('')
  const [memo, setMemo]         = useState('')
  const [spentOn, setSpentOn]   = useState('')

  const total = expenses.reduce((s, e) => s + (e.amount || 0), 0)

  async function copySql() {
    try {
      await navigator.clipboard.writeText(SETUP_SQL)
      toast.success('SQL을 복사했습니다. Supabase → SQL Editor에 붙여넣고 실행하세요.', { duration: 6000 })
    } catch {
      toast.error('복사에 실패했습니다. supabase/migrations/010_event_expenses.sql 파일을 열어 주세요.')
    }
  }

  // ── 테이블이 아직 없을 때: 입력 대신 준비 안내 ──
  if (!ready) {
    return (
      <div className="border-2 border-amber-300 bg-amber-50 rounded-xl p-4 space-y-2">
        <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
          <Database className="h-4 w-4" />
          부대비용 기능 — 준비 한 단계 남았습니다
        </p>
        <p className="text-[11px] text-amber-700 leading-relaxed">
          행사별 지출(교통비·숙박비 등)을 적어 수익률에 반영하는 기능입니다.
          쓰려면 Supabase에 표를 한 번 만들어야 합니다.
          <br />
          <strong className="font-semibold">Supabase 대시보드 → SQL Editor → 아래 SQL 붙여넣기 → Run</strong>
          {' '}한 번이면 끝이고, 실행 후 이 화면을 새로고침하면 이 안내는 사라집니다.
        </p>
        <pre className="bg-white border border-amber-200 rounded-lg p-2 text-[10px] text-gray-600 overflow-x-auto leading-relaxed">
{SETUP_SQL}
        </pre>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={copySql}
            className="h-7 bg-amber-600 hover:bg-amber-700 text-xs gap-1">
            <Copy className="h-3.5 w-3.5" />SQL 복사
          </Button>
          <span className="text-[10px] text-amber-600">
            파일 위치: supabase/migrations/010_event_expenses.sql
          </span>
        </div>
      </div>
    )
  }

  function resetForm() {
    setCategory('교통비'); setAmount(''); setMemo(''); setSpentOn('')
  }

  function startAdd() {
    resetForm(); setEditId(null); setAdding(true)
  }

  function startEdit(e: EventExpense) {
    setAdding(false)
    setEditId(e.id)
    setCategory(e.category || '기타')
    setAmount(String(e.amount || 0))
    setMemo(e.memo || '')
    setSpentOn(e.spent_on || '')
  }

  function cancel() {
    setAdding(false); setEditId(null); resetForm()
  }

  async function handleSave() {
    const amt = Number(amount)
    if (!amt || amt <= 0) { toast.info('금액을 입력해 주세요.'); return }
    setSaving(true)
    try {
      const payload = {
        inquiry_id: inquiryId,
        category,
        amount: Math.round(amt),
        memo: memo || null,
        spent_on: spentOn || null,
      }
      if (editId) {
        await db.update('event_expenses', editId, payload)
        toast.success('부대비용이 수정되었습니다.')
      } else {
        await db.insert('event_expenses', payload)
        toast.success(`부대비용 ${formatKRW(amt)} 등록`)
      }
      cancel()
      onChanged()
    } catch (err) {
      toast.error('저장 실패: ' + (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(e: EventExpense) {
    if (!confirm(`${e.category} ${formatKRW(e.amount)} 지출 기록을 삭제하겠습니까?`)) return
    try {
      await db.delete('event_expenses', e.id)
      toast.success('삭제되었습니다.')
      onChanged()
    } catch (err) {
      toast.error('삭제 실패: ' + (err as Error).message)
    }
  }

  // 추가/수정 입력 줄
  const editor = (
    <div className="bg-white border-2 border-rose-300 rounded-lg p-3 space-y-2">
      <div className="flex gap-2 flex-wrap items-center">
        <Select value={category} onChange={e => setCategory(e.target.value)} className="h-8 text-sm w-32">
          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Input
          type="number" value={amount} onChange={e => setAmount(e.target.value)}
          placeholder="금액" className="h-8 text-sm w-32"
        />
        <Input
          type="date" value={spentOn} onChange={e => setSpentOn(e.target.value)}
          className="h-8 text-sm w-36" title="지출일 (선택)"
        />
        <span className="text-xs text-gray-400">{amount ? formatKRW(Number(amount) || 0) : ''}</span>
      </div>
      <div className="flex gap-2">
        <Input
          value={memo} onChange={e => setMemo(e.target.value)}
          placeholder="메모 — 예: 팀장 차량 주유, 렌터카 1일" className="h-8 text-sm flex-1"
        />
        <Button size="sm" onClick={handleSave} disabled={saving}
          className="h-8 bg-rose-600 hover:bg-rose-700 text-xs gap-1 shrink-0">
          <Check className="h-3.5 w-3.5" />{saving ? '저장 중...' : (editId ? '수정' : '추가')}
        </Button>
        <Button size="sm" variant="outline" onClick={cancel} disabled={saving}
          className="h-8 text-xs gap-1 shrink-0">
          <X className="h-3.5 w-3.5" />취소
        </Button>
      </div>
    </div>
  )

  return (
    <div className="border-2 border-rose-200 bg-rose-50/40 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-rose-700 flex items-center gap-1.5">
          <Receipt className="h-4 w-4" />
          부대비용 (실제 지출)
          {expenses.length > 0 && (
            <span className="text-rose-500 font-semibold">
              {expenses.length}건 · {formatKRW(total)}
            </span>
          )}
        </p>
        {!adding && !editId && (
          <Button size="sm" onClick={startAdd}
            className="h-7 bg-rose-600 hover:bg-rose-700 text-xs gap-1 shrink-0">
            <Plus className="h-3.5 w-3.5" />비용 추가
          </Button>
        )}
      </div>

      {expenses.length === 0 && !adding && (
        <p className="text-[11px] text-rose-400 py-1">
          교통비·숙박비처럼 이 행사에 <strong className="font-semibold">실제로 나간 돈</strong>을 적어두면 수익률에 반영됩니다.
          견적에 잡힌 금액은 자동으로 들어오지 않습니다.
        </p>
      )}

      {expenses.map(e => (
        editId === e.id ? (
          <div key={e.id}>{editor}</div>
        ) : (
          <div key={e.id}
            className="flex items-center gap-2 bg-white border border-rose-200 rounded-lg px-3 py-2">
            <span className={`text-[10px] rounded-full px-2 py-0.5 font-semibold shrink-0 ${CATEGORY_STYLE[e.category] || CATEGORY_STYLE['기타']}`}>
              {e.category}
            </span>
            <div className="min-w-0 flex-1">
              {e.memo && <p className="text-xs text-gray-700 truncate">{e.memo}</p>}
              {e.spent_on && <p className="text-[10px] text-gray-400">{e.spent_on} 지출</p>}
            </div>
            <p className="text-sm font-bold text-rose-700 shrink-0">-{formatKRW(e.amount)}</p>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => startEdit(e)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                <PencilLine className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => handleDelete(e)}
                className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )
      ))}

      {adding && editor}

      {expenses.length > 0 && (
        <div className="flex justify-between items-center border-t border-rose-200 pt-2 text-sm">
          <span className="text-xs font-semibold text-rose-700">부대비용 합계</span>
          <span className="font-extrabold text-rose-700">-{formatKRW(total)}</span>
        </div>
      )}
    </div>
  )
}
