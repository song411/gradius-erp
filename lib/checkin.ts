import { createAdminClient } from '@/lib/supabase/admin'

// 크루 셀프 출석 체크인 공용 로직.
// ⚠️ 서버 전용 — admin 클라이언트(RLS 우회)를 쓰므로 클라이언트 컴포넌트에서 import 금지.
//    (CheckinClient는 `import type`으로 타입만 가져오므로 번들에 포함되지 않는다)
// 공개 페이지가 쓰는 곳이므로 밖으로 나가는 필드를 여기서 한 번에 좁힌다.
// 연락처·단가·주민번호는 절대 포함하지 않는다.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 셀프로 찍힌 기록을 구분하는 표식 (담당자 입력분을 크루가 지우지 못하게)
export const SELF_NOTE = '셀프 체크인'

// KST 기준 오늘 (서버가 UTC여도 한국 날짜가 나오도록)
export function todayKST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function nowHHMM(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(11, 16)
}

// 기록할 근무일 — 행사 기간 안이면 오늘, 벗어나면 가장 가까운 행사일로 맞춘다.
// (기간 밖 날짜로 출석 레코드가 생겨 출석부가 어지러워지는 것을 막는다)
export function resolveWorkDate(start?: string | null, end?: string | null): string {
  const today = todayKST()
  const s = start || today
  const e = end || s
  if (today < s) return s
  if (today > e) return e
  return today
}

export interface RosterItem {
  assignmentId: string
  name: string
  jobType: string
  isLeader: boolean
  status: string | null
  clockIn: string | null
  selfCheckin: boolean
}

export interface CheckinView {
  eventName: string
  companyName: string
  location: string
  eventTime: string
  workDate: string
  isToday: boolean
  roster: RosterItem[]
}

export async function getCheckinView(inquiryId: string): Promise<CheckinView | null> {
  if (!UUID_RE.test(inquiryId)) return null

  const supabase = createAdminClient()

  const { data: inq } = await supabase
    .from('inquiries')
    .select('id, event_name, company_name, location, event_start, event_end, event_time')
    .eq('id', inquiryId)
    .maybeSingle()
  if (!inq) return null

  const workDate = resolveWorkDate(inq.event_start, inq.event_end)

  const [{ data: asgns }, { data: atts }] = await Promise.all([
    supabase
      .from('assignments')
      .select('id, staff_name, job_type, role_type, status')
      .eq('inquiry_id', inquiryId)
      .order('assigned_at', { ascending: true }),
    supabase
      .from('attendances')
      .select('assignment_id, status, clock_in, notes')
      .eq('inquiry_id', inquiryId)
      .eq('work_date', workDate),
  ])

  const attList = atts || []
  const roster: RosterItem[] = (asgns || [])
    .filter(a => a.status !== '취소')
    .map(a => {
      const att = attList.find(t => t.assignment_id === a.id)
      return {
        assignmentId: a.id,
        name: a.staff_name || '이름 없음',
        jobType: a.job_type || '',
        isLeader: a.role_type === '팀장',
        status: att?.status || null,
        clockIn: att?.clock_in ? String(att.clock_in).slice(0, 5) : null,
        selfCheckin: att?.notes === SELF_NOTE,
      }
    })

  return {
    eventName: inq.event_name || '',
    companyName: inq.company_name || '',
    location: inq.location || '',
    eventTime: inq.event_time || '',
    workDate,
    isToday: workDate === todayKST(),
    roster,
  }
}
