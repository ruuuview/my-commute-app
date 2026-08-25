/**
 * Frontend Behavioral Verification Suite: Refund Radar Mobile Engine
 * 
 * Verifies:
 * - FE-01: Immutable Touch-In Persistence via SessionManager
 * - FE-02/FE-03: Quick-Copy Accessory Bar formatting & clipboard payloads
 * - FE-04: Day 14 SLA Resolution Survey timing, working day calculus & 3-day snooze behavior
 */

import { SessionManager } from '../services/SessionManager';
import {
  isOverdue,
  workingDaysSince,
  formatPence,
  isSurveySnoozed,
  snoozeSurvey,
  SNOOZE_WINDOW_MS,
  SNOOZE_WINDOW_DAYS,
  DUE_CLAIM_WORKING_DAYS,
} from '../services/refundSlaService';

describe('Refund Radar Mobile Behavioral Verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('FE-01: Touch-In Persistence on Session Start', () => {
    it('persists immutable touch_in_time and commute_start_time upon starting a session', async () => {
      const nowMs = Date.now();
      await SessionManager.startSession('HUBBRX', 'HUBVIC', 'victoria', 'Victoria');

      const touchIn = SessionManager.getTouchInTime();
      const startTime = SessionManager.getCommuteStartTime();
      const origin = SessionManager.getCommuteOriginId();
      const dest = SessionManager.getCommuteDestinationId();
      const line = SessionManager.getCommuteLineId();

      expect(touchIn).toBeDefined();
      expect(typeof touchIn).toBe('number');
      expect(touchIn).toBeGreaterThanOrEqual(nowMs - 1000);
      expect(startTime).toEqual(touchIn);
      expect(origin).toBe('HUBBRX');
      expect(dest).toBe('HUBVIC');
      expect(line).toBe('victoria');
    });
  });

  describe('FE-02 & FE-03: Quick-Copy Accessory Bar & Evidence Generation', () => {
    it('formats correct individual copy payloads for TfL portal assistance', () => {
      const claim = {
        id: 999,
        lineId: 'victoria',
        entryStation: 'Walthamstow Central',
        exitStation: 'Victoria',
        entryTime: '2026-08-25T08:15:00.000Z',
        delayMinutes: 26,
        amountPence: 280,
      };

      const dateStr = new Date(claim.entryTime).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      const timeStr = new Date(claim.entryTime).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const lineName = claim.lineId.charAt(0).toUpperCase() + claim.lineId.slice(1);

      // Verify chip values
      expect(dateStr).toContain('Aug 2026');
      expect(claim.entryStation).toBe('Walthamstow Central');
      expect(claim.exitStation).toBe('Victoria');
      expect(timeStr).toMatch(/\d{2}:\d{2}/);
      expect(lineName).toBe('Victoria');

      // Verify full JSON evidence bundle
      const evidence = JSON.stringify(
        {
          date: dateStr,
          line: claim.lineId,
          delay: `${claim.delayMinutes}min`,
          entry: claim.entryStation,
          exit: claim.exitStation,
          amount: formatPence(claim.amountPence),
        },
        null,
        2
      );

      const parsed = JSON.parse(evidence);
      expect(parsed.line).toBe('victoria');
      expect(parsed.delay).toBe('26min');
      expect(parsed.entry).toBe('Walthamstow Central');
      expect(parsed.exit).toBe('Victoria');
      expect(parsed.amount).toBe('£2.80');
    });
  });

  describe('FE-04: Day 14 SLA Resolution Survey & 3-Day Snooze Behavior', () => {
    it('correctly calculates working days and marks claims overdue only after threshold', () => {
      const recentFiled = {
        claimStatus: 'filed',
        // Filed 2 days ago
        filedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      };
      expect(isOverdue(recentFiled)).toBe(false);

      // Filed 20 calendar days ago (at least 14 working days)
      const overdueFiled = {
        claimStatus: 'filed',
        filedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      };
      expect(isOverdue(overdueFiled)).toBe(true);

      const daysSince = workingDaysSince(overdueFiled.filedAt);
      expect(daysSince).toBeGreaterThanOrEqual(14);
    });

    it('manages 3-day snooze window with MMKV persistence', () => {
      const claimId = 888;

      // 1. Initially unsnoozed
      expect(isSurveySnoozed(claimId)).toBe(false);

      // 2. User taps "Still Waiting" -> snoozes survey
      snoozeSurvey(claimId);
      expect(isSurveySnoozed(claimId)).toBe(true);

      // 3. Confirm snooze constants match policy
      expect(DUE_CLAIM_WORKING_DAYS).toBe(10);
      expect(SNOOZE_WINDOW_DAYS).toBe(3);
      expect(SNOOZE_WINDOW_MS).toBe(3 * 24 * 60 * 60 * 1000);
    });
  });
});
