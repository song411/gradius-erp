'use client'

// 일용직 근로계약서 — 종이에 찍히는 모양
// ─────────────────────────────────────────────────────────
// 글귀와 값은 lib/laborContract.ts 에서 온다. 이 파일은 표와 줄 간격만 책임진다.
// 인쇄는 outerHTML 을 새 창에 넣어 찍으므로(견적서와 같은 방식) Tailwind 를 쓰지 않고 전부 inline style 이다.

import {
  COMPANY, CLAUSES, employerLabel, titleOf, fmtKorean, fmtSignedAt, type ContractFields,
} from '@/lib/laborContract'

export interface DocSignature { dataUrl: string; signedAt: string }

const A4_WIDTH = 794 // px, 210mm @96dpi

const S = {
  page: { width: `${A4_WIDTH}px`, minHeight: '1123px', margin: '0 auto', padding: '44px 48px', background: '#fff', color: '#111',
    fontFamily: "'Malgun Gothic', '맑은 고딕', sans-serif", fontSize: '11.5px', lineHeight: 1.55, boxSizing: 'border-box' as const },
  title: { textAlign: 'center' as const, fontSize: '21px', fontWeight: 800, letterSpacing: '6px', margin: '0 0 18px' },
  table: { width: '100%', borderCollapse: 'collapse' as const, tableLayout: 'fixed' as const, marginBottom: '12px' },
  th: { border: '1px solid #333', background: '#f1f1f1', padding: '5px 6px', fontWeight: 700, textAlign: 'center' as const, verticalAlign: 'middle' as const },
  td: { border: '1px solid #333', padding: '5px 8px', verticalAlign: 'middle' as const, wordBreak: 'keep-all' as const },
  side: { border: '1px solid #333', background: '#e6e6e6', padding: '5px 4px', fontWeight: 800, textAlign: 'center' as const, verticalAlign: 'middle' as const, letterSpacing: '2px' },
  clauseTitle: { fontWeight: 800, margin: '9px 0 2px', fontSize: '12px' },
  item: { margin: '0 0 1px 10px', textIndent: '-10px', paddingLeft: '10px', wordBreak: 'keep-all' as const },
  blank: { color: '#999' },
}

function V({ text }: { text: string }) {
  return text ? <span>{text}</span> : <span style={S.blank}>　</span>
}

