// utils/resolveBranch.ts
//
// Branch resolution engine for TfL lines with multiple branches.
//
// Identifies which route branch(es) a station belongs to and resolves
// the split point where branches diverge.
//
// Key concepts:
//   branchId   — unique identifier like 'edgware-via-bank'
//   terminus   — the far end station name, e.g. 'Edgware'
//   splitStation — the last station common to all branches before they diverge
//
// Lines with branches:
//   • Northern: Edgware / High Barnet / Mill Hill East (north of Camden Town)
//               Bank / Charing Cross (south of Camden Town)
//   • Central: Epping / Hainault via Woodford / Hainault via Newbury Park (east)
//              West Ruislip / Ealing Broadway (west)
//   • District: Wimbledon / Ealing Broadway / Richmond / Kensington (Olympia) (west)
//               Upminster (east)  — plus Edgware Road short-run
//   • Metropolitan: Amersham / Chesham / Watford / Uxbridge (northwest)
//                   Aldgate (east)
//   • Piccadilly: Uxbridge / Heathrow T4 / Heathrow T5 (west)
//   • DLR: Bank / Tower Gateway / Stratford / Stratford International (west)
//          Beckton / Lewisham / Woolwich Arsenal (east)
//   • Elizabeth: Reading / Heathrow T4 / Heathrow T5 / Maidenhead (west)
//                Shenfield / Abbey Wood (east)
//   • Overground branches (weaver, windrush, etc.) each have their own lineId
//     so they're resolved at the line level, not the route level

import { LINE_ROUTES, getStationName } from './lineRoutes';
import type { RouteInfo } from './lineRoutes';

// ── Types ─────────────────────────────────────────────────────────

export interface ResolvedBranch {
  branchId: string;
  terminus: string;
  pathStations: string[];
  routeName: string;
}

export interface AmbiguousBranchResult {
  possibleBranches: ResolvedBranch[];
  splitStationName: string;
  splitStationId: string;
}

interface MatchEntry {
  route: RouteInfo;
  direction: 'inbound' | 'outbound';
  fromIdx: number;
  toIdx?: number;
}

// ── Helpers ───────────────────────────────────────────────────────

