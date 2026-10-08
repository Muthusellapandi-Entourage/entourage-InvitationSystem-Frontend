import { zodResolver } from '@hookform/resolvers/zod'
import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError } from '@/api/client'
import { InvitationCard } from '@/components/invitations/InvitationCard'
import { Button } from '@/components/ui/Button'
import { SelectField } from '@/components/ui/SelectField'
import { TextAreaField } from '@/components/ui/TextAreaField'
import { TextField } from '@/components/ui/TextField'
import type { InvitationContent, ReplyMode } from '@/types/invitation'

const schema = z
  .object({
    addressee: z.string().trim().max(300, 'Addressee must be 300 characters or fewer.'),
    patronageIntro: z.string().trim().max(500, 'Patronage line must be 500 characters or fewer.'),
    patronName: z.string().trim().max(300, 'Patron name must be 300 characters or fewer.'),
    patronTitle: z.string().trim().max(300, 'Patron title must be 300 characters or fewer.'),
    patronClosing: z.string().trim().max(100, 'Closing must be 100 characters or fewer.'),
    hostIntro: z.string().trim().max(500, 'Host line must be 500 characters or fewer.'),
    hostName: z.string().trim().max(300, 'Host name must be 300 characters or fewer.'),
    bodyIntro: z.string().trim().max(500, 'Invitation line must be 500 characters or fewer.'),
    organizationName: z.string().trim().min(1, 'Organization name is required.').max(300, 'Organization name must be 300 characters or fewer.'),
    organizationSubtitle: z.string().trim().max(300, 'Subtitle must be 300 characters or fewer.'),
    announcement: z.string().trim().max(2000, 'Announcement must be 2,000 characters or fewer.'),
    attendanceLine: z.string().trim().max(500, 'Attendance line must be 500 characters or fewer.'),
    dateLine: z.string().trim().min(1, 'Date line is required.').max(200, 'Date line must be 200 characters or fewer.'),
    hijriDateLine: z.string().trim().max(200, 'Hijri date must be 200 characters or fewer.'),
    timeLine: z.string().trim().max(100, 'Time must be 100 characters or fewer.'),
    venueLine: z.string().trim().min(1, 'Venue is required.').max(300, 'Venue must be 300 characters or fewer.'),
    locationUrl: z.string().trim().max(500, 'Location link must be 500 characters or fewer.'),
    rsvpNote: z.string().trim().max(2000, 'Reply note must be 2,000 characters or fewer.'),
    rsvpDeadline: z.string().trim().max(300, 'Deadline must be 300 characters or fewer.'),
    replyMode: z.enum(['Both', 'AcceptOnly', 'DeclineOnly']),
    acceptLabel: z.string().trim().max(40, 'Accept label must be 40 characters or fewer.'),
    declineLabel: z.string().trim().max(40, 'Decline label must be 40 characters or fewer.'),
  })
  .superRefine((value, context) => {
    if (value.replyMode !== 'DeclineOnly' && !value.acceptLabel) {
      context.addIssue({ code: 'custom', path: ['acceptLabel'], message: 'Accept button label is required.' })
    }
    if (value.replyMode !== 'AcceptOnly' && !value.declineLabel) {
      context.addIssue({ code: 'custom', path: ['declineLabel'], message: 'Decline button label is required.' })
    }
    if (value.locationUrl && !/^https?:\/\//i.test(value.locationUrl)) {
      context.addIssue({
        code: 'custom',
        path: ['locationUrl'],
        message: 'Location link must start with http:// or https://.',
      })
    }
  })

type FormValues = z.infer<typeof schema>

const replyOptions = [
  { value: 'Both', label: 'Accept and decline' },
  { value: 'AcceptOnly', label: 'Accept only' },
  { value: 'DeclineOnly', label: 'Decline only' },
]

const arabic = 'text-right'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 border-t border-border pt-5">
      <legend className="text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  )
}

