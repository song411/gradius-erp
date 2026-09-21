-- ============================================================
-- 영업 보드 (체결 전 관리)
-- Supabase Dashboard > SQL Editor 에서 실행
-- ============================================================
-- 운영 캘린더가 체결된 건을 맡는다면, 체결 전 건은 여기서 관리한다.
-- 새 테이블은 만들지 않는다 — 문의(inquiries)가 이미 체결 전 건의
-- 주인이고, 접촉 이력은 project_memos가 이미 담고 있다.

-- 1. 문의에 '다음 할 일'과 '미체결 사유'를 더한다
ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS next_action    TEXT,   -- 다음에 무엇을 하기로 했나 (예: 담당자 재통화)
  ADD COLUMN IF NOT EXISTS next_action_at DATE,   -- 그걸 언제 하기로 했나
  ADD COLUMN IF NOT EXISTS lost_reason    TEXT;   -- 미체결/보류/취소로 끝난 이유

COMMENT ON COLUMN inquiries.next_action    IS '영업 보드: 다음 할 일 (사람이 적는 값, 계산에 쓰지 않는다)';
COMMENT ON COLUMN inquiries.next_action_at IS '영업 보드: 다음 할 일 예정일';
COMMENT ON COLUMN inquiries.lost_reason    IS '영업 보드: 미체결 사유 (가격/일정/경쟁사/고객취소/무응답/기타)';

-- 오늘 할 일을 모아보는 조회가 잦다
CREATE INDEX IF NOT EXISTS idx_inquiries_next_action_at
  ON inquiries (next_action_at)
  WHERE next_action_at IS NOT NULL;

-- 2. project_memos에 '영업활동' 유형 추가
--    (통화/메일/미팅 기록이 쌓이는 자리. 지금은 consult_notes 한 칸에
--     덮어쓰기라 지난주에 무슨 얘기를 했는지가 사라진다)
DO $$
DECLARE c record;
BEGIN
  IF to_regclass('public.project_memos') IS NULL THEN
    RAISE NOTICE 'project_memos 테이블이 없어 건너뜁니다';
    RETURN;
  END IF;

  -- type에 걸린 기존 CHECK 제약을 찾아 걷어낸다 (이름을 모르므로 정의로 찾는다)
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.project_memos'::regclass
       AND contype  = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%type%'
  LOOP
    EXECUTE format('ALTER TABLE project_memos DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE project_memos
    ADD CONSTRAINT project_memos_type_check
    CHECK (type IN ('인원추천', '운영메모', '피드백', '영업활동'));
END $$;

-- 완료 확인
SELECT
  (SELECT COUNT(*) FROM inquiries WHERE next_action IS NOT NULL) AS 할일있는문의,
  (SELECT COUNT(*) FROM inquiries WHERE lost_reason IS NOT NULL) AS 사유기록,
  (SELECT COUNT(*) FROM project_memos WHERE type = '영업활동')   AS 영업활동메모;
