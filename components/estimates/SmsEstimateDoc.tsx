'use client'

// 문자(MMS) 전송용 견적서
// ─────────────────────────────────────────────────────────
// A4 견적서(A4Preview / EstimatePreview)는 손대지 않는다. 카톡·인쇄에서는
// 그게 최적이고 실제로 잘 보인다. 이 파일은 문자로만 쓰는 출력 하나를 더 만든다.
//
// 왜 A4를 그대로 줄이면 안 되는가:
//   A4 문서는 794 × 1140 CSS px, 본문 11px이다. 통신사 MMS 게이트웨이는 첨부
//   이미지를 무조건 다시 인코딩하면서 긴 변을 수백 px대로 깎는다. 세로로 긴
//   문서는 긴 변이 세로라서 글자가 있는 가로폭이 가장 심하게 줄어든다.
//   긴 변 640px로 깎이면 446 × 640이 되고 본문 글자는 6px이 되어 못 읽는다.
//   저장 옵션(용량·포맷)을 바꿔도 글자에 배정되는 픽셀 수는 통신사가 정하므로
//   달라지지 않는다. 레이아웃 자체가 좁은 폭에 맞춰져 있어야 한다.
//
// 그래서 이 문서는:
//   1. 폭을 640px로 고정하고 1배로 내보낸다 → 통신사 상한(대개 640~1024)
//      안에 이미 들어가므로 축소가 없거나 최소화된다
//   2. 본문을 15px로 키운다. 폭 대비 글자 비율이 A4의 1.39%에서 2.34%로
//      1.7배 커져, 통신사가 한 번 더 깎아도 읽히는 크기가 남는다
//   3. 열을 7개에서 4개로 줄인다 (품명 / 수량 / 단가 / 금액).
//      시간·규격과 비고는 좁은 폭에서 글자를 잡아먹기만 하고 못 읽는다
//   4. 하단 배너 이미지를 뺀다. 정보가 없는데 세로 길이를 크게 먹는다
//      → 세로가 길어지면 통신사 축소율이 그만큼 커진다
//   5. JPEG으로 내보내고 용량 상한에 맞춰 품질을 자동 조절한다.
//      MMS 상한을 넘기면 통신사가 훨씬 거칠게 다시 압축한다

import { qtyUnit, daysUnit } from '@/lib/estimateUnits'

/** 문자용 문서 폭 (CSS px = 내보낼 이미지의 실제 픽셀 폭) */
export const SMS_DOC_WIDTH = 640

/** MMS 첨부 용량 목표. 통신사 상한(대개 300KB 안팎)보다 낮게 잡아 여유를 둔다 */
const SMS_BYTE_BUDGET = 280_000

export interface SmsItem {
  key: string
  name: string
  quantity: number
  quantityUnit?: string | null
  days: number
  daysUnit?: string | null
  unitPrice: number
  /** 지원품목처럼 금액을 청구하지 않는 줄 */
  free?: boolean
  isLeader?: boolean
  kind: 'staff' | 'extra' | 'support'
}

export interface SmsDocData {
  companyName: string
  eventName: string
  eventPeriod: string
  estimateCode?: string
  today: string
  items: SmsItem[]
  staffSubtotal: number
  extraSubtotal: number
  supplyPrice: number
  vat: number
  includeVat: boolean
  finalTotal: number
  hasDiscount: boolean
  discountLabel: string
  discountAmount: number
  notes?: string
}

const CO = {
  name: '주식회사 가디어스',
  phone: '1600-2944',
  bank: '기업은행',
  bankAccount: '132-119648-04-019',
}

const won = (n: number) => n.toLocaleString('ko-KR')

// 좁은 폭에서 읽히도록 A4보다 큰 글자를 쓴다
const S = {
  body:  { fontSize: '15px', lineHeight: 1.25 },
  small: { fontSize: '13px', lineHeight: 1.3 },
  th:    { fontSize: '14px', fontWeight: 700 as const },
}
const BORDER = '1px solid #d1d5db'
const NAVY = '#1e3a5f'

function Cell({
  children, align = 'left', bold, color, bg, width,
}: {
  children?: React.ReactNode
  align?: 'left' | 'center' | 'right'
  bold?: boolean; color?: string; bg?: string; width?: string
}) {
  return (
    <td style={{
      ...S.body, padding: '7px 6px', border: BORDER, textAlign: align,
      verticalAlign: 'middle', width,
      fontWeight: bold ? 700 : 400,
      color: color ?? '#111827',
      backgroundColor: bg,
    }}>
      {children}
    </td>
  )
}

function SumLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: strong ? '10px 12px' : '7px 12px',
      borderBottom: strong ? 'none' : '1px solid #e5e7eb',
      backgroundColor: strong ? NAVY : undefined,
      color: strong ? '#fff' : undefined,
      fontSize: strong ? '20px' : '15px',
      fontWeight: strong ? 900 : 400,
    }}>
      <span style={{ color: strong ? '#fff' : '#6b7280' }}>{label}</span>
      <span style={{ fontWeight: strong ? 900 : 700 }}>{value}</span>
    </div>
  )
}

export default function SmsEstimateDoc({ data }: { data: SmsDocData }) {
  const rows = data.items.filter(i => i.name)
  const staff   = rows.filter(i => i.kind === 'staff')
  const extra   = rows.filter(i => i.kind === 'extra')
  const support = rows.filter(i => i.kind === 'support')

  const qtyText = (i: SmsItem) => {
    const q = `${i.quantity}${qtyUnit(i.quantityUnit)}`
    const d = i.days > 1 ? ` × ${i.days}${daysUnit(i.daysUnit)}` : ''
    return q + d
  }

  const itemRow = (i: SmsItem, bg?: string, color?: string) => {
    const amt = i.quantity * (i.days || 1) * i.unitPrice
    return (
      <tr key={i.key}>
        <Cell bg={bg} color={color} bold={i.isLeader}>
          {i.isLeader ? '★ ' : ''}{i.name}
        </Cell>
        <Cell align="center" bg={bg} color={color} width="92px">{qtyText(i)}</Cell>
        <Cell align="right" bg={bg} color={color} width="92px">
          {i.free || i.unitPrice <= 0 ? '-' : won(i.unitPrice)}
        </Cell>
        <Cell align="right" bold bg={bg} color={color ?? NAVY} width="104px">
          {i.free || amt <= 0 ? '-' : won(amt)}
        </Cell>
      </tr>
    )
  }

  return (
    <div style={{
      width: `${SMS_DOC_WIDTH}px`, backgroundColor: '#fff', padding: '18px',
      fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif", color: '#111827',
      boxSizing: 'border-box',
    }}>
      {/* 제목 */}
      <div style={{ textAlign: 'center', paddingBottom: '10px', borderBottom: `3px solid ${NAVY}` }}>
        <div style={{ fontSize: '26px', fontWeight: 900, letterSpacing: '10px', color: NAVY }}>
          견 적 서
        </div>
      </div>

      {/* 헤더 정보 — A4의 공급자/공급받는자 2단 표를 줄글로 압축 */}
      <div style={{ padding: '12px 2px 14px' }}>
        <div style={{ fontSize: '19px', fontWeight: 900, marginBottom: '4px' }}>
          {data.companyName || '(업체명)'}
        </div>
        {data.eventName && (
          <div style={{ ...S.body, color: '#374151', marginBottom: '2px' }}>{data.eventName}</div>
        )}
        <div style={{ ...S.body, color: '#374151' }}>행사일 {data.eventPeriod || '-'}</div>
        <div style={{ ...S.small, color: '#6b7280', marginTop: '5px' }}>
          {CO.name} · {CO.phone} · 견적일 {data.today}
          {data.estimateCode ? ` · ${data.estimateCode}` : ''}
        </div>
      </div>

      {/* 품목 표 — 4열 (A4의 7열에서 시간/규격·비고를 뺐다) */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr style={{ backgroundColor: NAVY, color: '#fff' }}>
            {['품명', '수량', '단가', '금액'].map((h, idx) => (
              <th key={h} style={{
                ...S.th, padding: '8px 6px', border: `1px solid #2d4a7a`,
                textAlign: idx === 0 ? 'left' : idx === 1 ? 'center' : 'right',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {staff.map(i => itemRow(i))}
          {staff.length > 0 && extra.length + support.length > 0 && (
            <tr>
              <Cell bg="#eef2ff" bold color="#3730a3">소계</Cell>
              <Cell bg="#eef2ff" /><Cell bg="#eef2ff" />
              <Cell align="right" bold bg="#eef2ff" color="#1e40af">{won(data.staffSubtotal)}</Cell>
            </tr>
          )}
          {extra.map(i => itemRow(i, '#fef9c3', '#92400e'))}
          {support.map(i => itemRow(i, '#e0f2fe', '#0369a1'))}
          {data.hasDiscount && (
            <tr>
              <Cell bg="#fee2e2" bold color="#b91c1c">{data.discountLabel}</Cell>
              <Cell bg="#fee2e2" /><Cell bg="#fee2e2" />
              <Cell align="right" bold bg="#fee2e2" color="#b91c1c">
                -{won(data.discountAmount)}
              </Cell>
            </tr>
          )}
        </tbody>
      </table>

      {/* 합계 */}
      <div style={{ marginTop: '14px', border: BORDER, borderRadius: '4px', overflow: 'hidden' }}>
        <SumLine label="공급가액" value={won(data.supplyPrice)} />
        <SumLine label="부가세" value={data.includeVat ? won(data.vat) : '별도'} />
        <SumLine label="합계" value={won(data.finalTotal)} strong />
      </div>

      {/* 특이사항 — 길면 문서가 세로로 늘어나 축소율이 커지므로 잘라 쓴다 */}
      {data.notes && (
        <div style={{
          marginTop: '12px', border: '1px solid #fde68a', borderRadius: '4px',
          backgroundColor: '#fffbeb', padding: '9px 11px',
        }}>
          <div style={{ ...S.small, fontWeight: 700, color: '#92400e', marginBottom: '3px' }}>
            ※ 특이사항
          </div>
          <div style={{ ...S.small, color: '#451a03', whiteSpace: 'pre-wrap' }}>
            {data.notes.length > 160 ? data.notes.slice(0, 160) + '…' : data.notes}
          </div>
        </div>
      )}

      <div style={{
        marginTop: '12px', textAlign: 'center', padding: '9px',
        border: `2px solid #1e40af`, borderRadius: '5px', backgroundColor: '#eff6ff',
        ...S.body, fontWeight: 700, color: '#1e40af',
      }}>
        입금계좌 {CO.bank} {CO.bankAccount}
      </div>
    </div>
  )
}

// ─── 캡처 ─────────────────────────────────────────────────
/** 문자용 이미지로 내보낸다.
 *
 *  A4 저장과 달리 pixelRatio를 1로 둔다. 2배로 뽑아 봐야 통신사가 다시 깎으면서
 *  용량만 커지고, 용량이 상한을 넘으면 오히려 더 거칠게 압축된다.
 *
 *  포맷은 JPEG이다. MMS는 PNG를 그대로 싣지 못해 어차피 게이트웨이가 JPEG으로
 *  바꾼다. 우리가 먼저 품질을 정해 넘기는 편이 결과가 낫다.
 *
 *  html-to-image의 알려진 함정 두 개는 A4 저장(captureElement)과 동일하게 처리한다:
 *   - position:fixed 래퍼가 SVG로 직렬화되면 캔버스 밖으로 밀려 흰 이미지가 된다
 *     → 래퍼가 아니라 안쪽 클론을 대상으로 잡는다
 *   - 첫 호출에서는 리소스가 SVG 컨텍스트에 아직 안 올라와 있다 → 두 번 워밍업 */
export async function captureSmsImage(source: HTMLElement): Promise<{
  dataUrl: string; bytes: number; width: number; height: number; quality: number
}> {
  const { toJpeg } = await import('html-to-image')

  const wrap = document.createElement('div')
  wrap.style.cssText =
    `position:fixed;top:-99999px;left:0;width:${SMS_DOC_WIDTH}px;background:#ffffff;`

  const cloned = source.cloneNode(true) as HTMLElement
  cloned.style.width = `${SMS_DOC_WIDTH}px`
  cloned.style.maxWidth = 'none'
  cloned.style.height = 'auto'
  cloned.style.maxHeight = 'none'
  cloned.style.overflow = 'visible'

  wrap.appendChild(cloned)
  document.body.appendChild(wrap)

  try {
    await new Promise(r => requestAnimationFrame(r))
    const height = cloned.scrollHeight || cloned.offsetHeight
    wrap.style.height = `${height}px`
    await new Promise(r => requestAnimationFrame(r))

    const base = {
      pixelRatio: 1, backgroundColor: '#ffffff', skipFonts: true, cacheBust: true,
      width: SMS_DOC_WIDTH, height,
    }
    await toJpeg(cloned, { ...base, quality: 0.9 })   // 워밍업 1
    await toJpeg(cloned, { ...base, quality: 0.9 })   // 워밍업 2

    // 용량 목표를 넘으면 품질을 낮춰 다시 뽑는다.
    // 우리가 못 맞추면 통신사가 훨씬 나쁘게 맞춘다.
    let dataUrl = ''
    let bytes = 0
    let quality = 0.9
    for (const q of [0.9, 0.8, 0.7, 0.6, 0.5]) {
      quality = q
      dataUrl = await toJpeg(cloned, { ...base, quality: q })
      bytes = Math.round(((dataUrl.split(',')[1] ?? '').length * 3) / 4)
      if (bytes <= SMS_BYTE_BUDGET) break
    }
    return { dataUrl, bytes, width: SMS_DOC_WIDTH, height, quality }
  } finally {
    if (document.body.contains(wrap)) document.body.removeChild(wrap)
  }
}
