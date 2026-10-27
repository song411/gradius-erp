import type { Metadata } from 'next'
import MobileSearchContent from '@/components/mobile/MobileSearchContent'

export const metadata: Metadata = { title: '검색 | 가디어스' }

export default function MobileSearchPage() {
  return <MobileSearchContent />
}
