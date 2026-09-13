import { LiveActivityService } from '../services/LiveActivityService';
import { SessionManager } from '../services/SessionManager';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { createMMKV } from 'react-native-mmkv';
import * as Notifications from 'expo-notifications';

const backgroundStorage = createMMKV({ id: 'background-storage' });
const tier2Storage = createMMKV({ id: 'tier2-cache' });

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted', canAskAgain: true }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  SchedulableTriggerInputTypes: {
    TIME_INTERVAL: 'timeInterval',
  },
}));

jest.mock('../modules/my-commute-live-activity', () => ({
  startCommuteActivity: jest.fn().mockResolvedValue('activity-123'),
  updateCommuteActivity: jest.fn().mockResolvedValue(undefined),
  endCommuteActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/tier2Cache', () => {
  const actual = jest.requireActual('../services/tier2Cache');
  return {
    ...actual,
    triggerTier2Grab: jest.fn(),
  };
});

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: async () => ({ sessionId: 'mock-1', claimsCreated: 0, notificationsSent: 0 }),
} as any);

describe('Subterranean Offline Transit & Exit Architecture', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await SessionManager.closeSession(true);
    backgroundStorage.clearAll();
    tier2Storage.clearAll();
    useUserPreferencesStore.setState({
      selectedLines: ['northern'],
      pinnedStations: [
        { id: '940GZZLUCTN', name: 'Camden Town', lines: ['northern'], zone: 2, role: 'home' },
        { id: '940GZZLUHPD', name: 'Hampstead', lines: ['northern'], zone: 2, role: 'work' },
      ],
      labelsConfirmed: true,
      arrivalNotificationsEnabled: true,
    });
  });

  afterEach(async () => {
    await SessionManager.closeSession(true);
    backgroundStorage.clearAll();
    tier2Storage.clearAll();
  });

  describe('Dual-Engine Live Activity: Offline Tunnel Tracking', () => {
    it('sets tunnelState to offline and calculates physical delay when ETA is stale', () => {
      const nowUnix = Math.floor(Date.now() / 1000);
      // Journey started 20 minutes ago (typical leg baseline is 12 min -> 8 min delay)
      const sessionStartTime = nowUnix - 20 * 60;

      backgroundStorage.set('commute_origin_id', '940GZZLUCTN');
      backgroundStorage.set('commute_destination_id', '940GZZLUHPD');
      backgroundStorage.set('commute_line_id', 'northern');
      backgroundStorage.set('commute_phase', 'in_transit');
      backgroundStorage.set('commute_session_start_time', sessionStartTime);
      // Stale ETA from 3 minutes ago
      backgroundStorage.set('commute_next_station_eta_timestamp', nowUnix - 180);

      tier2Storage.set(
        'tier2:940GZZLUCTN',
        JSON.stringify({
          stationId: '940GZZLUCTN',
          lineId: 'northern',
          disruption: null,
          platforms: [
            {
              platformName: 'Northbound - Platform 1',
              destinationName: 'Hampstead',
              expectedArrival: new Date(Date.now() + 60000).toISOString(),
              timeToStation: 60,
            },
          ],
          grabbedAt: new Date().toISOString(),
          arrivalsLastUpdated: new Date().toISOString(),
        })
      );

      const payload = LiveActivityService.buildPayload('940GZZLUCTN', 'northern');

      expect(payload).not.toBeNull();
      expect(payload!.isStaleEta).toBe(true);
      expect(payload!.tunnelState).toBe('offline');
      // 20m elapsed - 12m baseline = ~8m delay
      expect(payload!.delayMinutes).toBeGreaterThanOrEqual(7);
      expect(payload!.sessionStartTime).toBe(sessionStartTime);
    });

    it('keeps normal online mode when fresh arrivals and ETA are present', () => {
      const nowUnix = Math.floor(Date.now() / 1000);
      const sessionStartTime = nowUnix - 5 * 60; // 5m in transit

      backgroundStorage.set('commute_origin_id', '940GZZLUCTN');
      backgroundStorage.set('commute_destination_id', '940GZZLUHPD');
      backgroundStorage.set('commute_line_id', 'northern');
      backgroundStorage.set('commute_phase', 'in_transit');
      backgroundStorage.set('commute_session_start_time', sessionStartTime);
      backgroundStorage.set('commute_next_station_eta_timestamp', nowUnix + 120);

      tier2Storage.set(
        'tier2:940GZZLUCTN',
        JSON.stringify({
          stationId: '940GZZLUCTN',
          lineId: 'northern',
          disruption: null,
          platforms: [
            {
              platformName: 'Northbound - Platform 1',
              destinationName: 'Hampstead',
              expectedArrival: new Date(Date.now() + 60000).toISOString(),
              timeToStation: 60,
            },
          ],
          grabbedAt: new Date().toISOString(),
          arrivalsLastUpdated: new Date().toISOString(),
        })
      );

      const payload = LiveActivityService.buildPayload('940GZZLUCTN', 'northern');

      expect(payload).not.toBeNull();
      expect(payload!.isStaleEta).toBe(false);
      expect(payload!.tunnelState).toBe('normal');
      expect(payload!.delayMinutes).toBe(0);
    });
  });

  describe('Subterranean Exit & Settings Hygiene', () => {
    it('closes session cleanly without scheduling 5-minute sofa spam notifications upon reaching destination', async () => {
      await SessionManager.startSession('940GZZLUCTN', '940GZZLUHPD', 'northern', 'Northern');
      expect(SessionManager.getSessionState()).toBe('active');

      // Commuter surfaces at destination station geofence
      await SessionManager.handleGeofenceEnter('940GZZLUHPD', 'work', 'Hampstead');

      // Session closes cleanly
      expect(SessionManager.getSessionState()).toBe('idle');

      // Invariant: Zero arrived-consent-prompt notification scheduled
      const scheduledCalls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls;
      const arrivalCall = scheduledCalls.find(
        (call) => call[0]?.identifier === 'arrived-consent-prompt' || call[0]?.content?.title?.includes('Welcome home')
      );
      expect(arrivalCall).toBeUndefined();
    });
  });
});
