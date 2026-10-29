import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { portalApi } from '@/api/portalApi'
import { ApplicantForm, emptyApplicant, errorMessage, fieldErrors, formatDate, toWriteRequest, type ApplicantFormValue } from '@/components/accreditation/shared'
import { Button } from '@/components/ui/Button'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

/** Optional public accreditation application: /apply/{slug}. */
export function PublicApplyPage() {
  const { slug = '' } = useParams()
  const info = useQuery({ queryKey: ['apply', slug], queryFn: () => portalApi.publicInfo(slug), retry: false })
  const [form, setForm] = useState<ApplicantFormValue>(() => emptyApplicant(null))
  const [website, setWebsite] = useState('')
  const [done, setDone] = useState(false)
  useDocumentTitle(info.data ? `Apply · ${info.data.event}` : 'Accreditation application')
  const submit = useMutation({
    mutationFn: () => portalApi.publicSubmit(slug, { ...toWriteRequest(form), organizationId: null }, website),
    onSuccess: () => {
      setDone(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
  })
  const errors = fieldErrors(submit.error)

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-md bg-accent-soft text-accent">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-semibold">{info.data?.event ?? 'Accreditation application'}</h1>
            {info.data ? (
              <p className="text-sm text-muted">
                {formatDate(info.data.startDate)} – {formatDate(info.data.endDate)}
                {info.data.venue ? ` · ${info.data.venue}` : ''}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-8 rounded-lg border border-border bg-surface p-5 sm:p-6">
          {info.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-muted" aria-hidden="true" />
            </div>
          ) : info.isError || !info.data ? (
            <p role="alert" className="text-sm">
              {errorMessage(info.error, 'This application page is not available.')}
            </p>
          ) : done ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="mx-auto size-10 text-accent" aria-hidden="true" />
              <h2 className="mt-3 text-lg font-semibold">Application received</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                We have emailed a confirmation to {form.email}. You will hear from us when a decision is made.
              </p>
            </div>
          ) : !info.data.open ? (
            <p className="text-sm">Applications for this event are closed.</p>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                submit.mutate()
              }}
            >
              <ApplicantForm
                value={form}
                onChange={setForm}
                types={info.data.types}
                strict
                errors={errors}
                upload={(file) => portalApi.publicUpload(slug, file)}
              />
              {/* Hidden from people; bots fill it in. */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute -left-[9999px] h-0 w-0 opacity-0"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
              <p className="mt-6 text-xs text-muted">
                Your details are used only for accreditation of this event. ID numbers are stored encrypted.
              </p>
              {submit.error ? (
                <p role="alert" className="mt-3 text-sm text-danger">
                  {Object.keys(errors).length ? 'Some fields need attention.' : errorMessage(submit.error, 'Your application could not be sent.')}
                </p>
              ) : null}
              <div className="mt-4 flex justify-end">
                <Button type="submit" disabled={submit.isPending}>
                  {submit.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                  Submit application
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
