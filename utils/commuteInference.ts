// utils/commuteInference.ts
// Inference-first commute setup engine.
//
// WHAT: derives home/work stations and commute hours from SessionManager
// session history, and proposes one-tap setup confirmations for the Morph
// Pill instead of cold prompts. The pill itself is the control (one-tap
// inferred presets inline); sheets are the fallback (owned by the pill UI).
//
// RULES (all documented here, implemented below):
//  1. OBSERVATIONS: logSessionStart records every session origin.
//     logDwell records dwell-validated arrivals, but ONLY when the dwell is
//     >= 3 minutes and the speed at arrival is <= 7.2 km/h (walking) —
//     shorter dwells or train-speed pass-throughs are not evidence of a
//     "place". Observations older than 30 days are pruned on every write.
//  2. STATION INFERENCE (N>=3): 3 qualifying observations for the same
//     station whose local times-of-day fit in a sliding 90-minute window,
//     inside the trailing 30 days, => propose that station as home (if no
//     pinned station has role 'home') or work (else if none has 'work').
//  3. HOURS INFERENCE: 3 session starts whose local times-of-day fit in a
//     sliding 60-minute window => propose windowStart = clusterStart - 15m,
//     windowEnd = clusterStart + 90m. Only proposed while alert hours are
//     still at their defaults (i.e. the user has not set them).
//  4. 14-DAY CONTRADICTION: a home/work station confirmed through this
//     engine with zero qualifying observations in the trailing 14 days,
//     while the user still travelled on >= 3 distinct days in that span,
//     is re-emitted as a confirmation with reconfirm: true. Emitted at most
//     once per silent stretch (no nagging).
//  5. DISMISS BACKOFF: 3 dismissals of the same confirmation type
//     ('home' | 'work' | 'hours') inside a rolling 7-day window suppress
//     that type for 7 days.
//  6. UNDO: the last confirmation can be undone within 5 seconds, restoring
//     the previous role (or unpinning a station this engine pinned) or the
//     previous alert-window values.
//  7. ASSUMPTION REVEAL: the pin-order fallback (first pinned = home,
//     second = work) is surfaced ONCE as a setup pill so the user can see
//     and correct the silent default. Fires only post-onboarding, only
//     while no explicit role exists and the engine has not engaged yet;
//     retires forever on dismiss or sheet close.
//
// STORAGE: MMKV, same id ('background-storage') SessionManager uses, so
// background writes (session start / dwell) and foreground reads (pill)
// share one store. Storage access follows the app's convention
// (createMMKV from 'react-native-mmkv'; see store/userPreferencesStore.ts
// and services/SessionManager.ts).
//
// This module is pure logic + storage: no React imports, so the rules are
// unit-testable.

import { createMMKV } from 'react-native-mmkv';
import { useUserPreferencesStore } from '../store/userPreferencesStore';

const stationCoordinates = require('../data/stationCoordinates.json') as Record<
  string,
  { id?: string; name?: string }
>;

// Shared with SessionManager's background context.
const inferenceStorage = createMMKV({ id: 'background-storage' });

export type ConfirmationType = 'home' | 'work' | 'hours';

export type PendingConfirmation =
  | { type: 'home' | 'work'; stationId: string; stationName: string; reconfirm?: boolean }
  | { type: 'hours'; windowStart: string; windowEnd: string };

export interface StationObservation {
  stationId: string;
  atMs: number;
  kind: 'start' | 'dwell';
}

export type StationConfirmation = Extract<PendingConfirmation, { type: 'home' | 'work' }>;
export type HoursConfirmation = Extract<PendingConfirmation, { type: 'hours' }>;

/** Type predicate: TS cannot narrow `c.type === 'home' || c.type === 'work'`
 *  in the false branch when one union member carries 'home' | 'work'. */
function isStationConfirmation(c: PendingConfirmation): c is StationConfirmation {
  return c.type === 'home' || c.type === 'work';
}

interface ConfirmedRoleRecord {
  type: 'home' | 'work';
  atMs: number;
}

