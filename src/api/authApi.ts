import { apiClient } from '@/api/client'
import type { AuthSession, User } from '@/types/auth'

export type AuthOptions = {
  passwordLogin: boolean
  /** Null while Microsoft sign-in is not set up on the server. */
  microsoft: { tenantId: string; clientId: string } | null
}

export const authApi = {
  options() {
    return apiClient<AuthOptions>('/api/auth/options')
  },

  microsoft(idToken: string) {
    return apiClient<AuthSession>('/api/auth/microsoft', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    })
  },

  login(email: string, password: string) {
    return apiClient<AuthSession>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  },

  me() {
    return apiClient<User>('/api/auth/me')
  },

  logout() {
    return apiClient<null>('/api/auth/logout', { method: 'POST' })
  },
}
