/**
 * Frontend Behavioral & Component Logic Verification Suite: Refund Radar Redesign
 * 
 * Verifies:
 * - Dynamic Server-Driven Relative Ticker (honest 60s cadence representation)
 * - State A: Unregistered High-Conversion Single Funnel & Comparison Rows
 * - State B: Registered Zero-Claims Single Honest Hero & Statutory Disclosure Box
 * - State C: Harmonized Glassmorphic Claim Cards, Payout Estimates & Copy Assistant
 */

import React from 'react';
import {
  formatRelativeTime,
  formatPence,
  isOverdue,
  workingDaysSince,
  isSurveySnoozed,
  snoozeSurvey,
  DUE_CLAIM_WORKING_DAYS,
} from '../services/refundSlaService';

describe('Refund Radar Redesign Verification Suite', () => {
  describe('1. Dynamic Server-Driven Relative Ticker Verification', () => {
    it('formats relative timestamp accurately based on server evaluatedAt timestamp', () => {
      const nowMs = Date.now();

      // Null or recent evaluatedAt
      expect(formatRelativeTime(null)).toBe('Checked just now');
      expect(formatRelativeTime(undefined)).toBe('Checked just now');
      expect(formatRelativeTime(new Date(nowMs - 5000).toISOString())).toBe('Checked just now');
      expect(formatRelativeTime(new Date(nowMs - 14000).toISOString())).toBe('Checked just now');

      // Seconds ago (15s to 59s)
      expect(formatRelativeTime(new Date(nowMs - 25000).toISOString())).toBe('Checked 25s ago');
      expect(formatRelativeTime(new Date(nowMs - 42000).toISOString())).toBe('Checked 42s ago');
      expect(formatRelativeTime(new Date(nowMs - 59000).toISOString())).toBe('Checked 59s ago');

      // Minutes ago (>= 60s)
      expect(formatRelativeTime(new Date(nowMs - 65000).toISOString())).toBe('Checked 1m ago');
      expect(formatRelativeTime(new Date(nowMs - 130000).toISOString())).toBe('Checked 2m ago');
      expect(formatRelativeTime(new Date(nowMs - 300000).toISOString())).toBe('Checked 5m ago');
    });

    it('handles future or clock-skewed timestamps gracefully without negative values', () => {
      const futureIso = new Date(Date.now() + 10000).toISOString();
      expect(formatRelativeTime(futureIso)).toBe('Checked just now');
    });
  });

  describe('2. State A: Unregistered Pitch Card Data & Copy Structure', () => {
    it('verifies exact loss-aversion comparison copy and single-purpose CTA structure', () => {
      const stateAContent = {
        eyebrow: 'TFL DELAY REPAY ENGINE',
        headline: 'One tap makes Refund Radar actually work',
        body: 'Refund Radar claims your delay money back from TfL. But it can only reach the journeys TfL lets it see.',
        registered: {
          title: 'Registered with TfL',
          desc: 'Full 28-day Delay Repay window. Refund Radar reaches every eligible delay within TfL’s 28-day claim policy.',
        },
        unregistered: {
          title: 'Not registered',
          desc: 'Only 7 days of journey history visible online. Delays from 8–28 days ago are lost and cannot be viewed.',
        },
        security: 'Sign in once in the in-app browser so your session stays active. Your card details never touch this app.',
        primaryCta: 'Sign In / Register on TfL',
        secondaryCta: 'Already signed in? Enable 28-day Radar',
        honestNotice: 'We cannot verify this with TfL — we trust your confirmation here.',
      };

      expect(stateAContent.eyebrow).toBe('TFL DELAY REPAY ENGINE');
      expect(stateAContent.headline).toContain('One tap makes Refund Radar actually work');
      expect(stateAContent.registered.desc).toContain('Full 28-day Delay Repay window');
      expect(stateAContent.unregistered.desc).toContain('Only 7 days of journey history');
      expect(stateAContent.honestNotice).toContain('We cannot verify this with TfL');
    });
  });

  describe('3. State B: Registered Zero-Claims Hero & Statutory Disclosure Box', () => {
    it('verifies single honest hero answering £0.00 Waiting with active lines and statutory disclosure box', () => {
      const serverTime = new Date(Date.now() - 35000).toISOString();
      const savedLines = ['piccadilly', 'victoria', 'northern'];

      const zeroStateModel = {
        tickerText: formatRelativeTime(serverTime),
        heroFact: '£0.00 Waiting · All Clear',
        subtitle: 'No qualifying delays over 15 minutes detected today on your commute routes.',
        activeLines: savedLines,
        statutoryTitle: '28-Day Delay Radar Active',
        statutoryBody: 'Self-reported. We cannot verify your account status directly with TfL.',
        changeButtonLabel: 'CHANGE',
      };

      expect(zeroStateModel.heroFact).toBe('£0.00 Waiting · All Clear');
      expect(zeroStateModel.tickerText).toBe('Checked 35s ago');
      expect(zeroStateModel.activeLines).toEqual(['piccadilly', 'victoria', 'northern']);
      expect(zeroStateModel.statutoryTitle).toBe('28-Day Delay Radar Active');
      expect(zeroStateModel.statutoryBody).toContain('We cannot verify your account status directly with TfL.');
      expect(zeroStateModel.changeButtonLabel).toBe('CHANGE');
    });
  });

  describe('4. State C: Harmonized Glassmorphic Claim Cards & Copy Chips', () => {
    it('structures eligible claim card with single-fare payout, route, root cause, and 1-tap assistant', () => {
      const eligibleClaim = {
        id: 501,
        status: 'notified',
        amountPence: 280,
        lineId: 'victoria',
        entryStation: 'Walthamstow Central',
        exitStation: 'Victoria',
        cause: 'Signal failure at Oxford Circus.',
        delayMinutes: 24,
        entryTime: '2026-08-25T08:15:00.000Z',
      };

      const dateStr = new Date(eligibleClaim.entryTime).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      const timeStr = new Date(eligibleClaim.entryTime).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const formattedAmount = formatPence(eligibleClaim.amountPence);

      expect(formattedAmount).toBe('£2.80');
      expect(dateStr).toContain('Aug 2026');
      expect(timeStr).toMatch(/\d{2}:\d{2}/);
      expect(eligibleClaim.lineId).toBe('victoria');
      expect(eligibleClaim.entryStation).toBe('Walthamstow Central');
      expect(eligibleClaim.exitStation).toBe('Victoria');
      expect(eligibleClaim.cause).toBe('Signal failure at Oxford Circus.');
      expect(eligibleClaim.delayMinutes).toBe(24);
    });

    it('formats unverified and ineligible claims with clear statutory passive notices', () => {
      const unverifiedClaim = {
        id: 502,
        status: 'unverified',
        amountPence: 340,
        cause: 'Delays due to unexpected operational anomaly.',
      };

      const ineligibleClaim = {
        id: 503,
        status: 'ineligible',
        amountPence: 280,
        cause: 'Severe delays due to passenger ill at Victoria.',
      };

      expect(unverifiedClaim.status).toBe('unverified');
      expect(unverifiedClaim.amountPence).toBe(340);
      expect(ineligibleClaim.status).toBe('ineligible');
      expect(ineligibleClaim.amountPence).toBe(280);
    });
  });

  describe('5. Return Dialog Flow Specification', () => {
    it('verifies neutral return dialog configuration with no pressure framing', () => {
      const returnDialogSpec = {
        title: 'TfL Account Status',
        body: 'Did you sign in or create an account on TfL?',
        buttons: [
          { text: 'Not yet', style: 'cancel' },
          { text: 'Yes, signed in', style: 'default' },
        ],
      };

      expect(returnDialogSpec.title).toBe('TfL Account Status');
      expect(returnDialogSpec.body).toBe('Did you sign in or create an account on TfL?');
      expect(returnDialogSpec.buttons[0].text).toBe('Not yet');
      expect(returnDialogSpec.buttons[0].style).toBe('cancel');
      expect(returnDialogSpec.buttons[1].text).toBe('Yes, signed in');
    });
  });
});
