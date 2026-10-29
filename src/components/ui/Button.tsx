import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/**
 * Charcoal & Mint Teal action hierarchy:
 * - primary: the one filled mint-teal action per view
 * - secondary: thin hairline outline on the surface
 * - ghost: flat text action
 * - danger: soft rose text with a hairline outline, never a loud fill
 */
const variants = {
  primary: 'bg-accent text-accent-foreground font-medium hover:bg-accent-hover',
  secondary: 'border border-border bg-surface text-foreground hover:bg-hover',
  ghost: 'text-foreground hover:bg-hover',
  danger: 'border border-border bg-transparent text-danger hover:bg-danger-soft hover:border-danger/60',
} as const

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants
}

export function buttonClassName(variant: keyof typeof variants = 'primary', className?: string) {
  return cn(
    'inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-sm font-medium transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50',
    variants[variant],
    className,
  )
}

export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClassName(variant, className)} {...props} />
}
