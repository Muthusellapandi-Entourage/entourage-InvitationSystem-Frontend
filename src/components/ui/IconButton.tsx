import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export function IconButton({ className, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-hover hover:text-foreground',
        className,
      )}
      {...props}
    />
  )
}
