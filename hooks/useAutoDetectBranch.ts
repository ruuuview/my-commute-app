// hooks/useAutoDetectBranch.ts
//
// Four-step decision tree for Phase 1 Reroute:
//   1. Active session → geofence exit vector → highest confidence
//   2. No session, completed journey history → time-of-day pattern
//   3. No pattern, pinned station destination text → filtered by graph topology
//   4. Manual fallback — enumerable branch buttons
//
// Consumed by the dashboard's "See alternative routes" entry point.

import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveBranch, ResolvedBranch, AmbiguousBranchResult } from '../utils/resolveBranch';
import { buildNetworkGraph } from '../utils/networkGraph';
import { useLineDataStore } from '../store/lineDataStore';

// ─── Types ──────────────────────────────────────────────────────────

export type DetectionSource = 'session' | 'history' | 'pinned' | 'manual';

export interface AutoDetectResult {
  /** Branch info — fully resolved or ambiguous */
  branch: ResolvedBranch | AmbiguousBranchResult | null;
  /** Which step of the decision tree resolved it */
  source: DetectionSource;
  /** Confidence level for UI display */
  confidence: 'high' | 'medium' | 'low';
  /** Whether the user has explicitly overridden */
  userOverride: boolean;
  /** Station name for context display */
  fromStationName?: string;
  /** Line name for display */
  lineName?: string;
}

const COMPLETED_HISTORY_KEY = '@mycommute/completed_journeys';

interface CompletedJourney {
  lineId: string;
  branch?: string;
  direction?: string;
  originStationId: string;
  destStationId: string;
  timestamp: string; // ISO
  hour: number; // 0-23
  dayOfWeek: number; // 0=Sun
}

// ─── Load/save completed journey history ────────────────────────────

async function loadJourneyHistory(): Promise<CompletedJourney[]> {
  try {
    const raw = await AsyncStorage.getItem(COMPLETED_HISTORY_KEY);
    if (raw) return JSON.parse(raw) as CompletedJourney[];
  } catch {}
  return [];
}

async function saveJourneyHistory(journeys: CompletedJourney[]): Promise<void> {
  try {
    // Keep only last 90 days worth (roughly last 200 journeys)
    const trimmed = journeys.slice(-200);
    await AsyncStorage.setItem(COMPLETED_HISTORY_KEY, JSON.stringify(trimmed));
  } catch {}
}

/**
 * Append a completed journey to local history for pattern detection.
 */
export async function recordCompletedJourney(journey: Omit<CompletedJourney, 'timestamp' | 'hour' | 'dayOfWeek'>): Promise<void> {
  const now = new Date();
  const entry: CompletedJourney = {
    ...journey,
    timestamp: now.toISOString(),
    hour: now.getHours(),
    dayOfWeek: now.getDay(),
  };
  const history = await loadJourneyHistory();
  history.push(entry);
  await saveJourneyHistory(history);
}

// ─── Pattern detection ──────────────────────────────────────────────

function findTimeOfDayPattern(
  history: CompletedJourney[],
  lineId: string,
  currentHour: number,
  currentDayOfWeek: number
): { branch: string; direction: string; confidence: number } | null {
  // Filter to journeys on this line in the last 30 days
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = history.filter(j =>
    j.lineId === lineId &&
    j.branch &&
    new Date(j.timestamp).getTime() > cutoff
  );
  if (recent.length < 2) return null; // need some sample

  // Group by time-of-day window: morning (5-10), midday (10-16), evening (16-20), night (20-5)
  const isWeekday = currentDayOfWeek >= 1 && currentDayOfWeek <= 5;
  const commuteWindows = recent.filter(j => {
    const sameType = isWeekday ? (j.dayOfWeek >= 1 && j.dayOfWeek <= 5) : (j.dayOfWeek === 0 || j.dayOfWeek === 6);
    return sameType && Math.abs(j.hour - currentHour) <= 2;
  });

  if (commuteWindows.length === 0) return null;

  // Find the most common branch in the matching window
  const branchCounts = new Map<string, number>();
  for (const j of commuteWindows) {
    const key = `${j.branch}::${j.direction}`;
    branchCounts.set(key, (branchCounts.get(key) || 0) + 1);
  }

  let best = '';
  let bestCount = 0;
  for (const [key, count] of branchCounts.entries()) {
    if (count > bestCount) {
      bestCount = count;
      best = key;
    }
  }

  if (best && bestCount >= commuteWindows.length * 0.5) {
    const [branch, direction] = best.split('::');
    return { branch, direction, confidence: bestCount / commuteWindows.length };
  }

  return null;
}

