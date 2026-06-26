import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query   = searchParams.get('query')
  const display = searchParams.get('display') || '20'
  const sort    = searchParams.get('sort') || 'date'

  if (!query) return NextResponse.json({ error: '키워드를 입력하세요' }, { status: 400 })

  const clientId     = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수가 필요합니다' }, { status: 500 })
  }

  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=${display}&sort=${sort}`

  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: `네이버 API 오류: ${text}` }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json(data)
}
