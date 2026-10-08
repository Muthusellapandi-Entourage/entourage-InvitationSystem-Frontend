const storageKey = 'entourage.session'

type StoredSession = {
  accessToken: string
  expiresAt: string
}

export function readSession(): StoredSession | null {
  const raw = localStorage.getItem(storageKey)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as StoredSession
    if (!parsed.accessToken || !parsed.expiresAt) return null
    if (Date.parse(parsed.expiresAt) <= Date.now() + 30_000) {
      localStorage.removeItem(storageKey)
      return null
    }
    return parsed
  } catch {
    localStorage.removeItem(storageKey)
    return null
  }
}

export function writeSession(session: StoredSession) {
  localStorage.setItem(storageKey, JSON.stringify(session))
}

export function clearSession() {
  localStorage.removeItem(storageKey)
}
