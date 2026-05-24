-- !! 이 파일은 더 이상 실행하지 않아도 됩니다 !!
-- settlements 테이블을 inquiry_id로 연결하여 사용하는 방식으로 변경됨
-- estimates 컬럼 추가만 필요 (아래 ALTER TABLE만 실행하면 됨)

-- [참고용] closings 테이블 정의 (실행 불필요)
-- CREATE TABLE IF NOT EXISTS closings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_code         TEXT,                          -- CON-YYYYMMDD-XXXX
  inquiry_id           UUID REFERENCES inquiries(id) ON DELETE SET NULL,
  estimate_id          UUID REFERENCES estimates(id) ON DELETE SET NULL,
  customer_id          UUID REFERENCES customers(id) ON DELETE SET NULL,

  -- 기본 계약 정보
  company_name         TEXT,
  final_amount         NUMERIC DEFAULT 0,
  closing_date         DATE,
  status               TEXT DEFAULT '체결완료',

  -- 세금계산서 발행 정보
  tax_type             TEXT DEFAULT '세금계산서',    -- 세금계산서/계산서/영수증/선발행/미발행
  tax_biz_number       TEXT,                          -- 사업자등록번호
  tax_company          TEXT,                          -- 상호
  tax_ceo              TEXT,                          -- 대표자명
  tax_biz_type         TEXT,                          -- 업태
  tax_biz_item         TEXT,                          -- 종목
  tax_address          TEXT,                          -- 사업장 주소
  tax_email            TEXT,                          -- 전자세금계산서 수신 이메일
  tax_issue_date       DATE,                          -- 발행 예정일
  tax_issued_at        DATE,                          -- 실제 발행일
  tax_status           TEXT DEFAULT '미발행',         -- 미발행/발행완료/오류
  tax_memo             TEXT,                          -- 내부 메모

  -- 계약서 발송
  contract_sent        BOOLEAN DEFAULT false,
  contract_sent_date   DATE,
  contract_sent_method TEXT,                          -- 이메일/카카오/우편/직접전달
  contract_signed      BOOLEAN DEFAULT false,

  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

-- estimates 테이블에 복수견적 지원 컬럼 추가 (이미 있으면 무시)
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS version_label TEXT DEFAULT 'A안',
  ADD COLUMN IF NOT EXISTS is_final      BOOLEAN DEFAULT false;

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_closings_updated_at ON closings;
CREATE TRIGGER set_closings_updated_at
  BEFORE UPDATE ON closings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
