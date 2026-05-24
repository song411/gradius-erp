// estimates 테이블에 version_label, is_final 컬럼 추가
const fs = require('fs')

const envContent = fs.readFileSync('.env.local', 'utf8')
const url = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim()
const key = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim()

const headers = {
  'Content-Type': 'application/json',
  apikey: key,
  Authorization: 'Bearer ' + key,
  Prefer: 'return=minimal',
}

const SQL = `
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS version_label TEXT DEFAULT 'A안',
  ADD COLUMN IF NOT EXISTS is_final BOOLEAN DEFAULT false;
`

;(async () => {
  console.log('Supabase URL:', url)

  // Supabase 내부 pg/query 엔드포인트 시도
  const r = await fetch(url + '/pg/query', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: SQL }),
  })
  const body = await r.text()
  console.log('pg/query status:', r.status)
  console.log('Response:', body.slice(0, 300))

  if (r.status !== 200) {
    console.log('\n=== 수동 실행 SQL (Supabase Dashboard > SQL Editor에 복붙하세요) ===')
    console.log(SQL)
    console.log('================================================================')
  }
})()
