-- 견적 품목 단위 표기 (수량 / 일수)
--
-- 계산식은 그대로 수량 × 일수 × 단가다. 바뀌는 건 화면과 출력 견적서에 찍히는
-- 단위 글자뿐이다. 일반 규격을 벗어나는 견적(예: 안전교육 4회)에서 고객이 받는
-- 문서가 '4일'로 잘못 읽히지 않게 하려고 넣는다.
--
-- NULL = 기본값(명 / 일). 기존 견적은 전부 NULL이므로 지금 나가는 문서가
-- 한 글자도 바뀌지 않는다. 단위를 손으로 넣은 품목만 다르게 찍힌다.

ALTER TABLE estimate_items
  ADD COLUMN IF NOT EXISTS quantity_unit TEXT,
  ADD COLUMN IF NOT EXISTS days_unit     TEXT;
