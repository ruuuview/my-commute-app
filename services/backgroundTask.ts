import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Notifications from 'expo-notifications';
import { createMMKV } from 'react-native-mmkv';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { APP_CONFIG } from '../config/app.config';

const BACKGROUND_FETCH_TASK = 'background-fetch-task';
const backgroundStorage = createMMKV({ id: 'background-storage' });

TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    const state = useUserPreferencesStore.getState();
    const { notificationsGranted, selectedLines } = state;

    // 1. Guard check: notifications permission
    if (!notificationsGranted) {
      console.log('🔇 Background Fetch: Notifications not granted, exiting.');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // 2. Guard check: selected lines
    if (!selectedLines || selectedLines.length === 0) {
      console.log('🔇 Background Fetch: No selected lines, exiting.');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // 3. Fetch latest line statuses
    const response = await fetch(`${APP_CONFIG.BACKEND_URL}/api/lines`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      console.log(`❌ Background Fetch: HTTP error ${response.status}`);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }

    const lines: any[] = await response.json();
    let triggeredAnyAlert = false;

    // Convert fetched lines array to a lookup map
    const fetchedLinesMap: Record<string, any> = {};
    lines.forEach((line: any) => {
      fetchedLinesMap[line.id.toLowerCase()] = line;
    });

    // 4. Check status changes for user's selected lines
    for (const rawLineId of selectedLines) {
      const lineId = rawLineId.toLowerCase();
      const lineData = fetchedLinesMap[lineId];
      if (!lineData) continue;

      // Map status severity similar to useLineData.ts logic
      const statusText = String(lineData.status ?? '').toLowerCase();
      let currentSeverity = 1; // Green (Good Service)
      if (statusText.includes('part closure') || statusText.includes('suspended') || statusText.includes('closure')) {
        currentSeverity = 20; // Red (Highest)
      } else if (statusText.includes('severe')) {
        currentSeverity = 9;  // Red (High)
      } else if (statusText.includes('minor') || statusText.includes('part') || statusText.includes('reduced')) {
        currentSeverity = 5;  // Amber (Medium)
      }

      const statusDescription = lineData.status ?? 'Good Service';
      const reason = lineData.reason || '';

      // Get last notified severity for this line
      const cacheKey = `last_notified_severity_${lineId}`;
      const lastSeverityRaw = backgroundStorage.getString(cacheKey);
      const lastSeverity = lastSeverityRaw ? parseInt(lastSeverityRaw, 10) : 1; // default to 1 (Good Service)

      if (currentSeverity !== lastSeverity) {
        triggeredAnyAlert = true;

        if (currentSeverity > 1) {
          // Trigger disruption alert
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `Disruption on ${lineData.name} line`,
              body: `${statusDescription}${reason ? `: ${reason}` : ''}`,
              sound: true,
            },
            trigger: null,
          });
        } else if (currentSeverity === 1 && lastSeverity > 1) {
          // Trigger service cleared alert
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `Service cleared on ${lineData.name} line`,
              body: `Good Service has resumed.`,
              sound: true,
            },
            trigger: null,
          });
        }

        // Save current severity in MMKV cache
        backgroundStorage.set(cacheKey, String(currentSeverity));
      }
    }

    return triggeredAnyAlert
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;

  } catch (error) {
    console.error('❌ Background Fetch failed with error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundFetchAsync() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
        minimumInterval: 60 * 15,
        stopOnTerminate: false,
        startOnBoot: true,
      });
      console.log('✅ Background Fetch Task registered successfully.');
    }
  } catch (err) {
    console.error('❌ Failed to register Background Fetch Task:', err);
  }
}
