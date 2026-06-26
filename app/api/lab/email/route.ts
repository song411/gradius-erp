import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

function formatNum(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`
  if (n >= 1000)  return `${(n / 1000).toFixed(1)}천`
  return String(n)
}

function buildNewsHtml(keyword: string, items: any[]) {
  const rows = items.map(item => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;vertical-align:top;">
        <a href="${item.link}" style="font-weight:600;color:#1d4ed8;text-decoration:none;font-size:14px;">${item.title.replace(/<[^>]+>/g,'')}</a>
        <p style="margin:4px 0 0;color:#555;font-size:12px;line-height:1.5;">${item.description.replace(/<[^>]+>/g,'')}</p>
        <span style="font-size:11px;color:#999;">${item.pubDate}</span>
      </td>
    </tr>`).join('')

  return `
    <div style="font-family:sans-serif;max-width:680px;margin:0 auto;">
      <div style="background:#1e293b;padding:20px 24px;border-radius:12px 12px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:18px;">📰 네이버 뉴스 수집 결과</h2>
        <p style="color:#94a3b8;margin:4px 0 0;font-size:13px;">키워드: <strong style="color:#fbbf24;">${keyword}</strong> · ${items.length}건</p>
      </div>
      <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-top:none;">
        ${rows}
      </table>
      <p style="font-size:11px;color:#aaa;text-align:center;margin-top:12px;">Guardius ERP 스마트연구소 발송</p>
    </div>`
}

function buildYoutubeHtml(keyword: string, items: any[]) {
  const rows = items.map(item => `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;vertical-align:top;width:100px;">
        <a href="https://youtube.com/watch?v=${item.videoId}" target="_blank">
          <img src="${item.thumbnail}" style="width:96px;height:54px;object-fit:cover;border-radius:6px;" />
        </a>
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #f0f0f0;vertical-align:top;">
        <a href="https://youtube.com/watch?v=${item.videoId}" style="font-weight:600;color:#1d4ed8;font-size:13px;text-decoration:none;">${item.title}</a>
        <p style="margin:3px 0;color:#666;font-size:12px;">${item.channelTitle}</p>
        <div style="font-size:11px;color:#888;margin-top:4px;">
          👁 ${formatNum(item.viewCount)}  ·  👍 ${formatNum(item.likeCount)}  ·  💬 ${formatNum(item.commentCount)}  ·  구독자 ${formatNum(item.subscriberCount)}
        </div>
      </td>
    </tr>`).join('')

  return `
    <div style="font-family:sans-serif;max-width:680px;margin:0 auto;">
      <div style="background:#0f172a;padding:20px 24px;border-radius:12px 12px 0 0;">
        <h2 style="color:#fff;margin:0;font-size:18px;">▶️ 유튜브 영상 수집 결과</h2>
        <p style="color:#94a3b8;margin:4px 0 0;font-size:13px;">키워드: <strong style="color:#f87171;">${keyword}</strong> · ${items.length}건</p>
      </div>
      <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-top:none;">
        ${rows}
      </table>
      <p style="font-size:11px;color:#aaa;text-align:center;margin-top:12px;">Guardius ERP 스마트연구소 발송</p>
    </div>`
}

export async function POST(request: NextRequest) {
  const { to, type, keyword, items } = await request.json()

  if (!to || !type || !keyword || !items)
    return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })

  if (!process.env.NAVER_EMAIL || !process.env.NAVER_APP_PASSWORD)
    return NextResponse.json({ error: '이메일 서버 미설정 (NAVER_EMAIL 환경변수 필요)' }, { status: 500 })

  const transporter = nodemailer.createTransport({
    host: 'smtp.naver.com',
    port: 465,
    secure: true,
    auth: { user: process.env.NAVER_EMAIL, pass: process.env.NAVER_APP_PASSWORD },
  })

  const subject = type === 'news'
    ? `[Guardius Lab] 네이버 뉴스 수집 — ${keyword}`
    : `[Guardius Lab] 유튜브 영상 수집 — ${keyword}`

  const html = type === 'news' ? buildNewsHtml(keyword, items) : buildYoutubeHtml(keyword, items)

  await transporter.sendMail({
    from: `"Guardius Lab" <${process.env.NAVER_EMAIL}>`,
    to,
    subject,
    html,
  })

  return NextResponse.json({ ok: true })
}
