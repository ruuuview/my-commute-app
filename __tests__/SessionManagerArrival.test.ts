import { SessionManager } from '../services/SessionManager';
import { LiveActivityService } from '../services/LiveActivityService';
import { createMMKV } from 'react-native-mmkv';

const storage = createMMKV({ id: 'background-storage' });

jest.mock('../services/LiveActivityService', () => ({
  LiveActivityService: {
    start: jest.fn().mockResolvedValue('activity-123'),
    update: jest.fn().mockResolvedValue(undefined),
    updatePhase: jest.fn().mockResolvedValue(undefined),
    end: jest.fn().mockResolvedValue(undefined),
    isActive: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notification-id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}));

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: async () => ({ sessionId: 'mock-1', claimsCreated: 0, notificationsSent: 0 }),
} as any);

describe('SessionManager Arrival & Live Activity Integration', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await SessionManager.closeSession(true);
  });

  afterEach(async () => {
    await SessionManager.closeSession(true);
  });

  it('initializes activeDetector and approaching phase on startSession', async () => {
    const originId = '940GZZLUKSX'; // King's Cross
    const destId = '940GZZLUOXC';   // Oxford Circus
    const lineId = 'victoria';

    await SessionManager.startSession(originId, destId, lineId, 'Victoria');

    expect(SessionManager.getSessionState()).toBe('active');
    expect(storage.getString('commute_phase')).toBe('approaching');
    expect(storage.getString('commute_destination_id')).toBe(destId);
    expect(SessionManager.getActiveDetector()).not.toBeNull();
  });

  it('transitions to in_transit phase upon origin geofence exit', async () => {
    const originId = '940GZZLUKSX';
    const destId = '940GZZLUOXC';
    const lineId = 'victoria';

    await SessionManager.startSession(originId, destId, lineId, 'Victoria');
    await SessionManager.handleGeofenceExit(originId, "King's Cross");

    expect(storage.getString('commute_phase')).toBe('in_transit');
    expect(LiveActivityService.updatePhase).toHaveBeenCalledWith('in_transit');
  });

  it('updates phase to arrived when ArrivalDetector confirms destination arrival', async () => {
    const originId = '940GZZLUKSX';
    const destId = '940GZZLUOXC'; // Oxford Circus: lat: 51.5152, lon: -0.1418
    const lineId = 'victoria';

    await SessionManager.startSession(originId, destId, lineId, 'Victoria');

    // Simulate 90s dwell at destination (Oxford Circus)
    const t0 = 1000000;
    const destLat = 51.5152;
    const destLon = -0.1418;

    SessionManager.handleLocationFix({
      latitude: destLat,
      longitude: destLon,
      accuracyMeters: 10,
      speedKmh: 1.0,
      timestampMs: t0,
    });

    SessionManager.handleLocationFix({
      latitude: destLat,
      longitude: destLon,
      accuracyMeters: 10,
      speedKmh: 1.0,
      timestampMs: t0 + 95 * 1000,
    });

    // Simulate walking away towards exit: 130m displacement at 5 km/h
    // 130m north: dLat ~ 130 / 111139 = 0.001169
    const exitLat = destLat + 0.00117;
    const result = SessionManager.handleLocationFix({
      latitude: exitLat,
      longitude: destLon,
      accuracyMeters: 12,
      speedKmh: 5.0,
      timestampMs: t0 + 120 * 1000,
    });

    expect(result?.state).toBe('confirmed_arrival');
    expect(storage.getString('commute_phase')).toBe('arrived');
    expect(LiveActivityService.updatePhase).toHaveBeenCalledWith('arrived', expect.any(String));
  });

  it('cleans up detector and phase storage on closeSession', async () => {
    await SessionManager.startSession('940GZZLUKSX', '940GZZLUOXC', 'victoria', 'Victoria');
    await SessionManager.closeSession(false);

    expect(SessionManager.getSessionState()).toBe('idle');
    expect(SessionManager.getActiveDetector()).toBeNull();
    expect(storage.getString('commute_phase')).toBeFalsy();
    expect(storage.getString('commute_origin_id')).toBeFalsy();
  });
});
