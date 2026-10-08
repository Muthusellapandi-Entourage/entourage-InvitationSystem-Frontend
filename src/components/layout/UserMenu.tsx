import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { IconButton } from '@/components/ui/IconButton'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/Menu'
import { useAuth } from '@/stores/authStore'

function initials(firstName: string, lastName: string) {
  const letters = `${firstName.charAt(0)}${lastName.charAt(0)}`.trim()
  return (letters || firstName.slice(0, 2) || 'A').toUpperCase()
}

export function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton aria-label="Account menu" className="text-foreground">
          <span aria-hidden="true" className="text-xs font-medium">
            {initials(user?.firstName ?? '', user?.lastName ?? '')}
          </span>
        </IconButton>
      </MenuTrigger>
      <MenuContent>
        <MenuItem onSelect={() => navigate('/profile')}>My profile</MenuItem>
        <MenuItem onSelect={() => navigate('/settings#appearance')}>Preferences</MenuItem>
        <MenuSeparator />
        <MenuItem
          onSelect={() => {
            void logout()
          }}
        >
          <LogOut className="mr-2 size-4" aria-hidden="true" />
          Log out
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
