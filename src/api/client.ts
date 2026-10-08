import type { ApiEnvelope } from '@/types/api'

export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

const baseUrl = apiBaseUrl

let accessTokenGetter: () => string | null = () => null
let unauthorizedHandler: () => void = () => {}

export function setAccessTokenGetter(getter: () => string | null) {
  accessTokenGetter = getter
}

export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler
}

export class ApiError extends Error {
  readonly status: number
  readonly errors?: Record<string, string[]>

  constructor(message: string, status: number, errors?: Record<string, string[]>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
  }
}

export async function apiClient<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/json')
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const token = accessTokenGetter()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, { ...init, headers })
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0)
  }

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
    if (response.status === 401 && !path.startsWith('/api/auth/login')) {
      unauthorizedHandler()
    }

    throw new ApiError(
      payload?.message || 'Request failed.',
      response.status,
      payload?.errors,
    )
  }

  return payload?.data as T
}
