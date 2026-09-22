// 어떤 모델을 쓰는지는 여기 한 곳에서만 정한다.
// 화면에 적는 이름을 따로 손으로 써두면, 모델을 바꿨을 때 코드는 바뀌고 화면은
// 옛날 것을 말하게 된다. 서버(호출)와 화면(표시)이 같은 값을 보게 묶어둔다.
//
// ※ 이 파일은 화면 컴포넌트도 import 하므로 무거운 것을 두지 말 것
//   (지침 본문은 lib/ai/prompt.ts 에 따로 있다)

/** API 에 실제로 보내는 모델 id */
export const MODEL = 'claude-opus-5'

/** 화면에 적는 이름 */
export const MODEL_LABEL = 'CLAUDE OPUS 5'
