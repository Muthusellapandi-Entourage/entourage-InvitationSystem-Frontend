import { ArrowLeft } from 'lucide-react'
import { useId, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiBaseUrl } from '@/api/client'
import { Button, buttonClassName } from '@/components/ui/Button'
import { SelectField } from '@/components/ui/SelectField'
import { Skeleton } from '@/components/ui/Skeleton'
import { TextField } from '@/components/ui/TextField'
import {
  invitationFonts,
  type GuestFieldDesign,
  type InvitationDesign,
  type TextAlign,
} from '@/invitations/design'
import { buildInvitationTable, renderInvitationHtml, wrapInvitationDocument } from '@/invitations/emailHtml'
import { useInvitationDocument } from '@/invitations/useInvitationDocument'
import { cn } from '@/lib/cn'
import type { InvitationResponseItem } from '@/types/invitation'
import { formatTimestamp } from '@/utils/dates'

const steps = [
  { id: 'header', label: 'Header' },
  { id: 'guest', label: 'Guest' },
  { id: 'event', label: 'Event' },
  { id: 'rsvp', label: 'RSVP' },
  { id: 'preview', label: 'Preview' },
] as const

type StepId = (typeof steps)[number]['id']

export type AssetSlot = 'header' | 'details' | 'accept' | 'decline'

const alignOptions = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
]

type InvitationDesignerProps = {
  eventId: string
  eventName: string
  slug: string
  published: boolean
  design: InvitationDesign
  onChange: (design: InvitationDesign) => void
  uploading: AssetSlot | null
  onUpload: (slot: AssetSlot, file: File) => void
  saving: boolean
  onSave: () => void
  replies: InvitationResponseItem[] | undefined
  repliesLoading: boolean
}

