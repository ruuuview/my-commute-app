// frontend/hooks/useBoardingNudge.ts
// Boarding-nudge pill: watches ALL dashboard (pinned) stations and fires a
// one-shot 'boarding' pill when a train is 1-3 minutes away at a station the
// user is physically near (foreground geofence) — the in-app twin of the
// island's boarding state.
//
// UNIFICATION: this hook is a VIEW over the island's system, not a parallel
// brain.
// - Geofence radius is the island's single standard:
//   SessionManager.GEOFENCE_CONFIG.ORIGIN_RADIUS_METERS (150 m) — the same
//   radius the OS geofence that starts commute sessions uses. The old
//   pill-local 400 m constant is deleted.
// - While a commute session is active, the Live Activity already carries the
//   session origin station's live departures, so the pill defers for that
//   station (SessionManager.getSessionState/getCommuteOriginId) instead of
//   double-announcing.
// - Station coordinates come from data/stationCoordinates.json (the dataset
//   SessionManager uses); distance via ArrivalDetector.calculateDistanceMeters
//   (the island's own haversine); arrivals via the shared
//   stationArrivalsStore poller — no duplicated data or math anywhere.
// - Pill-scoped and intentionally kept here: the 1-3 minute boarding window
//   (the island has no "imminent boarding" edge — it renders countdowns
//   continuously), the fire-once-per-departure set, and the soonest-wins
//   candidate picker.
//
// SOURCES:
// - Stations: useUserPreferencesStore(s => s.pinnedStations) — the same list
//   the dashboard renders (one DepartureCard per pinned station).
// - Arrivals: subscribeToStation + fetchOnce from services/stationArrivalsStore
//   (refcounted single-flight 30 s poller shared with the dashboard cards, so
//   this hook adds no duplicate network fetches).
// - Station coordinates: data/stationCoordinates.json (same dataset
//   SessionManager uses), keyed by station id.
// - Distance: calculateDistanceMeters (haversine) from services/ArrivalDetector.
//
// PERMISSION ARCHITECTURE (locked): the permission orchestrator owns ALL
// permission *requests* — this hook NEVER calls
// requestForegroundPermissionsAsync / requestBackgroundPermissionsAsync.
// It uses only passive get* status checks (which never pop an OS dialog) and
// getCurrentPositionAsync in try/catch. When location is unavailable or
// denied there is no boarding pill at all — Level 3 honestly requires the
// 150 m geofence; the primer pill drives the grant.

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { usePillStore } from '../store/pillStore';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import {
  subscribeToStation,
  fetchOnce,
} from '../services/stationArrivalsStore';
import type { NormalizedDeparture } from '../services/apiService';
import { LINE_IDENTITY_COLORS } from '../constants/lineColors';
import { calculateDistanceMeters } from '../services/ArrivalDetector';
import { GEOFENCE_CONFIG, SessionManager } from '../services/SessionManager';
import stationCoordinates from '../data/stationCoordinates.json';

// Floored whole-minute window matching 0 < timeToStation <= 180s
// (departures report minutesAway as Math.floor(seconds / 60)).
const MIN_MINUTES = 1;
const MAX_MINUTES = 3;

/** getCurrentPositionAsync at most once per minute (battery). */
const POSITION_TTL_MS = 60_000;
/** Drop per-station candidates older than ~3 poll ticks. */
const CANDIDATE_TTL_MS = 90_000;
/** Bound the fire-once set. */
const FIRED_TTL_MS = 15 * 60_000;

interface StationCoord {
  lat: number;
  lon: number;
}

const COORDS = stationCoordinates as unknown as Record<
  string,
  StationCoord | undefined
>;

interface PinnedStationRef {
  id: string;
  name: string;
}

interface Candidate {
  stationId: string;
  stationName: string;
  dep: NormalizedDeparture;
  at: number;
}

/**
 * Stable per-departure identity for the fire-once set. Station-scoped: the
 * same physical train can appear in two pinned stations' feeds (shared
 * lines), and each station deserves its own nudge.
 */
function departureKey(stationId: string, dep: NormalizedDeparture): string {
  return `boarding:${stationId}|${dep.lineId}|${dep.destination}|${dep.expectedArrival}`;
}

