-- 026. 현장 기록 사진
-- ─────────────────────────────────────────────────────────
-- 영수증·배치·사고 사진을 현장 기록 한 줄에 붙인다. 그림은 파일 저장소(Storage 'field-photos' 버킷)에 있고
-- 여기엔 [{url, path}] 주소만 남긴다. 버킷은 처음 올릴 때 서버(/api/storage)가 없으면 만든다(공개 읽기, 경로는 추측 불가).

ALTER TABLE field_logs ADD COLUMN IF NOT EXISTS photos JSONB NOT NULL DEFAULT '[]'::jsonb;
