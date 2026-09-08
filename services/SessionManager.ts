import { createMMKV } from 'react-native-mmkv';
import * as Notifications from 'expo-notifications';
import { LiveActivityService } from './LiveActivityService';
import { triggerTier2Grab, onTier2CachePopulated, getTier2Cache } from './tier2Cache';
import { maybeFireDirectionNotification } from './directionNotification';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { notifyTier1GeofenceHit, requestPermission } from '../store/permissionOrchestrator';
import { tflCapitalise } from '../utils/tflCapitalise';
import { APP_CONFIG } from '../config/app.config';
import { ensureDeviceIdentity } from './deviceIdentity';
import { ArrivalDetector, type LocationFix, type StationLocation } from './ArrivalDetector';
import { deriveSessionCorridor } from '../components/rerouteHelpers';

const stationCoordinates = require('../data/stationCoordinates.json');

export type SessionState = 'idle' | 'active' | 'closing';

const backgroundStorage = createMMKV({ id: 'background-storage' });

export const CONSENT_DWELL_MINUTES = 27;
export const CONSENT_DWELL_MS = CONSENT_DWELL_MINUTES * 60 * 1000;
export const ARRIVAL_DWELL_MINUTES = 5;
export const ARRIVAL_DWELL_MS = ARRIVAL_DWELL_MINUTES * 60 * 1000;

// Section 12: Geofence Configuration (Zone 1 Safe)
export const GEOFENCE_CONFIG = {
  ORIGIN_RADIUS_METERS: 150,
  ORIGIN_COOLDOWN_MS: 60 * 60 * 1000, // 60 minutes
  DESTINATION_INNER_RADIUS_METERS: 100, // 45s dwell
  DESTINATION_OUTER_RADIUS_METERS: 200,
};

// Section 5.4: Station Complexes (Zone 1)
export interface StationComplex {
  complexId: string;
  lines: string[];
  center: { lat: number; lng: number };
  radius: number; // 100m
}

