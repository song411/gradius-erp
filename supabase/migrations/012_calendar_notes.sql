-- 운영 캘린더 날짜 메모
--
-- 행사에 딸리지 않은, 날짜 그 자체에 붙는 메모다.
-- "9월 30일에 아무 행사가 없어도 그 칸에 적을 수 있어야 한다" (사용자 요청, 2026-09-15)
--
-- project_memos 를 재사용하지 않는다. 그 테이블은 inquiry_id 가 NOT NULL 이라
-- 행사 없는 메모를 넣을 수 없고, 억지로 nullable 로 풀면 "행사 메모"와
-- "날짜 메모"가 한 테이블에 섞여 조회마다 구분 조건이 따라붙는다.
--
-- 행사별 날짜 표시(dayNotes)와도 다른 것이다. 그건 특정 행사가 그 날 도는지를
-- 적는 값이고, 이건 날짜 자체에 남기는 쪽지다. 예: '추석 연휴', '장비 점검일'.
--
-- ★ 보기 전용이다. 중복배정 판정·금액·마진·배정 인원 어디에도 들어가지 않는다.
--   사람이 적고 사람이 읽는다. 틀려도 다른 화면 숫자가 어긋나지 않는다.
--   (event_expenses 수동입력 원칙과 같은 결)

CREATE TABLE IF NOT EXISTS calendar_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 멀티테넌시 대비 습관 (2026-08-02 결정). 지금은 전부 '가디어스' 한 값.
  -- 데이터가 쌓인 뒤 전 테이블에 org_id 를 소급 추가하는 것이 판매 전환의 제일 아픈 수술이라,
  -- 새 테이블에는 처음부터 넣어둔다. 비용은 사실상 0.
  org_id      TEXT NOT NULL DEFAULT '가디어스',
  note_date   DATE NOT NULL,
  content     TEXT NOT NULL,
  -- 색은 분류가 아니라 눈에 띄게 하는 용도다. CHECK 을 걸지 않는다 --
  -- 색 하나 늘릴 때마다 DDL 을 다시 돌리는 쪽이 더 번거롭다. 목록은 화면에서만 제한한다.
  color       TEXT,
  author      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 달력은 항상 "이 범위의 날짜" 로 조회한다 (월 격자 / 주간 뷰)
CREATE INDEX IF NOT EXISTS idx_calendar_notes_date ON calendar_notes(org_id, note_date);
