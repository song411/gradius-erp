'use client'

// ERP 가이드북 — 영업 보드 장
// ─────────────────────────────────────────────────────────
// 기능 설명서가 아니라 '왜 적어야 하는가'를 설득하는 글이다.
// 이유를 모르면 아무도 안 적고, 안 적으면 보드는 빈 껍데기가 된다.
//
// 숫자는 전부 실측값이다(2026-09-21 기준). 근거 없는 당부는 설득이 안 된다.
// 숫자를 고칠 일이 생기면 기준일도 같이 고친다.

import { useState } from 'react'
import {
  Target, Phone, Send, CalendarClock, Flag, AlertTriangle,
  ChevronDown, ChevronUp, Sun, Users, TrendingUp, XCircle,
} from 'lucide-react'

const AS_OF = '2026-09-21'

// ─── 왜 필요한가 ──────────────────────────────────────────
const PROBLEMS = [
  {
    before: '견적 보낸 지 며칠 됐는지 아무도 몰랐다',
    detail: '발송 날짜는 DB에 꼬박꼬박 쌓이는데, 그 값을 읽어 "6일째 무응답"이라고 말해 주는 화면이 없었다.',
  },
  {
    before: '다음에 뭘 하기로 했는지가 담당자 머릿속에만 있었다',
    detail: '"수요일에 다시 전화하기로 했다"는 약속이 어디에도 남지 않는다. 바쁘면 잊고, 사람이 바뀌면 통째로 사라진다.',
  },
  {
    before: '통화 내용이 덮어써져 사라졌다',
    detail: '상담 내용 칸은 하나뿐이라 새로 적으면 지난주 얘기가 없어진다. 같은 질문을 두 번 하게 된다.',
  },
  {
    before: '왜 놓쳤는지 기록이 없었다',
    detail: `미체결 111건 중 사유가 적힌 건 0건. 가격 때문인지 일정 때문인지 경쟁사 때문인지 알 수 없으니, 다음 견적을 낼 때 참고할 게 없다.`,
  },
]

const NUMBERS = [
  { value: '65%', label: '최근 30일 승률', note: '체결 42 · 미체결 23. 나머지 35%를 왜 놓쳤는지는 기록이 없어 모른다' },
  { value: '23일', label: '접수 → 체결 중앙값', note: '한 건이 3주 넘게 살아 있다. 그 사이 기록이 없으면 기억에만 의존하게 된다' },
  { value: '79% vs 49%', label: '재거래 · 첫 거래 승률', note: '단골이 압도적으로 잘 된다. 누가 단골인지는 기록이 쌓여야 보인다' },
]

// ─── 세 가지 기록 ─────────────────────────────────────────
const RECORDS = [
  {
    icon: <Send className="h-5 w-5" />,
    tone: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-600',
    title: '① 견적서 발송 체크',
    where: '견적 관리 → 발송 상태 배지 클릭 (여러 건은 체크 후 일괄 처리)',
    why: '여기서 시계가 시작된다.',
    body: [
      '발송 체크를 안 하면 보드는 그 건을 아직 "견적 작성 중"으로 본다. 고객은 이미 견적을 받아 검토하고 있는데 우리 화면에는 안 보낸 걸로 남는다.',
      '무응답 며칠인지도 셀 수 없다. 신호등이 안 켜지니 그 건은 조용히 묻힌다.',
    ],
    must: '발송일은 **실제로 보낸 날**로 넣는다. 지난주에 보낸 걸 오늘 표시만 하는 경우가 대부분인데, 오늘로 찍으면 "무응답 며칠"이 통째로 틀어진다.',
  },
  {
    icon: <Phone className="h-5 w-5" />,
    tone: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    dot: 'bg-indigo-600',
    title: '② 통화 내용 기록',
    where: '영업 보드 → 카드 클릭 → 접촉 이력 → 기록 추가',
    why: '고객이 한 말은 회사의 자산이다.',
    body: [
      '"예산 800 이하를 원한다", "내주 화요일 내부 회의 후 회신 준다", "작년이랑 같은 조건이면 바로 한다" — 이런 한 줄이 다음 견적의 근거가 된다.',
      '기록이 없으면 같은 질문을 두 번 하게 되고, 고객은 그걸 안다.',
      '쌓이면 이력이 된다. 상담 내용 칸 하나에 덮어쓰던 것과 달리, 여기 적은 것은 지워지지 않고 시간순으로 남는다.',
    ],
    must: '통화 끝나고 **30초 안에** 한 줄. 길게 쓰려고 미루면 영영 안 쓴다. 작성자 이름은 한 번 적으면 다음부터 자동으로 들어간다.',
  },
  {
    icon: <CalendarClock className="h-5 w-5" />,
    tone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-600',
    title: '③ 다음 할 일 + 날짜',
    where: '영업 보드 → 카드 클릭 → 다음 할 일',
    why: '약속을 머리가 아니라 시스템에 넣는 것이다.',
    body: [
      '"금요일에 재통화"라고 적고 날짜를 넣으면, 그 날 보드 맨 위 "오늘의 후속"에 올라온다. 기한이 지나면 빨갛게 바뀐다.',
      '내가 쉬는 날에도 다른 사람이 보드만 열면 오늘 할 일을 안다.',
    ],
    must: '**날짜를 꼭 같이 넣는다.** 날짜 없는 할 일은 "언젠가"와 같은 말이라 영영 안 뜬다.',
  },
  {
    icon: <Flag className="h-5 w-5" />,
    tone: 'bg-gray-100 text-gray-700 border-gray-300',
    dot: 'bg-gray-600',
    title: '④ 끝났으면 사유까지',
    where: '영업 보드 → 카드 클릭 → 결론',
    why: '왜 졌는지가 다음 가격의 근거다.',
    body: [
      '가격 / 일정 불가 / 경쟁사 / 고객 내부취소 / 무응답 중에서 고르기만 하면 된다.',
      '한 해가 지나면 "우리가 지는 이유 1위"가 숫자로 보인다. 가격 때문이면 단가를, 일정 때문이면 인력 풀을 손봐야 한다는 뜻이다.',
    ],
    must: '상태만 "미체결"로 바꾸고 사유를 비워두면 그 건은 그냥 사라진 것과 같다. 지금까지 **111건 중 0건**이 그랬다.',
  },
]

