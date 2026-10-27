import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { personalInvitationUrl } from '@/invitations/guestLinks'
import { ApiError, apiBaseUrl } from '@/api/client'
import { invitationApi } from '@/api/invitationApi'
import { InvitationCard } from '@/components/invitations/InvitationCard'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { renderInvitationHtml } from '@/invitations/emailHtml'

export function InvitePage() {
  const { slug = '' } = useParams()
  // Personal links from the guest list carry the guest's name (and position) so the invitation greets them.
  const [params] = useSearchParams()
  const guestName = params.get('name')?.trim().slice(0, 120) || 'Guest'
  const guestPosition = params.get('position')?.trim().slice(0, 200) || ''
  // A guest's personal code: open their own invitation, whose Accept / Decline go to the RSVP page.
  const personal = params.get('g')?.trim() ?? ''
  useEffect(() => {
    if (/^[0-9a-f]{16}$/i.test(personal)) window.location.replace(personalInvitationUrl(personal))
  }, [personal])
  const query = useQuery({
    queryKey: ['public-invitation', slug],
    queryFn: () => invitationApi.getPublic(slug),
    enabled: Boolean(slug) && !personal,
    retry: false,
  })

  useDocumentTitle(query.data ? query.data.eventName : 'Invitation')
  const email = query.data?.html
    ? renderInvitationHtml(query.data.html, {
        guestName,
        guestPosition,
        acceptUrl: `${window.location.origin}/invite/${query.data.slug}/rsvp?status=accept`,
        declineUrl: `${window.location.origin}/invite/${query.data.slug}/rsvp?status=decline`,
        assetOrigin: apiBaseUrl,
      })
    : null

  if (email) {
    return (
      <main className="min-h-dvh bg-[#e8e8e4]">
        <iframe
          title={query.data?.eventName ?? 'Invitation'}
          className="h-dvh w-full border-0 bg-[#e8e8e4]"
          sandbox="allow-popups allow-top-navigation-by-user-activation"
          srcDoc={email}
        />
      </main>
    )
  }

  return (
    <main className="min-h-dvh bg-[#f3efe8] px-4 py-10 text-[#1c1c1a]">
      {query.isLoading ? (
        <p className="text-center text-sm" aria-live="polite">
          Loading invitation
        </p>
      ) : query.isError ? (
        <div className="mx-auto max-w-md pt-16 text-center" role="alert">
          <h1 className="text-2xl font-semibold">This invitation is not available.</h1>
          <p className="mt-3 text-sm text-[#5c5c56]">
            {query.error instanceof ApiError ? query.error.message : 'It may not be published yet.'}
          </p>
        </div>
      ) : query.data ? (
        <InvitationCard invitation={query.data} hrefBase={`/invite/${query.data.slug}`} />
      ) : null}
    </main>
  )
}
