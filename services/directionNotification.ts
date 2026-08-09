/**
 * ============================================================================
 * DirectionNotification — Type B (local, on-device, zero network)
 * ============================================================================
 *
 * PRIORITY 1 — Zero-Tap Magic (pre-boarding, predictive).
 *
 * Fires when the user enters a Tier 2 station geofence (after the Tier 2 cache
 * grab has populated). The notification shows a BINARY CHOICE of the two
 * physical platform-endpoints at that station — matching the signage on the
 * platform itself, NEVER compass prose ("Northbound / Southbound"), NEVER text
 * input. Two tappable chips. One tap resolves the direction for Priority 1
 * (pre-boards the layout) — it does NOT lock the branch as confirmed; that
 * happens post-boarding via motion-to-departure correlation (Priority 3 engine,
 * handled elsewhere).
 *
 * If the user has no completedJourney history AND no Tier 2 cache with which to
 * derive two distinct endpoints, we fall through to Priority 2 (the app's
 * manual endpoint buttons): we do NOT fire a notification. The app handles it.
 *
 * True termini (Morden, Edgware, Cockfosters, ...) skip the direction
 * notification entirely — one physical direction, asking is noise.
 *
 * PATTERN DECAY (from master plan):
 *   entry time drifts outside the learned time-of-day window -> re-prompt once.
 *   After N consecutive re-prompts with no stable pattern -> permanently fall
 *   to Priority 2 for this station. Never loops asking forever. N is stubbed as
 *   a constant (DECAY_MAX_REPROMPTS = 3).
 *
 * CONSUMES: Tier2CacheManager output via onTier2CachePopulated / getTier2Cache.
 * We do NOT build the cache — we code against its published interface below.
 *
 * COPY RULES (master plan + AGENTS.md):
 *   - Matches physical platform signage. Never compass prose.
 *   - No emojis. Ever.
 *   - Tone: peer, not corporate.
 * ============================================================================
 */

import * as Notifications from 'expo-notifications';
import { createMMKV } from 'react-native-mmkv';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import type { Tier2Cache } from './tier2Cache';
import { TFL_STATIONS, cleanDisplayStationName } from '../data/tflStations';
import { normaliseLineId } from '../utils/normaliseLineId';

// ----------------------------------------------------------------------------
// Interface we expect from Tier2CacheManager (already implemented in
// services/tier2Cache.ts). We import the concrete module at the bottom of this
// file so this module stays decoupled and the cache agent can evolve the
// internals freely as long as this surface holds:
//
//   onTier2CachePopulated(listener: (cache: Tier2Cache) => void): () => void
//   getTier2Cache(stationId: string): Tier2Cache | null
//
// Tier2Cache = {
//   stationId: string;
//   lineId: string;
//   disruption: { isDisrupted, severity, description, reason } | null;
//   platforms: { platformName, destinationName, expectedArrival, timeToStation }[];
//   grabbedAt: string;
//   arrivalsLastUpdated: string;
// }
// ----------------------------------------------------------------------------

// ---- Persistence: a dedicated MMKV store for direction-learning state ----
const directionStorage = createMMKV({ id: 'direction-notification' });

// ---- Constants ----
/**
 * Number of consecutive re-prompts (entry outside the learned window) with no
 * stable pattern before we permanently fall to Priority 2 for this station.
 * Stubbed per the spec. Tune later from data.
 */
export const DECAY_MAX_REPROMPTS = 3;

/**
 * Half-width (in minutes) of the learned entry-time window. If the user's
 * station entry drifts more than this far from their historical mean entry
 * time, we treat the pattern as "drifted" and re-prompt once.
 */
const LEARNED_WINDOW_HALF_WIDTH_MIN = 45;

/**
 * True termini — stations with exactly ONE physical platform direction per line.
 * Asking "which way?" is noise here. One direction, no choice.
 */
export const TERMINI_BY_LINE: Record<string, ReadonlySet<string>> = {
  northern: new Set(['morden', 'edgware', 'high barnet', 'mill hill east', 'kennington']),
  piccadilly: new Set(['cockfosters', 'uxbridge', 'heathrow terminal 4', 'heathrow terminal 5']),
  victoria: new Set(['walthamstow central', 'brixton']),
  jubilee: new Set(['stanmore', 'stratford']),
  central: new Set(['ealing broadway', 'west ruislip', 'epping', 'hainault']),
  district: new Set(['upminster', 'richmond', 'wimbledon', 'edgware road']),
  bakerloo: new Set(['harrow & wealdstone', 'elephant & castle']),
};

