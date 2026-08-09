import { createMMKV } from 'react-native-mmkv';
import { resolveTflStopId } from '../utils/resolveTflStopId';
import { APP_CONFIG } from '../config/app.config';

const journeyCache = createMMKV({ id: 'live-journey-penalty-cache' });
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL
const API_TIMEOUT_MS = 3000; // 3-second strict AbortController timeout

interface CacheEntry {
  extraTimeMinutes: number;
  timestamp: number;
}

export interface LiveJourneyPenaltyResult {
  extraTimeMinutes: number;
  isLive: boolean;
}

export async function fetchLiveJourneyPenalty({
  originStationId,
  destinationTerminus,
  lineId,
}: {
  originStationId?: string;
  destinationTerminus?: string;
  lineId?: string;
}): Promise<LiveJourneyPenaltyResult | null> {
  if (!originStationId || !destinationTerminus) return null;

  const originNaPTAN = resolveTflStopId(originStationId);
  const destNaPTAN = resolveTflStopId(destinationTerminus) || destinationTerminus;
  const cacheKey = `penalty_${originNaPTAN}_${destNaPTAN}_${lineId || ''}`;

  // 1. Check local cache (5 min TTL)
  const cachedStr = journeyCache.getString(cacheKey);
  if (cachedStr) {
    try {
      const entry: CacheEntry = JSON.parse(cachedStr);
      if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
        return { extraTimeMinutes: entry.extraTimeMinutes, isLive: true };
      }
    } catch {
      // Ignore cache parse error
    }
  }

  // 2. Fetch live Journey Planner API with 3s timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const url = `${APP_CONFIG.BACKEND_URL}/api/journey-planner`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_station: originNaPTAN,
        to_station: destNaPTAN,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;
    const data = await response.json();

    if (data?.journeys && data.journeys.length > 0) {
      const liveDuration = data.journeys[0].duration;
      // Standard baseline duration from data or scheduled estimate
      const baselineDuration = data.journeys[0].standardDuration ?? Math.max(10, liveDuration - 7);
      const extraTimeMinutes = Math.max(1, Math.round(liveDuration - baselineDuration));

      // Cache result
      const entry: CacheEntry = { extraTimeMinutes, timestamp: Date.now() };
      journeyCache.set(cacheKey, JSON.stringify(entry));

      return { extraTimeMinutes, isLive: true };
    }
  } catch {
    clearTimeout(timeoutId);
    // Network failure or 3s timeout -> return null to signal graceful fallback
    return null;
  }

  return null;
}
