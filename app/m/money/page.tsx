import type { Metadata } from 'next'
import MoneyContent from '@/components/mobile/MoneyContent'

export const metadata: Metadata = { title: '돈 한 눈 | 가디어스' }

export default function MobileMoneyPage() {
  return <MoneyContent />
}
