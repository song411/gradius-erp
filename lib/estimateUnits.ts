// 견적 품목의 단위 표기
// ─────────────────────────────────────────────────────────
// 금액은 어디서나 quantity × days × unit_price 로 계산한다. 단위는 표시용
// 글자일 뿐이라 계산에 끼어들지 않는다.
//
// 기본값은 명 / 일이고, DB에 값이 없으면(NULL/빈칸) 기본값으로 읽는다.
// 그래서 단위를 건드리지 않은 기존 견적서는 지금과 똑같이 나온다.

export const DEFAULT_QTY_UNIT  = '명'
export const DEFAULT_DAYS_UNIT = '일'

/** 자주 쓰는 단위 — 직접 입력도 되므로 목록에 없어도 된다 */
export const QTY_UNIT_PRESETS  = ['명', '개', '대', '팀', '식', '세트', '건', '차량']
export const DAYS_UNIT_PRESETS = ['일', '회', '시간', '박', '주', '개월']

export const qtyUnit  = (u?: string | null) => (u ?? '').trim() || DEFAULT_QTY_UNIT
export const daysUnit = (u?: string | null) => (u ?? '').trim() || DEFAULT_DAYS_UNIT

/** 출력 견적서의 '일수' 열 제목.
 *  모든 품목이 기본 단위(일)면 '일수' 그대로 둔다 — 대부분의 견적서가 여기 걸리므로
 *  고객이 받는 문서가 갑자기 달라지지 않는다.
 *  회·시간처럼 다른 단위가 섞인 견적서만 '단위'로 바꿔, 열 제목과 칸이 어긋나
 *  ('일수' 열에 4회) 읽히는 걸 막는다. */
export function daysColumnHeader(units: Array<string | null | undefined>): string {
  return units.every(u => daysUnit(u) === DEFAULT_DAYS_UNIT) ? '일수' : '단위'
}

/** 이 품목이 '일수'가 아닌 단위를 쓰는지.
 *  행사 일수 일괄 적용에서 이런 품목은 건드리지 않는다 (4회를 3일로 덮어쓰면 안 된다). */
export const hasCustomDaysUnit = (u?: string | null) => daysUnit(u) !== DEFAULT_DAYS_UNIT
