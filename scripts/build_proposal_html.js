/**
 * docs/ 의 아티팩트용 조각 파일들을
 * 브라우저에서 바로 열리는 단독 HTML 문서로 감싼다.
 *
 * 아티팩트는 발행 시점에 doctype/html/head/body 를 자동으로 씌워주기 때문에
 * 원본 파일에는 그 뼈대가 없다. 로컬에서 열거나 메일로 보내려면 필요하다.
 *
 * docs/ 는 크루 실명·평가 메모가 들어 있어 .gitignore 로 빼 뒀다. 이 스크립트만 커밋된다.
 *
 * 사용법: node scripts/build_proposal_html.js          (전부)
 *        node scripts/build_proposal_html.js smartfarm (이름에 포함된 것만)
 */

const fs = require('fs')
const path = require('path')

const DOCS = [
  ['greenleaf-fair-proposal.html', '리빙가드닝페어_제안서.html',
    '가상 문의 하나로 AI 비서가 산출한 견적서·인력 추천·수익률과, 개발 전 채워야 할 데이터 체크리스트.'],
  ['smartfarm-expo-staffing.html', '스마트팜산업대전_배치안.html',
    '6개 직무 22명 배치안 — 직무별 평가 가중치와 지역 하드필터로 고른 근거, 그리고 바로 보낼 섭외 문구까지.'],
]

const filter = process.argv[2]
const targets = filter ? DOCS.filter(d => d[0].includes(filter) || d[1].includes(filter)) : DOCS
if (!targets.length) {
  console.error(`"${filter}" 에 해당하는 문서가 없습니다. 대상: ${DOCS.map(d => d[0]).join(', ')}`)
  process.exit(1)
}

for (const [src, out, desc] of targets) build(src, out, desc)

function build(srcName, outName, description) {
const SRC = path.join(__dirname, '../docs', srcName)
const OUT = path.join(__dirname, '../docs', outName)

const fragment = fs.readFileSync(SRC, 'utf8')

// 조각에서 <title> 을 꺼내 문서 제목으로 쓴다
const titleMatch = fragment.match(/<title>([\s\S]*?)<\/title>/i)
const title = titleMatch ? titleMatch[1].trim() : '제안서'

// 아티팩트 런타임이 넣어주던 최소 리셋을 직접 채운다
const reset = `
    /* 단독 실행용 최소 리셋 — 아티팩트 런타임이 넣어주던 것 */
    *,*::before,*::after{box-sizing:border-box}
    html{-webkit-text-size-adjust:100%}
    body{margin:0}
    img,svg,video{display:block;max-width:100%}
    button,input,select,textarea{font:inherit;color:inherit}
    table{border-collapse:collapse}
    /* 인쇄 / PDF 저장 */
    @media print{
      body{background:#fff}
      section{break-inside:auto}
      figure,.task,.quote,.crewgrp,.tbox{break-inside:avoid}
      .wrap{padding-bottom:0}
    }
`

// head 로 갈 부분(link·style)과 body 로 갈 부분(마크업)을 명시적으로 가른다.
// 브라우저가 알아서 head 를 닫아주긴 하지만, 경계를 직접 그어야 인쇄·저장이 안정적이다.
const bodyStart = fragment.indexOf('<div class="wrap">')
if (bodyStart === -1) throw new Error('본문 시작(<div class="wrap">)을 찾지 못했습니다.')

const headPart = fragment
  .slice(0, bodyStart)
  .replace(/<title>[\s\S]*?<\/title>\s*/i, '')   // title 은 아래서 다시 넣는다
  .trim()
const bodyPart = fragment.slice(bodyStart).trim()

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="description" content="${description}">
<title>${title}</title>
<style>${reset}</style>
${headPart}
</head>
<body>
${bodyPart}
</body>
</html>
`

fs.writeFileSync(OUT, html, 'utf8')

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)
console.log(`✓ ${outName}  (${kb} KB)  — "${title}"`)
}
