// 휴대폰 푸시 알림 — 서버 전용
// ─────────────────────────────────────────────────────────
// 웹 푸시(VAPID). 안드로이드 크롬·아이폰 사파리(홈 화면에 추가한 뒤) 둘 다 된다.
// 키는 push_config 에 한 쌍 — 처음 쓸 때 서버가 만들어 넣는다. 환경변수 설정 없음.
// 보내는 쪽은 이 파일의 sendToAll 하나뿐이다. 어디서 알림이 나가는지 여기만 보면 된다:
//   · 크루 셀프 체크인 (app/api/checkin)         → "김OO 체크인 · 행사명"
//   · 현장 기록 저장 (app/api/db POST field_logs) → "[연장] 2시간 연장 · 행사명"
//   · 아침 요약 (app/api/push/cron, 08:00 KST)    → 오늘 행사·연락할 문의·미수·반영 전 기록
//   · 테스트 (app/api/push/test)
// ⚠️ admin 클라이언트를 쓰므로 클라이언트 컴포넌트에서 import 금지.

import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'

export interface PushPayload {
  title: string
  body: string
  /** 눌렀을 때 열 주소. 기본 /m/today */
  url?: string
  /** 같은 tag 는 겹쳐 쓴다 (알림 창에 하나만) */
  tag?: string
}

interface Vapid { publicKey: string; privateKey: string; subject: string }

/** 키 한 쌍. 없으면 만들어 저장한다. subject 는 사이트 주소 (푸시 서비스가 발신자를 식별하는 용도) */
export async function getVapid(subject: string): Promise<Vapid> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('push_config').select('vapid_public, vapid_private, subject').eq('id', 'default').maybeSingle()
  if (data) return { publicKey: data.vapid_public, privateKey: data.vapid_private, subject: data.subject }
  const keys = webpush.generateVAPIDKeys()
  const { error } = await supabase.from('push_config').insert({ id: 'default', vapid_public: keys.publicKey, vapid_private: keys.privateKey, subject })
  if (error) {
    // 두 요청이 동시에 만들었을 수 있다 — 다시 읽는다
    const { data: again } = await supabase.from('push_config').select('vapid_public, vapid_private, subject').eq('id', 'default').maybeSingle()
    if (again) return { publicKey: again.vapid_public, privateKey: again.vapid_private, subject: again.subject }
    throw new Error('push_config 저장 실패: ' + error.message + ' (018 마이그레이션을 실행했는지 확인)')
  }
  return { publicKey: keys.publicKey, privateKey: keys.privateKey, subject }
}

/** 요청에서 사이트 주소를 만든다 (VAPID subject 용) */
export function subjectFrom(req: Request): string {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost'
  const proto = req.headers.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

/** 알림을 켠 모든 기기로 보낸다. 끊긴 기기(404/410)는 지운다. dedupeKey 가 있으면 같은 키로는 한 번만 */
export async function sendToAll(payload: PushPayload, subject: string, opts: { kind: string; dedupeKey?: string } ): Promise<{ sent: number; failed: number; skipped?: string }> {
  const supabase = createAdminClient()
  if (opts.dedupeKey) {
    const { error } = await supabase.from('push_log').insert({ kind: opts.kind, dedupe_key: opts.dedupeKey, title: payload.title, body: payload.body })
    if (error) return { sent: 0, failed: 0, skipped: '이미 보냄: ' + opts.dedupeKey }
  }
  const { data: subs } = await supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth')
  if (!subs || subs.length === 0) return { sent: 0, failed: 0, skipped: '알림 켠 기기 없음' }

  const vapid = await getVapid(subject)
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey)
  const body = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url || '/m/today', tag: payload.tag })

  let sent = 0, failed = 0
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 12 })
      sent++
      await supabase.from('push_subscriptions').update({ last_ok_at: new Date().toISOString(), failed_count: 0 }).eq('id', s.id)
    } catch (e) {
      failed++
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await supabase.from('push_subscriptions').delete().eq('id', s.id)
      else await supabase.from('push_subscriptions').update({ failed_count: 1 }).eq('id', s.id)
    }
  }))
  if (!opts.dedupeKey) await supabase.from('push_log').insert({ kind: opts.kind, title: payload.title, body: payload.body, sent, failed })
  else await supabase.from('push_log').update({ sent, failed }).eq('dedupe_key', opts.dedupeKey)
  return { sent, failed }
}

const todayKST = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)

/** 아침 요약 한 줄. 세는 기준은 휴대폰 '할 일' 탭과 같은 뜻으로, 서버에서 가볍게 센다 */
export async function buildDigest(): Promise<PushPayload> {
  const supabase = createAdminClient()
  const today = todayKST()
  const [inqs, setts, logs, due] = await Promise.all([
    supabase.from('inquiries').select('id, event_name, event_start, event_end, event_dates, status')
      .in('status', ['체결', '배정완료', '진행중']).lte('event_start', today).gte('event_end', today),
    supabase.from('settlements').select('balance, inquiry_id').gt('balance', 0),
    supabase.from('field_logs').select('id').is('applied_at', null),
    supabase.from('inquiries').select('id').in('status', ['접수', '견적']).lte('next_action_at', today + 'T23:59:59'),
  ])
  // 띄엄띄엄 행사는 event_dates 가 사실이다
  const todayEvents = (inqs.data || []).filter(i => {
    const d = i.event_dates as string[] | null
    return !Array.isArray(d) || d.length === 0 || d.some(x => String(x).slice(0, 10) === today)
  })
  let crewLine = ''
  if (todayEvents.length) {
    const ids = todayEvents.map(i => i.id)
    const { data: asg } = await supabase.from('assignments').select('inquiry_id, status').in('inquiry_id', ids).eq('status', '확정')
    const n = (asg || []).length
    crewLine = ` · 확정 크루 ${n}명`
  }
  const unpaidSum = (setts.data || []).reduce((s, r) => s + (r.balance || 0), 0)
  const parts = [
    `오늘 행사 ${todayEvents.length}건${crewLine}`,
    `연락할 문의 ${(due.data || []).length}건`,
    `미수 ${(setts.data || []).length}건 ${Math.round(unpaidSum / 10000).toLocaleString()}만원`,
    `반영 전 현장 기록 ${(logs.data || []).length}건`,
  ]
  const names = todayEvents.slice(0, 2).map(i => i.event_name).filter(Boolean).join(', ')
  return {
    title: `가디어스 아침 요약 ${today.slice(5).replace('-', '/')}`,
    body: (names ? `${names}${todayEvents.length > 2 ? ' 외' : ''}\n` : '') + parts.join(' · '),
    url: '/m/todo', tag: 'digest',
  }
}
