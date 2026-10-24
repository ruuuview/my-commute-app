// utils/__tests__/londonTime.test.ts
// Europe/London wall-clock primitives. All assertions must hold regardless of
// the device/test-runner timezone (keys are derived strictly via
// Intl.DateTimeFormat with timeZone 'Europe/London').
import { getLondonDayKey, getNextLondonMidnightMs } from '../londonTime';

const londonParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** Render an epoch ms back as London wall-clock parts for wall-clock-truth assertions. */
function asLondon(ms: number): { dayKey: string; hour: number; minute: number } {
  const parts = londonParts.formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0; // some ICU builds emit '24' at midnight with hour12:false
  return {
    dayKey: `${get('year')}-${get('month')}-${get('day')}`,
    hour,
    minute: Number(get('minute')),
  };
}

describe('getLondonDayKey', () => {
  it('returns YYYY-MM-DD strictly in Europe/London regardless of device tz', () => {
    // 02:00 UTC in January is still yesterday in US timezones, but already
    // 2026-01-05 in London — the key must follow London, not the device.
    expect(getLondonDayKey(new Date('2026-01-05T02:00:00Z'))).toBe('2026-01-05');
    // 23:30 UTC in June is already 00:30 BST the NEXT day in London.
    expect(getLondonDayKey(new Date('2026-06-30T23:30:00Z'))).toBe('2026-07-01');
    // A UTC noon is unambiguously the same date in London.
    expect(getLondonDayKey(new Date('2026-10-24T12:00:00Z'))).toBe('2026-10-24');
  });

  it('keys the autumn DST boundary date correctly (25 Oct 2026)', () => {
    // 23:30Z on 24 Oct = 00:30 BST on 25 Oct in London.
    expect(getLondonDayKey(new Date('2026-10-24T23:30:00Z'))).toBe('2026-10-25');
    // 23:30Z on 25 Oct = 23:30 GMT on 25 Oct in London (still the same London day).
    expect(getLondonDayKey(new Date('2026-10-25T23:30:00Z'))).toBe('2026-10-25');
  });
});

describe('getNextLondonMidnightMs', () => {
  it('returns the exact epoch of the next London midnight in winter (GMT == UTC)', () => {
    const next = getNextLondonMidnightMs(new Date('2026-01-05T10:00:00Z'));
    expect(next).toBe(Date.UTC(2026, 0, 6, 0, 0, 0));
    const wall = asLondon(next);
    expect(wall).toEqual({ dayKey: '2026-01-06', hour: 0, minute: 0 });
  });

  it('returns the exact epoch of the next London midnight in summer (BST == UTC+1)', () => {
    const next = getNextLondonMidnightMs(new Date('2026-06-30T12:00:00Z'));
    expect(next).toBe(Date.UTC(2026, 5, 30, 23, 0, 0)); // 1 July 00:00 BST
    const wall = asLondon(next);
    expect(wall).toEqual({ dayKey: '2026-07-01', hour: 0, minute: 0 });
  });

  it('is exact across the BST→GMT boundary on 25 Oct 2026', () => {
    // Verified ground truth: 2026-10-25 00:00 Europe/London (still BST, UTC+1)
    // is 2026-10-24T23:00:00.000Z = 1792882800000 ms. (The value 1761523200000
    // sometimes quoted is the 2025 boundary, 2025-10-27 00:00 UTC — wrong year.)
    const next = getNextLondonMidnightMs(new Date('2026-10-24T11:00:00Z')); // 12:00 BST on the 24th
    expect(next).toBe(1792882800000);
    const wall = asLondon(next);
    expect(wall).toEqual({ dayKey: '2026-10-25', hour: 0, minute: 0 });
  });

  it('does NOT naively add 86400000 — the boundary night is 25 hours long', () => {
    const midnight25 = getNextLondonMidnightMs(new Date('2026-10-24T11:00:00Z'));
    // From midday on the 25th (GMT), next midnight is 26 Oct 00:00 GMT.
    const midnight26 = getNextLondonMidnightMs(new Date('2026-10-25T12:00:00Z'));
    const wall26 = asLondon(midnight26);
    expect(wall26).toEqual({ dayKey: '2026-10-26', hour: 0, minute: 0 });
    // Clocks fall back at 02:00 BST → 01:00 GMT, so 25 Oct is 25 hours long.
    expect(midnight26 - midnight25).toBe(25 * 60 * 60 * 1000);
    expect(midnight26).not.toBe(midnight25 + 86400000);
  });

  it('is exact across the GMT→BST spring boundary on 29 Mar 2026', () => {
    // 29 Mar 2026 clocks spring forward; 29 Mar is 23 hours long.
    const midnight29 = getNextLondonMidnightMs(new Date('2026-03-28T12:00:00Z'));
    expect(asLondon(midnight29)).toEqual({ dayKey: '2026-03-29', hour: 0, minute: 0 });
    const midnight30 = getNextLondonMidnightMs(new Date('2026-03-29T12:00:00Z'));
    expect(asLondon(midnight30)).toEqual({ dayKey: '2026-03-30', hour: 0, minute: 0 });
    expect(midnight30 - midnight29).toBe(23 * 60 * 60 * 1000);
  });
});
