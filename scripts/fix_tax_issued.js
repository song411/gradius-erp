// 세금계산서 발행여부 복구: CSV에서 발행완료인 건을 Supabase에 업데이트
const fs = require('fs')
const path = require('path')

const env = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim()
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim()
const headers = {
  apikey: key,
  Authorization: 'Bearer ' + key,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
}

async function fetchAll(table, params) {
  const r = await fetch(`${url}/rest/v1/${table}?${params}`, { headers })
  return r.json()
}

async function updateById(table, id, body) {
  const r = await fetch(`${url}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })
  return r.status
}

;(async () => {
  // CSV 읽기
  const csvFiles = fs.readdirSync('C:\\Users\\Win11\\Downloads\\gradius_python-master (1)\\gradius_python-master\\migration_csvs')
  // 청구수납금액입력 파일 찾기 (크기로 구분 - 가장 큰 파일)
  const csvDir = 'C:\\Users\\Win11\\Downloads\\gradius_python-master (1)\\gradius_python-master\\migration_csvs'
  const files = fs.readdirSync(csvDir).map(f => ({
    name: f,
    size: fs.statSync(path.join(csvDir, f)).size,
    fullPath: path.join(csvDir, f),
  }))
  const biggestFile = files.sort((a, b) => b.size - a.size)[0]
  console.log('읽는 파일:', biggestFile.name, biggestFile.size, 'bytes')

  const raw = fs.readFileSync(biggestFile.fullPath, 'utf8')
  const lines = raw.split('\n').filter(l => l.trim())
  
  // 헤더 파싱 (간단히 쉼표 분리)
  const headerLine = lines[0]
  const headers2 = headerLine.split(',').map(h => h.replace(/"/g, '').trim())
  console.log('컬럼 수:', headers2.length)
  console.log('컬럼:', headers2.join(' | '))

  // 인덱스 찾기
  const idIdx = 0  // 청구ID는 첫 번째
  const taxIdx = headers2.findIndex(h => h.includes('발행여부'))
  console.log('발행여부 컬럼 idx:', taxIdx, ':', headers2[taxIdx])

  if (taxIdx === -1) {
    console.log('ERROR: 발행여부 컬럼을 찾을 수 없습니다')
    return
  }

  // 발행완료 ID 수집
  const issuedCsvIds = []
  for (let i = 1; i < Math.min(lines.length, 200); i++) {
    // 단순 쉼표 분리 (따옴표 안의 쉼표 무시 - 간단 처리)
    const cols = lines[i].split(',')
    if (cols.length <= taxIdx) continue
    
    const csvId = cols[idIdx].replace(/"/g, '').trim()
    const taxVal = cols[taxIdx].replace(/"/g, '').trim()
    
    if (taxVal === '발행완료') {
      issuedCsvIds.push(csvId)
    }
  }
  
  console.log(`\n발행완료 건수: ${issuedCsvIds.length}개`)
  console.log('샘플 ID:', issuedCsvIds.slice(0, 5))

  // Supabase settlements에서 해당 건 찾기
  // settlements 테이블에 inquiry_id로 연결되어 있으므로
  // inquiries 테이블에서 old_id (청구ID에 해당하는 값)로 매칭
  const settlements = await fetchAll('settlements', 'select=id,company_name,inquiry_id,site_name,tax_invoice_issued&limit=200')
  console.log('\nSettlements 총:', settlements.length, '건')
  
  // 방법: progress = '정산완료' + deposit_status = '입금완료' 인 건을 발행완료로 처리
  // CSV ID 매칭이 어려우므로, CSV의 발행완료 비율을 확인 후
  // Supabase에서 정산완료 건들을 업데이트
  
  // 먼저 CSV 전체 파싱해서 발행완료 비율 확인
  let totalCsv = 0
  const csvData = {}
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    if (cols.length <= taxIdx) continue
    totalCsv++
    const csvId = cols[idIdx].replace(/"/g, '').trim()
    const taxVal = cols[taxIdx].replace(/"/g, '').trim()
    csvData[csvId] = taxVal
  }
  
  const issuedCount = Object.values(csvData).filter(v => v === '발행완료').length
  const notIssuedCount = Object.values(csvData).filter(v => v !== '발행완료').length
  console.log(`\nCSV 분포: 발행완료=${issuedCount} / 미발행 등=${notIssuedCount} / 전체=${totalCsv}`)

  // progress = 정산완료인 settlements를 발행완료로 업데이트
  const toUpdate = settlements.filter(s => {
    // CSV 발행완료 비율이 높다면 정산완료 = 발행완료로 봄
    return false // 일단 확인만 - 실제 업데이트는 사용자 확인 후
  })
  
  console.log('\n=== 최종 확인 ===')
  console.log('CSV 발행완료:', issuedCount, '건')
  console.log('Supabase 정산완료:', settlements.filter(s => s.progress === '정산완료').length, '건')
  console.log('Supabase 행사종료+입금완료:', settlements.filter(s => s.progress === '행사종료' && s.deposit_status === '입금완료').length, '건')
})()
