import { apiBlob, apiClient } from '@/api/client'

/* Event Accreditation (EAMS) — separate from the invitation system. */

export type AccStageKind = 'open' | 'approved' | 'rejected'
export type AccStage = { key: string; name: string; kind: AccStageKind; color: string }
export type AccFieldType = 'text' | 'textarea' | 'select' | 'date' | 'url'
export type AccField = { key: string; label: string; type: AccFieldType; required: boolean; options: string[] | null }
export type AccDocumentRule = { key: string; label: string; required: boolean; needsExpiry: boolean }
export type AccMailTemplate = { enabled: boolean; subject: string; body: string }
export type AccNotifications = { submitted: AccMailTemplate; approved: AccMailTemplate; rejected: AccMailTemplate }
export type AccEventStatus = 'Draft' | 'Open' | 'Closed' | 'Archived'

export type AccEventSummary = {
  id: string
  name: string
  slug: string
  venue: string | null
  startDate: string
  endDate: string
  timezone: string
  status: AccEventStatus
  publicApplyEnabled: boolean
  applicants: number
  pending: number
  approved: number
  rejected: number
  organizations: number
  updatedOn: string
  /** The event this accreditation belongs to; null for an accreditation-only event. */
  eventId?: string | null
}

export type AccEventWrite = {
  name: string
  slug: string
  venue: string | null
  startDate: string | null
  endDate: string | null
  timezone: string
  status: AccEventStatus
  publicApplyEnabled: boolean
}

export type AccZone = { id: string | null; code: string; name: string; color: string; capacity: number | null }
export type AccProfile = { id: string | null; name: string; color: string; zoneIds: string[] }
export type AccApplicantType = {
  id: string | null
  name: string
  fields: AccField[]
  documents: AccDocumentRule[]
  defaultProfileId: string | null
}

export type AccSetup = {
  event: AccEventSummary
  zones: AccZone[]
  profiles: AccProfile[]
  types: AccApplicantType[]
  stages: AccStage[]
  notifications: AccNotifications
  publicApplyPath: string
}

export type AccOrgUser = {
  id: string
  name: string
  email: string
  isActive: boolean
  invitePending: boolean
  inviteExpiresOn: string | null
  lastLoginOn: string | null
}

export type AccOrganization = {
  id: string
  name: string
  applicantTypeId: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  quota: number | null
  applicants: number
  pending: number
  approved: number
  rejected: number
  users: AccOrgUser[]
}

export type AccOrganizationWrite = {
  name: string
  applicantTypeId: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  quota: number | null
}

export type AccDocumentInput = { kind: string; label: string | null; fileId: string; expiresOn: string | null }

export type AccApplicantWrite = {
  organizationId: string | null
  applicantTypeId: string | null
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  jobTitle: string | null
  nationality: string | null
  dateOfBirth: string | null
  idNumber: string | null
  photoFileId: string | null
  customFields: Record<string, string | null>
  documents: AccDocumentInput[]
}

export type AccApplicantRow = {
  id: string
  firstName: string
  lastName: string
  email: string | null
  jobTitle: string | null
  nationality: string | null
  organizationId: string | null
  organization: string | null
  applicantTypeId: string | null
  applicantType: string | null
  stageKey: string
  accessProfileId: string | null
  accessProfile: string | null
  badgeNumber: number | null
  photoFileId: string | null
  idNumberMasked: string | null
  source: string
  duplicateCount: number
  documentsPending: number
  submittedOn: string
  updatedOn: string
}

export type AccDocument = {
  id: string
  kind: string
  label: string
  fileId: string
  fileName: string
  contentType: string
  expiresOn: string | null
  status: 'Pending' | 'Verified' | 'Rejected'
  expired: boolean
  uploadedOn: string
}

export type AccDuplicate = { id: string; name: string; organization: string | null; stageKey: string; reasons: string[] }
export type AccAudit = {
  id: string
  applicantId: string | null
  applicantName: string | null
  actorName: string
  action: string
  detail: string | null
  createdOn: string
}

export type AccApplicantDetail = {
  summary: AccApplicantRow
  phone: string | null
  dateOfBirth: string | null
  customFields: Record<string, string | null>
  extraZoneIds: string[]
  effectiveZoneIds: string[]
  rejectionReason: string | null
  credentialCode: string
  decidedOn: string | null
  decidedByName: string | null
  documents: AccDocument[]
  duplicates: AccDuplicate[]
  history: AccAudit[]
}

export type AccDecisionResult = { updated: number; warnings: string[]; skipped: string[] }

