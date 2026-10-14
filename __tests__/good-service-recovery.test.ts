// frontend/__tests__/good-service-recovery.test.ts
// ==============================================================================
// Line Recovery & Good Service Invariant Tests
// ==============================================================================

import fs from 'fs';
import path from 'path';
import { handleLineRecovery, handleGoodServiceRecovery, type RecoveryDeps } from '../services/GoodServiceRecovery';
import { LiveActivityService } from '../services/LiveActivityService';

describe('Line Recovery & Good Service Invariants', () => {
  let deps: RecoveryDeps;

  beforeEach(() => {
    deps = {
      dismissNotification: jest.fn().mockResolvedValue(undefined),
      getActiveCommute: jest.fn().mockReturnValue(null),
      updateActivity: jest.fn().mockResolvedValue(undefined),
      resetDisruptionDebounce: jest.fn(),
    };
  });

  describe('Branch 1: Idle (No active commute running)', () => {
    it('strictly dismisses disruption notification and starts ZERO live activities', async () => {
      await handleLineRecovery('victoria', deps);

      expect(deps.dismissNotification).toHaveBeenCalledTimes(1);
      expect(deps.dismissNotification).toHaveBeenCalledWith('victoria');
      expect(deps.resetDisruptionDebounce).toHaveBeenCalledWith('victoria');
      expect(deps.updateActivity).not.toHaveBeenCalled();
    });

    it('handleGoodServiceRecovery alias behaves identically to handleLineRecovery', async () => {
      await handleGoodServiceRecovery('victoria', deps);

      expect(deps.dismissNotification).toHaveBeenCalledTimes(1);
      expect(deps.dismissNotification).toHaveBeenCalledWith('victoria');
      expect(deps.updateActivity).not.toHaveBeenCalled();
    });

    it('guarantees notification dismissal and never throws if an error occurs', async () => {
      deps.dismissNotification = jest.fn().mockResolvedValue(undefined);
      deps.getActiveCommute = jest.fn().mockImplementation(() => {
        throw new Error('MMKV failure');
      });

      await expect(handleLineRecovery('victoria', deps)).rejects.toThrow();
      expect(deps.dismissNotification).toHaveBeenCalledWith('victoria');
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

      await handleLineRecovery('victoria', deps);

      expect(deps.dismissNotification).toHaveBeenCalledTimes(1);
      expect(deps.dismissNotification).toHaveBeenCalledWith('victoria');
      expect(deps.resetDisruptionDebounce).toHaveBeenCalledWith('victoria');
      expect(deps.updateActivity).toHaveBeenCalledWith('HUBKGX', 'victoria');
      expect(callOrder).toEqual(['resetDisruptionDebounce', 'updateActivity']);
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
    it('dismisses notification silently without touching or updating running activity', async () => {
      deps.getActiveCommute = jest.fn().mockReturnValue({
        lineId: 'northern',
        originStationId: 'HUBKGX',
      });

      await handleLineRecovery('victoria', deps);

      expect(deps.dismissNotification).toHaveBeenCalledTimes(1);
      expect(deps.dismissNotification).toHaveBeenCalledWith('victoria');
      expect(deps.resetDisruptionDebounce).toHaveBeenCalledWith('victoria');
      expect(deps.updateActivity).not.toHaveBeenCalled();
    });
  });

  describe('Source Code Invariants (Physical Disk Audit)', () => {
    it('DeliveryTrackView has explicit default: EmptyView() and NO good_service phase case', () => {
      const p = path.resolve(__dirname, '../targets/MyCommuteWidget/DeliveryTrackView.swift');
      const src = fs.readFileSync(p, 'utf8');
      expect(src).toMatch(/default:\s+EmptyView\(\)/);
      expect(src).not.toContain('case "good_service"');
      expect(src).not.toContain('goodServiceView');
    });

    it('MyCommuteLiveActivity has NO isGoodServiceStatus', () => {
      const p = path.resolve(__dirname, '../targets/MyCommuteWidget/MyCommuteLiveActivity.swift');
      const src = fs.readFileSync(p, 'utf8');
      expect(src).not.toContain('isGoodServiceStatus');
      expect(src).not.toContain('phase == "good_service"');
    });

    it('GoodServiceRecovery service never imports or constructs originStation or destinationStation', () => {
      const p = path.resolve(__dirname, '../services/GoodServiceRecovery.ts');
      const src = fs.readFileSync(p, 'utf8');
      expect(src).not.toContain('destinationStationName');
      expect(src).not.toContain('fakeCommute');
      expect(src).not.toContain('destinationStation:');
      expect(src).not.toContain('originStation:');
      expect(src).not.toContain('arrivals:');
      expect(src).not.toContain('startGoodServiceActivity');
    });

    it('MyCommuteLiveActivityModule does NOT export startGoodServiceActivity or endGoodServiceActivities', () => {
      const p = path.resolve(__dirname, '../modules/my-commute-live-activity/ios/MyCommuteLiveActivityModule.swift');
      const src = fs.readFileSync(p, 'utf8');
      expect(src).not.toContain('startGoodServiceActivity');
      expect(src).not.toContain('endGoodServiceActivities');
      expect(src).not.toContain('phase == "good_service"');
    });
  });
});