/**
 * Notification category identifier. The two action buttons render as the
 * binary chips. We register this category in installDirectionNotification().
 */
export const DIRECTION_CHOICE_CATEGORY = 'DIRECTION_CHOICE';

export const DIRECTION_NOTIFICATION_ID = 'direction-choice';

// ----------------------------------------------------------------------------
// Learned-direction log (our own persisted record; the user store only keeps a
// scalar completedJourneys count, not per-station/time history). We maintain:
//   - per-station: list of { dest, enteredAt(epoch), hour, minuteOfDay }
//   - per-station: decay counter (consecutive re-prompts)
//   - per-station: permanently-fallen flag
// ----------------------------------------------------------------------------

export interface DirectionHistoryEntry {
  dest: string; // the destinationName chosen / observed
  enteredAt: number; // epoch ms of station entry
  minuteOfDay: number; // 0..1439, derived for window math
}

export interface StationDirectionState {
  history: DirectionHistoryEntry[];
  decayReprompts: number; // consecutive re-prompts with no stable pattern
  permanentlyFallen: boolean; // permanently on Priority 2 floor for this station
}

const STATE_KEY_PREFIX = 'dir:';

function loadStationState(stationId: string): StationDirectionState {
  const empty: StationDirectionState = { history: [], decayReprompts: 0, permanentlyFallen: false };
  try {
    const raw = directionStorage.getString(STATE_KEY_PREFIX + stationId);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as StationDirectionState;
    return {
      history: Array.isArray(parsed.history) ? parsed.history : [],
      decayReprompts: typeof parsed.decayReprompts === 'number' ? parsed.decayReprompts : 0,
      permanentlyFallen: !!parsed.permanentlyFallen,
    };
  } catch {
    return empty;
  }
}

function saveStationState(stationId: string, state: StationDirectionState): void {
  try {
    directionStorage.set(STATE_KEY_PREFIX + stationId, JSON.stringify(state));
  } catch (e) {
    console.error('[DIRECTION_NOTIF] Failed to persist station direction state:', e);
  }
}

// ----------------------------------------------------------------------------
// Endpoint derivation
// ----------------------------------------------------------------------------

/**
 * Derive the two (or more) candidate endpoint names for a station, in priority
 * order:
 *   1. Tier 2 cache platforms' destinationName values (signage-exact).
 *   2. User's completedJourney history destinations for this station.
 *
 * Returns a de-duplicated, signage-clean array of endpoint labels. We take the
 * first two as the binary chips. If fewer than two distinct endpoints can be
 * derived, the caller falls through to Priority 2.
 */
function deriveCandidateEndpoints(
  stationId: string,
  cache: Tier2Cache | null
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  const push = (raw: string | undefined | null) => {
    if (!raw) return;
    const clean = raw.replace(/\s*Underground Station$/i, '').trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(clean);
  };

  // 1. Cache platforms (most authoritative — it's the live signage).
  if (cache && Array.isArray(cache.platforms)) {
    // Sort by soonest arrival so the chips reflect what's actually leaving,
    // not an arbitrary platform order.
    const platforms = [...cache.platforms].sort(
      (a, b) => (a.timeToStation ?? 0) - (b.timeToStation ?? 0)
    );
    platforms.forEach((p) => push(p.destinationName));
  }

  // 2. History — only if cache gave us nothing useful yet.
  if (ordered.length < 2) {
    const state = loadStationState(stationId);
    state.history.forEach((h) => push(h.dest));
  }

  return ordered;
}

// ----------------------------------------------------------------------------
// Predicted direction from history (the "zero-tap" pre-boarding guess)
// ----------------------------------------------------------------------------

/**
 * Given the current entry time and history, return the predicted destination
 * IF a stable pattern exists at this time-of-day window. Returns null if the
 * user has no stable pattern (so the notification should present a real binary
 * choice rather than auto-resolving).
 *
 * "Stable pattern" = a destination that accounts for >= 60% of entries within
 * the learned time window for this station.
 */
