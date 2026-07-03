import { NativeModules } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { createMMKV } from 'react-native-mmkv';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { APP_CONFIG } from '../config/app.config';

const BACKGROUND_FETCH_TASK = 'background-fetch-task';
const GEOFENCING_TASK = 'geofencing-task';
const backgroundStorage = createMMKV({ id: 'background-storage' });

// Offline coordinates dataset for station geofencing lookup
const stationCoordinates = require('../data/stationCoordinates.json');

function getNotificationToggles() {
  try {
    const raw = backgroundStorage.getString('notification-toggles');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        lineNotificationToggles: parsed.lines || {},
        stationNotificationToggles: parsed.stations || {},
      };
    }
  } catch (e) {
    console.error('Failed to parse notification-toggles in background task:', e);
  }
  return {
    lineNotificationToggles: {},
    stationNotificationToggles: {},
  };
}

TaskManager.defineTask(GEOFENCING_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error(`❌ Background Geofencing Error: ${error.message}`);
    return;
  }

  try {
    const { eventType, region } = data ?? {};
    if (!region) {
      console.log('🔇 Geofencing Event: missing region data.');
      return;
    }
    const stationId = region.identifier;
    const stationData = stationCoordinates[stationId];
    const stationName = stationData ? stationData.name : 'Commute Station';

    console.log(`📍 Geofencing Event: type ${eventType} for station ${stationName} (${stationId})`);

    const { stationNotificationToggles } = getNotificationToggles();
    const isStationEnabled = stationNotificationToggles[stationId] !== false;

    const lastEventKey = `last_geofence_event_${stationId}`;
    const lastEvent = backgroundStorage.getString(lastEventKey);
    const currentEvent = eventType === Location.GeofencingEventType.Enter ? 'enter' : 
                         eventType === Location.GeofencingEventType.Exit ? 'exit' : null;

    if (isStationEnabled && currentEvent && lastEvent !== currentEvent) {
      backgroundStorage.set(lastEventKey, currentEvent);
      // eventType 1 = Enter, 2 = Exit
      if (eventType === Location.GeofencingEventType.Enter) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `Approaching ${stationName}`,
            body: `Starting live tracking for your commute.`,
            sound: true,
          },
          trigger: null,
        });
      } else if (eventType === Location.GeofencingEventType.Exit) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `Departed ${stationName}`,
            body: `Stopping live tracking.`,
            sound: true,
          },
          trigger: null,
        });
      }
    } else if (!isStationEnabled) {
      console.log(`🔕 Geofencing notifications disabled for station ${stationName} (${stationId})`);
    } else {
      console.log(`🔇 Geofencing Event: duplicate or unhandled event transition (${currentEvent}) ignored for ${stationName}.`);
    }
  } catch (err) {
    console.error('❌ Background Geofencing Task failed:', err);
  }
});

TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    const state = useUserPreferencesStore.getState();
    const { notificationsGranted, selectedLines } = state;

    const canScheduleNotifications = notificationsGranted;
    if (!canScheduleNotifications) {
      console.log('🔇 Background Fetch: Notifications not granted; refreshing widget cache only.');
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
            if (statusText.includes('part closure') || statusText.includes('suspended') || statusText.includes('closure') || statusText.includes('closed')) {
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
      if (statusText.includes('part closure') || statusText.includes('suspended') || statusText.includes('closure') || statusText.includes('closed')) {
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
        severity: currentSeverity === 1 ? 10 : (currentSeverity === 5 ? 9 : (currentSeverity === 9 ? 6 : 20)),
      });

      if (currentSeverity !== lastSeverity) {
        triggeredAnyAlert = true;

        const { lineNotificationToggles } = getNotificationToggles();
        const isLineEnabled = lineNotificationToggles[lineId] !== false;

        if (canScheduleNotifications && isLineEnabled) {
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
        } else if (!canScheduleNotifications) {
          console.log(`🔕 Notifications not granted for ${lineData.name} line (${lineId})`);
        } else {
          console.log(`🔕 Disruption alerts disabled for ${lineData.name} line (${lineId})`);
        }

        // Save current severity in MMKV cache
        backgroundStorage.set(cacheKey, String(currentSeverity));
      }
    }

    // 5. Bridge latest status of selected lines directly to iOS Shared Group (UserDefaults)
    const { WidgetModule } = NativeModules;
    if (WidgetModule && typeof WidgetModule.saveWidgetStatusCache === 'function') {
      try {
        await Promise.race([
          WidgetModule.saveWidgetStatusCache(JSON.stringify(selectedLinesData)),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Widget bridge timeout')), 5000)),
        ]);
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

export async function syncGeofencesAsync(pinnedStations: any[]) {
  try {
    const status = await Location.getBackgroundPermissionsAsync();
    if (status.status !== 'granted') {
      console.log('🔇 Geofencing Sync: Background location permissions not granted. Stopping geofencing.');
      const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCING_TASK);
      if (isRegistered) {
        await Location.stopGeofencingAsync(GEOFENCING_TASK);
      }
      return;
    }

    if (!pinnedStations || pinnedStations.length === 0) {
      console.log('🔇 Geofencing Sync: No pinned stations. Stopping geofencing.');
      const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCING_TASK);
      if (isRegistered) {
        await Location.stopGeofencingAsync(GEOFENCING_TASK);
      }
      return;
    }

    const regions: Location.LocationRegion[] = [];
    pinnedStations.forEach((station) => {
      const coord = stationCoordinates[station.id];
      if (coord && typeof coord.lat === 'number' && typeof coord.lon === 'number') {
        regions.push({
          identifier: station.id,
          latitude: coord.lat,
          longitude: coord.lon,
          radius: 500, // 500 meters radius
          notifyOnEnter: true,
          notifyOnExit: true,
        });
      }
    });

    if (regions.length === 0) {
      console.log('🔇 Geofencing Sync: No valid coordinates found for pinned stations. Stopping geofencing.');
      const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCING_TASK);
      if (isRegistered) {
        await Location.stopGeofencingAsync(GEOFENCING_TASK);
      }
      return;
    }

    await Location.startGeofencingAsync(GEOFENCING_TASK, regions);
    console.log(`✅ Geofencing Sync: Successfully registered ${regions.length} regions.`);
  } catch (err) {
    console.error('❌ Failed to sync Geofences:', err);
  }
}
