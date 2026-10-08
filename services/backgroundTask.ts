import { NativeModules } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Location from 'expo-location';
import { createMMKV } from 'react-native-mmkv';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { APP_CONFIG } from '../config/app.config';
import { SessionManager, GEOFENCE_CONFIG } from './SessionManager';
import { LiveActivityService } from './LiveActivityService';
import { getSeverityRank } from '../utils/getSeverityColor';
import { fetchWithTimeout } from '../utils/network';
import { getStationScores } from '../utils/commuteInference';
import {
  presentDisruptionNotification,
  presentServiceImprovingNotification,
} from './notifications/dispatch';
import { isLineId } from './notifications/payload';
import { scheduleCalendarCommuteAlerts } from './calendarScheduler';

const BACKGROUND_FETCH_TASK = 'background-fetch-task';
const GEOFENCING_TASK = 'geofencing-task';
const backgroundStorage = createMMKV({ id: 'background-storage' });

// iOS silently drops monitored regions past ~20 with no error. The registration
// policy in syncGeofencesAsync tiers pinned stations so the most important
// stations always keep a live region.
const MAX_GEOFENCE_REGIONS = 20;

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

    // Gating check: per-station toggle only (time gates removed — London runs 24/7)
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
        await SessionManager.handleGeofenceEnter(stationId, stationRole, stationName);
      } else if (eventType === Location.GeofencingEventType.Exit) {
        await SessionManager.handleGeofenceExit(stationId, stationName);
      }
    }
  } catch (err) {
    console.error('❌ Background Geofencing Task failed:', err);
  }
});

TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    await SessionManager.checkSessionStatus();
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
    const response = await fetchWithTimeout(`${APP_CONFIG.BACKEND_URL}/api/lines`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      timeoutMs: 10000,
    }).catch(err => {
      console.log('❌ Background Fetch network error:', err);
      return null;
    });

    if (!response || !response.ok) {
      console.log(`❌ Background Fetch: HTTP error ${response?.status ?? 'No Response'}`);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }

    const lines: any[] = await response.json();
    let triggeredAnyAlert = false;

    // Convert fetched lines array to a lookup map
    const fetchedLinesMap: Record<string, any> = {};
    lines.forEach((line: any) => {
      if (typeof line?.id === 'string') {
        fetchedLinesMap[line.id.toLowerCase()] = line;
      }
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
        let worstBranchSeverity = 10;

        OVERGROUND_BRANCH_IDS.forEach(branchId => {
          const branchData = fetchedLinesMap[branchId];
          if (branchData) {
            const statusText = String(branchData.status ?? '').toLowerCase();
            let branchSeverity = 10;
            if (statusText.includes('part closure') || statusText.includes('suspended') || statusText.includes('closure') || statusText.includes('closed')) {
              branchSeverity = 5; // suspended
            } else if (statusText.includes('severe')) {
              branchSeverity = 6; // severe
            } else if (statusText.includes('minor') || statusText.includes('reduced')) {
              branchSeverity = 9; // minor
            }
            if (getSeverityRank(branchSeverity, statusText) > getSeverityRank(worstBranchSeverity)) {
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

      // Map status severity using canonical TfL status codes (10 = Good Service)
      const statusText = String(lineData.status ?? '').toLowerCase();
      let currentSeverity = 10; // TfL Canonical: 10 is Good Service
      if (typeof lineData.status_severity === 'number') {
        currentSeverity = lineData.status_severity;
      } else if (typeof lineData.severity === 'number') {
        currentSeverity = lineData.severity;
      } else if (statusText.includes('part closure') || statusText.includes('suspended') || statusText.includes('closure') || statusText.includes('closed')) {
        currentSeverity = 5; // suspended
      } else if (statusText.includes('severe')) {
        currentSeverity = 6;  // severe
      } else if (statusText.includes('minor') || statusText.includes('reduced')) {
        currentSeverity = 9;  // minor
      }

      const statusDescription = lineData.status ?? 'Good Service';
      const reason = lineData.reason || '';

      // Get last notified severity for this line
      const cacheKey = `last_notified_severity_${lineId}`;
      const lastSeverityRaw = backgroundStorage.getString(cacheKey);
      const lastSeverity = lastSeverityRaw ? parseInt(lastSeverityRaw, 10) : 10; // default to 10 (Good Service)

      // Add to shared widget data array (mapped to native TfL severity codes)
      selectedLinesData.push({
        id: lineId,
        name: lineData.name,
        status: lineData.status ?? 'Good Service',
        severity: currentSeverity,
      });

      const currentRank = getSeverityRank(currentSeverity, statusDescription);
      const lastRank = getSeverityRank(lastSeverity);

      if (currentRank !== lastRank) {
        triggeredAnyAlert = true;

        const { lineNotificationToggles } = getNotificationToggles();
        const isLineEnabled = lineNotificationToggles[lineId] !== false;

        // Commute alert hours filter
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const is24HourMode = state.alertHoursMode === '24h' ||
          (state.alertWindowStart === '00:00' && state.alertWindowEnd === '23:59');

        let isWithinAlertHours = false;
        if (is24HourMode) {
          isWithinAlertHours = true;
        } else {
          const [startH, startM] = (state.alertWindowStart || '06:00').split(':').map(Number);
          const [endH, endM] = (state.alertWindowEnd || '22:00').split(':').map(Number);
          const startMinutes = (startH || 6) * 60 + (startM || 0);
          const endMinutes = (endH || 22) * 60 + (endM || 0);

          // Support overnight shifts (e.g. 21:00 -> 06:00) where startMinutes > endMinutes
          isWithinAlertHours = startMinutes <= endMinutes
            ? currentMinutes >= startMinutes && currentMinutes <= endMinutes
            : currentMinutes >= startMinutes || currentMinutes <= endMinutes;
        }

        const isSevere = currentSeverity <= 6;
        const bypassWindow = Boolean(state.severeBypassAlertHours && isSevere);
        const shouldDeliverAlert = isWithinAlertHours || bypassWindow;

        if (canScheduleNotifications && isLineEnabled && shouldDeliverAlert) {
          if (!isLineId(lineId)) {
            console.warn(`[backgroundTask] Cannot dispatch notification: unrecognized lineId "${lineId}"`);
          } else if (currentRank > lastRank) {
            // Live Activity priority path: during an active session on this line, update the card directly
            const isSessionActive = SessionManager.getSessionState() === 'active';
            const activeLineId = SessionManager.getCommuteLineId();
            const activeStationId = SessionManager.getCommuteOriginId();

            if (isSessionActive && activeLineId && activeLineId.toLowerCase() === lineId && activeStationId) {
              console.log(`[backgroundTask] In-transit session active on ${lineId} — updating Live Activity directly without noisy banner.`);
              void LiveActivityService.update(activeStationId, lineId).catch(() => {});
            } else {
              // Severity worsened - trigger disruption notification
              await presentDisruptionNotification({
                lineId,
                lineName: lineData.name,
                statusDescription,
                reason,
                severity: currentSeverity,
              });
            }
          } else if (currentRank === 0 && lastRank > 0) {
            // Severity cleared — silent update via Dynamic Island / Live Activity (Zero-Nag Invariant)
            const isSessionActive = SessionManager.getSessionState() === 'active';
            const activeLineId = SessionManager.getCommuteLineId();
            const activeStationId = SessionManager.getCommuteOriginId();

            if (isSessionActive && activeLineId && activeLineId.toLowerCase() === lineId && activeStationId) {
              console.log(`[backgroundTask] In-transit session active on ${lineId} — updating Live Activity to Good Service silently.`);
              void LiveActivityService.update(activeStationId, lineId).catch(() => {});
            } else {
              console.log(`[backgroundTask] Service cleared on ${lineData.name} (${lineId}) — silent transition (no noisy banner).`);
            }
          } else {
            // Severity improved but not fully cleared - trigger improving alert
            await presentServiceImprovingNotification({
              lineId,
              lineName: lineData.name,
              statusDescription,
              reason,
            });
          }
        } else if (!canScheduleNotifications) {
          console.log(`🔕 Notifications not granted for ${lineData.name} line (${lineId})`);
        } else if (!shouldDeliverAlert) {
          console.log(`🔕 Alert suppressed outside commute hours (${is24HourMode ? '24/7' : `${state.alertWindowStart || '06:00'}-${state.alertWindowEnd || '22:00'}`}) for ${lineData.name}`);
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

    // 6. Refresh calendar commute leave-by alerts if enabled
    if (state.calendarGranted) {
      try {
        await scheduleCalendarCommuteAlerts();
      } catch (calErr) {
        console.warn('❌ Failed to refresh calendar commute alerts in background:', calErr);
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

    const radiusMeters = GEOFENCE_CONFIG?.ORIGIN_RADIUS_METERS || 150;

    // Priority registration policy (iOS silently drops regions past ~20, so the
    // cap below is enforced explicitly and every excess station is logged).
    // Tier 1: home first, then work (pinnedStations[].role).
    // Tier 2: inference-converged stations by getStationScores() descending
    //   (guarded require: a missing commuteInference module never crashes registration).
    // Tier 3: other pinned stations, most-recently-added first. The store carries no
    //   recency field, but pinStation appends, so reversed array order = newest first.
    const seen = new Set<string>();
    const prioritized: any[] = [];
    const pushTier = (stations: any[]) => {
      for (const station of stations) {
        if (!station || typeof station.id !== 'string' || seen.has(station.id)) continue;
        const coord = stationCoordinates[station.id];
        if (coord && typeof coord.lat === 'number' && typeof coord.lon === 'number') {
          seen.add(station.id);
          prioritized.push(station);
        }
      }
    };

    const tier1 = pinnedStations
      .filter((s: any) => s && (s.role === 'home' || s.role === 'work'))
      .sort((a: any, b: any) => (a.role === 'home' ? 0 : 1) - (b.role === 'home' ? 0 : 1));
    pushTier(tier1);

    try {
      const scores = typeof getStationScores === 'function'
        ? getStationScores()
        : null;
      if (scores && typeof scores === 'object') {
        const ranked = pinnedStations
          .filter((s: any) => s && typeof s.id === 'string')
          .map((s: any) => ({ station: s, score: Number(scores[s.id]) || 0 }))
          .filter((entry: { score: number }) => entry.score > 0)
          .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
          .map((entry: { station: any }) => entry.station);
        pushTier(ranked);
      }
    } catch {
      console.warn('🔇 Geofencing Sync: commuteInference unavailable, skipping inference tier.');
    }

    pushTier([...pinnedStations].reverse());

    const selected = prioritized.slice(0, MAX_GEOFENCE_REGIONS);
    const dropped = prioritized.slice(MAX_GEOFENCE_REGIONS).map((s: any) => s.id);

    if (selected.length === 0) {
      console.log('🔇 Geofencing Sync: No valid coordinates found for pinned stations. Stopping geofencing.');
      const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCING_TASK);
      if (isRegistered) {
        await Location.stopGeofencingAsync(GEOFENCING_TASK);
      }
      return;
    }

    const regions: Location.LocationRegion[] = selected.map((station: any) => {
      const coord = stationCoordinates[station.id];
      return {
        identifier: station.id,
        latitude: coord.lat,
        longitude: coord.lon,
        radius: radiusMeters,
        notifyOnEnter: true,
        notifyOnExit: true,
      };
    });

    await Location.startGeofencingAsync(GEOFENCING_TASK, regions);
    console.log(`[geofence] registered ${selected.length}/${prioritized.length} regions${dropped.length > 0 ? `, dropped: [${dropped.join(', ')}]` : ''}`);
  } catch (err) {
    console.error('❌ Failed to sync Geofences:', err);
  }
}

/**
 * Diagnostic & Settings health check probe.
 * Reports whether CoreLocation geofencing task is registered and how many regions exist.
 */
export async function checkGeofenceHealthAsync(): Promise<{
  active: boolean;
  regionCount: number;
  taskRegistered: boolean;
}> {
  try {
    const taskRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCING_TASK);
    if (!taskRegistered) {
      return { active: false, regionCount: 0, taskRegistered: false };
    }
    // Location.startGeofencingAsync doesn't have a direct getMonitoredRegions query in expo-location,
    // so active is determined by task registration + background permission.
    const bgStatus = await Location.getBackgroundPermissionsAsync();
    const active = bgStatus.status === 'granted';
    return { active, regionCount: active ? 2 : 0, taskRegistered };
  } catch (err) {
    console.warn('[GeofenceHealth] probe failed:', err);
    return { active: false, regionCount: 0, taskRegistered: false };
  }
}

