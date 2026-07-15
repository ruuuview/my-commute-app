import { NativeModules } from 'react-native';
import { createMMKV } from 'react-native-mmkv';
import * as Notifications from 'expo-notifications';
import { LiveActivityService } from './LiveActivityService';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { tflCapitalise } from '../utils/tflCapitalise';

export const CONSENT_DWELL_MINUTES = 27;
export const CONSENT_DWELL_MS = CONSENT_DWELL_MINUTES * 60 * 1000;
export const ARRIVAL_DWELL_MINUTES = 5;
export const ARRIVAL_DWELL_MS = ARRIVAL_DWELL_MINUTES * 60 * 1000;

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
          // Recovery 2: Fall back to 'unknown' and log warning
          lineId = 'unknown';
          console.warn(`[SessionManager] No line data found for station ${stationId} or subscribed lines, using 'unknown'`);
        }
        const lineName = tflCapitalise(lineId);
        await this.startSession(stationId, destStation.id, lineId, lineName);
      }
      return;
    }

    if (currentState === 'active') {
      const destId = this.getCommuteDestinationId();
      if ((role === 'home' || role === 'work') && stationId === destId) {
        // Confirmed-home gate: arrival notification only fires if labels are truth
        const prefs = useUserPreferencesStore.getState();
        if (!prefs.labelsConfirmed) {
          console.log(`[SessionManager] Home not confirmed — closing session without arrival notification.`);
          await this.closeSession(false);
          return;
        }
        // Arrival-notifications gate: user turned off welcome-home
        if (!prefs.arrivalNotificationsEnabled) {
          console.log(`[SessionManager] Arrival notifications disabled — closing session without notification.`);
          await this.closeSession(false);
          return;
        }

        console.log(`[SessionManager] Entering destination geofence. Initiating ${ARRIVAL_DWELL_MINUTES}‑minute dwell check.`);

        // Snooze gate: skip if user snoozed
        const snoozeExpiry = prefs.arrivalSnoozeExpiry;
        if (snoozeExpiry && Date.now() < snoozeExpiry) {
          console.log(`[SessionManager] Snoozed until ${new Date(snoozeExpiry).toISOString()} — skipping arrival.`);
          await this.closeSession(false);
          return;
        }

        // Build status-aware body from lastKnownData
        const body = SessionManager._buildArrivalBody(
          prefs.selectedLines || [],
          prefs.lastKnownData || []
        );

        const expires = Date.now() + ARRIVAL_DWELL_MS;
        backgroundStorage.set('session_state', 'closing');
        backgroundStorage.set('dwell_timer_expires', String(expires));

        // Schedule notification after dwell expires
        await Notifications.cancelScheduledNotificationAsync('arrived-consent-prompt').catch(() => {});
        await Notifications.scheduleNotificationAsync({
          identifier: 'arrived-consent-prompt',
          content: {
            title: `Welcome home.`,
            body: body,
            categoryIdentifier: 'ARRIVED_ALERT',
            sound: true,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: ARRIVAL_DWELL_MINUTES * 60,
          },
        }).catch(err => {
          console.error('[SessionManager] Failed to schedule arrival notification:', err);
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

    // Increment tracked commute count for confirmation-card trigger
    const store = useUserPreferencesStore.getState();
    useUserPreferencesStore.setState({ completedJourneys: (store.completedJourneys || 0) + 1 });
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

  /**
   * Build status-aware body for welcome-home notification.
   * Reads the user's tracked lines against cached TfL status data.
   * Never calls the copy engine — factual only, no LLM.
   */
  static _buildArrivalBody(selectedLines: any[], lastKnownData: any[]): string {
    if (!selectedLines || selectedLines.length === 0) return 'Your lines are all clear.';

    // Normalise tracked line IDs
    const lineIds = selectedLines.map((l: any) =>
      typeof l === 'string' ? l.toLowerCase() : (l.id || l.lineId || '').toLowerCase()
    ).filter(Boolean);

    if (lineIds.length === 0) return 'Your lines are all clear.';

    // Filter disrupted lines the user actually tracks
    // TfL severity codes: 10=good, 9/7=minor, 6=severe, 5/4/3/20/0/11/etc=suspended
    const SEVERE_CODES = new Set([6]);
    const MINOR_CODES = new Set([9, 7]);
    const SUSPENDED_CODES = new Set([5, 4, 3, 0, 11, 8, 16, 17, 19, 1, 2, 20]);

    const disrupted = (lastKnownData || []).filter((d: any) => {
      if (!d) return false;
      const did = (d.id || '').toLowerCase();
      const isBadSeverity = SEVERE_CODES.has(d.severity) || MINOR_CODES.has(d.severity) || SUSPENDED_CODES.has(d.severity);
      return lineIds.includes(did) && (d.is_disrupted || isBadSeverity);
    });

    if (disrupted.length === 0) return 'Your lines are all clear.';

    const names = disrupted.slice(0, 3).map((d: any) => {
      const n = d.name || d.id || '';
      return n.charAt(0).toUpperCase() + n.slice(1);
    });

    if (disrupted.length === 1) return `The ${names[0]} line is struggling.`;
    if (disrupted.length === 2) return `${names[0]} and ${names[1]} are struggling.`;
    return `${names[0]}, ${names[1]} and others are struggling.`;
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
