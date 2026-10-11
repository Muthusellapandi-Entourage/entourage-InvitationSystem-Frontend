import { Button } from '@/components/ui/Button'
import { NumberField } from '@/components/ui/NumberField'
import { SelectField } from '@/components/ui/SelectField'
import { invitationFonts, type FontWeight, type GuestFieldDesign } from '@/invitations/design'
import { ColorSwatchField } from './designerControls'

export function TypeSettings({
  field,
  onChange,
}: {
  field: GuestFieldDesign
  onChange: (patch: Partial<GuestFieldDesign>) => void
}) {
  const weight = field.weight ?? (field.font === 'Manifa Bold' ? 'bold' : 'regular')
  return (
    <div className="grid gap-3">
      <SelectField
        label="Font"
        hint="Manifa is used when that font is installed."
        value={field.font}
        options={invitationFonts.map((font) => ({ value: font, label: font }))}
        onChange={(event) => onChange({ font: event.target.value as GuestFieldDesign['font'] })}
      />
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Size"
          min={8}
          max={72}
          value={field.fontSize}
          onChange={(fontSize) => {
            if (fontSize !== null) onChange({ fontSize })
          }}
        />
        <SelectField
          label="Weight"
          value={weight}
          options={[
            { value: 'regular', label: 'Regular' },
            { value: 'bold', label: 'Bold' },
          ]}
          onChange={(event) => onChange({ weight: event.target.value as FontWeight })}
        />
      </div>
      <ColorSwatchField label="Text color" value={field.color} onChange={(color) => onChange({ color })} />
    </div>
  )
}

export function NameBackgroundSettings({
  field,
  onChange,
}: {
  field: GuestFieldDesign
  onChange: (patch: Partial<GuestFieldDesign>) => void
}) {
  if (!field.nameBackground) {
    return (
      <Button
        variant="secondary"
        onClick={() =>
          onChange({
            nameBackground: true,
            backgroundColor: field.backgroundColor ?? '#FFFFFF',
            backgroundOpacity: 100,
            padX: field.padX || 12,
            padY: field.padY || 6,
          })
        }
      >
        Add name background
      </Button>
    )
  }
  return (
    <div className="grid gap-3">
      <NumberField
        label="Background opacity"
        min={0}
        max={100}
        value={field.backgroundOpacity}
        hint="100 is solid. Outlook shows a solid mix of this color."
        onChange={(backgroundOpacity) => {
          if (backgroundOpacity !== null) onChange({ backgroundOpacity })
        }}
      />
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Background padding"
          min={0}
          max={80}
          value={field.padX}
          hint="Left and right"
          onChange={(padX) => {
            if (padX !== null) onChange({ padX })
          }}
        />
        <NumberField
          label="Vertical padding"
          min={0}
          max={80}
          value={field.padY}
          hint="Above and below"
          onChange={(padY) => {
            if (padY !== null) onChange({ padY })
          }}
        />
      </div>
      <Button variant="ghost" className="justify-self-start" onClick={() => onChange({ nameBackground: false })}>
        Remove background
      </Button>
    </div>
  )
}