export type AccBulkRow = {
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  jobTitle: string | null
  nationality: string | null
  dateOfBirth: string | null
  idNumber: string | null
  applicantType: string | null
  photoFileId: string | null
  customFields: Record<string, string | null> | null
}

export type AccBulkResult = { created: number; errors: { row: number; message: string }[] }
export type AccFile = { id: string; fileName: string; contentType: string; size: number }
export type AccCount = { key: string; label: string; count: number; color?: string | null }
export type AccZoneUsage = { id: string; code: string; name: string; color: string; capacity: number | null; used: number }

export type AccOverview = {
  event: AccEventSummary
  byStage: AccCount[]
  byType: AccCount[]
  byOrganization: AccCount[]
  zones: AccZoneUsage[]
  duplicatesFlagged: number
  documentsPending: number
  documentsExpired: number
  recent: AccAudit[]
}

export type AccTeamMember = {
  id: string
  firstName: string
  lastName: string
  email: string
  role: string
  isActive: boolean
  lastLoginOn: string | null
}

export type AccTeamWrite = {
  firstName: string
  lastName: string
  email: string
  role: string
  password: string | null
  isActive: boolean
}

export type AccApplicantFilters = {
  stage?: string
  organizationId?: string
  typeId?: string
  search?: string
  duplicates?: boolean
}

/* ---------------- Badges & printing (phase 2) ---------------- */

export type AccBadgeKind =
  | 'fullName'
  | 'firstName'
  | 'lastName'
  | 'organization'
  | 'jobTitle'
  | 'applicantType'
  | 'badgeNumber'
  | 'nationality'
  | 'accessProfile'
  | 'eventName'
  | 'text'
  | 'photo'
  | 'qr'
  | 'zones'
  | 'profileBand'
  | 'rect'
  | 'image'

/** One element on a badge: position/size in mm, font size in pt. */
export type AccBadgeElement = {
  id: string
  kind: AccBadgeKind
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  fontWeight: 'regular' | 'semibold' | 'bold'
  color: string
  fill: string | null
  radius: number
  align: 'left' | 'center' | 'right'
  valign: 'top' | 'middle' | 'bottom'
  uppercase: boolean
  text: string | null
  font: string | null
  fileId: string | null
}

export type AccBadgeDesign = {
  widthMm: number
  heightMm: number
  backgroundColor: string
  backgroundFileId: string | null
  elements: AccBadgeElement[]
}

export type AccBadgeTemplate = {
  id: string
  name: string
  design: AccBadgeDesign
  applicantTypeIds: string[]
  isDefault: boolean
  updatedOn: string
}

export type AccBadgeTemplateWrite = {
  name: string
  design: AccBadgeDesign | null
  applicantTypeIds: string[]
  isDefault: boolean
}

export type AccBadgeZone = { code: string; name: string; color: string }
export type AccPrintStatus = 'ToPrint' | 'Printed' | 'Collected'

/** Everything needed to draw one person's badge. */
export type AccPrintRow = {
  id: string
  firstName: string
  lastName: string
  organizationId: string | null
  organization: string | null
  applicantTypeId: string | null
  applicantType: string | null
  jobTitle: string | null
  nationality: string | null
  badgeNumber: number | null
  credentialCode: string
  photoFileId: string | null
  accessProfile: string | null
  profileColor: string | null
  zones: AccBadgeZone[]
  templateId: string | null
  printCount: number
  lastPrintedOn: string | null
  collectedOn: string | null
  status: AccPrintStatus
}

export type AccPrintQueue = {
  eventName: string
  rows: AccPrintRow[]
  templates: AccBadgeTemplate[]
  toPrint: number
  printed: number
  collected: number
}

export type AccPrintFilters = { status?: AccPrintStatus | 'All'; organizationId?: string; typeId?: string; search?: string }

/* ---------------- Gate scanning (phase 3, online) ---------------- */

export type AccScanColor = 'green' | 'yellow' | 'red'

export type AccScanRequest = { code: string; zoneId: string | null; gateName: string; direction: 'in' | 'out'; allowGuests: boolean }

export type AccScanPerson = {
  id: string
  name: string
  organization: string | null
  jobTitle: string | null
  applicantType: string | null
  badgeNumber: number | null
  photoFileId: string | null
  accessProfile: string | null
  profileColor: string | null
  zones: AccBadgeZone[]
}

export type AccScanGuest = { id: string; name: string; company: string | null; position: string | null; guestTypeName: string | null; checkInCount: number }

export type AccScanResult = {
  result: AccScanColor
  reason: string
  title: string
  message: string
  person: AccScanPerson | null
  guest: AccScanGuest | null
  gateLabel: string
  scannedOn: string
}

