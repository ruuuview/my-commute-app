import { APP_CONFIG } from '../config/app.config';
import { resolveTflStopIds } from '../utils/resolveTflStopId';
import { normaliseLineId } from '../utils/normaliseLineId';
import { LINE_COLORS } from '../constants/lineColors';

export interface NormalizedDeparture {
  lineId: string;
  lineName: string;
  lineColor: string;
  minutesAway: number;
  destination: string;
  platform: string;
  expectedArrival: string;
  firstTrain?: string;
  lastTrain?: string;
  firstTrainDestination?: string;
  lastTrainDestination?: string;
  isNightTube?: boolean;
  // Legacy compatibility fields
  line: string;
  minutes_away: number;
  expected_arrival: string;
}

export interface NormalizedStationArrivals {
  id: string;
  name: string;
  departures: NormalizedDeparture[];
}

export function cleanPlatformName(platform: string): string {
  if (!platform) return '';
  return String(platform)
    .replace(/\b(Northbound|Southbound|Eastbound|Westbound)\b\s*[-–—]?\s*/gi, '')
    .replace(/Platform\s*/i, 'P')
    .trim();
}

export function cleanDestinationName(dest: string): string {
  if (!dest) return '';
  return String(dest)
    .replace(' Underground Station', '')
    .replace(' DLR Station', '')
    .replace(/\b(Northbound|Southbound|Eastbound|Westbound)\b\s*[-–—]?\s*/gi, '')
    .trim();
}

export async function fetchNormalizedStationArrivals(
  stationId: string,
  signal?: AbortSignal
): Promise<NormalizedStationArrivals> {
  const resolvedIds = resolveTflStopIds(stationId);

  // Internal 10s timeout when no external signal is provided
  const internalController = signal ? null : new AbortController();
  const internalTimeout = internalController
    ? setTimeout(() => internalController.abort(), 10_000)
    : null;
  const effectiveSignal = signal ?? (internalController?.signal ?? undefined);

  const hasInvalidId = resolvedIds.some(id => !id.startsWith('940GZZ') && !id.startsWith('910G'));
  if (hasInvalidId) {
    console.warn(`[apiService] WARNING: "${stationId}" resolved to non-NaPTAN ID: ${JSON.stringify(resolvedIds)}. Departures may fail to load.`);
  }
  const responses = await Promise.all(
    resolvedIds.map(id =>
      fetch(`${APP_CONFIG.BACKEND_URL}/api/stations/${id}`, { signal: effectiveSignal })
        .then(res => (res.ok ? res.json() : null))
        .catch(() => null)
    )
  );

  if (internalTimeout) clearTimeout(internalTimeout);

  const allRaw: any[] = [];
  let stationName = stationId;
  responses.forEach(sData => {
    if (sData) {
      if (sData.name && sData.name !== stationId) {
        stationName = sData.name;
      }
      if (Array.isArray(sData.departures)) {
        allRaw.push(...sData.departures);
      }
    }
  });

  const processed = allRaw.map((dep: any) => {
    const mins = dep.minutes_away !== undefined
      ? dep.minutes_away
      : dep.expected_arrival
      ? Math.max(0, Math.round((new Date(dep.expected_arrival).getTime() - Date.now()) / 60000))
      : null;
    return { ...dep, calculatedMinutes: mins };
  }).filter(dep => dep.calculatedMinutes !== null);

  const seen = new Set<string>();
  const deduped = processed.filter(dep => {
    const dest = String(dep.destination || '');
    if (dest.includes('DELETE') || dest.includes('⚠️')) return false;

    const mins = dep.calculatedMinutes!;
    const dueKey = mins <= 0 ? 'due' : mins;
    const key = `${dep.line}-${dep.platform || dep.destination}-${dueKey}`;

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => a.calculatedMinutes! - b.calculatedMinutes!);

  const departures: NormalizedDeparture[] = deduped.map((dep: any) => {
    const lineIdFromApi = dep.line_id || dep.lineId;
    const { cleanLineId } = normaliseLineId(dep.line);
    let canonicalLineId = (lineIdFromApi || cleanLineId || 'unknown')
      .toLowerCase()
      .replace(/\s*&\s*/g, '-')
      .replace(/\s+/g, '-');

    if (['liberty', 'lioness', 'mildmay', 'suffragette', 'weaver', 'windrush'].includes(canonicalLineId)) {
      canonicalLineId = 'overground';
    }

    // LINE_ID_ALIASES — Normalize TfL API lineId values (e.g. "elizabeth-line") to
    // the canonical short IDs the frontend uses everywhere (e.g. "elizabeth").
    // This prevents DepartureCard's line filter from silently killing departures
    // when the user's selectedLines store doesn't match the raw API response.
    const LINE_ID_ALIASES: Record<string, string> = {
      'elizabeth-line':      'elizabeth',
      'london-overground':   'overground',
      'waterloo-&-city':     'waterloo-city',
    };
    canonicalLineId = LINE_ID_ALIASES[canonicalLineId] ?? canonicalLineId;

    return {
      lineId: canonicalLineId,
      lineName: dep.line,
      lineColor: LINE_COLORS[canonicalLineId] || dep.line_color || '#888',
      minutesAway: dep.calculatedMinutes!,
      destination: cleanDestinationName(dep.destination),
      platform: cleanPlatformName(dep.platform),
      expectedArrival: dep.expected_arrival || '',
      firstTrain: dep.firstTrain || undefined,
      lastTrain: dep.lastTrain || undefined,
      firstTrainDestination: dep.firstTrainDestination || undefined,
      lastTrainDestination: dep.lastTrainDestination || undefined,
      isNightTube: dep.isNightTube ?? false,
      // Legacy compatibility fields
      line: dep.line,
      minutes_away: dep.calculatedMinutes!,
      expected_arrival: dep.expected_arrival || '',
    };
  });

  return {
    id: stationId,
    name: stationName,
    departures,
  };
}
