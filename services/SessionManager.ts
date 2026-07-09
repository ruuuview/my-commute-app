import { NativeModules } from 'react-native';
import { createMMKV } from 'react-native-mmkv';
import * as Notifications from 'expo-notifications';
import { LiveActivityService } from './LiveActivityService';
import { APP_CONFIG } from '../config/app.config';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { tflCapitalise } from '../utils/tflCapitalise';

export const CONSENT_DWELL_MINUTES = 27;
export const CONSENT_DWELL_MS = CONSENT_DWELL_MINUTES * 60 * 1000;

const backgroundStorage = createMMKV({ id: 'background-storage' });

export type SessionState = 'idle' | 'active' | 'closing';

export class SessionManager {
  static getSessionState(): SessionState {
    return (backgroundStorage.getString('session_state') as SessionState) || 'idle';
  }

  static getAlertsActive(): boolean {
    return backgroundStorage.getBoolean('alerts_active') ?? false;
  }

  static getCommuteDestinationId(): string | null {
    return backgroundStorage.getString('commute_destination_id') ?? null;
  }

  static getCommuteOriginId(): string | null {
    return backgroundStorage.getString('commute_origin_id') ?? null;
  }

  static getCommuteStartTime(): number | null {
    const val = backgroundStorage.getString('commute_start_time');
    return val ? parseInt(val, 10) : null;
  }

