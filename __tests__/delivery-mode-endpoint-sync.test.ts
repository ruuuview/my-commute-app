// frontend/__tests__/delivery-mode-endpoint-sync.test.ts
// Phase 3 contract for the 3-mode alert delivery (loud/shush/off):
//
//   1. OFF = absolute silence at the local dispatch layer too — no banner is
//      scheduled, and the dedup bucket is NOT stamped (so switching back to
//      shush/loud is not suppressed by a stale dedup entry).
//   2. The mode change is synced to the backend profile (POST /api/profile)
//      with the device identity auth headers.
//   3. Network failure queues the latest-wins mode in MMKV and reports
//      { synced: false, queued: true }.
//   4. flushPendingDeliveryModeSync() later delivers the queued mode and
//      clears the queue exactly once.
//   5. Settings correctly wires syncAlertDeliveryMode for all 3 modes.
import * as Notifications from 'expo-notifications';
import { createMMKV } from 'react-native-mmkv';
import * as fs from 'fs';
import * as path from 'path';
import {
  presentDisruptionNotification,
  presentServiceImprovingNotification,
} from '../services/notifications/dispatch';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import {
  syncAlertDeliveryMode,
  flushPendingDeliveryModeSync,
  DELIVERY_MODE_SYNC_TIMEOUT_MS,
} from '../services/notificationRegistrationService';
import { ensureDeviceIdentity } from '../services/deviceIdentity';
import { APP_CONFIG } from '../config/app.config';

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-123'),
  dismissNotificationAsync: jest.fn().mockResolvedValue(undefined),
  setNotificationCategoryAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/deviceIdentity', () => ({
  ensureDeviceIdentity: jest.fn().mockResolvedValue({ userId: 'mock-user-123', apiKey: 'mock-api-key' }),
}));

const mockedIdentity = ensureDeviceIdentity as jest.Mock;

function setMode(mode: 'loud' | 'shush' | 'off') {
  useUserPreferencesStore.setState({
    shushPreferences: {
      alertDeliveryMode: mode,
      shushActivation: 'always',
      shushSchedule: { weekdays: [1, 2, 3, 4, 5], windows: [] },
      hasCompletedShushOnboarding: true,
      timeSensitiveGranted: false,
      timeSensitiveStatus: 'disabled',
    },
  });
}

function queueMMKV() {
  // Same named instance id as service implementation must use.
  return createMMKV({ id: 'delivery-mode-queue' }) as any as {
    getString: (k: string) => string | undefined;
    set: (k: string, v: string) => void;
    contains: (k: string) => boolean;
    getNumber: (k: string) => number | undefined;
    delete: (k: string) => void;
  };
}
const QUEUE_KEY = 'pending_delivery_mode_sync';

describe('Off mode: local dispatch layer absolute silence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setMode('off');
  });

  test('off mode suppresses disruption banner AND never stamps the dedup bucket', async () => {
    const id = await presentDisruptionNotification({
      lineId: 'victoria' as any,
      lineName: 'Victoria',
      statusDescription: 'Severe Delays',
      reason: 'Signal failure',
      severity: 3,
    });

    expect(id).toMatch(/^suppressed_mode_off_/);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    // Dedup bucket must not be stamped while suppressed, otherwise re-enabled
    // modes swallow the next legitimate alert for 10 minutes.
    const storage = queueMMKV();
    expect(storage.getNumber('notified_disruption_victoria')).toBeUndefined();
  });

  test('off mode suppresses service-improving banner too (zero notices)', async () => {
    const id = await presentServiceImprovingNotification({
      lineId: 'central' as any,
      lineName: 'Central',
      statusDescription: 'Severe Delays',
      reason: 'Signal failure',
    });

    expect(id).toMatch(/^suppressed_mode_off_/);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test('shush mode still delivers (silent) — regression guard for the off gate', async () => {
    setMode('shush');
    const id = await presentDisruptionNotification({
      lineId: 'victoria' as any,
      lineName: 'Victoria',
      statusDescription: 'Severe Delays',
      reason: 'Signal failure',
      severity: 3,
    });

    expect(id).not.toMatch(/suppressed_mode_off/);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(
      (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0].content.sound
    ).toBe(false);
  });
});

describe('Delivery mode backend sync (POST /api/profile)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queueMMKV().delete(QUEUE_KEY);
  });

  afterEach(() => {
    queueMMKV().delete(QUEUE_KEY);
  });

  test('syncAlertDeliveryMode POSTs the mode with device identity headers', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
      text: async () => '',
    } as any);

    const result = await syncAlertDeliveryMode('off');

    expect(result).toEqual({ synced: true, queued: false });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/profile'),
      expect.objectContaining({ method: 'POST' })
    );
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain(APP_CONFIG.BACKEND_URL);
    const headers = init.headers as Record<string, string>;
    expect(headers['x-user-id']).toBe('mock-user-123');
    expect(headers['x-api-key']).toBe('mock-api-key');
    const body = JSON.parse(init.body);
    expect(body.alertDeliveryMode).toBe('off');
    const storage = queueMMKV();
    expect(storage.getString(QUEUE_KEY)).toBeFalsy();
  });

  test('network failure queues latest-wins mode in MMKV and reports queued', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;

    const result = await syncAlertDeliveryMode('loud');
    expect(result).toEqual({ synced: false, queued: true });

    expect(queueMMKV().getString(QUEUE_KEY)).toBe('loud');
  });

  test('syncAlertDeliveryMode validates mode and rejects unknown values', async () => {
    await expect(syncAlertDeliveryMode('turbo' as any)).rejects.toThrow(/invalid delivery mode/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('flushPendingDeliveryModeSync sends queued mode once and clears queue', async () => {
    queueMMKV().set(QUEUE_KEY, 'shush');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
      text: async () => '',
    } as any);

    const flushed = await flushPendingDeliveryModeSync();

    expect(flushed).toBe(true);
    expect(queueMMKV().getString(QUEUE_KEY)).toBeFalsy();
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/api/profile');
    expect(JSON.parse(init.body).alertDeliveryMode).toBe('shush');
  });

  test('flush without pending queue is a no-op (no network call)', async () => {
    const flushed = await flushPendingDeliveryModeSync();
    expect(flushed).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('registration timeout constant is strict (≤ 15s registration budget)', () => {
    expect(DELIVERY_MODE_SYNC_TIMEOUT_MS).toBeLessThanOrEqual(15000);
  });
});

describe('Settings wiring (source-level contract)', () => {
  const settingsPath = path.resolve(__dirname, '../app/settings.tsx');

  test('settings handleSelectDeliveryMode syncs the mode for all 3 choices', () => {
    const content = fs.readFileSync(settingsPath, 'utf8');
    expect(content).toContain('syncAlertDeliveryMode');
    expect(content).toMatch(/setAlertDeliveryMode\(mode\);[\s\S]{0,400}?syncAlertDeliveryMode\(mode\)/);
  });
});
