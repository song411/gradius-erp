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
    const formData = await request.formData()
    const to           = formData.get('to') as string
    const subject      = formData.get('subject') as string
    const body         = formData.get('body') as string
    const reportId     = formData.get('reportId') as string | null
    const stationName  = formData.get('stationName') as string
    const stationRegion = formData.get('stationRegion') as string
    const attachment   = formData.get('attachment') as File | null

    if (!to || !subject || !body) {
      return NextResponse.json({ error: '필수 항목이 없습니다.' }, { status: 400 })
    }

    if (!process.env.NAVER_EMAIL || !process.env.NAVER_APP_PASSWORD) {
      return NextResponse.json({ error: '이메일 서버가 설정되지 않았습니다.' }, { status: 500 })
    }

    const attachments = attachment
      ? [{ filename: attachment.name, content: Buffer.from(await attachment.arrayBuffer()) }]
      : []

    // 이메일 발송
    await transporter.sendMail({
      from: `"주식회사 가디어스" <${process.env.NAVER_EMAIL}>`,
      to,
      subject,
      text: body,
      attachments,
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
      const fd = await request.clone().formData().catch(() => null)
      const failReportId = fd?.get('reportId') as string | null
      if (failReportId) {
        const supabase = createAdminClient()
        await supabase.from('dispatch_emails').insert({
          report_id: failReportId,
          station_name: fd?.get('stationName'),
          station_region: fd?.get('stationRegion'),
          recipient_email: fd?.get('to'),
          subject: fd?.get('subject'),
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
