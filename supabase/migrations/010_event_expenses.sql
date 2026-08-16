-- 행사별 부대비용 (실제 지출) 기록
--
-- 지금까지 수익은 어디서나 '공급가액 - 인건비' 한 줄로만 계산됐다. 교통비·숙박비
-- 처럼 실제로 나간 돈이 반영될 자리가 없어서, 화면에 찍히는 수익이 실제보다 항상
-- 크게 나왔다.
--
-- 견적의 estimates.extra_cost 나 estimate_items 의 교통비/숙박비/식비 항목을
-- 재사용하지 않는다. 그건 고객에게 청구하려고 잡아둔 견적 단계의 예상 금액이고,
-- 여기 들어오는 건 이미 나간 실제 돈이다. 견적에 잡혔다고 그 돈을 실제로 썼다는
-- 보장이 없다 -- 안 쓸 수도, 더 쓸 수도 있다.
--
-- ★ 그래서 이 테이블은 사람이 직접 입력할 때만 채운다. 견적이나 지급 처리에서
--   자동 생성하지 않는다. (사용자 지침, 2026-08-16)
--
-- 지급(payouts)과 달리 대기/검토완료/입금완료 같은 상태가 없다. 이미 나간 돈을
-- 적는 장부라 승인 흐름이 필요 없다.

CREATE TABLE IF NOT EXISTS event_expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id  UUID REFERENCES inquiries(id) ON DELETE CASCADE,
  category    TEXT NOT NULL DEFAULT '기타',   -- 교통비 / 숙박비 / 식비 / 장비·물품 / 기타
  amount      INTEGER NOT NULL DEFAULT 0,
  memo        TEXT,
  spent_on    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 행사 상세를 열 때마다 inquiry_id 로 조회한다
CREATE INDEX IF NOT EXISTS idx_event_expenses_inquiry ON event_expenses(inquiry_id);

-- category 에 CHECK 을 걸지 않았다. 분류를 하나 늘릴 때마다 DDL 을 다시 돌려야
-- 하는 쪽이 더 번거로워서, 목록은 화면(EXPENSE_CATEGORIES)에서만 제한한다.
