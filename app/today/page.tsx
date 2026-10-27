import { redirect } from 'next/navigation'

// 예전 주소. 휴대폰 틀(/m)로 옮겼다 — 홈 화면에 추가해 둔 사람이 있을 수 있어 넘겨준다
export default function TodayPage() {
  redirect('/m/today')
}
