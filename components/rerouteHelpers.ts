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

export type RerouteMode = 'affected' | 'unaffected' | 'empty';

export interface RerouteResolutionInput {
  /** Station the user is on / pinned to. */
  stationId: string;
  /** The user's CONFIRMED branch terminus, e.g. 'Edgware'. */
  confirmedTerminus: string;
  /** The other branch's terminus on the same line, e.g. 'Morden'. */
  otherTerminus?: string;
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
  const { stationId, confirmedTerminus, otherTerminus } = input;
  const disruption = readCachedDisruption(stationId);

  if (!disruption || !disruption.isDisrupted) {
    // No active disruption on the cache.
    return { mode: 'empty', disruption, isBranchAffected: false };
  }

  // We have an active disruption. Decide affected vs unaffected vs empty.
  const reason = (disruption.reason || disruption.description || '').toLowerCase();

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
      disruption,
      disruptedBranch: confirmedTerminus,
      isBranchAffected: true,
    };
  }

  if (mentionedOther) {
    return {
      mode: 'unaffected',
      disruption,
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
      disruption,
      disruptedBranch: confirmedTerminus,
      isBranchAffected: true,
    };
  }

  return { mode: 'empty', disruption, isBranchAffected: false };
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
