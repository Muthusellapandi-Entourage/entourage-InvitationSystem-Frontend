import { Monitor, Moon, Sun } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/Menu'
import { cn } from '@/lib/cn'
import { useTheme, type ThemePreference } from '@/stores/themeStore'

const options: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

export function ThemeMenu() {
  const { preference, resolved, setPreference } = useTheme()
  const Icon = resolved === 'dark' ? Moon : Sun

  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton aria-label="Theme">
          <Icon className="size-4" aria-hidden="true" />
        </IconButton>
      </MenuTrigger>
      <MenuContent>
        {options.map((option) => (
          <MenuItem key={option.value} onSelect={() => setPreference(option.value)}>
            {option.value === 'system' ? <Monitor className="mr-2 size-4" aria-hidden="true" /> : null}
            {option.value === 'light' ? <Sun className="mr-2 size-4" aria-hidden="true" /> : null}
            {option.value === 'dark' ? <Moon className="mr-2 size-4" aria-hidden="true" /> : null}
            <span className={cn(preference === option.value && 'font-medium')}>{option.label}</span>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  )
}
