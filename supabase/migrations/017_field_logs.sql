-- 현장 기록 (field_logs)
--
-- 현장에서는 정확한 숫자를 넣을 수 없다. "2시간 연장, 전원" "김OO 추가 투입"
-- "주차비 2만원 냈음" 같은 한 줄을 행사에 붙여 두고, 숫자로 바꾸는 일(지급의 연장수당,
-- 부대비용 등록, 배정 추가, 변경 견적)은 사무실에서 '반영 대기함'을 보며 한다.
--
-- 그래서 이 테이블은 돈·인원의 원본이 아니다. 후보 메모다. 지급·부대비용·배정 테이블에
-- 자동으로 아무것도 쓰지 않는다 — 사람이 반영 버튼을 눌러야 그쪽에 생긴다.
-- (부대비용은 사람이 직접 입력할 때만 생긴다는 2026-08-16 원칙과 같은 줄)
--
-- applied_at / applied_to 는 "어디에 반영했나"를 남겨 같은 기록을 두 번 반영하지 않게 한다.

CREATE TABLE IF NOT EXISTS field_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id  UUID NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT '특이사항',   -- 연장 / 인원변경 / 추가지급 / 부대비용 / 특이사항
  content     TEXT NOT NULL,                      -- 현장에서 적은 한 줄
  hours       NUMERIC(5,1),                       -- 연장 시간 (선택)
  headcount   INTEGER,                            -- 인원 증감 (선택, +2 / -1)
  amount      INTEGER,                            -- 금액 (선택)
  staff_name  TEXT,                               -- 관련 크루 이름 (선택)
  log_date    DATE,                               -- 어느 날 일인지 (기본 오늘)
  author      TEXT,                               -- 적은 사람 (자유 입력, 기기에 기억)
  applied_at  TIMESTAMPTZ,                        -- 사무실에서 반영한 시각 (NULL = 반영 대기)
  applied_to  TEXT,                               -- 지급 / 부대비용 / 배정 / 견적·정산 / 출석 / 해당없음
  applied_note TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_logs_inquiry ON field_logs(inquiry_id);
-- 반영 대기함은 applied_at IS NULL 만 본다
CREATE INDEX IF NOT EXISTS idx_field_logs_pending ON field_logs(created_at DESC) WHERE applied_at IS NULL;

-- kind 에 CHECK 을 걸지 않는다 (event_expenses 와 같은 이유 — 목록은 화면에서 관리)
