// frontend/hooks/useTflPoller.ts
// Primary Line Status Poller hook with jittered 45s scheduler.
//
// ── Operational Rationale ─────────────────────────────────────────────
// 1. Base Interval (45,000ms):
//    - Sample interval chosen to prevent phase slip against the 60s Railway worker
//      and 30s Vercel/Railway edge cache, guaranteeing fresh data delivery in <=45s.
// 2. Jitter (+/- 3,000ms -> 42s to 48s range):
//    - Randomly distributes cold starts and peak-hour request loads.
// 3. Timeout Budget:
//    - Frontend Abort: 12s (leaves headroom for network handoffs).
//    - Backend Upstream: 3.5s (fails over to stale cache on timeouts).

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

export type StaleState = null | 'offline' | 'tfl-error' | 'tfl-delayed';

const BASE_POLL_INTERVAL_MS = 45000;
const POLL_JITTER_MS = 3000;

export function useTflPoller(
  fetchData: (signal: AbortSignal) => Promise<{ status: number; lastUpdated?: string }>,
  hasCache: boolean = true
) {
  const [isLoading, setIsLoading] = useState(false);
  const [staleState, setStaleState] = useState<StaleState>(null);
  const [staleMinutes, setStaleMinutes] = useState(0);

  const lastSuccessfulFetch = useRef<number>(Date.now());
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchRef = useRef(fetchData);
  const hasCacheRef = useRef(hasCache);
  const staleStateRef = useRef(staleState);

  useEffect(() => {
    fetchRef.current = fetchData;
  }, [fetchData]);

  useEffect(() => {
    hasCacheRef.current = hasCache;
  }, [hasCache]);

  useEffect(() => {
    staleStateRef.current = staleState;
  }, [staleState]);

  const forceRefresh = useCallback(async () => {
    setIsLoading(true);
    let errorType: StaleState = null;
    let dataAgeMs = 0;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const meta = await fetchRef.current(controller.signal);
      clearTimeout(timeoutId);

      if (meta.status >= 400) {
        errorType = 'tfl-error';
      } else if (meta.lastUpdated) {
        const lastUpdatedTs = new Date(meta.lastUpdated).getTime();
        dataAgeMs = Date.now() - lastUpdatedTs;
        if (dataAgeMs > 600000) { // > 10 minutes
          errorType = 'tfl-delayed';
        }
      }

      if (!errorType) {
        lastSuccessfulFetch.current = Date.now();
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        errorType = 'tfl-error';
      } else {
        const netState = await NetInfo.fetch();
        if (!netState.isConnected) {
          errorType = 'offline';
        } else {
          errorType = 'tfl-error';
        }
      }
    } finally {
      setIsLoading(false);
    }

    if (errorType === 'tfl-delayed') {
      setStaleState('tfl-delayed');
      setStaleMinutes(Math.floor(dataAgeMs / 60000));
    } else if (errorType) {
      const timeSinceSuccess = Date.now() - lastSuccessfulFetch.current;
      if (!hasCacheRef.current || timeSinceSuccess > 180000) { // > 3 minutes or no cache
        setStaleState(errorType);
        setStaleMinutes(Math.floor(timeSinceSuccess / 60000));
      } else if (staleStateRef.current !== null) {
        setStaleState(errorType);
        setStaleMinutes(Math.floor(timeSinceSuccess / 60000));
      }
    } else {
      setStaleState(null);
      setStaleMinutes(0);
    }
  }, []);

  useEffect(() => {
    let isSubscribed = true;

    const stopPolling = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const scheduleNextPoll = () => {
      stopPolling();
      if (!isSubscribed) return;

      const jitter = Math.floor(Math.random() * (POLL_JITTER_MS * 2)) - POLL_JITTER_MS;
      const nextInterval = BASE_POLL_INTERVAL_MS + jitter;

      timeoutRef.current = setTimeout(async () => {
        if (!isSubscribed) return;
        await forceRefresh();
        scheduleNextPoll();
      }, nextInterval);
    };

    // Initial load
    forceRefresh().then(() => {
      if (isSubscribed) scheduleNextPoll();
    });

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        forceRefresh().then(() => {
          if (isSubscribed) scheduleNextPoll();
        });
      } else {
        stopPolling();
      }
    });

    return () => {
      isSubscribed = false;
      subscription.remove();
      stopPolling();
    };
  }, [forceRefresh]);

  return { forceRefresh, isLoading, staleState, staleMinutes };
}
