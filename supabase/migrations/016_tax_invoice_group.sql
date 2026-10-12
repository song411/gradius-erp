-- 016: 세금계산서 합산 발행 묶음
--
-- 같은 업체의 소액 정산 여러 건을 세금계산서 한 장으로 발행할 때,
-- "어느 건들이 같이 발행됐는지"를 남긴다. 정산 건 자체는 합치지 않는다 —
-- 행사별 수익·지급 계산은 그대로이고, 발행 '단위'만 묶는다.
--
-- 둘 다 빈 칸(NULL 허용)이라 기존 데이터·기존 화면에 영향이 없다.
-- 이 SQL을 먼저 실행하고 코드를 배포한다. 코드는 칸이 없어도 발행완료 처리는 되도록 짜여 있다.

ALTER TABLE settlements
  ADD COLUMN IF NOT EXISTS tax_invoice_group TEXT,
  ADD COLUMN IF NOT EXISTS tax_invoice_issued_at TIMESTAMPTZ;

COMMENT ON COLUMN settlements.tax_invoice_group IS
  '합산 발행 묶음 번호. 같은 번호 = 세금계산서 한 장으로 같이 발행된 건. 단독 발행은 NULL';
COMMENT ON COLUMN settlements.tax_invoice_issued_at IS
  '발행완료 처리한 시각. 예전 건은 NULL(발행 여부는 tax_invoice_issued가 기준)';

-- 묶음으로 모아 보는 조회용
CREATE INDEX IF NOT EXISTS idx_settlements_tax_invoice_group
  ON settlements (tax_invoice_group) WHERE tax_invoice_group IS NOT NULL;