  static async startSession(originId: string, destinationId: string, lineId: string, lineName: string) {
    console.log(`[SessionManager] Starting session. Origin: ${originId}, Dest: ${destinationId}, Line: ${lineId}`);
    
    backgroundStorage.set('session_state', 'active');
    backgroundStorage.set('alerts_active', true);
    backgroundStorage.set('commute_destination_id', destinationId);
    backgroundStorage.set('commute_origin_id', originId);
    backgroundStorage.set('commute_line_id', lineId);
    backgroundStorage.set('commute_start_time', String(Date.now()));
    backgroundStorage.remove('dwell_timer_expires');
    backgroundStorage.remove('notified_departed');
    await Notifications.cancelScheduledNotificationAsync('arrived-consent-prompt').catch(() => {});

    // Start Live Activity
    try {
      const state = useUserPreferencesStore.getState();
      const pinned = state.pinnedStations;
      const origin = pinned.find(s => s.id === originId)?.name || 'Origin';
      const dest = pinned.find(s => s.id === destinationId)?.name || 'Destination';

      await LiveActivityService.start({
        originStation: origin,
        destinationStation: dest,
        lineId: lineId,
        lineName: lineName,
        originId: originId
      });

      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Departing ${origin}`,
          body: `Starting live tracking towards ${dest}.`,
          sound: true,
        },
        trigger: null,
      }).catch(err => {
        console.error('[SessionManager] Failed to schedule start notification:', err);
      });
    } catch (e) {
      console.error('[SessionManager] Failed to start Live Activity:', e);
    }
  }

  static async handleGeofenceEnter(stationId: string, role: 'home' | 'work' | 'other', stationName: string) {
    const currentState = this.getSessionState();
    console.log(`[SessionManager] Entered geofence: ${stationId} (${role}), state: ${currentState}`);

    const state = useUserPreferencesStore.getState();
    const pinnedStations = state.pinnedStations || [];

    if (currentState === 'idle') {
      // Find destination station
      let destStation = null;
      if (role === 'home') {
        destStation = pinnedStations.find(s => s.role === 'work');
      } else if (role === 'work') {
        destStation = pinnedStations.find(s => s.role === 'home');
      } else {
        destStation = pinnedStations.find(s => s.role === 'work') || pinnedStations.find(s => s.role === 'home');
      }

      if (destStation && destStation.id !== stationId) {
        const targetStation = pinnedStations.find(s => s.id === stationId);
        let lineId = targetStation?.lines?.[0];
        if (!lineId) {
          // Recovery 1: Use first subscribed line
          const prefState = useUserPreferencesStore.getState();
          lineId = prefState.selectedLines?.[0];
        }
        if (!lineId) {
          // Recovery 2: Fall back to 'victoria' and log warning
          lineId = 'victoria';
          console.warn(`[SessionManager] No line data found for station ${stationId} or subscribed lines, falling back to 'victoria'`);
        }
        const lineName = tflCapitalise(lineId);
        await this.startSession(stationId, destStation.id, lineId, lineName);
      }
      return;
    }

    if (currentState === 'active') {
      const destId = this.getCommuteDestinationId();
      if ((role === 'home' || role === 'work') && stationId === destId) {
        console.log(`[SessionManager] Entering destination geofence. Initiating ${CONSENT_DWELL_MINUTES}-minute dwell check.`);
        
        const expires = Date.now() + CONSENT_DWELL_MS;
        backgroundStorage.set('session_state', 'closing');
        backgroundStorage.set('dwell_timer_expires', String(expires));

        // Fetch copy and schedule notification
        const startTime = this.getCommuteStartTime() || Date.now();
        const elapsedMin = Math.round((Date.now() - startTime) / (60 * 1000));
        
        let title = `${stationName}. ${elapsedMin} minutes.`;
        let body = 'Want me to go quiet now?';

        try {
          const copyController = new AbortController();
          const copyTimeout = setTimeout(() => copyController.abort(), 2000);
          const resp = await fetch(`${APP_CONFIG.BACKEND_URL}/api/notification/copy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'arrival',
              context: { duration_minutes: elapsedMin }
            }),
            signal: copyController.signal,
          });
          clearTimeout(copyTimeout);
          if (resp.ok) {
            const data = await resp.json();
            if (data?.title && data?.body) {
              title = String(data.title).replace(/!/g, ''); // Ensure no exclamation marks
              body = String(data.body).replace(/!/g, '');
            }
          }
        } catch (e) {
          console.warn('[SessionManager] Failed to fetch LLM copy, using templates:', e);
        }

        // Race check: make sure we are still in 'closing' state (i.e. user hasn't exited the geofence during fetch)
        if (this.getSessionState() !== 'closing') {
          console.log('[SessionManager] Race condition detected: session state is no longer closing. Bailing.');
          return;
        }

        // Schedule notification for 27m delay
        await Notifications.cancelScheduledNotificationAsync('arrived-consent-prompt').catch(() => {});
        await Notifications.scheduleNotificationAsync({
          identifier: 'arrived-consent-prompt',
          content: {
            title,
            body,
            categoryIdentifier: 'ARRIVED_ALERT',
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: CONSENT_DWELL_MINUTES * 60,
          },
        }).catch(err => {
          console.error('[SessionManager] Failed to schedule arrived consent notification:', err);
        });
      }
    }
  }

  static async handleGeofenceExit(stationId: string, stationName: string) {
    const currentState = this.getSessionState();
    console.log(`[SessionManager] Exited geofence: ${stationId}, state: ${currentState}`);

    if (currentState === 'active') {
      const originId = this.getCommuteOriginId();
      if (stationId === originId) {
        // Exited origin station -> set Live Activity status to In Transit
        const isRunning = await LiveActivityService.isActive();
        if (isRunning) {
          try {
            const lastNext = parseInt(backgroundStorage.getString('last_known_next') || '0', 10);
            const lastFollow = parseInt(backgroundStorage.getString('last_known_follow') || '0', 10);
            const { LiveActivityModule } = NativeModules;
            if (LiveActivityModule && typeof LiveActivityModule.updateCommuteActivity === 'function') {
              await LiveActivityModule.updateCommuteActivity(lastNext, lastFollow, 'In Transit...');
            }
          } catch (e) {
            console.error('[SessionManager] Exit update status failed:', e);
          }
        }

        const alreadyNotified = backgroundStorage.getBoolean('notified_departed') ?? false;
        if (!alreadyNotified) {
          backgroundStorage.set('notified_departed', true);
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `Departed ${stationName}`,
              body: `Continuing live commute tracking.`,
              sound: true,
            },
            trigger: null,
          }).catch(err => {
            console.error('[SessionManager] Failed to schedule departed notification:', err);
          });
        }
      }
    }

    if (currentState === 'closing') {
      const destId = this.getCommuteDestinationId();
      if (stationId === destId) {
        // Exited destination before dwell timer expired -> cancel timer and revert to active
        const expiresStr = backgroundStorage.getString('dwell_timer_expires');
        if (expiresStr) {
          const expires = parseInt(expiresStr, 10);
          if (Date.now() < expires) {
            console.log(`[SessionManager] Exited destination before ${CONSENT_DWELL_MINUTES}m dwell. Restoring active session.`);
            await Notifications.cancelScheduledNotificationAsync('arrived-consent-prompt').catch(() => {});
            backgroundStorage.set('session_state', 'active');
            backgroundStorage.remove('dwell_timer_expires');
            backgroundStorage.set('notified_departed', false); // Allow departed alert to re-fire if origin changes or they exit again

            await Notifications.scheduleNotificationAsync({
              content: {
                title: `Resuming tracking`,
                body: `You exited ${stationName}. Continuing live commute tracking.`,
                sound: true,
              },
              trigger: null,
            }).catch(err => {
              console.error('[SessionManager] Failed to schedule resuming notification:', err);
            });
          }
        }
      }
    }
  }

  static async closeSession(forceQuiet: boolean) {
    console.log(`[SessionManager] Closing session. ForceQuiet: ${forceQuiet}`);

    await LiveActivityService.end().catch(e => console.error('[SessionManager] End Live Activity failed:', e));

    backgroundStorage.set('session_state', 'idle');
    backgroundStorage.remove('dwell_timer_expires');
    backgroundStorage.remove('commute_destination_id');
    backgroundStorage.remove('commute_origin_id');
    backgroundStorage.remove('commute_line_id');
    backgroundStorage.remove('commute_start_time');
    await Notifications.cancelScheduledNotificationAsync('arrived-consent-prompt').catch(() => {});

    if (forceQuiet) {
      backgroundStorage.set('alerts_active', false);
      const dateStr = new Date().toISOString().split('T')[0];
      backgroundStorage.set('prompt_fired_today', dateStr);
    }
  }

  static async resumeSession() {
    console.log('[SessionManager] Resuming session active state.');
    backgroundStorage.set('session_state', 'active');
    backgroundStorage.set('alerts_active', true);
    backgroundStorage.remove('dwell_timer_expires');
    await Notifications.cancelScheduledNotificationAsync('arrived-consent-prompt').catch(() => {});
  }

  static async checkSessionStatus() {
    const state = this.getSessionState();
    if (state === 'closing') {
      const expiresStr = backgroundStorage.getString('dwell_timer_expires');
      if (expiresStr) {
        const expires = parseInt(expiresStr, 10);
        if (Date.now() >= expires) {
          console.log('[SessionManager] Session closing dwell timer expired. Closing session silently.');
          await this.closeSession(false);
        }
      }
    }
  }
}
