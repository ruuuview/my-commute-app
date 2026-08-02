import { createMMKV } from 'react-native-mmkv';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LiveActivityService } from './LiveActivityService';
import { triggerTier2Grab, onTier2CachePopulated, getTier2Cache } from './tier2Cache';
import { maybeFireDirectionNotification } from './directionNotification';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { notifyTier1GeofenceHit, requestPermission } from '../store/permissionOrchestrator';
import { tflCapitalise } from '../utils/tflCapitalise';
import { APP_CONFIG } from '../config/app.config';
import { ensureDeviceIdentity } from './deviceIdentity';

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

  static getCommuteLineId(): string {
    return backgroundStorage.getString('commute_line_id') ?? 'unknown';
  }

  static getCommuteStartTime(): number | null {
    const val = backgroundStorage.getString('commute_start_time');
    return val ? parseInt(val, 10) : null;
  }

  static async startSession(originId: string, destinationId: string, lineId: string, lineName: string) {
    console.log(`[SessionManager] Starting session. Origin: ${originId}, Dest: ${destinationId}, Line: ${lineId}`);

    // Tier 1 geofence hit — the "user has seen real value once" signal for
    // the Always-location upgrade primer (plan Phase 4 #13). First hit
    // triggers the upgrade ask; fire-and-forget so it never blocks the
    // session start.
    try {
      const hitCount = notifyTier1GeofenceHit();
      if (hitCount === 1) {
        void requestPermission('locationAlways', 'tier1_upgrade');
      }
    } catch (e) {
      console.warn('[SessionManager] Tier1 upgrade trigger failed:', e);
    }
    
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

      await LiveActivityService.start(originId, lineId);

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

    // P0: Fire the Tier 2 cache grab immediately + silently on geofence entry.
    // The Tier2CacheManager WRITES the cache; the Swift Live Activity READS it.
    // Single write, single source — never duplicate this cache elsewhere.
    const prefState = useUserPreferencesStore.getState();
    const targetStation = (prefState.pinnedStations || []).find((s) => s.id === stationId);
    const lineId = targetStation?.lines?.[0] || prefState.selectedLines?.[0] || 'unknown';
    triggerTier2Grab(stationId, lineId);

    // Fire the Type B direction notification once the Tier 2 cache populates.
    // Single-shot subscription: fires for THIS station, then cleans itself up.
    // Falls through to Priority 2 (no notification) if no endpoints derivable.
    const unsub = onTier2CachePopulated((cache) => {
      if (cache.stationId !== stationId) return; // not our station yet
      unsub();
      maybeFireDirectionNotification(stationId, lineId, cache).catch((e) =>
        console.error('[SessionManager] Direction notification failed:', e)
      );
    });

    // Live Activity reads the Tier 2 cache. Subscribe so every cache refresh
    // (re-)renders the Island / Lock Screen. Single source of truth, no dup.
    let wasNoSignal = !getTier2Cache(stationId);
    const unsubscribe = onTier2CachePopulated((cache) => {
      if (cache.stationId !== stationId) return;
      LiveActivityService.update(stationId, lineId).catch((e) =>
        console.error('[SessionManager] Live Activity update from cache failed:', e)
      );
      // Signal returned after a gap: recovery flash + one-time local push.
      if (wasNoSignal) {
        wasNoSignal = false;
        const hero = (cache.platforms || [])[0];
        const dest = hero?.destinationName || tflCapitalise(lineId);
        const mins = Math.max(0, Math.round((hero?.timeToStation || 0) / 60));
        Notifications.scheduleNotificationAsync({
          content: {
            title: 'Got it',
            body: `${dest}, ${mins} min`,
            sound: false,
          },
          trigger: null,
        }).catch(() => {});
      }
    });
    (LiveActivityService as any).__unsub = unsubscribe;

    // No-signal handling: if the cache never populates within a short window,
    // fire the one-time Type B local push (zero network). Honest void, not a
    // false card — the Live Activity is simply not started until data exists.
    const noSignalTimer = setTimeout(() => {
      if (!getTier2Cache(stationId)) {
        Notifications.scheduleNotificationAsync({
          content: {
            title: "Signal's patchy here — still trying.",
            body: 'Check the platform board for now.',
            sound: false,
          },
          trigger: null,
        }).catch(() => {});
      }
    }, 6000);
    backgroundStorage.set('__no_signal_timer', '1');
    // Store timer handle for cleanup on session end.
    (LiveActivityService as any).__noSignalTimer = noSignalTimer;

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
      const exitLineId = this.getCommuteLineId();
      if (stationId === originId) {
        // Exited origin station -> set Live Activity status to In Transit
        const isRunning = await LiveActivityService.isActive();
        if (isRunning) {
          try {
            // Refresh the Live Activity from the (now mid-journey) Tier 2 cache.
            await LiveActivityService.update(originId, exitLineId);
          } catch (e) {
            console.error('[SessionManager] Exit update failed:', e);
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

    // Capture session data before clearing MMKV keys
    const originId = this.getCommuteOriginId()
    const destId = this.getCommuteDestinationId()
    const lineId = this.getCommuteLineId()
    const startTime = this.getCommuteStartTime()

    await LiveActivityService.end().catch(e => console.error('[SessionManager] End Live Activity failed:', e));

    // Detach the Tier 2 cache listener + clear the no-signal timer.
    const unsub = (LiveActivityService as any).__unsub;
    if (typeof unsub === 'function') { try { unsub(); } catch {} }
    const timer = (LiveActivityService as any).__noSignalTimer;
    if (typeof timer === 'number') { clearTimeout(timer); }
    backgroundStorage.remove('__no_signal_timer');
    backgroundStorage.remove('tfl_global_outage');
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

    // Fire-and-forget POST to backend with completed journey data
    if (originId && lineId && lineId !== 'unknown' && startTime) {
      this.postSessionToBackend({
        lineId,
        entryStation: originId,
        exitStation: destId || undefined,
        entryTime: new Date(startTime).toISOString(),
        exitTime: new Date(Date.now()).toISOString(),
      }).catch(err => console.error('[SessionManager] Backend session POST failed:', err));
    } else {
      console.warn('[SessionManager] Cannot POST session — missing data:', { originId, lineId, startTime });
    }

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

  /**
   * POST a completed journey to the backend /api/sessions endpoint.
   * Reads auth from AsyncStorage (same pattern as notificationRegistrationService).
   * Fire-and-forget — failures are logged, never thrown.
   */
  private static async postSessionToBackend(payload: {
    lineId: string;
    entryStation: string;
    exitStation?: string;
    entryTime: string;
    exitTime: string;
  }) {
    try {
      // Bug #3 fix: keys are guaranteed to exist (created at onboarding
      // finish); this lazy ensure also self-heals older installs.
      const { userId, apiKey } = await ensureDeviceIdentity();

      // /api/sessions lives on the Next.js backend (Railway), NOT the push
      // brain (Vercel) — the old BACKEND_URL target returned 404 and sessions
      // never landed in Neon, so claims could never be created from them.
      const response = await fetch(`${APP_CONFIG.BACKEND_API_URL}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          lineId: payload.lineId,
          entryStation: payload.entryStation,
          exitStation: payload.exitStation || null,
          entryTime: payload.entryTime,
          exitTime: payload.exitTime,
          motionConfirmed: true,
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => 'no body');
        console.error(`[SessionManager] Backend POST /api/sessions returned ${response.status}: ${text}`);
        return;
      }

      const result = await response.json();
      console.log(
        `[SessionManager] Session ${result.sessionId} created — ` +
        `${result.claimsCreated ?? 0} claims, ${result.notificationsSent ?? 0} notifications`
      );
    } catch (err) {
      console.error('[SessionManager] Failed to POST session to backend:', err);
    }
  }
}
