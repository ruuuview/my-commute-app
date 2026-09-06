import * as Notifications from 'expo-notifications';
import {
  isLineId,
  resolveRerouteTarget,
  KNOWN_LINE_IDS,
} from '../services/notifications/payload';
import {
  presentDisruptionNotification,
  presentServiceRecoveryNotification,
  presentServiceImprovingNotification,
} from '../services/notifications/dispatch';

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('mock-notification-id'),
  setNotificationCategoryAsync: jest.fn().mockResolvedValue(undefined),
}));

describe('Notifications Poka-Yoke & Routing Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('LineId validation (isLineId)', () => {
    it('should validate all canonical TfL line IDs', () => {
      for (const lineId of KNOWN_LINE_IDS) {
        expect(isLineId(lineId)).toBe(true);
      }
    });

    it('should handle case insensitivity and whitespace', () => {
      expect(isLineId(' Northern ')).toBe(true);
      expect(isLineId('PICCADILLY')).toBe(true);
      expect(isLineId('District')).toBe(true);
    });

    it('should reject invalid or malformed line IDs', () => {
      expect(isLineId('')).toBe(false);
      expect(isLineId(null)).toBe(false);
      expect(isLineId(undefined)).toBe(false);
      expect(isLineId(123)).toBe(false);
      expect(isLineId({})).toBe(false);
      expect(isLineId('random-line')).toBe(false);
      expect(isLineId('victoria-line-fake')).toBe(false);
    });
  });

  describe('resolveRerouteTarget (Poka-Yoke Rung 1)', () => {
    it('should resolve valid lineId from notification data without guessing', () => {
      expect(resolveRerouteTarget({ lineId: 'northern' })).toBe('northern');
      expect(resolveRerouteTarget({ lineId: 'piccadilly' })).toBe('piccadilly');
      expect(resolveRerouteTarget({ lineId: 'central' })).toBe('central');
      expect(resolveRerouteTarget({ lineId: 'victoria' })).toBe('victoria');
    });

    it('should resolve lineId from nested disruption object', () => {
      expect(resolveRerouteTarget({ disruption: { lineId: 'jubilee' } })).toBe('jubilee');
    });

    it('CRITICAL: should return null (NEVER fallback to victoria) when lineId is missing', () => {
      expect(resolveRerouteTarget({})).toBeNull();
      expect(resolveRerouteTarget({ unrelated: 'data' })).toBeNull();
      expect(resolveRerouteTarget(null)).toBeNull();
      expect(resolveRerouteTarget(undefined)).toBeNull();
    });

    it('CRITICAL: should return null when lineId is invalid or unrecognized', () => {
      expect(resolveRerouteTarget({ lineId: 'unrecognized-transit' })).toBeNull();
      expect(resolveRerouteTarget({ lineId: '' })).toBeNull();
      expect(resolveRerouteTarget({ lineId: null })).toBeNull();
    });
  });

  describe('Notification Dispatch Layer', () => {
    it('should dispatch disruption notification with REROUTE_ONLY category and typed lineId', async () => {
      const id = await presentDisruptionNotification({
        lineId: 'piccadilly',
        lineName: 'Piccadilly',
        statusDescription: 'Severe Delays',
        reason: 'Signal failure at Covent Garden',
        severity: 6,
      });

      expect(id).toBe('mock-notification-id');
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);

      const callArgs = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
      expect(callArgs.content.categoryIdentifier).toBe('REROUTE_ONLY');
      expect(callArgs.content.title).toBe('Disruption on Piccadilly line');
      expect(callArgs.content.body).toContain('Severe Delays');
      expect(callArgs.content.body).toContain('Signal failure at Covent Garden');
      expect(callArgs.content.data.lineId).toBe('piccadilly');
      expect(callArgs.content.data.type).toBe('COMMUTE_DISRUPTION');
      expect(callArgs.content.data.severity).toBe(6);
    });

    it('should dispatch service recovery notification with COMMUTE_STATUS category', async () => {
      await presentServiceRecoveryNotification({
        lineId: 'northern',
        lineName: 'Northern',
      });

      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
      const callArgs = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
      expect(callArgs.content.categoryIdentifier).toBe('COMMUTE_STATUS');
      expect(callArgs.content.title).toBe('Service cleared on Northern line');
      expect(callArgs.content.data.lineId).toBe('northern');
      expect(callArgs.content.data.type).toBe('SERVICE_RECOVERED');
    });

    it('should dispatch service improving notification with COMMUTE_STATUS category', async () => {
      await presentServiceImprovingNotification({
        lineId: 'central',
        lineName: 'Central',
        statusDescription: 'Minor Delays',
        reason: 'Earlier faulty train',
      });

      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
      const callArgs = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
      expect(callArgs.content.categoryIdentifier).toBe('COMMUTE_STATUS');
      expect(callArgs.content.title).toBe('Service improving on Central line');
      expect(callArgs.content.data.lineId).toBe('central');
      expect(callArgs.content.data.type).toBe('SERVICE_IMPROVING');
    });
  });

  describe('End-to-End Notification Tap to Route Simulation (Poka-Yoke Proof)', () => {
    function simulateNotificationTap(response: any, routerMock: { replace: jest.Mock }) {
      const data = response.notification?.request?.content?.data;
      const categoryId = response.notification?.request?.content?.categoryIdentifier;
      const actionId = response.actionIdentifier;
      const effectiveCategory = categoryId || data?.category || data?.type;

      if (
        effectiveCategory === 'REROUTE_ONLY' ||
        effectiveCategory === 'COMMUTE_DISRUPTION_V2' ||
        effectiveCategory === 'COMMUTE_DISRUPTION' ||
        actionId === 'view_reroute'
      ) {
        const resolvedLine = resolveRerouteTarget(data);
        if (resolvedLine) {
          routerMock.replace({
            pathname: '/(tabs)',
            params: { openRerouteLineId: resolvedLine },
          });
        } else {
          routerMock.replace('/(tabs)');
        }
      }
    }

    it('routes Northern line disruption strictly to openRerouteLineId: northern', () => {
      const routerMock = { replace: jest.fn() };
      simulateNotificationTap(
        {
          actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
          notification: {
            request: {
              content: {
                categoryIdentifier: 'REROUTE_ONLY',
                title: 'Disruption on Northern line',
                data: { lineId: 'northern', type: 'COMMUTE_DISRUPTION' },
              },
            },
          },
        },
        routerMock
      );
      expect(routerMock.replace).toHaveBeenCalledWith({
        pathname: '/(tabs)',
        params: { openRerouteLineId: 'northern' },
      });
    });

    it('routes Piccadilly line disruption strictly to openRerouteLineId: piccadilly', () => {
      const routerMock = { replace: jest.fn() };
      simulateNotificationTap(
        {
          actionIdentifier: 'view_reroute',
          notification: {
            request: {
              content: {
                categoryIdentifier: 'REROUTE_ONLY',
                title: 'Severe Delays — Piccadilly Line',
                data: { lineId: 'piccadilly', type: 'COMMUTE_DISRUPTION' },
              },
            },
          },
        },
        routerMock
      );
      expect(routerMock.replace).toHaveBeenCalledWith({
        pathname: '/(tabs)',
        params: { openRerouteLineId: 'piccadilly' },
      });
    });

    it('routes Central line disruption strictly to openRerouteLineId: central', () => {
      const routerMock = { replace: jest.fn() };
      simulateNotificationTap(
        {
          actionIdentifier: 'view_reroute',
          notification: {
            request: {
              content: {
                categoryIdentifier: 'REROUTE_ONLY',
                title: 'Part Closure — Central Line',
                data: { lineId: 'central', type: 'COMMUTE_DISRUPTION' },
              },
            },
          },
        },
        routerMock
      );
      expect(routerMock.replace).toHaveBeenCalledWith({
        pathname: '/(tabs)',
        params: { openRerouteLineId: 'central' },
      });
    });

    it('NEVER defaults to Victoria if notification payload has NO lineId — lands cleanly on /(tabs)', () => {
      const routerMock = { replace: jest.fn() };
      simulateNotificationTap(
        {
          actionIdentifier: 'view_reroute',
          notification: {
            request: {
              content: {
                categoryIdentifier: 'REROUTE_ONLY',
                title: 'Service alert',
                data: {},
              },
            },
          },
        },
        routerMock
      );
      expect(routerMock.replace).toHaveBeenCalledWith('/(tabs)');
      expect(routerMock.replace).not.toHaveBeenCalledWith(
        expect.objectContaining({ params: { openRerouteLineId: 'victoria' } })
      );
    });

    it('NEVER defaults to Victoria if notification data is completely undefined — lands cleanly on /(tabs)', () => {
      const routerMock = { replace: jest.fn() };
      simulateNotificationTap(
        {
          actionIdentifier: 'view_reroute',
          notification: {
            request: {
              content: {
                categoryIdentifier: 'REROUTE_ONLY',
                title: 'Service alert',
              },
            },
          },
        },
        routerMock
      );
      expect(routerMock.replace).toHaveBeenCalledWith('/(tabs)');
      expect(routerMock.replace).not.toHaveBeenCalledWith(
        expect.objectContaining({ params: { openRerouteLineId: 'victoria' } })
      );
    });
  });
});
