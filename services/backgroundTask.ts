import { NativeModules } from 'react-native';
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let response;
    try {
      response = await fetch(`${APP_CONFIG.BACKEND_URL}/api/lines`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

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

    console.log('🔍 Background Fetch Status Map keys:', Object.keys(fetchedLinesMap));

    const selectedLinesData: any[] = [];

    // 4. Check status changes for user's selected lines
    for (const rawLineId of selectedLines) {
      const lineId = rawLineId.toLowerCase();
      let lineData = fetchedLinesMap[lineId];

      if (lineId === 'overground') {
        const OVERGROUND_BRANCH_IDS = ['liberty', 'lioness', 'mildmay', 'suffragette', 'weaver', 'windrush'];
        let worstBranchData: any = null;
        let worstBranchSeverity = -1;

        OVERGROUND_BRANCH_IDS.forEach(branchId => {
          const branchData = fetchedLinesMap[branchId];
          if (branchData) {
            const statusText = String(branchData.status ?? '').toLowerCase();
            let branchSeverity = 1;
            if (statusText.includes('part closure') || statusText.includes('suspended') || statusText.includes('closure')) {
              branchSeverity = 20;
            } else if (statusText.includes('severe')) {
              branchSeverity = 9;
            } else if (statusText.includes('minor') || statusText.includes('part') || statusText.includes('reduced')) {
              branchSeverity = 5;
            }
            if (branchSeverity > worstBranchSeverity) {
              worstBranchSeverity = branchSeverity;
              worstBranchData = branchData;
            }
          }
        });

        if (worstBranchData) {
          const originalOverground = fetchedLinesMap['overground'] || { name: 'London Overground', color: '#EE7C0E' };
          lineData = {
            ...originalOverground,
            status: worstBranchData.status,
            reason: worstBranchData.reason,
            id: 'overground',
          };
        }
      }

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

      // Add to shared widget data array (mapped to native TfL severity codes)
      selectedLinesData.push({
        id: lineId,
        name: lineData.name,
        status: lineData.status ?? 'Good Service',
        severity: currentSeverity === 1 ? 10 : (currentSeverity === 5 ? 5 : (currentSeverity === 9 ? 9 : 20)),
      });

      if (currentSeverity !== lastSeverity) {
        triggeredAnyAlert = true;

        if (currentSeverity > lastSeverity) {
          // Severity worsened - trigger disruption alert
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `Disruption on ${lineData.name} line`,
              body: `${statusDescription}${reason ? `: ${reason}` : ''}`,
              sound: true,
            },
            trigger: null,
          });
        } else if (currentSeverity === 1 && lastSeverity > 1) {
          // Severity cleared - trigger cleared alert
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `Service cleared on ${lineData.name} line`,
              body: `Good Service has resumed.`,
              sound: true,
            },
            trigger: null,
          });
        } else {
          // Severity improved but not fully cleared - trigger improving alert
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `Service improving on ${lineData.name} line`,
              body: `${statusDescription}${reason ? `: ${reason}` : ''}`,
              sound: true,
            },
            trigger: null,
          });
        }

        // Save current severity in MMKV cache
        backgroundStorage.set(cacheKey, String(currentSeverity));
      }
    }

    // 5. Bridge latest status of selected lines directly to iOS Shared Group (UserDefaults)
    const { WidgetModule } = NativeModules;
    if (WidgetModule && typeof WidgetModule.saveWidgetStatusCache === 'function') {
      try {
        WidgetModule.saveWidgetStatusCache(JSON.stringify(selectedLinesData));
        console.log('✅ Background Fetch bridged statuses successfully.');
      } catch (e) {
        console.error('❌ Failed to bridge background statuses to widget:', e);
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