function predictDestination(
  stationId: string,
  now: Date
): { dest: string; confident: boolean } | null {
  const state = loadStationState(stationId);
  if (state.history.length === 0) return null;

  const minuteOfDay = now.getHours() * 60 + now.getMinutes();

  // Entries within the learned time window.
  const inWindow = state.history.filter((h) => {
    const diff = Math.abs(h.minuteOfDay - minuteOfDay);
    // Wrap-around midnight (e.g., 23:55 vs 00:05).
    const wrapped = 1440 - diff;
    return Math.min(diff, wrapped) <= LEARNED_WINDOW_HALF_WIDTH_MIN;
  });

  const pool = inWindow.length >= 2 ? inWindow : state.history;
  if (pool.length === 0) return null;

  const counts = new Map<string, number>();
  pool.forEach((h) => counts.set(h.dest, (counts.get(h.dest) ?? 0) + 1));

  let topDest = '';
  let topCount = 0;
  counts.forEach((c, d) => {
    if (c > topCount) {
      topCount = c;
      topDest = d;
    }
  });

  if (!topDest) return null;
  const share = topCount / pool.length;
  // 60% threshold = "stable enough to pre-board, but still let the chip confirm".
  return { dest: topDest, confident: share >= 0.6 };
}

/**
 * Detect whether THIS entry is inside or outside the learned window. Used to
 * decide whether to re-prompt (drift) vs. trust the pattern.
 */
function isWithinLearnedWindow(stationId: string, now: Date): boolean {
  const state = loadStationState(stationId);
  if (state.history.length === 0) return false;
  const minuteOfDay = now.getHours() * 60 + now.getMinutes();
  const inWindow = state.history.filter((h) => {
    const diff = Math.abs(h.minuteOfDay - minuteOfDay);
    const wrapped = 1440 - diff;
    return Math.min(diff, wrapped) <= LEARNED_WINDOW_HALF_WIDTH_MIN;
  });
  return inWindow.length > 0;
}

// ----------------------------------------------------------------------------
// Resolution callback contract
// ----------------------------------------------------------------------------

export interface DirectionResolution {
  stationId: string;
  lineId: string;
  destination: string; // the chosen / predicted endpoint (signage string)
  source: 'prediction' | 'chip-tap' | 'history';
  confirmed: false; // ALWAYS false here — post-boarding motion correlation locks it
}

/**
 * The app (or SessionManager) registers a handler that receives the resolved
 * direction. We pre-board the layout but DO NOT lock the branch.
 */
type ResolutionHandler = (res: DirectionResolution) => void;
let resolutionHandler: ResolutionHandler | null = null;

export function onDirectionResolved(handler: ResolutionHandler): () => void {
  resolutionHandler = handler;
  return () => {
    if (resolutionHandler === handler) resolutionHandler = null;
  };
}

function emitResolution(res: DirectionResolution): void {
  try {
    resolutionHandler?.(res);
  } catch (e) {
    console.error('[DIRECTION_NOTIF] resolution handler threw:', e);
  }
  // Also surface to the user store so the rest of the app can read the
  // pre-boarded (NOT confirmed) direction without wiring a listener.
  try {
    useUserPreferencesStore.setState({ lastPreboardedDirection: res.destination });
  } catch {
    /* non-fatal */
  }
}

// ----------------------------------------------------------------------------
// Notification plumbing
// ----------------------------------------------------------------------------

let installed = false;

/**
 * Register the DIRECTION_CHOICE notification category with two action buttons
 * (the binary chips). Safe to call repeatedly. Wire the response listener.
 */
export function installDirectionNotification(): void {
  if (installed) return;
  installed = true;

  // Button titles MUST be the signage endpoint names (Rule 18), not generic
  // "Left"/"Right". The category is registered once with placeholder labels;
  // the real endpoint strings are injected per-notification via the action
  // identifiers below. Expo renders the buttonTitle from the category, so we
  // re-register the category inside maybeFireDirectionNotification with the
  // actual optionA/optionB strings each time the notification fires.
  Notifications.setNotificationCategoryAsync(DIRECTION_CHOICE_CATEGORY, [
    {
      identifier: 'chip-a',
      buttonTitle: 'Option A',
      options: { opensAppToForeground: true },
    },
    {
      identifier: 'chip-b',
      buttonTitle: 'Option B',
      options: { opensAppToForeground: true },
    },
  ]).catch((e) => console.warn('[DIRECTION_NOTIF] category register failed:', e));

  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const categoryId = response.notification.request.content.categoryIdentifier;
    if (categoryId !== DIRECTION_CHOICE_CATEGORY) return;

    const actionId = response.actionIdentifier;
    const data = response.notification.request.content.data as
      | { stationId?: string; lineId?: string; optionA?: string; optionB?: string }
      | undefined;
    if (!data?.stationId) return;

    // The tapped chip determines the chosen destination.
    let chosen: string | null = null;
    if (actionId === 'chip-a' && data.optionA) chosen = data.optionA;
    else if (actionId === 'chip-b' && data.optionB) chosen = data.optionB;
    if (!chosen) return;

    recordChoice(data.stationId, chosen);
    emitResolution({
      stationId: data.stationId,
      lineId: data.lineId ?? 'unknown',
      destination: chosen,
      source: 'chip-tap',
      confirmed: false,
    });
  });

  // Keep the subscription alive for the app lifetime.
  // (No unsubscribe — direction notifications are app-global.)
  void sub;
}

