/**
 * ============================================================================
 * Tier2CacheManager — P0 cache-grab mechanism for Phase B
 * ============================================================================
 *
 * SINGLE-WRITE DISCIPLINE (READ THIS BEFORE TOUCHING):
 * ----------------------------------------------------
 * The React Native layer is the ONE AND ONLY writer of the Tier 2 cache.
 * The native Swift Live Activity is the ONE AND ONLY reader. There is no
 * second copy of this cache anywhere in the RN layer. Do NOT mirror this
 * data into Zustand, do NOT re-fetch it inside LiveActivityService, do NOT
 * duplicate it in widgetSync. The moment you duplicate it you create a
 * divergent source of truth and the Live Activity silently drifts from RN.
 *
 * Why MMKV with the App Group ID (APP_GROUP_ID)?
 *   react-native-mmkv supports an `id` that maps to an iOS App Group
 *   shared container. The same container is readable by the Swift Live
 *   Activity extension. We write under a single stable key per station and
 *   the native layer reads exactly that key. One writer, one reader, one file.
 *
 * What this module does:
 *   1. On geofence entry (50–150m), the geofence layer calls
 *      `triggerTier2Grab(stationId, lineId)`. It fires immediately + silently.
 *   2. Grabs disruption status (once — barely changes minute-to-minute) and
 *      ALL platforms' arrivals (time-sensitive — retries on flicker).
 *   3. Persists a single Tier2Cache object keyed by stationId.
 *   4. Emits `onTier2CachePopulated` so downstream consumers (Live Activity,
 *      direction notification, Reroute) can read it.
 *   5. Logs ANY silent failure as a P0 bug with the `[TIER2_CACHE_FAIL]` tag.
 * ============================================================================
 */

import { createMMKV } from 'react-native-mmkv';
import { APP_CONFIG } from '../config/app.config';
import { resolveTflStopIds } from '../utils/resolveTflStopId';
import { normaliseLineId } from '../utils/normaliseLineId';

// ---- Storage: App Group MMKV so Swift Live Activity can READ the same cache ----
// This is the single persisted source. The native layer reads TIER2_KEY_PREFIX + stationId.
const tier2Storage = createMMKV({ id: 'tier2-cache', ...(APP_CONFIG.APP_GROUP_ID ? { groupId: APP_CONFIG.APP_GROUP_ID } : {}) });
const TIER2_KEY_PREFIX = 'tier2:';

// ---- Public cache shape (canonical — Swift reads this exact contract) ----
export interface Tier2Disruption {
  isDisrupted: boolean;
  severity: number; // TfL severity code
  description: string;
  reason: string | null;
  /** The line this disruption belongs to. Set explicitly on write so the
   *  resolveRerouteMode lineId guard cannot be silently broken by a
   *  refactor that stops passing lineId into the cache. */
  lineId: string;
}

export interface Tier2PlatformArrival {
  platformName: string;
  destinationName: string;
  expectedArrival: string; // ISO timestamp
  timeToStation: number; // seconds
}

export interface Tier2Cache {
  stationId: string;
  lineId: string;
  disruption: Tier2Disruption | null;
  platforms: Tier2PlatformArrival[];
  grabbedAt: string; // ISO timestamp
  arrivalsLastUpdated: string;
}

// ---- Listener registry: downstream consumers subscribe here ----
type Tier2Listener = (cache: Tier2Cache) => void;
const listeners = new Set<Tier2Listener>();

// ---- In-memory mirror (fast synchronous reads; MMKV is the durable source) ----
const memoryCache = new Map<string, Tier2Cache>();

// ---- Retry configuration ----
const ARRIVALS_BACKOFF_MS = [1000, 3000, 8000]; // 3 attempts: 1s, 3s, 8s
const DISRUPTION_TIMEOUT_MS = 8000;
const ARRIVALS_TIMEOUT_MS = 8000;

// ============================================================================
// Public API
// ============================================================================

/**
 * Subscribe to cache-populated events. Returns an unsubscribe function.
 * Fires whenever a station's Tier 2 cache is (re)populated after a grab.
 */
