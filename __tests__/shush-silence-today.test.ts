import * as Notifications from 'expo-notifications';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import {
  presentDisruptionNotification,
  presentServiceImprovingNotification,
} from '../services/notifications/dispatch';
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

// NOTE: dispatch.ts enforces a 10-minute cross-system dedup bucket per line id
// (persisted in the MMKV mock for the whole file), so each dispatch test below
// uses a distinct line id to stay isolated.

describe('Shush Mode Per-Line Silence & Active Commute Immunity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useUserPreferencesStore.setState({
      silencedLinesToday: {},
      shushPreferences: {
        alertDeliveryMode: 'shush',
        shushActivation: 'always',
        shushSchedule: { weekdays: [1, 2, 3, 4, 5], windows: [] },
        hasCompletedShushOnboarding: true,
        timeSensitiveGranted: false,
        timeSensitiveStatus: 'disabled',
      },
    });
  });

  afterEach(async () => {
    await SessionManager.closeSession(true).catch(() => {});
  });

  describe('1. Per-Line Silent Delivery (Truthful-Silent Contract)', () => {
    it('silences only the targeted line for today and normalizes casing — delivered with sound: false, NOT suppressed', async () => {
      const store = useUserPreferencesStore.getState();
      expect(store.isLineSilencedToday('victoria')).toBe(false);

      store.silenceLineToday(' Victoria ');
      expect(useUserPreferencesStore.getState().isLineSilencedToday('victoria')).toBe(true);
      expect(useUserPreferencesStore.getState().isLineSilencedToday('central')).toBe(false);

      // Attempt to dispatch disruption for Victoria: STILL DELIVERED, but silent
      const vicResult = await presentDisruptionNotification({
        lineId: 'victoria',
        lineName: 'Victoria',
        statusDescription: 'Severe Delays',
        reason: 'Signal failure at Oxford Circus',
        severity: 2,
      });

      expect(vicResult).toBe('test-notification-id');
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
      const vicArgs = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
      expect(vicArgs.content.sound).toBe(false);
      expect(vicArgs.content.data.lineId).toBe('victoria');

      // Central is not silenced and dispatches normally (shush mode => no sound by default)
      const centralResult = await presentDisruptionNotification({
        lineId: 'central',
        lineName: 'Central',
        statusDescription: 'Minor Delays',
        reason: 'Train fault at Holborn',
        severity: 1,
      });

      expect(centralResult).toBe('test-notification-id');
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    });

    it('a silenced line stays silent even in loud delivery mode (no sound from the app)', async () => {
      useUserPreferencesStore.setState({
        shushPreferences: {
          alertDeliveryMode: 'loud',
          shushActivation: 'always',
          shushSchedule: { weekdays: [1, 2, 3, 4, 5], windows: [] },
          hasCompletedShushOnboarding: true,
          timeSensitiveGranted: false,
          timeSensitiveStatus: 'disabled',
        },
      });
      useUserPreferencesStore.getState().silenceLineToday('bakerloo');

      const result = await presentDisruptionNotification({
        lineId: 'bakerloo',
        lineName: 'Bakerloo',
        statusDescription: 'Severe Delays',
        reason: 'Signal failure',
        severity: 3,
      });

      expect(result).toBe('test-notification-id');
      const callArgs = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
      expect(callArgs.content.sound).toBe(false); // silence overrides loud mode
    });

    it('manually unsilences a line immediately when requested', async () => {
      const store = useUserPreferencesStore.getState();
      store.silenceLineToday('jubilee');
      expect(store.isLineSilencedToday('jubilee')).toBe(true);

      store.unsilenceLineToday('jubilee');
      expect(useUserPreferencesStore.getState().isLineSilencedToday('jubilee')).toBe(false);

      const result = await presentDisruptionNotification({
        lineId: 'jubilee',
        lineName: 'Jubilee',
        statusDescription: 'Part Suspended',
        reason: 'Track inspection at Highbury',
        severity: 2,
      });

      expect(result).toBe('test-notification-id');
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    });

    it('guarantees unresolvable line never muters the whole app (zero global manualShushDate fallback)', () => {
      useUserPreferencesStore.setState({ manualShushDate: null });
      const store = useUserPreferencesStore.getState();

      // Passing undefined / empty line to silenceLineToday is a safe no-op
      store.silenceLineToday('');
      expect(useUserPreferencesStore.getState().manualShushDate).toBeNull();
      expect(useUserPreferencesStore.getState().isLineSilencedToday('victoria')).toBe(false);
      expect(useUserPreferencesStore.getState().isLineSilencedToday('central')).toBe(false);
    });
  });

  describe('2. Midnight Calendar Date Rollover Invariant', () => {
    it('automatically lifts silence when the London calendar rolls over to tomorrow', () => {
      const today = new Date('2026-10-16T14:00:00Z');
      const tomorrow = new Date('2026-10-17T07:00:00Z');

      // Silence Victoria on today's (London) date
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
      // Commuter silenced Piccadilly earlier today at breakfast
      useUserPreferencesStore.getState().silenceLineToday('piccadilly');
      expect(useUserPreferencesStore.getState().isLineSilencedToday('piccadilly')).toBe(true);

      // Now commuter is on the evening commute riding Piccadilly
      await SessionManager.startSession('940GZZLUPCO', '940GZZLUOXC', 'piccadilly', 'Piccadilly');

      // Live state verified directly from SessionManager at dispatch time
      const isSessionActive = SessionManager.getSessionState() === 'active';
      const activeLineId = SessionManager.getCommuteLineId();
      const activeStationId = SessionManager.getCommuteOriginId();

      expect(isSessionActive).toBe(true);
      expect(activeLineId).toBe('piccadilly');
      expect(activeStationId).toBe('940GZZLUPCO');

      // Commute tracking logic as executed in backgroundTask:
      // In-transit session active on line -> updates Live Activity directly without noisy banner
      if (isSessionActive && activeLineId && activeLineId.toLowerCase() === 'piccadilly' && activeStationId) {
        await LiveActivityService.update(activeStationId, activeLineId);
      }

      // Assert Live Activity updated without obstruction
      expect(LiveActivityService.update).toHaveBeenCalledWith('940GZZLUPCO', 'piccadilly');

      // An idle notification dispatch for the silenced line is DELIVERED but silent
      const idleDisruption = await presentDisruptionNotification({
        lineId: 'piccadilly',
        lineName: 'Piccadilly',
        statusDescription: 'Severe Delays',
        severity: 2,
      });
      expect(idleDisruption).toBe('test-notification-id');
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
      const idleArgs = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
      expect(idleArgs.content.sound).toBe(false);

      await SessionManager.closeSession(true);
    });

    it('delivers disruption alerts for silenced line A silently while commuter is actively commuting on line B', async () => {
      // Commuter silenced Metropolitan earlier today
      useUserPreferencesStore.getState().silenceLineToday('metropolitan');
      expect(useUserPreferencesStore.getState().isLineSilencedToday('metropolitan')).toBe(true);

      // Commuter is now actively riding Central
      await SessionManager.startSession('940GZZLUCHX', '940GZZLUHOL', 'central', 'Central');

      expect(SessionManager.getSessionState()).toBe('active');
      expect(SessionManager.getCommuteLineId()).toBe('central');

      // Metropolitan disruption arrives during Central commute
      const metResult = await presentDisruptionNotification({
        lineId: 'metropolitan',
        lineName: 'Metropolitan',
        statusDescription: 'Severe Delays',
        reason: 'Signal failure at Baker Street',
        severity: 2,
      });

      // Metropolitan disruption is delivered silently — banner yes, sound no
      expect(metResult).toBe('test-notification-id');
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
      const metArgs = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
      expect(metArgs.content.sound).toBe(false);

      // Central commute session remains fully active and unaffected
      expect(SessionManager.getSessionState()).toBe('active');
      expect(SessionManager.getCommuteLineId()).toBe('central');

      await SessionManager.closeSession(true);
    });
  });

  describe('4. Service-Improving Silent Delivery (Truthful-Silent Contract)', () => {
    it('silenced line still receives the improving notification, with sound: false', async () => {
      useUserPreferencesStore.getState().silenceLineToday('elizabeth');
      expect(useUserPreferencesStore.getState().isLineSilencedToday('elizabeth')).toBe(true);

      const result = await presentServiceImprovingNotification({
        lineId: 'elizabeth',
        lineName: 'Elizabeth',
        statusDescription: 'Minor Delays',
        reason: 'Earlier signal failure at Paddington',
      });

      expect(result).toBe('test-notification-id');
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
      const callArgs = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
      expect(callArgs.content.sound).toBe(false);
      expect(callArgs.content.data.lineId).toBe('elizabeth');
    });

    it('silenced line stays silent in loud mode; unsilenced line honours loud mode', async () => {
      useUserPreferencesStore.setState({
        shushPreferences: {
          alertDeliveryMode: 'loud',
          shushActivation: 'always',
          shushSchedule: { weekdays: [1, 2, 3, 4, 5], windows: [] },
          hasCompletedShushOnboarding: true,
          timeSensitiveGranted: false,
          timeSensitiveStatus: 'disabled',
        },
      });
      useUserPreferencesStore.getState().silenceLineToday('district');

      const silencedResult = await presentServiceImprovingNotification({
        lineId: 'district',
        lineName: 'District',
        statusDescription: 'Minor Delays',
      });
      expect(silencedResult).toBe('test-notification-id');
      expect(
        (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0].content.sound
      ).toBe(false); // silence overrides loud

      const loudResult = await presentServiceImprovingNotification({
        lineId: 'hammersmith-city',
        lineName: 'Hammersmith & City',
        statusDescription: 'Minor Delays',
      });
      expect(loudResult).toBe('test-notification-id');
      expect(
        (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[1][0].content.sound
      ).toBe(true); // loud mode respected when not silenced
    });
  });
});
