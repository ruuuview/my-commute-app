// utils/groupStationDepartures.ts
//
// Unified data-processing utility that maps raw arrival arrays into a type-safe
// `StationLineData[]` structure. Consolidates the duplicate parsing loops that
// previously lived inside MyCommuteDashboard.tsx (poller) and
// StationDetailModal.tsx (manual refresh).
//
// Key invariant: this utility NEVER fabricates timetable values. If the backend
// payload does not explicitly supply `firstTrain` / `lastTrain` (or their
// destination companions), those fields are left `undefined` so the consuming
// modal can suppress the line-card footer element entirely.

import { normaliseLineId } from './normaliseLineId';
import { LINE_COLORS } from '../constants/lineColors';
import type { StationLineData, ArrivalRow } from '../store/stationDataStore';

// Lines that operate a Night Tube service on Friday & Saturday nights.
const NIGHT_TUBE_LINES = ['central', 'jubilee', 'northern', 'piccadilly', 'victoria'];

const STATION_SUFFIX_REGEX = /\s*(?:Underground Station|Elizabeth line Station|Overground Station|DLR Station|Rail Station|Station)$/i;

function isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 5 || day === 6;
}

function cleanDestination(raw: string): string {
  return String(raw || '').replace(STATION_SUFFIX_REGEX, '').trim();
}

function resolveBranchName(dep: any): string | undefined {
  if (dep.branchName) return dep.branchName;
  if (dep.platform) {
    const platformLower = String(dep.platform).toLowerCase();
    if (platformLower.includes('via bank')) return 'via Bank';
    if (platformLower.includes('via charing cross')) return 'via Charing Cross';
    if (platformLower.includes('via city branch')) return 'via City';
  }
  return undefined;
}

/**
 * Deduplicate, sort, and group a flat array of raw TfL departure objects into a
 * type-safe `StationLineData[]` keyed by line.
 *
 * @param rawDepartures Flat array of raw departure objects as returned by the
 *   `/api/stations/:id` backend endpoint (already flattened across all
 *   resolved NaPTAN IDs for a station).
 * @returns Grouped & sorted line data. Timetable fields (`firstTrain`,
 *   `lastTrain`, `firstTrainDestination`, `lastTrainDestination`) are only
 *   populated when the backend payload explicitly supplies them.
 */
export function groupStationDepartures(rawDepartures: any[]): StationLineData[] {
  // ── 1. Filter malformed / sentinel destinations ──────────────────────────
  const filtered = rawDepartures.filter(dep => {
    const dest = String(dep?.destination || '');
    if (dest.includes('DELETE') || dest.includes('⚠️')) return false;
    return true;
  });

  // ── 2. Deduplicate by line + destination + arrival key ───────────────────
  const seenKeys = new Set<string>();
  const deduped: any[] = [];
  for (const dep of filtered) {
    const key = `${dep.line}-${dep.destination}-${dep.minutes_away ?? dep.expected_arrival}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      deduped.push(dep);
    }
  }

  // ── 3. Sort by minutes away ascending (soonest first) ────────────────────
  deduped.sort((a, b) => (a.minutes_away || 0) - (b.minutes_away || 0));

  // ── 4. Group into StationLineData keyed by normalised lineId ─────────────
  const groupedLines: Record<string, StationLineData> = {};
  const weekend = isWeekend();

  for (const dep of deduped) {
    const { lineId, cleanLineId } = normaliseLineId(dep.line);

    if (!groupedLines[lineId]) {
      groupedLines[lineId] = {
        lineId,
        lineName: dep.line,
        lineColor: LINE_COLORS[cleanLineId] || '#888',
        // Timetable fields — only from the backend payload, never fabricated.
        firstTrain: dep.firstTrain,
        lastTrain: dep.lastTrain,
        firstTrainDestination: dep.firstTrainDestination,
        lastTrainDestination: dep.lastTrainDestination,
        isNightTube: dep.isNightTube !== undefined ? dep.isNightTube : (NIGHT_TUBE_LINES.includes(lineId) && weekend),
        arrivals: [],
      };
    }

    const arrival: ArrivalRow = {
      minutesAway: dep.minutes_away,
      destination: cleanDestination(dep.destination),
      expectedArrival: dep.expected_arrival,
      branchName: resolveBranchName(dep),
      platform: dep.platform || '',
    };

    groupedLines[lineId].arrivals.push(arrival);
  }

  return Object.values(groupedLines);
}
