import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { ApiError, apiClient } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'

type WalletSettings = {
  configured: boolean
  teamId: string | null
  passTypeId: string | null
  organizationName: string | null
  certificateSubject: string | null
  certificateExpiresOn: string | null
  updatedOn: string | null
}

const walletApi = {
  get: () => apiClient<WalletSettings>('/api/settings/wallet'),
  save: (body: FormData) => apiClient<WalletSettings>('/api/settings/wallet', { method: 'PUT', body }),
  clear: () => apiClient<null>('/api/settings/wallet', { method: 'DELETE' }),
}

/**
 * Apple Wallet: once the Pass Type ID certificate is uploaded, accepted guests on Apple devices see
 * "Add to Apple Wallet" on their thank-you and E-Badge pages.
 */
export function WalletSettingsSection() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['wallet-settings'], queryFn: walletApi.get })
  const current = query.data
  const [teamId, setTeamId] = useState('')
  const [passTypeId, setPassTypeId] = useState('')
  const [organizationName, setOrganizationName] = useState('Entourage International')
  const [password, setPassword] = useState('')
  const [certificate, setCertificate] = useState<File | null>(null)
  const [wwdr, setWwdr] = useState<File | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!current?.configured) return
    setTeamId(current.teamId ?? '')
    setPassTypeId(current.passTypeId ?? '')
    setOrganizationName(current.organizationName ?? '')
  }, [current])

  const save = useMutation({
    mutationFn: () => {
      const body = new FormData()
      body.append('teamId', teamId)
      body.append('passTypeId', passTypeId)
      body.append('organizationName', organizationName)
      if (password) body.append('password', password)
      if (certificate) body.append('certificate', certificate)
      if (wwdr) body.append('wwdr', wwdr)
      return walletApi.save(body)
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(['wallet-settings'], saved)
      setErrors({})
      setPassword('')
      setCertificate(null)
      setWwdr(null)
      toast.success('Apple Wallet is set up.')
    },
    onError: (error) => {
      if (error instanceof ApiError && error.errors) {
        setErrors(Object.fromEntries(Object.entries(error.errors).map(([key, value]) => [key, value[0] ?? ''])))
      } else {
        toast.error(error instanceof ApiError ? error.message : 'Apple Wallet settings could not be saved.')
      }
    },
  })

  const clear = useMutation({
    mutationFn: walletApi.clear,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['wallet-settings'] })
      toast.success('Apple Wallet turned off.')
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    save.mutate()
  }

  return (
    <section id="wallet" className="mt-10 scroll-mt-20 border-t border-border pt-8">
      <h2 className="text-base font-semibold">Apple Wallet</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Lets guests who accepted add their E-Badge to Apple Wallet. It needs an Apple Developer account, a Pass Type ID and its certificate. Until this is
        set up, the Wallet button stays hidden.
      </p>
      {current?.configured ? (
        <p className="mt-3 text-sm">
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">Active</span>{' '}
          {current.certificateSubject ?? 'Certificate saved'}
          {current.certificateExpiresOn ? ` · expires ${new Date(current.certificateExpiresOn).toLocaleDateString()}` : ''}
        </p>
      ) : null}
      <form onSubmit={submit} className="mt-4 grid max-w-2xl gap-4 sm:grid-cols-2">
        <TextField label="Team ID" value={teamId} onChange={(event) => setTeamId(event.target.value)} error={errors.teamId} placeholder="A1B2C3D4E5" />
        <TextField
          label="Pass Type ID"
          value={passTypeId}
          onChange={(event) => setPassTypeId(event.target.value)}
          error={errors.passTypeId}
          placeholder="pass.com.entourageintl.invitation"
        />
        <div className="sm:col-span-2">
          <TextField
            label="Organisation name"
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
            error={errors.organizationName}
          />
        </div>
        <FileField
          label={current?.configured ? 'New certificate (.p12) — optional' : 'Pass Type ID certificate (.p12)'}
          accept=".p12,.pfx,application/x-pkcs12"
          file={certificate}
          onFile={setCertificate}
          error={errors.certificate}
        />
        <TextField
          label="Certificate password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          hint="Only needed when uploading a certificate."
        />
        <FileField
          label={current?.configured ? 'New WWDR certificate (.cer) — optional' : 'Apple WWDR certificate (.cer)'}
          accept=".cer,.crt,application/x-x509-ca-cert"
          file={wwdr}
          onFile={setWwdr}
          error={errors.wwdr}
          hint="Download “Worldwide Developer Relations - G4” from apple.com/certificateauthority."
        />
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : current?.configured ? 'Save changes' : 'Turn on Apple Wallet'}
          </Button>
          {current?.configured ? (
            <Button
              variant="secondary"
              className="text-danger"
              disabled={clear.isPending}
              onClick={() => {
                if (window.confirm('Turn off Apple Wallet? The certificate is deleted from this server.')) clear.mutate()
              }}
            >
              Turn off
            </Button>
          ) : null}
        </div>
      </form>
    </section>
  )
}

function FileField({
  label,
  accept,
  file,
  onFile,
  error,
  hint,
}: {
  label: string
  accept: string
  file: File | null
  onFile: (file: File | null) => void
  error?: string
  hint?: string
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <input
        type="file"
        accept={accept}
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
        className="text-sm file:mr-3 file:h-9 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:text-sm"
      />
      {file ? <span className="text-xs text-muted">{file.name}</span> : null}
      {error ? <span className="text-sm text-danger">{error}</span> : hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  )
}
