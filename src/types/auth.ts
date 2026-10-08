export type User = {
  id: string
  firstName: string
  lastName: string
  email: string
  role: string
  isActive: boolean
  lastLoginOn: string | null
}

export type AuthSession = {
  accessToken: string
  expiresAt: string
  user: User
}
