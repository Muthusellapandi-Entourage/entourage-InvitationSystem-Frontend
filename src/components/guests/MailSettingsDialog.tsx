import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { mailApi, type MailSettingsWrite } from '@/api/mailApi'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'

type Preset = { label: string; host: string; port: number; enableSsl: boolean }

const presets: Preset[] = [
  { label: 'Microsoft 365 / Outlook', host: 'smtp.office365.com', port: 587, enableSsl: true },
  { label: 'Gmail / Google Workspace', host: 'smtp.gmail.com', port: 587, enableSsl: true },
]

const blank: MailSettingsWrite = {
  provider: 'smtp',
  host: '',
  port: 587,
  enableSsl: true,
  username: '',
  password: '',
  fromEmail: '',
  fromName: '',
  graphTenantId: '',
  graphClientId: '',
  graphClientSecret: '',
}

const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Outgoing email (SMTP) settings used for bulk invitation emails.
 * The saved password is never shown; leave the box empty to keep it.
 */
export function MailSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const queryClient = useQueryClient()
  const settingsQuery = useQuery({ queryKey: ['mail-settings'], queryFn: mailApi.get, enabled: open })
  const [draft, setDraft] = useState<MailSettingsWrite>(blank)
  const [testTo, setTestTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const settings = settingsQuery.data

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setError(null)
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  // Load the saved values once per saved version only, so a background refetch never
  // overwrites what is being typed.
  const loadedVersion = useRef<string | null>(null)
  useEffect(() => {
    if (!settings) return
    const version = settings.updatedOn ?? 'unsaved'
    if (loadedVersion.current === version) return
    loadedVersion.current = version
    setDraft({
      provider: settings.provider === 'graph' ? 'graph' : 'smtp',
      host: settings.host,
      port: settings.port || 587,
      enableSsl: settings.enableSsl,
      username: settings.username ?? '',
      password: '',
      fromEmail: settings.fromEmail,
      fromName: settings.fromName ?? '',
      graphTenantId: settings.graphTenantId ?? '',
      graphClientId: settings.graphClientId ?? '',
      graphClientSecret: '',
    })
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: () =>
      mailApi.save({
        ...draft,
        host: draft.host.trim(),
        username: draft.username?.trim() || null,
        password: draft.password || null,
        fromEmail: draft.fromEmail.trim(),
        fromName: draft.fromName?.trim() || null,
        graphTenantId: draft.graphTenantId?.trim() || null,
        graphClientId: draft.graphClientId?.trim() || null,
        graphClientSecret: draft.graphClientSecret?.trim() || null,
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['mail-settings'], saved)
      setDraft((current) => ({ ...current, password: '', graphClientSecret: '' }))
      setError(null)
      toast.success('Email settings saved.')
    },
    onError: (failure) => setError(messageOf(failure, 'The email settings could not be saved.')),
  })

  const testMutation = useMutation({
    mutationFn: () => mailApi.test(testTo.trim()),
    onSuccess: () => {
      setError(null)
      toast.success(`Test email sent to ${testTo.trim()}. Check that inbox (and spam).`)
    },
    onError: (failure) => setError(messageOf(failure, 'The test email could not be sent.')),
  })

  const busy = saveMutation.isPending || testMutation.isPending
  const graph = draft.provider === 'graph'
  const clientIdInvalid = graph && Boolean(draft.graphClientId?.trim()) && !guidPattern.test(draft.graphClientId!.trim())
  const canSave = graph
    ? Boolean(
        draft.fromEmail.trim() &&
          draft.graphTenantId?.trim() &&
          draft.graphClientId?.trim() &&
          !clientIdInvalid &&
          (draft.graphClientSecret?.trim() || settings?.hasGraphSecret),
      )
    : Boolean(draft.host.trim() && draft.fromEmail.trim() && draft.port > 0)
  const savedProvider = settings?.configured ? settings.provider : null

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="w-[min(36rem,calc(100vw-2rem))]"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div className="max-h-[min(44rem,calc(100vh-2rem))] overflow-y-auto">
      <form
        className="p-5 pb-4"
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault()
          if (canSave) saveMutation.mutate()
        }}
      >
        <h2 id={titleId} className="text-base font-semibold">
          Email settings
        </h2>
        <p className="mt-1 text-sm text-muted">Choose how invitations are sent. Both setups are kept, so you can switch at any time.</p>
        {settingsQuery.isLoading ? <p className="mt-4 text-sm text-muted">Loading…</p> : null}

        <div className="mt-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Sending method">
          {(
            [
              ['graph', 'Microsoft 365 (Graph)', 'Company mailbox. Works when SMTP is blocked.'],
              ['smtp', 'SMTP', 'Gmail, or any server that allows SMTP sign-in.'],
            ] as const
          ).map(([value, title, hint]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={draft.provider === value}
              className={
                draft.provider === value
                  ? 'rounded-md border border-accent bg-accent-soft p-3 text-left text-sm'
                  : 'rounded-md border border-border p-3 text-left text-sm hover:bg-hover'
              }
              onClick={() => setDraft({ ...draft, provider: value })}
            >
              <span className="block font-medium">
                {title}
                {savedProvider === value ? <span className="ml-1.5 text-xs font-normal text-accent">· in use</span> : null}
              </span>
              <span className="block text-xs text-muted">{hint}</span>
            </button>
          ))}
        </div>

        {graph ? (
          <>
            <details className="mt-4 rounded-md border border-border p-3 text-sm">
              <summary className="cursor-pointer font-medium">What your IT admin needs to do (once)</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
                <li>
                  In the Azure portal → <b>Microsoft Entra ID</b> → <b>App registrations</b> → <b>New registration</b>. Name it e.g. “Entourage
                  Invitations”.
                </li>
                <li>
                  <b>API permissions</b> → Add → Microsoft Graph → <b>Application permissions</b> → <b>Mail.Send</b> → then <b>Grant admin consent</b>.
                </li>
                <li>
                  <b>Certificates &amp; secrets</b> → New client secret → copy its <b>Value</b> (not the Secret ID).
                </li>
                <li>
                  From the app&apos;s <b>Overview</b>, copy the <b>Directory (tenant) ID</b> and <b>Application (client) ID</b>.
                </li>
                <li>Recommended: limit the app to the sending mailbox with an Exchange application access policy.</li>
              </ol>
            </details>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <TextField
                label="Directory (tenant) ID"
                name="graph-tenant"
                autoComplete="off"
                spellCheck={false}
                data-lpignore="true"
                placeholder="xxxxxxxx-xxxx-… or entourageintl.com"
                value={draft.graphTenantId ?? ''}
                onChange={(event) => setDraft({ ...draft, graphTenantId: event.target.value })}
              />
              <TextField
                label="Application (client) ID"
                name="graph-client"
                autoComplete="off"
                spellCheck={false}
                data-lpignore="true"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                error={clientIdInvalid ? 'This should look like 1a2b3c4d-1234-5678-9abc-def012345678.' : undefined}
                value={draft.graphClientId ?? ''}
                onChange={(event) => setDraft({ ...draft, graphClientId: event.target.value })}
              />
              <div className="sm:col-span-2">
                <TextField
                  label="Client secret (Value)"
                  type="password"
                  name="graph-secret"
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  placeholder={settings?.hasGraphSecret ? 'Saved — leave empty to keep' : 'Paste the secret Value'}
                  value={draft.graphClientSecret ?? ''}
                  onChange={(event) => setDraft({ ...draft, graphClientSecret: event.target.value })}
                />
              </div>
              <TextField
                label="Send from (mailbox)"
                name="graph-from"
                inputMode="email"
                autoComplete="off"
                spellCheck={false}
                data-lpignore="true"
                hint="A licensed or shared mailbox in your Microsoft 365, e.g. events@entourageintl.com."
                placeholder="events@yourcompany.com"
                value={draft.fromEmail}
                onChange={(event) => setDraft({ ...draft, fromEmail: event.target.value })}
              />
              <TextField
                label="Sender name"
                name="graph-from-name"
                autoComplete="off"
                data-lpignore="true"
                hint="Microsoft 365 usually shows the mailbox's own display name."
                placeholder="Entourage Events"
                value={draft.fromName ?? ''}
                onChange={(event) => setDraft({ ...draft, fromName: event.target.value })}
              />
            </div>
          </>
        ) : (
          <>
        <p className="mt-4 text-sm text-muted">
          For Gmail, use the full Gmail address as the username and a Google App Password. Microsoft 365 only works here if your IT admin allows SMTP
          sign-in; otherwise use Microsoft 365 (Graph).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {presets.map((preset) => (
            <Button
              key={preset.label}
              variant="secondary"
              className="h-8 px-2.5 text-xs"
              onClick={() => setDraft({ ...draft, host: preset.host, port: preset.port, enableSsl: preset.enableSsl })}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
          <TextField label="SMTP server" placeholder="smtp.office365.com" value={draft.host} onChange={(event) => setDraft({ ...draft, host: event.target.value })} />
          <TextField
            label="Port"
            inputMode="numeric"
            value={String(draft.port)}
            onChange={(event) => setDraft({ ...draft, port: Number(event.target.value.replace(/\D/g, '')) || 0 })}
          />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.enableSsl} onChange={(event) => setDraft({ ...draft, enableSsl: event.target.checked })} />
          Use TLS (STARTTLS) — needed for Microsoft 365 and Gmail on port 587
        </label>
        {/*
          Browser autofill (saved emails, password suggestions) opens a popup over the modal dialog,
          which can crash some Chrome versions. These are server credentials, not the user's own
          login, so autofill is switched off and plain text inputs are used for addresses.
        */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <TextField
            label="Username"
            name="smtp-user"
            autoComplete="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            value={draft.username ?? ''}
            onChange={(event) => setDraft({ ...draft, username: event.target.value })}
          />
          <TextField
            label="Password"
            type="password"
            name="smtp-secret"
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore="true"
            placeholder={settings?.hasPassword ? 'Saved — leave empty to keep' : ''}
            value={draft.password ?? ''}
            onChange={(event) => setDraft({ ...draft, password: event.target.value })}
          />
          <TextField
            label="Send from (email)"
            name="smtp-from"
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
            data-lpignore="true"
            placeholder="events@yourcompany.com"
            value={draft.fromEmail}
            onChange={(event) => setDraft({ ...draft, fromEmail: event.target.value })}
          />
          <TextField
            label="Sender name"
            name="smtp-from-name"
            autoComplete="off"
            data-lpignore="true"
            placeholder="Entourage Events"
            value={draft.fromName ?? ''}
            onChange={(event) => setDraft({ ...draft, fromName: event.target.value })}
          />
        </div>
          </>
        )}
        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={!canSave || busy}>
            {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {saveMutation.isPending ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      </form>

      {/* Separate form: pressing Enter here sends the test instead of saving the settings above. */}
      <form
        className="border-t border-border px-5 pb-5 pt-4"
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault()
          if (settings?.configured && testTo.trim() && !busy) testMutation.mutate()
        }}
      >
        <h3 className="text-sm font-semibold">Send a test</h3>
        <p className="mt-1 text-sm text-muted">Save first, then send a test to yourself before emailing guests.</p>
        <div className="mt-3 flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <TextField
              label="Test address"
              name="smtp-test-to"
              inputMode="email"
              autoComplete="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              value={testTo}
              onChange={(event) => setTestTo(event.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={!settings?.configured || !testTo.trim() || busy}>
            {testMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {testMutation.isPending ? 'Sending…' : 'Send test'}
          </Button>
        </div>

        {error ? (
          <p role="alert" className="mt-4 rounded-md border border-danger bg-danger-soft p-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Close
          </Button>
        </div>
      </form>
      </div>
    </dialog>
  )
}

function messageOf(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback
  const field = error.errors ? Object.values(error.errors)[0]?.[0] : undefined
  return field || error.message || fallback
}
