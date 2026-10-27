# 가디어스 ERP 온보딩

행사 인력 파견 회사(주식회사 가디어스)의 업무 전체를 담는 내부 ERP입니다. 문의가 들어와서 견적을 보내고, 체결되면 크루를 배정하고, 현장을 치르고, 크루에게 지급하고, 고객에게 청구·세금계산서를 발행하기까지가 한 흐름입니다. 사장님 한 분이 PC로 쓰고, 현장에서는 휴대폰 화면(/m)으로 봅니다.

이 문서는 저장소를 이어받아 손보는 사람을 위한 것입니다. 코드가 설명하지 않는 규칙과 함정을 적었습니다. 2026-10-27 기준입니다.

## 1. 10분 만에 돌려보기

- Next.js 16 + Supabase. `AGENTS.md`가 말하듯 이 Next는 아는 버전과 다릅니다. 코드를 쓰기 전에 `node_modules/next/dist/docs/`를 보세요.
- `.env.local`에 Supabase URL, anon 키, service_role 키가 있습니다. 키는 서버 라우트(`app/api/db/[table]/route.ts`)만 씁니다. 브라우저는 그 라우트를 통해서만 DB를 봅니다.
- `npm install` → `npm run dev` → `http://localhost:3000`.
- 화면은 전부 잠겨 있습니다(`proxy.ts`). 쿠키 `erp_access=granted`가 있으면 열립니다. 헤드리스 브라우저나 curl로 시험할 때 이 쿠키를 붙이면 됩니다.
- 휴대폰 화면은 `/m`. 사이드바 없이 탭 다섯 개(현장·할 일·돈·검색·더보기)입니다.
- 배포는 `main`에 push하면 자동입니다. 별도 앱 배포는 없습니다. 휴대폰 "홈 화면에 추가"도 같은 사이트입니다.

## 2. 업무 흐름과 화면

| 단계 | 화면 | 표 |
|---|---|---|
| 문의 접수 | /inquiries, /pipeline(영업 보드) | inquiries |
| 견적 | /estimates (빌더·A안/B안·문자용 견적서) | estimates, estimate_items, estimate_versions |
| 체결 | /closings, /contracts | settlements(정산 행이 체결과 함께 생김) |
| 배정 | /assignments (드래그·추천·공지문·섭외 문구), /schedule(캘린더) | assignments |
| 현장 | /m/today(휴대폰), /field(현장 기록 대기함), /c/[id](크루 셀프 체크인), /attendance | attendances, evaluations, field_logs |
| 지급 | /payouts | payouts, event_expenses |
| 청구·계산서 | /settlements, /ceo(세금계산서 탭) | settlements |
| 경영 | /(대시보드), /ceo, /m/money | 전부 lib/finance 경유 |

문의 상태(`inquiry_status` enum): 접수 → 견적 → 체결 → 배정완료 → 진행중 → 완료 → 정산완료. 그 밖에 미체결·보류·취소. 매출로 세는 것은 체결 이후만입니다.

## 3. 꼭 지켜야 할 규칙

1. **규칙은 lib 한 곳.** 돈은 `lib/finance.ts`, 평가 저장은 `lib/evaluation.ts`, 영업 보드 단계는 `lib/pipeline.ts`, 견적 품목 붙이기는 `lib/estimateItems.ts`, 연장 단가 제안은 `lib/overtime.ts`, 업체 정보 자동채움은 `lib/bizInfo.ts`. 화면에서 같은 계산을 다시 쓰지 마세요. 과거에 화면마다 수익이 달라 사장님이 숫자를 못 믿게 된 적이 있습니다.
2. **돈 표는 사람이 누를 때만 바뀝니다.** 현장 기록(field_logs)은 후보 메모입니다. 저장돼도 지급·견적·배정이 자동으로 바뀌지 않습니다. 대기함의 버튼은 그 화면을 미리 채운 채 새 탭으로 열고, 저장은 그 화면의 규칙으로 사람이 합니다. 부대비용 등록 버튼만 예외입니다.
3. **DB는 `db.list`로만 읽습니다** (`lib/supabase/api.ts`). Supabase REST는 1000행에서 조용히 자르고, in 필터 값이 많으면 주소가 길어져 끊깁니다. `db.list`가 둘 다 알아서 나눠 묻습니다. `limit`은 일부러 제한할 때만. 직접 fetch하지 마세요.
4. **라우트 기본 정렬은 `created_at`인데 그 열이 없는 표가 있습니다** (assignments, evaluations, pricing_history). 라우트의 `DEFAULT_ORDER`가 막아 두었지만, 새 표를 만들면 거기도 적어 주세요. 새 표는 `ALLOWED_TABLES` 화이트리스트에도 넣어야 열립니다.
5. **글자 크기는 `globals.css`의 척도만.** 11px(`text-2xs`)이 바닥입니다. `text-[10px]` 같은 임의값은 쓰지 않습니다.
6. **DB 보정과 코드 배포 순서.** DB만 먼저 고치면 그 사이 데이터가 망가집니다. 급한 수정은 코드를 먼저 배포하고 DB를 손봅니다. 마이그레이션 SQL(`supabase/migrations/`)은 자동 실행되지 않습니다. 사장님이 Supabase SQL Editor에서 직접 돌립니다.

## 4. 데이터 모델에서 헷갈리는 곳

