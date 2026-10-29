import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2, ShieldCheck } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { portalApi, portalSession, type PortalLoginResult } from '@/api/portalApi'
import { errorMessage, fieldErrors } from '@/components/accreditation/shared'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export function PortalShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className={wide ? 'mx-auto max-w-6xl px-4 py-8 sm:px-6' : 'mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10'}>
        {children}
      </div>
    </div>
  )
}

function Brand({ subtitle }: { subtitle: string }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <span className="inline-flex size-10 items-center justify-center rounded-md bg-accent-soft text-accent">
        <ShieldCheck className="size-5" aria-hidden="true" />
      </span>
      <div>
        <p className="text-base font-semibold">Accreditation portal</p>
        <p className="text-sm text-muted">{subtitle}</p>
      </div>
    </div>
  )
}

/** Organisation manager sign-in. */
export function PortalLoginPage() {
  useDocumentTitle('Accreditation portal')
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [choices, setChoices] = useState<PortalLoginResult['choices']>(null)
  const login = useMutation({
    mutationFn: (accountId?: string) => portalApi.login(email, password, accountId),
    onSuccess: (result) => {
      if (result.token) {
        portalSession.set(result.token)
        navigate('/portal', { replace: true })
      } else {
        setChoices(result.choices)
      }
    },
  })

  return (
    <PortalShell>
      <Brand subtitle="Sign in to submit and follow your team." />
      <div className="rounded-lg border border-border bg-surface p-6">
        {choices?.length ? (
          <div className="grid gap-3">
            <p className="text-sm font-medium">Which organisation?</p>
            {choices.map((choice) => (
              <button
                key={choice.accountId}
                type="button"
                className="rounded-md border border-border px-4 py-3 text-left hover:border-accent"
                onClick={() => login.mutate(choice.accountId)}
              >
                <span className="block text-sm font-medium">{choice.organization}</span>
                <span className="block text-xs text-muted">{choice.event}</span>
              </button>
            ))}
          </div>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              login.mutate(undefined)
            }}
          >
            <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            {login.error ? (
              <p role="alert" className="text-sm text-danger">
                {errorMessage(login.error, 'Sign-in failed.')}
              </p>
            ) : null}
            <Button type="submit" disabled={login.isPending}>
              {login.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Sign in
            </Button>
            <p className="text-xs text-muted">Forgot your password? Ask the accreditation team to resend your invitation.</p>
          </form>
        )}
      </div>
    </PortalShell>
  )
}

/** Accept an invitation: set name and password. */
export function PortalInvitePage() {
  const { token = '' } = useParams()
  useDocumentTitle('Accreditation portal')
  const navigate = useNavigate()
  const info = useQuery({ queryKey: ['portal', 'invite', token], queryFn: () => portalApi.inviteInfo(token), retry: false })
  const [name, setName] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [mismatch, setMismatch] = useState(false)
  const accept = useMutation({
    mutationFn: () => portalApi.acceptInvite(token, name ?? info.data?.name ?? '', password),
    onSuccess: (result) => {
      portalSession.set(result.token)
      navigate('/portal', { replace: true })
    },
  })
  const errors = fieldErrors(accept.error)

  return (
    <PortalShell>
      <Brand subtitle={info.data ? `${info.data.organization} · ${info.data.event}` : 'Set up your account'} />
      <div className="rounded-lg border border-border bg-surface p-6">
        {info.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted" aria-hidden="true" />
          </div>
        ) : info.isError || !info.data ? (
          <div className="grid gap-4">
            <p role="alert" className="text-sm">
              {errorMessage(info.error, 'This invitation link is not valid.')}
            </p>
            <Link to="/portal/login" className="text-sm text-accent hover:underline">
              Go to sign-in
            </Link>
          </div>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (password !== confirm) {
                setMismatch(true)
                return
              }
              setMismatch(false)
              accept.mutate()
            }}
          >
            <p className="text-sm text-muted">
              Signing in as <span className="font-medium text-foreground">{info.data.email}</span>
            </p>
            <TextField label="Your name" value={name ?? info.data.name} error={errors.name} onChange={(event) => setName(event.target.value)} required />
            <TextField
              label="Choose a password"
              type="password"
              autoComplete="new-password"
              value={password}
              error={errors.password}
              hint="At least 8 characters."
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <TextField
              label="Repeat password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              error={mismatch ? 'The passwords do not match.' : undefined}
              onChange={(event) => setConfirm(event.target.value)}
              required
            />
            {accept.error && !Object.keys(errors).length ? (
              <p role="alert" className="text-sm text-danger">
                {errorMessage(accept.error, 'Your account could not be set up.')}
              </p>
            ) : null}
            <Button type="submit" disabled={accept.isPending}>
              {accept.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Continue to the portal
            </Button>
          </form>
        )}
      </div>
    </PortalShell>
  )
}
