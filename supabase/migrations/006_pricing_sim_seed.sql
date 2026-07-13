-- 가디어스 단가 시뮬레이터 (스마트연구소) — 11개 직종 초기 데이터
-- 출처: 첨부_시뮬레이터_v3.html JOBS 객체
-- 전부 is_published = false로 시작 — 스마트연구소에서 검토 후 발행해야 견적서 작성 화면에 노출됨
-- "팀장·수퍼바이저" 계열 가산은 roles.leader_bonus로 매핑 (EstimateBuilder가 이미 이 필드로 팀장 토글을 지원함)
-- factors.add_pay_price는 원본 calcPrice()의 "크루 지급가 = 기본 지급가 + 가산 합계 * 0.7" 규칙을 항목별로 반영한 값(add_price*0.7)

DO $$
DECLARE
  v_staff UUID; v_parking UUID; v_safety UUID; v_promoter UUID; v_narrator UUID;
  v_mascot UUID; v_docent UUID; v_mc UUID; v_protocol UUID; v_driver UUID; v_guard UUID;
BEGIN
  -- 1. 행사 진행요원
  INSERT INTO roles (role_code, role_name, base_price, pay_price, leader_bonus, fixed_costs, is_published)
  VALUES ('staff','행사 진행요원',135000,85000,35000,
    '[{"l":"현장 매니저 배치비(안분)","a":8000},{"l":"영업배상책임보험 상각","a":3000}]'::jsonb, false)
  RETURNING id INTO v_staff;

  INSERT INTO factors (role_id, factor_name, add_price, add_pay_price, level, alert) VALUES
    (v_staff,'야외 행사 (날씨·체력 소모)',10000,7000,'★',NULL),
    (v_staff,'8시간 초과 연장 근무',15000,10500,'★',NULL),
    (v_staff,'야간 투입 (22:00 이후)',20000,14000,'★',NULL),
    (v_staff,'외국어 커뮤니케이션 필요',30000,21000,'★',NULL),
    (v_staff,'야외+여름 폭염(35도+) — 2인 교대조 필수',100000,70000,'★★','법적 의무'),
    (v_staff,'식대 미제공',10000,7000,'★',NULL),
    (v_staff,'지방 파견 (서울 외)',30000,21000,'★',NULL);

  INSERT INTO guides (role_id, consult_points, market_avg_price, competitor_price) VALUES
    (v_staff,'가디어스 13~14만원 · 지킴 스탭팀장 16만원 · G360 12~16.5만원',133000,130000);

  -- 2. 주차/발렛요원
  INSERT INTO roles (role_code, role_name, base_price, pay_price, leader_bonus, fixed_costs, is_published)
  VALUES ('parking','주차/발렛요원',148000,92000,0,
    '[{"l":"현장 매니저 배치비","a":8000},{"l":"보험 상각","a":3000}]'::jsonb, false)
  RETURNING id INTO v_parking;

  INSERT INTO factors (role_id, factor_name, add_price, add_pay_price, level, alert) VALUES
    (v_parking,'야외 주차장 (날씨 노출)',10000,7000,'★',NULL),
    (v_parking,'발렛 파킹 (차량 직접 운전)',30000,21000,'★',NULL),
    (v_parking,'고급 차량 발렛 (수입차)',50000,35000,'★★','보험 필수'),
    (v_parking,'야외+여름 폭염 교대조',100000,70000,'★★','법적 의무'),
    (v_parking,'야간 투입 (22:00 이후)',20000,14000,'★',NULL),
    (v_parking,'8시간 초과',15000,10500,'★',NULL);

  INSERT INTO guides (role_id, consult_points, market_avg_price, competitor_price) VALUES
    (v_parking,'가디어스 14~15.5만원 · 지킴 15만원 · G360 13~18만원',148000,150000);

  -- 3. 안전요원
  INSERT INTO roles (role_code, role_name, base_price, pay_price, leader_bonus, fixed_costs, is_published)
  VALUES ('safety','안전요원',140000,100000,0,
    '[{"l":"현장 매니저 배치비","a":8000},{"l":"보험 상각","a":3000}]'::jsonb, false)
  RETURNING id INTO v_safety;

  INSERT INTO factors (role_id, factor_name, add_price, add_pay_price, level, alert) VALUES
    (v_safety,'CPR/AED 자격증 보유자 요구',18000,12600,'★',NULL),
    (v_safety,'야외 행사 배치',12000,8400,'★',NULL),
    (v_safety,'수상 안전 자격 보유자 (워터파크·해변)',35000,24500,'★★',NULL),
    (v_safety,'야외+여름 폭염 교대조',100000,70000,'★★','법적 의무'),
    (v_safety,'군중 통제·신체 제지 포함 → 경비업 해당',50000,35000,'★★','허가 필요'),
    (v_safety,'야간 투입 (22:00 이후)',20000,14000,'★',NULL),
    (v_safety,'위험 현장 (집단민원·충돌 예상)',80000,56000,'★★','고위험');

  INSERT INTO guides (role_id, consult_points, market_avg_price, competitor_price) VALUES
    (v_safety,'가디어스 14~16.5만원 · 지킴 14만원 · G360 12.5만원',133000,140000);

  -- 4. 프로모터
  INSERT INTO roles (role_code, role_name, base_price, pay_price, leader_bonus, fixed_costs, is_published)
  VALUES ('promoter','프로모터',180000,115000,0,
    '[{"l":"현장 매니저 배치비","a":8000},{"l":"보험 상각","a":3000}]'::jsonb, false)
  RETURNING id INTO v_promoter;

  INSERT INTO factors (role_id, factor_name, add_price, add_pay_price, level, alert) VALUES
    (v_promoter,'외모·이미지 기준 있음',15000,10500,'★',NULL),
    (v_promoter,'판매 멘트·세일즈 스킬 필요',30000,21000,'★★',NULL),
    (v_promoter,'전문 지식 필요 (제품 설명회)',45000,31500,'★★',NULL),
    (v_promoter,'외국어 커뮤니케이션',40000,28000,'★★',NULL),
    (v_promoter,'8시간 초과 / 야간 투입',20000,14000,'★',NULL),
    (v_promoter,'의상 노출 수위 있음 (사전 협의 필수)',10000,7000,'★','협의 필수'),
    (v_promoter,'야외 행사 (폭염 노출)',12000,8400,'★',NULL);

  INSERT INTO guides (role_id, consult_points, market_avg_price, competitor_price) VALUES
    (v_promoter,'가디어스 16~18만원 · 지킴 18만원 · G360 18~22만원',196000,180000);

  -- 5. 나레이터
  INSERT INTO roles (role_code, role_name, base_price, pay_price, leader_bonus, fixed_costs, is_published)
  VALUES ('narrator','나레이터',220000,135000,0,
    '[{"l":"매니저 배치비","a":5000}]'::jsonb, false)
  RETURNING id INTO v_narrator;

  INSERT INTO factors (role_id, factor_name, add_price, add_pay_price, level, alert) VALUES
    (v_narrator,'경력 3년 이상 또는 A등급',80000,56000,'★',NULL),
    (v_narrator,'메인 무대 (수백 명 이상)',80000,56000,'★',NULL),
    (v_narrator,'대형 모터쇼·IT전시 메인',300000,210000,'★★',NULL),
    (v_narrator,'영어 나레이션 또는 이중언어',100000,70000,'★',NULL),
    (v_narrator,'스크립트 연구·암기 필요 (기술 제품)',20000,14000,'★',NULL),
    (v_narrator,'사전 미팅 필요',30000,21000,'★',NULL);
  -- comp 데이터 없음(원본 comp:null) → guides 행 생략

  -- 6. 인형탈 요원
  INSERT INTO roles (role_code, role_name, base_price, pay_price, leader_bonus, fixed_costs, is_published)
  VALUES ('mascot','인형탈 요원',390000,240000,0,
    '[{"l":"매니저 배치비(2인 안분)","a":10000}]'::jsonb, false)
  RETURNING id INTO v_mascot;

  INSERT INTO factors (role_id, factor_name, add_price, add_pay_price, level, alert) VALUES
    (v_mascot,'야외 행사 (온도 상승)',60000,42000,'★',NULL),
    (v_mascot,'여름 야외 (체감 35도+)',120000,84000,'★★','열사병 위험'),
    (v_mascot,'퍼포먼스 동작 연기 포함',40000,28000,'★',NULL),
    (v_mascot,'8시간 이상 운용 (추가 교대팀)',200000,140000,'★★','추가 2인'),
    (v_mascot,'냉각 장비비 (여름 야외)',20000,14000,'★',NULL);

  INSERT INTO guides (role_id, consult_points, market_avg_price, competitor_price) VALUES
    (v_mascot,'가디어스 19~21만원(1인환산) · 지킴 20만원 · G360 18~24만원 · 2인1조 기준 실 청구는 2배',205000,200000);

  -- 7. 도슨트
  INSERT INTO roles (role_code, role_name, base_price, pay_price, leader_bonus, fixed_costs, is_published)
  VALUES ('docent','도슨트',200000,90000,0,
    '[{"l":"사전 현장방문비(안분)","a":5000}]'::jsonb, false)
  RETURNING id INTO v_docent;

  INSERT INTO factors (role_id, factor_name, add_price, add_pay_price, level, alert) VALUES
    (v_docent,'스크립트 자체 연구·작성 필요',30000,21000,'★',NULL),
    (v_docent,'하루 3회 이상 투어 반복',20000,14000,'★',NULL),
    (v_docent,'전문 분야 지식 (과학·역사·예술)',35000,24500,'★',NULL),
    (v_docent,'외국어 도슨트 (영어·중국어)',100000,70000,'★★',NULL),
    (v_docent,'어린이·교육 대상 해설',15000,10500,'★',NULL);

  INSERT INTO guides (role_id, consult_points, market_avg_price, competitor_price) VALUES
    (v_docent,'가디어스 20만원 · 지킴 20만원 · G360 20~40만원 · 시장평균이 높은 이유: 대형전시 고급 도슨트 포함',267000,200000);

  -- 8. MC (사회자)
  INSERT INTO roles (role_code, role_name, base_price, pay_price, leader_bonus, fixed_costs, is_published)
  VALUES ('mc','MC (사회자)',350000,200000,0,'[]'::jsonb, false)
  RETURNING id INTO v_mc;

  INSERT INTO factors (role_id, factor_name, add_price, add_pay_price, level, alert) VALUES
    (v_mc,'100명 이상 기업 행사·컨퍼런스',150000,105000,'★',NULL),
    (v_mc,'500명 이상 대형 행사·시상식',400000,280000,'★★',NULL),
    (v_mc,'사전 대본 작성·기획 참여',50000,35000,'★',NULL),
    (v_mc,'영어 또는 한영 이중 진행',150000,105000,'★',NULL),
    (v_mc,'리허설 참가 요청',50000,35000,'★',NULL),
    (v_mc,'특수 분야 (의학·IT 등 전문 행사)',80000,56000,'★',NULL);
  -- comp 데이터 없음(원본 comp:null) → guides 행 생략

  -- 9. 의전도우미
  INSERT INTO roles (role_code, role_name, base_price, pay_price, leader_bonus, fixed_costs, is_published)
  VALUES ('protocol','의전도우미',250000,145000,0,
    '[{"l":"현장 매니저 배치비","a":8000},{"l":"보험 상각","a":3000}]'::jsonb, false)
  RETURNING id INTO v_protocol;

  INSERT INTO factors (role_id, factor_name, add_price, add_pay_price, level, alert) VALUES
    (v_protocol,'유니폼·헤어·메이크업 본인 준비',20000,14000,'★',NULL),
    (v_protocol,'외국어 의전 (영어·중국어)',60000,42000,'★',NULL),
    (v_protocol,'외국어 + VIP 수행 의전',100000,70000,'★★',NULL),
    (v_protocol,'8시간 초과 / 야간 투입',25000,17500,'★',NULL),
    (v_protocol,'하이힐 장시간 착용 환경',10000,7000,'★',NULL);

  INSERT INTO guides (role_id, consult_points, market_avg_price, competitor_price) VALUES
    (v_protocol,'가디어스 25만원 · 지킴 25만원 · G360 20~26만원 · 가디어스는 시장 상단',242000,250000);

  -- 10. 수행기사
  INSERT INTO roles (role_code, role_name, base_price, pay_price, leader_bonus, fixed_costs, is_published)
  VALUES ('driver','수행기사',215000,140000,0,
    '[{"l":"NDA 법무 관리비","a":5000},{"l":"보험 상각","a":3000}]'::jsonb, false)
  RETURNING id INTO v_driver;

  INSERT INTO factors (role_id, factor_name, add_price, add_pay_price, level, alert) VALUES
    (v_driver,'대형 SUV·리무진·고급 외제차',30000,21000,'★',NULL),
    (v_driver,'10시간 초과 (시간당 추가)',15000,10500,'★',NULL),
    (v_driver,'1박 2일 이상 장거리 수행',100000,70000,'★★',NULL),
    (v_driver,'새벽 출발 또는 야간 귀착',40000,28000,'★',NULL),
    (v_driver,'외국어 커뮤니케이션',40000,28000,'★',NULL),
    (v_driver,'VIP 보안 수행 (경호 성격 포함)',80000,56000,'★★',NULL);

  INSERT INTO guides (role_id, consult_points, market_avg_price, competitor_price) VALUES
    (v_driver,'가디어스 25만원(8H) · G360 수행경호 25~35만원 · 수행기사 단독 공개 데이터 제한적',270000,NULL);

  -- 11. 경호원
  INSERT INTO roles (role_code, role_name, base_price, pay_price, leader_bonus, fixed_costs, is_published)
  VALUES ('guard','경호원',200000,130000,0,
    '[{"l":"현장 매니저 배치비","a":10000},{"l":"영업배상책임보험","a":5000},{"l":"NDA 법무비","a":5000}]'::jsonb, false)
  RETURNING id INTO v_guard;

  INSERT INTO factors (role_id, factor_name, add_price, add_pay_price, level, alert) VALUES
    (v_guard,'신변보호(개인 경호)',40000,28000,'★','배치 전 신고 필수'),
    (v_guard,'위험도 B등급(협박·분쟁 이력)',40000,28000,'★',NULL),
    (v_guard,'위험도 A등급(실질적 위협)',90000,63000,'★★',NULL),
    (v_guard,'정장 착용 요구(VIP 의전 성격)',15000,10500,'★',NULL),
    (v_guard,'야간·새벽 투입',25000,17500,'★',NULL),
    (v_guard,'집단민원현장(충돌 예상)',100000,70000,'★★','48H전 허가'),
    (v_guard,'배치신고 행정 처리(모든 경호 발생)',20000,14000,'기본',NULL),
    (v_guard,'결격사유 조회·관리',5000,3500,'기본',NULL),
    (v_guard,'신임교육 이수 확인·상각',3000,2100,'기본',NULL);

  INSERT INTO guides (role_id, consult_points, market_avg_price, competitor_price) VALUES
    (v_guard,'가디어스 18~22만원 · 지킴 신변보호 22만원 · G360 18~30만원 · 수행경호: 지킴 25만원',200000,220000);

END $$;
