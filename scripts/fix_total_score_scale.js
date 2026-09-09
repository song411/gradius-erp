/**
 * total_score 척도 통일 (1회성 보정)
 *
 * 배경: 평가 항목에 '상황대응(adaptability_score)'이 나중에 추가되면서
 *       계산식이 [4개 합계] → [5개 평균] 으로 바뀌었는데, 그 이전 기록이
 *       재계산되지 않아 한 컬럼에 두 척도(0~20 / 0~5)가 섞였다.
 *
 * 이 스크립트가 하는 일:
 *   - 세부점수 합계와 total_score 가 일치하는 '구식' 행만 골라
 *     total_score = (평가된 항목 합) / (평가된 항목 수) 로 재계산한다.
 *
 * 하지 않는 일:
 *   - adaptability_score 를 채우지 않는다. (사람이 직접 채워나갈 컬럼이라
 *     비어 있어야 '아직 안 함'이 보인다)
 *   - 세부점수 5개는 일절 건드리지 않는다.
 *   - 미평가자(전부 0)는 그대로 둔다.
 *
 * 사용법:
 *   node scripts/fix_total_score_scale.js          # 미리보기만 (기본)
 *   node scripts/fix_total_score_scale.js --apply  # 실제 반영
 *   node scripts/fix_total_score_scale.js --revert scripts/backups/파일.json
 */

const fs = require('fs')
const path = require('path')

// .env.local 로드 (키를 코드에 넣지 않는다)
const env = {}
for (const line of fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8').split('\n')) {
  const t = line.trim()
  if (t && !t.startsWith('#') && t.includes('=')) {
    const i = t.indexOf('=')
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
}

const { createClient } = require('@supabase/supabase-js')
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const SCORES = [
  'attendance_score', 'performance_score', 'appearance_score',
  'teamwork_score', 'adaptability_score',
]
const round1 = v => Math.round(v * 10) / 10

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const REVERT = args.includes('--revert') ? args[args.indexOf('--revert') + 1] : null

async function revert(file) {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'))
  console.log(`백업 ${rows.length}건을 되돌립니다 — ${file}\n`)
  let ok = 0
  for (const r of rows) {
    const { error } = await sb.from('staff').update({ total_score: r.total_score }).eq('id', r.id)
    if (error) console.log(`  실패 ${r.name}: ${error.message}`)
    else ok++
  }
  console.log(`복구 완료: ${ok}/${rows.length}건`)
}

async function main() {
  if (REVERT) return revert(REVERT)

  const { data: staff, error } = await sb
    .from('staff')
    .select(['id', 'name', 'total_score', ...SCORES].join(','))
    .limit(2000)
  if (error) throw new Error(error.message)

  const targets = []
  for (const s of staff) {
    const vals = SCORES.map(k => s[k] || 0)
    const rated = vals.filter(v => v > 0)
    if (rated.length === 0) continue                      // 미평가자 — 건너뜀

    const cur = s.total_score || 0
    // 올바른 값 = 평가된 항목만의 평균. 여기서 벗어난 행은 모두 보정 대상.
    //   - 합계 그대로 남은 구식 행 (예: 17.5)
    //   - 상황대응이 빈 채로 앱에서 재저장돼 5로 나뉜 행 (예: 5점 만점 4개인데 4.0)
    // 앱은 total_score 를 항상 세부점수에서 계산하므로, 수동 입력값을 덮어쓸 위험은 없다.
    const next = round1(rated.reduce((a, b) => a + b, 0) / rated.length)
    if (Math.abs(cur - next) < 0.06) continue             // 이미 맞음
    targets.push({ id: s.id, name: s.name, from: cur, to: next, rated: rated.length })
  }

  console.log(`전체 ${staff.length}명 중 보정 대상 ${targets.length}명\n`)
  if (targets.length === 0) return console.log('보정할 행이 없습니다.')

  console.log('이름           현재 →  변경  (평가항목수)')
  targets.slice(0, 15).forEach(t =>
    console.log(`  ${t.name.slice(0, 10).padEnd(12)} ${String(t.from).padStart(5)} → ${String(t.to).padStart(5)}   (${t.rated}개)`))
  if (targets.length > 15) console.log(`  ... 외 ${targets.length - 15}명`)

  const tos = targets.map(t => t.to)
  console.log(`\n보정 후 분포: 평균 ${round1(tos.reduce((a, b) => a + b, 0) / tos.length)} / 최저 ${Math.min(...tos)} / 최고 ${Math.max(...tos)}`)

  if (!APPLY) {
    console.log('\n※ 미리보기입니다. 실제 반영하려면 --apply 를 붙여 실행하세요.')
    return
  }

  // 백업 먼저
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const backupPath = path.join(__dirname, 'backups', `staff_total_score_${stamp}.json`)
  const backup = targets.map(t => ({ id: t.id, name: t.name, total_score: t.from }))
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8')
  console.log(`\n백업 저장: ${backupPath}`)

  let ok = 0, fail = 0
  for (const t of targets) {
    const { error } = await sb.from('staff').update({ total_score: t.to }).eq('id', t.id)
    if (error) { console.log(`  실패 ${t.name}: ${error.message}`); fail++ }
    else ok++
  }
  console.log(`\n반영 완료: 성공 ${ok}건 / 실패 ${fail}건`)
  console.log(`되돌리려면: node scripts/fix_total_score_scale.js --revert "${backupPath}"`)
}

main().catch(e => { console.error(e); process.exit(1) })
