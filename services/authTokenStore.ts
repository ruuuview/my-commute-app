// services/authTokenStore.ts
// Auth-token vault — Keychain via expo-secure-store (NOT MMKV).
// Locked by the remediation plan Phase 1: auth tokens live in the
// secure store; MMKV is for non-secret preference state only.

import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'mycommute.tfl.auth_token';
const TOKEN_META_KEY = 'mycommute.tfl.auth_token_meta'; // { issuedAt, expiresAt? }

export interface AuthTokenMeta {
  issuedAt: number;
  expiresAt?: number;
}

export async function saveAuthToken(
  token: string,
  meta?: AuthTokenMeta
): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  if (meta) {
    await SecureStore.setItemAsync(TOKEN_META_KEY, JSON.stringify(meta), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
}

export async function readAuthToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function readAuthTokenMeta(): Promise<AuthTokenMeta | null> {
  const raw = await SecureStore.getItemAsync(TOKEN_META_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthTokenMeta;
  } catch {
    return null;
  }
}

export async function clearAuthToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(TOKEN_META_KEY);
}

/** True when a non-expired token exists in Keychain. */
export async function hasValidAuthToken(): Promise<boolean> {
  const token = await readAuthToken();
  if (!token) return false;
  const meta = await readAuthTokenMeta();
  if (meta?.expiresAt && Date.now() > meta.expiresAt) return false;
  return true;
}
