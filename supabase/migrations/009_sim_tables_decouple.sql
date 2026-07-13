-- 단가 시뮬레이터를 실제 견적 시스템(roles/factors/guides, EstimateBuilder)과 분리
-- 두 시스템의 가격 계산 철학이 달라(EstimateBuilder는 base_price를 마진 포함 최종
-- 청구가로 그대로 쓰고, 시뮬레이터는 원가로 보고 관리비/이익을 얹어 계산) 같은 테이블을
-- 공유하면 시뮬레이터에서 편집한 값이 실제 견적에 잘못 반영될 위험이 있다.
-- 시뮬레이터 전용 독립 테이블로 옮기고, roles/factors/guides는 EstimateBuilder만 쓰도록 되돌린다.

CREATE TABLE IF NOT EXISTS sim_roles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_code      TEXT NOT NULL,
  role_name      TEXT NOT NULL,
  base_price     INTEGER NOT NULL DEFAULT 0,
  pay_price      INTEGER NOT NULL DEFAULT 0,
  leader_bonus   INTEGER NOT NULL DEFAULT 0,
  fixed_costs    JSONB NOT NULL DEFAULT '[]',
  is_published   BOOLEAN NOT NULL DEFAULT false,
  base_hours     INTEGER NOT NULL DEFAULT 8,
  overtime_hourly INTEGER NOT NULL DEFAULT 0,
  mgmt_rate      NUMERIC NOT NULL DEFAULT 0.06,
  profit_rate    NUMERIC NOT NULL DEFAULT 0.10,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sim_factors (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id        UUID REFERENCES sim_roles(id),
  factor_name    TEXT NOT NULL,
  description    TEXT,
  add_price      INTEGER NOT NULL DEFAULT 0,
  add_pay_price  INTEGER NOT NULL DEFAULT 0,
  level          TEXT NOT NULL DEFAULT '기본',
  alert          TEXT,
  rule_type      TEXT NOT NULL DEFAULT 'flat' CHECK (rule_type IN ('flat', 'percent', 'tier_qty', 'tier_duration')),
  rule_params    JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sim_guides (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id              UUID REFERENCES sim_roles(id),
  consult_points       TEXT,
  market_avg_price     INTEGER,
  competitor_price     INTEGER,
  past_contract_price  INTEGER,
  label                TEXT,
  price                INTEGER,
  surveyed_at          DATE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- roles/factors의 시뮬레이터 전용 컬럼은 이번엔 남겨둔다 (EstimateBuilder/AdminContent가
-- 참조하지 않아 무해함 — DROP COLUMN 같은 되돌리기 어려운 작업은 필요할 때 별도로 진행)
