// frontend/services/fareTable.ts
// March 2026 TfL zonal fare table for Delay Repay estimate display.
// Strictly returns string amounts (e.g. "3.60") to be rendered with ~ prefix.

export const FARE_TABLE: Record<string, { peak: number; offpeak: number }> = {
  '1-1': { peak: 3.10, offpeak: 3.00 },
  '1-2': { peak: 3.60, offpeak: 3.10 },
  '1-3': { peak: 3.90, offpeak: 3.30 },
  '1-4': { peak: 4.80, offpeak: 3.60 },
  '1-5': { peak: 5.30, offpeak: 3.80 },
  '1-6': { peak: 5.90, offpeak: 4.00 },
  '2-2': { peak: 2.30, offpeak: 2.20 },
  '2-3': { peak: 2.50, offpeak: 2.30 },
  '2-4': { peak: 3.20, offpeak: 2.40 },
  '2-5': { peak: 3.40, offpeak: 2.50 },
  '2-6': { peak: 3.80, offpeak: 2.60 },
  '3-3': { peak: 2.30, offpeak: 2.20 },
  '3-4': { peak: 2.50, offpeak: 2.30 },
  '3-5': { peak: 3.20, offpeak: 2.40 },
  '3-6': { peak: 3.40, offpeak: 2.50 },
  '4-4': { peak: 2.30, offpeak: 2.20 },
  '4-5': { peak: 2.50, offpeak: 2.30 },
  '4-6': { peak: 3.20, offpeak: 2.40 },
  '5-5': { peak: 2.30, offpeak: 2.20 },
  '5-6': { peak: 2.50, offpeak: 2.30 },
  '6-6': { peak: 2.30, offpeak: 2.20 },
};

/**
 * Evaluates whether a given timestamp is TfL Peak hours.
 * Evaluated strictly in Europe/London timezone.
 * Peak: Monday-Friday 06:30-09:30 and 16:00-19:00 London time.
 */
export function isPeakTime(date: Date = new Date()): boolean {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const weekday = parts.find((p) => p.type === 'weekday')?.value;
  if (weekday === 'Sat' || weekday === 'Sun') return false;

  const hours = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const minutes = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  const timeMinutes = hours * 60 + minutes;

  // 06:30 - 09:30 (390 - 570)
  const isMorningPeak = timeMinutes >= 390 && timeMinutes <= 570;
  // 16:00 - 19:00 (960 - 1140)
  const isEveningPeak = timeMinutes >= 960 && timeMinutes <= 1140;

  return isMorningPeak || isEveningPeak;
}

/**
 * Calculates the estimated corridor single fare under March 2026 tariffs.
 * Always formats as 2 decimal places (e.g. "3.60").
 */
export function estimateFare(originZone: number, destZone: number, date: Date = new Date()): string {
  const minZone = Math.min(originZone, destZone);
  const maxZone = Math.max(originZone, destZone);
  const key = `${minZone}-${maxZone}`;
  const fare = FARE_TABLE[key];
  if (!fare) return '0.00';
  return (isPeakTime(date) ? fare.peak : fare.offpeak).toFixed(2);
}
