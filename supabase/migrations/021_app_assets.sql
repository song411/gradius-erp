-- 021. 앱 자산 (회사 도장 이미지 등)
-- ─────────────────────────────────────────────────────────
-- 회사 인감 도장 그림을 저장소(코드)에 넣지 않으려고 만든 표. 저장소가 공개라 도장 그림이 올라가면 안 된다.
-- 계약서 화면의 '회사 도장' 칸에서 그림을 올리면 data URL 로 여기 한 줄(id='company_stamp')에 들어가고,
-- 계약서 인쇄·서명 페이지가 읽어 사업주 날인 칸에 찍는다.

CREATE TABLE IF NOT EXISTS app_assets (
  id         TEXT PRIMARY KEY,            -- 'company_stamp'
  data_url   TEXT NOT NULL,               -- data:image/png;base64,...
  note       TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
