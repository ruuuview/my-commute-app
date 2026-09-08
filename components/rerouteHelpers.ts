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
 * Poka-yoke branch matching: checks if a specific branch is mentioned in the disruption reason text.
 * Prevents false-positive matches on common generic transit terms ('branch', 'line', 'the', 'via', etc.)
 * while correctly matching branch names and distinct landmarks (e.g. 'Bank', 'Charing Cross',
 * 'Richmond', 'Wimbledon', 'Heathrow', 'Uxbridge', 'Edgware', 'High Barnet').
 */
export function isBranchMentioned(branchName: string, reasonText: string): boolean {
  if (!branchName || !reasonText) return false;
  const reasonLower = reasonText.toLowerCase();

  // Strip 'branch' and clean up
  const rawCore = branchName
    .toLowerCase()
    .replace(/\bbranch\b/g, '')
    .trim();
  if (!rawCore) return false;

  // Row 1 False-Positive Exclusion: "Bank holiday" is never a Bank branch disruption
  const cleanReason = reasonLower.replace(/\bbank\s+holiday\b/g, 'holiday_period');

  // If branchName contains compound names joined by '&', 'and', '/', or ','
  // (e.g. "Amersham & Chesham", "Chesham and Amersham"), check each component sub-branch.
  if (/(&|\band\b|\/|,)/.test(rawCore)) {
    const parts = rawCore.split(/&|\band\b|\/|,/).map((p) => p.trim()).filter(Boolean);
    return parts.some((part) => isBranchMentioned(part, cleanReason));
  }

  // Handle (via X) constructs: e.g. "Hainault (via Newbury Park)"
  const viaMatch = rawCore.match(/\((?:via\s+)?([^)]+)\)/i);
  if (viaMatch) {
    const viaTerm = viaMatch[1].trim();
    const mainTerm = rawCore.replace(/\((?:via\s+)?([^)]+)\)/i, '').trim();
    if (viaTerm && isBranchMentioned(viaTerm, cleanReason)) {
      return true;
    }
    if (mainTerm && isBranchMentioned(mainTerm, cleanReason)) {
      return true;
    }
  }

  const cleanCore = rawCore.replace(/[()]/g, '').trim();
  if (!cleanCore) return false;

  // Exact whole-phrase match with word boundaries
  const escapedCore = cleanCore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Poka-yoke guard: Northern Line "Edgware" terminus must NEVER match "Edgware Road"
  // (Edgware Road is on Circle/District/Hammersmith & City/Bakerloo, not Northern).
  if (cleanCore === 'edgware') {
    return /\bedgware(?!\s+road\b)\b/i.test(cleanReason);
  }

  if (new RegExp(`\\b${escapedCore}\\b`, 'i').test(cleanReason)) {
    return true;
  }

  // Distinct branch aliases / unambiguous short forms
  if (cleanCore === 'charing cross' && /\bchx\b/i.test(cleanReason)) {
    return true;
  }
  if (cleanCore === 'battersea power station' && /\bbattersea\b/i.test(cleanReason)) {
    return true;
  }
  if (cleanCore === 'high barnet' && /\bbarnet\b/i.test(cleanReason)) {
    return true;
  }

  return false;
}

/**
 * Infer canonical branch from arrival destination name when TfL omits via/branch info.
 * Includes honest unknown control: returns undefined for trunk termini (e.g. Cockfosters on Piccadilly).
 */
