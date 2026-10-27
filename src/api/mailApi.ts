import { apiClient } from '@/api/client'

/** "smtp" = any SMTP server (Gmail, other providers). "graph" = Microsoft 365 through Microsoft Graph. */
export type MailProvider = 'smtp' | 'graph'

export type MailSettings = {
  configured: boolean
  provider: MailProvider
  host: string
  port: number
  enableSsl: boolean
  username: string | null
  /** True when a password is saved. The password itself is never sent to the browser. */
  hasPassword: boolean
  fromEmail: string
  fromName: string | null
  graphTenantId: string | null
  graphClientId: string | null
  /** True when a Graph client secret is saved. The secret itself is never sent to the browser. */
  hasGraphSecret: boolean
  updatedOn: string | null
}

export type MailSettingsWrite = {
  provider: MailProvider
  host: string
  port: number
  enableSsl: boolean
  username: string | null
  /** Empty keeps the saved password. */
  password: string | null
  fromEmail: string
  fromName: string | null
  graphTenantId: string | null
  graphClientId: string | null
  /** Empty keeps the saved secret. */
  graphClientSecret: string | null
}

export const mailApi = {
  get() {
    return apiClient<MailSettings>('/api/settings/mail')
  },

  save(body: MailSettingsWrite) {
    return apiClient<MailSettings>('/api/settings/mail', {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  },

  test(to: string) {
    return apiClient<null>('/api/settings/mail/test', {
      method: 'POST',
      body: JSON.stringify({ to }),
    })
  },
}
