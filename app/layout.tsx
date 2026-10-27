import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'sonner'
import ViewportToggle from '@/components/layout/ViewportToggle'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Gradius ERP',
  description: '인력파견 통합 ERP 시스템',
  applicationName: '가디어스 ERP',
  // 홈 화면 추가(PWA). 설정은 app/manifest.ts, 아이콘은 public/
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-icon.png',   // 아이폰은 manifest 아이콘을 안 쓴다 — 이 태그가 있어야 한다
  },
  appleWebApp: {
    capable: true,
    title: '가디어스',
    statusBarStyle: 'default',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#111827',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className={inter.className}>
        {children}
        <ViewportToggle />
        <Toaster
          position="top-right"
          richColors
          duration={3500}
          toastOptions={{
            style: { fontFamily: 'Malgun Gothic, 맑은 고딕, sans-serif' },
          }}
        />
      </body>
    </html>
  )
}
