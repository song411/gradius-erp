import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Gradius ERP',
  description: '인력파견 통합 ERP 시스템',
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