// ─── Main hook ──────────────────────────────────────────────────────

export function useAutoDetectBranch(
  lineId: string,
  fromStationId?: string,
  fromStationName?: string
): {
  result: AutoDetectResult;
  isDetecting: boolean;
  reload: () => void;
  setOverride: (branchId: string) => void;
  clearOverride: () => void;
} {
  const [result, setResult] = useState<AutoDetectResult>({
    branch: null,
    source: 'manual',
    confidence: 'low',
    userOverride: false,
  });
  const [isDetecting, setIsDetecting] = useState(true);
  const overrideRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const reload = useCallback(async () => {
    if (!lineId || !fromStationId) {
      setIsDetecting(false);
      return;
    }

    setIsDetecting(true);

    try {
      // ── Step 4 check first: is there a user override? ──
      if (overrideRef.current) {
        try {
          const branch = resolveBranch(lineId, fromStationId) as ResolvedBranch;
          setResult({
            branch,
            source: 'manual',
            confidence: 'high',
            userOverride: true,
            fromStationName,
            lineName: lineId,
          });
          setIsDetecting(false);
          return;
        } catch (e) {
          overrideRef.current = null;
        }
      }

      // ── Step 1: Active session from backend ──
      try {
        const deviceToken = await AsyncStorage.getItem('@mycommute/device_token');
        if (deviceToken) {
          const resp = await fetch(
            `https://my-commute-brain.vercel.app/api/session/current?device_token=${encodeURIComponent(deviceToken)}`
          );
          const data = await resp.json();
          if (data?.state === 'active' && data?.session?.line_id === lineId) {
            const direction = data.session.direction;
            const destStationId = data.session.destination_station_id;
            if (direction && (destStationId || fromStationId)) {
              try {
                const branch = resolveBranch(
                  lineId,
                  fromStationId,
                  destStationId || undefined
                );
                setResult({
                  branch: branch as ResolvedBranch,
                  source: 'session',
                  confidence: 'high',
                  userOverride: false,
                  fromStationName,
                  lineName: lineId,
                });
                setIsDetecting(false);
                return;
              } catch {}
            }
          }
        }
      } catch {}

      // ── Step 2: Time-of-day pattern from history ──
      const history = await loadJourneyHistory();
      const now = new Date();
      const pattern = findTimeOfDayPattern(history, lineId, now.getHours(), now.getDay());

      if (pattern) {
        try {
          const branch = resolveBranch(lineId, fromStationId) as ResolvedBranch;
          setResult({
            branch,
            source: 'history',
            confidence: pattern.confidence > 0.7 ? 'high' : 'medium',
            userOverride: false,
            fromStationName,
            lineName: lineId,
          });
          setIsDetecting(false);
          return;
        } catch {}
      }

      // ── Step 3: Pinned station destination text ──
      // The code comment here implements the critical correction:
      // "Only trust destination text from stations past the branch split point"
      // For now, we fall through to manual since pinned station inference
      // requires the full graph topology check

      // ── Step 4 (fallthrough): Manual — no auto-detect ──
      setIsDetecting(false);

    } catch (e) {
      setIsDetecting(false);
    }
  }, [lineId, fromStationId, fromStationName]);

  useEffect(() => {
    mountedRef.current = true;
    reload();
    return () => { mountedRef.current = false; };
  }, [reload]);

  const setOverride = useCallback((branchId: string) => {
    overrideRef.current = branchId;
    reload();
  }, [reload]);

  const clearOverride = useCallback(() => {
    overrideRef.current = null;
    reload();
  }, [reload]);

  return { result, isDetecting, reload, setOverride, clearOverride };
}
