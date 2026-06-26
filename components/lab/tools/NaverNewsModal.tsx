'use client'

import { useState } from 'react'
import { X, Search, Send, ExternalLink, Loader2, Plus, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

interface NewsItem {
  title: string
  description: string
  link: string
  originallink: string
  pubDate: string
}

function strip(html: string) {
  return html.replace(/<[^>]+>/g, '')
}

export default function NaverNewsModal({ onClose }: { onClose: () => void }) {
  const [keyword, setKeyword]     = useState('')
  const [sort, setSort]           = useState<'date' | 'sim'>('date')
  const [display, setDisplay]     = useState(20)
  const [results, setResults]     = useState<NewsItem[]>([])
  const [loading, setLoading]     = useState(false)
  const [sendTo, setSendTo]       = useState('')
  const [sending, setSending]     = useState(false)
  const [showSendForm, setShowSendForm] = useState(false)

  async function handleSearch() {
    if (!keyword.trim()) { toast.error('키워드를 입력하세요'); return }
    setLoading(true)
    setResults([])
    try {
      const res = await fetch(`/api/lab/naver?query=${encodeURIComponent(keyword)}&display=${display}&sort=${sort}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResults(data.items || [])
      if ((data.items || []).length === 0) toast.info('검색 결과가 없습니다')
    } catch (e: any) {
      toast.error(e.message || '검색 실패')
    } finally {
      setLoading(false)
    }
  }

  async function handleSendEmail() {
    if (!sendTo.trim()) { toast.error('수신 이메일을 입력하세요'); return }
    if (results.length === 0) { toast.error('검색 결과가 없습니다'); return }
    setSending(true)
    try {
      const res = await fetch('/api/lab/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: sendTo, type: 'news', keyword, items: results }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`${sendTo} 으로 발송 완료`)
      setShowSendForm(false)
    } catch (e: any) {
      toast.error(e.message || '발송 실패')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col max-h-[85vh]">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xl">📰</span>
          <div>
            <h2 className="font-bold text-gray-900">네이버 뉴스 수집</h2>
            <p className="text-xs text-gray-400">키워드로 최신 뉴스를 검색하고 이메일로 받아보세요</p>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
      </div>

      {/* 검색 컨트롤 */}
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 shrink-0 space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="검색 키워드 입력 (예: 행사 스태프, 이벤트 에이전시)"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="flex-1"
          />
          <Button onClick={handleSearch} disabled={loading} className="gap-1.5 shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            검색
          </Button>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-xs">정렬</span>
            {(['date', 'sim'] as const).map(s => (
              <button key={s} onClick={() => setSort(s)}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${sort === s ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-blue-400'}`}>
                {s === 'date' ? '최신순' : '관련순'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-xs">개수</span>
            {[10, 20, 30].map(n => (
              <button key={n} onClick={() => setDisplay(n)}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${display === n ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-blue-400'}`}>
                {n}건
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 결과 */}
      <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2 min-h-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <Loader2 className="h-7 w-7 animate-spin" />
            <p className="text-sm">뉴스를 불러오는 중...</p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <Search className="h-8 w-8 opacity-20" />
            <p className="text-sm">키워드를 입력하고 검색하세요</p>
          </div>
        ) : (
          results.map((item, i) => (
            <div key={i} className="bg-white border border-gray-100 rounded-xl p-3.5 hover:border-blue-200 hover:shadow-sm transition-all">
              <a href={item.link} target="_blank" rel="noopener noreferrer"
                className="flex items-start gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-900 mb-1">
                {strip(item.title)}
                <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-60" />
              </a>
              <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{strip(item.description)}</p>
              <p className="text-[10px] text-gray-300 mt-1.5">{new Date(item.pubDate).toLocaleString('ko-KR')}</p>
            </div>
          ))
        )}
      </div>

      {/* 하단 액션 */}
      <div className="px-6 py-3 border-t border-gray-100 shrink-0">
        {results.length > 0 && (
          <p className="text-xs text-gray-400 mb-2">총 {results.length}건 수집됨</p>
        )}
        {showSendForm ? (
          <div className="flex gap-2">
            <Input placeholder="수신 이메일 주소" value={sendTo} onChange={e => setSendTo(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendEmail()} className="flex-1 text-sm" />
            <Button onClick={handleSendEmail} disabled={sending} size="sm" className="gap-1.5 shrink-0">
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              발송
            </Button>
            <Button onClick={() => setShowSendForm(false)} size="sm" variant="outline">취소</Button>
          </div>
        ) : (
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} size="sm">닫기</Button>
            {results.length > 0 && (
              <Button onClick={() => setShowSendForm(true)} size="sm" className="gap-1.5">
                <Send className="h-3.5 w-3.5" />이메일로 발송
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
