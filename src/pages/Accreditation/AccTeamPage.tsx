import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { accApi, type AccTeamMember, type AccTeamWrite } from '@/api/accreditationApi'
import { accRoleLabels, accTeamRoles, errorMessage, fieldErrors, formatDateTime, useAccRole } from '@/components/accreditation/shared'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { SelectField } from '@/components/ui/SelectField'
import { Skeleton } from '@/components/ui/Skeleton'
import { Badge } from '@/components/ui/StatusBadge'
import { TextField } from '@/components/ui/TextField'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { usePageBreadcrumbs } from '@/stores/breadcrumbStore'

const roleHelp: Record<string, string> = {
  Administrator: 'Everything, including the invitation system.',
  AccreditationAdmin: 'Accreditation events, set-up, organisations, team and vetting.',
  SecurityManager: 'Vetting: approve or reject, change access, see ID numbers.',
  DataEntryClerk: 'Add and edit applicants and uploads. Cannot approve.',
  PrintOperator: 'Badge printing (coming in phase 2).',
  GateGuard: 'Gate scanning (coming in phase 3).',
}

export function AccTeamPage() {
  useDocumentTitle('Accreditation team')
  usePageBreadcrumbs([{ label: 'Accreditation', to: '/accreditation' }, { label: 'Team' }])
  const query = useQuery({ queryKey: ['acc', 'team'], queryFn: accApi.team })
  const [editing, setEditing] = useState<AccTeamMember | 'new' | null>(null)
  const members = query.data ?? []

  return (
    <div>
      <Link to="/accreditation" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Accreditation
      </Link>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.02em]">Accreditation team</h1>
          <p className="mt-2 text-sm text-muted">Staff accounts and roles. Accreditation roles never see the invitation system.</p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden="true" />
          Add team member
        </Button>
      </div>
      <div className="mt-8">
        {query.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : query.isError ? (
          <p role="alert" className="text-sm text-danger">{errorMessage(query.error, 'The team could not be loaded.')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-border bg-hover/50 text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last sign-in</th>
                  <th className="w-12 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((member) => (
                  <tr key={member.id}>
                    <td className="px-4 py-3">
                      <span className="block font-medium">
                        {member.firstName} {member.lastName}
                      </span>
                      <span className="block text-xs text-muted">{member.email}</span>
                    </td>
                    <td className="px-4 py-3">{accRoleLabels[member.role] ?? member.role}</td>
                    <td className="px-4 py-3">{member.isActive ? <Badge tone="teal">Active</Badge> : <Badge tone="gray">Disabled</Badge>}</td>
                    <td className="px-4 py-3 text-muted">{formatDateTime(member.lastLoginOn)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        aria-label={`Edit ${member.firstName}`}
                        className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-foreground"
                        onClick={() => setEditing(member)}
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <MemberDialog target={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function MemberDialog({ target, onClose }: { target: AccTeamMember | 'new' | null; onClose: () => void }) {
  const { isAdministrator } = useAccRole()
  const queryClient = useQueryClient()
  const empty: AccTeamWrite = { firstName: '', lastName: '', email: '', role: 'DataEntryClerk', password: '', isActive: true }
  const [form, setForm] = useState<AccTeamWrite>(empty)
  const [last, setLast] = useState(target)
  if (target !== last) {
    setLast(target)
    setForm(
      target && target !== 'new'
        ? { firstName: target.firstName, lastName: target.lastName, email: target.email, role: target.role, password: '', isActive: target.isActive }
        : empty,
    )
  }
  const isNew = target === 'new'
  const mutation = useMutation({
    mutationFn: () => {
      const body = { ...form, password: form.password ? form.password : null }
      return isNew ? accApi.createTeamMember(body) : accApi.updateTeamMember((target as AccTeamMember).id, body)
    },
    onSuccess: (list) => {
      queryClient.setQueryData(['acc', 'team'], list)
      toast.success(isNew ? 'Team member added.' : 'Team member saved.')
      onClose()
    },
  })
  const errors = fieldErrors(mutation.error)
  const set = (patch: Partial<AccTeamWrite>) => setForm((current) => ({ ...current, ...patch }))
  const roles = [...(isAdministrator ? ['Administrator'] : []), ...accTeamRoles]

  return (
    <Modal open={Boolean(target)} onClose={onClose} title={isNew ? 'Add team member' : 'Edit team member'}>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate()
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="First name" value={form.firstName} error={errors.firstName} onChange={(event) => set({ firstName: event.target.value })} />
          <TextField label="Last name" value={form.lastName} error={errors.lastName} onChange={(event) => set({ lastName: event.target.value })} />
        </div>
        <TextField label="Email" type="email" value={form.email} error={errors.email} onChange={(event) => set({ email: event.target.value })} />
        <SelectField
          label="Role"
          value={form.role}
          error={errors.role}
          hint={roleHelp[form.role]}
          options={roles.map((role) => ({ value: role, label: accRoleLabels[role] ?? role }))}
          onChange={(event) => set({ role: event.target.value })}
        />
        <TextField
          label={isNew ? 'Password' : 'New password'}
          type="password"
          autoComplete="new-password"
          value={form.password ?? ''}
          error={errors.password}
          hint={isNew ? 'At least 8 characters. They can also sign in with Microsoft if it is set up.' : 'Leave blank to keep the current password.'}
          onChange={(event) => set({ password: event.target.value })}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" checked={form.isActive} onChange={(event) => set({ isActive: event.target.checked })} />
          Active (can sign in)
        </label>
        {mutation.error && !Object.keys(errors).length ? (
          <p role="alert" className="text-sm text-danger">
            {errorMessage(mutation.error, 'Could not save.')}
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
