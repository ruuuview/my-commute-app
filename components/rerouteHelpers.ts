/**
 * rerouteHelpers.ts
 * ─────────────────────────────────────────────────────────────────
 * Wiring helpers for FEATURE 1 — REROUTE.
 *
 * These let the dashboard / status popup decide:
 *   1. Whether to show the "See alternative routes" CTA at all (only when the
 *      Tier 2 cache reports an active disruption — absent, NOT greyed, otherwise).
 *   2. Which RerouteScreen `mode` to use for a given station + branch.
 *
 * All reads go through Tier2CacheManager (services/tier2Cache.ts). We NEVER
 * re-fetch TfL from the UI layer.
 *
 * Scope boundary — verbatim, do not delete:
 *   Not a journey planner. Tube/Overground/DLR/Elizabeth Line only.
 *   Triggered only by active disruption on a route the user is on or
 *   pinned to. No destination search, ever. No transport mode expansion.
 *   Reject scope creep on sight. Cite this rule.
 * ─────────────────────────────────────────────────────────────────
 */

import { getTier2Cache, Tier2Cache } from '../services/tier2Cache';
import { resolveTflStopIds } from '../utils/resolveTflStopId';

export type RerouteMode = 'affected' | 'unaffected' | 'empty';

export interface RerouteResolutionInput {
  /** Station the user is on / pinned to. */
  stationId: string;
  /** The user's CONFIRMED branch terminus, e.g. 'Edgware'. */
  confirmedTerminus: string;
  /** The other branch's terminus on the same line, e.g. 'Morden'. */
  otherTerminus?: string;
  /** The line the reroute is being resolved for. Guards against a
   *  false-positive: a disruption on a DIFFERENT line (cached at the
   *  same station) must not trigger an 'affected' reroute. */
  expectedLineId: string;
  /**
   * Fallback severity from the live TfL poll when Tier2 cache is empty
   * (user is remote from station). Lowercase string matching the app's
   * Severity type: 'good' | 'minor' | 'severe' | 'suspended' | 'unknown' | 'offline'.
   * When cache has no disruption but the live status shows one, we surface
   * the reroute (default toward showing, never false calm).
   */
  fallbackStatusType?: string;
  /**
   * Fallback disruption reason from the live TfL poll, used when the
   * Tier2 cache is empty but fallbackStatusType indicates disruption.
   */
  fallbackReason?: string;
}

export interface RerouteResolution {
  mode: RerouteMode;
  /** The disruption object from the cache (if any). */
  disruption: Tier2Cache['disruption'];
  /** Which branch the disruption is on, if branch-specific. */
  disruptedBranch?: string;
  /** Whether the disruption touches the user's detected/selected branch. */
  isBranchAffected: boolean;
}

/**
 * Read the cached disruption for a station.
 * Returns null when no cache has been populated (treated as "unknown").
 */
export function readCachedDisruption(
  stationId: string
): Tier2Cache['disruption'] {
  const cache = getTier2Cache(stationId);
  return cache?.disruption ?? null;
}

/**
 * CTA gate — Rule 11 / FEATURE 1 entry point.
 * Show "See alternative routes" ONLY when the cache reports an active
 * disruption. Returns false (CTA absent, not greyed) otherwise.
 */
export function shouldShowRerouteCTA(stationId: string): boolean {
  const disruption = readCachedDisruption(stationId);
  return !!disruption?.isDisrupted;
}

/**
 * Resolve which RerouteScreen mode to render for a station.
 *
 * Disruption resolution (FEATURE 1):
 *   StopPoint/{id}/Disruption — structured per-station. Any disrupted/degraded
 *   station on the confirmed branch path = affected. Partial/degraded = affected.
 *   Default toward showing a reroute, never toward false calm.
 *
 *   // Partial/degraded defaults to affected.
 *   // False alarm costs less than false calm.
 */
