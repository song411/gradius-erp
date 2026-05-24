-- ============================================================
-- 문의 테이블 개선 마이그레이션
-- Supabase Dashboard > SQL Editor 에서 실행
-- ============================================================

-- 1. pay_detail: 페이 정보를 텍스트로 저장 (예: "팀장 22 / 서브 17")
--    expected_pay(INTEGER)는 그대로 두되 pay_detail(TEXT)를 주력으로 사용
ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS pay_detail TEXT;

-- 2. 기존 notes에 묶인 [복장:xxx] [식사:xxx] [주차:xxx] 파싱해서 컬럼으로 분리
UPDATE inquiries
SET
  attire  = (regexp_match(notes, '\[복장:([^\]]+)\]'))[1],
  meal    = (regexp_match(notes, '\[식사:([^\]]+)\]'))[1],
  parking = (regexp_match(notes, '\[주차:([^\]]+)\]'))[1]
WHERE notes IS NOT NULL
  AND (attire IS NULL OR meal IS NULL OR parking IS NULL);

-- 3. notes에서 [복장:x] [식사:x] [주차:x] 태그 제거 (정리)
UPDATE inquiries
SET notes = trim(
  regexp_replace(notes, '\[(복장|식사|주차):[^\]]*\]\s*', '', 'g')
)
WHERE notes IS NOT NULL
  AND notes ~ '\[(복장|식사|주차):';

-- 4. 직원 테이블: 경호 특화 필드 추가 (Phase 4 미리 준비)
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS guard_level   TEXT,        -- 경호원 등급 (1급/2급/무자격)
  ADD COLUMN IF NOT EXISTS martial_arts  TEXT,        -- 무도 단증 (태권도 3단 등)
  ADD COLUMN IF NOT EXISTS extra_certs   TEXT[],      -- 추가 자격증 배열
  ADD COLUMN IF NOT EXISTS id_front_url  TEXT,        -- 신분증 앞면 (Supabase Storage URL)
  ADD COLUMN IF NOT EXISTS contract_url  TEXT;        -- 계약서 URL

-- 5. 배정 테이블: 역할 구분 추가 (팀장/서브)
ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS role_type TEXT DEFAULT '서브';  -- '팀장' | '서브'

-- 6. 정산 테이블: 지급명세서 관련 필드 추가
ALTER TABLE payouts
  ADD COLUMN IF NOT EXISTS pay_detail_text TEXT;   -- 지급 상세 내역 (자동 생성용)

-- 완료 확인
SELECT
  (SELECT COUNT(*) FROM inquiries)   AS 문의,
  (SELECT COUNT(*) FROM staff)       AS 직원,
  (SELECT COUNT(*) FROM assignments) AS 배정,
  (SELECT COUNT(*) FROM settlements) AS 정산;
