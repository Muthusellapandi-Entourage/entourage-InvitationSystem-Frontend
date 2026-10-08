import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '@/api/client'
import { Button, buttonClassName } from '@/components/ui/Button'
import { SelectField } from '@/components/ui/SelectField'
import { TextAreaField } from '@/components/ui/TextAreaField'
import { TextField } from '@/components/ui/TextField'
import type { EventInput, EventItem, EventStatus } from '@/types/event'
import { toSlug } from '@/utils/slug'
import { timezoneOptions } from '@/utils/timezones'

const schema = z
  .object({
    name: z.string().trim().min(1, 'Event name is required.').max(200, 'Event name must be 200 characters or fewer.'),
    slug: z
      .string()
      .trim()
      .min(1, 'Event code is required.')
      .max(80, 'Event code must be 80 characters or fewer.')
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens only.'),
    description: z.string().trim().max(2000, 'Description must be 2,000 characters or fewer.'),
    startDate: z.string().min(1, 'Start date is required.'),
    endDate: z.string().min(1, 'End date is required.'),
    timezone: z.string().min(1, 'Timezone is required.'),
    status: z.enum(['Draft', 'Active', 'Archived']),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: 'End date must be on or after the start date.',
    path: ['endDate'],
  })

type FormValues = z.infer<typeof schema>

const zones = timezoneOptions()
const statusOptions = [
  { value: 'Draft', label: 'Draft' },
  { value: 'Active', label: 'Active' },
  { value: 'Archived', label: 'Archived' },
]

function toValues(event?: EventItem): FormValues {
  return {
    name: event?.name ?? '',
    slug: event?.slug ?? '',
    description: event?.description ?? '',
    startDate: event?.startDate.slice(0, 10) ?? '',
    endDate: event?.endDate.slice(0, 10) ?? '',
    timezone: event?.timezone ?? 'Asia/Riyadh',
    status: event?.status ?? 'Draft',
  }
}

export function EventForm({
  mode,
  event,
  cancelTo,
  submitting,
  onSubmit,
}: {
  mode: 'create' | 'edit'
  event?: EventItem
  cancelTo: string
  submitting: boolean
  onSubmit: (input: EventInput) => Promise<void>
}) {
  const [slugLocked, setSlugLocked] = useState(mode === 'edit')
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toValues(event),
  })

  const name = watch('name')

  useEffect(() => {
    if (slugLocked) return
    setValue('slug', toSlug(name), { shouldValidate: name.trim().length > 0 })
  }, [name, setValue, slugLocked])

  const slugField = register('slug')

  return (
    <form
      className="grid max-w-xl gap-5"
      noValidate
      onSubmit={handleSubmit(async (values) => {
        try {
          await onSubmit({
            name: values.name.trim(),
            slug: values.slug.trim(),
            description: values.description.trim() ? values.description.trim() : null,
            startDate: values.startDate,
            endDate: values.endDate,
            timezone: values.timezone,
            status: values.status as EventStatus,
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
      <TextField label="Event name" maxLength={200} autoComplete="off" error={errors.name?.message} {...register('name')} />
      <TextField
        label="Event code"
        maxLength={80}
        autoComplete="off"
        spellCheck={false}
        hint="Lowercase letters, numbers, and hyphens. This code must be unique."
        error={errors.slug?.message}
        {...slugField}
        onChange={(event) => {
          setSlugLocked(true)
          void slugField.onChange(event)
        }}
      />
      <TextAreaField
        label="Description"
        maxLength={2000}
        error={errors.description?.message}
        {...register('description')}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField label="Start date" type="date" error={errors.startDate?.message} {...register('startDate')} />
        <TextField label="End date" type="date" error={errors.endDate?.message} {...register('endDate')} />
      </div>
      <SelectField
        label="Timezone"
        options={zones.map((zone) => ({ value: zone, label: zone }))}
        error={errors.timezone?.message}
        {...register('timezone')}
      />
      <SelectField label="Status" options={statusOptions} error={errors.status?.message} {...register('status')} />
      <div className="flex items-center justify-end gap-2 pt-2">
        <Link to={cancelTo} className={buttonClassName('secondary')}>
          Cancel
        </Link>
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {mode === 'create' ? (submitting ? 'Creating event...' : 'Create event') : submitting ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
