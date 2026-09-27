// __tests__/intentPillPolicy.test.ts
// Phase 3: unit tests for the intent pill's pure policy
// (utils/intentPillPolicy.ts) — window math, dismiss backoff, geofence
// gating, once-per-day guard.
import {
  getIntentWindow,
  dayKeyFor,
  pruneDismissals,
  applyDismissal,
  isIntentSuppressed,
  passesGeofence,
  DISMISSAL_WINDOW_MS,
  SUPPRESSION_MS,
} from '../utils/intentPillPolicy';

const DAY = 24 * 60 * 60 * 1000;

// Local-time constructor (policy uses device-local hours).
const at = (h: number, m: number) => new Date(2026, 8, 27, h, m, 0, 0);

describe('intentPillPolicy — commute windows', () => {
  it.each([
    [6, 59, null],
    [7, 0, 'morning'],
    [8, 30, 'morning'],
    [9, 59, 'morning'],
    [10, 0, null],
    [12, 0, null],
    [16, 29, null],
    [16, 30, 'evening'],
    [18, 0, 'evening'],
    [19, 29, 'evening'],
    [19, 30, null],
    [23, 0, null],
  ])('window at %i:%i is %s', (h, m, expected) => {
    expect(getIntentWindow(at(h, m))).toBe(expected);
  });

  it('dayKeyFor formats local YYYY-MM-DD', () => {
    expect(dayKeyFor(new Date(2026, 0, 5, 9, 0))).toBe('2026-01-05');
    expect(dayKeyFor(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
});

describe('intentPillPolicy — dismiss backoff', () => {
  const now = Date.now();

  it('fewer than 3 dismissals in the rolling window => no suppression', () => {
    const out = applyDismissal([now - DAY], null, now);
    expect(out.dismissals).toHaveLength(2); // 1 old + 1 new
    expect(out.suppressedUntil).toBeNull();
  });

  it('3rd dismissal within 7 days => suppressed for 7 days from the 3rd', () => {
    const out = applyDismissal([now - DAY, now - 2 * DAY], null, now);
    expect(out.dismissals).toHaveLength(3); // 2 old + 1 new
    expect(out.suppressedUntil).toBe(now + SUPPRESSION_MS);
  });

  it('dismissals older than 7 days do not count toward backoff', () => {
    const old = [now - 8 * DAY, now - 9 * DAY];
    const out = applyDismissal(old, null, now);
    expect(out.dismissals).toEqual([now]); // pruned
    expect(out.suppressedUntil).toBeNull();
  });

  it('pruneDismissals drops entries at/over the 7-day boundary', () => {
    const kept = pruneDismissals([now - DISMISSAL_WINDOW_MS - 1, now - DAY], now);
    expect(kept).toEqual([now - DAY]);
  });
});

describe('intentPillPolicy — suppression & once-per-day guard', () => {
  const now = Date.now();
  const base = {
    dismissals: [] as number[],
    suppressedUntil: null as number | null,
    lastFired: { morning: null as string | null, evening: null as string | null },
    window: 'morning' as const,
    todayKey: '2026-09-27',
    nowMs: now,
  };

  it('not suppressed when clean', () => {
    expect(isIntentSuppressed(base)).toBe(false);
  });

  it('suppressed while the 7-day backoff is active', () => {
    expect(isIntentSuppressed({ ...base, suppressedUntil: now + DAY })).toBe(true);
  });

  it('backoff expiry re-enables the pill', () => {
    expect(isIntentSuppressed({ ...base, suppressedUntil: now - 1000 })).toBe(false);
  });

  it('already fired this window today => suppressed', () => {
    expect(
      isIntentSuppressed({
        ...base,
        lastFired: { morning: '2026-09-27', evening: null },
      }),
    ).toBe(true);
  });

  it('fired yesterday => allowed again today', () => {
    expect(
      isIntentSuppressed({
        ...base,
        lastFired: { morning: '2026-09-26', evening: null },
      }),
    ).toBe(false);
  });

  it('fired for the other window today => this window still allowed', () => {
    expect(
      isIntentSuppressed({
        ...base,
        window: 'evening',
        lastFired: { morning: '2026-09-27', evening: null },
      }),
    ).toBe(false);
  });
});

describe('intentPillPolicy — geofence gating', () => {
  const RADIUS = 150;

  it('null distance (unknown coordinates) never fires', () => {
    expect(passesGeofence(null, RADIUS)).toBe(false);
  });

  it('fires at and inside the radius', () => {
    expect(passesGeofence(0, RADIUS)).toBe(true);
    expect(passesGeofence(150, RADIUS)).toBe(true);
    expect(passesGeofence(149.9, RADIUS)).toBe(true);
  });

  it('does not fire outside the radius', () => {
    expect(passesGeofence(150.1, RADIUS)).toBe(false);
    expect(passesGeofence(400, RADIUS)).toBe(false);
  });
});
