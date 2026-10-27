'use client'

// 검색 — 이름 하나로 크루·고객·문의를 찾아 바로 전화. 통합검색(PC)과 같은 조건식.
import { useState, useRef, useEffect } from 'react'
import { db } from '@/lib/supabase/api'
import { MobileHeader, ErrorBox, Row } from '@/components/mobile/ui'
import { Search, X } from 'lucide-react'
import type { Staff, Customer, Inquiry } from '@/lib/supabase/types'

export default function MobileSearchContent() {
  const [q, setQ]             = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [done, setDone]       = useState(false)
  const [staff, setStaff]     = useState<Staff[]>([])
  const [custs, setCusts]     = useState<Customer[]>([])
  const [inqs, setInqs]       = useState<Inquiry[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function run(e?: React.FormEvent) {
    e?.preventDefault()
    const term = q.trim()
    if (!term) return
    setLoading(true); setError('')
    try {
      const [s, c, i] = await Promise.all([
        db.list<Staff>('staff', { or: `name.ilike.%${term}%,phone.ilike.%${term}%,region.ilike.%${term}%`, order: 'total_score', asc: false, limit: 15 }),
        db.list<Customer>('customers', { or: `company_name.ilike.%${term}%,contact_name.ilike.%${term}%,phone.ilike.%${term}%`, limit: 15 }),
        db.list<Inquiry>('inquiries', { or: `event_name.ilike.%${term}%,company_name.ilike.%${term}%,contact_name.ilike.%${term}%`, order: 'created_at', asc: false, limit: 15 }),
      ])
      setStaff(s); setCusts(c); setInqs(i); setDone(true)
    } catch (err) {
      setError((err as Error).message || '검색 실패')
    } finally { setLoading(false) }
  }

  const total = staff.length + custs.length + inqs.length

  return (
    <div className="max-w-lg mx-auto">
      <MobileHeader kicker="가디어스 · 검색" title="크루 · 고객 · 문의" />
      <div className="px-4 pt-4 space-y-4">
        <form onSubmit={run} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="이름, 업체, 행사, 전화번호" inputMode="search" enterKeyHint="search"
              className="h-13 w-full rounded-2xl border-2 border-gray-300 bg-white pl-10 pr-10 text-base focus:border-gray-900 focus:outline-none" />
            {q && <button type="button" onClick={() => { setQ(''); setDone(false); inputRef.current?.focus() }} className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center text-gray-400"><X className="h-5 w-5" /></button>}
          </div>
          <button type="submit" disabled={loading || !q.trim()} className="h-13 px-5 rounded-2xl bg-gray-900 text-white font-extrabold text-base active:scale-95 disabled:opacity-40">{loading ? '…' : '찾기'}</button>
        </form>

        {error && <ErrorBox message={error} onRetry={() => run()} />}
        {done && !error && total === 0 && <p className="text-center text-gray-400 py-10 text-base">없습니다.</p>}

        {staff.length > 0 && (
          <section className="rounded-2xl bg-white border-2 border-gray-200 overflow-hidden">
            <p className="px-4 pt-3 pb-2 text-2xs font-bold text-gray-500 tracking-wider">크루 {staff.length}</p>
            {staff.map(s => <Row key={s.id} title={s.name} desc={[s.region, (s.available_jobs || []).slice(0, 3).join('·'), s.recommend].filter(Boolean).join(' · ')}
              right={s.total_score > 0 ? `★ ${s.total_score}` : undefined} tel={s.phone} />)}
          </section>
        )}
        {custs.length > 0 && (
          <section className="rounded-2xl bg-white border-2 border-gray-200 overflow-hidden">
            <p className="px-4 pt-3 pb-2 text-2xs font-bold text-gray-500 tracking-wider">고객 {custs.length}</p>
            {custs.map(c => <Row key={c.id} title={c.company_name} desc={[c.contact_name, c.biz_number].filter(Boolean).join(' · ')} tel={c.phone} />)}
          </section>
        )}
        {inqs.length > 0 && (
          <section className="rounded-2xl bg-white border-2 border-gray-200 overflow-hidden">
            <p className="px-4 pt-3 pb-2 text-2xs font-bold text-gray-500 tracking-wider">문의 {inqs.length}</p>
            {inqs.map(i => <Row key={i.id} title={`${i.company_name || ''} · ${i.event_name || ''}`} desc={[i.event_start?.slice(0, 10), i.location].filter(Boolean).join(' · ')} right={i.status} tel={i.phone} />)}
          </section>
        )}
      </div>
    </div>
  )
}
