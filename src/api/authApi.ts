import { apiClient } from '@/api/client'
import type { AuthSession, User } from '@/types/auth'

export const authApi = {
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