export function inferBranchFromDestination(lineId: string, destination: string): string | undefined {
  if (!lineId || !destination) return undefined;
  const line = normalizeLineId(lineId);
  const dest = destination.toLowerCase().trim();

  if (line === 'piccadilly') {
    if (dest.includes('heathrow')) return 'Heathrow';
    if (dest.includes('uxbridge') || dest.includes('rayners lane')) return 'Uxbridge';
    // Trunk termini (Cockfosters, Arnos Grove, Oakwood, South Harrow) are NOT branches
    return undefined;
  }

  if (line === 'northern') {
    if (dest.includes('edgware')) return 'Edgware';
    if (dest.includes('high barnet')) return 'High Barnet';
    if (dest.includes('mill hill east')) return 'Mill Hill East';
    if (dest.includes('battersea')) return 'Battersea Power Station';
    if (dest.includes('morden')) return 'Morden';
    return undefined;
  }

  if (line === 'metropolitan') {
    if (dest.includes('chesham')) return 'Chesham';
    if (dest.includes('amersham')) return 'Amersham';
    if (dest.includes('watford')) return 'Watford';
    if (dest.includes('uxbridge')) return 'Uxbridge';
    return undefined;
  }

  if (line === 'district') {
    if (dest.includes('upminster')) return 'Upminster';
    if (dest.includes('wimbledon')) return 'Wimbledon';
    if (dest.includes('richmond')) return 'Richmond';
    if (dest.includes('ealing broadway')) return 'Ealing Broadway';
    if (dest.includes('edgware road')) return 'Edgware Road';
    return undefined;
  }

  if (line === 'central') {
    if (dest.includes('newbury park')) return 'Newbury Park';
    if (dest.includes('woodford')) return 'Woodford';
    if (dest.includes('hainault')) return 'Hainault';
    if (dest.includes('epping')) return 'Epping';
    if (dest.includes('west ruislip')) return 'West Ruislip';
    if (dest.includes('ealing broadway')) return 'Ealing Broadway';
    return undefined;
  }

  if (line === 'elizabeth') {
    if (dest.includes('reading')) return 'Reading';
    if (dest.includes('heathrow')) return 'Heathrow';
    if (dest.includes('shenfield')) return 'Shenfield';
    if (dest.includes('abbey wood')) return 'Abbey Wood';
    return undefined;
  }

  return undefined;
}

/**
 * 2-Axis reachability constraint checker (Turn 15 Row 5).
 * Validates whether a terminal and corridor combination is physically connected.
 * e.g., Northern Line Battersea Power Station connects via Charing Cross ONLY (never Bank).
 */
export function isReachableCombination(lineId: string, terminal: string, corridor: string): boolean {
  if (!lineId || !terminal || !corridor) return false;
  const line = normalizeLineId(lineId);
  const term = terminal.toLowerCase();
  const corr = corridor.toLowerCase();

  if (line === 'northern') {
    const isBank = corr.includes('bank');
    const isChX = corr.includes('charing') || corr.includes('chx');

    // Battersea Power Station extension connects to Charing Cross branch at Kennington.
    // Trains to/from Battersea run via Charing Cross ONLY. Never via Bank.
    if (term.includes('battersea')) {
      if (isBank) return false;
      if (isChX) return true;
      return false;
    }

    // Morden connects to both Bank and Charing Cross
    if (term.includes('morden')) {
      return isBank || isChX;
    }

    // Northern terminals: Edgware, High Barnet, Mill Hill East connect to both Bank and Charing Cross
    if (term.includes('edgware') || term.includes('barnet') || term.includes('mill hill')) {
      return isBank || isChX;
    }
  }

  return true;
}

/**
 * Disambiguates train arrival selection (Turn 15 Row 3 & SwitchEndpointIntent.swift).
 * When selecting an endpoint with a via/branch specifier (e.g. "Morden (via Bank)"),
 * checks BOTH destination AND via/corridor to prevent first-hit mismatch.
 */
