import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/cn'

export const Menu = DropdownMenu.Root
export const MenuTrigger = DropdownMenu.Trigger

export function MenuContent({ className, ...props }: DropdownMenu.DropdownMenuContentProps) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        sideOffset={6}
        align="end"
        className={cn(
          'z-50 min-w-44 rounded-md border border-border bg-surface p-1 text-sm text-foreground shadow-[var(--shadow)]',
          className,
        )}
        {...props}
      />
    </DropdownMenu.Portal>
  )
}

export function MenuItem({ className, ...props }: DropdownMenu.DropdownMenuItemProps) {
  return (
    <DropdownMenu.Item
      className={cn(
        'flex cursor-default select-none items-center rounded-[4px] px-2.5 py-1.5 outline-none data-[disabled]:pointer-events-none data-[disabled]:text-muted data-[highlighted]:bg-hover',
        className,
      )}
      {...props}
    />
  )
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="my-1 h-px bg-border" />
}