export const STATION_COMPLEXES: Record<string, StationComplex> = {
  kings_cross_st_pancras: {
    complexId: 'kings_cross_st_pancras',
    lines: ['Northern', 'Piccadilly', 'Victoria', 'Circle', 'Hammersmith', 'Metropolitan'],
    center: { lat: 51.5308, lng: -0.1238 },
    radius: 100,
  },
  bank_monument: {
    complexId: 'bank_monument',
    lines: ['Northern', 'Central', 'Waterloo & City', 'DLR', 'Circle', 'District'],
    center: { lat: 51.5133, lng: -0.0886 },
    radius: 100,
  },
  oxford_circus: {
    complexId: 'oxford_circus',
    lines: ['Bakerloo', 'Central', 'Victoria'],
    center: { lat: 51.5152, lng: -0.1418 },
    radius: 100,
  },
  victoria: {
    complexId: 'victoria',
    lines: ['Victoria', 'District', 'Circle'],
    center: { lat: 51.4952, lng: -0.1439 },
    radius: 100,
  },
  waterloo: {
    complexId: 'waterloo',
    lines: ['Bakerloo', 'Jubilee', 'Northern', 'Waterloo & City'],
    center: { lat: 51.5036, lng: -0.1143 },
    radius: 100,
  },
  london_bridge: {
    complexId: 'london_bridge',
    lines: ['Jubilee', 'Northern'],
    center: { lat: 51.5057, lng: -0.0888 },
    radius: 100,
  },
  liverpool_street: {
    complexId: 'liverpool_street',
    lines: ['Central', 'Circle', 'Hammersmith', 'Metropolitan', 'Elizabeth'],
    center: { lat: 51.5178, lng: -0.0823 },
    radius: 100,
  },
  paddington: {
    complexId: 'paddington',
    lines: ['Bakerloo', 'Circle', 'District', 'Hammersmith', 'Elizabeth'],
    center: { lat: 51.5164, lng: -0.1769 },
    radius: 100,
  },
  euston: {
    complexId: 'euston',
    lines: ['Northern', 'Victoria'],
    center: { lat: 51.5284, lng: -0.1337 },
    radius: 100,
  },
  tottenham_court_road: {
    complexId: 'tottenham_court_road',
    lines: ['Central', 'Northern', 'Elizabeth'],
    center: { lat: 51.5165, lng: -0.1310 },
    radius: 100,
  },
  holborn: {
    complexId: 'holborn',
    lines: ['Central', 'Piccadilly'],
    center: { lat: 51.5174, lng: -0.1200 },
    radius: 100,
  },
  leicester_square: {
    complexId: 'leicester_square',
    lines: ['Northern', 'Piccadilly'],
    center: { lat: 51.5113, lng: -0.1284 },
    radius: 100,
  },
  green_park: {
    complexId: 'green_park',
    lines: ['Jubilee', 'Piccadilly', 'Victoria'],
    center: { lat: 51.5067, lng: -0.1428 },
    radius: 100,
  },
  south_kensington: {
    complexId: 'south_kensington',
    lines: ['District', 'Circle', 'Piccadilly'],
    center: { lat: 51.4941, lng: -0.1738 },
    radius: 100,
  },
  westminster: {
    complexId: 'westminster',
    lines: ['Circle', 'District', 'Jubilee'],
    center: { lat: 51.501, lng: -0.1254 },
    radius: 100,
  },
  piccadilly_circus: {
    complexId: 'piccadilly_circus',
    lines: ['Bakerloo', 'Piccadilly'],
    center: { lat: 51.5098, lng: -0.1342 },
    radius: 100,
  },
  embankment: {
    complexId: 'embankment',
    lines: ['Bakerloo', 'Circle', 'District', 'Northern'],
    center: { lat: 51.5071, lng: -0.1223 },
    radius: 100,
  },
  charing_cross: {
    complexId: 'charing_cross',
    lines: ['Bakerloo', 'Northern'],
    center: { lat: 51.5081, lng: -0.1248 },
    radius: 100,
  },
  covent_garden: {
    complexId: 'covent_garden',
    lines: ['Piccadilly'],
    center: { lat: 51.5129, lng: -0.1243 },
    radius: 100,
  },
  bond_street: {
    complexId: 'bond_street',
    lines: ['Central', 'Jubilee', 'Elizabeth'],
    center: { lat: 51.5142, lng: -0.1494 },
    radius: 100,
  },
};

// Section 5.5: Tunnel Segments
export interface TunnelSegment {
  segmentId: string;
  lineId: string;
  stations: string[];
  typicalDurationSeconds: number;
  maxObservedDurationSeconds: number;
}

