import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const variants = {
  primary: 'bg-accent text-accent-foreground hover:bg-accent-hover',
  secondary: 'border border-border bg-surface text-foreground hover:bg-hover',
  ghost: 'text-foreground hover:bg-hover',
  danger: 'bg-danger text-danger-foreground hover:bg-danger-hover',
} as const

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants
}

export function buttonClassName(variant: keyof typeof variants = 'primary', className?: string) {
  return cn(
    'inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:bg-disabled disabled:text-muted',
    variants[variant],
    className,
  )
}

export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClassName(variant, className)} {...props} />
}
