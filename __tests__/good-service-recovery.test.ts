// frontend/__tests__/good-service-recovery.test.ts
// ==============================================================================
// Good Service Recovery Phase 1 Invariant Tests
// ==============================================================================

import fs from 'fs';
import path from 'path';
import { handleGoodServiceRecovery, RecoveryDeps, LiveActivityService } from '../services/LiveActivityService';

describe('Good Service Recovery Invariants', () => {
  let deps: RecoveryDeps;

  beforeEach(() => {
    deps = {
      dismissNotification: jest.fn().mockResolvedValue(undefined),
      getActiveCommute: jest.fn().mockReturnValue(null),
      startGoodServiceActivity: jest.fn().mockResolvedValue('gs-activity-123'),
      updateActivity: jest.fn().mockResolvedValue(undefined),
      resetDisruptionDebounce: jest.fn(),
      canShowIsland: jest.fn().mockReturnValue(true),
    };
  });

  describe('Branch 1: Idle (No active commute running)', () => {
    it('dismisses disruption notification and calls startGoodServiceActivity with strictly 2 arguments (lineId, lineName)', async () => {
      await handleGoodServiceRecovery('victoria', deps);

      expect(deps.dismissNotification).toHaveBeenCalledTimes(1);
      expect(deps.dismissNotification).toHaveBeenCalledWith('victoria');
      expect(deps.startGoodServiceActivity).toHaveBeenCalledTimes(1);
      // Strictly 2 arguments: (lineId, lineName)
      expect(deps.startGoodServiceActivity).toHaveBeenCalledWith('victoria', 'Victoria');
      expect((deps.startGoodServiceActivity as jest.Mock).mock.calls[0].length).toBe(2);
      expect(deps.updateActivity).not.toHaveBeenCalled();
    });

    it('suppresses startGoodServiceActivity if canShowIsland returns false while still dismissing notification', async () => {
      deps.canShowIsland = jest.fn().mockReturnValue(false);

      await handleGoodServiceRecovery('victoria', deps);

      expect(deps.dismissNotification).toHaveBeenCalledTimes(1);
      expect(deps.dismissNotification).toHaveBeenCalledWith('victoria');
      expect(deps.startGoodServiceActivity).not.toHaveBeenCalled();
      expect(deps.updateActivity).not.toHaveBeenCalled();
    });

    it('guarantees notification dismissal and never throws if startGoodServiceActivity rejects', async () => {
      deps.startGoodServiceActivity = jest.fn().mockRejectedValue(new Error('ActivityKit: Background request not permitted'));

      await expect(handleGoodServiceRecovery('victoria', deps)).resolves.not.toThrow();

      expect(deps.dismissNotification).toHaveBeenCalledTimes(1);
      expect(deps.dismissNotification).toHaveBeenCalledWith('victoria');
      expect(deps.startGoodServiceActivity).toHaveBeenCalledTimes(1);
    });
  });

  describe('Branch 2: Active Commute on the SAME Line', () => {
    it('updates running activity in-place and resets disruption cache before updateActivity', async () => {
      const callOrder: string[] = [];
      deps.getActiveCommute = jest.fn().mockReturnValue({
        lineId: 'victoria',
        originStationId: 'HUBKGX',
      });
      deps.resetDisruptionDebounce = jest.fn().mockImplementation(() => {
        callOrder.push('resetDisruptionDebounce');
      });
      deps.updateActivity = jest.fn().mockImplementation(async () => {
        callOrder.push('updateActivity');
      });

      await handleGoodServiceRecovery('victoria', deps);

      expect(deps.dismissNotification).toHaveBeenCalledTimes(1);
      expect(deps.dismissNotification).toHaveBeenCalledWith('victoria');
      expect(deps.resetDisruptionDebounce).toHaveBeenCalledWith('victoria');
      expect(deps.updateActivity).toHaveBeenCalledWith('HUBKGX', 'victoria');
      expect(callOrder).toEqual(['resetDisruptionDebounce', 'updateActivity']);
      expect(deps.startGoodServiceActivity).not.toHaveBeenCalled();
    });

    it('LiveActivityService.resetDisruptionDebounce clears lastDisruptedAtByLine for the specified line only', () => {
      (LiveActivityService as any).lastDisruptedAtByLine = {
        victoria: Date.now(),
        piccadilly: Date.now(),
      };
      expect((LiveActivityService as any).lastDisruptedAtByLine.victoria).toBeGreaterThan(0);
      expect((LiveActivityService as any).lastDisruptedAtByLine.piccadilly).toBeGreaterThan(0);

      LiveActivityService.resetDisruptionDebounce('victoria');

      // Victoria is cleared so Good Service reads immediately
      expect((LiveActivityService as any).lastDisruptedAtByLine.victoria).toBeUndefined();
      // Piccadilly debounce is untouched — no cross-line leakage
      expect((LiveActivityService as any).lastDisruptedAtByLine.piccadilly).toBeGreaterThan(0);
    });
  });

  describe('Branch 3: Active Commute on a DIFFERENT Line', () => {
    it('dismisses notification silently without touching or starting any activity', async () => {
      deps.getActiveCommute = jest.fn().mockReturnValue({
        lineId: 'northern',
        originStationId: 'HUBKGX',
      });

      await handleGoodServiceRecovery('victoria', deps);

      expect(deps.dismissNotification).toHaveBeenCalledTimes(1);
      expect(deps.dismissNotification).toHaveBeenCalledWith('victoria');
      expect(deps.startGoodServiceActivity).not.toHaveBeenCalled();
      expect(deps.updateActivity).not.toHaveBeenCalled();
    });
  });

  describe('Source Code Invariants (Physical Disk Audit)', () => {
    it('DeliveryTrackView has explicit default: EmptyView() and NO legacy else { approachingView }', () => {
      const p = path.resolve(__dirname, '../targets/MyCommuteWidget/DeliveryTrackView.swift');
      const src = fs.readFileSync(p, 'utf8');
      expect(src).toMatch(/default:\s+EmptyView\(\)/);
      expect(src).not.toContain('else { approachingView }');
    });

    it('MyCommuteLiveActivity isGoodServiceStatus is strictly phase-driven', () => {
      const p = path.resolve(__dirname, '../targets/MyCommuteWidget/MyCommuteLiveActivity.swift');
      const src = fs.readFileSync(p, 'utf8');
      expect(src).toMatch(/private var isGoodServiceStatus: Bool \{\s*return context\.state\.phase == "good_service"\s*\}/);
    });

    it('GoodServiceRecovery service never imports or constructs originStation or destinationStation', () => {
      const p = path.resolve(__dirname, '../services/GoodServiceRecovery.ts');
      const src = fs.readFileSync(p, 'utf8');
      expect(src).not.toContain('destinationStationName');
      expect(src).not.toContain('fakeCommute');
      expect(src).not.toContain('destinationStation:');
      expect(src).not.toContain('originStation:');
      expect(src).not.toContain('arrivals:');
    });

    it('MyCommuteLiveActivityModule filters out good_service in isActivityActive and updateCommuteActivity', () => {
      const p = path.resolve(__dirname, '../modules/my-commute-live-activity/ios/MyCommuteLiveActivityModule.swift');
      const src = fs.readFileSync(p, 'utf8');
      expect(src).toContain('$0.content.state.phase != "good_service"');
      expect(src).toContain('activities.first(where: { $0.content.state.phase != "good_service" })');
      expect(src).toContain('for old in existing {\n        await old.end(nil, dismissalPolicy: .immediate)');
    });
  });
});
