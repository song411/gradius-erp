import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query   = searchParams.get('query')
  const maxResults = searchParams.get('maxResults') || '10'
  const order   = searchParams.get('order') || 'relevance' // relevance | date | viewCount

  if (!query) return NextResponse.json({ error: '키워드를 입력하세요' }, { status: 400 })

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'YOUTUBE_API_KEY 환경변수가 필요합니다' }, { status: 500 })
  }

  // 1. 동영상 검색
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=${maxResults}&order=${order}&key=${apiKey}`
  const searchRes = await fetch(searchUrl)
  if (!searchRes.ok) {
    const text = await searchRes.text()
    return NextResponse.json({ error: `YouTube 검색 오류: ${text}` }, { status: searchRes.status })
  }
  const searchData = await searchRes.json()
  const items = searchData.items || []

  if (items.length === 0) return NextResponse.json({ items: [] })

  const videoIds   = items.map((i: any) => i.id.videoId).join(',')
  const channelIds = [...new Set(items.map((i: any) => i.snippet.channelId))].join(',')

  // 2. 영상 통계 (조회수, 좋아요, 댓글)
  const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds}&key=${apiKey}`
  // 3. 채널 통계 (구독자 수)
  const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelIds}&key=${apiKey}`

  const [statsRes, channelRes] = await Promise.all([fetch(statsUrl), fetch(channelUrl)])
  const statsData   = statsRes.ok   ? await statsRes.json()   : { items: [] }
  const channelData = channelRes.ok ? await channelRes.json() : { items: [] }

  const statsMap:   Record<string, any> = {}
  const channelMap: Record<string, any> = {}
  for (const v of (statsData.items   || [])) statsMap[v.id]   = v.statistics
  for (const c of (channelData.items || [])) channelMap[c.id] = c.statistics

  // 결합
  const result = items.map((item: any) => ({
    videoId:      item.id.videoId,
    title:        item.snippet.title,
    channelId:    item.snippet.channelId,
    channelTitle: item.snippet.channelTitle,
    publishedAt:  item.snippet.publishedAt,
    thumbnail:    item.snippet.thumbnails?.medium?.url || '',
    viewCount:       Number(statsMap[item.id.videoId]?.viewCount   || 0),
    likeCount:       Number(statsMap[item.id.videoId]?.likeCount   || 0),
    commentCount:    Number(statsMap[item.id.videoId]?.commentCount || 0),
    subscriberCount: Number(channelMap[item.snippet.channelId]?.subscriberCount || 0),
  }))

  return NextResponse.json({ items: result })
}
