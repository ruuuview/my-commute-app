/**
 * FCM Service - Firebase Cloud Messaging Integration
 * Handles device token registration and push notification receiving for Android
 * * NOTE: Requires custom development build - not compatible with Expo Go
 */

import { Platform, Alert } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = Constants.expoConfig?.extra?.BACKEND_URL || 'https://my-commute-backend.vercel.app';

// Lazy import to avoid crashes in Expo Go
let messaging: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  messaging = require('@react-native-firebase/messaging').default;
} catch {
  console.warn('⚠️ FCM: React Native Firebase not available (requires custom build)');
}

class FCMService {
  private isAvailable: boolean = false;

  constructor() {
    this.isAvailable = messaging !== null;
    if (!this.isAvailable) {
      console.log('⚠️ FCM: Native modules not available. This is expected in Expo Go.');
    }
  }

  async requestPermissions(): Promise<boolean> {
    if (!this.isAvailable) return false;
    try {
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;
      return enabled;
    } catch (error) {
      console.error('❌ FCM: Error requesting permissions:', error);
      return false;
    }
  }

  async getDeviceToken(): Promise<string | null> {
    if (!this.isAvailable) return null;
    try {
      const token = await messaging().getToken();
      return token;
    } catch (error) {
      console.error('❌ FCM: Error getting device token:', error);
      return null;
    }
  }

  async registerTokenWithBackend(userId: string, token: string): Promise<boolean> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/devices/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token,
          lines: [], 
        }),
      });

      const data = await response.json();
      if (response.ok) {
        console.log('✅ FCM: Token registered with backend:', data.message);
        await AsyncStorage.setItem('fcm_device_token', token);
        return true;
      } else {
        console.error('❌ FCM: Failed to register token:', data);
        return false;
      }
    } catch (error) {
      console.error('❌ FCM: Error registering token with backend:', error);
      return false;
    }
  }

  async initialize(userId: string): Promise<void> {
    if (Platform.OS !== 'android' || !this.isAvailable) return;

    try {
      const permissionsGranted = await this.requestPermissions();
      if (!permissionsGranted) return;

      const token = await this.getDeviceToken();
      if (!token) return;

      await this.registerTokenWithBackend(userId, token);
      this.setupTokenRefreshListener(userId);
      this.setupMessageListeners();
      console.log('✅ FCM: Initialization complete');
    } catch (error) {
      console.error('❌ FCM: Initialization error:', error);
    }
  }

  setupTokenRefreshListener(userId: string): void {
    if (!this.isAvailable) return;
    messaging().onTokenRefresh(async (newToken: string) => {
      await this.registerTokenWithBackend(userId, newToken);
    });
  }

  setupMessageListeners(): void {
    if (!this.isAvailable) return;

    messaging().onMessage(async (remoteMessage: any) => {
      const title = remoteMessage.notification?.title || 'Service Update';
      const body = remoteMessage.notification?.body || 'Check the app for details';
      Alert.alert(title, body, [{ text: 'Dismiss', style: 'cancel' }]);
    });

    messaging().setBackgroundMessageHandler(async (remoteMessage: any) => {
      console.log('📩 FCM: Background message received:', remoteMessage);
    });
  }

  async unregisterToken(userId: string): Promise<void> {
    try {
      const token = await AsyncStorage.getItem('fcm_device_token');
      if (!token) return;

      const response = await fetch(`${BACKEND_URL}/api/devices/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: token,
          lines: [],
        }),
      });

      if (response.ok) {
        console.log('✅ FCM: Token unregistered');
        await AsyncStorage.removeItem('fcm_device_token');
      }
    } catch (error) {
      console.error('❌ FCM: Error unregistering token:', error);
    }
  }
}

export default new FCMService();
