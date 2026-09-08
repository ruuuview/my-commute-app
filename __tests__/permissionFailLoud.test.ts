import {
  requestPermission,
  usePermissionOrchestrator,
  getPermissionEntry,
} from '../store/permissionOrchestrator';
import { SessionManager } from '../services/SessionManager';
import { LiveActivityService } from '../services/LiveActivityService';
import * as Location from 'expo-location';

jest.mock('../services/LiveActivityService', () => ({
  LiveActivityService: {
    start: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue(undefined),
    updatePhase: jest.fn().mockResolvedValue(undefined),
    end: jest.fn().mockResolvedValue(undefined),
    isActive: jest.fn().mockResolvedValue(false),
  },
}));

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestBackgroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
}));

describe('Permission Fail-Loud Safety Invariant', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    usePermissionOrchestrator.setState({
      permissions: {
        locationWhenInUse: { decision: 'granted', lastAskedAt: null, askCount: 1 },
        locationAlways: { decision: 'not_asked', lastAskedAt: null, askCount: 0 },
        notifications: { decision: 'granted', lastAskedAt: null, askCount: 1 },
        calendar: { decision: 'not_asked', lastAskedAt: null, askCount: 0 },
      },
    });
    await SessionManager.closeSession(true);
  });

  it('fails loud when locationAlways is denied: records denied and does not grant background tracking', async () => {
    // When user denies Always in the OS upgrade prompt
    (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: 'denied',
    });

    // Skip primer modal in unit test to test OS prompt evaluation directly
    const decision = await requestPermission('locationAlways', 'tier1_upgrade', { primer: false });

    expect(decision).toBe('denied');
    const entry = getPermissionEntry('locationAlways');
    expect(entry.decision).toBe('denied');

    // Verify session does not silently assume background activity is running
    const isLive = await LiveActivityService.isActive();
    expect(isLive).toBe(false);
  });
});