// ─── 하루 사용법 ──────────────────────────────────────────
const ROUTINE = [
  {
    when: '아침 — 3분',
    emoji: '☀️',
    steps: [
      '보드를 열면 맨 위 **오늘의 후속**부터 본다. 오늘 전화하기로 한 건들이다.',
      '**빨간불**을 훑는다. 14일 넘게 답이 없거나 행사일이 지난 건이다.',
      '정렬을 **행사일 임박순**으로 바꿔 코앞인데 아직 안 잡힌 건을 확인한다.',
    ],
  },
  {
    when: '통화 직후 — 30초',
    emoji: '📞',
    steps: [
      '카드를 누른다.',
      '**접촉 이력**에 무슨 얘기를 했는지 한두 줄.',
      '**다음 할 일**에 뭘 언제 할지 적고 저장. 끝.',
    ],
  },
  {
    when: '견적 보낸 직후',
    emoji: '📤',
    steps: [
      '견적 관리에서 **발송완료**로 체크한다.',
      '발송일은 실제로 보낸 날로.',
      '이때부터 보드가 무응답 일수를 센다.',
    ],
  },
  {
    when: '결론이 났을 때',
    emoji: '🏁',
    steps: [
      '되면 견적 관리에서 ⭐ 최종 확정 → 체결 탭으로 넘어간다.',
      '안 되면 카드에서 **미체결 + 사유**를 고른다.',
      '사유는 반드시 남긴다.',
    ],
  },
  {
    when: '주간 회의',
    emoji: '📊',
    steps: [
      '**승률 카드**로 이번 달 성적을 본다.',
      '**체결 / 미체결 탭**으로 지난 30일에 뭐가 들어오고 나갔는지 확인한다.',
      '**캘린더**로 다음 달에 사람이 몰리는 날을 미리 본다.',
    ],
  },
]

// ─── 화면 읽는 법 ─────────────────────────────────────────
const READING = [
  {
    title: '구분 탭 5개',
    items: [
      ['전체', '단계별 보드. 전체 흐름을 볼 때'],
      ['견적 발송 전', '접수했는데 아직 견적서를 안 보낸 건. 여기 오래 머물면 안 된다'],
      ['체결 전', '견적서 발송 완료 건. 답을 기다리는 중 — 평소 가장 많이 머무는 곳'],
      ['체결', '계약된 건. 이후 운영은 운영 캘린더가 맡는다'],
      ['미체결', '놓친 건. 행사일이 아직 남았으면 되돌릴 여지가 있다'],
    ],
  },
  {
    title: '신호등 (카드 왼쪽 세로줄)',
    items: [
      ['초록 (없음)', '정상 진행 중'],
      ['노랑', '7일째 답이 없다'],
      ['빨강', '14일째 답이 없거나, 행사일이 이미 지났다'],
    ],
    note: '기준을 처음엔 3일/5일로 잡았다가 고쳤다. 접수부터 체결까지 중앙값이 23일이라 5일에 빨간불을 켜면 정상 건까지 전부 빨개졌다(34건 중 33건). 늘 빨간 신호등은 신호등이 아니다.',
  },
  {
    title: 'D-day 배지 (카드 오른쪽 위)',
    items: [
      ['주황 D-3', '행사가 일주일 안이다. 지금 안 잡으면 끝'],
      ['노랑 D-10 (미체결 카드)', '놓친 건인데 행사일이 남았다 — 되돌릴 기회가 있다'],
      ['회색 D+8', '행사일이 지났다. 정리해야 할 건'],
    ],
  },
  {
    title: '(추정) 표시',
    items: [
      ['발송 120일째 무응답 (추정)', '옛날 데이터라 실제 발송일이 비어 있어 견적을 마지막 손본 날로 대신 셌다는 뜻'],
    ],
    note: '추정치를 확정값처럼 보여주지 않는 것이 이 ERP의 원칙이다. 앞으로 발송하는 건은 정확히 기록되니 시간이 지나면 사라진다.',
  },
]

