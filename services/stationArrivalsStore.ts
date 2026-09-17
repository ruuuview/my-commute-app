import { useState, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { fetchNormalizedStationArrivals, NormalizedDeparture } from './apiService';

export const FRESH_MS = 20_000;

export interface CachedArrivalEntry {
  departures: NormalizedDeparture[];
  fetchedAt: number;
}

// Module-level hoisted cache surviving component mount/unmount across mode switches
const arrivalsStore = new Map<string, CachedArrivalEntry>();
const activeListeners = new Map<string, Set<(arrivals: NormalizedDeparture[]) => void>>();
const inFlightRequests = new Map<string, Promise<NormalizedDeparture[]>>();

export function getCachedArrivalEntry(stationId: string): CachedArrivalEntry | undefined {
  return arrivalsStore.get(stationId);
}

export function getCachedArrivals(stationId: string): NormalizedDeparture[] | undefined {
  return arrivalsStore.get(stationId)?.departures;
}

export function setCachedArrivals(stationId: string, departures: NormalizedDeparture[]): void {
  arrivalsStore.set(stationId, {
    departures,
    fetchedAt: Date.now(),
  });
  const listeners = activeListeners.get(stationId);
  if (listeners) {
    listeners.forEach(cb => cb(departures));
  }
}

interface StationSubscription {
  count: number;
  interval?: ReturnType<typeof setInterval>;
  controller?: AbortController;
  appStateSub?: { remove: () => void };
  mountTimer?: ReturnType<typeof setTimeout>;
}

const activeSubscriptions = new Map<string, StationSubscription>();

export function getActiveSubscriptionCount(stationId: string): number {
  return activeSubscriptions.get(stationId)?.count ?? 0;
}

export function resetArrivalsStoreForTesting(): void {
  for (const [, sub] of activeSubscriptions.entries()) {
    if (sub.mountTimer) clearTimeout(sub.mountTimer);
    if (sub.interval) clearInterval(sub.interval);
    sub.controller?.abort();
    sub.appStateSub?.remove();
  }
  activeSubscriptions.clear();
  arrivalsStore.clear();
  inFlightRequests.clear();
  activeListeners.clear();
}

export function deleteCachedArrivals(stationId: string): void {
  const current = activeSubscriptions.get(stationId);
  if (current) {
    if (current.mountTimer) clearTimeout(current.mountTimer);
    if (current.interval) clearInterval(current.interval);
    current.controller?.abort();
    current.appStateSub?.remove();
    activeSubscriptions.delete(stationId);
  }
  arrivalsStore.delete(stationId);
  inFlightRequests.delete(stationId);
  activeListeners.delete(stationId);
}

/**
 * Deterministic jitter based on stationId string hash (0 - 1499ms).
 * De-synchronizes network bursts when multiple cards mount or exit edit mode together.
 */
function getStationJitterMs(stationId: string): number {
  let hash = 0;
  for (let i = 0; i < stationId.length; i++) {
    hash = ((hash << 5) - hash + stationId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 1500;
}

/**
 * Single-flight fetch mechanism:
 * 1. Returns existing data immediately if within FRESH_MS.
 * 2. Reuses in-flight Promise if request is already ongoing.
 * 3. Otherwise executes fetch, updates store, and cleans in-flight map.
 */
export async function fetchOnce(
  stationId: string,
  signal?: AbortSignal,
  force = false
): Promise<NormalizedDeparture[]> {
  const existing = arrivalsStore.get(stationId);
  const now = Date.now();

  if (!force && existing && now - existing.fetchedAt < FRESH_MS) {
    return existing.departures;
  }

  const inFlight = inFlightRequests.get(stationId);
  if (inFlight) {
    return inFlight;
  }

  const requestPromise = (async () => {
    try {
      const data = await fetchNormalizedStationArrivals(stationId, signal);
      if (!signal?.aborted) {
        setCachedArrivals(stationId, data.departures);
      }
      return data.departures;
    } catch (err) {
      if (!signal?.aborted) {
        console.log('[stationArrivalsStore] fetch error for', stationId, err);
      }
      return existing?.departures ?? [];
    } finally {
      inFlightRequests.delete(stationId);
    }
  })();

  inFlightRequests.set(stationId, requestPromise);
  return requestPromise;
}

/**
 * Hook providing station arrivals with zero-flash remount and single-flight guarantees.
 * - Initial state reads synchronously from module store: remounts display last-known data instantly.
 * - `loading` is derived from data absence: `true` ONLY on initial cold launch before any data exists.
 * - Polling effect depends strictly on `stationId` — independent of edit mode or list position.
 * - Staggered mount jitter prevents API burst storms.
 * - AppState resume automatically refreshes stale data (>20s) without showing a loading spinner.
 */
export interface UseStationArrivalsOptions {
  enabled?: boolean;
}

/**
 * Hook providing station arrivals with zero-flash remount and single-flight guarantees.
 * - Initial state reads synchronously from module store: remounts display last-known data instantly.
 * - `loading` is derived from data absence: `true` ONLY on initial cold launch before any data exists.
 * - Polling effect depends on `stationId` and `enabled` — pauses during edit mode to prevent re-renders.
 * - Staggered mount jitter prevents API burst storms.
 * - AppState resume automatically refreshes stale data (>20s) without showing a loading spinner.
 */
export function subscribeToStation(
  stationId: string,
  fetchFn: (signal?: AbortSignal, force?: boolean) => Promise<void>
): () => void {
  let sub = activeSubscriptions.get(stationId);
  if (!sub) {
    const controller = new AbortController();
    const jitterMs = getStationJitterMs(stationId);

    // Initial mount fetch with jitter to prevent stampedes (only if stale or absent)
    const mountTimer = setTimeout(() => {
      void fetchFn(controller.signal);
    }, jitterMs);

    // 30-second silent background interval
    const interval = setInterval(() => {
      void fetchFn(controller.signal, true);
    }, 30_000);

    // AppState listener: refresh if entry is stale when returning to foreground
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const entry = arrivalsStore.get(stationId);
        if (!entry || Date.now() - entry.fetchedAt >= FRESH_MS) {
          void fetchFn(controller.signal, true);
        }
      }
    };
    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    sub = {
      count: 1,
      interval,
      controller,
      appStateSub,
      mountTimer,
    };
    activeSubscriptions.set(stationId, sub);
  } else {
    sub.count += 1;
  }

  return () => {
    const current = activeSubscriptions.get(stationId);
    if (!current) return;
    current.count -= 1;
    if (current.count <= 0) {
      if (current.mountTimer) clearTimeout(current.mountTimer);
      if (current.interval) clearInterval(current.interval);
      current.controller?.abort();
      current.appStateSub?.remove();
      activeSubscriptions.delete(stationId);
    }
  };
}

export function useStationArrivals(stationId: string, options?: UseStationArrivalsOptions) {
  const enabled = options?.enabled ?? true;
  const [arrivals, setArrivals] = useState<NormalizedDeparture[] | undefined>(() =>
    arrivalsStore.get(stationId)?.departures
  );

  // Sync state if another instance or background refresh updated store
  useEffect(() => {
    let listeners = activeListeners.get(stationId);
    if (!listeners) {
      listeners = new Set();
      activeListeners.set(stationId, listeners);
    }
    const updateHandler = (newArrivals: NormalizedDeparture[]) => {
      setArrivals(newArrivals);
    };
    listeners.add(updateHandler);

    return () => {
      const set = activeListeners.get(stationId);
      if (set) {
        set.delete(updateHandler);
        if (set.size === 0) {
          activeListeners.delete(stationId);
        }
      }
    };
  }, [stationId]);

  const executeFetch = useCallback(
    async (signal?: AbortSignal, force = false) => {
      await fetchOnce(stationId, signal, force);
    },
    [stationId]
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    return subscribeToStation(stationId, executeFetch);
  }, [enabled, executeFetch, stationId]);

  return {
    arrivals: arrivals ?? [],
    loading: arrivals === undefined,
    refetch: () => executeFetch(undefined, true),
  };
}
