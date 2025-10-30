/**
 * FCM Service - Firebase Cloud Messaging Integration
 * Handles device token registration and push notification receiving for Android
 * 
 * NOTE: Requires custom development build - not compatible with Expo Go
 */

import { Platform, Alert } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = Constants.expoConfig?.extra?.BACKEND_URL || 'http://localhost:8001';

// Lazy import to avoid crashes in Expo Go
let messaging: any = null;
try {
  messaging = require('@react-native-firebase/messaging').default;
} catch (error) {
  console.warn('⚠️ FCM: React Native Firebase not available (requires custom build)');
}

class FCMService {
  private isAvailable: boolean = false;

  constructor() {
    // Check if Firebase messaging is available
    this.isAvailable = messaging !== null;
    if (!this.isAvailable) {
      console.log('⚠️ FCM: Native modules not available. This is expected in Expo Go.');
      console.log('📱 FCM: Build with "npx expo run:android" to enable push notifications.');
    }
  }
  /**
   * Request notification permissions from the user
   * Returns true if permissions granted, false otherwise
   */
  async requestPermissions(): Promise<boolean> {
    if (!this.isAvailable) {
      console.log('⚠️ FCM: Skipping permission request (native module not available)');
      return false;
    }

    try {
      // Android 13+ requires runtime permission
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (enabled) {
        console.log('📱 FCM: Notification permissions granted');
        return true;
      } else {
        console.log('⚠️ FCM: Notification permissions denied');
        return false;
      }
    } catch (error) {
      console.error('❌ FCM: Error requesting permissions:', error);
      return false;
    }
  }

  /**
   * Get the FCM device token
   * Returns the token string or null if unavailable
   */
  async getDeviceToken(): Promise<string | null> {
    if (!this.isAvailable) {
      console.log('⚠️ FCM: Cannot get device token (native module not available)');
      return null;
    }

    try {
      const token = await messaging().getToken();
      console.log('📱 FCM: Device token obtained:', token.substring(0, 20) + '...');
      return token;
    } catch (error) {
      console.error('❌ FCM: Error getting device token:', error);
      return null;
    }
  }

  /**
   * Register the device token with the backend
   */
  async registerTokenWithBackend(userId: string, token: string): Promise<boolean> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/user/device-token/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          device_token: token,
          platform: 'android',
        }),
      });

      const data = await response.json();

      if (response.ok) {
        console.log('✅ FCM: Token registered with backend:', data.message);
        // Save token locally to avoid re-registering
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

  /**
   * Initialize FCM service
   * - Requests permissions
   * - Gets device token
   * - Registers token with backend
   * - Sets up message listeners
   */
  async initialize(userId: string): Promise<void> {
    // Only run on Android
    if (Platform.OS !== 'android') {
      console.log('⚠️ FCM: Skipping initialization (not Android)');
      return;
    }

    // Check if native modules are available
    if (!this.isAvailable) {
      console.log('⚠️ FCM: Skipping initialization (requires custom development build)');
      console.log('💡 FCM: To enable push notifications:');
      console.log('   1. Run: npx expo run:android');
      console.log('   2. Or build with: npx eas build --platform android');
      return;
    }

    try {
      console.log('🚀 FCM: Initializing...');

      // Step 1: Request permissions
      const permissionsGranted = await this.requestPermissions();
      if (!permissionsGranted) {
        Alert.alert(
          'Notifications Disabled',
          'Please enable notifications in Settings to receive service updates.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Step 2: Get device token
      const token = await this.getDeviceToken();
      if (!token) {
        console.error('❌ FCM: Could not obtain device token');
        return;
      }

      // Step 3: Register token with backend
      const registered = await this.registerTokenWithBackend(userId, token);
      if (!registered) {
        console.error('❌ FCM: Failed to register token with backend');
      }

      // Step 4: Setup token refresh listener
      this.setupTokenRefreshListener(userId);

      // Step 5: Setup message listeners
      this.setupMessageListeners();

      console.log('✅ FCM: Initialization complete');
    } catch (error) {
      console.error('❌ FCM: Initialization error:', error);
    }
  }

  /**
   * Setup listener for token refresh
   * FCM tokens can change, so we need to update the backend
   */
  setupTokenRefreshListener(userId: string): void {
    if (!this.isAvailable) return;

    messaging().onTokenRefresh(async (newToken) => {
      console.log('🔄 FCM: Token refreshed:', newToken.substring(0, 20) + '...');
      await this.registerTokenWithBackend(userId, newToken);
    });
  }

  /**
   * Setup listeners for incoming messages
   */
  setupMessageListeners(): void {
    if (!this.isAvailable) return;

    // Handle foreground messages (app is open)
    messaging().onMessage(async (remoteMessage) => {
      console.log('📩 FCM: Foreground message received:', remoteMessage);

      // Extract notification data
      const title = remoteMessage.notification?.title || 'Service Update';
      const body = remoteMessage.notification?.body || 'Check the app for details';

      // Show alert in foreground
      Alert.alert(title, body, [
        { text: 'Dismiss', style: 'cancel' },
        { text: 'View', onPress: () => this.handleNotificationPress(remoteMessage) },
      ]);
    });

    // Handle background/quit state messages
    messaging().setBackgroundMessageHandler(async (remoteMessage) => {
      console.log('📩 FCM: Background message received:', remoteMessage);
      // Background messages are handled by native code
      // You can perform data sync here if needed
    });

    // Handle notification press (when user taps notification)
    messaging().onNotificationOpenedApp((remoteMessage) => {
      console.log('👆 FCM: Notification pressed (background):', remoteMessage);
      this.handleNotificationPress(remoteMessage);
    });

    // Check if app was opened from a notification (quit state)
    messaging()
      .getInitialNotification()
      .then((remoteMessage) => {
        if (remoteMessage) {
          console.log('👆 FCM: Notification pressed (quit state):', remoteMessage);
          this.handleNotificationPress(remoteMessage);
        }
      });
  }

  /**
   * Handle notification press - navigate to relevant screen
   */
  handleNotificationPress(remoteMessage: any): void {
    const data = remoteMessage.data;
    console.log('📱 FCM: Handling notification press:', data);

    // Extract line information from notification data
    const lineName = data?.line_name;
    const lineId = lineName?.toLowerCase().replace(' ', '-'); // e.g., "Central Line" -> "central-line"

    // TODO: Navigate to line detail screen
    // This will need to be integrated with your navigation system
    // Example: navigation.navigate('lineDetail', { lineId });
    
    // For now, just log
    console.log(`📱 FCM: Would navigate to line: ${lineId}`);
  }

  /**
   * Unregister device token (for logout)
   */
  async unregisterToken(userId: string): Promise<void> {
    try {
      const token = await AsyncStorage.getItem('fcm_device_token');
      if (!token) {
        console.log('⚠️ FCM: No token to unregister');
        return;
      }

      const response = await fetch(`${BACKEND_URL}/api/user/device-token/unregister`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          device_token: token,
          platform: 'android',
        }),
      });

      if (response.ok) {
        console.log('✅ FCM: Token unregistered');
        await AsyncStorage.removeItem('fcm_device_token');
      } else {
        console.error('❌ FCM: Failed to unregister token');
      }
    } catch (error) {
      console.error('❌ FCM: Error unregistering token:', error);
    }
  }
}

// Export singleton instance
export default new FCMService();