function PartyTable({ f }: { f: ContractFields }) {
  const emp = employerLabel(f.variant)
  // 좌: 회사 / 우: 근로자. 양식마다 오른쪽 칸이 다르다
  const rows: [string, string, string, string][] = f.variant === '상세'
    ? [
      ['사업체명', COMPANY.name, '성    명', f.workerName],
      ['대표자명', COMPANY.ceo, '주민등록번호', f.workerIdNumber],
      ['사업자등록증', COMPANY.regNo, '전화번호', f.workerPhone],
      ['전화번호', COMPANY.phone, '지급계좌', f.workerAccount],
    ]
    : [
      ['사업체명', COMPANY.name, '성    명', f.workerName],
      ['대표자명', COMPANY.ceo, '전화번호', f.workerPhone],
      ['주    소', COMPANY.address, '생년월일', f.workerBirth],
      ['전화번호', COMPANY.phone, '지급계좌', f.workerAccount],
    ]
  return (
    <table style={S.table}>
      <colgroup>
        <col style={{ width: '9%' }} /><col style={{ width: '16%' }} /><col style={{ width: '25%' }} />
        <col style={{ width: '9%' }} /><col style={{ width: '16%' }} /><col style={{ width: '25%' }} />
      </colgroup>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {i === 0 && <td rowSpan={rows.length} style={S.side}>{emp}</td>}
            <th style={S.th}>{r[0]}</th>
            <td style={S.td}>{r[1]}</td>
            {i === 0 && <td rowSpan={rows.length} style={S.side}>근로자</td>}
            <th style={S.th}>{r[2]}</th>
            <td style={S.td}><V text={r[3]} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TermsTable({ f }: { f: ContractFields }) {
  const rows: [string, string][] = [
    ['Ⓐ 근로계약기간', f.periodText],
    ['Ⓑ 담당직위', f.positionText],
    ['Ⓒ 담당업무', f.dutyText],
    ['Ⓓ 취업장소', f.placeText],
    ['Ⓔ 소정근로시간', f.hoursText],
    ['Ⓕ 주휴일', '근로기준법에 따른다.'],
    ['Ⓖ 연차유급휴가', '근로기준법에 따른다.'],
    ['Ⓗ 임금산정방법', f.payMethodText],
  ]
  return (
    <table style={S.table}>
      <colgroup><col style={{ width: '22%' }} /><col /></colgroup>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th style={{ ...S.th, textAlign: 'left' }}>{k}</th>
            <td style={S.td}><V text={v} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PayTable({ f }: { f: ContractFields }) {
  const rightLabel = f.variant === '상세' ? '합계' : '지급가'
  return (
    <table style={{ ...S.table, margin: '4px 0 6px' }}>
      <colgroup><col style={{ width: '18%' }} /><col style={{ width: '32%' }} /><col style={{ width: '14%' }} /><col /></colgroup>
      <tbody>
        <tr>
          <th style={S.th}>기본 일당총액</th>
          <td style={S.td}><V text={f.dailyPayText} /></td>
          <th style={S.th}>{rightLabel}</th>
          <td style={S.td}><V text={f.totalPayText} /></td>
        </tr>
      </tbody>
    </table>
  )
}

export default function LaborContractDoc({ fields: f, fluid = false, signature, stampSrc, seal }: {
  fields: ContractFields
  /** 휴대폰 서명 화면용 — A4 폭 고정 대신 화면 폭에 맞춘다 */
  fluid?: boolean
  /** 서명이 끝난 계약서면 근로자 칸에 서명 이미지와 시각을 찍는다 */
  signature?: DocSignature
  /** 회사 인감 그림(data URL). app_assets 'company_stamp'. 있으면 사업주 날인 칸에 항상 찍힌다 */
  stampSrc?: string | null
  /** 봉인 지문(024) — 서명 완료본 맨 아래에 적는다 */
  seal?: { hash: string } | null
}) {
  const emp = employerLabel(f.variant)
  // 서명은 data URL 이라 next/image 를 못 쓴다. 인쇄 창(outerHTML)에도 그대로 실려야 하므로 일부러 <img>
  const sig = signature?.dataUrl
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={signature.dataUrl} alt="서명" style={{ height: '56px', maxWidth: '100%', verticalAlign: 'middle' }} />
    : null
  // eslint-disable-next-line @next/next/no-img-element
  const stamp = stampSrc ? <img src={stampSrc} alt="날인" style={{ height: '64px', verticalAlign: 'middle' }} /> : null
  // 날인 칸 — 도장·서명이 들어갈 만큼 높게, 글자는 흐리게
  const signCell = { ...S.td, textAlign: 'center' as const, color: '#999', height: '72px', padding: '4px 8px' }
  const sigNote = signature?.signedAt ? <span style={{ fontSize: '10px', color: '#555', marginLeft: '6px' }}>전자서명 {fmtSignedAt(signature.signedAt)}</span> : null
  return (
    <div className="labor-contract-page" style={fluid ? { ...S.page, width: '100%', minHeight: 0, padding: '18px 12px' } : S.page}>
      <h1 style={fluid ? { ...S.title, fontSize: '17px', letterSpacing: '1px', wordBreak: 'keep-all' } : S.title}>{titleOf(f.variant)}</h1>
      <PartyTable f={f} />
      <TermsTable f={f} />

      {CLAUSES[f.variant].map(c => (
        <div key={c.title}>
          <p style={S.clauseTitle}>{c.title}</p>
          {c.items.map((it, i) => it === '__PAY_TABLE__'
            ? <PayTable key={i} f={f} />
            : <p key={i} style={S.item}>{it}</p>)}
        </div>
      ))}

      <p style={{ textAlign: 'center', fontWeight: 700, margin: '22px 0 16px', fontSize: '13px', letterSpacing: '2px' }}>
        {f.signDate ? fmtKorean(f.signDate) : '　　년　　월　　일'}
      </p>

      <table style={{ ...S.table, marginBottom: 0 }}>
        <colgroup><col style={{ width: '14%' }} /><col /><col style={{ width: '30%' }} /></colgroup>
        <tbody>
          <tr>
            <th style={S.th}>[{emp}]</th>
            <td style={S.td}>{COMPANY.name}　대표이사 {COMPANY.ceo}</td>
            <td style={signCell}>{stamp || '(인)'}</td>
          </tr>
          <tr>
            <th style={S.th}>[근로자]</th>
            <td style={S.td}>{f.workerName}{sigNote}</td>
            <td style={signCell}>{sig || '(서명)'}</td>
          </tr>
          <tr>
            <th style={S.th}>교부 확인</th>
            <td colSpan={2} style={S.td}>근로자는 본 계약서를 교부받았음을 확인합니다. (위 근로자 서명으로 갈음)</td>
          </tr>
        </tbody>
      </table>
      {seal?.hash && (
        <p style={{ fontSize: '9px', color: '#777', marginTop: '8px', wordBreak: 'break-all', lineHeight: 1.4 }}>
          전자서명 봉인(SHA-256) {seal.hash} — 서명 당시의 내용·서명·시각을 묶은 지문값입니다. 저장된 값과 다르면 서명 뒤 내용이 바뀐 것입니다.
        </p>
      )}
    </div>
  )
}
