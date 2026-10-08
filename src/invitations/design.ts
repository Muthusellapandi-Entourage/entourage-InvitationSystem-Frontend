export const invitationFonts = ['Manifa Bold', 'Manifa Italic', 'Arial', 'Georgia', 'Times New Roman'] as const

export type InvitationFont = (typeof invitationFonts)[number]

export type TextAlign = 'left' | 'center' | 'right'

export type GuestFieldDesign = {
  enabled: boolean
  font: InvitationFont
  fontSize: number
  mobileFontSize: number
  color: string
  alignment: TextAlign
  leftPadding: number
  topSpacing: number
}

export type InvitationDesign = {
  headerAssetId: string | null
  guestName: GuestFieldDesign
  guestPosition: GuestFieldDesign
  detailsAssetId: string | null
  acceptAssetId: string | null
  declineAssetId: string | null
}

export type InvitationTemplate = {
  design: InvitationDesign
  html?: string | null
  updatedOn?: string | null
}

export type EventAssetItem = {
  id: string
  fileName: string
  url: string
}

export function defaultInvitationDesign(): InvitationDesign {
  return {
    headerAssetId: null,
    guestName: {
      enabled: true,
      font: 'Manifa Bold',
      fontSize: 30,
      mobileFontSize: 24,
      color: '#FFFFFF',
      alignment: 'left',
      leftPadding: 70,
      topSpacing: 20,
    },
    guestPosition: {
      enabled: true,
      font: 'Manifa Italic',
      fontSize: 15,
      mobileFontSize: 12,
      color: '#FFFFFF',
      alignment: 'left',
      leftPadding: 70,
      topSpacing: 5,
    },
    detailsAssetId: null,
    acceptAssetId: null,
    declineAssetId: null,
  }
}

export function normalizeInvitationDesign(value: Partial<InvitationDesign> | null | undefined): InvitationDesign {
  const base = defaultInvitationDesign()
  if (!value) return base
  return {
    headerAssetId: value.headerAssetId ?? null,
    guestName: { ...base.guestName, ...value.guestName },
    guestPosition: { ...base.guestPosition, ...value.guestPosition },
    detailsAssetId: value.detailsAssetId ?? null,
    acceptAssetId: value.acceptAssetId ?? null,
    declineAssetId: value.declineAssetId ?? null,
  }
}
