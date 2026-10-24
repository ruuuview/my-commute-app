// utils/londonTime.ts
// Single source of truth for Europe/London wall-clock math.
//
// My Commute is a London-only product: "today" for silencing, once-per-day
// pills, and midnight rollovers must follow the London clock — never the
// device timezone (a traveller in New York must not have their silenced line
// unsilence at 7pm because the device thinks the day flipped).
//
// All math goes through Intl.DateTimeFormat with timeZone 'Europe/London',
// so results are correct across DST boundaries (BST ↔ GMT) and independent
// of the host/device timezone.

const londonDayParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const londonWallClockParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function partValue(parts: Intl.DateTimeFormatPart[], type: string): string {
  const found = parts.find((p) => p.type === type);
  if (!found) throw new Error(`[londonTime] Intl.DateTimeFormat missing '${type}' part`);
  return found.value;
}

/**
 * London calendar day key: 'YYYY-MM-DD' strictly in Europe/London,
 * regardless of the device timezone.
 */
export function getLondonDayKey(date: Date): string {
  const parts = londonDayParts.formatToParts(date);
  return `${partValue(parts, 'year')}-${partValue(parts, 'month')}-${partValue(parts, 'day')}`;
}

/**
 * The Europe/London wall clock of `atMs`, re-interpreted as UTC epoch ms.
 * londonOffsetMs(atMs) = londonWallClockAsUtcMs(atMs) - atMs.
 */
function londonWallClockAsUtcMs(atMs: number): number {
  const parts = londonWallClockParts.formatToParts(new Date(atMs));
  let hour = Number(partValue(parts, 'hour'));
  if (hour === 24) hour = 0; // some ICU builds emit '24' at midnight with hour12: false
  return Date.UTC(
    Number(partValue(parts, 'year')),
    Number(partValue(parts, 'month')) - 1,
    Number(partValue(parts, 'day')),
    hour,
    Number(partValue(parts, 'minute')),
    Number(partValue(parts, 'second'))
  );
}

/**
 * Exact epoch ms of the next Europe/London midnight strictly after the
 * London calendar day containing `date`.
 *
 * Computed by taking the London wall-clock date, adding one calendar day
 * (pure UTC date arithmetic — always safe), then converting that London
 * midnight back to epoch by fixed-point iteration on the London offset.
 * This is deliberately NOT `+86400000`: the boundary night of 25 Oct 2026
 * is 25 hours long (and 29 Mar 2026 is 23 hours long).
 */
export function getNextLondonMidnightMs(date: Date): number {
  const [y, m, d] = getLondonDayKey(date).split('-').map(Number);
  // Next London calendar day (date-only arithmetic, so UTC math is exact).
  const nextDay = new Date(Date.UTC(y, m - 1, d + 1));
  const midnightAsIfUtcMs = Date.UTC(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth(),
    nextDay.getUTCDate(),
    0,
    0,
    0
  );

  // epoch = midnightAsIfUtcMs - londonOffset(epoch). The offset is piecewise
  // constant and changes only at 01:00 UTC, so 3 iterations always converge.
  let epoch = midnightAsIfUtcMs;
  for (let i = 0; i < 3; i++) {
    const offsetMs = londonWallClockAsUtcMs(epoch) - epoch;
    epoch = midnightAsIfUtcMs - offsetMs;
  }
  return epoch;
}
