import { apiBaseUrl } from '@/api/client'

/** The API's address (the app's own address when the API is served under /api). */
const apiOrigin = () => apiBaseUrl || window.location.origin

/** The guest's RSVP page: Accept / Decline open a confirm view; nothing is saved until they confirm. */
export function rsvpUrl(inviteToken: string, status: 'accept' | 'decline') {
  return `${apiOrigin()}/api/public/rsvp?g=${encodeURIComponent(inviteToken)}&status=${status}`
}

/** The guest's own invitation page (their guest type's design); its buttons open the RSVP page. */
export function personalInvitationUrl(inviteToken: string) {
  return `${apiOrigin()}/api/public/rsvp/invitation?g=${encodeURIComponent(inviteToken)}`
}
