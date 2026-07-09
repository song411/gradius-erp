-- 견적 품목별 부가세 제외(실비청구) 옵션
-- 기본값 false라서 기존 데이터/계산 결과에는 영향 없음

ALTER TABLE estimate_items
  ADD COLUMN IF NOT EXISTS vat_exempt BOOLEAN DEFAULT false;