export function InvitationDesigner({
  eventId,
  eventName,
  slug,
  published,
  design,
  onChange,
  uploading,
  onUpload,
  saving,
  onSave,
  replies,
  repliesLoading,
}: InvitationDesignerProps) {
  const [step, setStep] = useState<StepId>('header')
  const [openField, setOpenField] = useState<'guestName' | 'guestPosition' | null>('guestName')
  const [hidePosition, setHidePosition] = useState(false)
  const table = useMemo(() => buildInvitationTable(design), [design])
  const previewHtml = useMemo(
    () =>
      renderInvitationHtml(wrapInvitationDocument(table, design), {
        guestName: 'Sara Ahmed',
        guestPosition: hidePosition ? '' : 'Senior Manager',
        acceptUrl: '#',
        declineUrl: '#',
        assetOrigin: apiBaseUrl,
      }),
    [design, hidePosition, table],
  )
  useInvitationDocument(table)

  function setAsset(slot: AssetSlot, assetId: string | null) {
    const key = {
      header: 'headerAssetId',
      details: 'detailsAssetId',
      accept: 'acceptAssetId',
      decline: 'declineAssetId',
    } satisfies Record<AssetSlot, keyof InvitationDesign>
    onChange({ ...design, [key[slot]]: assetId })
  }

  function updateGuest(key: 'guestName' | 'guestPosition', patch: Partial<GuestFieldDesign>) {
    onChange({ ...design, [key]: { ...design[key], ...patch } })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <Link
          to={`/events/${eventId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">Create invitation</h1>
        <Button onClick={onSave} disabled={saving || uploading !== null}>
          {saving ? 'Saving…' : 'Save template'}
        </Button>
      </header>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="order-2 min-h-0 overflow-auto border-b border-border lg:order-1 lg:border-r lg:border-b-0">
          <nav aria-label="Invitation steps" className="px-3 py-4">
            <ol className="grid gap-1">
              {steps.map((item) => {
                const current = item.id === step
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={current ? 'step' : undefined}
                      onClick={() => setStep(item.id)}
                      className={cn(
                        'flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-left text-sm',
                        current ? 'bg-selected font-medium' : 'text-muted hover:bg-hover hover:text-foreground',
                      )}
                    >
                      <span
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          current ? 'bg-foreground' : 'border border-current',
                        )}
                        aria-hidden="true"
                      />
                      {item.label}
                    </button>
                  </li>
                )
              })}
            </ol>
          </nav>
          <div className="border-t border-border px-4 py-5">
            {step === 'header' ? (
              <ImageStep
                title="Header image"
                description="Upload your invitation header image."
                hint="Recommended: 560px wide. WEBP, PNG, or JPG."
                assetId={design.headerAssetId}
                uploading={uploading === 'header'}
                onUpload={(file) => onUpload('header', file)}
                onRemove={() => setAsset('header', null)}
              />
            ) : null}
            {step === 'guest' ? (
              <div className="grid gap-6">
                <div>
                  <h2 className="text-base font-semibold">Guest information</h2>
                  <p className="mt-2 text-sm text-muted">
                    The preview uses Sara Ahmed, Senior Manager. A guest without a position skips that line.
                  </p>
                </div>
                <GuestRow
                  label="Guest name"
                  tag="GuestName"
                  topLabel="Top padding"
                  field={design.guestName}
                  open={openField === 'guestName'}
                  onToggle={() => setOpenField((current) => (current === 'guestName' ? null : 'guestName'))}
                  onChange={(patch) => updateGuest('guestName', patch)}
                />
                <GuestRow
                  label="Guest position"
                  tag="GuestPosition"
                  topLabel="Top spacing"
                  field={design.guestPosition}
                  open={openField === 'guestPosition'}
                  onToggle={() => setOpenField((current) => (current === 'guestPosition' ? null : 'guestPosition'))}
                  onChange={(patch) => updateGuest('guestPosition', patch)}
                />
              </div>
            ) : null}
            {step === 'event' ? (
              <ImageStep
                title="Event information"
                description="Upload your event details image."
                hint="Put the date, time, and venue in this image. Recommended: 560px wide. WEBP, PNG, or JPG."
                assetId={design.detailsAssetId}
                uploading={uploading === 'details'}
                onUpload={(file) => onUpload('details', file)}
                onRemove={() => setAsset('details', null)}
              />
            ) : null}
            {step === 'rsvp' ? (
              <div className="grid gap-8">
                <div>
                  <h2 className="text-base font-semibold">RSVP buttons</h2>
                  <p className="mt-2 text-sm text-muted">
                    The uploaded images are the buttons. Leave one out if this invitation only needs a single reply.
                  </p>
                </div>
                <ImageStep
                  title="Accept button"
                  description="Upload the accept image."
                  assetId={design.acceptAssetId}
                  uploading={uploading === 'accept'}
                  onUpload={(file) => onUpload('accept', file)}
                  onRemove={() => setAsset('accept', null)}
                  action="Accept invitation"
                />
                <ImageStep
                  title="Decline button"
                  description="Upload the decline image."
                  assetId={design.declineAssetId}
                  uploading={uploading === 'decline'}
                  onUpload={(file) => onUpload('decline', file)}
                  onRemove={() => setAsset('decline', null)}
                  action="Decline invitation"
                />
              </div>
            ) : null}
            {step === 'preview' ? (
              <PreviewNotes
                hidePosition={hidePosition}
                positionEnabled={design.guestPosition.enabled}
                onHidePosition={setHidePosition}
                slug={slug}
                published={published}
                eventName={eventName}
                replies={replies}
                repliesLoading={repliesLoading}
              />
            ) : null}
          </div>
        </aside>
        <section className="order-1 h-[32rem] bg-[#e8e8e4] lg:sticky lg:top-14 lg:order-2 lg:h-[calc(100dvh-3.5rem)]" aria-label="Invitation preview">
          <iframe
            title="Invitation preview"
            className="h-full w-full border-0 bg-[#e8e8e4]"
            sandbox=""
            srcDoc={previewHtml}
          />
        </section>
      </div>
    </div>
  )
}

function ImageStep({
  title,
  description,
  hint,
  assetId,
  uploading,
  onUpload,
  onRemove,
  action,
}: {
  title: string
  description: string
  hint?: string
  assetId: string | null
  uploading: boolean
  onUpload: (file: File) => void
  onRemove: () => void
  action?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onUpload(file)
  }

  return (
    <div className="grid gap-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted">{description}</p>
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/webp,image/png,image/jpeg"
        className="sr-only"
        onChange={choose}
      />
      {assetId ? (
        <img
          src={`${apiBaseUrl}/api/public/assets/${assetId}`}
          alt=""
          className="max-h-28 w-full bg-[#313131] object-contain"
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? 'Uploading…' : assetId ? 'Replace image' : 'Upload image'}
        </Button>
        {assetId ? (
          <Button variant="ghost" onClick={onRemove} disabled={uploading}>
            Remove image
          </Button>
        ) : null}
      </div>
      {hint ? <p className="text-sm text-muted">{hint}</p> : null}
      {action ? (
        <p className="text-sm">
          <span className="text-muted">Action</span>
          <span className="mt-1 block">{action}</span>
        </p>
      ) : null}
    </div>
  )
}

function GuestRow({
  label,
  tag,
  topLabel,
  field,
  open,
  onToggle,
  onChange,
}: {
  label: string
  tag: string
  topLabel: string
  field: GuestFieldDesign
  open: boolean
  onToggle: () => void
  onChange: (patch: Partial<GuestFieldDesign>) => void
}) {
  const checkboxId = useId()
  return (
    <div className="border-t border-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <button type="button" className="text-sm font-medium" aria-expanded={open} onClick={onToggle}>
          {label}
        </button>
        <label htmlFor={checkboxId} className="inline-flex items-center gap-2 text-sm">
          <input
            id={checkboxId}
            type="checkbox"
            className="size-4 accent-accent"
            checked={field.enabled}
            onChange={(event) => onChange({ enabled: event.target.checked })}
          />
          Enabled
        </label>
      </div>
      {open ? (
        <div className="mt-4 grid gap-3">
          <TextField label="Dynamic tag" value={tag} readOnly />
          <SelectField
            label="Font"
            hint="Manifa is used when that font is installed."
            value={field.font}
            options={invitationFonts.map((font) => ({ value: font, label: font }))}
            onChange={(event) => onChange({ font: event.target.value as GuestFieldDesign['font'] })}
          />
          <TextField
            label="Font size"
            type="number"
            min={8}
            max={72}
            value={field.fontSize}
            onChange={(event) => onChange({ fontSize: clampNumber(event.target.value, field.fontSize, 8, 72) })}
          />
          <TextField
            label="Mobile font size"
            type="number"
            min={8}
            max={48}
            value={field.mobileFontSize}
            onChange={(event) =>
              onChange({ mobileFontSize: clampNumber(event.target.value, field.mobileFontSize, 8, 48) })
            }
          />
          <ColorField value={field.color} onChange={(color) => onChange({ color })} />
          <SelectField
            label="Alignment"
            value={field.alignment}
            options={alignOptions}
            onChange={(event) => onChange({ alignment: event.target.value as TextAlign })}
          />
          <TextField
            label="Left padding"
            type="number"
            min={0}
            max={160}
            value={field.leftPadding}
            hint="Pixels"
            onChange={(event) => onChange({ leftPadding: clampNumber(event.target.value, field.leftPadding, 0, 160) })}
          />
          <TextField
            label={topLabel}
            type="number"
            min={0}
            max={120}
            value={field.topSpacing}
            hint="Pixels"
            onChange={(event) => onChange({ topSpacing: clampNumber(event.target.value, field.topSpacing, 0, 120) })}
          />
        </div>
      ) : null}
    </div>
  )
}

function ColorField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId()
  const [draft, setDraft] = useState(value)
  const shown = draft === value ? value : draft
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        Color
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label="Color swatch"
          value={/^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#FFFFFF'}
          className="size-10 shrink-0 cursor-pointer rounded-md border border-border bg-surface p-1"
          onChange={(event) => {
            const next = event.target.value.toUpperCase()
            setDraft(next)
            onChange(next)
          }}
        />
        <input
          id={id}
          value={shown}
          spellCheck={false}
          className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
          onChange={(event) => {
            const next = event.target.value.toUpperCase()
            setDraft(next)
            if (/^#[0-9A-FA-F]{6}$/.test(next)) onChange(next)
          }}
          onBlur={() => setDraft(value)}
        />
      </div>
    </div>
  )
}

function PreviewNotes({
  hidePosition,
  positionEnabled,
  onHidePosition,
  slug,
  published,
  eventName,
  replies,
  repliesLoading,
}: {
  hidePosition: boolean
  positionEnabled: boolean
  onHidePosition: (value: boolean) => void
  slug: string
  published: boolean
  eventName: string
  replies: InvitationResponseItem[] | undefined
  repliesLoading: boolean
}) {
  const [copied, setCopied] = useState(false)
  const guestPath = `/invite/${slug}`
  const checkboxId = useId()

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${guestPath}`)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-base font-semibold">Preview</h2>
        <p className="mt-2 text-sm text-muted">
          Sample guest for {eventName}: Dear Sara Ahmed, Senior Manager. A shared link says Dear Guest until a guest
          name is filled in.
        </p>
      </div>
      {positionEnabled ? (
        <label htmlFor={checkboxId} className="inline-flex items-center gap-2 text-sm">
          <input
            id={checkboxId}
            type="checkbox"
            className="size-4 accent-accent"
            checked={hidePosition}
            onChange={(event) => onHidePosition(event.target.checked)}
          />
          Guest has no position
        </label>
      ) : null}
      {published ? (
        <a href={guestPath} target="_blank" rel="noreferrer" className={buttonClassName('secondary')}>
          Open guest page
        </a>
      ) : (
        <p className="text-sm text-muted">Guests can open the page after this event is active.</p>
      )}
      <button type="button" className="w-fit text-sm text-muted underline-offset-4 hover:underline" onClick={() => void copyLink()}>
        {copied ? 'Link copied' : 'Copy guest link'}
      </button>
      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-medium">Replies</h3>
        {repliesLoading ? (
          <Skeleton className="mt-3 h-12 w-full" />
        ) : replies && replies.length > 0 ? (
          <table className="mt-3 w-full text-left text-sm">
            <caption className="sr-only">Invitation replies</caption>
            <thead className="text-muted">
              <tr className="border-b border-border">
                <th scope="col" className="py-2 pr-3 font-medium">Name</th>
                <th scope="col" className="py-2 font-medium">Reply</th>
              </tr>
            </thead>
            <tbody>
              {replies.map((reply) => (
                <tr key={reply.id} className="border-b border-border">
                  <th scope="row" className="py-2 pr-3 text-left font-medium">
                    {reply.guestName}
                  </th>
                  <td className="py-2">
                    {reply.status === 'Accepted' ? 'Accepted' : 'Declined'}
                    <span className="mt-0.5 block text-muted tabular-nums">{formatTimestamp(reply.createdOn)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-2 text-sm text-muted">No replies yet.</p>
        )}
      </div>
    </div>
  )
}

function clampNumber(value: string, fallback: number, min: number, max: number) {
  if (value.trim() === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}
