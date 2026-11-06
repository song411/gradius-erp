-- 024. 근로계약서 전자서명 봉인 — 서명 뒤 잠금 + 위변조 지문
-- ─────────────────────────────────────────────────────────
-- 자체 전자서명의 약점은 "기록을 가진 쪽이 회사"라는 점이다. 두 장치로 메운다 (2026-11-06 결정).
--  1) 지문(content_hash): 서명 순간 내용·서명 그림·시각을 묶어 SHA-256. 한 글자라도 바뀌면 안 맞는다.
--     chain_hash 는 바로 앞 서명 건의 chain_hash 와 이어 붙인 값 — 한 건만 몰래 바꾸거나 빼기 어렵다.
--  2) 잠금(trigger): 서명 완료된 줄은 관리자 키로도 고치거나 지울 수 없다. 내용을 바꾸려면 새 링크로 다시 서명.

ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS content_hash TEXT;   -- 이 건의 지문
ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS prev_hash    TEXT;   -- 앞 건의 chain_hash
ALTER TABLE labor_contracts ADD COLUMN IF NOT EXISTS chain_hash   TEXT;   -- sha256(prev_hash : content_hash)

CREATE OR REPLACE FUNCTION labor_contracts_lock_signed() RETURNS trigger AS $$
BEGIN
  IF OLD.status = '서명완료' THEN
    RAISE EXCEPTION '서명이 끝난 계약서는 고치거나 지울 수 없습니다 (id=%). 새 링크로 다시 서명받으세요.', OLD.id;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_labor_contracts_lock ON labor_contracts;
CREATE TRIGGER trg_labor_contracts_lock
  BEFORE UPDATE OR DELETE ON labor_contracts
  FOR EACH ROW EXECUTE FUNCTION labor_contracts_lock_signed();

CREATE INDEX IF NOT EXISTS idx_labor_contracts_signed ON labor_contracts(signed_at DESC) WHERE status = '서명완료';
