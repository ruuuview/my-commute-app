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

  afterEach(() => {
    try {
      const { LiveActivityService } = require('../services/LiveActivityService');
      LiveActivityService._resetTokenListenersForTesting?.();
    } catch {}
    jest.clearAllTimers();
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

  it('enqueues pending token in MMKV queue when syncTokenToBackend encounters network failure', async () => {
    const mod = require('../modules/my-commute-live-activity');
    const { createMMKV } = require('react-native-mmkv');
    const queueMMKV = createMMKV({ id: 'live-activity-token-queue' });
    queueMMKV.clearAll();

    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network offline'));

    let listenerCallback: ((event: { token: string }) => void) | null = null;
    mod.addPushToStartListener.mockImplementationOnce((cb: any) => {
      listenerCallback = cb;
      return { remove: jest.fn() };
    });

    const { LiveActivityService } = require('../services/LiveActivityService');
    LiveActivityService.initTokenListeners();

    expect(listenerCallback).not.toBeNull();
    listenerCallback!({ token: 'offline-token-123' });
    await flushMicrotasks();

    const storedRaw = queueMMKV.getString('pending_token_sync');
    expect(storedRaw).toBeTruthy();
    const stored = JSON.parse(storedRaw!);
    expect(stored.pushToStart).toBeDefined();
    expect(stored.pushToStart.token).toBe('offline-token-123');
    expect(stored.pushToStart.tokenType).toBe('pushToStart');
  });

  it('flushPendingTokenSync flushes pending tokens to backend and clears MMKV queue', async () => {
    const { createMMKV } = require('react-native-mmkv');
    const queueMMKV = createMMKV({ id: 'live-activity-token-queue' });
    queueMMKV.clearAll();

    const pending = {
      pushToStart: {
        tokenType: 'pushToStart',
        token: 'queued-pts-token-999',
        enqueuedAt: Date.now(),
      },
    };
    queueMMKV.set('pending_token_sync', JSON.stringify(pending));

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    const { LiveActivityService } = require('../services/LiveActivityService');
    const flushed = await LiveActivityService.flushPendingTokenSync();
    expect(flushed).toBe(true);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/devices/tokens'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('queued-pts-token-999'),
      })
    );

    expect(queueMMKV.contains('pending_token_sync')).toBe(false);
  });

  it('deduplicates concurrent flushPendingTokenSync calls to share single in-flight promise', async () => {
    const { createMMKV } = require('react-native-mmkv');
    const queueMMKV = createMMKV({ id: 'live-activity-token-queue' });
    queueMMKV.clearAll();

    const pending = {
      pushToStart: {
        tokenType: 'pushToStart',
        token: 'concurrent-token-111',
        enqueuedAt: Date.now(),
      },
    };
    queueMMKV.set('pending_token_sync', JSON.stringify(pending));

    let resolveFetch: ((value: any) => void) | null = null;
    (global.fetch as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const { LiveActivityService } = require('../services/LiveActivityService');

    // Launch two flushes simultaneously
    const flushPromise1 = LiveActivityService.flushPendingTokenSync();
    const flushPromise2 = LiveActivityService.flushPendingTokenSync();

    // Await microtasks for ensureDeviceIdentity
    await flushMicrotasks();

    // Exactly one network fetch should have been initiated
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Resolve the network call
    resolveFetch!({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    const [res1, res2] = await Promise.all([flushPromise1, flushPromise2]);
    expect(res1).toBe(true);
    expect(res2).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(queueMMKV.contains('pending_token_sync')).toBe(false);
  });

  it('preserves newly enqueued token when another token arrives during an in-flight flush', async () => {
    const { createMMKV } = require('react-native-mmkv');
    const queueMMKV = createMMKV({ id: 'live-activity-token-queue' });
    queueMMKV.clearAll();

    const pending = {
      pushToStart: {
        tokenType: 'pushToStart',
        token: 'initial-pts-token',
        enqueuedAt: 1000,
      },
    };
    queueMMKV.set('pending_token_sync', JSON.stringify(pending));

    let resolveFetch: ((value: any) => void) | null = null;
    (global.fetch as jest.Mock).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    const { LiveActivityService } = require('../services/LiveActivityService');

    // 1. Start flush of initial token
    const flushPromise = LiveActivityService.flushPendingTokenSync();

    // Await microtasks for ensureDeviceIdentity to reach fetch
    await flushMicrotasks();

    // 2. While fetch is pending, a new liveActivity token is enqueued into MMKV
    const queueDuringFlight = {
      pushToStart: {
        tokenType: 'pushToStart',
        token: 'initial-pts-token',
        enqueuedAt: 1000,
      },
      'liveActivity:journey-999': {
        tokenType: 'liveActivity',
        token: 'new-live-activity-token-during-flush',
        journeyId: 'journey-999',
        enqueuedAt: 2000,
      },
    };
    queueMMKV.set('pending_token_sync', JSON.stringify(queueDuringFlight));

    // 3. Resolve the initial fetch
    resolveFetch!({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    await flushPromise;

    // 4. Initial token was flushed, but new-live-activity-token MUST NOT be wiped out!
    const remainingRaw = queueMMKV.getString('pending_token_sync');
    expect(remainingRaw).toBeTruthy();
    const remaining = JSON.parse(remainingRaw!);
    expect(remaining.pushToStart).toBeUndefined();
    expect(remaining['liveActivity:journey-999']).toBeDefined();
    expect(remaining['liveActivity:journey-999'].token).toBe('new-live-activity-token-during-flush');
  });

  it('retries getPushToStartToken with backoff when startup query returns null initially', async () => {
    jest.useFakeTimers();
    try {
      const mod = require('../modules/my-commute-live-activity');
      // 1st call returns null, 2nd call (at 1s backoff) returns token
      mod.getPushToStartToken
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('backoff-recovered-token-777');

      const { LiveActivityService } = require('../services/LiveActivityService');
      LiveActivityService.initTokenListeners();

      // Initial query completed
      await flushMicrotasks();
      expect(mod.getPushToStartToken).toHaveBeenCalledTimes(1);
      expect(global.fetch).not.toHaveBeenCalled();

      // Advance timers by 1000ms for first backoff retry
      jest.advanceTimersByTime(1000);
      await flushMicrotasks();

      expect(mod.getPushToStartToken).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/devices/tokens'),
        expect.objectContaining({
          body: expect.stringContaining('backoff-recovered-token-777'),
        })
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
