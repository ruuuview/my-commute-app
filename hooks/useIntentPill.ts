// hooks/useIntentPill.ts
// Contextual commute intent pill (Phase 3): "Heading to Work?" / "Heading Home?".
//
// UNIFICATION: this hook is a VIEW over the island's system, not a parallel
// brain.
// - Time windows, dismiss-learning, and suppression rules are pure policy in
//   utils/intentPillPolicy.ts (unit-tested).
// - Geofence radius is the island's single standard:
//   SessionManager.GEOFENCE_CONFIG.ORIGIN_RADIUS_METERS (150 m) — the same
//   radius the OS geofence that starts commute sessions uses.
// - Station coordinates: data/stationCoordinates.json (the dataset
//   SessionManager uses); distance via ArrivalDetector.calculateDistanceMeters
//   (the island's own haversine).
// - Arrivals: subscribeToStation + fetchOnce from services/stationArrivalsStore
//   (refcounted single-flight 30 s poller shared with the dashboard cards —
//   this hook adds no duplicate network fetches).
// - 1-TAP ACTION reuses the island's exact session path:
//   SessionManager.handleGeofenceEnter(originId, role, name) — the same entry
//   point the OS geofence uses. It resolves the destination by role
//   (home -> work, work -> home), picks the line, and starts the session +
//   Live Activity. Nothing parallel is invented here.
// - Never competes with a live session: when SessionManager's session state
//   is not 'idle', the island already owns the commute and the pill stays
//   silent.
//
// PILL-SCOPED (intentionally kept here — the island has no such concepts):
// - The commute windows themselves (07:00-10:00 / 16:30-19:30, device local).
// - Dismiss-learning: 3 ignored pills in a rolling 7 days => suppressed
//   7 days; a tap resets learning. (The vendored shell exposes no onDismiss
//   callback, so the hook arms its own timer: shown + untapped for the
//   display window => dismissal.)
// - Once-per-window-per-day guard.
//
// PERMISSION ARCHITECTURE (locked): the permission orchestrator owns ALL
// permission *requests* — this hook NEVER calls request*PermissionsAsync.
// Only passive get* status checks (never pop an OS dialog) and
// getCurrentPositionAsync in try/catch. When location is unavailable the
// intent pill simply does not fire — no fallback, no spam; the primer pill
// drives the grant.
//
// PRIORITY: 'intent' = 0 in store/pillStore.ts — strictly below setup (1) /
// shush (2) / boarding (3) / primer (4) / disruption (5). It can never
// preempt another pill and is dropped whenever anything else is active.

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { usePillStore } from '../store/pillStore';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { subscribeToStation, fetchOnce } from '../services/stationArrivalsStore';
import type { NormalizedDeparture } from '../services/apiService';
import { LINE_IDENTITY_COLORS } from '../constants/lineColors';
import { BEAM_ACCENT_DEFAULT } from '../components/BeamRing/beamPalettes';
import { calculateDistanceMeters } from '../services/ArrivalDetector';
import { GEOFENCE_CONFIG, SessionManager } from '../services/SessionManager';
import { tflCapitalise } from '../utils/tflCapitalise';
import stationCoordinates from '../data/stationCoordinates.json';
import {
  getIntentWindow,
  dayKeyFor,
  isIntentSuppressed,
  passesGeofence,
  type IntentWindow,
} from '../utils/intentPillPolicy';

// Must match the duration PillBridge passes to trigger().
const DISPLAY_MS = 4000;
// Grace after the shell auto-dismisses before we count a non-tap as ignored.
const DISMISS_GRACE_MS = 750;
/** getCurrentPositionAsync at most once per minute (battery). */
const POSITION_TTL_MS = 60_000;

// Northern's identity color is pure black — invisible as the 3px accent bar
// on the dark-glass pill. The app's convention (design system) is the
// obsidian specular lift #8A90A0 for Northern on dark surfaces.
const NORTHERN_DARK_LIFT = '#8A90A0';

function accentForLine(lineId: string): string {
  const c = LINE_IDENTITY_COLORS[lineId];
  if (!c) return '#888888';
  if (c.toLowerCase() === '#000000') return NORTHERN_DARK_LIFT;
  return c;
}

const COORDS = stationCoordinates as unknown as Record<
  string,
  { lat: number; lon: number } | undefined
>;

interface HomeWorkStation {
  id: string;
  name: string;
  lines: string[];
  role: 'home' | 'work' | 'other';
}

