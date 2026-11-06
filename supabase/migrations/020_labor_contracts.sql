-- 020. 근로계약서 전자서명 (labor_contracts)
-- ─────────────────────────────────────────────────────────
-- 계약서 화면에서 "서명 링크 만들기"를 누르면 그 순간의 계약서 내용(fields)이 통째로 한 줄로 저장된다.
-- 크루는 /s/<token> 링크를 열어 전화번호 뒷 4자리로 본인 확인을 하고 손가락으로 서명한다.
-- 서명 뒤에는 이 줄이 원본이다 — ERP 의 배정·크루 값이 바뀌어도 서명한 내용은 여기 그대로 남는다.
--
-- token 은 32자리 hex(128bit) — 링크를 아는 사람만 연다. 유효기간은 두지 않기로 함(사장님 결정 2026-11-06).
-- 공개 쓰기 길은 /api/sign 하나뿐이고 서명 한 번만 받는다. 범용 /api/db 는 잠금 안에서 ERP 만 쓴다.

CREATE TABLE IF NOT EXISTS labor_contracts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token          TEXT NOT NULL UNIQUE,
  assignment_id  UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  inquiry_id     UUID REFERENCES inquiries(id) ON DELETE SET NULL,
  staff_id       UUID REFERENCES staff(id) ON DELETE SET NULL,
  staff_name     TEXT,
  phone          TEXT,                                   -- 본인 확인용(뒷 4자리 비교). 공개 페이지에는 내려보내지 않는다
  variant        TEXT NOT NULL DEFAULT '상세',            -- 기본 / 상세
  fields         JSONB NOT NULL,                          -- 계약서 칸 전부 (lib/laborContract ContractFields)
  status         TEXT NOT NULL DEFAULT '대기',            -- 대기 / 서명완료 / 취소
  signed_at      TIMESTAMPTZ,
  signature_data TEXT,                                    -- 서명 이미지 (data:image/png;base64,...)
  signer_ua      TEXT,                                    -- 서명한 기기 (user-agent)
  signer_ip      TEXT,
  verified_by    TEXT,                                    -- '전화 뒷4자리'
  verify_fails   INTEGER NOT NULL DEFAULT 0,              -- 뒷자리 틀린 횟수. 10번이면 잠근다
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_labor_contracts_assignment ON labor_contracts(assignment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_labor_contracts_inquiry    ON labor_contracts(inquiry_id);
