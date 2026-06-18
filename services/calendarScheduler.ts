// services/calendarScheduler.ts
import * as Calendar from 'expo-calendar';
import * as Notifications from 'expo-notifications';
import NetInfo from '@react-native-community/netinfo';
import { createMMKV } from 'react-native-mmkv';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { FULL_STATIONS, sanitiseStationName } from '../data/tflStations';
import { APP_CONFIG } from '../config/app.config';

const BACKEND_URL = APP_CONFIG.BACKEND_URL;

// Dedicated MMKV instance for commute durations cache
const durationCache = createMMKV({ id: 'commute-durations' });

interface CacheEntry {
  duration: number;
  timestamp: number;
}

// Get cached journey duration if it's less than 24 hours old
function getCachedDuration(originId: string, destId: string): number | null {
  const key = `commute_duration_${originId}_${destId}`;
  const dataStr = durationCache.getString(key);
  if (!dataStr) return null;
  try {
    const entry: CacheEntry = JSON.parse(dataStr);
    if (Date.now() - entry.timestamp < 24 * 60 * 60 * 1000) {
      return entry.duration;
    }
  } catch (e) {
    console.log('Error parsing cache entry:', e);
  }
  return null;
}

// Set duration cache and enforce 100 entries limit (LRU eviction)
function setCachedDuration(originId: string, destId: string, duration: number) {
  const key = `commute_duration_${originId}_${destId}`;
  const entry: CacheEntry = {
    duration,
    timestamp: Date.now(),
  };
  durationCache.set(key, JSON.stringify(entry));

  const keysStr = durationCache.getString('cache_keys_list') || '[]';
  try {
    let keys: string[] = JSON.parse(keysStr);
    keys = keys.filter(k => k !== key);
    keys.push(key);

    if (keys.length > 100) {
      const oldestKey = keys.shift();
      if (oldestKey) {
        durationCache.remove(oldestKey);
      }
    }
    durationCache.set('cache_keys_list', JSON.stringify(keys));
  } catch (e) {
    console.log('Error managing cache keys list:', e);
  }
}

// Main scheduler service
export async function scheduleCalendarCommuteAlerts() {
  try {
    // 1. Audit native permissions before executing operations
    const calendarPermission = await Calendar.getCalendarPermissionsAsync();
    if (calendarPermission.status !== Calendar.PermissionStatus.GRANTED) {
      console.log('Calendar permission not granted. Skipping scheduler.');
      return;
    }

    const notificationPermission = await Notifications.getPermissionsAsync();
    if (notificationPermission.status !== 'granted') {
      console.log('Notification permission not granted. Skipping scheduler.');
      return;
    }

    // 2. Fetch calendars and events for the next 24 hours
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const calendarIds = calendars.map(c => c.id);
    if (calendarIds.length === 0) {
      console.log('No calendars found.');
      return;
    }

    const startDate = new Date();
    const endDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const events = await Calendar.getEventsAsync(calendarIds, startDate, endDate);
    if (events.length === 0) {
      console.log('No events found in the next 24 hours.');
      return;
    }

    // 3. Clean up previously scheduled commute notifications before rescheduling
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of scheduledNotifications) {
      if (notification.content.data?.type === 'commute-leave-by') {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }

    // 4. Identify origin station
    const pinnedStations = useUserPreferencesStore.getState().pinnedStations;
    const originStation = pinnedStations[0];
    if (!originStation) {
      console.log('No origin station pinned. Skipping scheduler.');
      return;
    }

    // Deduplicate stations by lowercase cleaned name, then sort by length descending
    const stationsByName = new Map<string, typeof FULL_STATIONS[0]>();
    for (const station of FULL_STATIONS) {
      const key = sanitiseStationName(station.name);
      if (!stationsByName.has(key)) {
        stationsByName.set(key, station);
      }
    }
    console.log(`[Scheduler] Deduplicating stations: FULL_STATIONS.length = ${FULL_STATIONS.length}, Unique stations count = ${stationsByName.size}`);
    const sortedStations = [...stationsByName.values()].sort((a, b) => sanitiseStationName(b.name).length - sanitiseStationName(a.name).length);

    // 5. Schedule alerts for each event
    for (const event of events) {
      const location = event.location ? event.location.toLowerCase().trim() : '';
      if (!location) continue;

      let matchedStation = null;
      for (const station of sortedStations) {
        const stationSanitised = sanitiseStationName(station.name);
        const locationSanitised = sanitiseStationName(location);
        if (locationSanitised.includes(stationSanitised)) {
          matchedStation = station;
          break;
        }
      }

      let travelTimeMinutes = 30; // default fallback duration
      let isDurationResolved = false;

      if (matchedStation) {
        if (originStation.id === matchedStation.id) {
          travelTimeMinutes = 0;
          isDurationResolved = true;
        } else {
          // Check cache first
          const cached = getCachedDuration(originStation.id, matchedStation.id);
          if (cached !== null) {
            travelTimeMinutes = cached;
            isDurationResolved = true;
          } else {
            // Check internet connectivity
            const netInfo = await NetInfo.fetch();
            if (netInfo.isConnected) {
              try {
                const response = await fetch(`${BACKEND_URL}/api/journey-planner`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    from_station: originStation.id,
                    to_station: matchedStation.id,
                  }),
                });
                if (response.ok) {
                  const data = await response.json();
                  if (data.journeys && data.journeys.length > 0) {
                    const duration = data.journeys[0].duration;
                    if (typeof duration === 'number') {
                      travelTimeMinutes = duration;
                      setCachedDuration(originStation.id, matchedStation.id, duration);
                      isDurationResolved = true;
                    }
                  }
                }
              } catch (e) {
                console.log(`Failed to fetch journey duration for ${originStation.name} -> ${matchedStation.name}:`, e);
              }
            }

            // Stale cache fallback if online fetch failed
            if (!isDurationResolved) {
              const key = `commute_duration_${originStation.id}_${matchedStation.id}`;
              const dataStr = durationCache.getString(key);
              if (dataStr) {
                try {
                  const entry: CacheEntry = JSON.parse(dataStr);
                  travelTimeMinutes = entry.duration;
                  isDurationResolved = true;
                } catch {}
              }
            }
          }
        }
      }

      // 6. Calculate times and schedule
      const eventStartMs = new Date(event.startDate).getTime();
      const travelTimeMs = travelTimeMinutes * 60 * 1000;
      const warningMs = 15 * 60 * 1000;
      const triggerTimeMs = eventStartMs - travelTimeMs - warningMs;

      // Only schedule if trigger time is in the future
      if (triggerTimeMs > Date.now()) {
        const triggerDate = new Date(triggerTimeMs);
        const leaveByTime = new Date(eventStartMs - travelTimeMs);
        const formattedTime = leaveByTime.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });

        await Notifications.scheduleNotificationAsync({
          content: {
            title: `Time to leave for ${event.title}`,
            body: `Leave by ${formattedTime} to arrive on time. Your commute is estimated at ${travelTimeMinutes} mins.`,
            sound: true,
            data: {
              eventId: event.id,
              type: 'commute-leave-by',
            },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
        });

        console.log(`Scheduled leave-by alert for "${event.title}" at ${triggerDate.toISOString()} (Leave by: ${formattedTime}, Travel: ${travelTimeMinutes} mins)`);
      }
    }
  } catch (error) {
    // Catch-all to gracefully handle unexpected runtime changes / permission revocation without crashing
    console.error('Error running scheduleCalendarCommuteAlerts:', error);
  }
}
