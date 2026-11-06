-- 023. 체크인 위치 기록 (보조 증거)
-- ─────────────────────────────────────────────────────────
-- 팀장이 현장 화면에서 '출석 QR'을 띄우면 팀장 폰 위치가 그날 행사장의 기준점이 된다(inquiries.site_*).
-- 크루가 체크인할 때 크루 폰 위치와 기준점 사이 거리를 재서 출석 한 줄에 남긴다(attendances.distance_m).
-- 막는 기준이 아니다 — GPS 오차가 두 폰에 겹쳐 실내·지하에서 100~200m 가 흔하다. 멀면 표시만 하고 사람이 본다.

ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS site_lat DOUBLE PRECISION;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS site_lng DOUBLE PRECISION;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS site_acc REAL;            -- 기준점 오차(m)
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS site_at  TIMESTAMPTZ;     -- 기준점을 잡은 시각

ALTER TABLE attendances ADD COLUMN IF NOT EXISTS lat        DOUBLE PRECISION;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS lng        DOUBLE PRECISION;
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS acc        REAL;        -- 크루 폰 오차(m)
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS distance_m INTEGER;     -- 기준점까지 거리(m). NULL = 위치 없음
