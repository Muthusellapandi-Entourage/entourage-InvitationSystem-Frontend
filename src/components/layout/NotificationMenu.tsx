import { Bell } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { Menu, MenuContent, MenuTrigger } from '@/components/ui/Menu'

export function NotificationMenu() {
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton aria-label="Notifications">
          <Bell className="size-4" aria-hidden="true" />
        </IconButton>
      </MenuTrigger>
      <MenuContent className="w-72 p-4">
        <p className="text-sm font-medium">No notifications</p>
        <p className="mt-1 text-sm text-muted">When something needs you, it will show up here.</p>
      </MenuContent>
    </Menu>
  )
}
