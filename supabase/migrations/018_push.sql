-- 018. 휴대폰 푸시 알림
-- ─────────────────────────────────────────────────────────
-- push_subscriptions: 알림을 켠 휴대폰(브라우저) 하나가 한 줄. endpoint 가 곧 그 기기.
-- push_config: VAPID 키 한 쌍. 서버가 처음 쓸 때 만들어 넣는다 — 환경변수 설정이 필요 없다.
-- 둘 다 /api/db 화이트리스트에 넣지 않는다. 전용 라우트(/api/push/*)만 admin 으로 읽고 쓴다.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint     TEXT NOT NULL UNIQUE,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  user_agent   TEXT,
  label        TEXT,                 -- 사람이 알아볼 이름 (예: 사장님 아이폰)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_ok_at   TIMESTAMPTZ,          -- 마지막으로 성공한 발송
  failed_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS push_config (
  id            TEXT PRIMARY KEY DEFAULT 'default',
  vapid_public  TEXT NOT NULL,
  vapid_private TEXT NOT NULL,
  subject       TEXT NOT NULL,       -- 푸시 서비스에 알려주는 발신 주체 (사이트 주소)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 아침 요약을 같은 날 두 번 보내지 않기 위한 기록
CREATE TABLE IF NOT EXISTS push_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       TEXT NOT NULL,          -- digest | checkin | field_log | test
  dedupe_key TEXT UNIQUE,            -- 예: digest:2026-10-28
  title      TEXT,
  body       TEXT,
  sent       INTEGER NOT NULL DEFAULT 0,
  failed     INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
