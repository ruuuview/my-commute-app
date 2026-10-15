import * as Notifications from 'expo-notifications';
import { presentDisruptionNotification } from '../services/notifications/dispatch';
import { useUserPreferencesStore } from '../store/userPreferencesStore';

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-123'),
  dismissNotificationAsync: jest.fn().mockResolvedValue(undefined),
  setNotificationCategoryAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('react-native-mmkv', () => {
  const store = new Map<string, any>();
  return {
    createMMKV: jest.fn(() => ({
      getString: jest.fn((k: string) => store.get(k)),
      set: jest.fn((k: string, v: any) => store.set(k, v)),
      getNumber: jest.fn((k: string) => store.get(k)),
      getBoolean: jest.fn((k: string) => store.get(k)),
      delete: jest.fn((k: string) => store.delete(k)),
      clearAll: jest.fn(() => store.clear()),
    })),
  };
});

describe('Shush Delivery Mode Dispatch Invariants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Shush mode dispatches disruption notifications with sound: false (Silent Invariant)', async () => {
    useUserPreferencesStore.setState({
      shushPreferences: {
        alertDeliveryMode: 'shush',
        shushActivation: 'always',
        shushSchedule: { weekdays: [1, 2, 3, 4, 5], windows: [] },
        hasCompletedShushOnboarding: true,
        timeSensitiveGranted: false,
        timeSensitiveStatus: 'disabled',
      },
    });

    await presentDisruptionNotification({
      lineId: 'victoria',
      lineName: 'Victoria',
      statusDescription: 'Severe Delays',
      reason: 'Signal failure at Oxford Circus',
      severity: 3,
    });

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const callArgs = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(callArgs.content.sound).toBe(false);
  });

  test('Loud mode dispatches disruption notifications with sound: true', async () => {
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

    await presentDisruptionNotification({
      lineId: 'central',
      lineName: 'Central',
      statusDescription: 'Severe Delays',
      reason: 'Train fault',
      severity: 3,
    });

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const callArgs = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(callArgs.content.sound).toBe(true);
  });
});
