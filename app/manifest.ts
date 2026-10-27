import type { MetadataRoute } from 'next'

// 홈 화면에 추가(PWA) 설정. /manifest.webmanifest 로 나간다.
// 브라우저가 쿠키 없이 가져가므로 proxy.ts 의 PUBLIC_PATHS 에 열려 있어야 한다.
// 앱 아이콘으로 열면 휴대폰 전용 '오늘 현장'(/today) 으로 바로 간다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '가디어스 ERP — 오늘 현장',
    short_name: '가디어스',
    description: '현장에서 보는 이번 주 행사·크루·한 줄 기록',
    start_url: '/m/today',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'ko',
    background_color: '#f9fafb',
    theme_color: '#111827',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
