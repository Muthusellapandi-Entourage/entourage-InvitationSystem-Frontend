export type ReplyMode = 'Both' | 'AcceptOnly' | 'DeclineOnly'

export type RsvpStatus = 'Accepted' | 'Declined'

export type InvitationContent = {
  addressee: string
  patronageIntro: string
  patronName: string
  patronTitle: string
  patronClosing: string
  hostIntro: string
  hostName: string
  bodyIntro: string
  organizationName: string
  organizationSubtitle: string
  announcement: string
  attendanceLine: string
  dateLine: string
  hijriDateLine: string
  timeLine: string
  venueLine: string
  locationUrl: string
  rsvpNote: string
  rsvpDeadline: string
  replyMode: ReplyMode
  acceptLabel: string
  declineLabel: string
}

export type InvitationItem = InvitationContent & {
  id: string
  eventId: string
  updatedOn: string
}

export type PublicInvitation = InvitationContent & {
  eventName: string
  slug: string
  html?: string | null
}

export type InvitationResponseItem = {
  id: string
  guestName: string
  status: RsvpStatus
  createdOn: string
}

export const emptyInvitation = (): InvitationContent => ({
  addressee: '',
  patronageIntro: '',
  patronName: '',
  patronTitle: '',
  patronClosing: '',
  hostIntro: '',
  hostName: '',
  bodyIntro: '',
  organizationName: '',
  organizationSubtitle: '',
  announcement: '',
  attendanceLine: '',
  dateLine: '',
  hijriDateLine: '',
  timeLine: '',
  venueLine: '',
  locationUrl: '',
  rsvpNote: '',
  rsvpDeadline: '',
  replyMode: 'Both',
  acceptLabel: 'تأكيد',
  declineLabel: 'اعتذار',
})