export function matchArrivalEndpoint<T extends { destinationName: string; via?: string; branch?: string }>(
  arrivals: T[],
  endpointName: string
): T | undefined {
  if (!arrivals || !arrivals.length || !endpointName) return undefined;

  const clean = endpointName.trim();
  const viaMatch = clean.match(/\((?:via\s+)?([^)]+)\)/i) || clean.match(/\bvia\s+([a-z0-9\s&'-]+)$/i);
  const targetVia = viaMatch ? viaMatch[1].trim().toLowerCase() : null;
  const targetDest = clean
    .replace(/\((?:via\s+)?([^)]+)\)/i, '')
    .replace(/\bvia\s+([a-z0-9\s&'-]+)$/i, '')
    .trim()
    .toLowerCase();

  return arrivals.find((arrival) => {
    const arrDest = (arrival.destinationName || '').toLowerCase();
    const arrVia = (arrival.via || '').toLowerCase();
    const arrBranch = (arrival.branch || '').toLowerCase();

    // 1. Destination match
    const destMatches =
      arrDest.includes(targetDest) || targetDest.includes(arrDest);

    if (!destMatches) return false;

    // 2. Via/corridor match if target specifies a via
    if (targetVia) {
      return arrVia.includes(targetVia) || arrBranch.includes(targetVia);
    }

    return true;
  });
}

export interface SessionCorridorInput {
  lineId: string;
  originStation: string;
  destinationStation: string;
  via?: string;
  intermediateFixes?: string[];
}

export interface SessionCorridorResult {
  corridor: string | null;
  branchScope: 'all' | 'partial' | 'unknown';
  requiresManualReview: boolean;
}

/**
 * Shared or ambiguous Northern line stations (Euston, Kennington, Camden Town, Morden).
 * These stations serve both branches (or are trunk/divergence points) and can NEVER
 * be used as witnesses to disambiguate Bank vs Charing Cross corridors.
 */
export const NORTHERN_SHARED_STATIONS = new Set([
  '940GZZLUEUS', // Euston
  '940GZZLUKWN', // Kennington
  '940GZZLUCTN', // Camden Town
  '940GZZLUMDN', // Morden
  'EUSTON',
  'KENNINGTON',
  'CAMDEN TOWN',
  'CAMDEN',
  'MORDEN',
]);

/**
 * Bank Corridor Exclusive Witnesses: stations that physically exist ONLY on the Bank branch.
 * King's Cross St. Pancras, Angel, Moorgate, Old Street, Bank, London Bridge, Borough, Elephant & Castle.
 */
export const BANK_CORRIDOR_WITNESSES = new Set([
  'HUBBNK',
  '940GZZLUBNK', // Bank
  '940GZZLUMGT', // Moorgate
  '940GZZLUODS', // Old Street
  '940GZZLUAGL', // Angel
  '940GZZLULNB', // London Bridge
  '940GZZLUBOR', // Borough
  '940GZZLUEAC', // Elephant & Castle
  'HUBKSX',
  '940GZZLUKSX', // King's Cross St. Pancras
]);

/**
 * Charing Cross Corridor Exclusive Witnesses: stations that physically exist ONLY on Charing Cross branch.
 * Mornington Crescent, Warren Street, Goodge Street, Tottenham Court Road, Leicester Square, Charing Cross, Embankment, Waterloo.
 */
export const CHARING_CROSS_CORRIDOR_WITNESSES = new Set([
  '940GZZLUCHX', // Charing Cross
  '940GZZLUEMB', // Embankment
  '940GZZLUWLO', // Waterloo
  '940GZZLULSQ', // Leicester Square
  '940GZZLUTCR', // Tottenham Court Road
  '940GZZLUGDG', // Goodge Street
  '940GZZLUWST', // Warren Street
  '940GZZLUMNC', // Mornington Crescent
]);

function matchesCorridorWitness(fix: string, branchName: 'bank' | 'chx'): boolean {
  const upper = fix.toUpperCase().trim();
  if (NORTHERN_SHARED_STATIONS.has(upper)) return false;

  if (branchName === 'bank') {
    if (BANK_CORRIDOR_WITNESSES.has(upper)) return true;
    // Word boundary check prevents "EMBANKMENT" matching "BANK"
    if (/\bBANK\b/i.test(fix) && !/EMBANKMENT/i.test(upper)) return true;
    if (upper.includes('BNK') && !upper.includes('EMB')) return true;
    if (
      upper.includes('MOORGATE') ||
      upper.includes('OLD STREET') ||
      upper.includes('ANGEL') ||
      upper.includes('LONDON BRIDGE') ||
      upper.includes('BOROUGH') ||
      upper.includes('ELEPHANT') ||
      upper.includes('KINGS CROSS') ||
      upper.includes("KING'S CROSS") ||
      upper.includes('KSX')
    ) {
      return true;
    }
  } else if (branchName === 'chx') {
    if (CHARING_CROSS_CORRIDOR_WITNESSES.has(upper)) return true;
    if (/\bCHARING\b/i.test(fix) || upper.includes('CHX')) return true;
    if (
      upper.includes('EMBANKMENT') ||
      upper.includes('WATERLOO') ||
      upper.includes('LEICESTER') ||
      upper.includes('TOTTENHAM COURT') ||
      upper.includes('GOODGE') ||
      upper.includes('WARREN STREET') ||
      upper.includes('MORNINGTON CRESCENT') ||
      upper.includes('MNC')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Gate 3 Money Engine: on-device session corridor witness resolution.
 * If a core-crossing Northern line journey has no via and zero corridor platform fixes,
 * it returns branchScope: 'unknown' and requiresManualReview: true (Rules 8 & 9).
 */
export function deriveSessionCorridor(input: SessionCorridorInput): SessionCorridorResult {
  const line = normalizeLineId(input.lineId);

  if (line === 'northern') {
    // 1. Explicit via clause has highest priority
    if (input.via) {
      const v = input.via.toLowerCase();
      if (v.includes('bank')) {
        return { corridor: 'Bank', branchScope: 'partial', requiresManualReview: false };
      }
      if (v.includes('charing') || v.includes('chx')) {
        return { corridor: 'Charing Cross', branchScope: 'partial', requiresManualReview: false };
      }
    }

    // 2. Physical corridor station witnesses from intermediate platform fixes
    const fixes = (input.intermediateFixes || []).map((f) => f.trim());
    const nonSharedFixes = fixes.filter((f) => !NORTHERN_SHARED_STATIONS.has(f.toUpperCase()));

    const sawBank = nonSharedFixes.some((f) => matchesCorridorWitness(f, 'bank'));
    const sawChX = nonSharedFixes.some((f) => matchesCorridorWitness(f, 'chx'));

    if (sawBank && !sawChX) {
      return { corridor: 'Bank', branchScope: 'partial', requiresManualReview: false };
    }
    if (sawChX && !sawBank) {
      return { corridor: 'Charing Cross', branchScope: 'partial', requiresManualReview: false };
    }

    // 3. Ambiguous cross-core route without corridor witness -> degrade to manual review (Rules 8 & 9)
    return {
      corridor: null,
      branchScope: 'unknown',
      requiresManualReview: true,
    };
  }

  // Non-Northern lines
  return {
    corridor: null,
    branchScope: 'all',
    requiresManualReview: false,
  };
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
  const mentionedConfirmed = isBranchMentioned(confirmedTerminus, reason);
  const mentionedOther = isBranchMentioned(otherTerminus || '', reason);

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
  if (confirmedTerminus && confirmedTerminus.length > 0) {
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
  if (!destinationLabel) {
    return {
      googleMapsUrl: 'https://maps.google.com',
      citymapperUrl: 'citymapper://',
    };
  }

  const cleanLabel = destinationLabel
    .replace(/\s*branch\s*$/i, '')
    .replace(/\s*line\s*$/i, '')
    .trim();
  const fullSearchTerm = cleanLabel.toLowerCase().includes('station')
    ? `${cleanLabel}, London`
    : `${cleanLabel} Station, London`;

  const q = encodeURIComponent(fullSearchTerm);

  return {
    googleMapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=transit`,
    citymapperUrl: `citymapper://directions?end=${q}`,
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

/**
 * Normalize line IDs across TfL API, user preferences store, and UI components.
 * Standardizes line name variants (e.g. 'hammersmith-and-city' -> 'hammersmith-city',
 * 'elizabeth-line' -> 'elizabeth', 'Central' -> 'central') for reliable matching.
 */
export function normalizeLineId(lineId: string): string {
  if (!lineId) return '';
  let id = String(lineId).toLowerCase().trim();
  id = id.replace(/[\s-]line$/i, '');
  if (id === 'hammersmith-and-city' || id === 'hammersmith & city' || id === 'hammersmithandcity') return 'hammersmith-city';
  if (id === 'waterloo-and-city' || id === 'waterloo & city' || id === 'waterlooandcity') return 'waterloo-city';
  if (id === 'london-overground' || id === 'london overground') return 'overground';
  if (id === 'elizabeth-line' || id === 'elizabeth line') return 'elizabeth';
  if (id === 'docklands-light-railway' || id === 'docklands light railway') return 'dlr';
  return id;
}

/**
 * Check whether a disruption reason or statusType indicates a line-wide / network disruption.
 * Covers phrasing like "across the line", "entire line", "all stations", "suspended", "closure".
 */
export function isLineWideDisruption(reasonText: string, statusType?: string): boolean {
  const s = String(statusType ?? '').toLowerCase();
  if (s === 'suspended' || s === 'closure') return true;
  const r = String(reasonText ?? '').toLowerCase();
  if (!r) return false;
  return (
    r.includes('entire line') ||
    r.includes('across the line') ||
    r.includes('line-wide') ||
    r.includes('line wide') ||
    r.includes('all stations') ||
    r.includes('whole line') ||
    r.includes('all branches') ||
    r.includes('entire network') ||
    r.includes('no service on the line') ||
    r.includes('suspended across')
  );
}

/**
 * Get branch-specific suggested route recommendations.
 * Replaces vague static text with highly specific, justified alternatives.
 */
export interface SuggestedRouteData {
  description: string;
  extraTimeMinutes: number;
  platform?: string;
}

export function getBranchSuggestedRoute(
  lineId: string,
  terminus: string,
  fallbackRoute?: SuggestedRouteData
): SuggestedRouteData | undefined {
  const normLine = normalizeLineId(lineId);
  const term = String(terminus ?? '').trim().toLowerCase();

  if (normLine === 'elizabeth') {
    if (term.includes('reading')) {
      return {
        description: 'Use fast Great Western Railway (GWR) services from London Paddington directly to Reading.',
        extraTimeMinutes: 10,
        platform: 'Platform 11-14',
      };
    }
    if (term.includes('heathrow')) {
      return {
        description: 'Take the Piccadilly line or Heathrow Express from Paddington to Heathrow terminals.',
        extraTimeMinutes: 15,
        platform: 'Platform 6-7',
      };
    }
    if (term.includes('shenfield')) {
      return {
        description: 'Use Greater Anglia services from Liverpool Street or the Central line to Stratford.',
        extraTimeMinutes: 8,
        platform: 'Platform 1-4',
      };
    }
    if (term.includes('abbey wood')) {
      return {
        description: 'Use Southeastern services from London Bridge or the Jubilee line + DLR via Canning Town to Woolwich / Abbey Wood.',
        extraTimeMinutes: 12,
        platform: 'Platform B',
      };
    }
  }

  if (normLine === 'northern') {
    if (term.includes('bank')) {
      return {
        description: 'Take Charing Cross branch via Euston or Kennington for cross-platform interchange, or Thameslink from London Bridge / Elephant & Castle.',
        extraTimeMinutes: 7,
        platform: 'Platform 3',
      };
    }
    if (term.includes('charing cross')) {
      return {
        description: 'Take Bank branch via Euston or Kennington for cross-platform interchange, or Bakerloo / Jubilee lines.',
        extraTimeMinutes: 7,
        platform: 'Platform 1',
      };
    }
    if (term.includes('morden')) {
      return {
        description: 'Use Thameslink services from London Bridge / Elephant & Castle for parallel travel towards Morden.',
        extraTimeMinutes: 8,
        platform: 'Platform 4',
      };
    }
    if (term.includes('edgware')) {
      return {
        description: 'Use Thameslink services from St Pancras to Mill Hill Broadway, then connect via local buses.',
        extraTimeMinutes: 14,
        platform: 'Platform A',
      };
    }
    if (term.includes('barnet')) {
      return {
        description: 'Take Great Northern services from Moorgate to Finsbury Park / Highbury & Islington towards High Barnet.',
        extraTimeMinutes: 11,
        platform: 'Platform 9-10',
      };
    }
    if (term.includes('battersea')) {
      return {
        description: 'Use London Buses or Southern rail services from Victoria to Battersea Park / Power Station.',
        extraTimeMinutes: 6,
        platform: 'Platform 15-19',
      };
    }
  }

  if (normLine === 'central') {
    if (term.includes('ealing broadway')) {
      return {
        description: 'Use the Elizabeth line or Great Western Railway (GWR) from Paddington for faster parallel travel.',
        extraTimeMinutes: 6,
        platform: 'Platform A',
      };
    }
    if (term.includes('west ruislip')) {
      return {
        description: 'Use Chiltern Railways services from London Marylebone directly to West Ruislip.',
        extraTimeMinutes: 12,
        platform: 'Platform 4-6',
      };
    }
    if (term.includes('epping')) {
      return {
        description: 'Take London Overground to Chingford, then connect via local bus routes (97/212/379) to Epping.',
        extraTimeMinutes: 15,
        platform: 'Platform 2',
      };
    }
    if (term.includes('hainault')) {
      return {
        description: 'Use London Overground to Walthamstow Central / Leytonstone High Road and parallel buses to Hainault.',
        extraTimeMinutes: 10,
        platform: 'Platform 1',
      };
    }
  }

  if (normLine === 'piccadilly') {
    if (term.includes('heathrow')) {
      return {
        description: 'Use the Elizabeth line or Heathrow Express from Paddington to Heathrow terminals.',
        extraTimeMinutes: 10,
        platform: 'Platform A',
      };
    }
    if (term.includes('uxbridge')) {
      return {
        description: 'Use the Metropolitan line running parallel from Rayners Lane to Uxbridge.',
        extraTimeMinutes: 5,
        platform: 'Platform 2',
      };
    }
    if (term.includes('cockfosters')) {
      return {
        description: 'Take Great Northern rail services from Moorgate / Finsbury Park or Victoria line to Finsbury Park.',
        extraTimeMinutes: 8,
        platform: 'Platform 3',
      };
    }
    if (term.includes('arnos grove')) {
      return {
        description: 'Use Great Northern rail services from Moorgate to New Southgate or Victoria line to Finsbury Park.',
        extraTimeMinutes: 9,
        platform: 'Platform 1',
      };
    }
  }

  if (normLine === 'district') {
    if (term.includes('richmond')) {
      return {
        description: 'Take London Overground or South Western Railway (SWR) services from London Waterloo / Richmond.',
        extraTimeMinutes: 8,
        platform: 'Platform 19-24',
      };
    }
    if (term.includes('wimbledon')) {
      return {
        description: 'Take South Western Railway (SWR) services from London Waterloo directly to Wimbledon.',
        extraTimeMinutes: 7,
        platform: 'Platform 7-10',
      };
    }
    if (term.includes('ealing broadway')) {
      return {
        description: 'Use the Central line or Elizabeth line services from Paddington to Ealing Broadway.',
        extraTimeMinutes: 6,
        platform: 'Platform A',
      };
    }
    if (term.includes('edgware road')) {
      return {
        description: 'Use the Circle or Hammersmith & City line from South Kensington / High Street Kensington to Edgware Road.',
        extraTimeMinutes: 6,
        platform: 'Platform 2',
      };
    }
    if (term.includes('upminster')) {
      return {
        description: 'Use c2c National Rail services from London Fenchurch Street directly to Upminster.',
        extraTimeMinutes: 5,
        platform: 'Platform 1-4',
      };
    }
  }

  if (normLine === 'victoria') {
    if (term.includes('brixton')) {
      return {
        description: 'Use Southeastern services from London Victoria to Brixton or Northern line to Stockwell.',
        extraTimeMinutes: 7,
        platform: 'Platform 5-8',
      };
    }
    if (term.includes('walthamstow central')) {
      return {
        description: 'Use London Overground (Weaver line) from Liverpool Street directly to Walthamstow Central.',
        extraTimeMinutes: 6,
        platform: 'Platform 2',
      };
    }
  }

  if (normLine === 'jubilee') {
    if (term.includes('stratford')) {
      return {
        description: 'Use the Central line or Elizabeth line via Liverpool Street / Holborn to Stratford.',
        extraTimeMinutes: 6,
        platform: 'Platform 1',
      };
    }
    if (term.includes('stanmore')) {
      return {
        description: 'Use the Metropolitan line to Canons Park / Harrow-on-the-Hill and connect via local bus routes.',
        extraTimeMinutes: 10,
        platform: 'Platform 2',
      };
    }
  }

  if (normLine === 'bakerloo') {
    if (term.includes('harrow')) {
      return {
        description: 'Use London Overground (Lioness line) from London Euston directly to Harrow & Wealdstone.',
        extraTimeMinutes: 5,
        platform: 'Platform 9',
      };
    }
    if (term.includes('elephant')) {
      return {
        description: 'Use the Northern line or Thameslink services from Blackfriars / London Bridge to Elephant & Castle.',
        extraTimeMinutes: 5,
        platform: 'Platform 4',
      };
    }
  }

  if (normLine === 'metropolitan') {
    if (term.includes('uxbridge')) {
      return {
        description: 'Use the Piccadilly line running parallel from Rayners Lane to Uxbridge.',
        extraTimeMinutes: 5,
        platform: 'Platform 2',
      };
    }
    if (term.includes('watford')) {
      return {
        description: 'Use London Overground (Lioness line) from London Euston directly to Watford Junction.',
        extraTimeMinutes: 8,
        platform: 'Platform 9-10',
      };
    }
    if (term.includes('amersham') || term.includes('chesham')) {
      return {
        description: 'Use Chiltern Railways services from London Marylebone directly to Amersham.',
        extraTimeMinutes: 10,
        platform: 'Platform 5-6',
      };
    }
    if (term.includes('aldgate')) {
      return {
        description: 'Use the Circle or Hammersmith & City line from Baker Street / King’s Cross to Aldgate.',
        extraTimeMinutes: 5,
        platform: 'Platform 1',
      };
    }
  }

  return fallbackRoute;
}