export function useIntentPill(): void {
  const pinned = useUserPreferencesStore((s) => s.pinnedStations) ?? [];
  const stationKey = pinned.map((s) => `${s.id}:${s.role}`).join(',');
  const pinnedRef = useRef<HomeWorkStation[]>(pinned as HomeWorkStation[]);
  pinnedRef.current = pinned as HomeWorkStation[];

  const positionRef = useRef<{
    at: number;
    pos: { latitude: number; longitude: number } | null;
  } | null>(null);
  const positionInflightRef = useRef<Promise<{
    latitude: number;
    longitude: number;
  } | null> | null>(null);
  const acceptedRef = useRef(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const clearDismissTimer = () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    };

    // Passive foreground-position read. Never requests permission.
    const getPosition = async (): Promise<{
      latitude: number;
      longitude: number;
    } | null> => {
      const now = Date.now();
      const cached = positionRef.current;
      if (cached && now - cached.at < POSITION_TTL_MS) return cached.pos;
      if (positionInflightRef.current) return positionInflightRef.current;
      const pending = (async () => {
        try {
          const fg = await Location.getForegroundPermissionsAsync();
          const bg = await Location.getBackgroundPermissionsAsync();
          if (fg.status !== 'granted' && bg.status !== 'granted') return null;
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        } catch {
          return null;
        }
      })();
      positionInflightRef.current = pending;
      try {
        const pos = await pending;
        positionRef.current = { at: Date.now(), pos };
        return pos;
      } finally {
        positionInflightRef.current = null;
      }
    };

    const evaluate = async (
      station: HomeWorkStation,
      departures: NormalizedDeparture[],
    ): Promise<void> => {
      if (cancelled) return;
      if (AppState.currentState !== 'active') return;

      const now = new Date();
      const window: IntentWindow | null = getIntentWindow(now);
      if (!window) return;

      const list = pinnedRef.current;
      const home = list.find((s) => s.role === 'home');
      const work = list.find((s) => s.role === 'work');
      // Guard: both ends of the commute must be set.
      if (!home || !work) return;
      const origin = window === 'morning' ? home : work;
      const dest = window === 'morning' ? work : home;
      // This tick is for the origin station of the current window only.
      if (station.id !== origin.id) return;

      // UNIFICATION: a live session means the island owns the commute.
      if (SessionManager.getSessionState() !== 'idle') return;

      const prefs = useUserPreferencesStore.getState();
      const todayKey = dayKeyFor(now);
      const nowMs = Date.now();
      if (
        isIntentSuppressed({
          dismissals: prefs.intentPillDismissals ?? [],
          suppressedUntil: prefs.intentPillSuppressedUntil ?? null,
          lastFired: prefs.intentPillLastFired ?? { morning: null, evening: null },
          window,
          todayKey,
          nowMs,
        })
      ) {
        return;
      }

      // Geofence-first: the user must be at the origin station. No
      // position => no pill (never fall back to an un-geofenced nudge).
      const pos = await getPosition();
      if (cancelled) return;
      if (!pos) return;
      const coords = COORDS[origin.id];
      const distanceM = coords
        ? calculateDistanceMeters(pos, { latitude: coords.lat, longitude: coords.lon })
        : null;
      if (!passesGeofence(distanceM, GEOFENCE_CONFIG.ORIGIN_RADIUS_METERS)) return;

      // Live countdown: soonest departure on the commute line from the
      // origin station. Same line resolution as the island's geofence path
      // (SessionManager.handleGeofenceEnter: origin.lines[0]).
      const selectedLines = prefs.selectedLines ?? [];
      const lineId = origin.lines?.[0] ?? selectedLines[0];
      if (!lineId) return;
      let soonest: NormalizedDeparture | null = null;
      for (const dep of departures ?? []) {
        if (dep == null || dep.lineId !== lineId) continue;
        if (dep.minutesAway < 0) continue;
        if (soonest === null || dep.minutesAway < soonest.minutesAway) {
          soonest = dep;
        }
      }
      if (!soonest) return;

      const id = `intent-${window}-${todayKey}`;
      const lineName = tflCapitalise(lineId);
      const title = window === 'morning' ? 'Heading to Work?' : 'Heading Home?';
      const message = `${dest.name} via ${lineName} \u00b7 ${soonest.minutesAway} min`;

      acceptedRef.current = false;
      clearDismissTimer();
      usePillStore.getState().requestPill({
        kind: 'intent',
        id,
        title,
        message,
        accent: accentForLine(lineId),
        // The beam stays the signature iridescent chrome even though the
        // content's accent bar carries the line identity color.
        beamAccent: BEAM_ACCENT_DEFAULT,
        onPress: () => {
          // Tap = user confirmed the intent: reset dismiss-learning and
          // start tracking through the island's exact session path.
          acceptedRef.current = true;
          clearDismissTimer();
          useUserPreferencesStore.getState().clearIntentPillLearning();
          void SessionManager.handleGeofenceEnter(origin.id, origin.role, origin.name);
        },
      });

      // Only count what actually displayed. Priority 0 means the request
      // is dropped whenever any other pill is active — a dropped request
      // is neither a fire nor a dismissal.
      if (usePillStore.getState().active?.id !== id) return;
      prefs.recordIntentPillFired(window, todayKey);

      // The vendored shell has no onDismiss callback: arm our own timer.
      // Shown + untapped for the display window => dismissal (Rule 1).
      dismissTimerRef.current = setTimeout(() => {
        if (cancelled || acceptedRef.current) return;
        useUserPreferencesStore.getState().recordIntentPillDismissal();
      }, DISPLAY_MS + DISMISS_GRACE_MS);
    };

    const home = pinnedRef.current.find((s) => s.role === 'home');
    const work = pinnedRef.current.find((s) => s.role === 'work');
    const targets = [home, work].filter((s): s is HomeWorkStation => !!s);
    if (targets.length === 0) return;

    // Refcounted subscriptions shared with the dashboard's DepartureCards —
    // no duplicate network fetches.
    const unsubs = targets.map((station) =>
      subscribeToStation(station.id, async (signal, force) => {
        const departures = await fetchOnce(station.id, signal, force);
        await evaluate(station, departures);
      }),
    );

    return () => {
      cancelled = true;
      clearDismissTimer();
      unsubs.forEach((unsub) => unsub());
    };
  }, [stationKey]);
}
