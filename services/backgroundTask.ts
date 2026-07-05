import { NativeModules, Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { createMMKV } from 'react-native-mmkv';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { APP_CONFIG } from '../config/app.config';
import { LiveActivityService } from './LiveActivityService';

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

function isWithinCommuteWindow(): boolean {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 6 = Saturday
  const hour = now.getHours();

  // Weekdays only: Monday (1) to Friday (5)
  if (day === 0 || day === 6) {
    return false;
  }

  // Commute hours: 7 AM to 8 PM (7:00 to 19:59)
  if (hour < 7 || hour >= 20) {
    return false;
  }

  return true;
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

    // Gating check: Weekday and Commute Hours (bypass in development)
    const isDebug = __DEV__;
    if (!isWithinCommuteWindow() && !isDebug) {
      console.log(`🔇 Geofencing Event ignored: outside commute hours/weekdays for ${stationName}.`);
      return;
    }

    const { stationNotificationToggles } = getNotificationToggles();
    const isStationEnabled = stationNotificationToggles[stationId] !== false;

    if (!isStationEnabled) {
      console.log(`🔕 Geofencing notifications disabled for station ${stationName} (${stationId})`);
      return;
    }

    const lastEventKey = `last_geofence_event_${stationId}`;
    const lastEvent = backgroundStorage.getString(lastEventKey);
    const currentEvent = eventType === Location.GeofencingEventType.Enter ? 'enter' : 
                         eventType === Location.GeofencingEventType.Exit ? 'exit' : null;

    if (currentEvent && lastEvent !== currentEvent) {
      backgroundStorage.set(lastEventKey, currentEvent);

      const state = useUserPreferencesStore.getState();
      const pinnedStations = state.pinnedStations || [];
      const targetStation = pinnedStations.find(s => s.id === stationId);
      const stationRole = targetStation ? targetStation.role : 'other';

      if (eventType === Location.GeofencingEventType.Enter) {
        // ── ENTER GEOFENCE ───────────────────────────────────────
        const isActivityRunning = await LiveActivityService.isActive();

        if (isActivityRunning) {
          // If we enter our active destination, end the activity (arrival!)
          const destId = backgroundStorage.getString('active_commute_destination_id');
          if (stationId === destId) {
            await LiveActivityService.end();
            
            // Calculate travel duration
            const startTimeStr = backgroundStorage.getString('active_commute_start_time');
            let elapsedText = '';
            if (startTimeStr) {
              const elapsedMs = Date.now() - parseInt(startTimeStr, 10);
              const elapsedMin = Math.round(elapsedMs / (60 * 1000));
              elapsedText = ` in ${elapsedMin} min`;
            }

            await Notifications.scheduleNotificationAsync({
              content: {
                title: `Welcome to ${stationName}`,
                body: `You made it${elapsedText}! Live tracking stopped.`,
                sound: true,
              },
              trigger: null,
            });

            backgroundStorage.remove('active_commute_destination_id');
            backgroundStorage.remove('active_commute_start_time');
          }
        } else {
          // No activity running: start commute Live Activity
          // Find destination station
          let destStation = null;
          if (stationRole === 'home') {
            destStation = pinnedStations.find(s => s.role === 'work');
          } else if (stationRole === 'work') {
            destStation = pinnedStations.find(s => s.role === 'home');
          } else {
            // Default fallback
            destStation = pinnedStations.find(s => s.role === 'work') || pinnedStations.find(s => s.role === 'home');
          }

          if (destStation && destStation.id !== stationId) {
            // 1. Fetch transit duration
            let duration = 30; // default fallback
            try {
              const cachedKey = `commute_duration_${stationId}_${destStation.id}`;
              const durationCache = createMMKV({ id: 'commute-durations' });
              const cachedData = durationCache.getString(cachedKey);
              if (cachedData) {
                const parsed = JSON.parse(cachedData);
                if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
                  duration = parsed.duration;
                }
              } else {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 4000);
                const response = await fetch(`${APP_CONFIG.BACKEND_URL}/api/journey-planner`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ from_station: stationId, to_station: destStation.id }),
                  signal: controller.signal,
                });
                clearTimeout(timeoutId);
                if (response.ok) {
                  const data = await response.json();
                  if (data.journeys && data.journeys.length > 0) {
                    const transitDuration = data.journeys[0].duration;
                    if (typeof transitDuration === 'number') {
                      duration = transitDuration;
                      durationCache.set(cachedKey, JSON.stringify({ duration, timestamp: Date.now() }));
                    }
                  }
                }
              }
            } catch (e) {
              console.log('Failed to fetch duration:', e);
            }

            // 2. Fetch arrivals for next train minutes
            let nextTrainMinutes = 2; // default
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 4000);
              const res = await fetch(`${APP_CONFIG.BACKEND_URL}/api/stations/${stationId}`, {
                signal: controller.signal,
              });
              clearTimeout(timeoutId);
              if (res.ok) {
                const data = await res.json();
                if (data.departures && data.departures.length > 0) {
                  const firstDep = data.departures[0];
                  if (typeof firstDep.minutes_away === 'number') {
                    nextTrainMinutes = firstDep.minutes_away;
                  }
                }
              }
            } catch (e) {
              console.log('Failed to fetch departures:', e);
            }

            // 3. Start Live Activity
            const lineId = targetStation?.lines?.[0] || 'victoria';
            const estimatedArrival = new Date(Date.now() + (duration + nextTrainMinutes) * 60 * 1000);

            await LiveActivityService.start(
              destStation.name,
              lineId,
              estimatedArrival,
              nextTrainMinutes
            );

            backgroundStorage.set('active_commute_destination_id', destStation.id);
            backgroundStorage.set('active_commute_start_time', String(Date.now()));

            await Notifications.scheduleNotificationAsync({
              content: {
                title: `Approaching ${stationName}`,
                body: `Starting live tracking towards ${destStation.name}.`,
                sound: true,
              },
              trigger: null,
            });
          }
        }
      } else if (eventType === Location.GeofencingEventType.Exit) {
        // ── EXIT GEOFENCE ────────────────────────────────────────
        const isActive = await LiveActivityService.isActive();
        if (isActive) {
          await LiveActivityService.update(0, 'In Transit...');
        }

        await Notifications.scheduleNotificationAsync({
          content: {
            title: `Departed ${stationName}`,
            body: `Continuing live commute tracking.`,
            sound: true,
          },
          trigger: null,
        });
      }
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
        const radius = (station.role === 'home' || station.role === 'work') ? 200 : 100;
        regions.push({
          identifier: station.id,
          latitude: coord.lat,
          longitude: coord.lon,
          radius: radius,
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
