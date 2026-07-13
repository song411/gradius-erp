-- 단가 시뮬레이터 — 일반관리비/이익률을 직종별로 조정 가능하게 함
-- 지금까지는 calcPrice()에 6%/10%가 하드코딩되어 있었음. 직종마다 원가 구조/전략이
-- 다를 수 있어서(예: 고위험 직종은 이익률을 낮게, 특수 전문직은 관리비를 다르게)
-- roles 테이블에 컬럼으로 두고 팀이 직접 조정하게 한다.

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS mgmt_rate   NUMERIC NOT NULL DEFAULT 0.06,
  ADD COLUMN IF NOT EXISTS profit_rate NUMERIC NOT NULL DEFAULT 0.10;
