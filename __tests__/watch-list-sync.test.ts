// __tests__/watch-list-sync.test.ts
// Watch-list sync (Push-to-Start Task 3):
//  1. Pinning stations / toggling lines in userPreferencesStore triggers
//     syncPushTokenWithBackend with the derived, normalized unique line ids.
//  2. The real registration service POSTs { token, lines: string[] } to
//     /api/devices/register with normalized line ids.
import * as Notifications from 'expo-notifications';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { syncPushTokenWithBackend } from '../services/notificationRegistrationService';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, status: 'granted' }),
  getDevicePushTokenAsync: jest.fn().mockResolvedValue({ data: 'apns-device-token-abc123' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[mock]' }),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-id'),
  dismissNotificationAsync: jest.fn().mockResolvedValue(undefined),
  setNotificationCategoryAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/deviceIdentity', () => ({
  ensureDeviceIdentity: jest.fn().mockResolvedValue({ userId: 'mock-user-123', apiKey: 'mock-api-key' }),
}));

// Automock the registration service: the store must call it, and we capture args.
jest.mock('../services/notificationRegistrationService');

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: async () => ({ registered: true }),
  text: async () => '',
} as any);

const mockedSync = syncPushTokenWithBackend as jest.Mock;

describe('Watch-list sync: store → syncPushTokenWithBackend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useUserPreferencesStore.setState({
      selectedLines: [],
      pinnedStations: [],
    });
  });

  it('pinStation triggers sync with the normalized unique line ids derived from pinned stations', () => {
    useUserPreferencesStore.getState().pinStation(
      { id: 'baker-street', name: 'Baker Street', lines: ['Circle', ' metropolitan ', 'jubilee'], zone: 1 },
      'home'
    );

    expect(mockedSync).toHaveBeenCalled();
    const lines = mockedSync.mock.calls[mockedSync.mock.calls.length - 1][0];
    expect(lines).toEqual(['circle', 'jubilee', 'metropolitan']); // lowercased, trimmed, deduped, sorted
    expect(Array.isArray(lines)).toBe(true);
    lines.forEach((l: any) => expect(typeof l).toBe('string'));
  });

  it('toggleLine triggers sync including the toggled line (normalized)', () => {
    useUserPreferencesStore.getState().toggleLine('Northern');
    expect(mockedSync).toHaveBeenCalledWith(['northern']);

    useUserPreferencesStore.getState().toggleLine('Victoria');
    expect(mockedSync).toHaveBeenLastCalledWith(['northern', 'victoria']);
  });

  it('unpinStation triggers sync with the line removed from the watch list', () => {
    useUserPreferencesStore.getState().pinStation(
      { id: 'angel', name: 'Angel', lines: ['northern'], zone: 1 },
      'other'
    );
    expect(mockedSync).toHaveBeenLastCalledWith(['northern']);

    useUserPreferencesStore.getState().unpinStation('angel');
    expect(mockedSync).toHaveBeenLastCalledWith([]);
  });

  it('reorderStations triggers sync with the union of all pinned station lines', () => {
    useUserPreferencesStore.getState().reorderStations([
      { id: 'aldgate', name: 'Aldgate', lines: ['circle', 'metropolitan'], zone: 1, role: 'home' },
      { id: 'angel', name: 'Angel', lines: ['northern'], zone: 1, role: 'work' },
    ]);
    expect(mockedSync).toHaveBeenLastCalledWith(['circle', 'metropolitan', 'northern']);
  });

  it('dedupes lines shared between selectedLines and pinned stations', () => {
    useUserPreferencesStore.setState({ selectedLines: ['northern'] });
    useUserPreferencesStore.getState().pinStation(
      { id: 'angel', name: 'Angel', lines: ['northern'], zone: 1 },
      'other'
    );
    const lines = mockedSync.mock.calls[mockedSync.mock.calls.length - 1][0];
    expect(lines).toEqual(['northern']); // no duplicates
  });
});

describe('Watch-list sync: register payload includes lines: string[]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POSTs { token, lines } to /api/devices/register with normalized string line ids', async () => {
    const { syncPushTokenWithBackend: realSync } = jest.requireActual(
      '../services/notificationRegistrationService'
    );

    await realSync(['Victoria', ' northern ']);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/api/devices/register');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body);
    expect(body.token).toBe('apns-device-token-abc123');
    expect(Array.isArray(body.lines)).toBe(true);
    expect(body.lines).toEqual(['northern', 'victoria']); // normalized, sorted
    body.lines.forEach((l: any) => expect(typeof l).toBe('string'));
  });

  it('sends an empty lines array when the watch list is empty', async () => {
    const { syncPushTokenWithBackend: realSync } = jest.requireActual(
      '../services/notificationRegistrationService'
    );

    await realSync([]);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.lines).toEqual([]);
  });
});