interface UndoRecord {
  confirmation: PendingConfirmation;
  previousValue:
    | { stationId: string; previousRole: 'home' | 'work' | 'other' | null }
    | { start: string; end: string };
  committedAt: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const OBS_TTL_MS = 30 * DAY_MS; // observations decay after 30 days
const CONTRADICTION_SILENT_MS = 14 * DAY_MS;
const MIN_TRAVEL_DAYS_FOR_CONTRADICTION = 3;
const MIN_OBS_FOR_STATION = 3;
const STATION_BUCKET_MIN = 90; // sliding 90-minute time-of-day window
const MIN_STARTS_FOR_HOURS = 3;
const HOURS_CLUSTER_MIN = 60; // sliding 60-minute window over session starts
const HOURS_WINDOW_LEAD_MIN = 15;
const HOURS_WINDOW_LENGTH_MIN = 90;
const MIN_DWELL_MINUTES = 3;
const MAX_ARRIVAL_SPEED_KMH = 7.2; // walking speed; faster = pass-through, not a place
const DISMISSAL_WINDOW_MS = 7 * DAY_MS;
const DISMISSALS_TO_SUPPRESS = 3;
const SUPPRESSION_MS = 7 * DAY_MS;
const UNDO_WINDOW_MS = 5000;

const DEFAULT_ALERT_START = '06:00';
const DEFAULT_ALERT_END = '22:00';

const K_OBS = 'commute-inference:observations';
const K_DISMISSALS = 'commute-inference:dismissals';
const K_SUPPRESSED = 'commute-inference:suppressed-until';
const K_UNDO = 'commute-inference:last-confirmation';
const K_CONFIRMED = 'commute-inference:confirmed-roles';
const K_RECONFIRM = 'commute-inference:reconfirm-emitted';

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = inferenceStorage.getString(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    inferenceStorage.set(key, JSON.stringify(value));
  } catch {
    // Non-blocking storage write
  }
}

function removeKey(key: string): void {
  try {
    inferenceStorage.remove(key);
  } catch {
    // Non-blocking storage write
  }
}

/** Drop observations older than the 30-day trailing window. */
function pruneObservations(obs: StationObservation[], nowMs: number): StationObservation[] {
  return obs.filter(
    (o) =>
      o &&
      typeof o.stationId === 'string' &&
      typeof o.atMs === 'number' &&
      o.atMs <= nowMs + 60 * 1000 && // tolerate minor clock skew
      nowMs - o.atMs < OBS_TTL_MS
  );
}

function loadObservations(nowMs: number): StationObservation[] {
  const raw = readJSON<StationObservation[]>(K_OBS, []);
  const list = Array.isArray(raw) ? raw : [];
  const kept = pruneObservations(list, nowMs);
  if (kept.length !== list.length) writeJSON(K_OBS, kept);
  return kept;
}

function appendObservation(obs: StationObservation): void {
  const nowMs = Date.now();
  const list = loadObservations(nowMs);
  list.push(obs);
  writeJSON(K_OBS, pruneObservations(list, nowMs));
}

/** Record a commute session start at a station (called by SessionManager). */
export function logSessionStart(stationId: string, at?: number): void {
  if (!stationId) return;
  appendObservation({ stationId, atMs: at ?? Date.now(), kind: 'start' });
}

/**
 * Record a dwell-validated arrival at a station (called by SessionManager).
 * Ignored when the dwell is under 3 minutes or the arrival speed is above
 * walking pace — a pass-through is not evidence of a "place".
 */
export function logDwell(stationId: string, dwellMinutes: number, speedKmh: number): void {
  if (!stationId) return;
  if (dwellMinutes < MIN_DWELL_MINUTES || speedKmh > MAX_ARRIVAL_SPEED_KMH) return;
  appendObservation({ stationId, atMs: Date.now(), kind: 'dwell' });
}

/** stationId -> observation count in the trailing 30 days. Used for geofence region prioritization. */
export function getStationScores(): Record<string, number> {
  const obs = loadObservations(Date.now());
  const scores: Record<string, number> = {};
  for (const o of obs) {
    scores[o.stationId] = (scores[o.stationId] ?? 0) + 1;
  }
  return scores;
}

