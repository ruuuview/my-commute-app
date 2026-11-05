import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { createMMKV } from 'react-native-mmkv';
import { APP_CONFIG } from '../config/app.config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithTimeout, TimeoutError } from '../utils/network';
import { ensureDeviceIdentity } from './deviceIdentity';

// ── Operational Constants ─────────────────────────────────────────────
// PUSH_REGISTRATION_TIMEOUT_MS: 15-second network timeout for device token backend registration
const PUSH_REGISTRATION_TIMEOUT_MS = 15000;
// PUSH_REGISTRATION_RETRY_DELAY_MS: 1-second backoff for transient cellular/WiFi handoff drops
const PUSH_REGISTRATION_RETRY_DELAY_MS = 1000;
// MAX_REGISTRATION_RETRIES: Maximum 1 retry on network or 5xx failures to prevent battery drain
const MAX_REGISTRATION_RETRIES = 1;

const STORAGE_KEY_TOKEN = 'registered_push_token_railway_v2';
const STORAGE_KEY_LINES = 'registered_push_lines_railway_v2';

// ── Delivery-mode profile sync (3-mode contract: loud/shush/off) ──────
// PROFILE_SYNC_TIMEOUT_MS: 10s timeout — half the push registration budget,
// a single tiny JSON body against /api/profile.
export const DELIVERY_MODE_SYNC_TIMEOUT_MS = 10000;

export type AlertDeliveryMode = 'loud' | 'shush' | 'off';
export const ALERT_DELIVERY_MODES: AlertDeliveryMode[] = ['loud', 'shush', 'off'];

// Offline queue: latest-wins string in its own MMKV store id so the live
// delivery decision never depends on network availability.
const DELIVERY_MODE_QUEUE_ID = 'delivery-mode-queue';
const DELIVERY_MODE_QUEUE_KEY = 'pending_delivery_mode_sync';
const deliveryModeQueue = createMMKV({ id: DELIVERY_MODE_QUEUE_ID });

function assertDeliveryMode(mode: AlertDeliveryMode): void {
  if (!ALERT_DELIVERY_MODES.includes(mode)) {
    throw new Error(`invalid delivery mode: ${String(mode)} (expected loud|shush|off)`);
  }
}

async function postDeliveryModeProfile(mode: AlertDeliveryMode): Promise<boolean> {
  const { userId, apiKey } = await ensureDeviceIdentity().catch(() => ({
    userId: undefined as string | undefined,
    apiKey: undefined as string | undefined,
  }));
  const response = await fetchWithTimeout(`${APP_CONFIG.BACKEND_URL}/api/profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(userId && { 'x-user-id': userId }),
      ...(apiKey && { 'x-api-key': apiKey }),
    },
    timeoutMs: DELIVERY_MODE_SYNC_TIMEOUT_MS,
    body: JSON.stringify({ alertDeliveryMode: mode }),
  });
  return response.ok;
}

/**
 * Sync the delivery mode to the backend profile. On network failure the mode
 * is persisted latest-wins into the MMKV offline queue; flushPendingDeliveryModeSync
 * delivers it on the next successful registration cycle.
 */
export async function syncAlertDeliveryMode(
  mode: AlertDeliveryMode
): Promise<{ synced: boolean; queued: boolean }> {
  assertDeliveryMode(mode);
  try {
    const ok = await postDeliveryModeProfile(mode);
    if (ok) {
      // Success also drains any stale queued mode — server is reachable again.
      try {
        if (deliveryModeQueue.contains(DELIVERY_MODE_QUEUE_KEY)) {
          const pending = deliveryModeQueue.getString(DELIVERY_MODE_QUEUE_KEY);
          deliveryModeQueue.remove(DELIVERY_MODE_QUEUE_KEY);
          if (pending && pending !== mode) {
            await postDeliveryModeProfile(pending as AlertDeliveryMode);
          }
        }
      } catch {
        // Queue drain is best-effort; primary sync already succeeded.
      }
      return { synced: true, queued: false };
    }
    // 4xx = server permanently rejected (never queue-retry those); 5xx = retryable.
    return { synced: false, queued: false };
  } catch {
    deliveryModeQueue.set(DELIVERY_MODE_QUEUE_KEY, mode);
    return { synced: false, queued: true };
  }
}

/**
 * Deliver the queued delivery mode after a network recovery point.
 * Returns true only when a queued value existed AND was delivered.
 */
export async function flushPendingDeliveryModeSync(): Promise<boolean> {
  try {
    if (!deliveryModeQueue.contains(DELIVERY_MODE_QUEUE_KEY)) {
      return false;
    }
    const pending = deliveryModeQueue.getString(DELIVERY_MODE_QUEUE_KEY) as
      | AlertDeliveryMode
      | undefined;
    if (!pending) {
      deliveryModeQueue.remove(DELIVERY_MODE_QUEUE_KEY);
      return false;
    }
    const ok = await postDeliveryModeProfile(pending);
    if (ok) {
      deliveryModeQueue.remove(DELIVERY_MODE_QUEUE_KEY);
    }
    return ok;
  } catch {
    return false;
  }
}

/**
 * Normalize watched line ids for the backend watch list:
 * lowercased, trimmed, empties dropped, deduped, sorted (stable diffing).
 */
export function normalizeLineIds(lines: string[]): string[] {
  return [
    ...new Set(
      (lines ?? [])
        .map((l) => String(l ?? '').toLowerCase().trim())
        .filter((l) => l.length > 0)
    ),
  ].sort();
}

// Lazy load FCM on Android
let messaging: any = null;
if (Platform.OS === 'android') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    messaging = require('@react-native-firebase/messaging').default;
  } catch {
    console.warn('⚠️ FCM: React Native Firebase not available');
  }
}

/**
 * Internal helper to send push token registration to backend with retry & timeout handling.
 */
async function registerDevicePushToken(
  token: string,
  selectedLines: string[],
  retriesRemaining: number = MAX_REGISTRATION_RETRIES
): Promise<boolean> {
  const normalizedLines = normalizeLineIds(selectedLines);
  try {
    const { userId, apiKey } = await ensureDeviceIdentity().catch(() => ({ userId: undefined, apiKey: undefined }));
    console.log(
      `📱 [PushService] Sending registration request to backend for user ${userId || 'anonymous'} token ${token.substring(0, 12)}... with lines:`,
      normalizedLines
    );

    const response = await fetchWithTimeout(`${APP_CONFIG.BACKEND_URL}/api/devices/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(userId && { 'x-user-id': userId }),
        ...(apiKey && { 'x-api-key': apiKey }),
      },
      timeoutMs: PUSH_REGISTRATION_TIMEOUT_MS,
      body: JSON.stringify({
        token: token,
        lines: normalizedLines,
        userId,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ [PushService] Push Token registered with backend:', data);
      await AsyncStorage.setItem(STORAGE_KEY_TOKEN, token);
      await AsyncStorage.setItem(STORAGE_KEY_LINES, JSON.stringify(normalizedLines));
      return true;
    }

    const errorText = await response.text();
    // Retry on 5xx server errors
    if (response.status >= 500 && retriesRemaining > 0) {
      console.warn(`⚠️ [PushService] Backend returned HTTP ${response.status}. Retrying in ${PUSH_REGISTRATION_RETRY_DELAY_MS}ms...`);
      await new Promise(res => setTimeout(res, PUSH_REGISTRATION_RETRY_DELAY_MS));
      return registerDevicePushToken(token, selectedLines, retriesRemaining - 1);
    }

    console.error(`❌ [PushService] Failed to register push token (HTTP ${response.status}):`, errorText);
    return false;
  } catch (error: any) {
    if (error instanceof TimeoutError) {
      console.warn(`⚠️ [PushService] Registration timed out after ${error.timeoutMs}ms.`);
    } else {
      console.warn('⚠️ [PushService] Network error during push token registration:', error?.message ?? error);
    }

    if (retriesRemaining > 0) {
      console.log(`🔄 [PushService] Retrying registration in ${PUSH_REGISTRATION_RETRY_DELAY_MS}ms (${retriesRemaining} retry left)...`);
      await new Promise(res => setTimeout(res, PUSH_REGISTRATION_RETRY_DELAY_MS));
      return registerDevicePushToken(token, selectedLines, retriesRemaining - 1);
    }

    console.error('❌ [PushService] Push token registration exhausted retries.');
    return false;
  }
}

