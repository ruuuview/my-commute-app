import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { APP_CONFIG } from '../config/app.config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestPermission } from '../store/permissionOrchestrator';
import { fetchWithTimeout, TimeoutError } from '../utils/network';

// ── Operational Constants ─────────────────────────────────────────────
// PUSH_REGISTRATION_TIMEOUT_MS: 15-second network timeout for device token backend registration
const PUSH_REGISTRATION_TIMEOUT_MS = 15000;
// PUSH_REGISTRATION_RETRY_DELAY_MS: 1-second backoff for transient cellular/WiFi handoff drops
const PUSH_REGISTRATION_RETRY_DELAY_MS = 1000;
// MAX_REGISTRATION_RETRIES: Maximum 1 retry on network or 5xx failures to prevent battery drain
const MAX_REGISTRATION_RETRIES = 1;

const STORAGE_KEY_TOKEN = 'registered_push_token_railway_v2';
const STORAGE_KEY_LINES = 'registered_push_lines_railway_v2';

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

import { ensureDeviceIdentity } from './deviceIdentity';

/**
 * Internal helper to send push token registration to backend with retry & timeout handling.
 */
async function registerDevicePushToken(
  token: string,
  selectedLines: string[],
  retriesRemaining: number = MAX_REGISTRATION_RETRIES
): Promise<boolean> {
  const normalizedLines = [...selectedLines].sort();
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
    // Check permission first. If it is not granted, route the ask through the
    // orchestrator so dedupe, cooldown, and analytics apply.
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const decision = await requestPermission('notifications', 'push_token_registration', {
        primer: false,
      });
      if (decision !== 'granted') {
        console.log('⚠️ [PushService] Push permission not granted. Skipping token registration.');
        return;
      }
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

    const normalizedLines = [...selectedLines].sort();
    const { userId } = await ensureDeviceIdentity().catch(() => ({ userId: undefined }));
    const [cachedToken, cachedLinesRaw, cachedUserId] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY_TOKEN),
      AsyncStorage.getItem(STORAGE_KEY_LINES),
      AsyncStorage.getItem('registered_push_user_id_v2'),
    ]);

    let cachedLinesJson: string | null = null;
    if (cachedLinesRaw) {
      try {
        const cachedLines = JSON.parse(cachedLinesRaw);
        if (Array.isArray(cachedLines)) {
          cachedLinesJson = JSON.stringify([...cachedLines].sort());
        }
      } catch {
        await AsyncStorage.removeItem(STORAGE_KEY_LINES);
      }
    }
    const currentLinesJson = JSON.stringify(normalizedLines);

    if (cachedToken === token && cachedLinesJson === currentLinesJson && cachedUserId === userId) {
      console.log('📱 [PushService] Token, userId, and lines already synced with backend. Skipping redundant network call.');
      return;
    }

    // Perform registration with retry & timeout protection
    const registered = await registerDevicePushToken(token, normalizedLines);
    if (registered && userId) {
      await AsyncStorage.setItem('registered_push_user_id_v2', userId);
    }
  } catch (error) {
    console.error('❌ [PushService] Error in syncPushTokenWithBackend:', error);
  }
}
