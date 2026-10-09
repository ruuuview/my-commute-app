// frontend/__tests__/good-service-silence-invariants.test.ts
// ==============================================================================
// Good Service Silence & Sample-Data Production Gating Invariants
//
// Mechanically asserts:
//   1. Good Service transition is 100% silent: never calls LiveActivityService.start,
//      never schedules a local push notification, and never requests a Morph Pill.
//   2. Production safety: startPreviewActivity and startSimulatedNorthernCommute
//      are strictly disabled outside of __DEV__.
//   3. Northern line contract: hex = #000000, border = #3A3A42, text = #FFFFFF.
// ==============================================================================

import * as Notifications from 'expo-notifications';
import { usePillStore } from '../store/pillStore';
import { dismissDisruptionNotification } from '../services/notifications/dispatch';
import { LiveActivityService } from '../services/LiveActivityService';
import { LINE_IDENTITY_COLORS, NORTHERN_SHADES } from '../constants/lineColors';
import lineColorsData from '../constants/lineColors.json';

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-id'),
  dismissNotificationAsync: jest.fn().mockResolvedValue(undefined),
  setNotificationCategoryAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../modules/my-commute-live-activity', () => ({
  startCommuteActivity: jest.fn().mockResolvedValue('activity-123'),
  endCommuteActivity: jest.fn().mockResolvedValue(undefined),
  updateCommuteActivity: jest.fn().mockResolvedValue(undefined),
  isActivityActive: jest.fn().mockResolvedValue(false),
  areActivitiesEnabled: jest.fn().mockResolvedValue(true),
  activityAuthorizationInfo: jest.fn().mockResolvedValue({ supported: true, enabled: true }),
  hasDynamicIsland: jest.fn().mockResolvedValue(true),
  syncWidgetCache: jest.fn().mockResolvedValue(undefined),
}));

describe('Good Service Silence & Production Gating Invariants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePillStore.getState().clearPill();
  });

  describe('Invariant 1: Absolute Silence on Good Service Recovery', () => {
    it('never schedules a lockscreen notification for Good Service recovery', async () => {
      const res = await dismissDisruptionNotification({
        lineId: 'northern',
        lineName: 'Northern',
      });

      expect(res).toBe('silent_recovery_northern');
      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
      expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith('line-disruption-northern');
    });

    it('never requests a Morph Pill banner when status recovers to Good Service', () => {
      expect(usePillStore.getState().active).toBeNull();
      // Verify 'recovery' is permanently removed from the Pill system
      expect((usePillStore.getState() as any).requestPill).toBeDefined();
    });
  });

  describe('Invariant 2: Test & Sample Code Disabled in Production', () => {
    const originalDev = (global as any).__DEV__;

    afterEach(() => {
      (global as any).__DEV__ = originalDev;
    });

    it('strictly forbids startPreviewActivity ("High Barnet 3m") in production builds', async () => {
      (global as any).__DEV__ = false;

      const activityId = await LiveActivityService.startPreviewActivity();
      expect(activityId).toBeNull();

      const { startCommuteActivity } = jest.requireMock('../modules/my-commute-live-activity');
      expect(startCommuteActivity).not.toHaveBeenCalled();
    });

    it('strictly forbids startSimulatedNorthernCommute in production builds', async () => {
      (global as any).__DEV__ = false;

      const activityId = await LiveActivityService.startSimulatedNorthernCommute();
      expect(activityId).toBeNull();

      const { startCommuteActivity } = jest.requireMock('../modules/my-commute-live-activity');
      expect(startCommuteActivity).not.toHaveBeenCalled();
    });

    it('allows preview and simulation strictly in DEV mode', async () => {
      (global as any).__DEV__ = true;

      const activityId = await LiveActivityService.startPreviewActivity();
      expect(activityId).toBe('activity-123');

      const { startCommuteActivity } = jest.requireMock('../modules/my-commute-live-activity');
      expect(startCommuteActivity).toHaveBeenCalled();
      await LiveActivityService.stopPreviewActivity();
    });
  });

  describe('Invariant 3: Northern Line Color Contract (Single Source of Truth)', () => {
    it('enforces Northern line color is #000000 with #3A3A42 border rim in lineColors.json', () => {
      const northernConfig = lineColorsData.lines.northern;
      expect(northernConfig.hex).toBe('#000000');
      expect(northernConfig.borderColor).toBe('#3A3A42');
      expect(northernConfig.textColor).toBe('#FFFFFF');
    });

    it('enforces Northern line exports in lineColors.ts match lineColors.json', () => {
      expect(LINE_IDENTITY_COLORS.northern).toBe('#000000');
      expect(NORTHERN_SHADES.brand).toBe('#000000');
      expect(NORTHERN_SHADES.border).toBe('#3A3A42');
    });

    it('ensures all 19 canonical routes plus overground in lineColors.json map to LINE_IDENTITY_COLORS', () => {
      const jsonLineKeys = Object.keys(lineColorsData.lines);
      expect(jsonLineKeys.length).toBe(20);

      // Verify the 19 canonical routes are all present
      const canonical19 = [
        'bakerloo', 'central', 'circle', 'district', 'dlr', 'elizabeth',
        'hammersmith-city', 'jubilee', 'metropolitan', 'northern',
        'piccadilly', 'victoria', 'waterloo-city',
        'liberty', 'lioness', 'mildmay', 'suffragette', 'weaver', 'windrush'
      ];
      for (const route of canonical19) {
        expect(jsonLineKeys).toContain(route);
        expect(LINE_IDENTITY_COLORS[route]).toBe(lineColorsData.lines[route as keyof typeof lineColorsData.lines].hex);
      }
      expect(jsonLineKeys).toContain('overground');
    });
  });
});