export async function syncPushTokenWithBackend(selectedLines: string[]) {
  try {
    // Network recovery point: drain any offline delivery-mode change first.
    void flushPendingDeliveryModeSync();

    const notif = await Notifications.getPermissionsAsync().catch(() => null);
    const isGranted = Boolean(
      notif?.granted ||
      notif?.status === 'granted' ||
      (notif?.ios && (notif.ios.status === 2 || notif.ios.status === 3 || notif.ios.allowsAlert))
    );

    if (!isGranted) {
      return;
    }

    let token: string | null = null;
    if (Platform.OS === 'ios') {
      // Direct APNS token registration (hex string)
      try {
        const devicePushToken = await Notifications.getDevicePushTokenAsync();
        token = devicePushToken.data;
        console.log('📱 [PushService] APNS: Fetched iOS device push token:', token ? `${token.substring(0, 12)}...` : null);
      } catch (err) {
        console.warn('⚠️ [PushService] APNS: Failed to fetch iOS device token (expected in Expo Go), attempting Expo push token fallback:', err);
        try {
          const expoPushToken = await Notifications.getExpoPushTokenAsync();
          token = expoPushToken.data;
          console.log('📱 [PushService] Expo: Fetched Expo push token:', token ? `${token.substring(0, 15)}...` : null);
        } catch (expoErr) {
          console.warn('⚠️ [PushService] Failed to fetch Expo push token:', expoErr);
        }
      }
    } else if (Platform.OS === 'android' && messaging) {
      try {
        token = await messaging().getToken();
        console.log('📱 [PushService] FCM: Fetched Android device push token:', token ? `${token.substring(0, 12)}...` : null);
      } catch (err) {
        console.error('❌ [PushService] FCM token fetch failed:', err);
      }
    }

    if (!token) {
      console.log('⚠️ [PushService] No push token retrieved.');
      return;
    }

    const normalizedLines = normalizeLineIds(selectedLines);
    const { userId } = await ensureDeviceIdentity().catch(() => ({ userId: undefined }));
    // Always perform registration to guarantee backend profile has the live token
    const registered = await registerDevicePushToken(token, normalizedLines);
    if (registered && userId) {
      await AsyncStorage.setItem('registered_push_user_id_v3', userId);
      await AsyncStorage.setItem(STORAGE_KEY_TOKEN, token);
      await AsyncStorage.setItem(STORAGE_KEY_LINES, JSON.stringify(normalizedLines));
    }
  } catch (error) {
    console.error('❌ [PushService] Error in syncPushTokenWithBackend:', error);
  }
}
