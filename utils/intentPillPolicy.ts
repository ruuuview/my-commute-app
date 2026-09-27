// utils/intentPillPolicy.ts
// Pure policy for the contextual commute intent pill (Phase 3).
//
// WHAT: the "Heading to Work?" / "Heading Home?" pill fires inside
// commute windows (device local time) when the user is near the origin
// station, showing the live departure countdown toward the destination.
//
// This module is intentionally pure (no RN imports) so the rules are
// unit-testable. The hook (hooks/useIntentPill.ts) wires it to stores.
//
// DISMISS-LEARNING RULES (all documented here, implemented below):
//  1. A "dismissal" = the intent pill was shown and NOT tapped within its
//     display window. (The vendored shell has no onDismiss callback, so the
//     hook arms its own timer: shown + untapped for DISPLAY_MS => dismissal.)
//  2. Dismissals are timestamps (epoch ms), persisted in MMKV via
//     userPreferencesStore so learning survives restarts.
//  3. ROLLING 7-DAY WINDOW: only dismissals within the last 7 days count.
//     Older ones are pruned on every evaluation.
//  4. BACKOFF: 3 dismissals inside any rolling 7-day window => the intent
//     pill is suppressed for 7 days starting at the 3rd dismissal.
//  5. ENGAGEMENT RESETS LEARNING: a tap (user accepts the intent) clears
//     all dismissals and any active suppression.
//  6. ONCE-PER-WINDOW-PER-DAY: at most one intent pill per window
//     ('morning' | 'evening') per local calendar day, regardless of taps.

export type IntentWindow = 'morning' | 'evening';

// Commute windows in device-local minutes since midnight.
// Morning 07:00-10:00 -> destination = work. Evening 16:30-19:30 -> home.
// Start inclusive, end exclusive.
export const MORNING_WINDOW = { startMin: 7 * 60, endMin: 10 * 60 } as const;
export const EVENING_WINDOW = { startMin: 16 * 60 + 30, endMin: 19 * 60 + 30 } as const;

export const DISMISSAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // rolling 7 days

export const DISMISSALS_TO_SUPPRESS = 3;
export const SUPPRESSION_MS = 7 * 24 * 60 * 60 * 1000; // suppressed 7 days

/** Local calendar day key: 'YYYY-MM-DD' in device timezone. */
export function dayKeyFor(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Which intent window (if any) the given local time falls in. */
export function getIntentWindow(now: Date): IntentWindow | null {
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins >= MORNING_WINDOW.startMin && mins < MORNING_WINDOW.endMin) return 'morning';
  if (mins >= EVENING_WINDOW.startMin && mins < EVENING_WINDOW.endMin) return 'evening';
  return null;
}

/** Drop dismissals older than the rolling window. Pure. */
export function pruneDismissals(dismissals: number[], nowMs: number): number[] {
  return (dismissals ?? []).filter((t) => nowMs - t < DISMISSAL_WINDOW_MS);
}

export interface DismissalOutcome {
  dismissals: number[];
  suppressedUntil: number | null;
}

/**
 * Record one dismissal at nowMs. Returns the new persisted state.
 * Rule 4: reaching DISMISSALS_TO_SUPPRESS within the rolling window sets
 * suppressedUntil = nowMs + SUPPRESSION_MS.
 */
export function applyDismissal(
  dismissals: number[],
  suppressedUntil: number | null,
  nowMs: number,
): DismissalOutcome {
  const kept = pruneDismissals(dismissals, nowMs);
  kept.push(nowMs);
  let next: number | null = suppressedUntil;
  if (kept.length >= DISMISSALS_TO_SUPPRESS) {
    next = nowMs + SUPPRESSION_MS;
  }
  return { dismissals: kept, suppressedUntil: next };
}

/**
 * True when the pill must stay silent right now.
 * - Active suppression window (Rule 4), OR
 * - already fired for this window today (Rule 6).
 */
export function isIntentSuppressed(args: {
  dismissals: number[];
  suppressedUntil: number | null;
  lastFired: { morning: string | null; evening: string | null };
  window: IntentWindow;
  todayKey: string;
  nowMs: number;
}): boolean {
  const { suppressedUntil, lastFired, window, todayKey, nowMs } = args;
  if (suppressedUntil != null && nowMs < suppressedUntil) return true;
  if (lastFired[window] === todayKey) return true;
  return false;
}

/**
 * Geofence gate predicate. distanceM null = station has no known
 * coordinates -> cannot place the user -> do NOT fire (a nudge for a
 * station we cannot place is the false positive the geofence exists to
 * eliminate). Otherwise fire only within the island's single radius.
 */
export function passesGeofence(distanceM: number | null, radiusM: number): boolean {
  if (distanceM == null) return false;
  return distanceM <= radiusM;
}
