import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '@/api/client'
import { invitationApi } from '@/api/invitationApi'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import type { RsvpStatus } from '@/types/invitation'
import '@fontsource/amiri/400.css'
import '@fontsource/amiri/700.css'

const schema = z.object({
  guestName: z.string().trim().min(1, 'الاسم مطلوب.').max(120, 'الاسم طويل أكثر من اللازم.'),
})

type FormValues = z.infer<typeof schema>

function replyFromQuery(value: string | null): RsvpStatus | null {
  if (value === 'accept') return 'Accepted'
  if (value === 'decline') return 'Declined'
  return null
}

export function InviteConfirmPage() {
  const { slug = '' } = useParams()
  const [params] = useSearchParams()
  const status = replyFromQuery(params.get('response'))
  const [done, setDone] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const invitationQuery = useQuery({
    queryKey: ['public-invitation', slug],
    queryFn: () => invitationApi.getPublic(slug),
    enabled: Boolean(slug),
    retry: false,
  })
  useDocumentTitle(status === 'Declined' ? 'اعتذار' : 'تأكيد الحضور')

  const invitation = invitationQuery.data
  const allowed =
    invitation &&
    status &&
    ((status === 'Accepted' && invitation.replyMode !== 'DeclineOnly') ||
      (status === 'Declined' && invitation.replyMode !== 'AcceptOnly'))

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { guestName: '' },
  })

  const heading = status === 'Declined' ? 'تأكيد الاعتذار' : 'تأكيد الحضور'

  return (
    <main
      dir="rtl"
      lang="ar"
      className="flex min-h-dvh items-center justify-center bg-[#f3efe8] px-4 py-10 text-[#1c1c1a]"
      style={{ fontFamily: '"Amiri", "Noto Naskh Arabic", serif' }}
    >
      <div className="w-full max-w-md bg-[#fbf8f3] px-8 py-10 text-center">
        {invitationQuery.isLoading ? (
          <p className="text-xl">جارٍ التحميل</p>
        ) : !status || !allowed ? (
          <>
            <h1 className="text-3xl">الرد غير متاح</h1>
            <Link to={`/invite/${slug}`} className="mt-6 inline-block text-lg text-[#9a7340]">
              العودة إلى الدعوة
            </Link>
          </>
        ) : done ? (
          <>
            <h1 className="text-3xl">تم تسجيل ردكم</h1>
            <p className="mt-3 text-xl text-[#3f3c38]">يمكنكم تغيير الرد لاحقًا بنفس الاسم.</p>
            <Link to={`/invite/${slug}`} className="mt-6 inline-block text-lg text-[#9a7340]">
              العودة إلى الدعوة
            </Link>
          </>
        ) : (
          <form
            className="grid gap-5"
            noValidate
            onSubmit={handleSubmit(async (values) => {
              setFormError(null)
              try {
                await invitationApi.respond(slug, values.guestName.trim(), status)
                setDone(true)
              } catch (error) {
                setFormError(error instanceof ApiError ? error.message : 'تعذر تسجيل الرد.')
              }
            })}
          >
            <h1 className="text-3xl">{heading}</h1>
            <p className="text-xl text-[#3f3c38]">اكتبوا الاسم لتثبيت الرد.</p>
            <div className="grid gap-2 text-right">
              <label htmlFor="guest-name" className="text-lg">
                الاسم
              </label>
              <input
                id="guest-name"
                autoComplete="name"
                dir="rtl"
                maxLength={120}
                aria-invalid={errors.guestName ? true : undefined}
                className="h-12 rounded-md border border-[#dddcd7] bg-white px-3 text-xl"
                {...register('guestName')}
              />
              {errors.guestName ? <p className="text-base text-[#8d2f2f]">{errors.guestName.message}</p> : null}
            </div>
            {formError ? (
              <p role="alert" className="text-base text-[#8d2f2f]">
                {formError}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[#9a7340] text-xl text-[#9a7340] disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {isSubmitting ? 'جارٍ التثبيت...' : 'تثبيت الرد'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