// ─── 하지 말아야 할 것 ────────────────────────────────────
const DONTS = [
  { do: '상태만 미체결로 바꾸고 사유는 비워둔다', why: '왜 졌는지 영영 알 수 없다. 사유 고르는 데 3초 걸린다' },
  { do: '견적 보내고 발송 체크를 안 한다', why: '시계가 안 돌아 그 건이 신호등에 안 잡힌다' },
  { do: '일괄 발송 처리할 때 발송일을 오늘로 둔다', why: '실제로는 지난주에 보낸 건이라면 무응답 일수가 전부 틀어진다' },
  { do: '보드에 보이는 금액을 매출로 센다', why: '아직 남의 돈이다. 체결되기 전 견적 금액은 매출·수익 집계에 들어가지 않는다' },
]

// ═════════════════════════════════════════════════════════
export default function SalesBoardGuide() {
  const [openRecord, setOpenRecord] = useState<string | null>(RECORDS[0].title)

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Target className="h-5 w-5 text-blue-600" />
        <h2 className="text-xl font-extrabold text-gray-900">영업 보드</h2>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        체결 전 현황을 한 화면에서 — 왜 적어야 하는지부터.
      </p>

      {/* 한 줄 요약 */}
      <div className="mb-6 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 p-5 text-white shadow">
        <p className="text-base font-bold leading-relaxed">
          운영 캘린더가 <span className="underline decoration-white/40">체결된 뒤</span>를 맡는다면,
          영업 보드는 <span className="underline decoration-white/40">체결되기 전</span>을 맡습니다.
        </p>
        <p className="mt-2 text-sm text-blue-100 leading-relaxed">
          체결 후 관리가 잘 되는 만큼 체결 전도 중요합니다. 다만 체결 전은 눈에 보이는 결과물이
          없어서, <b className="text-white">적지 않으면 아무것도 남지 않습니다.</b>
        </p>
      </div>

      {/* 왜 만들었나 */}
      <h3 className="mb-2 text-sm font-extrabold text-gray-900">이런 게 새고 있었습니다</h3>
      <div className="mb-5 space-y-2">
        {PROBLEMS.map(p => (
          <div key={p.before} className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
            <p className="flex items-start gap-2 text-sm font-bold text-gray-900">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              {p.before}
            </p>
            <p className="mt-1 pl-6 text-xs leading-relaxed text-gray-600">{p.detail}</p>
          </div>
        ))}
      </div>

      {/* 숫자 */}
      <h3 className="mb-2 text-sm font-extrabold text-gray-900">
        숫자로 보면 <span className="font-normal text-gray-400">({AS_OF} 실측)</span>
      </h3>
      <div className="mb-6 grid gap-2 sm:grid-cols-3">
        {NUMBERS.map(n => (
          <div key={n.label} className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
            <p className="text-xl font-extrabold text-gray-900">{n.value}</p>
            <p className="text-xs font-semibold text-gray-700">{n.label}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{n.note}</p>
          </div>
        ))}
      </div>

      {/* 네 가지 기록 */}
      <h3 className="mb-1 text-sm font-extrabold text-gray-900">무엇을 적어야 하나</h3>
      <p className="mb-3 text-xs text-gray-500">항목을 눌러 펼쳐보세요.</p>
      <div className="mb-6 space-y-2">
        {RECORDS.map(r => {
          const open = openRecord === r.title
          return (
            <div key={r.title} className={`rounded-xl border bg-white shadow-sm ${open ? r.tone.split(' ')[2] : 'border-gray-200'}`}>
              <button
                onClick={() => setOpenRecord(open ? null : r.title)}
                className="flex w-full items-center gap-3 p-3.5 text-left"
              >
                <span className={`rounded-lg p-2 ${r.tone}`}>{r.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold text-gray-900">{r.title}</span>
                  <span className="block text-xs text-gray-500">{r.why}</span>
                </span>
                {open ? <ChevronUp className="h-4 w-4 shrink-0 text-gray-400" />
                      : <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />}
              </button>

              {open && (
                <div className="border-t border-gray-100 px-3.5 pb-3.5 pt-3">
                  <p className="mb-2 inline-block rounded-md bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600">
                    {r.where}
                  </p>
                  {r.body.map((line, i) => (
                    <p key={i} className="mb-1.5 flex gap-2 text-xs leading-relaxed text-gray-700">
                      <span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${r.dot}`} />
                      {line}
                    </p>
                  ))}
                  <p className="mt-2.5 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                    <b>꼭 지킬 것 · </b>
                    {r.must.split('**').map((part, i) =>
                      i % 2 === 1 ? <b key={i}>{part}</b> : <span key={i}>{part}</span>)}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 하루 사용법 */}
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-extrabold text-gray-900">
        <Sun className="h-4 w-4 text-amber-500" />하루 사용법
      </h3>
      <div className="mb-6 space-y-2">
        {ROUTINE.map(r => (
          <div key={r.when} className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
            <p className="mb-1.5 text-sm font-bold text-gray-900">
              <span className="mr-1.5">{r.emoji}</span>{r.when}
            </p>
            <ol className="space-y-1">
              {r.steps.map((st, i) => (
                <li key={i} className="flex gap-2 text-xs leading-relaxed text-gray-700">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-500">
                    {i + 1}
                  </span>
                  <span>
                    {st.split('**').map((part, j) =>
                      j % 2 === 1 ? <b key={j} className="text-gray-900">{part}</b> : <span key={j}>{part}</span>)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      {/* 화면 읽는 법 */}
      <h3 className="mb-2 text-sm font-extrabold text-gray-900">화면 읽는 법</h3>
      <div className="mb-6 space-y-2">
        {READING.map(r => (
          <div key={r.title} className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
            <p className="mb-2 text-sm font-bold text-gray-900">{r.title}</p>
            <dl className="space-y-1">
              {r.items.map(([k, v]) => (
                <div key={k} className="flex flex-wrap gap-x-2 text-xs">
                  <dt className="min-w-[8rem] font-semibold text-gray-700">{k}</dt>
                  <dd className="flex-1 text-gray-600">{v}</dd>
                </div>
              ))}
            </dl>
            {r.note && (
              <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-500">
                {r.note}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* 캘린더·정렬 */}
      <div className="mb-6 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-gray-900">
            <TrendingUp className="h-4 w-4 text-blue-600" />정렬 바꿔 쓰기
          </p>
          <p className="text-xs leading-relaxed text-gray-600">
            아침엔 <b>급한 순</b>, 다가오는 행사를 챙길 땐 <b>행사일 임박순</b>,
            방치된 걸 정리할 땐 <b>오래 멈춘 순</b>. 고른 값은 저장되어 다음에도 그대로입니다.
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
          <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-gray-900">
            <Users className="h-4 w-4 text-emerald-600" />캘린더로 인력 경합 보기
          </p>
          <p className="text-xs leading-relaxed text-gray-600">
            날짜 칸에 <b>아직 안 잡힌 건</b>과 <b>그날 이미 확정된 인원</b>이 함께 나옵니다.
            15명짜리를 따려는 날에 이미 10명이 나가 있으면, 수주 전에 25명을 만들 수 있는지
            먼저 따져야 합니다.
          </p>
        </div>
      </div>

      {/* 하지 말 것 */}
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-extrabold text-gray-900">
        <AlertTriangle className="h-4 w-4 text-red-500" />이러면 보드가 무용지물이 됩니다
      </h3>
      <div className="space-y-2">
        {DONTS.map(d => (
          <div key={d.do} className="rounded-xl border border-red-100 bg-red-50/60 p-3">
            <p className="text-xs font-bold text-red-800">✕ {d.do}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-red-700/80">→ {d.why}</p>
          </div>
        ))}
      </div>

      <p className="mt-6 rounded-xl bg-gray-900 px-4 py-3.5 text-xs leading-relaxed text-gray-300">
        <b className="text-white">한 줄로:</b> 보낸 날을 체크하고, 통화하면 한 줄 남기고,
        다음에 할 일에 날짜를 넣고, 끝나면 이유를 고른다. 네 가지뿐입니다.
        이것만 지키면 보드가 알아서 급한 순서를 알려줍니다.
      </p>
    </div>
  )
}
