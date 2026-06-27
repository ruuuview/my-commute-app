import { StationLineData, ArrivalRow } from '../store/stationDataStore';
import { LINE_COLORS } from '../constants/lineColors';
import { normaliseLineId } from './normaliseLineId';

// ─── Raw TfL API format ───────────────────────────────────────────

export interface CleanTrainData {
  id: string;
  expectedArrival: string;
  timeToStation: number;
  currentLocation: string;
  towards?: string;
}

export interface TflArrivalRow {
  id: string;
  lineId: string;
  lineName: string;
  destinationName: string;
  platformName: string;
  expectedArrival: string;
  timeToStation: number;
  currentLocation: string;
  towards?: string;
  firstTrain?: string;
  lastTrain?: string;
}

export interface CappedStationLineData extends Omit<StationLineData, 'trains' | 'arrivals' | 'lineColor'> {
  routeColor: string;
  trains: CleanTrainData[];
}

// ─── TfL-format grouping (unchanged) ──────────────────────────────

export function groupStationDepartures(arrivals: TflArrivalRow[]): CappedStationLineData[] {
  if (!arrivals || arrivals.length === 0) return [];

  const sortedArrivals = [...arrivals]
    .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i)
    .sort((a, b) => a.timeToStation - b.timeToStation);

  const groups: { [key: string]: TflArrivalRow[] } = {};
  sortedArrivals.forEach(arrival => {
    const groupKey = `${arrival.lineId}-${arrival.destinationName}`;
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(arrival);
  });

  // Strictly sort each group chronologically before the slice cap
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => a.timeToStation - b.timeToStation);
  }

  const formattedLines: CappedStationLineData[] = Object.keys(groups).map(key => {
    const rawTrains = groups[key];
    const firstTrain = rawTrains[0];
    const normalisedLine = normaliseLineId(firstTrain.lineId);

    return {
      lineId: firstTrain.lineId,
      lineName: firstTrain.lineName,
      destinationName: firstTrain.destinationName,
      platformName: firstTrain.platformName,
      routeColor: LINE_COLORS[normalisedLine.cleanLineId] || '#FFFFFF',
      trains: rawTrains.slice(0, 3).map(t => ({
        id: t.id,
        expectedArrival: t.expectedArrival,
        timeToStation: t.timeToStation,
        currentLocation: t.currentLocation,
        towards: t.towards,
      })),
      firstTrain: firstTrain.firstTrain || undefined,
      lastTrain: firstTrain.lastTrain || undefined,
    };
  });

  return formattedLines;
}

// ─── Backend API normaliser ───────────────────────────────────────
//
// Converts our backend's snake_case payload into StationLineData[]
// suitable for storing in useStationDataStore.
//
// Backend shape:
//   { line, minutes_away, expected_arrival, destination, platform, branchName }

const TRAINS_PER_ROUTE = 3;

function deduplicateBackendArrivals(raw: any[]): any[] {
  const seenKeys = new Set<string>();
  const result: any[] = [];

  for (const dep of raw) {
    const dest = String(dep.destination || '');
    if (dest.includes('DELETE') || dest.includes('⚠️')) continue;

    const key = `${dep.line}-${dest}-${dep.minutes_away ?? dep.expected_arrival}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      result.push(dep);
    }
  }

  return result;
}

function normaliseDestination(raw: string): string {
  return String(raw || '')
    .replace(' Underground Station', '')
    .replace(' DLR Station', '')
    .replace(' Elizabeth line Station', '')
    .replace(' Overground Station', '')
    .replace(' Rail Station', '')
    .replace(' Station', '')
    .trim();
}

function inferBranchName(dep: any): string | undefined {
  if (dep.branchName) return dep.branchName;
  if (dep.platform) {
    const p = dep.platform.toLowerCase();
    if (p.includes('via bank')) return 'via Bank';
    if (p.includes('via charing cross')) return 'via Charing Cross';
    if (p.includes('via city branch')) return 'via City';
  }
  return undefined;
}

/**
 * processStationArrivals — the single replacement for the duplicated
 * dedup/sort/group logic that lived in MyCommuteDashboard.tsx and
 * StationDetailModal.tsx.
 *
 * Accepts a raw backend arrival array (snake_case) and returns
 * StationLineData[] suitable for useStationDataStore.
 *
 * Key behavioural changes:
 *  • Groups by lineId + destinationName (one section per destination direction)
 *  • Caps each group at TRAINS_PER_ROUTE (3) arrivals
 *  • NEVER fabricates firstTrain / lastTrain values — only passes through
 *    real data from the payload.
 */
export function processStationArrivals(
  backendArrivals: any[],
  stationId?: string,
): StationLineData[] {
  if (!backendArrivals || backendArrivals.length === 0) return [];

  // 1. Deduplicate
  const deduped = deduplicateBackendArrivals(backendArrivals);

  // 2. Sort by soonest arrival
  deduped.sort((a, b) => (a.minutes_away || 0) - (b.minutes_away || 0));

  // 3. Group by line + destination
  const groups: Record<string, any[]> = {};

  for (const dep of deduped) {
    const { lineId } = normaliseLineId(dep.line);
    const dest = normaliseDestination(dep.destination);
    const groupKey = `${lineId}::${dest}`;

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push({ ...dep, _lineId: lineId, _dest: dest });
  }

  // 4. Strictly sort each group chronologically before the slice cap
  for (const groupKey of Object.keys(groups)) {
    groups[groupKey].sort((a, b) => (a.minutes_away || 0) - (b.minutes_away || 0));
  }

  // 5. Build StationLineData entries
  const sortedLineKeys = Object.keys(groups).sort();

  // Collect lines in a deterministic order for stable rendering
  const lineOrder = new Map<string, StationLineData>();

  for (const groupKey of sortedLineKeys) {
    const entries = groups[groupKey];
    const first = entries[0];
    const { lineId, cleanLineId } = normaliseLineId(first.line);
    const lineColor = LINE_COLORS[cleanLineId] || '#888';

    // Cap arrivals to TRAINS_PER_ROUTE
    const cappedArrivals = entries.slice(0, TRAINS_PER_ROUTE);

    const branchName = inferBranchName(first);

    const arrivalRows: ArrivalRow[] = cappedArrivals.map((entry: any) => ({
      minutesAway: entry.minutes_away ?? 0,
      destination: entry._dest,
      expectedArrival: entry.expected_arrival || '',
      branchName: branchName,
      platform: entry.platform || '',
    }));

    // Group by destination within each line — if there's already a
    // line entry, append to its arrivals rather than creating a new one
    // (one line block, multiple destination rows inside)
    if (lineOrder.has(lineId)) {
      const existing = lineOrder.get(lineId)!;
      existing.arrivals.push(...arrivalRows);
    } else {
      const entry: StationLineData = {
        lineId,
        lineName: first.line,
        lineColor,
        // Only pass through real firstTrain/lastTrain — NO synthetic fallback
        firstTrain: first.firstTrain || undefined,
        lastTrain: first.lastTrain || undefined,
        firstTrainDestination: first.firstTrainDestination || undefined,
        lastTrainDestination: first.lastTrainDestination || undefined,
        isNightTube: first.isNightTube !== undefined ? first.isNightTube : undefined,
        arrivals: arrivalRows,
      };
      lineOrder.set(lineId, entry);
    }
  }

  return Array.from(lineOrder.values());
}