function deriveBranchId(routeName: string, terminusId: string): string {
  // Extract a unique ID from the route name, e.g.
  // "Edgware ↔ Morden via Bank" → "edgware-via-bank"
  // "Epping ↔ West Ruislip" → "epping-west-ruislip"
  const clean = routeName
    .toLowerCase()
    .replace(/[↔&harr;]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return clean || terminusId.toLowerCase();
}

function deriveTerminusName(route: RouteInfo, fromIdx: number): { terminus: string; terminusId: string; pathStations: string[] } {
  // Determine which end of the route is the "terminus" from the station's perspective.
  // The terminus is the end of the route farthest from fromStationId.
  const naptans = route.naptanIds;
  const endIdx = naptans.length - 1;

  // Check which end is farther
  const distToStart = fromIdx;
  const distToEnd = endIdx - fromIdx;

  let terminusId: string;
  let pathStations: string[];

  if (distToEnd >= distToStart) {
    // Forward direction: terminus is the end of the route
    terminusId = naptans[endIdx];
    pathStations = naptans.slice(fromIdx + 1, endIdx + 1);
  } else {
    // Backward direction: terminus is the start of the route
    terminusId = naptans[0];
    pathStations = naptans.slice(0, fromIdx).reverse();
  }

  const terminus = getStationName(terminusId) || terminusId;
  return { terminus, terminusId, pathStations };
}

function findCommonSplitStation(matches: MatchEntry[], fromStationId: string): { splitStationId: string; splitStationName: string } {
  // Given multiple routes that all contain fromStationId, find the
  // "split station" — the station closest to fromStationId where the
  // routes diverge.
  //
  // Strategy:
  // 1. Walk forward (away from fromStationId) on each route
  // 2. Find the first station where routes disagree
  // 3. The split station is that station (or fromStationId if immediate)

  if (matches.length < 2) {
    // Shouldn't happen, but be safe
    return { splitStationId: fromStationId, splitStationName: getStationName(fromStationId) || fromStationId };
  }

  // Determine which direction has the split.
  // Check forward direction first (away from fromStationId toward the end)
  const forwardSplit = findDivergencePoint(matches, fromStationId, 1);
  if (forwardSplit !== fromStationId) {
    const name = getStationName(forwardSplit) || forwardSplit;
    return { splitStationId: forwardSplit, splitStationName: name };
  }

  // Check backward direction
  const backwardSplit = findDivergencePoint(matches, fromStationId, -1);
  if (backwardSplit !== fromStationId) {
    const name = getStationName(backwardSplit) || backwardSplit;
    return { splitStationId: backwardSplit, splitStationName: name };
  }

  // Divergence is at fromStationId itself
  const name = getStationName(fromStationId) || fromStationId;
  return { splitStationId: fromStationId, splitStationName: name };
}

function findDivergencePoint(matches: MatchEntry[], fromStationId: string, direction: 1 | -1): string {
  // Walk in the given direction from fromStationId on all routes.
  // Return the last station where all routes agree.
  let offset = 0;

  while (true) {
    offset += direction;

    const stationsAtOffset: Set<string> = new Set();
    let allPresent = true;

    for (const m of matches) {
      const idx = direction === 1 ? m.fromIdx + offset : m.fromIdx + offset;
      if (idx < 0 || idx >= m.route.naptanIds.length) {
        allPresent = false;
        break;
      }
      stationsAtOffset.add(m.route.naptanIds[idx]);
    }

    if (!allPresent || stationsAtOffset.size > 1) {
      // Found start of divergence (or end of a route)
      // The split station is the one just before this point
      const splitOffsetIdx = direction === 1
        ? fromIdxFromMatches(matches, fromStationId) + offset - direction
        : fromIdxFromMatches(matches, fromStationId) + offset - direction;

      // Be safe and return fromStationId if we can't find the split
      if (splitOffsetIdx < 0) return fromStationId;

      const route = matches[0].route;
      if (splitOffsetIdx >= route.naptanIds.length) return fromStationId;

      return route.naptanIds[splitOffsetIdx];
    }

    // All routes agree at this offset, keep walking
  }
}

function fromIdxFromMatches(matches: MatchEntry[], fromStationId: string): number {
  // Return the fromIdx from the first match (they should all be the same station)
  return matches[0].fromIdx;
}

function buildBranch(route: RouteInfo, fromIdx: number, direction: 'inbound' | 'outbound'): ResolvedBranch {
  const { terminus, terminusId, pathStations } = deriveTerminusName(route, fromIdx);
  return {
    branchId: deriveBranchId(route.name, terminusId),
    terminus,
    pathStations,
    routeName: route.name,
  };
}

// ── Main resolver ─────────────────────────────────────────────────

export function resolveBranch(
  lineId: string,
  fromStationId: string,
  toStationId?: string,
): ResolvedBranch | AmbiguousBranchResult | null {
  const line = LINE_ROUTES[lineId];
  if (!line) {
    console.warn(`[resolveBranch] Unknown line: "${lineId}"`);
    return null;
  }

  // Find all routes that contain fromStationId (and optionally toStationId)
  const matches: MatchEntry[] = [];

  for (const direction of ['inbound', 'outbound'] as const) {
    for (const route of line[direction]) {
      const fromIdx = route.naptanIds.indexOf(fromStationId);
      if (fromIdx === -1) continue;

      if (toStationId !== undefined) {
        const toIdx = route.naptanIds.indexOf(toStationId);
        if (toIdx === -1) continue;
        // Ensure from comes before to in the route order
        if (fromIdx >= toIdx) continue;
        matches.push({ route, direction, fromIdx, toIdx });
      } else {
        matches.push({ route, direction, fromIdx });
      }
    }
  }

  if (matches.length === 0) {
    console.warn(`[resolveBranch] Station "${fromStationId}" not found on line "${lineId}"`);
    return null;
  }

  // Single match → resolved branch
  if (matches.length === 1) {
    return buildBranch(matches[0].route, matches[0].fromIdx, matches[0].direction);
  }

  // Multiple matches → find split station
  const { splitStationId, splitStationName } = findCommonSplitStation(matches, fromStationId);

  // Build all possible branches
  const possibleBranches: ResolvedBranch[] = matches.map(m =>
    buildBranch(m.route, m.fromIdx, m.direction)
  );

  // De-duplicate branches by branchId
  const uniqueBranches: ResolvedBranch[] = [];
  const seen = new Set<string>();
  for (const branch of possibleBranches) {
    if (!seen.has(branch.branchId)) {
      seen.add(branch.branchId);
      uniqueBranches.push(branch);
    }
  }

  if (uniqueBranches.length === 1) {
    return uniqueBranches[0];
  }

  return {
    possibleBranches: uniqueBranches,
    splitStationName,
    splitStationId,
  };
}
