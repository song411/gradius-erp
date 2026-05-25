'use client'

import { motion } from 'framer-motion'
import { usePathname } from 'next/navigation'

// AnimatePresence mode="wait"는 Next.js App Router와 타이밍 충돌이 발생할 수 있음
// exit 애니메이션 없이 enter만 적용하여 안정적으로 동작하도록 수정
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <motion.div
      key={pathname}
      className="flex flex-col h-full"
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}
