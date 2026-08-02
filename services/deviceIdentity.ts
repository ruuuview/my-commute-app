// services/deviceIdentity.ts
// The one source of truth for device auth keys (userId + apiKey).
//
// Bug #3 fix: the app read 'userId'/'apiKey' from AsyncStorage in three
// places (refunds, SessionManager) but nothing ever wrote them — every user
// hit "Unable to Load Claims". This service guarantees the keys exist:
//   ensureDeviceIdentity() — reads AsyncStorage; if missing, creates the
//   profile server-side (POST /api/profile, no auth needed) and persists
//   the returned { userId, apiKey }.
//
// Called at onboarding finish AND lazily from the claims fetch, so existing
// installs self-heal without re-running onboarding.

import AsyncStorage from '@react-native-async-storage/async-storage'
import { APP_CONFIG } from '../config/app.config'

const USER_ID_KEY = 'userId'
const API_KEY_KEY = 'apiKey'

let identityPromise: Promise<{ userId: string; apiKey: string }> | null = null

async function createProfile(): Promise<{ userId: string; apiKey: string }> {
  const res = await fetch(`${APP_CONFIG.BACKEND_API_URL}/api/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!res.ok) throw new Error(`profile creation failed: HTTP ${res.status}`)
  const json = await res.json()
  if (!json.userId || !json.apiKey) throw new Error('profile response missing keys')
  await Promise.all([
    AsyncStorage.setItem(USER_ID_KEY, json.userId),
    AsyncStorage.setItem(API_KEY_KEY, json.apiKey),
  ])
  return { userId: json.userId, apiKey: json.apiKey }
}

// Idempotent + concurrency-safe: concurrent callers share one in-flight
// creation, so onboarding finish and a claims fetch can race safely.
export async function ensureDeviceIdentity(): Promise<{ userId: string; apiKey: string }> {
  const [storedUserId, storedApiKey] = await Promise.all([
    AsyncStorage.getItem(USER_ID_KEY),
    AsyncStorage.getItem(API_KEY_KEY),
  ])
  if (storedUserId && storedApiKey) {
    return { userId: storedUserId, apiKey: storedApiKey }
  }
  if (!identityPromise) {
    identityPromise = createProfile().finally(() => {
      identityPromise = null
    })
  }
  return identityPromise
}