/**
 * Fire the local direction notification for a station. Returns true if it fired,
 * false if it fell through to Priority 2 (no notification shown).
 *
 * `cache` is the populated Tier 2 cache (or null if not yet available — caller
 * still passes whatever it has; we derive from history as fallback).
 */
export async function maybeFireDirectionNotification(
  stationId: string,
  lineId: string,
  cache: Tier2Cache | null
): Promise<boolean> {
  // 0. True termini: never ask. One direction, no choice.
  const stationName = stationDisplayName(stationId);
  if (isTerminus(stationId, stationName)) {
    console.log(`[DIRECTION_NOTIF] ${stationName} is a terminus — skipping direction notification.`);
    return false;
  }

  // 1. Permanently fallen to Priority 2 for this station?
  const state = loadStationState(stationId);
  if (state.permanentlyFallen) {
    console.log(`[DIRECTION_NOTIF] ${stationName} permanently on Priority 2 floor — skipping.`);
    return false;
  }

  // 2. Derive candidate endpoints (cache first, history fallback).
  const candidates = deriveCandidateEndpoints(stationId, cache);
  if (candidates.length < 2) {
    // No history, no cache -> fall through to Priority 2. Do NOT fire.
    console.log(
      `[DIRECTION_NOTIF] <2 candidate endpoints for ${stationName} (cache+history). Falling through to Priority 2.`
    );
    return false;
  }

  const [optionA, optionB] = candidates;

  // Re-register the category with the ACTUAL signage endpoint names as button
  // titles (Rule 18: chips show physical platform signage, never "Left/Right"
  // or compass prose). Expo renders buttonTitle from the category at fire time,
  // so we set it here with the real endpoints before scheduling.
  try {
    await Notifications.setNotificationCategoryAsync(DIRECTION_CHOICE_CATEGORY, [
      {
        identifier: 'chip-a',
        buttonTitle: optionA,
        options: { opensAppToForeground: true },
      },
      {
        identifier: 'chip-b',
        buttonTitle: optionB,
        options: { opensAppToForeground: true },
      },
    ]);
  } catch (e) {
    console.warn('[DIRECTION_NOTIF] category re-register failed:', e);
    return false;
  }

  // 3. Attempt zero-tap prediction from history at this time-of-day.
  const now = new Date();
  const prediction = predictDestination(stationId, now);

  // Re-prompt / decay bookkeeping.
  const withinWindow = isWithinLearnedWindow(stationId, now);
  if (!withinWindow && state.history.length > 0) {
    // Entry drifted outside the learned window -> this is a re-prompt.
    state.decayReprompts += 1;
    if (state.decayReprompts >= DECAY_MAX_REPROMPTS) {
      state.permanentlyFallen = true;
      saveStationState(stationId, state);
      console.log(
        `[DIRECTION_NOTIF] ${stationName}: ${state.decayReprompts} consecutive re-prompts, no stable pattern. Permanently falling to Priority 2.`
      );
      return false;
    }
    saveStationState(stationId, state);
    console.log(
      `[DIRECTION_NOTIF] ${stationName}: entry drifted outside learned window (re-prompt #${state.decayReprompts}/${DECAY_MAX_REPROMPTS}).`
    );
  } else if (withinWindow && state.decayReprompts > 0) {
    // The entry matches the learned pattern. The drift run is broken.
    state.decayReprompts = 0;
    saveStationState(stationId, state);
  }

  // 4. Build the notification. Binary chips. Signage strings. No compass prose.
  // If we have a confident prediction, the notification pre-loads it but still
  // shows both chips so the user can correct in one tap (never locked).
  const body = buildBody(optionA, optionB, prediction?.dest);

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: DIRECTION_NOTIFICATION_ID,
      content: {
        title: 'Which way?',
        body,
        categoryIdentifier: DIRECTION_CHOICE_CATEGORY,
        data: { stationId, lineId, optionA, optionB },
        // No sound beyond haptic — peer tone, not corporate.
        sound: false,
      },
      trigger: null, // fire immediately, on-device, zero network
    });
  } catch (e) {
    console.error('[DIRECTION_NOTIF] Failed to schedule direction notification:', e);
    return false;
  }

  // 5. If we had a confident prediction, treat the pre-board as resolved
  // (NOT confirmed). The chip tap path also resolves via the listener above.
  if (prediction?.confident) {
    emitResolution({
      stationId,
      lineId,
      destination: prediction.dest,
      source: prediction.dest === optionA || prediction.dest === optionB ? 'prediction' : 'history',
      confirmed: false,
    });
  }

  return true;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function recordChoice(stationId: string, dest: string): void {
  const state = loadStationState(stationId);
  const now = new Date();
  const minuteOfDay = now.getHours() * 60 + now.getMinutes();
  state.history.push({ dest, enteredAt: Date.now(), minuteOfDay });
  // Cap history to last 60 entries to bound storage.
  if (state.history.length > 60) {
    state.history = state.history.slice(-60);
  }
  // A confirmed chip tap means the pattern is stable — reset decay.
  state.decayReprompts = 0;
  saveStationState(stationId, state);
}

