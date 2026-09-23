-- ============================================================
-- 가디(AI 비서) 사용 기록
-- Supabase Dashboard > SQL Editor 에서 실행
-- ============================================================
-- Anthropic Console 의 청구서는 '하루에 얼마'만 알려준다. 그것으로는
-- 어느 질문이 비쌌는지를 알 수 없다. 여기에는 질문 한 번마다 한 줄이 쌓인다.
--
-- 이 표는 '보는 값'이다. 계산이나 정산에 쓰지 않는다.
-- (금액도 우리가 usage 로 되짚은 어림값이고, 정확한 청구는 Console 쪽이 정답이다)

CREATE TABLE IF NOT EXISTS ai_usage (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  model        TEXT NOT NULL,            -- claude-opus-5 / claude-sonnet-5
  effort       TEXT,                     -- low / high / xhigh / max
  turns        INT  NOT NULL DEFAULT 1,  -- 도구를 몇 번 돌았나

  input_tokens          INT NOT NULL DEFAULT 0,
  output_tokens         INT NOT NULL DEFAULT 0,
  cache_write_tokens    INT NOT NULL DEFAULT 0,
  cache_read_tokens     INT NOT NULL DEFAULT 0,

  cost_usd     NUMERIC(10, 6) NOT NULL DEFAULT 0,
  cost_krw     NUMERIC(12, 2) NOT NULL DEFAULT 0,

  -- 어떤 질문이었는지 앞부분만 (무엇이 비싼지 되짚기 위한 것)
  question     TEXT,
  tools        TEXT[]                    -- 이번에 부른 도구 이름들
);

COMMENT ON TABLE  ai_usage IS '가디 사용 기록 — 보기 전용. 정산에 쓰지 않는다';
COMMENT ON COLUMN ai_usage.cost_krw IS '어림 환산값(1달러=1,400원 기준). 정확한 청구는 Anthropic Console';
COMMENT ON COLUMN ai_usage.question IS '질문 앞부분만 저장 (최대 200자)';

-- 이번 달 얼마 썼나 — 가장 잦은 조회
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage (created_at DESC);
