import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Loader2, Mail, Pencil, Plus, Trash2, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { accApi, type AccOrganization, type AccOrganizationWrite } from '@/api/accreditationApi'
import { errorMessage, fieldErrors, formatDateTime, useAccRole } from '@/components/accreditation/shared'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { SelectField } from '@/components/ui/SelectField'
import { Skeleton } from '@/components/ui/Skeleton'
import { Badge } from '@/components/ui/StatusBadge'
import { TextField } from '@/components/ui/TextField'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useAccSetup } from '@/pages/Accreditation/AccEventLayout'

function copy(text: string, message: string) {
  void navigator.clipboard?.writeText(text).then(
    () => toast.success(message),
    () => toast.message(text),
  )
}

export function AccOrganizationsPage() {
  const { accEventId = '' } = useParams()
  const { canManage } = useAccRole()
  const setup = useAccSetup(accEventId).data
  const query = useQuery({ queryKey: ['acc', 'organizations', accEventId], queryFn: () => accApi.organizations(accEventId) })
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<AccOrganization | 'new' | null>(null)
  const [inviting, setInviting] = useState<AccOrganization | null>(null)
  const [deleting, setDeleting] = useState<AccOrganization | null>(null)
  useDocumentTitle('Organisations')

  const setList = (list: AccOrganization[]) => {
    queryClient.setQueryData(['acc', 'organizations', accEventId], list)
    void queryClient.invalidateQueries({ queryKey: ['acc', 'setup', accEventId] })
  }

  const remove = useMutation({
    mutationFn: (id: string) => accApi.deleteOrganization(accEventId, id),
    onSuccess: (list) => {
      setList(list)
      setDeleting(null)
      toast.success('Organisation removed.')
    },
  })
  const resend = useMutation({
    mutationFn: (userId: string) => accApi.resendInvite(accEventId, userId),
    onSuccess: (result) => {
      setList(result.organizations)
      toast.success('Invitation sent again.', {
        action: { label: 'Copy link', onClick: () => copy(result.link, 'Invitation link copied.') },
        duration: 10000,
      })
    },
    onError: (error) => toast.error(errorMessage(error, 'The invitation could not be sent.')),
  })
  const toggle = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) => accApi.setOrgUserActive(accEventId, userId, isActive),
    onSuccess: setList,
    onError: (error) => toast.error(errorMessage(error, 'The account could not be changed.')),
  })

  const organizations = query.data ?? []
  const typeName = (id: string | null) => setup?.types.find((type) => type.id === id)?.name

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Organisations</h2>
          <p className="mt-1 text-sm text-muted">
            Media houses, vendors and agencies supplying people. Invite a manager to submit their team through the portal.
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden="true" />
            Add organisation
          </Button>
        ) : null}
      </div>

      <div className="mt-6">
        {query.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : query.isError ? (
          <p role="alert" className="text-sm text-danger">{errorMessage(query.error, 'Organisations could not be loaded.')}</p>
        ) : organizations.length === 0 ? (
          <EmptyState title="No organisations yet" description="Add the companies that will submit people for accreditation." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {organizations.map((organization) => (
              <article key={organization.id} className="rounded-lg border border-border bg-surface">
                <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">
                      <Link to={`/accreditation/${accEventId}/applicants?organizationId=${organization.id}`} className="hover:text-accent">
                        {organization.name}
                      </Link>
                    </h3>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {[typeName(organization.applicantTypeId), organization.contactName, organization.contactEmail].filter(Boolean).join(' · ') || 'No contact yet'}
                    </p>
                  </div>
                  {canManage ? (
                    <div className="flex shrink-0 gap-1">
                      <button type="button" aria-label="Edit" title="Edit" className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-foreground" onClick={() => setEditing(organization)}>
                        <Pencil className="size-4" aria-hidden="true" />
                      </button>
                      {organization.applicants === 0 ? (
                        <button type="button" aria-label="Remove" title="Remove" className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-danger" onClick={() => setDeleting(organization)}>
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </header>
                <div className="grid grid-cols-4 gap-2 px-4 py-3 text-center text-xs">
                  <div>
                    <p className="text-lg font-semibold tabular-nums">{organization.applicants}</p>
                    <p className="text-muted">{organization.quota ? `of ${organization.quota}` : 'People'}</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular-nums text-warning">{organization.pending}</p>
                    <p className="text-muted">In review</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular-nums text-accent">{organization.approved}</p>
                    <p className="text-muted">Approved</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular-nums text-danger">{organization.rejected}</p>
                    <p className="text-muted">Rejected</p>
                  </div>
                </div>
                <div className="border-t border-border px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Portal managers</h4>
                    {canManage ? (
                      <button type="button" className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline" onClick={() => setInviting(organization)}>
                        <UserPlus className="size-4" aria-hidden="true" />
                        Invite
                      </button>
                    ) : null}
                  </div>
                  {organization.users.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">Nobody invited yet.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-border">
                      {organization.users.map((user) => (
                        <li key={user.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{user.name}</span>
                            <span className="block truncate text-xs text-muted">
                              {user.email}
                              {user.lastLoginOn ? ` · last sign-in ${formatDateTime(user.lastLoginOn)}` : ''}
                            </span>
                          </span>
                          {!user.isActive ? <Badge tone="gray">Disabled</Badge> : user.invitePending ? <Badge tone="amber">Invited</Badge> : <Badge tone="teal">Active</Badge>}
                          {canManage ? (
                            <>
                              <button
                                type="button"
                                title={user.invitePending ? 'Resend invitation' : 'Send a password reset link'}
                                aria-label="Resend invitation"
                                disabled={resend.isPending}
                                className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-foreground disabled:opacity-50"
                                onClick={() => resend.mutate(user.id)}
                              >
                                <Mail className="size-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="h-8 rounded-md px-2 text-xs text-muted hover:bg-hover hover:text-foreground"
                                disabled={toggle.isPending}
                                onClick={() => toggle.mutate({ userId: user.id, isActive: !user.isActive })}
                              >
                                {user.isActive ? 'Disable' : 'Enable'}
                              </button>
                            </>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <OrganizationDialog
        eventId={accEventId}
        target={editing}
        types={(setup?.types ?? []).map((type) => ({ value: type.id ?? '', label: type.name }))}
        onClose={() => setEditing(null)}
        onSaved={(list) => {
          setList(list)
          setEditing(null)
        }}
      />
      <InviteDialog
        eventId={accEventId}
        organization={inviting}
        onClose={() => setInviting(null)}
        onSaved={(list) => setList(list)}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Remove ${deleting?.name ?? ''}?`}
        description="The organisation and its portal accounts are removed. This is only possible while it has no applicants."
        confirmLabel="Remove"
        pendingLabel="Removing…"
        pending={remove.isPending}
        error={remove.error ? errorMessage(remove.error, 'It could not be removed.') : null}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => {
          remove.reset()
          setDeleting(null)
        }}
      />
    </div>
  )
}

function OrganizationDialog({
  eventId,
  target,
  types,
  onClose,
  onSaved,
}: {
  eventId: string
  target: AccOrganization | 'new' | null
  types: { value: string; label: string }[]
  onClose: () => void
  onSaved: (list: AccOrganization[]) => void
}) {
  const empty: AccOrganizationWrite = { name: '', applicantTypeId: null, contactName: null, contactEmail: null, contactPhone: null, quota: null }
  const [form, setForm] = useState<AccOrganizationWrite>(empty)
  const [last, setLast] = useState(target)
  if (target !== last) {
    setLast(target)
    setForm(
      target && target !== 'new'
        ? {
            name: target.name,
            applicantTypeId: target.applicantTypeId,
            contactName: target.contactName,
            contactEmail: target.contactEmail,
            contactPhone: target.contactPhone,
            quota: target.quota,
          }
        : empty,
    )
  }
  const mutation = useMutation({
    mutationFn: () =>
      target && target !== 'new' ? accApi.updateOrganization(eventId, target.id, form) : accApi.createOrganization(eventId, form),
    onSuccess: (list) => {
      toast.success('Organisation saved.')
      onSaved(list)
    },
  })
  const errors = fieldErrors(mutation.error)
  const set = (patch: Partial<AccOrganizationWrite>) => setForm((current) => ({ ...current, ...patch }))
  const blank = (value: string) => (value.trim() ? value : null)

  return (
    <Modal open={Boolean(target)} onClose={onClose} title={target === 'new' ? 'Add organisation' : 'Edit organisation'}>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate()
        }}
      >
        <TextField label="Name" value={form.name} error={errors.name} onChange={(event) => set({ name: event.target.value })} required />
        <SelectField
          label="Default applicant type"
          value={form.applicantTypeId ?? ''}
          error={errors.applicantTypeId}
          options={[{ value: '', label: 'None (choose per person)' }, ...types]}
          onChange={(event) => set({ applicantTypeId: event.target.value || null })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Contact name" value={form.contactName ?? ''} onChange={(event) => set({ contactName: blank(event.target.value) })} />
          <TextField label="Contact phone" value={form.contactPhone ?? ''} onChange={(event) => set({ contactPhone: blank(event.target.value) })} />
        </div>
        <TextField label="Contact email" type="email" value={form.contactEmail ?? ''} error={errors.contactEmail} onChange={(event) => set({ contactEmail: blank(event.target.value) })} />
        <TextField
          label="Quota"
          type="number"
          min={0}
          value={form.quota ?? ''}
          error={errors.quota}
          hint="Most people this organisation may submit (rejected people do not count). Leave blank for no limit."
          onChange={(event) => set({ quota: event.target.value === '' ? null : Number(event.target.value) })}
        />
        {mutation.error && !Object.keys(errors).length ? (
          <p role="alert" className="text-sm text-danger">
            {errorMessage(mutation.error, 'The organisation could not be saved.')}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function InviteDialog({
  eventId,
  organization,
  onClose,
  onSaved,
}: {
  eventId: string
  organization: AccOrganization | null
  onClose: () => void
  onSaved: (list: AccOrganization[]) => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [link, setLink] = useState<string | null>(null)
  const [last, setLast] = useState(organization)
  if (organization !== last) {
    setLast(organization)
    setName(organization?.contactName ?? '')
    setEmail(organization?.contactEmail ?? '')
    setLink(null)
  }
  const mutation = useMutation({
    mutationFn: () => accApi.invite(eventId, organization!.id, { name, email }),
    onSuccess: (result) => {
      onSaved(result.organizations)
      setLink(result.link)
      toast.success('Invitation sent.')
    },
  })
  const errors = fieldErrors(mutation.error)

  return (
    <Modal
      open={Boolean(organization)}
      onClose={onClose}
      title={`Invite a manager for ${organization?.name ?? ''}`}
      description="They get an email with a link to set their password. The link works for 14 days."
    >
      {link ? (
        <div className="grid gap-4">
          <p className="text-sm">
            Invitation emailed to <span className="font-medium">{email}</span>. If email is not set up, send them this link yourself:
          </p>
          <div className="flex gap-2">
            <input readOnly value={link} className="h-10 min-w-0 flex-1 rounded-md border border-border bg-hover px-3 text-sm" onFocus={(event) => event.target.select()} />
            <Button variant="secondary" onClick={() => copy(link, 'Invitation link copied.')}>
              <Copy className="size-4" aria-hidden="true" />
              Copy
            </Button>
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            mutation.mutate()
          }}
        >
          <TextField label="Name" value={name} error={errors.name} onChange={(event) => setName(event.target.value)} required />
          <TextField label="Email" type="email" value={email} error={errors.email} onChange={(event) => setEmail(event.target.value)} required />
          {mutation.error && !Object.keys(errors).length ? (
            <p role="alert" className="text-sm text-danger">
              {errorMessage(mutation.error, 'The invitation could not be sent.')}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Send invitation
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
