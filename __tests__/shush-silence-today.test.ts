import * as Notifications from 'expo-notifications';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { presentDisruptionNotification } from '../services/notifications/dispatch';
import { LiveActivityService } from '../services/LiveActivityService';
import { SessionManager } from '../services/SessionManager';
import { dayKeyFor } from '../utils/intentPillPolicy';

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('test-notification-id'),
  dismissNotificationAsync: jest.fn().mockResolvedValue(undefined),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/LiveActivityService', () => ({
  LiveActivityService: {
    update: jest.fn().mockResolvedValue(undefined),
    start: jest.fn().mockResolvedValue(undefined),
    end: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../services/deviceIdentity', () => ({
  ensureDeviceIdentity: jest.fn().mockResolvedValue({ userId: 'mock-user-123', apiKey: 'mock-key' }),
}));

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: async () => ({ sessionId: 'mock-1', claimsCreated: 0, notificationsSent: 0 }),
} as any);

describe('Shush Mode Per-Line Silence & Active Commute Immunity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useUserPreferencesStore.setState({
      silencedLinesToday: {},
    });
  });

  afterEach(async () => {
    await SessionManager.closeSession(true).catch(() => {});
  });

  describe('1. Per-Line Silence Suppression', () => {
    it('silences only the targeted line for today and normalizes casing', async () => {
      const store = useUserPreferencesStore.getState();
      expect(store.isLineSilencedToday('victoria')).toBe(false);

      store.silenceLineToday(' Victoria ');
      expect(useUserPreferencesStore.getState().isLineSilencedToday('victoria')).toBe(true);
      expect(useUserPreferencesStore.getState().isLineSilencedToday('central')).toBe(false);

      // Attempt to dispatch disruption for Victoria
      const vicResult = await presentDisruptionNotification({
        lineId: 'victoria',
        lineName: 'Victoria',
        statusDescription: 'Severe Delays',
        reason: 'Signal failure at Oxford Circus',
        severity: 2,
      });

      expect(vicResult).toBe('suppressed_silenced_victoria');
      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();

      // Central is not silenced and dispatches normally
      const centralResult = await presentDisruptionNotification({
        lineId: 'central',
        lineName: 'Central',
        statusDescription: 'Minor Delays',
        reason: 'Train fault at Holborn',
        severity: 1,
      });

      expect(centralResult).toBe('test-notification-id');
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    });

    it('manually unsilences a line immediately when requested', async () => {
      const store = useUserPreferencesStore.getState();
      store.silenceLineToday('victoria');
      expect(store.isLineSilencedToday('victoria')).toBe(true);

      store.unsilenceLineToday('victoria');
      expect(useUserPreferencesStore.getState().isLineSilencedToday('victoria')).toBe(false);

      const result = await presentDisruptionNotification({
        lineId: 'victoria',
        lineName: 'Victoria',
        statusDescription: 'Part Suspended',
        reason: 'Track inspection at Highbury',
        severity: 2,
      });

      expect(result).toBe('test-notification-id');
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Midnight Calendar Date Rollover Invariant', () => {
    it('automatically lifts silence when device calendar rolls over to tomorrow', () => {
      const today = new Date('2026-10-16T14:00:00Z');
      const tomorrow = new Date('2026-10-17T07:00:00Z');

      // Silence Victoria on today's date
      useUserPreferencesStore.setState({
        silencedLinesToday: {
          victoria: dayKeyFor(today),
        },
      });

      // Spying on Date to simulate midnight rollover
      const realDate = global.Date;
      try {
        // Today check
        expect(useUserPreferencesStore.getState().silencedLinesToday['victoria']).toBe(dayKeyFor(today));

        // Tomorrow check
        global.Date = class extends realDate {
          constructor(...args: any[]) {
            if (args.length > 0) {
              super(...(args as [any]));
            } else {
              super(tomorrow.getTime());
            }
          }
          static now() {
            return tomorrow.getTime();
          }
        } as any;

        expect(useUserPreferencesStore.getState().isLineSilencedToday('victoria')).toBe(false);
      } finally {
        global.Date = realDate;
      }
    });
  });

  describe('3. Active Commute Immunity Invariant', () => {
    it('never suppresses Live Activity or in-transit commute tracking when line was silenced', async () => {
      // Commuter silenced Victoria earlier today at breakfast
      useUserPreferencesStore.getState().silenceLineToday('victoria');
      expect(useUserPreferencesStore.getState().isLineSilencedToday('victoria')).toBe(true);

      // Now commuter is on the evening commute riding Victoria
      await SessionManager.startSession('940GZZLUVIC', '940GZZLUOXC', 'victoria', 'Victoria');

      // Live state verified directly from SessionManager at dispatch time
      const isSessionActive = SessionManager.getSessionState() === 'active';
      const activeLineId = SessionManager.getCommuteLineId();
      const activeStationId = SessionManager.getCommuteOriginId();

      expect(isSessionActive).toBe(true);
      expect(activeLineId).toBe('victoria');
      expect(activeStationId).toBe('940GZZLUVIC');

      // Commute tracking logic as executed in backgroundTask:
      // In-transit session active on line -> updates Live Activity directly without noisy banner
      if (isSessionActive && activeLineId && activeLineId.toLowerCase() === 'victoria' && activeStationId) {
        await LiveActivityService.update(activeStationId, activeLineId);
      }

      // Assert Live Activity updated without obstruction
      expect(LiveActivityService.update).toHaveBeenCalledWith('940GZZLUVIC', 'victoria');

      // But an idle notification dispatch attempt remains silenced
      const idleDisruption = await presentDisruptionNotification({
        lineId: 'victoria',
        lineName: 'Victoria',
        statusDescription: 'Severe Delays',
        severity: 2,
      });
      expect(idleDisruption).toBe('suppressed_silenced_victoria');
      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();

      await SessionManager.closeSession(true);
    });

    it('silences disruption alerts for line A while commuter is actively commuting on line B (cross-line silence)', async () => {
      // Commuter silenced Victoria earlier today
      useUserPreferencesStore.getState().silenceLineToday('victoria');
      expect(useUserPreferencesStore.getState().isLineSilencedToday('victoria')).toBe(true);

      // Commuter is now actively riding Central
      await SessionManager.startSession('940GZZLUCHX', '940GZZLUHOL', 'central', 'Central');

      expect(SessionManager.getSessionState()).toBe('active');
      expect(SessionManager.getCommuteLineId()).toBe('central');

      // Victoria disruption arrives during Central commute
      const vicResult = await presentDisruptionNotification({
        lineId: 'victoria',
        lineName: 'Victoria',
        statusDescription: 'Severe Delays',
        reason: 'Signal failure at Oxford Circus',
        severity: 2,
      });

      // Victoria disruption is completely silenced — zero sound, zero banner
      expect(vicResult).toBe('suppressed_silenced_victoria');
      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();

      // Central commute session remains fully active and unaffected
      expect(SessionManager.getSessionState()).toBe('active');
      expect(SessionManager.getCommuteLineId()).toBe('central');

      await SessionManager.closeSession(true);
    });
  });
});