/** Device-local minutes since midnight for an epoch timestamp. */
function minutesOfDayLocal(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

/** Device-local calendar day key: 'YYYY-MM-DD'. */
function dayKeyLocal(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatMinutes(totalMin: number): string {
  const wrapped = ((Math.round(totalMin) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface TimeCluster {
  startMin: number;
  count: number;
}

/**
 * Sliding-window cluster over local times-of-day (circular: handles the
 * midnight wrap by duplicating the sorted series +1440). Returns the
 * largest cluster whose span is <= windowMin and holds >= minCount points,
 * or null. Boundary-free by construction: 08:29 / 08:31 / 08:45 land in one
 * bucket even though they straddle a naive :30 slot edge.
 */
function bestTimeCluster(times: number[], windowMin: number, minCount: number): TimeCluster | null {
  if (times.length < minCount) return null;
  const sorted = [...times].sort((a, b) => a - b);
  const ext = [...sorted, ...sorted.map((t) => t + 1440)];
  let best: TimeCluster | null = null;
  for (let i = 0; i < sorted.length; i++) {
    let count = 0;
    for (let j = i; j < ext.length && ext[j] - ext[i] <= windowMin; j++) {
      count++;
    }
    if (count >= minCount) {
      const startMin = ext[i] % 1440;
      if (!best || count > best.count || (count === best.count && startMin < best.startMin)) {
        best = { startMin, count };
      }
    }
  }
  return best;
}

function resolveStationName(stationId: string): string {
  try {
    const entry = stationCoordinates?.[stationId];
    if (entry && typeof entry.name === 'string' && entry.name.length > 0) {
      return entry.name;
    }
  } catch {
    // fall through to stationId
  }
  return stationId;
}

function emptySuppressionMap(): Record<ConfirmationType, number | null> {
  return { home: null, work: null, hours: null };
}

function isSuppressed(type: ConfirmationType, nowMs: number): boolean {
  const sup = readJSON<Record<ConfirmationType, number | null>>(K_SUPPRESSED, emptySuppressionMap());
  const until = sup[type];
  return typeof until === 'number' && nowMs < until;
}

/**
 * Pending one-tap setup confirmations for the Morph Pill, highest-signal
 * first: contradiction reconfirms, then fresh station inference, then hours
 * inference. Idempotent: derived from observations + store state, so it is
 * stable until the user confirms or dismisses.
 */
export function getPendingConfirmations(): PendingConfirmation[] {
  const nowMs = Date.now();
  const obs = loadObservations(nowMs);
  const prefs = useUserPreferencesStore.getState();
  const pinned = prefs.pinnedStations || [];
  const hasHome = pinned.some((s) => s.role === 'home');
  const hasWork = pinned.some((s) => s.role === 'work');

  const stationConfirmations: PendingConfirmation[] = [];

  // --- 14-day contradiction: confirmed home/work the user stopped visiting.
  const confirmed = readJSON<Record<string, ConfirmedRoleRecord>>(K_CONFIRMED, {});
  const reconfirmEmitted = readJSON<Record<string, number>>(K_RECONFIRM, {});
  let reconfirmDirty = false;
  const windowStart14 = nowMs - CONTRADICTION_SILENT_MS;
  const travelDays = new Set<string>();
  const lastObsAt = new Map<string, number>();
  for (const o of obs) {
    if (o.atMs >= windowStart14) travelDays.add(dayKeyLocal(o.atMs));
    lastObsAt.set(o.stationId, Math.max(lastObsAt.get(o.stationId) ?? 0, o.atMs));
  }
  for (const s of pinned) {
    if (s.role !== 'home' && s.role !== 'work') continue;
    if (!confirmed[s.id]) continue; // only contradict this engine's own confirmations
    const lastSeen = lastObsAt.get(s.id) ?? 0;
    const silent14Days = lastSeen < windowStart14;
    const alreadyEmittedForThisStretch = (reconfirmEmitted[s.id] ?? 0) > lastSeen;
    if (
      silent14Days &&
      travelDays.size >= MIN_TRAVEL_DAYS_FOR_CONTRADICTION &&
      !alreadyEmittedForThisStretch &&
      !isSuppressed(s.role, nowMs)
    ) {
      stationConfirmations.push({
        type: s.role,
        stationId: s.id,
        stationName: resolveStationName(s.id),
        reconfirm: true,
      });
      reconfirmEmitted[s.id] = nowMs;
      reconfirmDirty = true;
    }
  }
  if (reconfirmDirty) writeJSON(K_RECONFIRM, reconfirmEmitted);

  // --- Fresh station inference: N>=3 in a sliding 90-min time-of-day bucket.
  const needType: 'home' | 'work' | null = !hasHome ? 'home' : !hasWork ? 'work' : null;
  if (needType && !isSuppressed(needType, nowMs)) {
    const byStation = new Map<string, StationObservation[]>();
    for (const o of obs) {
      const list = byStation.get(o.stationId) ?? [];
      list.push(o);
      byStation.set(o.stationId, list);
    }
    let top: { stationId: string; count: number; lastAt: number } | null = null;
    for (const [stationId, list] of byStation) {
      const existingRole = pinned.find((s) => s.id === stationId)?.role;
      if (existingRole === 'home' || existingRole === 'work') continue;
      if (list.length < MIN_OBS_FOR_STATION) continue;
      const times = list.map((o) => minutesOfDayLocal(o.atMs));
      if (!bestTimeCluster(times, STATION_BUCKET_MIN, MIN_OBS_FOR_STATION)) continue;
      const lastAt = Math.max(...list.map((o) => o.atMs));
      if (!top || list.length > top.count || (list.length === top.count && lastAt > top.lastAt)) {
        top = { stationId, count: list.length, lastAt };
      }
    }
    if (top) {
      stationConfirmations.push({
        type: needType,
        stationId: top.stationId,
        stationName: resolveStationName(top.stationId),
      });
    }
  }

  // --- Hours inference: 3 session starts in a 60-min cluster.
  // Only while alert hours are still at defaults (user has not set them).
  const hours: PendingConfirmation[] = [];
  const hoursUnset =
    prefs.alertHoursMode === 'custom' &&
    prefs.alertWindowStart === DEFAULT_ALERT_START &&
    prefs.alertWindowEnd === DEFAULT_ALERT_END;
  if (hoursUnset && !isSuppressed('hours', nowMs)) {
    const starts = obs.filter((o) => o.kind === 'start').map((o) => minutesOfDayLocal(o.atMs));
    const cluster = bestTimeCluster(starts, HOURS_CLUSTER_MIN, MIN_STARTS_FOR_HOURS);
    if (cluster) {
      hours.push({
        type: 'hours',
        windowStart: formatMinutes(cluster.startMin - HOURS_WINDOW_LEAD_MIN),
        windowEnd: formatMinutes(cluster.startMin + HOURS_WINDOW_LENGTH_MIN),
      });
    }
  }

  return [...stationConfirmations, ...hours];
}

export interface AssumptionReveal {
  homeName: string;
  workName: string | null;
}

/**
 * True once the inference engine has ever engaged the user — a
 * confirmation was emitted and confirmed, dismissed, suppressed, or
 * re-emitted. Once the real conversation has started, the pin-order
 * fallback assumption is obsolete and the reveal must not fire.
 */
function hasInferenceEngaged(): boolean {
  const dismissals = readJSON<Record<string, number[]>>(K_DISMISSALS, {});
  if (
    Object.values(dismissals).some(
      (arr) => Array.isArray(arr) && arr.length > 0,
    )
  )
    return true;
  if (Object.keys(readJSON<Record<string, ConfirmedRoleRecord>>(K_CONFIRMED, {})).length > 0)
    return true;
  if (
    Object.values(
      readJSON<Record<string, number | null>>(K_SUPPRESSED, {}),
    ).some((v) => v != null)
  )
    return true;
  if (Object.keys(readJSON<Record<string, number>>(K_RECONFIRM, {})).length > 0)
    return true;
  return false;
}

/**
 * One-shot "assumption reveal": the pin-order fallback (first pinned =
 * home, second = work) is a silent guess the system made on the user's
 * behalf. This surfaces it once as a setup pill so the user can see and
 * correct it. Fires only when onboarding is complete (pin order is final),
 * at least one station is pinned, no explicit home/work role exists, the
 * reveal was never shown (persisted flag), and the inference engine has
 * not engaged yet. The pill UI retires it permanently on dismiss; the
 * sheet host retires it on close.
 */
export function getAssumptionReveal(): AssumptionReveal | null {
  const prefs = useUserPreferencesStore.getState();
  if (!prefs.hasCompletedOnboarding) return null;
  if (prefs.assumptionRevealed) return null;
  const pinned = prefs.pinnedStations || [];
  if (pinned.length === 0) return null;
  if (pinned.some((s) => s.role === 'home' || s.role === 'work')) return null;
  if (hasInferenceEngaged()) return null;
  return {
    homeName: pinned[0].name,
    workName: pinned[1] ? pinned[1].name : null,
  };
}

/**
 * Retire the assumption reveal forever. Called by the pill UI on dismiss
 * and by the sheet host on close (closing = implicit accept; the silent
 * assumption stands).
 */
export function markAssumptionRevealed(): void {
  useUserPreferencesStore.getState().setAssumptionRevealed(true);
}

/**
 * Commit a confirmation: set the pinned-station role (existing
 * setStationRole semantics; pins the station first if it is not pinned)
 * or write the inferred alert window (existing setAlertHours). Records an
 * undo snapshot valid for 5 seconds.
 */
export function confirmConfirmation(c: PendingConfirmation): void {
  const nowMs = Date.now();
  const store = useUserPreferencesStore.getState();

  if (isStationConfirmation(c)) {
    const pinned = (store.pinnedStations || []).find((s) => s.id === c.stationId);
    const previousRole = pinned ? pinned.role : null;
    writeJSON(K_UNDO, {
      confirmation: c,
      previousValue: { stationId: c.stationId, previousRole },
      committedAt: nowMs,
    } satisfies UndoRecord);
    if (pinned) {
      store.setStationRole(c.stationId, c.type);
    } else {
      // Inference observes stations the user travels through; they are not
      // always pinned yet. Pin with the coordinates-derived name and the
      // inferred role. lines/zone are unknown here — left empty/0 rather
      // than inventing values.
      store.pinStation({ id: c.stationId, name: c.stationName, lines: [], zone: 0 }, c.type);
    }
    const confirmed = readJSON<Record<string, ConfirmedRoleRecord>>(K_CONFIRMED, {});
    confirmed[c.stationId] = { type: c.type, atMs: nowMs };
    writeJSON(K_CONFIRMED, confirmed);
  } else {
    const previousValue = { start: store.alertWindowStart, end: store.alertWindowEnd };
    writeJSON(K_UNDO, {
      confirmation: c,
      previousValue,
      committedAt: nowMs,
    } satisfies UndoRecord);
    store.setAlertHours(c.windowStart, c.windowEnd);
  }
}

/**
 * Dismiss a confirmation. 3 dismissals of the same type inside a rolling
 * 7-day window suppress that confirmation type for 7 days.
 */
export function dismissConfirmation(c: PendingConfirmation): void {
  const nowMs = Date.now();
  const all = readJSON<Record<ConfirmationType, number[]>>(K_DISMISSALS, {
    home: [],
    work: [],
    hours: [],
  });
  const kept = (all[c.type] || []).filter((t) => nowMs - t < DISMISSAL_WINDOW_MS);
  kept.push(nowMs);
  all[c.type] = kept;
  writeJSON(K_DISMISSALS, all);
  if (kept.length >= DISMISSALS_TO_SUPPRESS) {
    const sup = readJSON<Record<ConfirmationType, number | null>>(K_SUPPRESSED, emptySuppressionMap());
    sup[c.type] = nowMs + SUPPRESSION_MS;
    writeJSON(K_SUPPRESSED, sup);
  }
}

/**
 * Undo the last confirmation if it was committed within the last 5 seconds.
 * Restores the previous role (or unpins a station this engine pinned) or
 * the previous alert-window values. Single-use and expired undos are no-ops.
 */
export function undoLastConfirmation(): void {
  const nowMs = Date.now();
  const rec = readJSON<UndoRecord | null>(K_UNDO, null);
  removeKey(K_UNDO);
  if (!rec) return;
  if (nowMs - rec.committedAt > UNDO_WINDOW_MS) return;
  const store = useUserPreferencesStore.getState();
  const c = rec.confirmation;
  if (isStationConfirmation(c)) {
    const prev = rec.previousValue as { stationId: string; previousRole: 'home' | 'work' | 'other' | null };
    if (prev.previousRole === null) {
      store.unpinStation(prev.stationId);
    } else {
      store.setStationRole(prev.stationId, prev.previousRole);
    }
    const confirmed = readJSON<Record<string, ConfirmedRoleRecord>>(K_CONFIRMED, {});
    delete confirmed[prev.stationId];
    writeJSON(K_CONFIRMED, confirmed);
  } else {
    const prev = rec.previousValue as { start: string; end: string };
    store.setAlertHours(prev.start, prev.end);
  }
}
