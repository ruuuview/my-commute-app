// frontend/__tests__/live-activity-token-listener.test.ts
// ==============================================================================
// Push-to-Start Token Listener Idempotence & Startup Race Recovery Tests
// ==============================================================================
// Covers LiveActivityService.initTokenListeners():
//   1. Repeated init calls register native listeners exactly once.
//   2. init queries the native bridge's cached Push-to-Start token
//      (getPushToStartToken) and, when one exists, syncs it to the backend.

import { Platform } from 'react-native';

jest.mock('../modules/my-commute-live-activity', () => ({
  __esModule: true,
  default: {},
  addPushToStartListener: jest.fn(() => ({ remove: jest.fn() })),
  addLiveActivityPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  getPushToStartToken: jest.fn().mockResolvedValue(null),
}));

jest.mock('../services/deviceIdentity', () => ({
  ensureDeviceIdentity: jest.fn().mockResolvedValue({ userId: 'mock-user-123', apiKey: 'mock-api-key' }),
}));

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: async () => ({}),
} as any);

const flushMicrotasks = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
};

describe('LiveActivityService Push-to-Start token listeners', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    Platform.OS = 'ios';
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterAll(() => {
    Platform.OS = originalOS;
  });

  it('registers listeners exactly once across repeated initTokenListeners() calls', () => {
    const mod = require('../modules/my-commute-live-activity');
    const { LiveActivityService } = require('../services/LiveActivityService');

    LiveActivityService.initTokenListeners();
    LiveActivityService.initTokenListeners();
    LiveActivityService.initTokenListeners();

    expect(mod.addPushToStartListener).toHaveBeenCalledTimes(1);
    expect(mod.addLiveActivityPushTokenListener).toHaveBeenCalledTimes(1);
    // Startup cache query must also run exactly once (guarded by the same idempotence check)
    expect(mod.getPushToStartToken).toHaveBeenCalledTimes(1);
  });

  it('queries getPushToStartToken() on init and syncs a returned token to the backend', async () => {
    const mod = require('../modules/my-commute-live-activity');
    mod.getPushToStartToken.mockResolvedValue('deadbeefcafe1234');
    const { LiveActivityService } = require('../services/LiveActivityService');

    LiveActivityService.initTokenListeners();
    await flushMicrotasks();

    expect(mod.getPushToStartToken).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toEqual(expect.stringContaining('/api/devices/tokens'));
    expect(init.method).toBe('POST');
    expect(init.headers['x-user-id']).toBe('mock-user-123');
    expect(init.headers['x-api-key']).toBe('mock-api-key');
    const body = JSON.parse(init.body);
    expect(body.tokenType).toBe('pushToStart');
    expect(body.token).toBe('deadbeefcafe1234');
  });

  it('does not sync to the backend when no cached token exists at startup', async () => {
    const mod = require('../modules/my-commute-live-activity');
    mod.getPushToStartToken.mockResolvedValue(null);
    const { LiveActivityService } = require('../services/LiveActivityService');

    LiveActivityService.initTokenListeners();
    await flushMicrotasks();

    expect(mod.getPushToStartToken).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