export function InvitationForm({
  initial,
  submitting,
  onSubmit,
}: {
  initial: InvitationContent
  submitting: boolean
  onSubmit: (input: InvitationContent) => Promise<void>
}) {
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initial,
  })

  const preview = watch()

  return (
    <form
      className="grid items-start gap-10 lg:grid-cols-[minmax(0,36rem)_24rem]"
      noValidate
      onSubmit={handleSubmit(async (values) => {
        try {
          await onSubmit({
            ...values,
            replyMode: values.replyMode as ReplyMode,
          })
        } catch (error) {
          if (error instanceof ApiError && error.errors) {
            for (const [field, messages] of Object.entries(error.errors)) {
              if (field in values && messages[0]) {
                setError(field as keyof FormValues, { message: messages[0] })
              }
            }
          }
          throw error
        }
      })}
    >
      <div className="grid gap-5">
        <Section title="Addressee">
          <TextField label="Addressed to" dir="rtl" className={arabic} maxLength={300} error={errors.addressee?.message} {...register('addressee')} />
        </Section>

        <Section title="Patronage">
          <TextAreaField label="Intro" dir="rtl" className={arabic} rows={2} maxLength={500} error={errors.patronageIntro?.message} {...register('patronageIntro')} />
          <TextField label="Name" dir="rtl" className={arabic} maxLength={300} error={errors.patronName?.message} {...register('patronName')} />
          <TextField label="Title" dir="rtl" className={arabic} maxLength={300} error={errors.patronTitle?.message} {...register('patronTitle')} />
          <TextField label="Closing" dir="rtl" className={arabic} maxLength={100} error={errors.patronClosing?.message} {...register('patronClosing')} />
        </Section>

        <Section title="Host">
          <TextAreaField label="Intro" dir="rtl" className={arabic} rows={2} maxLength={500} error={errors.hostIntro?.message} {...register('hostIntro')} />
          <TextField label="Name" dir="rtl" className={arabic} maxLength={300} error={errors.hostName?.message} {...register('hostName')} />
        </Section>

        <Section title="Invitation">
          <TextAreaField label="Opening line" dir="rtl" className={arabic} rows={2} maxLength={500} error={errors.bodyIntro?.message} {...register('bodyIntro')} />
          <TextField label="Organization name" dir="rtl" className={arabic} maxLength={300} error={errors.organizationName?.message} {...register('organizationName')} />
          <TextField label="Subtitle" dir="rtl" className={arabic} maxLength={300} error={errors.organizationSubtitle?.message} {...register('organizationSubtitle')} />
          <TextAreaField label="Announcement" dir="rtl" className={arabic} rows={3} maxLength={2000} error={errors.announcement?.message} {...register('announcement')} />
          <TextAreaField label="Attendance line" dir="rtl" className={arabic} rows={2} maxLength={500} error={errors.attendanceLine?.message} {...register('attendanceLine')} />
        </Section>

        <Section title="When and where">
          <TextField label="Date" dir="rtl" className={arabic} maxLength={200} error={errors.dateLine?.message} {...register('dateLine')} />
          <TextField label="Hijri date" dir="rtl" className={arabic} maxLength={200} error={errors.hijriDateLine?.message} {...register('hijriDateLine')} />
          <TextField label="Time" dir="rtl" className={arabic} maxLength={100} error={errors.timeLine?.message} {...register('timeLine')} />
          <TextField label="Venue" dir="rtl" className={arabic} maxLength={300} error={errors.venueLine?.message} {...register('venueLine')} />
          <TextField
            label="Location link"
            type="url"
            maxLength={500}
            hint="Optional. A map code can be added later."
            error={errors.locationUrl?.message}
            {...register('locationUrl')}
          />
        </Section>

        <Section title="Reply">
          <TextAreaField label="Reply note" dir="rtl" className={arabic} rows={2} maxLength={2000} error={errors.rsvpNote?.message} {...register('rsvpNote')} />
          <TextField label="Deadline" dir="rtl" className={arabic} maxLength={300} error={errors.rsvpDeadline?.message} {...register('rsvpDeadline')} />
          <SelectField label="Buttons" options={replyOptions} error={errors.replyMode?.message} {...register('replyMode')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Accept label" dir="rtl" className={arabic} maxLength={40} error={errors.acceptLabel?.message} {...register('acceptLabel')} />
            <TextField label="Decline label" dir="rtl" className={arabic} maxLength={40} error={errors.declineLabel?.message} {...register('declineLabel')} />
          </div>
        </Section>

        <div className="flex justify-end border-t border-border pt-5">
          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {submitting ? 'Saving...' : 'Save invitation'}
          </Button>
        </div>
      </div>

      <div className="lg:sticky lg:top-6">
        <p className="mb-3 text-sm text-muted">Preview</p>
        <InvitationCard invitation={preview} />
        <p className="mt-3 text-xs text-muted">Logos and the cover photograph stay out until images are decided.</p>
      </div>
    </form>
  )
}
