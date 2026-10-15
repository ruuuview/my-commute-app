import { Platform } from 'react-native';
import { LiveActivityService } from '../services/LiveActivityService';
import { getDeliveryRow, DELIVERY_COPY, DeliveryRowId } from '../utils/deliveryRow';

describe('Delivery Truth Table & Two-Bit Native Bridge Invariants', () => {
  describe('Truth Table Row Logic (Pure Function Invariant)', () => {
    test.each([
      [{ mode: 'loud', notifGranted: true, notifCanAsk: false, la: { supported: true, enabled: true } }, 1],
      [{ mode: 'loud', notifGranted: false, notifCanAsk: true, la: { supported: true, enabled: true } }, 2],
      [{ mode: 'loud', notifGranted: false, notifCanAsk: false, la: { supported: true, enabled: true } }, 3],
      [{ mode: 'shush', notifGranted: true, notifCanAsk: false, la: { supported: true, enabled: true } }, 4],
      [{ mode: 'shush', notifGranted: true, notifCanAsk: false, la: { supported: true, enabled: false } }, 5],
      [{ mode: 'off', notifGranted: true, notifCanAsk: false, la: { supported: true, enabled: true } }, 6],
      [{ mode: 'shush', notifGranted: true, notifCanAsk: false, la: { supported: false, enabled: false } }, 7],
      [{ mode: 'shush', notifGranted: false, notifCanAsk: false, la: { supported: true, enabled: true } }, 8],
    ])('maps input %p to row %i', (input, expectedRow) => {
      expect(getDeliveryRow(input as any)).toBe(expectedRow);
    });

    test('no copy row contains the forbidden word "Silent"', () => {
      Object.values(DELIVERY_COPY).forEach((copy) => {
        expect(copy).not.toMatch(/\bSilent\b/i);
      });
    });

    test('Row 1 copy accurately specifies non-commute delivery', () => {
      expect(DELIVERY_COPY[1]).toBe("Banners with sound when you're not commuting.");
    });

    test('Row 4 copy explicitly promises quiet delivery', () => {
      expect(DELIVERY_COPY[4]).toContain('quietly');
    });

    test('capability invariant: only enabled Live Activities in Shush mode promise Dynamic Island', () => {
      expect(DELIVERY_COPY[4]).toContain('Dynamic Island');
      [1, 2, 3, 5, 6, 7, 8].forEach((rowId) => {
        expect(DELIVERY_COPY[rowId as DeliveryRowId]).not.toContain('Dynamic Island');
      });
    });

    test('invariant: if Live Activities are unsupported or disabled, copy never mentions island', () => {
      const modes: ('loud' | 'shush' | 'off')[] = ['loud', 'shush', 'off'];
      const bools = [true, false];

      for (const mode of modes) {
        for (const notifGranted of bools) {
          for (const notifCanAsk of bools) {
            // Case 1: unsupported
            const rowUnsupported = getDeliveryRow({
              mode,
              notifGranted,
              notifCanAsk,
              la: { supported: false, enabled: false },
            });
            expect(DELIVERY_COPY[rowUnsupported].toLowerCase()).not.toContain('island');

            // Case 2: supported but disabled
            const rowDisabled = getDeliveryRow({
              mode,
              notifGranted,
              notifCanAsk,
              la: { supported: true, enabled: false },
            });
            expect(DELIVERY_COPY[rowDisabled].toLowerCase()).not.toContain('island');
          }
        }
      }
    });
  });

  describe('Two-Bit Native Bridge Behavioral Evaluation (Catch A Invariant)', () => {
    const originalOS = Platform.OS;

    beforeEach(() => {
      Platform.OS = 'ios';
    });

    afterEach(() => {
      LiveActivityService._setNativeModuleForTesting(null);
    });

    afterAll(() => {
      Platform.OS = originalOS;
    });

    test('Maps { supported: true, enabled: true } -> supported (Row 4 path)', async () => {
      LiveActivityService._setNativeModuleForTesting({
        activityAuthorizationInfo: async () => ({ supported: true, enabled: true }),
        areActivitiesEnabled: async () => true,
      });

      const info = await LiveActivityService.getActivityAuthorizationInfo();
      expect(info).toEqual({ supported: true, enabled: true });

      const status = await LiveActivityService.getSupportStatus();
      expect(status).toBe('supported');

      const areEnabled = await LiveActivityService.areActivitiesEnabled();
      expect(areEnabled).toBe(true);
    });

    test('Maps { supported: true, enabled: false } -> system_disabled (Row 5 path)', async () => {
      LiveActivityService._setNativeModuleForTesting({
        activityAuthorizationInfo: async () => ({ supported: true, enabled: false }),
        areActivitiesEnabled: async () => false,
      });

      const info = await LiveActivityService.getActivityAuthorizationInfo();
      expect(info).toEqual({ supported: true, enabled: false });

      const status = await LiveActivityService.getSupportStatus();
      expect(status).toBe('system_disabled');

      const areEnabled = await LiveActivityService.areActivitiesEnabled();
      expect(areEnabled).toBe(false);
    });

    test('Maps { supported: false, enabled: false } -> unsupported (Row 7 path)', async () => {
      LiveActivityService._setNativeModuleForTesting({
        activityAuthorizationInfo: async () => ({ supported: false, enabled: false }),
        areActivitiesEnabled: async () => false,
      });

      const info = await LiveActivityService.getActivityAuthorizationInfo();
      expect(info).toEqual({ supported: false, enabled: false });

      const status = await LiveActivityService.getSupportStatus();
      expect(status).toBe('unsupported');

      const areEnabled = await LiveActivityService.areActivitiesEnabled();
      expect(areEnabled).toBe(false);
    });
  });
});
