import * as React from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link'
  size?: 'sm' | 'md' | 'lg' | 'icon'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none',
          {
            'bg-blue-600 text-white hover:bg-blue-700': variant === 'default',
            'bg-gray-100 text-gray-800 hover:bg-gray-200': variant === 'secondary',
            'bg-red-600 text-white hover:bg-red-700': variant === 'destructive',
            'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50': variant === 'outline',
            'text-gray-600 hover:bg-gray-100': variant === 'ghost',
            'text-blue-600 underline-offset-4 hover:underline': variant === 'link',
          },
          {
            'h-8 px-3 text-xs': size === 'sm',
            'h-10 px-4 text-sm': size === 'md',
            'h-11 px-6 text-base': size === 'lg',
            'h-9 w-9 p-0': size === 'icon',
          },
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'
