'use client'

import React from 'react'

// AI 답변을 읽을 수 있게 그리는 작은 렌더러
// ─────────────────────────────────────────────────────────
// 라이브러리를 들이지 않은 이유: 그릴 대상이 우리가 쓴 지침의 결과라 범위가 좁다.
// 제목·굵게·코드·글머리표·번호·표·구분선이면 충분하고, 모르는 줄은 그냥 글로 흘린다.
// (깨지느니 원문이 보이는 편이 낫다)

/** **굵게** · *기울임* · `코드` 만 처리한다 (굵게를 먼저 잡아야 * 하나로 쪼개지지 않는다) */
function inline(text: string, key: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  let n = 0

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) {
      parts.push(
        <strong key={`${key}-b${n++}`} className="font-semibold text-cyan-200">
          {tok.slice(2, -2)}
        </strong>,
      )
    } else if (tok.startsWith('*')) {
      parts.push(
        <em key={`${key}-i${n++}`} className="italic text-slate-100">
          {tok.slice(1, -1)}
        </em>,
      )
    } else {
      parts.push(
        <code key={`${key}-c${n++}`} className="rounded bg-cyan-400/10 px-1 py-0.5 text-cyan-300 font-mono text-2xs">
          {tok.slice(1, -1)}
        </code>,
      )
    }
    last = m.index + tok.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

const isTableRow = (l: string) => l.trim().startsWith('|') && l.trim().endsWith('|')
const isTableDivider = (l: string) => /^\|[\s:|-]+\|$/.test(l.trim())
const cells = (l: string) => l.trim().slice(1, -1).split('|').map(c => c.trim())

export default function MarkdownView({ text }: { text: string }) {
  const lines = text.split('\n')
  const out: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const t = line.trim()

    // ── 표 ──────────────────────────────────────────────
    if (isTableRow(line) && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const header = cells(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(cells(lines[i]))
        i++
      }
      out.push(
        // 표만 가로로 넘칠 수 있다 — 화면 전체가 흔들리지 않게 여기서만 스크롤
        <div key={`t${i}`} className="my-2 overflow-x-auto rounded-lg border border-cyan-400/20">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-cyan-400/10">
                {header.map((h, x) => (
                  <th key={x} className="whitespace-nowrap px-2.5 py-1.5 text-left font-semibold text-cyan-300">
                    {inline(h, `th${x}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, y) => (
                <tr key={y} className="border-t border-cyan-400/10">
                  {r.map((c, x) => (
                    <td key={x} className="px-2.5 py-1.5 align-top text-slate-300">
                      {inline(c, `td${y}-${x}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    // ── 제목 ────────────────────────────────────────────
    const h = t.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      const level = h[1].length
      out.push(
        <p
          key={i}
          className={
            level <= 2
              ? 'mt-3 mb-1.5 text-base font-bold text-cyan-100 first:mt-0'
              : 'mt-2.5 mb-1 text-sm font-semibold text-cyan-200 first:mt-0'
          }
        >
          {inline(h[2], `h${i}`)}
        </p>,
      )
      i++
      continue
    }

    // ── 구분선 ──────────────────────────────────────────
    if (/^(-{3,}|_{3,})$/.test(t)) {
      out.push(<hr key={i} className="my-3 border-cyan-400/20" />)
      i++
      continue
    }

    // ── 글머리표 / 번호 ─────────────────────────────────
    const bullet = t.match(/^[-*•]\s+(.*)$/)
    const numbered = t.match(/^(\d+)[.)]\s+(.*)$/)
    if (bullet || numbered) {
      out.push(
        <div key={i} className="flex gap-2 py-0.5 pl-1">
          <span className="shrink-0 select-none text-cyan-400/70">
            {bullet ? '▸' : `${numbered![1]}.`}
          </span>
          <span className="min-w-0 flex-1">{inline(bullet ? bullet[1] : numbered![2], `li${i}`)}</span>
        </div>,
      )
      i++
      continue
    }

    // ── 빈 줄 / 본문 ────────────────────────────────────
    if (t === '') {
      out.push(<div key={i} className="h-2" />)
    } else {
      out.push(
        <p key={i} className="py-0.5">
          {inline(line, `p${i}`)}
        </p>,
      )
    }
    i++
  }

  return <div className="text-sm leading-relaxed text-slate-200">{out}</div>
}
