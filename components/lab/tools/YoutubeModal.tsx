'use client'

import { useState } from 'react'
import { X, Search, Send, ExternalLink, Loader2, Eye, ThumbsUp, MessageCircle, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

interface VideoItem {
  videoId: string
  title: string
  channelId: string
  channelTitle: string
  publishedAt: string
  thumbnail: string
  viewCount: number
  likeCount: number
  commentCount: number
  subscriberCount: number
}

function formatNum(n: number) {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`
  if (n >= 10000)     return `${(n / 10000).toFixed(1)}만`
  if (n >= 1000)      return `${(n / 1000).toFixed(1)}천`
  return String(n)
}

export default function YoutubeModal({ onClose }: { onClose: () => void }) {
  const [keyword, setKeyword]   = useState('')
  const [order, setOrder]       = useState<'relevance' | 'date' | 'viewCount'>('relevance')
  const [maxResults, setMax]    = useState(10)
  const [results, setResults]   = useState<VideoItem[]>([])
  const [loading, setLoading]   = useState(false)
  const [sendTo, setSendTo]     = useState('')
  const [sending, setSending]   = useState(false)
  const [showSendForm, setShowSendForm] = useState(false)

  async function handleSearch() {
    if (!keyword.trim()) { toast.error('키워드를 입력하세요'); return }
    setLoading(true)
    setResults([])
    try {
      const res = await fetch(`/api/lab/youtube?query=${encodeURIComponent(keyword)}&maxResults=${maxResults}&order=${order}`)
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
        body: JSON.stringify({ to: sendTo, type: 'youtube', keyword, items: results }),
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
          <span className="text-xl">▶️</span>
          <div>
            <h2 className="font-bold text-gray-900">유튜브 영상 수집</h2>
            <p className="text-xs text-gray-400">키워드로 영상을 검색하고 조회수·구독자 정보를 확인하세요</p>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
      </div>

      {/* 검색 컨트롤 */}
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 shrink-0 space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="검색 키워드 입력 (예: 이벤트 행사 스태프, 경호원)"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="flex-1"
          />
          <Button onClick={handleSearch} disabled={loading} className="gap-1.5 shrink-0 bg-red-600 hover:bg-red-700">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            검색
          </Button>
        </div>
        <div className="flex items-center gap-4 flex-wrap text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-xs">정렬</span>
            {([
              { key: 'relevance', label: '관련순' },
              { key: 'date',      label: '최신순' },
              { key: 'viewCount', label: '조회순' },
            ] as const).map(s => (
              <button key={s.key} onClick={() => setOrder(s.key)}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${order === s.key ? 'bg-red-600 text-white border-red-600' : 'border-gray-300 text-gray-600 hover:border-red-400'}`}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-xs">개수</span>
            {[5, 10, 20].map(n => (
              <button key={n} onClick={() => setMax(n)}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${maxResults === n ? 'bg-red-600 text-white border-red-600' : 'border-gray-300 text-gray-600 hover:border-red-400'}`}>
                {n}개
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
            <p className="text-sm">영상을 불러오는 중...</p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <Search className="h-8 w-8 opacity-20" />
            <p className="text-sm">키워드를 입력하고 검색하세요</p>
          </div>
        ) : (
          results.map((item) => (
            <div key={item.videoId} className="bg-white border border-gray-100 rounded-xl p-3 hover:border-red-200 hover:shadow-sm transition-all flex gap-3">
              {/* 썸네일 */}
              <a href={`https://youtube.com/watch?v=${item.videoId}`} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <img src={item.thumbnail} alt={item.title}
                  className="w-28 h-16 object-cover rounded-lg bg-gray-100" />
              </a>
              {/* 정보 */}
              <div className="flex-1 min-w-0">
                <a href={`https://youtube.com/watch?v=${item.videoId}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-start gap-1 text-sm font-semibold text-gray-900 hover:text-red-600 leading-snug line-clamp-2">
                  {item.title}
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-40" />
                </a>
                <p className="text-xs text-gray-500 mt-0.5">{item.channelTitle}</p>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  <span className="flex items-center gap-1 text-[11px] text-gray-500">
                    <Eye className="h-3 w-3" />{formatNum(item.viewCount)}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-gray-500">
                    <ThumbsUp className="h-3 w-3" />{formatNum(item.likeCount)}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-gray-500">
                    <MessageCircle className="h-3 w-3" />{formatNum(item.commentCount)}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-indigo-500 font-medium">
                    <Users className="h-3 w-3" />구독자 {formatNum(item.subscriberCount)}
                  </span>
                  <span className="text-[11px] text-gray-300 ml-auto">
                    {new Date(item.publishedAt).toLocaleDateString('ko-KR')}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 하단 액션 */}
      <div className="px-6 py-3 border-t border-gray-100 shrink-0">
        {results.length > 0 && (
          <p className="text-xs text-gray-400 mb-2">총 {results.length}개 수집됨</p>
        )}
        {showSendForm ? (
          <div className="flex gap-2">
            <Input placeholder="수신 이메일 주소" value={sendTo} onChange={e => setSendTo(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendEmail()} className="flex-1 text-sm" />
            <Button onClick={handleSendEmail} disabled={sending} size="sm" className="gap-1.5 shrink-0 bg-red-600 hover:bg-red-700">
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              발송
            </Button>
            <Button onClick={() => setShowSendForm(false)} size="sm" variant="outline">취소</Button>
          </div>
        ) : (
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} size="sm">닫기</Button>
            {results.length > 0 && (
              <Button onClick={() => setShowSendForm(true)} size="sm" className="gap-1.5 bg-red-600 hover:bg-red-700">
                <Send className="h-3.5 w-3.5" />이메일로 발송
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
