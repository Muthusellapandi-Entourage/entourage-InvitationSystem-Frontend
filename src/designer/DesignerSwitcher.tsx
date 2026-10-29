import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, ExternalLink } from 'lucide-react'
import { accApi } from '@/api/accreditationApi'
import { guestTypeApi } from '@/api/guestTypeApi'
import { useDesignerLeave } from '@/designer/DesignerShell'

/* "Designing: Printed badge · VIP ▾" — jump between every designer of the event (or accreditation). */

export type DesignerKind = 'invitation' | 'pass' | 'printed' | 'microsite' | 'rsvp' | 'registration' | 'kiosk' | 'accBadge'

type Entry = { key: string; label: string; to: string; external?: boolean }
type Group = { title: string; entries: Entry[] }

function SwitcherMenu({ current, title, groups }: { current: string; title: string; groups: Group[] }) {
  const leave = useDesignerLeave()
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex max-w-[22rem] items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-hover"
          title="Switch to another design"
        >
          <span className="truncate text-sm font-semibold">{title}</span>
          <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 max-h-[70vh] w-72 overflow-y-auto rounded-md border border-border bg-surface p-1 text-sm text-foreground"
        >
          {groups.map((group, index) => (
            <div key={group.title}>
              {index > 0 ? <DropdownMenu.Separator className="my-1 h-px bg-border" /> : null}
              <DropdownMenu.Label className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted">{group.title}</DropdownMenu.Label>
              {group.entries.map((entry) => (
                <DropdownMenu.Item
                  key={entry.key}
                  onSelect={() => {
                    if (entry.key !== current) leave(entry.to)
                  }}
                  className="flex cursor-default select-none items-center gap-2 rounded-[4px] px-2.5 py-1.5 outline-none data-[highlighted]:bg-hover"
                >
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                  {entry.key === current ? <Check className="size-4 shrink-0 text-accent" aria-hidden="true" /> : null}
                  {entry.external ? <ExternalLink className="size-3.5 shrink-0 text-muted" aria-hidden="true" /> : null}
                </DropdownMenu.Item>
              ))}
            </div>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

const kindLabel: Record<Exclude<DesignerKind, 'accBadge'>, string> = {
  invitation: 'Invitation',
  pass: 'Digital pass',
  printed: 'Printed badge',
  microsite: 'Microsite',
  rsvp: 'Responses page',
  registration: 'Self-registration page',
  kiosk: 'Self check-in screen',
}

/** Every designer of an event: invitation, digital pass and printed badge per guest category, the microsite, and the page settings. */
export function EventDesignerSwitcher({
  eventId,
  kind,
  guestTypeId,
  guestTypeName,
}: {
  eventId: string
  kind: Exclude<DesignerKind, 'accBadge'>
  guestTypeId?: string
  guestTypeName?: string
}) {
  const types = useQuery({ queryKey: ['guest-types', eventId], queryFn: () => guestTypeApi.list(eventId) })
  const current = `${kind}:${guestTypeId ?? ''}`
  const title = guestTypeName ? `${kindLabel[kind]} · ${guestTypeName}` : kindLabel[kind]
  const categories = types.data ?? []
  const groups: Group[] = [
    ...(categories.length
      ? [
          {
            title: 'Invitations',
            entries: categories.map((type) => ({ key: `invitation:${type.id}`, label: type.name, to: `/events/${eventId}/guest-types/${type.id}/invitation` })),
          },
          {
            title: 'Digital passes',
            entries: categories.map((type) => ({ key: `pass:${type.id}`, label: type.name, to: `/events/${eventId}/guest-types/${type.id}/badge` })),
          },
          {
            title: 'Printed badges',
            entries: categories.map((type) => ({ key: `printed:${type.id}`, label: type.name, to: `/events/${eventId}/guest-types/${type.id}/print-badge` })),
          },
        ]
      : []),
    {
      title: 'Event pages',
      entries: [
        { key: 'microsite:', label: 'Microsite', to: `/events/${eventId}/microsite` },
        { key: 'rsvp:', label: 'Responses page', to: `/events/${eventId}/rsvp/design` },
        { key: 'registration:', label: 'Self-registration page', to: `/events/${eventId}/registration/design` },
        { key: 'kiosk:', label: 'Self check-in screen', to: `/events/${eventId}/check-in/design` },
      ],
    },
    {
      title: 'Leave the designers',
      entries: [
        { key: 'designs', label: 'All designs', to: `/events/${eventId}/designs` },
        { key: 'responses', label: 'Responses (replies)', to: `/events/${eventId}/rsvp` },
        { key: 'seating', label: 'Seating plan', to: `/events/${eventId}/seating` },
      ],
    },
  ]
  return <SwitcherMenu current={current} title={title} groups={groups} />
}

/** Every badge template of an accreditation event. */
export function AccDesignerSwitcher({ accEventId, templateId, templateName }: { accEventId: string; templateId: string; templateName: string }) {
  const templates = useQuery({ queryKey: ['acc', 'badge-templates', accEventId], queryFn: () => accApi.badgeTemplates(accEventId) })
  const groups: Group[] = [
    {
      title: 'Accreditation badges',
      entries: (templates.data ?? []).map((template) => ({
        key: template.id,
        label: template.name + (template.isDefault ? ' (default)' : ''),
        to: `/accreditation/${accEventId}/badges/${template.id}`,
      })),
    },
    {
      title: 'Accreditation',
      entries: [
        { key: 'list', label: 'All badge templates', to: `/accreditation/${accEventId}/badges` },
        { key: 'print', label: 'Print queue', to: `/accreditation/${accEventId}/print` },
      ],
    },
  ]
  return <SwitcherMenu current={templateId} title={`Accreditation badge · ${templateName}`} groups={groups} />
}