export function resolveRerouteMode(input: RerouteResolutionInput): RerouteResolution {
  const { stationId, confirmedTerminus, otherTerminus, expectedLineId, fallbackStatusType, fallbackReason } = input;
  const disruption = readCachedDisruption(stationId);

  // LINE GUARD: require exact line match for cached disruption.
  const effectiveDisruption =
    disruption?.lineId === expectedLineId ? disruption : null;

  if (!effectiveDisruption || !effectiveDisruption.isDisrupted) {
    // No active disruption in the Tier2 cache for THIS line.
    // Fallback: check the live TfL severity from the latest poll. If it shows
    // disruption, surface the reroute — default toward showing, never false calm.
    const isDisrupted =
      fallbackStatusType &&
      fallbackStatusType !== 'good' &&
      fallbackStatusType !== 'unknown' &&
      fallbackStatusType !== 'offline';
    if (isDisrupted && confirmedTerminus.length > 0) {
      return {
        mode: 'affected',
        disruption: null,
        disruptedBranch: confirmedTerminus,
        isBranchAffected: true,
      };
    }
    return { mode: 'empty', disruption: null, isBranchAffected: false };
  }

  // We have an active disruption. Decide affected vs unaffected vs empty.
  const reason = (
    effectiveDisruption.reason ||
    effectiveDisruption.description ||
    fallbackReason ||
    ''
  ).toLowerCase();

  // Heuristic: if the disruption reason names the confirmed terminus/branch,
  // the user is affected. If it names the OTHER terminus/branch, the user is
  // unaffected. If it names neither, the disruption touches neither detected
  // nor selected branch → empty edge case.
  const confirmed = confirmedTerminus.toLowerCase();
  const other = (otherTerminus || '').toLowerCase();

  const mentionedConfirmed = confirmed.length > 0 && reason.includes(confirmed);
  const mentionedOther = other.length > 0 && reason.includes(other);

  // Partial/degraded defaults to affected.
  // False alarm costs less than false calm.
  if (mentionedConfirmed) {
    return {
      mode: 'affected',
      disruption: effectiveDisruption,
      disruptedBranch: confirmedTerminus,
      isBranchAffected: true,
    };
  }

  if (mentionedOther) {
    return {
      mode: 'unaffected',
      disruption: effectiveDisruption,
      disruptedBranch: otherTerminus,
      isBranchAffected: false,
    };
  }

  // Disruption exists but names neither branch. Default toward showing a
  // reroute — never false calm. If we have a confirmed branch, treat as
  // affected so the user still gets an actionable screen.
  if (confirmed.length > 0) {
    return {
      mode: 'affected',
      disruption: effectiveDisruption,
      disruptedBranch: confirmedTerminus,
      isBranchAffected: true,
    };
  }

  return { mode: 'empty', disruption: effectiveDisruption, isBranchAffected: false };
}

/**
 * Build Google Maps / Citymapper deep links for an affected reroute.
 * NOTE: the actual reroute graph (Dijkstra) is described in the master plan as
 * already existing (FEATURE 1 build seq step 2: "Dijkstra wiring (static graph
 * + algo already exist)"). It was NOT found in this repository, so we accept a
 * caller-supplied `suggestedRoute` string and a destination here. When the real
 * graph is wired, feed its output into `suggestedRoute` and the destination
 * below — this helper is the seam.
 */
export function buildRerouteLinks(destinationLabel?: string): {
  googleMapsUrl: string;
  citymapperUrl: string;
} {
  const q = destinationLabel
    ? encodeURIComponent(destinationLabel)
    : '';
  return {
    googleMapsUrl: q
      ? `https://www.google.com/maps/dir/?api=1&destination=${q}`
      : 'https://maps.google.com',
    citymapperUrl: q
      ? `citymapper://directions?end=${q}`
      : 'citymapper://',
  };
}

// ============================================================================
// PHASE 6 — affected/unaffected stops intersection
// ============================================================================
//
// The Tier2Cache disruption shape (isDisrupted/severity/description/reason/
// lineId) does NOT carry affected StopPoints (canonical contract — Swift Live
// Activity reads it, never modified), and /api/lines strips them too. So the
// popup fetches the TfL Line disruption feed at open time and intersects its
// affectedStops against the user's pinned stations here.

/** One affected stop point from the TfL Line disruption feed. */
export interface AffectedStop {
  id: string;
  name: string;
}

/** Minimal station reference used for the affected-stops intersection. */
export interface StationRef {
  id: string;
  name: string;
}

const OVERGROUND_BRANCH_IDS = ['liberty', 'lioness', 'mildmay', 'suffragette', 'weaver', 'windrush'];

const DISRUPTION_FETCH_TIMEOUT_MS = 8000;

