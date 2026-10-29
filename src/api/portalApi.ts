import { ApiError, apiBaseUrl } from '@/api/client'
import type {
  AccApplicantDetail,
  AccApplicantRow,
  AccApplicantWrite,
  AccBulkResult,
  AccBulkRow,
  AccDocumentRule,
  AccField,
  AccFile,
  AccStage,
} from '@/api/accreditationApi'
import type { ApiEnvelope } from '@/types/api'

/*
 * Organisation portal + public application. Not the staff sign-in: the portal keeps its own session code
 * (X-Portal-Token) so staff and portal sessions never mix.
 */

const TOKEN_KEY = 'entourage.portal.session'

export const portalSession = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token: string | null) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {
      // Private mode: the session lasts for this tab only.
    }
  },
}

async function send(path: string, init: RequestInit = {}, withSession = true): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const token = withSession ? portalSession.get() : null
  if (token) headers.set('X-Portal-Token', token)
  try {
    return await fetch(`${apiBaseUrl}${path}`, { ...init, headers })
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0)
  }
}

async function call<T>(path: string, init: RequestInit = {}, withSession = true): Promise<T> {
  const response = await send(path, init, withSession)
  const text = await response.text()
  let payload: ApiEnvelope<T> | null = null
  if (text) {
    try {
      payload = JSON.parse(text) as ApiEnvelope<T>
    } catch {
      throw new ApiError('The server returned an unexpected response.', response.status)
    }
  }
  if (!response.ok || payload?.success === false) {
    throw new ApiError(payload?.message || 'Request failed.', response.status, payload?.errors)
  }
  return payload?.data as T
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

export type PortalType = { id: string; name: string; fields: AccField[]; documents: AccDocumentRule[] }
export type PortalLoginResult = { token: string | null; expiresOn: string | null; choices: { accountId: string; organization: string; event: string }[] | null }

export type PortalMe = {
  userName: string
  userEmail: string
  organizationId: string
  organization: string
  event: string
  venue: string | null
  startDate: string
  endDate: string
  eventStatus: string
  acceptingApplications: boolean
  quota: number | null
  used: number
  defaultTypeId: string | null
  types: PortalType[]
  stages: AccStage[]
}

export type PublicApplyInfo = {
  event: string
  venue: string | null
  startDate: string
  endDate: string
  open: boolean
  types: PortalType[]
}

function upload(path: string, file: File, withSession: boolean) {
  const form = new FormData()
  form.append('file', file)
  return call<AccFile>(path, { method: 'POST', body: form }, withSession)
}

export const portalApi = {
  inviteInfo: (token: string) =>
    call<{ email: string; name: string; organization: string; event: string }>(`/api/portal/invite/${encodeURIComponent(token)}`, {}, false),
  acceptInvite: (token: string, name: string, password: string) =>
    call<PortalLoginResult>(`/api/portal/invite/${encodeURIComponent(token)}`, json('POST', { name, password }), false),
  login: (email: string, password: string, accountId?: string) =>
    call<PortalLoginResult>('/api/portal/login', json('POST', { email, password, accountId: accountId ?? null }), false),
  logout: () => call<null>('/api/portal/logout', { method: 'POST' }),
  me: () => call<PortalMe>('/api/portal/me'),
  applicants: () => call<AccApplicantRow[]>('/api/portal/applicants'),
  applicant: (id: string) => call<AccApplicantDetail>(`/api/portal/applicants/${id}`),
  create: (body: AccApplicantWrite) => call<AccApplicantDetail>('/api/portal/applicants', json('POST', body)),
  update: (id: string, body: AccApplicantWrite) => call<AccApplicantDetail>(`/api/portal/applicants/${id}`, json('PUT', body)),
  bulk: (rows: AccBulkRow[]) => call<AccBulkResult>('/api/portal/applicants/bulk', json('POST', { organizationId: null, rows })),
  upload: (file: File) => upload('/api/portal/files', file, true),
  async fileBlob(fileId: string): Promise<Blob> {
    const response = await send(`/api/portal/files/${fileId}`)
    if (!response.ok) throw new ApiError('The file could not be loaded.', response.status)
    return response.blob()
  },

  publicInfo: (slug: string) => call<PublicApplyInfo>(`/api/public/apply/${encodeURIComponent(slug)}`, {}, false),
  publicUpload: (slug: string, file: File) => upload(`/api/public/apply/${encodeURIComponent(slug)}/files`, file, false),
  publicSubmit: (slug: string, applicant: AccApplicantWrite, website: string) =>
    call<null>(`/api/public/apply/${encodeURIComponent(slug)}`, json('POST', { applicant, website }), false),
}
