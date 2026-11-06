-- 025. 서명 계약서 보존 규칙 다듬기 (024 보완)
-- ─────────────────────────────────────────────────────────
-- 024 의 잠금은 "서명 완료 줄은 못 고치고 못 지운다"였다. 그대로 두면 두 가지가 막힌다.
--  · 배정이나 행사를 지우면 FK CASCADE 가 서명 줄까지 지우려다 트리거에 걸려 배정 삭제 자체가 실패한다.
--  · 시험 삼아 서명한 줄을 정리할 길이 없다.
-- 그래서
--  1) 배정·행사가 지워져도 서명 계약서는 남긴다(ON DELETE SET NULL). 근로계약서는 3년 보존 대상이라 맞는 방향이다.
--     이름·내용·서명은 줄 안에 통째로 있으므로 배정이 없어져도 읽을 수 있다.
--  2) 트리거는 FK 가 비우는 갱신(assignment_id·inquiry_id·staff_id 만 NULL 로)은 통과시킨다.
--  3) SQL 편집기에서 일부러 켤 때만 삭제를 허용한다 — 시험 데이터 정리용. 앱(API)에서는 절대 켜지 않는다.
--     BEGIN; SET LOCAL app.allow_contract_delete = 'on'; DELETE FROM labor_contracts WHERE id = '...'; COMMIT;

ALTER TABLE labor_contracts ALTER COLUMN assignment_id DROP NOT NULL;
ALTER TABLE labor_contracts DROP CONSTRAINT IF EXISTS labor_contracts_assignment_id_fkey;
ALTER TABLE labor_contracts
  ADD CONSTRAINT labor_contracts_assignment_id_fkey
  FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION labor_contracts_lock_signed() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> '서명완료' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- 서명 완료 줄
  IF TG_OP = 'DELETE' THEN
    IF current_setting('app.allow_contract_delete', true) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION '서명이 끝난 계약서는 지울 수 없습니다 (id=%). 시험 데이터면 SQL 에서 app.allow_contract_delete 를 켜고 지우세요.', OLD.id;
  END IF;

  -- FK 가 비우는 갱신만 허용: 연결 키 셋을 뺀 나머지가 그대로여야 한다
  IF (to_jsonb(NEW) - 'assignment_id' - 'inquiry_id' - 'staff_id' - 'updated_at')
     = (to_jsonb(OLD) - 'assignment_id' - 'inquiry_id' - 'staff_id' - 'updated_at')
     AND (NEW.assignment_id IS NULL OR NEW.assignment_id = OLD.assignment_id)
     AND (NEW.inquiry_id   IS NULL OR NEW.inquiry_id   = OLD.inquiry_id)
     AND (NEW.staff_id     IS NULL OR NEW.staff_id     = OLD.staff_id) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '서명이 끝난 계약서는 고칠 수 없습니다 (id=%). 새 링크로 다시 서명받으세요.', OLD.id;
END;
$$ LANGUAGE plpgsql;
