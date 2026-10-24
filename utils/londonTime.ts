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

/**
 * Returns the minutes elapsed since midnight (0..1439) strictly in
 * Europe/London wall-clock time, regardless of host/device timezone.
 */
export function getLondonWallClockMinutes(date: Date): number {
  const parts = londonWallClockParts.formatToParts(date);
  let hour = Number(partValue(parts, 'hour'));
  if (hour === 24) hour = 0;
  const minute = Number(partValue(parts, 'minute'));
  return hour * 60 + minute;
}

/**
 * Returns the day of the week (0=Sunday .. 6=Saturday) strictly in
 * Europe/London wall-clock time, regardless of host/device timezone.
 */
export function getLondonWeekday(date: Date): number {
  const [y, m, d] = getLondonDayKey(date).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Parse 'HH:MM' into minutes since midnight (0..1439); null when malformed. */
export function parseHHMM(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Converts a specific London wall-clock calendar moment (year, month 1-12,
 * day, hour 0-23, minute 0-59) to its exact UTC epoch ms, resolving DST offsets
 * accurately.
 */
export function londonWallClockTimeToEpochMs(
  year: number,
  month1Based: number,
  day: number,
  hour: number,
  minute: number
): number {
  const asIfUtcMs = Date.UTC(year, month1Based - 1, day, hour, minute, 0, 0);
  let epoch = asIfUtcMs;
  for (let i = 0; i < 3; i++) {
    const offsetMs = londonWallClockAsUtcMs(epoch) - epoch;
    epoch = asIfUtcMs - offsetMs;
  }
  return epoch;
}

/**
 * Lift boundary for a manual shush set at setMs (epoch ms): the NEXT
 * alertWindowStart strictly after the set moment, computed entirely in
 * Europe/London wall-clock time. When no alert window is configured (or
 * alertWindowStart is unparseable), lifts at the next London midnight.
 * Independent of the device timezone — pure and testable.
 */
export function manualShushLiftTimeMs(
  setMs: number,
  alertWindowStart: string | null | undefined
): number {
  const setDate = new Date(setMs);
  const startMin = parseHHMM(alertWindowStart);
  if (startMin != null) {
    const currentMin = getLondonWallClockMinutes(setDate);
    const [y, m, d] = getLondonDayKey(setDate).split('-').map(Number);
    const targetHour = Math.floor(startMin / 60);
    const targetMinute = startMin % 60;
    if (startMin > currentMin) {
      // Later today in London
      return londonWallClockTimeToEpochMs(y, m, d, targetHour, targetMinute);
    }
    // Tomorrow in London
    const nextDay = new Date(Date.UTC(y, m - 1, d + 1));
    return londonWallClockTimeToEpochMs(
      nextDay.getUTCFullYear(),
      nextDay.getUTCMonth() + 1,
      nextDay.getUTCDate(),
      targetHour,
      targetMinute
    );
  }
  return getNextLondonMidnightMs(setDate);
}