export function useBoardingNudge(): void {
  const stations = useUserPreferencesStore((s) => s.pinnedStations) ?? [];
  const stationKey = stations.map((s) => s.id).join(',');
  const stationsRef = useRef<PinnedStationRef[]>(stations);
  stationsRef.current = stations;

  // Fire-once ids → timestamp (pruned to bound memory).
  const firedRef = useRef(new Map<string, number>());
  // Latest qualifying candidate per station.
  const candidatesRef = useRef(new Map<string, Candidate>());
  // Cached foreground position (or cached null when unavailable).
  const positionRef = useRef<{
    at: number;
    pos: { latitude: number; longitude: number } | null;
  } | null>(null);
  const positionInflightRef = useRef<Promise<{
    latitude: number;
    longitude: number;
  } | null> | null>(null);

  useEffect(() => {
    const list: PinnedStationRef[] = stationsRef.current;
    if (list.length === 0) {
      candidatesRef.current.clear();
      return;
    }

    let cancelled = false;

    // Passive foreground-position read. Never requests permission (see header).
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
          return {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
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

    const fireBest = () => {
      if (cancelled) return;
      const now = Date.now();
      for (const [id, c] of candidatesRef.current) {
        if (now - c.at > CANDIDATE_TTL_MS) candidatesRef.current.delete(id);
      }
      for (const [id, at] of firedRef.current) {
        if (now - at > FIRED_TTL_MS) firedRef.current.delete(id);
      }
      let best: Candidate | null = null;
      let bestKey = '';
      for (const c of candidatesRef.current.values()) {
        const k = departureKey(c.stationId, c.dep);
        if (firedRef.current.has(k)) continue;
        if (!best || c.dep.minutesAway < best.dep.minutesAway) {
          best = c;
          bestKey = k;
        }
      }
      if (!best) return;
      firedRef.current.set(bestKey, now);

      // Platform is pre-cleaned to the 'P1' form; expand back to '1' so the
      // pill copy reads 'Platform 1' rather than 'Platform P1'.
      const platformNum = best.dep.platform
        ? best.dep.platform.replace(/^P(\d)/, '$1')
        : '';
      const platformSuffix = platformNum ? ` \u00b7 Platform ${platformNum}` : '';
      const stationCode = (best.stationName || best.stationId)
        .replace(/[^a-zA-Z]/g, '')
        .slice(0, 3)
        .toUpperCase();
      const shortLine = (best.dep.lineName || best.dep.lineId)
        .replace(/\s+(line|overground)$/i, '')
        .slice(0, 3)
        .toUpperCase();

      usePillStore.getState().requestPill({
        kind: 'boarding',
        tier: 'standard',
        id: bestKey,
        stationCode,
        shortLine,
        title: `${best.dep.lineName} arriving`,
        message: `${best.stationName} \u00b7 ${best.dep.destination} \u00b7 ${best.dep.minutesAway} min${platformSuffix}`,
        accent: LINE_IDENTITY_COLORS[best.dep.lineId] ?? '#888888',
        durationMs: 5000,
        onPress: () => {
          usePillStore.getState().clearPill();
        },
      });
    };

    const evaluateStation = async (
      station: PinnedStationRef,
      departures: NormalizedDeparture[],
    ): Promise<void> => {
      if (cancelled) return;
      // Foreground-only nudge: the pill is an in-app overlay.
      if (AppState.currentState !== 'active') return;

      // UNIFICATION: the island's session brain already speaks for the
      // session origin station — the Live Activity carries that station's
      // live departures while the session runs. The pill defers there and
      // covers everywhere the island doesn't.
      if (
        SessionManager.getSessionState() === 'active' &&
        SessionManager.getCommuteOriginId() === station.id
      ) {
        candidatesRef.current.delete(station.id);
        return;
      }

      let soonest: NormalizedDeparture | null = null;
      for (const dep of departures ?? []) {
        if (dep == null) continue;
        if (dep.minutesAway < MIN_MINUTES || dep.minutesAway > MAX_MINUTES) continue;
        if (soonest === null || dep.minutesAway < soonest.minutesAway) {
          soonest = dep;
        }
      }
      if (!soonest) {
        candidatesRef.current.delete(station.id);
        return;
      }

      const pos = await getPosition();
      if (cancelled) return;

      if (!pos) {
        // Level 3 honestly requires the 150 m geofence: no location, no
        // boarding pill — period. The legacy V1 fallback (first pinned
        // station, un-geofenced) is deleted; the primer pill drives the
        // location grant instead.
        candidatesRef.current.delete(station.id);
        return;
      }

      // Geofenced mode: the station must have known coordinates and be
      // within the island's single geofence radius
      // (SessionManager.GEOFENCE_CONFIG.ORIGIN_RADIUS_METERS — the same
      // 150 m the OS geofence that starts commute sessions uses). Stations
      // without coordinates are skipped — a nudge for a station we cannot
      // place is exactly the false positive the geofence exists to eliminate.
      const coords = COORDS[station.id];
      if (!coords) {
        candidatesRef.current.delete(station.id);
        return;
      }
      const distanceM = calculateDistanceMeters(pos, {
        latitude: coords.lat,
        longitude: coords.lon,
      });
      if (distanceM > GEOFENCE_CONFIG.ORIGIN_RADIUS_METERS) {
        candidatesRef.current.delete(station.id);
        return;
      }

      candidatesRef.current.set(station.id, {
        stationId: station.id,
        stationName: station.name,
        dep: soonest,
        at: Date.now(),
      });
      fireBest();
    };

    // One refcounted subscription per dashboard station. The poller is
    // single-flight per station id, shared with the dashboard's DepartureCards.
    const unsubs = list.map((station) =>
      subscribeToStation(station.id, async (signal, force) => {
        const departures = await fetchOnce(station.id, signal, force);
        await evaluateStation(station, departures);
      }),
    );

    return () => {
      cancelled = true;
      unsubs.forEach((unsub) => unsub());
    };
  }, [stationKey]);
}
