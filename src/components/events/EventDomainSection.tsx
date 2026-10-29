import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, CircleAlert, Copy, Globe, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { domainApi, type EventDomain } from '@/api/domainApi'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { cn } from '@/lib/cn'

/**
 * The event's own web address. Once its DNS points at this server and the check passes, every
 * guest's invitation link becomes https://<domain>/invitation.html?g=<personal code>, and the
 * Accept / Decline buttons and email images use the domain too.
 */
export function EventDomainSection({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['event-domain', eventId], queryFn: () => domainApi.get(eventId) })
  const current = query.data
  const [value, setValue] = useState('')
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [checkMessage, setCheckMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    setValue(current?.domain ?? '')
  }, [current?.domain])

  async function refresh(next: EventDomain) {
    queryClient.setQueryData(['event-domain', eventId], next)
    // Guest links change when the domain starts or stops being used.
    await queryClient.invalidateQueries({ queryKey: ['guests', eventId] })
    await queryClient.invalidateQueries({ queryKey: ['events'] })
  }

  const saveMutation = useMutation({
    mutationFn: () => domainApi.set(eventId, value),
    onSuccess: async (next) => {
      setFieldError(undefined)
      setCheckMessage(null)
      await refresh(next)
      toast.success('Domain saved. Point its DNS at the server, then check it.')
    },
    onError: (error) => {
      const message = error instanceof ApiError ? (error.errors?.domain?.[0] ?? error.message) : 'The domain could not be saved.'
      setFieldError(message)
    },
  })

  const clearMutation = useMutation({
    mutationFn: () => domainApi.clear(eventId),
    onSuccess: async (next) => {
      setCheckMessage(null)
      await refresh(next)
      toast.success('Domain removed. Invitations use the standard links again.')
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'The domain could not be removed.'),
  })

  const checkMutation = useMutation({
    mutationFn: () => domainApi.check(eventId),
    onSuccess: async (result) => {
      setCheckMessage({ ok: result.secure, text: result.message })
      await refresh(result.domain)
    },
    onError: (error) => setCheckMessage({ ok: false, text: error instanceof ApiError ? error.message : 'The check could not run.' }),
  })

  const dirty = value.trim().toLowerCase() !== (current?.domain ?? '')
  const domain = current?.domain ?? null

  return (
    <section className="mt-12 border-t border-border pt-8">
      <div className="flex items-center gap-2">
        <Globe className="size-4 text-accent" aria-hidden="true" />
        <h2 className="text-base font-semibold">Invitation domain</h2>
        {domain ? <StatusPill inUse={Boolean(current?.inUse)} /> : null}
      </div>
      <p className="mb-5 mt-1 max-w-2xl text-sm text-muted">
        Give this event its own address, such as <span className="font-medium text-foreground">excellenceawards2026.com</span>. Each guest then
        gets a personal link like <span className="font-mono text-xs">excellenceawards2026.com/invitation.html?g=…</span>, and their Accept or Decline
        is recorded against them automatically.
      </p>

      {query.isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          <form
            className="flex max-w-2xl flex-wrap items-start gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              if (value.trim() && dirty) saveMutation.mutate()
            }}
          >
            <div className="min-w-[16rem] flex-1">
              <TextField
                label="Domain"
                placeholder="excellenceawards2026.com"
                autoComplete="off"
                spellCheck={false}
                value={value}
                error={fieldError}
                onChange={(event) => {
                  setValue(event.target.value)
                  setFieldError(undefined)
                }}
              />
            </div>
            <div className="flex gap-2 pt-7">
              <Button type="submit" disabled={!value.trim() || !dirty || saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving…' : domain ? 'Change' : 'Save domain'}
              </Button>
              {domain ? (
                <Button
                  variant="secondary"
                  className="text-danger"
                  disabled={clearMutation.isPending}
                  onClick={() => {
                    if (window.confirm(`Stop using ${domain}? New invitations go back to the standard links. Links already sent stop working.`))
                      clearMutation.mutate()
                  }}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </form>

          {domain && !dirty ? (
            <div className="mt-6 grid max-w-2xl gap-5">
              <Steps domain={domain} target={current?.dnsTarget ?? null} recordType={current?.dnsRecordType ?? null} />

              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={checkMutation.isPending} onClick={() => checkMutation.mutate()}>
                  {checkMutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                  {checkMutation.isPending ? 'Checking…' : current?.inUse ? 'Check again' : 'Check domain'}
                </Button>
                {current?.verifiedOn ? (
                  <span className="text-xs text-muted">Last confirmed {new Date(current.verifiedOn).toLocaleString()}</span>
                ) : null}
              </div>

              {checkMessage ? (
                <p
                  role="status"
                  className={cn(
                    'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
                    checkMessage.ok ? 'border-accent bg-accent-soft text-accent' : 'border-danger bg-danger-soft text-danger',
                  )}
                >
                  {checkMessage.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
                  {checkMessage.text}
                </p>
              ) : null}

              {current?.inUse && current.exampleUrl ? (
                <p className="text-sm text-muted">
                  Guest links now look like <span className="break-all font-mono text-xs text-foreground">{current.exampleUrl}</span>. Find each guest&apos;s
                  own link under <span className="font-medium text-foreground">More</span> on the Guests page. Invitations sent before this change
                  keep their old links; send them again to use the new address.
                </p>
              ) : (
                <p className="text-sm text-muted">Until the check passes, invitations keep using the standard links.</p>
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

function StatusPill({ inUse }: { inUse: boolean }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-xs font-medium',
        inUse ? 'bg-accent-soft text-accent' : 'bg-warning-soft text-warning',
      )}
    >
      {inUse ? 'In use' : 'Not confirmed'}
    </span>
  )
}

function Steps({ domain, target, recordType }: { domain: string; target: string | null; recordType: string | null }) {
  const apex = domain.split('.').length === 2
  const host = apex ? '@' : domain.split('.').slice(0, -2).join('.')
  return (
    <ol className="grid gap-4 rounded-lg border border-border bg-surface p-4 text-sm">
      <li className="grid gap-2">
        <span className="font-medium">1. Add this DNS record where {domain} is registered</span>
        {target ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-4 font-medium">Type</th>
                  <th className="py-1 pr-4 font-medium">Name / Host</th>
                  <th className="py-1 pr-4 font-medium">Value / Points to</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr>
                  <td className="py-1 pr-4">{recordType ?? 'CNAME'}</td>
                  <td className="py-1 pr-4">{host}</td>
                  <td className="py-1 pr-4">
                    <CopyText text={target} />
                  </td>
                </tr>
              </tbody>
            </table>
            {apex && recordType === 'CNAME' ? (
              <p className="mt-2 text-xs text-muted">
                Many providers do not allow a CNAME on the main domain (@). Use their ALIAS / ANAME / CNAME-flattening record instead, or an A record to the
                server&apos;s IP address.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-muted">
            Point it at the server that runs this system: an <span className="font-medium text-foreground">A record</span> to the server&apos;s public IP
            address, or a <span className="font-medium text-foreground">CNAME</span> to its host name. Your IT team can set the exact value in the server
            settings (<span className="font-mono text-xs">EventDomains:DnsTarget</span>) so it shows here.
          </p>
        )}
      </li>
      <li className="grid gap-1">
        <span className="font-medium">2. Add an HTTPS certificate for {domain} on the server</span>
        <span className="text-muted">The web server or proxy in front of this system must accept {domain} and serve it over HTTPS (for example with a free Let&apos;s Encrypt certificate).</span>
      </li>
      <li className="grid gap-1">
        <span className="font-medium">3. Check the domain</span>
        <span className="text-muted">DNS changes can take from a few minutes to a few hours. When the check passes, new invitations use the domain.</span>
      </li>
    </ol>
  )
}

function CopyText({ text }: { text: string }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 rounded px-1 hover:bg-hover"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(
          () => toast.success('Copied.'),
          () => toast.error('Copy failed. Select the text and copy it.'),
        )
      }}
    >
      {text}
      <Copy className="size-3 text-muted" aria-hidden="true" />
    </button>
  )
}
