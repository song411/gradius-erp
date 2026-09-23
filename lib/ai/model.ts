// 어떤 모델로, 얼마나 깊게 생각할지 — 여기 한 곳에서만 정한다.
// 화면에 적는 이름을 따로 손으로 써두면, 모델을 바꿨을 때 코드는 바뀌고 화면은
// 옛날 것을 말하게 된다. 서버(호출)와 화면(표시)이 같은 값을 보게 묶어둔다.
//
// ※ 이 파일은 화면 컴포넌트도 import 하므로 무거운 것을 두지 말 것
//   (지침 본문은 lib/ai/prompt.ts 에 따로 있다)

export interface ModelOption {
  /** API 에 실제로 보내는 모델 id */
  id: string
  /** 헤더에 적는 이름 */
  label: string
  /** 고르는 버튼에 적는 짧은 이름 */
  short: string
  /** 언제 쓰는 것인지 */
  desc: string
}

/** 고를 수 있는 모델. 여기 없는 id 는 서버가 받지 않는다. */
export const MODELS: ModelOption[] = [
  {
    id: 'claude-opus-5',
    label: 'CLAUDE OPUS 5',
    short: 'OPUS',
    desc: '판단이 걸린 일 — 인력 추천·견적·비교',
  },
  {
    id: 'claude-sonnet-5',
    label: 'CLAUDE SONNET 5',
    short: 'SONNET',
    desc: '빠르고 싼 쪽 — 단순 조회·요약',
  },
]

export const DEFAULT_MODEL = MODELS[0].id

/** 화면 밖에서 온 값을 그대로 믿지 않는다 — 목록에 없으면 기본값 */
export function resolveModel(id?: unknown): ModelOption {
  return MODELS.find(m => m.id === id) ?? MODELS[0]
}

export interface EffortOption {
  /** output_config.effort 에 보내는 값 */
  id: 'low' | 'high' | 'xhigh' | 'max'
  short: string
  desc: string
}

/** 얼마나 오래 생각하게 할 것인가.
 *
 *  깊게 갈수록 답이 나오기까지 오래 걸리고 비용도 오른다. 그래서 기본은 '보통'이고,
 *  사람을 고르거나 금액을 따지는 자리에서만 '깊게'로 올려 쓰는 것을 전제로 한다. */
export const EFFORTS: EffortOption[] = [
  { id: 'low',   short: '빠르게', desc: '단순 조회 — 숫자만 물을 때' },
  { id: 'high',  short: '보통',   desc: '기본값 — 대부분의 질문' },
  { id: 'xhigh', short: '깊게',   desc: '인력 추천·견적 비교처럼 따져볼 게 많을 때' },
  { id: 'max',   short: '최대',   desc: '끝까지 따진다. 느리고 비싸다' },
]

export const DEFAULT_EFFORT: EffortOption['id'] = 'high'

export function resolveEffort(id?: unknown): EffortOption {
  return EFFORTS.find(e => e.id === id) ?? EFFORTS[1]
}

/** 예전 이름 — 아직 이걸 읽는 화면이 있어 남겨둔다 */
export const MODEL = DEFAULT_MODEL
export const MODEL_LABEL = MODELS[0].label
