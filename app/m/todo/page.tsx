import type { Metadata } from 'next'
import TodoContent from '@/components/mobile/TodoContent'

export const metadata: Metadata = { title: '할 일 | 가디어스' }

export default function MobileTodoPage() {
  return <TodoContent />
}
