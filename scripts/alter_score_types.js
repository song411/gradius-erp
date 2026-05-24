const { createClient } = require('@supabase/supabase-js')

const sb = createClient(
  'https://mpdpwmouxzhmostimafd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wZHB3bW91eHpobW9zdGltYWZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTQzOTYzMiwiZXhwIjoyMDk1MDE1NjMyfQ.EvRzljTQvY7yxhMBVDkY8L2XujNrSbTsu1Ocl_615lw'
)

async function run() {
  // Supabase REST API로 SQL 직접 실행은 불가 → 대신 더미 업데이트로 float 허용 여부 확인
  // 실제 ALTER TABLE은 Supabase 대시보드 SQL 편집기에서 실행 필요
  // 여기서는 반올림해서 integer로 저장하는 방식으로 우회

  console.log('=== 정수 반올림 방식으로 점수 복구 ===')

  // staff 전체 조회
  const { data: staff, error } = await sb
    .from('staff')
    .select('id,name,attendance_score')
    .limit(1000)

  if (error) { console.log('조회 오류:', error.message); return }
  console.log('DB 크루:', staff.length, '명')

  // name -> id 맵
  const nameMap = {}
  for (const s of staff) nameMap[s.name] = s.id

  // CSV 읽기는 Python 스크립트에서 수행
  console.log('→ Python 스크립트(restore_scores_int.py)로 정수 반올림 저장합니다.')
}

run().catch(console.error)