export const TUNNEL_SEGMENTS: Record<string, TunnelSegment> = {
  northern_camden_to_kennington: {
    segmentId: 'northern_camden_to_kennington',
    lineId: 'northern',
    stations: [
      'Camden Town',
      'Euston',
      'Warren Street',
      'Goodge Street',
      'Tottenham Court Road',
      'Leicester Square',
      'Charing Cross',
      'Embankment',
      'Waterloo',
      'Kennington',
    ],
    typicalDurationSeconds: 480,
    maxObservedDurationSeconds: 720,
  },
  central_holborn_to_chancery_lane: {
    segmentId: 'central_holborn_to_chancery_lane',
    lineId: 'central',
    stations: ['Holborn', 'Chancery Lane'],
    typicalDurationSeconds: 120,
    maxObservedDurationSeconds: 180,
  },
  victoria_kings_cross_to_victoria: {
    segmentId: 'victoria_kings_cross_to_victoria',
    lineId: 'victoria',
    stations: [
      "King's Cross St. Pancras",
      'Euston',
      'Warren Street',
      'Oxford Circus',
      'Green Park',
      'Victoria',
    ],
    typicalDurationSeconds: 420,
    maxObservedDurationSeconds: 660,
  },
  jubilee_baker_street_to_london_bridge: {
    segmentId: 'jubilee_baker_street_to_london_bridge',
    lineId: 'jubilee',
    stations: [
      'Baker Street',
      'Bond Street',
      'Green Park',
      'Westminster',
      'Waterloo',
      'Southwark',
      'London Bridge',
    ],
    typicalDurationSeconds: 450,
    maxObservedDurationSeconds: 700,
  },
  piccadilly_kings_cross_to_south_kensington: {
    segmentId: 'piccadilly_kings_cross_to_south_kensington',
    lineId: 'piccadilly',
    stations: [
      "King's Cross St. Pancras",
      'Russell Square',
      'Holborn',
      'Covent Garden',
      'Leicester Square',
      'Piccadilly Circus',
      'Green Park',
      'Hyde Park Corner',
      'Knightsbridge',
      'South Kensington',
    ],
    typicalDurationSeconds: 600,
    maxObservedDurationSeconds: 900,
  },
  bakerloo_paddington_to_elephant: {
    segmentId: 'bakerloo_paddington_to_elephant',
    lineId: 'bakerloo',
    stations: [
      'Paddington',
      'Edgware Road',
      'Marylebone',
      'Baker Street',
      "Regent's Park",
      'Oxford Circus',
      'Piccadilly Circus',
      'Charing Cross',
      'Embankment',
      'Waterloo',
      'Lambeth North',
      'Elephant & Castle',
    ],
    typicalDurationSeconds: 660,
    maxObservedDurationSeconds: 960,
  },
};

function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Section 11: Arrival Validation (No CLVisit)
export type ArrivalAction =
  | { type: 'dismiss'; delaySeconds: number }
  | { type: 'keepRunning' };

export function validateArrival(
  timerRemainingSeconds: number,
  lastGPS: { lat: number; lng: number; accuracy: number } | null,
  lastServerUpdateMs: number,
  destination: { lat: number; lng: number },
  currentSegment?: TunnelSegment | null
): ArrivalAction {
  if (lastGPS && lastGPS.accuracy < 50) {
    const dist = calculateHaversineDistance(lastGPS.lat, lastGPS.lng, destination.lat, destination.lng);
    if (dist < 100) {
      return { type: 'dismiss', delaySeconds: 60 };
    }
  }

  const timeSinceLastUpdateMs = Date.now() - lastServerUpdateMs;
  if (timerRemainingSeconds <= 0 && timeSinceLastUpdateMs < 90 * 1000) {
    return { type: 'dismiss', delaySeconds: 60 };
  }

  if (timerRemainingSeconds <= 0) {
    const timeout = Math.max(120, (currentSegment?.maxObservedDurationSeconds ?? 120) + 60);
    if (Math.abs(timerRemainingSeconds) > timeout) {
      return { type: 'dismiss', delaySeconds: 120 };
    }
  }

  return { type: 'keepRunning' };
}

const activeCacheSubs = new Map<
  string,
  { unsubDirection?: () => void; unsubLiveActivity?: () => void; timer?: ReturnType<typeof setTimeout> }
>();

export class SessionManager {
  private static activeDetector: ArrivalDetector | null = null;
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

  static getTouchInTime(): number | null {
    const val = backgroundStorage.getString('touch_in_time');
    return val ? parseInt(val, 10) : null;
  }

  static getActiveDetector(): ArrivalDetector | null {
    return this.activeDetector;
  }

