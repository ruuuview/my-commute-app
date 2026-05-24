import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

export type StaleState = null | 'offline' | 'tfl-error' | 'tfl-delayed';

export function useTflPoller(fetchData: (signal: AbortSignal) => Promise<{ status: number; lastUpdated?: string }>) {
  const [isLoading, setIsLoading] = useState(false);
  const [staleState, setStaleState] = useState<StaleState>(null);
  const [staleMinutes, setStaleMinutes] = useState(0);

  const lastSuccessfulFetch = useRef<number>(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const forceRefresh = useCallback(async () => {
    setIsLoading(true);
    let errorType: StaleState = null;
    let dataAgeMs = 0;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const meta = await fetchData(controller.signal);
      clearTimeout(timeoutId);

      if (meta.status >= 500) {
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
      if (timeSinceSuccess > 180000) { // > 3 minutes
        setStaleState(errorType);
        setStaleMinutes(Math.floor(timeSinceSuccess / 60000));
      } else if (staleState !== null) {
        setStaleState(errorType);
        setStaleMinutes(Math.floor(timeSinceSuccess / 60000));
      }
    } else {
      setStaleState(null);
      setStaleMinutes(0);
    }
  }, [fetchData, staleState]);

  useEffect(() => {
    forceRefresh();

    const startPolling = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        forceRefresh();
      }, 90000);
    };

    const stopPolling = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };

    startPolling();

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        forceRefresh();
        startPolling();
      } else {
        stopPolling();
      }
    });

    return () => {
      subscription.remove();
      stopPolling();
    };
  }, [forceRefresh]);

  return { forceRefresh, isLoading, staleState, staleMinutes };
}
