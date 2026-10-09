import * as Notifications from 'expo-notifications';
import { dismissDisruptionNotification } from '../services/notifications/dispatch';

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('mock-notification-id'),
  dismissNotificationAsync: jest.fn().mockResolvedValue(undefined),
  setNotificationCategoryAsync: jest.fn().mockResolvedValue(undefined),
}));

describe('Good Service Isolation & Notification Clearance Invariants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('strictly dismisses only the specific recovered line notification', async () => {
    const res = await dismissDisruptionNotification({
      lineId: 'victoria',
      lineName: 'Victoria',
    });

    expect(res).toBe('silent_recovery_victoria');
    // Invariant: ONLY line-disruption-victoria is dismissed
    expect(Notifications.dismissNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith('line-disruption-victoria');

    // Invariant: Other lines (central, northern, district) are NOT dismissed
    expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalledWith('line-disruption-central');
    expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalledWith('line-disruption-northern');
    expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalledWith('line-disruption-district');
  });

  it('never schedules a loud lockscreen notification on recovery', async () => {
    await dismissDisruptionNotification({
      lineId: 'central',
      lineName: 'Central',
    });

    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith('line-disruption-central');
  });

  it('handles multiple independent line recoveries sequentially without cross-talk', async () => {
    await dismissDisruptionNotification({ lineId: 'victoria' });
    await dismissDisruptionNotification({ lineId: 'district' });

    expect(Notifications.dismissNotificationAsync).toHaveBeenCalledTimes(2);
    expect(Notifications.dismissNotificationAsync).toHaveBeenNthCalledWith(1, 'line-disruption-victoria');
    expect(Notifications.dismissNotificationAsync).toHaveBeenNthCalledWith(2, 'line-disruption-district');
    expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalledWith('line-disruption-piccadilly');
  });
});
