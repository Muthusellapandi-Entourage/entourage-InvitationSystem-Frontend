import type { PublicClientApplication } from '@azure/msal-browser'

/**
 * "Sign in with Microsoft" using a full-page redirect (works on phones, where pop-ups are blocked).
 * Microsoft sends the person back to /login, which finishes the sign-in. The redirect address must be
 * registered on the app in Microsoft Entra as a "Single-page application" redirect URI.
 */
let client: { key: string; app: Promise<PublicClientApplication> } | null = null

export const microsoftRedirectUri = () => `${window.location.origin}/login`

async function app(tenantId: string, clientId: string) {
  const key = `${tenantId}/${clientId}`
  if (!client || client.key !== key) {
    client = {
      key,
      app: (async () => {
        const msal = await import('@azure/msal-browser')
        const instance = new msal.PublicClientApplication({
          auth: {
            clientId,
            authority: `https://login.microsoftonline.com/${tenantId}`,
            redirectUri: microsoftRedirectUri(),
            navigateToLoginRequestUrl: false,
          },
          cache: { cacheLocation: 'sessionStorage' },
        })
        await instance.initialize()
        return instance
      })(),
    }
  }
  return client.app
}

/** Leaves the page for Microsoft's sign-in screen. */
export async function startMicrosoftSignIn(tenantId: string, clientId: string, returnTo: string | null) {
  const instance = await app(tenantId, clientId)
  await instance.loginRedirect({
    scopes: ['openid', 'profile', 'email'],
    prompt: 'select_account',
    state: returnTo ?? undefined,
  })
}

/** On /login after Microsoft sends the person back: the ID token and where they were going, or null. */
export async function finishMicrosoftSignIn(tenantId: string, clientId: string) {
  const instance = await app(tenantId, clientId)
  const result = await instance.handleRedirectPromise()
  if (!result?.idToken) return null
  return { idToken: result.idToken, returnTo: result.state || null }
}
