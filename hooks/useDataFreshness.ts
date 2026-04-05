/**
 * useDataFreshness — Monitors data age and returns a freshness tier.
 * Fresh: < 90 seconds
 * Aging: 90s - 5 min
 * Stale: > 5 min
 * Re-evaluates every 30 seconds.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export type FreshnessTier = 'fresh' | 'aging' | 'stale';

interface DataFreshnessResult {
  tier: FreshnessTier;
  ageText: string;
  lastFetchTimestamp: number | null;
  setLastFetch: (timestamp: number) => void;
}

const FRESH_THRESHOLD = 90 * 1000;       // 90 seconds
const AGING_THRESHOLD = 5 * 60 * 1000;   // 5 minutes
const CHECK_INTERVAL = 30 * 1000;         // Re-evaluate every 30s

const formatAge = (ageMs: number): string => {
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return minutes + ' min ago';
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  return hours + ' hours ago';
};

export function useDataFreshness(): DataFreshnessResult {
  const [lastFetchTimestamp, setLastFetchTimestamp] = useState<number | null>(null);
  const [tier, setTier] = useState<FreshnessTier>('fresh');
  const [ageText, setAgeText] = useState<string>('Just now');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const evaluate = useCallback(() => {
    if (lastFetchTimestamp === null) {
      setTier('fresh');
      setAgeText('Just now');
      return;
    }

    const age = Date.now() - lastFetchTimestamp;
    setAgeText(formatAge(age));

    if (age < FRESH_THRESHOLD) {
      setTier('fresh');
    } else if (age < AGING_THRESHOLD) {
      setTier('aging');
    } else {
      setTier('stale');
    }
  }, [lastFetchTimestamp]);

  useEffect(() => {
    evaluate();

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(evaluate, CHECK_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [evaluate]);

  const setLastFetch = useCallback((timestamp: number) => {
    setLastFetchTimestamp(timestamp);
  }, []);

  return { tier, ageText, lastFetchTimestamp, setLastFetch };
}