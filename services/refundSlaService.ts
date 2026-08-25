/**
 * Refund Radar SLA & Snooze Service
 * 
 * Provides pure utility & MMKV persistence logic for:
 * - 14-day SLA deadline calculations (working days excluding weekends)
 * - 3-day quiet period snooze management (FE-04)
 * - Currency formatting
 */

import { createMMKV } from 'react-native-mmkv';

// DUE_CLAIM_WORKING_DAYS: Standard 10 working-day window TfL takes to process delay repay
export const DUE_CLAIM_WORKING_DAYS = 10;

// SNOOZE_WINDOW_DAYS: 3-day quiet period before re-prompting unresolved filed claims
export const SNOOZE_WINDOW_DAYS = 3;
export const SNOOZE_WINDOW_MS = SNOOZE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

const refundsStorage = createMMKV({ id: 'refunds-storage' });

export function addWorkingDays(from: Date, days: number): Date {
  const d = new Date(from);
  let remaining = days;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return d;
}

export function isOverdue(claim: { claimStatus: string | null; filedAt: string | null }): boolean {
  if (claim.claimStatus !== 'filed' || !claim.filedAt) return false;
  const due = addWorkingDays(new Date(claim.filedAt), DUE_CLAIM_WORKING_DAYS);
  return new Date() > due;
}

export function workingDaysSince(fromIso: string): number {
  const from = new Date(fromIso);
  let count = 0;
  const now = new Date();
  const cursor = new Date(from);
  while (cursor < now) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

export function formatPence(pence: number): string {
  return (pence / 100).toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
  });
}

export function isSurveySnoozed(claimId: number): boolean {
  const snoozedAtStr = refundsStorage.getString(`snoozed_survey_${claimId}`);
  if (!snoozedAtStr) return false;
  const snoozedAt = parseInt(snoozedAtStr, 10);
  return Date.now() - snoozedAt < SNOOZE_WINDOW_MS;
}

export function snoozeSurvey(claimId: number): void {
  refundsStorage.set(`snoozed_survey_${claimId}`, String(Date.now()));
}
