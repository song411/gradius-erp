import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createAdminClient } from '@/lib/supabase/admin'

const transporter = nodemailer.createTransport({
  host: 'smtp.naver.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.NAVER_EMAIL,
    pass: process.env.NAVER_APP_PASSWORD,
  },
})

export async function POST(request: NextRequest) {
  try {
    const { to, subject, body, reportId, stationName, stationRegion } = await request.json()

    if (!to || !subject || !body) {
      return NextResponse.json({ error: '필수 항목이 없습니다.' }, { status: 400 })
    }

    if (!process.env.NAVER_EMAIL || !process.env.NAVER_APP_PASSWORD) {
      return NextResponse.json({ error: '이메일 서버가 설정되지 않았습니다.' }, { status: 500 })
    }

    // 이메일 발송
    await transporter.sendMail({
      from: `"주식회사 가디어스" <${process.env.NAVER_EMAIL}>`,
      to,
      subject,
      text: body,
    })

    // 발송 이력 저장
    const supabase = createAdminClient()
    await supabase.from('dispatch_emails').insert({
      report_id: reportId || null,
      station_name: stationName,
      station_region: stationRegion,
      recipient_email: to,
      subject,
      status: 'sent',
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    // 실패 이력도 저장 (report_id 있을 때만)
    try {
      const body2 = await request.clone().json().catch(() => ({}))
      if (body2.reportId) {
        const supabase = createAdminClient()
        await supabase.from('dispatch_emails').insert({
          report_id: body2.reportId,
          station_name: body2.stationName,
          station_region: body2.stationRegion,
          recipient_email: body2.to,
          subject: body2.subject,
          status: 'failed',
          error_msg: err?.message || '알 수 없는 오류',
        })
      }
    } catch {}

    return NextResponse.json({ error: err?.message || '발송 실패' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const reportId = searchParams.get('reportId')

  const supabase = createAdminClient()
  const query = supabase
    .from('dispatch_emails')
    .select('*')
    .order('created_at', { ascending: false })

  if (reportId) query.eq('report_id', reportId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
