import {
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Palette,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { NumberField } from '@/components/ui/NumberField'
import { TextField } from '@/components/ui/TextField'
import type { GroupVertical, GuestBand, GuestFieldDesign, InvitationDesign, InvitationFont, TextAlign } from '@/invitations/design'
import { ChoiceCards, ColorSwatchField, Disclosure, InfoNote, Segmented, Switch } from '../designerControls'
import { NameBackgroundSettings, TypeSettings } from '../GuestStyling'

export type SampleGuest = { name: string; title: string }

type GreetingStyle = 'classic' | 'modern' | 'minimal'

const greetingStyles: Record<
  GreetingStyle,
  { label: string; name: { font: InvitationFont; weight: 'bold' | 'regular' }; title: { font: InvitationFont; weight: 'bold' | 'regular' }; preview: string }
> = {
  classic: { label: 'Classic', name: { font: 'Manifa Bold', weight: 'bold' }, title: { font: 'Manifa Italic', weight: 'regular' }, preview: '"Manifa Bold", Georgia, serif' },
  modern: { label: 'Modern', name: { font: 'Arial', weight: 'bold' }, title: { font: 'Arial', weight: 'regular' }, preview: 'Arial, Helvetica, sans-serif' },
  minimal: { label: 'Minimal', name: { font: 'Georgia', weight: 'regular' }, title: { font: 'Georgia', weight: 'regular' }, preview: 'Georgia, "Times New Roman", serif' },
}

const greetingDescriptions: Record<GreetingStyle, string> = {
  classic: 'Formal and professional',
  modern: 'Clean and contemporary',
  minimal: 'Simple and elegant',
}

const alignOptions: { value: TextAlign; label: string; icon: ReactNode; title: string }[] = [
  { value: 'left', label: 'Left', icon: <TextAlignStart />, title: 'Align text to the left of the band' },
  { value: 'center', label: 'Center', icon: <TextAlignCenter />, title: 'Center text in the band' },
  { value: 'right', label: 'Right', icon: <TextAlignEnd />, title: 'Align text to the right of the band' },
]

const verticalOptions: { value: GroupVertical; label: string; icon: ReactNode; title: string }[] = [
  { value: 'top', label: 'Top', icon: <AlignVerticalJustifyStart />, title: 'Place text at the top of the band' },
  { value: 'middle', label: 'Middle', icon: <AlignVerticalJustifyCenter />, title: 'Place text in the middle of the band' },
  { value: 'bottom', label: 'Bottom', icon: <AlignVerticalJustifyEnd />, title: 'Place text at the bottom of the band' },
]

function weightOf(field: GuestFieldDesign) {
  return field.weight ?? (field.font === 'Manifa Bold' ? 'bold' : 'regular')
}

export function GuestStep({
  design,
  band,
  sample,
  onSample,
  onChange,
  updateGuest,
  updateBand,
}: {
  design: InvitationDesign
  band: GuestBand
  sample: SampleGuest
  onSample: (sample: SampleGuest) => void
  onChange: (design: InvitationDesign) => void
  updateGuest: (key: 'guestName' | 'guestPosition', patch: Partial<GuestFieldDesign>) => void
  updateBand: (patch: Partial<GuestBand>) => void
}) {
  const [more, setMore] = useState(false)
  const name = design.guestName
  const title = design.guestPosition
  const currentStyle =
    (Object.keys(greetingStyles) as GreetingStyle[]).find((key) => {
      const style = greetingStyles[key]
      return style.name.font === name.font && weightOf(name) === style.name.weight && style.title.font === title.font
    }) ?? null

  function applyStyle(key: GreetingStyle) {
    const style = greetingStyles[key]
    onChange({
      ...design,
      guestName: { ...name, font: style.name.font, weight: style.name.weight },
      guestPosition: { ...title, font: style.title.font, weight: style.title.weight },
    })
  }

  return (
    <div className="grid gap-5">
      <div className="rounded-md bg-accent-soft px-3 py-2.5">
        <InfoNote>Names are filled in for each guest. These details are for your preview only.</InfoNote>
      </div>
      <div className="grid gap-3">
        <h3 className="text-sm font-medium">Sample guest</h3>
        <TextField label="Guest name" value={sample.name} onChange={(event) => onSample({ ...sample, name: event.target.value })} />
        <TextField label="Job title (optional)" value={sample.title} onChange={(event) => onSample({ ...sample, title: event.target.value })} />
      </div>
      <ChoiceCards<GreetingStyle>
        label="Greeting style"
        value={currentStyle}
        onChange={applyStyle}
        options={(Object.keys(greetingStyles) as GreetingStyle[]).map((key) => ({
          value: key,
          label: greetingStyles[key].label,
          description: greetingDescriptions[key],
          preview: (
            <span aria-hidden="true" className="mb-1.5 block w-full truncate leading-tight" style={{ fontFamily: greetingStyles[key].preview }}>
              <span className="block text-[13px]" style={{ fontWeight: greetingStyles[key].name.weight === 'bold' ? 700 : 400 }}>
                Dear {sample.name.trim() || 'Guest'},
              </span>
              {title.enabled ? (
                <span className="block text-[10px] text-muted" style={{ fontStyle: key === 'classic' ? 'italic' : 'normal' }}>
                  {sample.title.trim() || 'Job title'}
                </span>
              ) : null}
            </span>
          ),
        }))}
      />
      <Switch
        checked={title.enabled}
        label="Show job title"
        description="Include the guest's job title under their name."
        onChange={(enabled) => updateGuest('guestPosition', { enabled })}
      />
      <div className="grid grid-cols-2 gap-3">
        <ColorSwatchField
          label="Text color"
          value={name.color}
          onChange={(color) => onChange({ ...design, guestName: { ...name, color }, guestPosition: { ...title, color } })}
        />
        <ColorSwatchField
          label="Background color"
          value={name.backgroundColor ?? '#FFFFFF'}
          none={!name.nameBackground}
          onNone={() => updateGuest('guestName', { nameBackground: false })}
          onChange={(backgroundColor) =>
            updateGuest('guestName', {
              nameBackground: true,
              backgroundColor,
              backgroundOpacity: name.nameBackground ? name.backgroundOpacity : 100,
              padX: name.padX || 12,
              padY: name.padY || 6,
            })
          }
        />
      </div>
      <Disclosure
        icon={<Palette className="size-4" aria-hidden="true" />}
        title="More styling options"
        open={more}
        onToggle={() => setMore((value) => !value)}
      >
        <section className="grid gap-3">
          <h3 className="text-sm font-medium">Guest band</h3>
          <p className="text-sm text-muted">The band spans the full width. Drag it on the invitation or set exact values.</p>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Height"
              min={48}
              max={800}
              value={band.height}
              onChange={(height) => {
                if (height !== null) updateBand({ height })
              }}
            />
            <NumberField
              label="Space above"
              min={0}
              max={2000}
              value={band.y}
              hint="Under the header"
              onChange={(y) => {
                if (y !== null) updateBand({ y })
              }}
            />
          </div>
          <div className="grid gap-3">
            <Segmented label="Text alignment in the band" value={band.align} options={alignOptions} onChange={(align) => updateBand({ align })} />
            <Segmented label="Vertical placement in the band" value={band.valign} options={verticalOptions} onChange={(valign) => updateBand({ valign })} />
            <p className="-mt-1 text-xs text-muted">These align the greeting inside the guest band, not the band on the invitation.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Name to title gap"
              min={0}
              max={80}
              value={band.spacing}
              onChange={(spacing) => {
                if (spacing !== null) updateBand({ spacing })
              }}
            />
            <NumberField
              label="Side margin"
              min={0}
              max={120}
              value={band.inset}
              onChange={(inset) => {
                if (inset !== null) updateBand({ inset })
              }}
            />
          </div>
        </section>
        <section className="grid gap-3 border-t border-border pt-4">
          <h3 className="text-sm font-medium">Guest name</h3>
          <TypeSettings field={name} onChange={(patch) => updateGuest('guestName', patch)} />
          <NumberField
            label="Size on a phone"
            min={8}
            max={48}
            value={name.mobileFontSize}
            onChange={(mobileFontSize) => {
              if (mobileFontSize !== null) updateGuest('guestName', { mobileFontSize })
            }}
          />
        </section>
        {title.enabled ? (
          <section className="grid gap-3 border-t border-border pt-4">
            <h3 className="text-sm font-medium">Job title</h3>
            <TypeSettings field={title} onChange={(patch) => updateGuest('guestPosition', patch)} />
            <NumberField
              label="Size on a phone"
              min={8}
              max={48}
              value={title.mobileFontSize}
              onChange={(mobileFontSize) => {
                if (mobileFontSize !== null) updateGuest('guestPosition', { mobileFontSize })
              }}
            />
          </section>
        ) : null}
        <section className="grid gap-3 border-t border-border pt-4">
          <h3 className="text-sm font-medium">Name background</h3>
          <NameBackgroundSettings field={name} onChange={(patch) => updateGuest('guestName', patch)} />
        </section>
      </Disclosure>
    </div>
  )
}