/** TfL Line disruption feed — one fetch per line id. Empty on any failure. */
async function fetchAffectedStopsForLineId(lineId: string): Promise<AffectedStop[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISRUPTION_FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(
      `https://api.tfl.gov.uk/Line/${encodeURIComponent(lineId)}/Disruption`,
      { signal: controller.signal }
    );
    if (!resp.ok) return [];
    const data: unknown = await resp.json();
    if (!Array.isArray(data)) return [];

    const out: AffectedStop[] = [];
    const seen = new Set<string>();
    for (const disruption of data) {
      const stops = Array.isArray((disruption as any)?.affectedStops)
        ? (disruption as any).affectedStops
        : [];
      for (const sp of stops) {
        const id = String(sp?.id ?? '');
        const name = String(sp?.name ?? '');
        const key = id || name;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ id, name });
      }
    }
    return out;
  } catch {
    // Network/timeout — treat as "unknown", never throw into the UI.
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch the affected stops for a line from the TfL Line disruption feed.
 * London Overground is aggregated across its branch ids (the app's canonical
 * aggregation, matching AGENTS.md §3), so branch feeds are merged too.
 * Never throws — returns [] on any failure so callers can hide the indicator.
 */
export async function fetchLineAffectedStops(lineId: string): Promise<AffectedStop[]> {
  if (!lineId) return [];
  const ids =
    lineId.toLowerCase() === 'overground'
      ? ['overground', ...OVERGROUND_BRANCH_IDS]
      : [lineId];

  const results = await Promise.all(ids.map(id => fetchAffectedStopsForLineId(id)));

  const seen = new Set<string>();
  const merged: AffectedStop[] = [];
  for (const stops of results) {
    for (const stop of stops) {
      const key = stop.id || stop.name;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(stop);
    }
  }
  return merged;
}

const STOP_NAME_SUFFIXES = [
  'underground station',
  'rail station',
  'national rail station',
  'elizabeth line station',
  'dlr station',
  'station',
  'dlr',
  'national rail',
];

/** Normalize a stop/station name for tolerant intersection matching. */
export function normalizeStopName(name: string): string {
  let n = String(name ?? '').toLowerCase().trim();
  for (const suffix of STOP_NAME_SUFFIXES) {
    if (n.endsWith(suffix)) {
      n = n.slice(0, -suffix.length).trim();
    }
  }
  return n.replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Intersect the user's stations against a line's affected StopPoints.
 * Matches on resolved NaPTAN ids (sibling-platform expansion via
 * resolveTflStopIds) with a normalized-name fallback for id mismatches.
 */
export function stationsAffectedByStops(
  stations: StationRef[],
  affectedStops: AffectedStop[]
): StationRef[] {
  if (!stations.length || !affectedStops.length) return [];
  const affectedIds = new Set(affectedStops.map(s => s.id).filter(Boolean));
  const affectedNames = new Set(
    affectedStops.map(s => normalizeStopName(s.name)).filter(Boolean)
  );
  return stations.filter(station => {
    if (resolveTflStopIds(station.id).some(id => affectedIds.has(id))) return true;
    return affectedNames.has(normalizeStopName(station.name));
  });
}

/**
 * Fallback evidence path for the station-impact indicator: match the user's
 * pinned stations against the DISRUPTION REASON text itself.
 *
 * WHY: the TfL Line disruption feed often returns an empty affectedStops
 * array for minor delays (or the fetch can fail), so ID/name intersection
 * alone yields a false "not affected" while the reason text explicitly
 * names the station (e.g. "Minor delays between Camden Town and Morden").
 *
 * Matching rules (tolerant, false-positive-safe):
 *  - Full normalized station name as a substring (e.g. "camden town"),
 *    OR the station's first significant word as a whole word (len >= 4)
 *    — covers TfL's short forms ("between Camden and Morden").
 */
export function stationsMentionedInReason(
  stations: StationRef[],
  reasonText: string
): StationRef[] {
  if (!stations.length || !reasonText) return [];
  const reasonLower = String(reasonText).toLowerCase();
  return stations.filter(station => {
    const norm = normalizeStopName(station.name);
    if (!norm) return false;
    if (reasonLower.includes(norm)) return true;
    const firstWord = norm.split(' ')[0];
    if (firstWord && firstWord.length >= 4) {
      // Whole-word match only — prevents "bank" matching "banking"/"embankment"
      const escaped = firstWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`).test(reasonLower)) return true;
    }
    return false;
  });
}