function isTerminus(stationId: string, stationName: string, lineId?: string): boolean {
  const cleanLine = lineId ? normaliseLineId(lineId).cleanLineId : null;
  const set = cleanLine ? TERMINI_BY_LINE[cleanLine] : null;

  const key = (stationId || '').toLowerCase().replace(/[-_]/g, ' ').trim();
  const nameKey = (stationName || '').toLowerCase().trim();

  if (set) {
    return set.has(key) || set.has(nameKey);
  }

  for (const lineSet of Object.values(TERMINI_BY_LINE)) {
    if (lineSet.has(key) || lineSet.has(nameKey)) return true;
  }
  return false;
}

function stationDisplayName(stationId: string): string {
  try {
    const pinned = useUserPreferencesStore.getState().pinnedStations || [];
    const s = pinned.find((p) => p.id === stationId);
    if (s?.name) return cleanDisplayStationName(s.name);

    const ref = TFL_STATIONS.find(
      (st) => st.id.toLowerCase() === stationId.toLowerCase() || st.name.toLowerCase() === stationId.toLowerCase()
    );
    if (ref?.name) return cleanDisplayStationName(ref.name);

    return stationId;
  } catch {
    return stationId;
  }
}

/**
 * Build the notification body. Format matches physical platform signage:
 *   [Morden via Bank]    [High Barnet]
 * Never "Northbound / Southbound." Never text input. Binary chip, one tap.
 */
function buildBody(optionA: string, optionB: string, predicted?: string): string {
  // Two tappable chips (Left = first listed, Right = second listed). The body
  // names both signage endpoints in that exact order so the tap maps cleanly.
  // No compass prose, no text input. Peer tone.
  if (predicted && (predicted === optionA || predicted === optionB)) {
    return `Which platform — ${optionA}, or ${optionB}? (Usually ${predicted}.)`;
  }
  return `Which platform — ${optionA}, or ${optionB}?`;
}

// ----------------------------------------------------------------------------
// Expo-router / app wiring note:
//   In app/_layout.tsx, call `installDirectionNotification()` once at startup
//   (alongside the existing ARRIVED_ALERT category registration). Wire the
//   fire path in SessionManager.handleGeofenceEnter right after
//   `triggerTier2Grab(...)` — subscribe to onTier2CachePopulated and call
//   maybeFireDirectionNotification(stationId, lineId, cache).
// ----------------------------------------------------------------------------

export const PREBOARDED_DIRECTION_TTL_MS = 90 * 60 * 1000; // 90 minutes TTL

export function setPreboardedDirection(dest: string, timestamp?: number): void {
  directionStorage.set('last_preboarded_dest', dest);
  directionStorage.set('last_preboarded_ts', timestamp || Date.now());
}

export function getPreboardedDirection(): string | null {
  const dest = directionStorage.getString('last_preboarded_dest');
  const ts = directionStorage.getNumber('last_preboarded_ts');
  if (!dest || !ts) return null;
  if (Date.now() - ts > PREBOARDED_DIRECTION_TTL_MS) {
    clearPreboardedDirection();
    return null;
  }
  return dest;
}

export function clearPreboardedDirection(): void {
  directionStorage.remove('last_preboarded_dest');
  directionStorage.remove('last_preboarded_ts');
}

export default {
  installDirectionNotification,
  maybeFireDirectionNotification,
  onDirectionResolved,
  setPreboardedDirection,
  getPreboardedDirection,
  clearPreboardedDirection,
  PREBOARDED_DIRECTION_TTL_MS,
  TERMINI_BY_LINE,
  DECAY_MAX_REPROMPTS,
};