export function onTier2CachePopulated(listener: Tier2Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Synchronous read of the last known Tier 2 cache for a station.
 * Returns null if no cache has been populated yet (or it failed to persist).
 * This is the ONLY read path downstream consumers should use.
 */
export function getTier2Cache(stationId: string): Tier2Cache | null {
  const mem = memoryCache.get(stationId);
  if (mem) return mem;
  try {
    const raw = tier2Storage.getString(TIER2_KEY_PREFIX + stationId);
    if (raw) {
      const parsed = JSON.parse(raw) as Tier2Cache;
      memoryCache.set(stationId, parsed);
      return parsed;
    }
  } catch (e) {
    console.error('[TIER2_CACHE_FAIL] Failed to read persisted Tier 2 cache:', e);
  }
  return null;
}

/**
 * Manual trigger for the Tier 2 grab. The geofence layer (backgroundTask.ts →
 * SessionManager.handleGeofenceEnter) is expected to call this on station
 * geofence entry (50–150m radius). Fires immediately and silently (P0).
 *
 * It is safe to call multiple times; a grab already in flight for a station is
 * deduped so we don't stampede the backend on repeated geofence events.
 */
export function triggerTier2Grab(stationId: string, lineId: string): void {
  if (!stationId) {
    console.error('[TIER2_CACHE_FAIL] triggerTier2Grab called with empty stationId.');
    return;
  }
  const key = `${stationId}:${lineId}`;
  if (inFlight.has(key)) {
    return; // already grabbing this station+line combo
  }
  inFlight.add(key);
  // Fire-and-forget: silent, no UI. Failures are logged as P0, not thrown.
  runGrab(stationId, lineId)
    .catch((err) => {
      console.error('[TIER2_CACHE_FAIL] Unhandled rejection in Tier 2 grab:', err);
    })
    .finally(() => {
      inFlight.delete(key);
    });
}

// ============================================================================
// Internal grab pipeline
// ============================================================================

const inFlight = new Set<string>();

async function runGrab(stationId: string, lineId: string): Promise<void> {
  const grabbedAt = new Date().toISOString();

  // Both grabs run concurrently — disruption is cheap, arrivals is time-sensitive.
  const [disruption, platforms, arrivalsLastUpdated] = await Promise.all([
    grabDisruption(lineId),
    grabArrivals(stationId),
    Promise.resolve(new Date().toISOString()),
  ]);

  // If arrivals completely failed after all retries, we still persist what we
  // have but flag the failure loudly. A cache with no arrivals is a degraded
  // P0 state — log it so it surfaces.
  const cache: Tier2Cache = {
    stationId,
    lineId,
    disruption,
    platforms,
    grabbedAt,
    arrivalsLastUpdated,
  };

  persistCache(cache);
  memoryCache.set(stationId, cache);
  emit(cache);
}

// ----------------------------------------------------------------------------
// Disruption grab — ONE attempt + ONE silent retry on failure.
// Source: /api/lines (already used by backgroundTask.ts & LiveActivityService).
// Severity barely changes minute-to-minute, so we don't retry aggressively.
// ----------------------------------------------------------------------------
async function grabDisruption(lineId: string): Promise<Tier2Disruption | null> {
  const attempt = async (): Promise<Tier2Disruption | null> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DISRUPTION_TIMEOUT_MS);
    try {
      const resp = await fetch(`${APP_CONFIG.BACKEND_URL}/api/lines`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      if (!resp.ok) {
        throw new Error(`Disruption fetch HTTP ${resp.status}`);
      }
      const lines: any[] = await resp.json();
      return mapLineToDisruption(lines, lineId);
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    return await attempt();
  } catch (firstErr) {
    // SILENT RETRY — single retry, no exponential backoff (disruption is slow-moving).
    try {
      return await attempt();
    } catch (retryErr) {
      console.error(
        '[TIER2_CACHE_FAIL] Disruption grab failed after 1 attempt + 1 silent retry for line',
        lineId,
        '—',
        retryErr
      );
      return null; // degraded-but-populated: downstream treats null disruption as "unknown"
    }
  }
}

// ----------------------------------------------------------------------------
// Arrivals grab — exponential backoff (3 attempts: 1s, 3s, 8s).
// Time-sensitive: station WiFi / brief coverage loss must not lose it.
// Source: /api/stations/${id} — reuses resolveTflStopIds like apiService.ts.
// ALL platforms, NOT filtered by line — the Live Activity may need any platform.
// ----------------------------------------------------------------------------
async function grabArrivals(stationId: string): Promise<Tier2PlatformArrival[]> {
  const resolvedIds = resolveTflStopIds(stationId);
  if (!resolvedIds.length) {
    console.error('[TIER2_CACHE_FAIL] No resolved NaPTAN stop IDs for station', stationId);
    return [];
  }

  let lastError: unknown = null;
  for (let attemptIdx = 0; attemptIdx < ARRIVALS_BACKOFF_MS.length; attemptIdx++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ARRIVALS_TIMEOUT_MS);
    try {
      const responses = await Promise.all(
        resolvedIds.map((id) =>
          fetch(`${APP_CONFIG.BACKEND_URL}/api/stations/${id}`, { signal: controller.signal })
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null)
        )
      );
      clearTimeout(timeout);

      const arrivals = flattenArrivals(responses);
      if (arrivals.length > 0 || attemptIdx === ARRIVALS_BACKOFF_MS.length - 1) {
        // Success, OR we've exhausted retries — return whatever we have.
        return arrivals;
      }
      lastError = new Error(`Arrivals fetch returned no data on attempt ${attemptIdx + 1}`);
    } catch (err) {
      clearTimeout(timeout);
      lastError = err;
      console.warn(
        `[tier2Cache] Arrivals attempt ${attemptIdx + 1}/${ARRIVALS_BACKOFF_MS.length} failed for ${stationId}:`,
        err
      );
    }

    // Backoff before next attempt (skip delay after the final attempt).
    if (attemptIdx < ARRIVALS_BACKOFF_MS.length - 1) {
      await sleep(ARRIVALS_BACKOFF_MS[attemptIdx]);
    }
  }

  console.error(
    '[TIER2_CACHE_FAIL] Arrivals grab FAILED after 3 attempts (1s/3s/8s backoff) for station',
    stationId,
    '—',
    lastError
  );
  return []; // degraded: empty platforms, but cache is still published for disruption + shape
}

