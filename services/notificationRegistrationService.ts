import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { APP_CONFIG } from '../config/app.config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestPermission } from '../store/permissionOrchestrator';

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
        console.log('⚠️ Push permission not granted. Skipping token registration.');
        return;
      }
    }

    let token: string | null = null;
    if (Platform.OS === 'ios') {
      // Direct APNS token registration (hex string)
      try {
        const devicePushToken = await Notifications.getDevicePushTokenAsync();
        token = devicePushToken.data;
        console.log('📱 APNS: Fetched iOS device push token:', token ? `${token.substring(0, 12)}...` : null);
      } catch (err) {
        console.warn('⚠️ APNS: Failed to fetch iOS device token (this is expected on simulator):', err);
      }
    } else if (Platform.OS === 'android' && messaging) {
      try {
        token = await messaging().getToken();
        console.log('📱 FCM: Fetched Android device push token:', token ? `${token.substring(0, 12)}...` : null);
      } catch (err) {
        console.error('❌ FCM token fetch failed:', err);
      }
    }

    if (!token) {
      console.log('⚠️ No push token retrieved.');
      return;
    }

    // Register with Vercel backend
    console.log(`📱 Sending registration request to backend for token ${token.substring(0, 12)}... with lines:`, selectedLines);
    const response = await fetch(`${APP_CONFIG.BACKEND_URL}/api/devices/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        token: token,
        lines: selectedLines,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Push Token registered with backend:', data);
      await AsyncStorage.setItem('registered_push_token', token);
      await AsyncStorage.setItem('registered_push_lines', JSON.stringify(selectedLines));
    } else {
      const errorText = await response.text();
      console.error('❌ Failed to register push token with backend:', errorText);
    }
  } catch (error) {
    console.error('❌ Error in syncPushTokenWithBackend:', error);
  }
}
