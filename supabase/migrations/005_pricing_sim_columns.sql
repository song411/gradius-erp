-- 가디어스 단가 시뮬레이터 (스마트연구소)
-- roles/factors에 시뮬레이터 전용 컬럼 추가, 단가 변경 이력 테이블 신설
-- 전부 기본값을 가진 컬럼 추가라서 기존 데이터/계산 결과에는 영향 없음

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fixed_costs  JSONB NOT NULL DEFAULT '[]';

ALTER TABLE factors
  ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT '기본',
  ADD COLUMN IF NOT EXISTS alert TEXT;

CREATE TABLE IF NOT EXISTS pricing_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  TEXT NOT NULL,   -- 'roles' | 'factors' | 'guides'
  row_id      UUID NOT NULL,
  field_name  TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  changed_by  TEXT NOT NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
