-- 견적서 할인 기능
-- estimates: 총액 할인 (정액 / 비율), estimate_items: 개별 단가 할인 표시 플래그
-- 전부 기본값을 가진 컬럼 추가라서 기존 데이터/계산 결과에는 영향 없음

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS discount_type  TEXT DEFAULT 'none' CHECK (discount_type IN ('none', 'amount', 'percentage')),
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_label TEXT DEFAULT '총액 에누리 (할인)';

ALTER TABLE estimate_items
  DROP COLUMN IF EXISTS unit_discount_applied,
  ADD COLUMN IF NOT EXISTS original_unit_price NUMERIC DEFAULT NULL;