export type AccScanRow = {
  id: string
  result: AccScanColor
  reason: string
  name: string | null
  organization: string | null
  gateName: string
  zoneCode: string | null
  direction: 'in' | 'out'
  scannedByName: string
  scannedOn: string
}

export type AccLive = {
  onSite: number
  zones: { id: string | null; code: string; name: string; color: string; capacity: number | null; inside: number }[]
  scansToday: number
  grantedToday: number
  wrongZoneToday: number
  deniedToday: number
  hours: { hour: string; granted: number; denied: number }[]
  recent: AccScanRow[]
}

const base = '/api/accreditation/events'
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

export const accApi = {
  list: () => apiClient<AccEventSummary[]>(base),
  /** The accreditation of an (invitation) event, or null. */
  forEvent: (eventId: string) => apiClient<AccEventSummary | null>(`/api/events/${eventId}/accreditation`),
  startForEvent: (eventId: string) => apiClient<AccEventSummary>(`/api/events/${eventId}/accreditation`, { method: 'POST' }),
  get: (id: string) => apiClient<AccEventSummary>(`${base}/${id}`),
  create: (body: AccEventWrite) => apiClient<AccEventSummary>(base, json('POST', body)),
  update: (id: string, body: AccEventWrite) => apiClient<AccEventSummary>(`${base}/${id}`, json('PUT', body)),
  clone: (id: string, body: { name: string; slug: string; startDate: string | null; endDate: string | null }) =>
    apiClient<AccEventSummary>(`${base}/${id}/clone`, json('POST', body)),
  overview: (id: string) => apiClient<AccOverview>(`${base}/${id}/overview`),
  setup: (id: string) => apiClient<AccSetup>(`${base}/${id}/setup`),
  saveZones: (id: string, zones: AccZone[]) => apiClient<AccSetup>(`${base}/${id}/zones`, json('PUT', zones)),
  saveProfiles: (id: string, profiles: AccProfile[]) => apiClient<AccSetup>(`${base}/${id}/profiles`, json('PUT', profiles)),
  saveTypes: (id: string, types: AccApplicantType[]) => apiClient<AccSetup>(`${base}/${id}/types`, json('PUT', types)),
  saveStages: (id: string, stages: AccStage[]) => apiClient<AccSetup>(`${base}/${id}/stages`, json('PUT', stages)),
  saveNotifications: (id: string, notifications: AccNotifications) =>
    apiClient<AccSetup>(`${base}/${id}/notifications`, json('PUT', notifications)),
  audit: (id: string, options: { applicantId?: string; take?: number; before?: string } = {}) => {
    const params = new URLSearchParams()
    if (options.applicantId) params.set('applicantId', options.applicantId)
    if (options.take) params.set('take', String(options.take))
    if (options.before) params.set('before', options.before)
    return apiClient<AccAudit[]>(`${base}/${id}/audit?${params}`)
  },

  organizations: (id: string) => apiClient<AccOrganization[]>(`${base}/${id}/organizations`),
  createOrganization: (id: string, body: AccOrganizationWrite) =>
    apiClient<AccOrganization[]>(`${base}/${id}/organizations`, json('POST', body)),
  updateOrganization: (id: string, orgId: string, body: AccOrganizationWrite) =>
    apiClient<AccOrganization[]>(`${base}/${id}/organizations/${orgId}`, json('PUT', body)),
  deleteOrganization: (id: string, orgId: string) =>
    apiClient<AccOrganization[]>(`${base}/${id}/organizations/${orgId}`, { method: 'DELETE' }),
  invite: (id: string, orgId: string, body: { name: string; email: string }) =>
    apiClient<{ organizations: AccOrganization[]; link: string }>(`${base}/${id}/organizations/${orgId}/users`, json('POST', body)),
  resendInvite: (id: string, userId: string) =>
    apiClient<{ organizations: AccOrganization[]; link: string }>(`${base}/${id}/organizations/users/${userId}/resend`, { method: 'POST' }),
  setOrgUserActive: (id: string, userId: string, isActive: boolean) =>
    apiClient<AccOrganization[]>(`${base}/${id}/organizations/users/${userId}/active`, json('PUT', { isActive })),

  applicants: (id: string, filters: AccApplicantFilters = {}) => {
    const params = new URLSearchParams()
    if (filters.stage) params.set('stage', filters.stage)
    if (filters.organizationId) params.set('organizationId', filters.organizationId)
    if (filters.typeId) params.set('typeId', filters.typeId)
    if (filters.search) params.set('search', filters.search)
    if (filters.duplicates) params.set('duplicates', 'true')
    return apiClient<AccApplicantRow[]>(`${base}/${id}/applicants?${params}`)
  },
  applicant: (id: string, applicantId: string) => apiClient<AccApplicantDetail>(`${base}/${id}/applicants/${applicantId}`),
  createApplicant: (id: string, body: AccApplicantWrite) => apiClient<AccApplicantDetail>(`${base}/${id}/applicants`, json('POST', body)),
  updateApplicant: (id: string, applicantId: string, body: AccApplicantWrite) =>
    apiClient<AccApplicantDetail>(`${base}/${id}/applicants/${applicantId}`, json('PUT', body)),
  bulk: (id: string, organizationId: string | null, rows: AccBulkRow[]) =>
    apiClient<AccBulkResult>(`${base}/${id}/applicants/bulk`, json('POST', { organizationId, rows })),
  move: (id: string, ids: string[], stageKey: string, reason: string | null) =>
    apiClient<AccDecisionResult>(`${base}/${id}/applicants/stage`, json('POST', { ids, stageKey, reason })),
  setAccess: (id: string, applicantId: string, accessProfileId: string | null, extraZoneIds: string[]) =>
    apiClient<AccDecisionResult>(`${base}/${id}/applicants/${applicantId}/access`, json('PUT', { accessProfileId, extraZoneIds })),
  revealId: (id: string, applicantId: string) =>
    apiClient<{ idNumber: string | null }>(`${base}/${id}/applicants/${applicantId}/reveal-id`, { method: 'POST' }),
  addDocument: (id: string, applicantId: string, body: AccDocumentInput) =>
    apiClient<AccApplicantDetail>(`${base}/${id}/applicants/${applicantId}/documents`, json('POST', body)),
  setDocumentStatus: (id: string, applicantId: string, documentId: string, status: AccDocument['status']) =>
    apiClient<AccApplicantDetail>(`${base}/${id}/applicants/${applicantId}/documents/${documentId}`, json('PUT', { status })),

  upload: (id: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient<AccFile>(`${base}/${id}/files`, { method: 'POST', body: form })
  },
  fileBlob: (id: string, fileId: string) => apiBlob(`${base}/${id}/files/${fileId}`),

  badgeTemplates: (id: string) => apiClient<AccBadgeTemplate[]>(`${base}/${id}/badges/templates`),
  createBadgeTemplate: (id: string, body: AccBadgeTemplateWrite) =>
    apiClient<AccBadgeTemplate>(`${base}/${id}/badges/templates`, json('POST', body)),
  updateBadgeTemplate: (id: string, templateId: string, body: AccBadgeTemplateWrite) =>
    apiClient<AccBadgeTemplate>(`${base}/${id}/badges/templates/${templateId}`, json('PUT', body)),
  deleteBadgeTemplate: (id: string, templateId: string) =>
    apiClient<null>(`${base}/${id}/badges/templates/${templateId}`, { method: 'DELETE' }),
  printQueue: (id: string, filters: AccPrintFilters = {}) => {
    const params = new URLSearchParams()
    if (filters.status) params.set('status', filters.status)
    if (filters.organizationId) params.set('organizationId', filters.organizationId)
    if (filters.typeId) params.set('typeId', filters.typeId)
    if (filters.search) params.set('search', filters.search)
    return apiClient<AccPrintQueue>(`${base}/${id}/badges/queue?${params}`)
  },
  markPrinted: (id: string, ids: string[]) => apiClient<number>(`${base}/${id}/badges/printed`, json('POST', { ids })),
  setCollected: (id: string, ids: string[], collected: boolean) =>
    apiClient<number>(`${base}/${id}/badges/collected`, json('POST', { ids, collected })),
  reprint: (id: string, ids: string[], reason: string, revoke: boolean) =>
    apiClient<number>(`${base}/${id}/badges/reprint`, json('POST', { ids, reason, revoke })),

  scan: (id: string, body: AccScanRequest) => apiClient<AccScanResult>(`${base}/${id}/scan`, json('POST', body)),
  live: (id: string) => apiClient<AccLive>(`${base}/${id}/live`),

  team: () => apiClient<AccTeamMember[]>('/api/accreditation/team'),
  createTeamMember: (body: AccTeamWrite) => apiClient<AccTeamMember[]>('/api/accreditation/team', json('POST', body)),
  updateTeamMember: (userId: string, body: AccTeamWrite) => apiClient<AccTeamMember[]>(`/api/accreditation/team/${userId}`, json('PUT', body)),
}
