import { APP_CONFIG } from '../config/app.config';
import { resolveTflStopIds } from '../utils/resolveTflStopId';
import { normaliseLineId } from '../utils/normaliseLineId';
import { LINE_IDENTITY_COLORS } from '../constants/lineColors';

export interface NormalizedDeparture {
  lineId: string;
  lineName: string;
  lineColor: string;
  minutesAway: number;
  destination: string;
  platform: string;
  expectedArrival: string;
  towards?: string;
  via?: string;
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

// Abbreviations TfL uses that aren't self-explanatory
const VIA_EXPANSIONS: Record<string, string> = {
  'CX': 'Charing Cross',
  'Charing X': 'Charing Cross',
  'T4 Loop': 'Terminal 4 Loop',
};

export function extractViaText(towards?: string, platform?: string): string | undefined {
  // Check towards first (TfL's canonical source), then platform as fallback
  const source = towards || platform || '';
  const match = source.match(/\b(via\s+.+)/i);
  if (!match) return undefined;
  let via = match[1].trim();
  // Expand only non-obvious abbreviations
  for (const [abbr, full] of Object.entries(VIA_EXPANSIONS)) {
    via = via.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), full);
  }
  return via;
}

export function cleanPlatformName(platform: string): string {
  if (!platform) return '';
  return String(platform)
    .replace(/\b(Northbound|Southbound|Eastbound|Westbound)\b\s*[-–—]?\s*/gi, '')
    .replace(/Platform\s*/i, 'P')
    .replace(/\s*via\s+[a-z0-9'\s]+/gi, '')
    .replace(/\s*-\s*$/g, '')
    .trim();
}

export function cleanDestinationName(dest: string): string {
  if (!dest) return '';
  return String(dest)
    .replace(' Underground Station', '')
    .replace(' DLR Station', '')
    .replace(/\b(Northbound|Southbound|Eastbound|Westbound)\b\s*[-–—]?\s*/gi, '')
    .replace(/\s*via\s+[a-z0-9'\s]+/gi, '')
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

  // Client-side Direct TfL Fallback: if the backend is cold, rate-limited, or returns 0 rows,
  // query TfL StopPoint API directly from the client so departures always load immediately.
  if (allRaw.length === 0) {
    try {
      const directResponses = await Promise.all(
        resolvedIds.map(async id => {
          try {
            const res = await fetch(`https://api.tfl.gov.uk/StopPoint/${encodeURIComponent(id)}/Arrivals`, { signal: effectiveSignal });
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data) && data.length > 0) return data;
            }
          } catch {}

          // Rail stations fallback for Overground / Elizabeth / National Rail StopPoints
          if (id.startsWith('910G')) {
            try {
              const railRes = await fetch(`https://api.tfl.gov.uk/StopPoint/${encodeURIComponent(id)}/ArrivalDepartures`, { signal: effectiveSignal });
              if (railRes.ok) {
                const railData = await railRes.json();
                if (Array.isArray(railData)) return railData;
              }
            } catch {}
          }
          return null;
        })
      );
      directResponses.forEach(data => {
        if (Array.isArray(data)) {
          data.forEach(arr => {
            allRaw.push({
              line: arr.lineName || arr.lineId || 'Unknown',
              line_id: arr.lineId || '',
              lineId: arr.lineId || '',
              platform: arr.platformName || '',
              destination: arr.towards || arr.destinationName || '',
              expected_arrival: arr.expectedArrival || '',
              minutes_away: arr.timeToStation !== undefined ? Math.max(0, Math.floor(arr.timeToStation / 60)) : undefined,
              time_to_station: arr.timeToStation,
              mode: arr.modeName || '',
            });
          });
        }
      });
    } catch {
      // Ignore network errors in fallback
    }
  }

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
    const cleanedPlatform = cleanPlatformName(dep.platform);
    const cleanedDest = cleanDestinationName(dest);
    const key = `${dep.line}-${cleanedPlatform || cleanedDest}-${dueKey}`;

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

    const rawTowards = dep.towards || undefined;
    const rawPlatform = dep.platform || undefined;
    const via = extractViaText(rawTowards, rawPlatform);

    return {
      lineId: canonicalLineId,
      lineName: dep.line,
      lineColor: LINE_IDENTITY_COLORS[canonicalLineId] || dep.line_color || '#888',
      minutesAway: dep.calculatedMinutes!,
      destination: cleanDestinationName(dep.destination),
      platform: cleanPlatformName(dep.platform),
      expectedArrival: dep.expected_arrival || '',
      towards: rawTowards,
      via,
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
