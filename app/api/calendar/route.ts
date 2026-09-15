import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

// 구글 캘린더에 행사 일정 등록
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      event_name, company_name, event_start, event_end,
      phone, location, event_time, required_staff, memo,
      supply_price, total_price, version_label,
      event_dates,
    } = body

    // Vercel 환경변수에서 \n을 실제 줄바꿈으로 변환 (두 가지 케이스 모두 처리)
    const rawKey = process.env.GOOGLE_PRIVATE_KEY || ''
    const privateKey = rawKey.includes('\\n')
      ? rawKey.replace(/\\n/g, '\n')
      : rawKey
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
    const calendarId = process.env.GOOGLE_CALENDAR_ID

    console.log('[Calendar] clientEmail:', clientEmail)
    console.log('[Calendar] calendarId:', calendarId)
    console.log('[Calendar] privateKey exists:', !!privateKey)
    console.log('[Calendar] privateKey starts with:', privateKey?.slice(0, 30))

    if (!privateKey || !clientEmail || !calendarId) {
      return NextResponse.json({
        error: `환경변수 누락 - email:${!!clientEmail} key:${!!privateKey} cal:${!!calendarId}`
      }, { status: 500 })
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

    const fmt = (n: number) => n ? n.toLocaleString('ko-KR') + '원' : '-'

    const description = [
      '━━━━━━━━━━━━━━━━━━━━',
      '📋 행사 정보',
      '━━━━━━━━━━━━━━━━━━━━',
      `🏢 고객사: ${company_name || '-'}`,
      location       ? `📍 장소: ${location}`             : null,
      event_time     ? `🕐 행사 시간: ${event_time}`       : null,
      required_staff ? `👥 필요 인원: ${required_staff}명` : null,
      phone          ? `📞 연락처: ${phone}`               : null,
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '💰 견적 정보',
      '━━━━━━━━━━━━━━━━━━━━',
      version_label  ? `📄 확정 견적: ${version_label}`   : null,
      supply_price   ? `공급가액: ${fmt(supply_price)}`    : null,
      total_price    ? `총 청구금액 (VAT포함): ${fmt(total_price)}` : null,
      '',
      memo ? `📝 메모: ${memo}` : null,
      '',
      '━━━━━━━━━━━━━━━━━━━━',
      '※ GUARDIUS ERP에서 자동 등록된 일정입니다.',
    ].filter(v => v !== null).join('\n')

    // 띄엄띄엄 도는 행사(금토 5주 연속 등)는 통 블록으로 올리면 안 하는 날까지
    // 일정이 잡힌 것처럼 보인다. RDATE 로 실제 운영일만 찍는다 —
    // 회차마다 이벤트를 따로 만들면 나중에 수정·삭제할 게 여러 개가 되지만,
    // RDATE 는 이벤트 하나로 불규칙한 날짜까지 정확히 표현된다.
    const picked: string[] = Array.isArray(event_dates)
      ? [...new Set(event_dates.map((d: string) => String(d).substring(0, 10)))].sort()
      : []

    // 운영일을 쓰면 첫 날 하루짜리 이벤트를 만들고 나머지를 RDATE 로 반복시킨다
    const useRdate = picked.length > 1
    const baseDate = useRdate ? picked[0] : startDate
    const baseEnd  = useRdate
      ? new Date(new Date(picked[0]).getTime() + 86400000).toISOString().split('T')[0]
      : endDate

    const event = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary:     `[가디어스] ${company_name || ''} - ${event_name || ''}`,
        description,
        start: { date: baseDate },
        end:   { date: baseEnd },
        ...(useRdate
          ? { recurrence: [`RDATE;VALUE=DATE:${picked.map(d => d.replace(/-/g, '')).join(',')}`] }
          : {}),
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