- `inquiries.event_dates`: 띄엄띄엄 열리는 행사의 실제 운영일. 비어 있으면 start~end 전체. 읽을 때는 `eventDatesOf`/`coversDate`(`components/schedule/matrixCore.ts`)만 쓰세요.
- `assignments.work_days`는 사람이 적는 값입니다. 자동 계산하지 마세요. `work_dates`는 어느 날 일했는지 더하는 칸입니다.
- `estimate_items`는 `estimate_id`로 붙입니다. 문의로 붙이면 A안·B안 품목이 섞입니다(실제 사고).
- 견적 부가세 방식은 `estimates.meta_json.vat_mode`. `vat > 0`만으로는 가산과 포함가를 구분할 수 없습니다.
- `settlements.tax_invoice_group`: 같은 번호면 세금계산서 한 장으로 같이 발행한 건. `tax_invoice_issued_at`이 유일한 발행 로그입니다.
- `field_logs.applied_at`이 비어 있으면 사무실에서 아직 안 본 기록. `applied_to`는 어디에 반영했는지(지급·부대비용·배정·견적·정산 등).
- 본사 인원(`lib/finance.ts`의 `HQ_STAFF_NAMES`)에게는 지급이 없습니다. 지급 행이 자동 생성돼도 비용으로 세지 않습니다.

## 5. 휴대폰 틀(/m)

- `app/m/` 아래. `(app)` 그룹 밖이라 사이드바가 안 붙고, 잠금은 그대로입니다.
- 휴대폰에서 하는 일은 확인·전화·문자·한 줄 기록·크루 평가까지. 견적 작성, 배정, 정산서 작성은 PC입니다. 이 선을 넘기지 마세요.
- 문자는 `lib/sms.ts`의 `sms:` 링크입니다. 휴대폰 문자 앱이 문구가 채워진 채 열리고 보내기는 사람이 누릅니다. API·비용 없음.
- `app/manifest.ts`와 `public/icon-*.png`가 홈 화면 추가(PWA)입니다. 브라우저가 쿠키 없이 가져가므로 `proxy.ts`의 `PUBLIC_PATHS`에 열려 있어야 합니다.
- `ViewportToggle`(PC 화면을 휴대폰에서 축소해 보는 버튼)은 `/m`에서 꺼집니다.

## 6. 고치고 나서 확인하는 법

- `npx tsc --noEmit -p .` 통과가 기본입니다.
- `npx eslint <바꾼 파일>`은 기존 오류(effect 안 setState, any)가 이미 있습니다. 바꾸기 전 개수와 비교하세요. `git stash` → eslint → `git stash pop`.
- 실제로 열어 보기: `npx next dev -p 3111` 띄우고, playwright-core로 390px 모바일 뷰포트에 쿠키 `erp_access=granted`를 넣어 페이지를 찍습니다. Chromium은 `~/AppData/Local/ms-playwright/`에 있습니다. 가로 스크롤(`scrollWidth`가 390인지)과 `pageerror`를 같이 봅니다.
- DB를 직접 확인할 때는 `.env.local`의 키로 Supabase REST(`/rest/v1/<표>`)를 부릅니다. 열이 있는지 `select=<열>&limit=1`로 확인하면 400으로 바로 압니다.
- 시험용 데이터를 넣었으면 id로 지우고, 지운 뒤 남은 행이 실제 데이터와 같은지 확인합니다. 지급·평가·견적 저장 버튼은 실제 돈과 평점을 바꾸므로 시험에서 누르지 않습니다.

## 7. 함정

- Git Bash에서 한글을 URL에 넣으면 깨집니다(cp949). 파이썬 `urllib.parse.quote`로 인코딩해 보내세요. enum 오류가 나면 먼저 이것을 의심합니다.
- 파이썬으로 JSON을 읽을 때 `encoding='utf-8'`을 꼭 줍니다. 실행은 `python -I`.
- 줄끝 CRLF 경고는 무시해도 됩니다.
- Supabase에서 "어느 날부터 목록이 안 뜬다"면 행 수(1000)와 in 필터 개수(100)부터 셉니다. 둘 다 데이터가 늘면서 조용히 넘습니다.
- 키는 `.env.local`에만 둡니다. 로그, 커밋 메시지, 문서에 적지 마세요.
- `.next/dev/types`가 지운 파일을 가리켜 tsc가 실패할 수 있습니다. dev 서버를 한 번 띄우면 다시 생성됩니다.

## 8. 지금 상태와 다음 할 일 (2026-10-27)

끝난 것: 휴대폰 틀 다섯 탭, 오늘 현장 화면(크루 전화·평가·한 줄 기록), 홈 화면 추가, 문자 버튼, 현장 기록 → 견적 품목·지급·배정 반영 버튼, 연장 단가 제안, 크루관리·견적 관리 무한 로딩 수정.

열린 것:
- 푸시 알림(새 문의·입금·출석 미기록). 현장 휴대폰이 안드로이드인지 아이폰인지에 따라 설계가 갈립니다.
- 연장 단가의 마지막 규칙(일당 ÷ 8 × 1.5)은 가정입니다. 사장님 확인 전까지 화면에 "확인 필요"가 붙습니다.
- "ERP 밖에서 안으로" 받은함: 카톡 공유·입금 문자·영수증 사진을 던져 넣는 입구.
- 전체 변경 로그(육하원칙 기록).
- 대기함 안에서 바로 지급·배정을 저장하는 더 간편한 길. 그 전에 지급 폼 계산을 lib로 빼야 합니다.

사장님의 결정 사항과 그 이유는 Claude Code 메모리(`~/.claude/projects/.../memory/`)에 쌓여 있습니다. 왜 그렇게 돼 있는지 궁금하면 코드보다 거기를 먼저 보세요.
