import {
  parseNotificationIntent,
  navigateToIntent,
  CANONICAL_ALTERNATIVES,
  NotificationIntent,
} from '../services/notifications/intent';
import {
  presentDisruptionNotification,
} from '../services/notifications/dispatch';
import * as Notifications from 'expo-notifications';

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('test-notification-id'),
  setNotificationCategoryAsync: jest.fn().mockResolvedValue(undefined),
}));

describe('Notification Intent Architecture & Stack-Preserving Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('parseNotificationIntent (Poka-Yoke Device)', () => {
    it('should parse valid show-disruption payload with canonical alternative', () => {
      const data = {
        action: 'show-disruption',
        lineId: 'piccadilly',
        statusAsOf: 1725580000000,
      };

      const intent = parseNotificationIntent(data);
      expect(intent).not.toBeNull();
      expect(intent?.action).toBe('show-disruption');
      if (intent?.action === 'show-disruption') {
        expect(intent.lineId).toBe('piccadilly');
        expect(intent.alternative).toEqual(CANONICAL_ALTERNATIVES['piccadilly']);
        expect(intent.alternative?.lineId).toBe('district');
        expect(intent.alternative?.deltaMinutes).toBe(6);
        expect(intent.initialSection).toBe('overview');
      }
    });

    it('should parse valid show-reroute intent from quick action with alternatives section anchor', () => {
      const data = {
        action: 'show-reroute',
        lineId: 'victoria',
      };

      const intent = parseNotificationIntent(data);
      expect(intent).not.toBeNull();
      expect(intent?.action).toBe('show-reroute');
      if (intent?.action === 'show-reroute') {
        expect(intent.lineId).toBe('victoria');
        expect(intent.initialSection).toBe('alternatives');
        expect(intent.alternative?.lineId).toBe('jubilee');
        expect(intent.alternative?.deltaMinutes).toBe(5);
      }
    });

    it('should parse overview intent without lineId', () => {
      const data = { action: 'overview' };
      const intent = parseNotificationIntent(data);
      expect(intent).not.toBeNull();
      expect(intent?.action).toBe('overview');
    });

    it('should accept custom alternative object in payload', () => {
      const data = {
        action: 'show-disruption',
        lineId: 'central',
        alternative: {
          lineId: 'elizabeth',
          lineName: 'Elizabeth line (direct)',
          deltaMinutes: 4,
        },
      };

      const intent = parseNotificationIntent(data);
      expect(intent).not.toBeNull();
      if (intent?.action === 'show-disruption') {
        expect(intent.alternative?.lineId).toBe('elizabeth');
        expect(intent.alternative?.lineName).toBe('Elizabeth line (direct)');
        expect(intent.alternative?.deltaMinutes).toBe(4);
      }
    });

    it('should reject invalid or missing lineId without guessing or defaulting', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      expect(parseNotificationIntent({})).toBeNull();
      expect(parseNotificationIntent({ lineId: 'invalid-line' })).toBeNull();
      expect(parseNotificationIntent({ lineId: 12345 })).toBeNull();
      expect(parseNotificationIntent(null)).toBeNull();
      expect(parseNotificationIntent('just a string')).toBeNull();

      warnSpy.mockRestore();
    });

    it('should handle legacy openReroute boolean flag gracefully', () => {
      const data = {
        lineId: 'district',
        openReroute: true,
      };

      const intent = parseNotificationIntent(data);
      expect(intent).not.toBeNull();
      expect(intent?.action).toBe('show-reroute');
      if (intent?.action === 'show-reroute') {
        expect(intent.lineId).toBe('district');
        expect(intent.initialSection).toBe('alternatives');
      }
    });
  });

  describe('navigateToIntent (Stack-Preserving Navigation)', () => {
    it('should call router.navigate with notificationIntent and nonce, NEVER router.replace', () => {
      const mockRouter = {
        navigate: jest.fn(),
        replace: jest.fn(),
        push: jest.fn(),
      };

      const intent: NotificationIntent = {
        action: 'show-disruption',
        lineId: 'northern',
        alternative: CANONICAL_ALTERNATIVES['northern'],
        initialSection: 'overview',
        statusAsOf: 12345678,
      };

      navigateToIntent(mockRouter as any, intent);

      expect(mockRouter.replace).not.toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenCalledTimes(1);

      const callArg = mockRouter.navigate.mock.calls[0][0];
      expect(callArg.pathname).toBe('/(tabs)');
      expect(typeof callArg.params.notificationIntent).toBe('string');
      expect(typeof callArg.params.notificationNonce).toBe('string');

      const parsed = JSON.parse(callArg.params.notificationIntent);
      expect(parsed.lineId).toBe('northern');
      expect(parsed.action).toBe('show-disruption');
    });

    it('should navigate to /(tabs) overview directly when intent is overview', () => {
      const mockRouter = {
        navigate: jest.fn(),
        replace: jest.fn(),
        push: jest.fn(),
      };

      navigateToIntent(mockRouter as any, { action: 'overview' });

      expect(mockRouter.replace).not.toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenCalledWith('/(tabs)');
    });

    it('should preserve action differentiation between normal tap (show-disruption) and long-press (show-reroute)', () => {
      const mockRouter = {
        navigate: jest.fn(),
        replace: jest.fn(),
        push: jest.fn(),
      };

      // Normal tap on banner -> show-disruption (opens in-detail card on dashboard)
      const normalTapIntent: NotificationIntent = {
        action: 'show-disruption',
        lineId: 'piccadilly',
        initialSection: 'overview',
      };
      navigateToIntent(mockRouter as any, normalTapIntent);
      let callArg = mockRouter.navigate.mock.calls[0][0];
      let parsed = JSON.parse(callArg.params.notificationIntent);
      expect(parsed.action).toBe('show-disruption');
      expect(parsed.lineId).toBe('piccadilly');

      // Long-press quick action [View Reroute 🚇] -> show-reroute (opens RerouteScreen)
      const quickActionIntent: NotificationIntent = {
        action: 'show-reroute',
        lineId: 'piccadilly',
        initialSection: 'alternatives',
      };
      navigateToIntent(mockRouter as any, quickActionIntent);
      callArg = mockRouter.navigate.mock.calls[1][0];
      parsed = JSON.parse(callArg.params.notificationIntent);
      expect(parsed.action).toBe('show-reroute');
      expect(parsed.initialSection).toBe('alternatives');
    });
  });

  describe('The Banner is the First Screen (Actionable Dispatch)', () => {
    it('should construct rich decision copy with top alternative and delta minutes', async () => {
      await presentDisruptionNotification({
        lineId: 'piccadilly',
        lineName: 'Piccadilly',
        statusDescription: 'Severe Delays',
        reason: 'Signal failure at Covent Garden',
        severity: 6,
      });

      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
      const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];

      expect(call.content.title).toBe('Disruption on Piccadilly line');
      expect(call.content.body).toBe(
        'Severe Delays (Signal failure at Covent Garden). District line running normally, +6 min.'
      );
      expect(call.content.categoryIdentifier).toBe('REROUTE_ONLY');
      expect(call.content.data.action).toBe('show-disruption');
      expect(call.content.data.lineId).toBe('piccadilly');
      expect(call.content.data.alternative.lineId).toBe('district');
      expect(call.content.data.alternative.deltaMinutes).toBe(6);
    });
  });
});
