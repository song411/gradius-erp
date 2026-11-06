-- 022. 출석 서명 (안전교육 서약 확인)
-- ─────────────────────────────────────────────────────────
-- 크루 셀프 체크인(/c/행사id)에서 본인 확인(전화 뒷 4자리) → 안전교육 서약서 읽기 → 손가락 서명을 하면
-- 그 출석 기록 한 줄에 서명이 붙는다. 출석부 인쇄의 '서명' 칸에 이 그림이 찍힌다.
-- 서명은 출석 기록(attendances)과 한 몸이다 — 따로 표를 두면 "출석은 있는데 서명은 어디" 가 된다.

ALTER TABLE attendances ADD COLUMN IF NOT EXISTS signature_data TEXT;         -- data:image/png;base64,...
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS pledge_at      TIMESTAMPTZ;  -- 안전교육 서약에 동의한 시각
ALTER TABLE attendances ADD COLUMN IF NOT EXISTS signer_ua      TEXT;         -- 서명한 기기