  static recordIntermediateFix(stationId: string) {
    if (!stationId) return;
    if (this.getSessionState() !== 'active') return;
    const currentStartTime = this.getCommuteStartTime();
    if (!currentStartTime) return;
    try {
      const raw = backgroundStorage.getString('commute_intermediate_fixes');
      let record: { sessionStartTime: number; fixes: string[] } | null = null;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.sessionStartTime === currentStartTime && Array.isArray(parsed.fixes)) {
            record = parsed;
          }
        } catch {}
      }
      if (!record) {
        record = { sessionStartTime: currentStartTime, fixes: [] };
      }
      if (!record.fixes.includes(stationId)) {
        record.fixes.push(stationId);
        backgroundStorage.set('commute_intermediate_fixes', JSON.stringify(record));
      }
    } catch {
      // Non-blocking storage write
    }
  }

  static getIntermediateFixes(): string[] {
    try {
      const currentStartTime = this.getCommuteStartTime();
      const raw = backgroundStorage.getString('commute_intermediate_fixes');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (parsed.sessionStartTime && parsed.sessionStartTime === currentStartTime && Array.isArray(parsed.fixes)) {
          return parsed.fixes;
        }
        // Stale or unaligned session evidence: immediately wipe to prevent cross-session contamination
        backgroundStorage.remove('commute_intermediate_fixes');
        return [];
      }
      if (!currentStartTime) {
        backgroundStorage.remove('commute_intermediate_fixes');
        return [];
      }
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Process a location fix from CoreLocation through the ArrivalDetector state machine.
   */
  static handleLocationFix(fix: LocationFix) {
    if (!this.activeDetector || this.getSessionState() !== 'active') return null;
    const result = this.activeDetector.processFix(fix);
    if (result.currentStation) {
      this.recordIntermediateFix(result.currentStation.id);
    }
    if (result.state === 'confirmed_arrival' && result.confirmedStation) {
      const destId = this.getCommuteDestinationId();
      const destName = backgroundStorage.getString('commute_destination_name');
      const isDestination =
        result.confirmedStation.id === destId ||
        Boolean(
          destName &&
            (result.confirmedStation.name.toLowerCase().includes(destName.toLowerCase()) ||
              destName.toLowerCase().includes(result.confirmedStation.name.toLowerCase()))
        );
      if (isDestination) {
        console.log(`[SessionManager] Arrival confirmed at destination: ${result.confirmedStation.name}`);
        backgroundStorage.set('commute_phase', 'arrived');
        backgroundStorage.set('touch_out_time', String(result.arrivalTimestampMs || Date.now()));
        void LiveActivityService.updatePhase('arrived', result.confirmedStation.name);
      }
    }
    return result;
  }

  static async startSession(originId: string, destinationId: string, lineId: string, lineName: string) {
    console.log(`[SessionManager] Starting session. Origin: ${originId}, Dest: ${destinationId}, Line: ${lineId}`);

    try {
      const hitCount = notifyTier1GeofenceHit();
      if (hitCount === 1) {
        void requestPermission('locationAlways', 'tier1_upgrade');
      }
    } catch (e) {
      console.warn('[SessionManager] Tier1 upgrade trigger failed:', e);
    }
    
    const nowMs = Date.now();
    backgroundStorage.set('session_state', 'active');
    backgroundStorage.set('commute_phase', 'approaching');
    backgroundStorage.set('commute_session_start_time', Math.floor(nowMs / 1000));
    backgroundStorage.set('alerts_active', true);
    backgroundStorage.set('commute_destination_id', destinationId);
    backgroundStorage.set('commute_origin_id', originId);
    backgroundStorage.set('commute_line_id', lineId);
    backgroundStorage.set('commute_start_time', String(nowMs));
    backgroundStorage.set('touch_in_time', String(nowMs));
    backgroundStorage.remove('dwell_timer_expires');
    backgroundStorage.remove('notified_departed');
    backgroundStorage.remove('commute_intermediate_fixes');
    await Notifications.cancelScheduledNotificationAsync('arrived-consent-prompt').catch(() => {});

    // Instantiate deterministic ArrivalDetector for the corridor
    const rawStations = (stationCoordinates || {}) as Record<string, any>;
    const lineStations: StationLocation[] = Object.values(rawStations).map((s: any) => ({
      id: s.id,
      name: s.name,
      latitude: s.lat,
      longitude: s.lon,
    }));
    this.activeDetector = new ArrivalDetector(lineStations, originId);

    // Start Live Activity with Shush Mode check
    try {
      const state = useUserPreferencesStore.getState();
      const deliveryMode = state.shushPreferences?.alertDeliveryMode || 'shush';
      
      if (deliveryMode === 'off') {
        console.log('[SessionManager] Alert delivery mode is OFF — session started silently without Live Activity.');
        return;
      }

      const pinned = state.pinnedStations || [];
      const origin = pinned.find(s => s.id === originId)?.name || 'Origin';
      const dest = pinned.find(s => s.id === destinationId)?.name || 'Destination';

      backgroundStorage.set('commute_origin_name', origin);
      backgroundStorage.set('commute_destination_name', dest);

      await LiveActivityService.start(originId, lineId, 'geofence');

      // Shush Mode: No audible chime, no banner. Loud mode: send banner + sound.
      if (deliveryMode === 'loud') {
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
      }
    } catch (e) {
      console.error('[SessionManager] Failed to start Live Activity:', e);
    }
  }

  static async handleGeofenceEnter(stationId: string, role: 'home' | 'work' | 'other', stationName: string) {
    const currentState = this.getSessionState();
    console.log(`[SessionManager] Entered geofence: ${stationId} (${role}), state: ${currentState}`);

    const prefState = useUserPreferencesStore.getState();
    const deliveryMode = prefState.shushPreferences?.alertDeliveryMode || 'shush';
    if (deliveryMode === 'off') {
      console.log(`[SessionManager] Shush delivery mode is OFF — suppressing geofence trigger.`);
      return;
    }

    // Rule 10: Bidirectional Commute Geofence Invariant
    if (currentState === 'idle' && role !== 'home' && role !== 'work') {
      console.log(`[SessionManager] Geofence entered for role '${role}' — ignoring for autonomous commute dispatch.`);
      return;
    }

    const targetStation = (prefState.pinnedStations || []).find((s) => s.id === stationId);
    const lineId = targetStation?.lines?.[0] || prefState.selectedLines?.[0] || 'unknown';
    triggerTier2Grab(stationId, lineId);

    let unsubDirection: (() => void) | undefined;
    let firedDirection = false;
    unsubDirection = onTier2CachePopulated((cache) => {
      if (cache.stationId !== stationId || firedDirection) return;
      firedDirection = true;
      unsubDirection?.();
      maybeFireDirectionNotification(stationId, lineId, cache).catch((e) =>
        console.error('[SessionManager] Direction notification failed:', e)
      );
    });
    if (firedDirection) unsubDirection?.();

    let wasNoSignal = false;
    const unsubLiveActivity = onTier2CachePopulated((cache) => {
      if (cache.stationId !== stationId) return;
      LiveActivityService.update(stationId, lineId).catch((e) =>
        console.error('[SessionManager] Live Activity update from cache failed:', e)
      );
      if (wasNoSignal) {
        wasNoSignal = false;
        if (deliveryMode === 'loud') {
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
      }
    });

    const noSignalTimer = setTimeout(() => {
      if (!getTier2Cache(stationId)) {
        wasNoSignal = true;
        if (deliveryMode === 'loud') {
          Notifications.scheduleNotificationAsync({
            content: {
              title: "Signal's patchy here — still trying.",
              body: 'Check the platform board for now.',
              sound: false,
            },
            trigger: null,
          }).catch(() => {});
        }
      }
    }, 6000);

    const previous = activeCacheSubs.get(stationId);
    if (previous) {
      previous.unsubDirection?.();
      previous.unsubLiveActivity?.();
      if (previous.timer != null) clearTimeout(previous.timer);
    }
    activeCacheSubs.set(stationId, { unsubDirection, unsubLiveActivity, timer: noSignalTimer });

    const pinnedStations = prefState.pinnedStations || [];

    if (currentState === 'idle') {
      // Rule 10: Bidirectional Commute Geofence Invariant
      if (role !== 'home' && role !== 'work') {
        console.log(`[SessionManager] Geofence entered for role '${role}' — ignoring for autonomous commute dispatch.`);
        return;
      }

      let destStation = null;
      if (role === 'home') {
        destStation = pinnedStations.find(s => s.role === 'work');
      } else if (role === 'work') {
        destStation = pinnedStations.find(s => s.role === 'home');
      }

      if (destStation && destStation.id !== stationId) {
        let selectedLineId = targetStation?.lines?.[0];
        if (!selectedLineId) {
          selectedLineId = prefState.selectedLines?.[0];
        }
        if (!selectedLineId) {
          selectedLineId = 'unknown';
          console.warn(`[SessionManager] No line data found for station ${stationId}, using 'unknown'`);
        }
        const lineName = tflCapitalise(selectedLineId);
        await this.startSession(stationId, destStation.id, selectedLineId, lineName);
      }
      return;
    }

    if (currentState === 'active') {
      const destId = this.getCommuteDestinationId();
      if ((role === 'home' || role === 'work') && stationId === destId) {
        const prefs = useUserPreferencesStore.getState();
        if (!prefs.labelsConfirmed) {
          console.log(`[SessionManager] Home not confirmed — closing session without arrival notification.`);
          await this.closeSession(false);
          return;
        }
        if (!prefs.arrivalNotificationsEnabled) {
          console.log(`[SessionManager] Arrival notifications disabled — closing session without notification.`);
          await this.closeSession(false);
          return;
        }

        console.log(`[SessionManager] Entering destination geofence. Initiating ${ARRIVAL_DWELL_MINUTES}‑minute dwell check.`);

        const snoozeExpiry = prefs.arrivalSnoozeExpiry;
        if (snoozeExpiry && Date.now() < snoozeExpiry) {
          console.log(`[SessionManager] Snoozed until ${new Date(snoozeExpiry).toISOString()} — skipping arrival.`);
          await this.closeSession(false);
          return;
        }

        const body = SessionManager._buildArrivalBody(
          prefs.selectedLines || [],
          prefs.lastKnownData || []
        );

        const expires = Date.now() + ARRIVAL_DWELL_MS;
        backgroundStorage.set('session_state', 'closing');
        backgroundStorage.set('dwell_timer_expires', String(expires));

        await Notifications.cancelScheduledNotificationAsync('arrived-consent-prompt').catch(() => {});
        await Notifications.scheduleNotificationAsync({
          identifier: 'arrived-consent-prompt',
          content: {
            title: `Welcome home.`,
            body: body,
            categoryIdentifier: 'ARRIVED_ALERT',
            sound: deliveryMode === 'loud',
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

    const state = useUserPreferencesStore.getState();
    const deliveryMode = state.shushPreferences?.alertDeliveryMode || 'shush';

    if (currentState === 'active') {
      const originId = this.getCommuteOriginId();
      const exitLineId = this.getCommuteLineId();
      if (stationId === originId) {
        backgroundStorage.set('commute_phase', 'in_transit');
        void LiveActivityService.updatePhase('in_transit');

        const isRunning = await LiveActivityService.isActive();
        if (isRunning) {
          try {
            await LiveActivityService.update(originId, exitLineId);
          } catch (e) {
            console.error('[SessionManager] Exit update failed:', e);
          }
        }

        const alreadyNotified = backgroundStorage.getBoolean('notified_departed') ?? false;
        if (!alreadyNotified && deliveryMode === 'loud') {
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
        const expiresStr = backgroundStorage.getString('dwell_timer_expires');
        if (expiresStr) {
          const expires = parseInt(expiresStr, 10);
          if (Date.now() < expires) {
            console.log(`[SessionManager] Exited destination before ${ARRIVAL_DWELL_MINUTES}m dwell. Restoring active session.`);
            await Notifications.cancelScheduledNotificationAsync('arrived-consent-prompt').catch(() => {});
            backgroundStorage.set('session_state', 'active');
            backgroundStorage.remove('dwell_timer_expires');
            backgroundStorage.set('notified_departed', false);

            if (deliveryMode === 'loud') {
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
  }

  static async closeSession(forceQuiet: boolean) {
    console.log(`[SessionManager] Closing session. ForceQuiet: ${forceQuiet}`);

    const originId = this.getCommuteOriginId();
    const destId = this.getCommuteDestinationId();
    const lineId = this.getCommuteLineId();
    const startTime = this.getCommuteStartTime();

    await LiveActivityService.end('destination_reached').catch(e => console.error('[SessionManager] End Live Activity failed:', e));

    for (const [, handle] of activeCacheSubs.entries()) {
      try { handle.unsubDirection?.(); } catch {}
      try { handle.unsubLiveActivity?.(); } catch {}
      if (handle.timer != null) { clearTimeout(handle.timer); }
    }
    activeCacheSubs.clear();
    backgroundStorage.remove('__no_signal_timer');
    backgroundStorage.remove('tfl_global_outage');
    backgroundStorage.set('session_state', 'idle');
    backgroundStorage.remove('dwell_timer_expires');

    const store = useUserPreferencesStore.getState();
    useUserPreferencesStore.setState({ completedJourneys: (store.completedJourneys || 0) + 1 });
    const touchInTime = this.getTouchInTime() || startTime;
    this.activeDetector = null;
    const intermediateFixes = this.getIntermediateFixes();
    const corridorResult = deriveSessionCorridor({
      lineId: lineId || '',
      originStation: originId || '',
      destinationStation: destId || '',
      intermediateFixes,
    });
    backgroundStorage.remove('commute_intermediate_fixes');
    backgroundStorage.remove('commute_phase');
    backgroundStorage.remove('commute_session_start_time');
    backgroundStorage.remove('commute_origin_name');
    backgroundStorage.remove('commute_destination_name');
    backgroundStorage.remove('commute_destination_id');
    backgroundStorage.remove('commute_origin_id');
    backgroundStorage.remove('commute_line_id');
    backgroundStorage.remove('commute_start_time');
    backgroundStorage.remove('touch_in_time');
    await Notifications.cancelScheduledNotificationAsync('arrived-consent-prompt').catch(() => {});

    if (originId && lineId && lineId !== 'unknown' && (touchInTime || startTime)) {
      this.postSessionToBackend({
        lineId,
        entryStation: originId,
        exitStation: destId || undefined,
        entryTime: new Date(touchInTime || startTime!).toISOString(),
        exitTime: new Date(Date.now()).toISOString(),
        corridorWitness: corridorResult.corridor || undefined,
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

  static _buildArrivalBody(selectedLines: any[], lastKnownData: any[]): string {
    if (!selectedLines || selectedLines.length === 0) return 'Your lines are all clear.';

    const lineIds = selectedLines.map((l: any) =>
      typeof l === 'string' ? l.toLowerCase() : (l.id || l.lineId || '').toLowerCase()
    ).filter(Boolean);

    if (lineIds.length === 0) return 'Your lines are all clear.';

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

  private static async postSessionToBackend(payload: {
    lineId: string;
    entryStation: string;
    exitStation?: string;
    entryTime: string;
    exitTime: string;
    corridorWitness?: string;
  }) {
    try {
      const { userId, apiKey } = await ensureDeviceIdentity();
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
          branch: payload.corridorWitness || null,
          corridorWitness: payload.corridorWitness || null,
          corridor_witness: payload.corridorWitness || null,
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
