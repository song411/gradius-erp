-- 단가 시뮬레이터 v2 — 시장 단가 다중 입력 + 조건/규칙 구조화
-- (문서화 목적: 이 컬럼들은 대시보드에서 먼저 적용되어 있었음 — 실제 반영 여부와 무관하게 항상 안전하게 재실행 가능)

ALTER TABLE guides
  ADD COLUMN IF NOT EXISTS label TEXT,        -- 예: '지킴', 'G360', '2026-07 조사' — NULL이면 "대표값" 행
  ADD COLUMN IF NOT EXISTS price INTEGER,
  ADD COLUMN IF NOT EXISTS surveyed_at DATE;

ALTER TABLE factors
  ADD COLUMN IF NOT EXISTS rule_type TEXT NOT NULL DEFAULT 'flat'
    CHECK (rule_type IN ('flat', 'percent', 'tier_qty', 'tier_duration')),
  ADD COLUMN IF NOT EXISTS rule_params JSONB NOT NULL DEFAULT '{}';
  -- flat: 기존 add_price/add_pay_price 그대로 사용 (하위호환 기본값)
  -- percent: {"pct": -0.05} 기본가 대비 비율 가산/할인, 체크박스로 수동 적용
  -- tier_qty: {"min_qty": 5, "pct": -0.03} 투입 인원이 기준 이상이면 자동 적용
  -- tier_duration: {"min_days": 3, "pct": -0.05} 투입 일수가 기준 이상이면 자동 적용

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS base_hours INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS overtime_hourly INTEGER NOT NULL DEFAULT 0;

-- Phase C(다음 라운드) 기반 — 노무 기준값. 이번 라운드에서는 계산 로직과 연결하지 않음.
CREATE TABLE IF NOT EXISTS pricing_settings (
  key         TEXT PRIMARY KEY,
  value       NUMERIC NOT NULL,
  label       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT
);

INSERT INTO pricing_settings (key, value, label) VALUES
  ('min_wage', 10320, '2026년 최저임금 시급 (고용노동부 고시)'),
  ('insurance_employer_rate', 0.11, '4대보험 사업주 부담률 추정 합계 — 사업장 규모/업종별로 다르므로 노무 담당자 확인 후 조정'),
  ('overtime_rate', 0.5, '법정 연장근로 가산율 (통상시급의 50%)'),
  ('night_rate', 0.5, '법정 야간근로(22:00~06:00) 가산율 (통상시급의 50%)')
ON CONFLICT (key) DO NOTHING;
