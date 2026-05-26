import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

// 구글 캘린더에 행사 일정 등록
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { event_name, company_name, event_start, event_end, phone, memo } = body

    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
    const calendarId = process.env.GOOGLE_CALENDAR_ID

    if (!privateKey || !clientEmail || !calendarId) {
      return NextResponse.json({ error: '구글 캘린더 환경변수가 설정되지 않았습니다.' }, { status: 500 })
    }

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    })

    const calendar = google.calendar({ version: 'v3', auth })

    // 날짜 형식 처리 (종일 이벤트)
    const startDate = event_start || new Date().toISOString().split('T')[0]
    const endDate   = event_end
      ? new Date(new Date(event_end).getTime() + 86400000).toISOString().split('T')[0] // 종료일 +1일 (구글 캘린더 종일 이벤트 규칙)
      : new Date(new Date(startDate).getTime() + 86400000).toISOString().split('T')[0]

    const description = [
      `고객사: ${company_name || '-'}`,
      phone ? `담당자 연락처: ${phone}` : null,
      memo  ? `메모: ${memo}`          : null,
      '',
      '※ GUARDIUS ERP에서 자동 등록된 일정입니다.',
    ].filter(Boolean).join('\n')

    const event = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary:     `[가디어스] ${company_name || ''} - ${event_name || ''}`,
        description,
        start: { date: startDate },
        end:   { date: endDate },
        colorId: '9', // 블루베리 색상
      },
    })

    return NextResponse.json({ success: true, eventId: event.data.id })
  } catch (err: unknown) {
    console.error('구글 캘린더 등록 오류:', err)
    const message = err instanceof Error ? err.message : '알 수 없는 오류'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