// ============================================================================
// Mappers / helpers
// ============================================================================

/**
 * Map the /api/lines payload to a Tier2Disruption. Matches the canonical
 * severity mapping in AGENTS.md §3 (and backgroundTask.ts):
 *   10,18,14 → good ; 9,7 → minor ; 6 → severe ; rest → suspended.
 */
function mapLineToDisruption(lines: any[], lineId: string): Tier2Disruption | null {
  if (!Array.isArray(lines) || !lineId) return null;

  const lowered = lineId.toLowerCase();
  const OVERGROUND_BRANCHES = ['liberty', 'lioness', 'mildmay', 'suffragette', 'weaver', 'windrush'];

  const byId: Record<string, any> = {};
  lines.forEach((l) => {
    if (typeof l?.id === 'string') byId[l.id.toLowerCase()] = l;
  });

  // Aggregate worst severity across overground branches if needed.
  let lineData: any = byId[lowered];
  if (lowered === 'overground') {
    let worst: any = null;
    let worstRank = 0;
    OVERGROUND_BRANCHES.forEach((b) => {
      const branch = byId[b];
      if (branch) {
        const rank = severityRank(parseSeverity(branch));
        if (rank > worstRank) {
          worstRank = rank;
          worst = branch;
        }
      }
    });
    if (worst) {
      lineData = { ...(byId['overground'] || {}), status: worst.status, reason: worst.reason };
    }
  }

  if (!lineData) return null;

  const severity = parseSeverity(lineData);
  const statusText = String(lineData.status ?? '').toLowerCase();
  const isDisrupted = severity < 10 || /(delay|closure|suspend|reduced|part closure|severe)/.test(statusText);
  // Good-service codes explicitly mean not disrupted.
  if ([10, 18, 14].includes(severity)) {
    return { isDisrupted: false, severity, description: lineData.status || 'Good Service', reason: lineData.reason || null, lineId };
  }

  return {
    isDisrupted,
    severity,
    description: lineData.status || 'Unknown',
    reason: lineData.reason || null,
    lineId,
  };
}

function parseSeverity(lineData: any): number {
  if (typeof lineData?.severity === 'number') return lineData.severity;
  const statusText = String(lineData?.status ?? '').toLowerCase();
  if (/part closure|suspend|closure|closed/.test(statusText)) return 5;
  if (/severe/.test(statusText)) return 6;
  if (/minor|reduced/.test(statusText)) return 9;
  if (statusText.includes('good') || statusText.includes('special') || statusText.includes('information')) return 10;
  return 10; // default to good when unknown
}

function severityRank(sev: number): number {
  if (sev === 10 || sev === 18 || sev === 14) return 0;
  if (sev === 9 || sev === 7) return 1;
  if (sev === 6) return 2;
  return 3; // suspended / worst
}

/** Flatten API station responses into the Tier2PlatformArrival[] shape. */
function flattenArrivals(responses: any[]): Tier2PlatformArrival[] {
  const out: Tier2PlatformArrival[] = [];
  for (const sData of responses) {
    if (!sData || !Array.isArray(sData.departures)) continue;
    for (const dep of sData.departures) {
      const expectedArrival =
        dep.expected_arrival || (dep.expectedArrival ? dep.expectedArrival : '');
      const timeToStation =
        typeof dep.time_to_station === 'number'
          ? dep.time_to_station
          : typeof dep.timeToStation === 'number'
          ? dep.timeToStation
          : expectedArrival
          ? Math.max(0, Math.round((new Date(expectedArrival).getTime() - Date.now()) / 1000))
          : 0;

      out.push({
        platformName: dep.platform || dep.platformName || '',
        destinationName: (dep.destination || dep.destinationName || '').replace(' Underground Station', ''),
        expectedArrival,
        timeToStation,
      });
    }
  }
  // Sort by soonest arrival.
  out.sort((a, b) => a.timeToStation - b.timeToStation);
  return out;
}

function persistCache(cache: Tier2Cache): void {
  try {
    tier2Storage.set(TIER2_KEY_PREFIX + cache.stationId, JSON.stringify(cache));
  } catch (e) {
    console.error('[TIER2_CACHE_FAIL] Failed to persist Tier 2 cache to App Group MMKV:', e);
  }
}

function emit(cache: Tier2Cache): void {
  listeners.forEach((l) => {
    try {
      l(cache);
    } catch (e) {
      // A bad listener must never break the pipeline. Log, don't throw.
      console.error('[TIER2_CACHE_FAIL] Tier 2 listener threw:', e);
    }
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default {
  triggerTier2Grab,
  getTier2Cache,
  onTier2CachePopulated,
};
