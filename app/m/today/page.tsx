import type { Metadata } from 'next'
import TodayContent from '@/components/today/TodayContent'

export const metadata: Metadata = { title: '오늘 현장 | 가디어스' }

export default function MobileTodayPage() {
  return <TodayContent />
}
