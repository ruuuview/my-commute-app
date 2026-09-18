import * as fs from 'fs';
import * as path from 'path';
import * as Calendar from 'expo-calendar';
import * as Notifications from 'expo-notifications';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import {
  scheduleCalendarCommuteAlerts,
  cancelCalendarCommuteAlerts,
} from '../services/calendarScheduler';

const settingsPath = path.resolve(__dirname, '../app/settings.tsx');
const settingsContent = fs.readFileSync(settingsPath, 'utf8');

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    journeys: [{ duration: 25 }],
  }),
}) as jest.Mock;

jest.mock('expo-calendar', () => ({
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied',
    UNDETERMINED: 'undetermined',
  },
  EntityTypes: {
    EVENT: 'event',
  },
  getCalendarPermissionsAsync: jest.fn(),
  requestCalendarPermissionsAsync: jest.fn(),
  getCalendarsAsync: jest.fn(),
  getEventsAsync: jest.fn(),
}));

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: {
    DATE: 'date',
  },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
}));

describe('Calendar Commute Scheduler Invariants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useUserPreferencesStore.setState({
      pinnedStations: [
        { id: '940GZZLUVIC', name: 'Victoria', lines: ['victoria'], zone: 1, role: 'home' },
        { id: '940GZZLUCAN', name: 'Canary Wharf', lines: ['jubilee'], zone: 2, role: 'work' },
      ],
      calendarGranted: true,
    });
  });

  test('cancelCalendarCommuteAlerts cleanly cancels only commute-leave-by notifications', async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      { identifier: 'notif-1', content: { data: { type: 'commute-leave-by' } } },
      { identifier: 'notif-2', content: { data: { type: 'disruption-alert' } } },
      { identifier: 'notif-3', content: { data: { type: 'commute-leave-by' } } },
    ]);

    await cancelCalendarCommuteAlerts();

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-1');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-3');
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('notif-2');
  });

  test('scheduleCalendarCommuteAlerts aborts early if calendar permission is not granted', async () => {
    (Calendar.getCalendarPermissionsAsync as jest.Mock).mockResolvedValue({
      status: Calendar.PermissionStatus.DENIED,
    });
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });

    const result = await scheduleCalendarCommuteAlerts();
    expect(result).toEqual({ scheduledCount: 0 });
    expect(Calendar.getCalendarsAsync).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test('scheduleCalendarCommuteAlerts aborts early if notification permission is not granted', async () => {
    (Calendar.getCalendarPermissionsAsync as jest.Mock).mockResolvedValue({
      status: Calendar.PermissionStatus.GRANTED,
    });
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

    const result = await scheduleCalendarCommuteAlerts();
    expect(result).toEqual({ scheduledCount: 0 });
    expect(Calendar.getCalendarsAsync).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test('scheduleCalendarCommuteAlerts matches calendar event location and schedules leave-by notification', async () => {
    (Calendar.getCalendarPermissionsAsync as jest.Mock).mockResolvedValue({
      status: Calendar.PermissionStatus.GRANTED,
    });
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Calendar.getCalendarsAsync as jest.Mock).mockResolvedValue([{ id: 'cal-primary' }]);

    // Event 2 hours in the future at Canary Wharf
    const futureEventTime = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    (Calendar.getEventsAsync as jest.Mock).mockResolvedValue([
      {
        id: 'evt-1',
        title: 'Project Review at Canary Wharf',
        location: 'Canary Wharf Underground Station',
        startDate: futureEventTime,
      },
    ]);
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);

    const result = await scheduleCalendarCommuteAlerts();
    expect(result.scheduledCount).toBe(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);

    const callArgs = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(callArgs.content.title).toBe('Time to leave for Project Review at Canary Wharf');
    expect(callArgs.content.data.type).toBe('commute-leave-by');
    expect(callArgs.content.data.eventId).toBe('evt-1');
  });

  test('Settings file wires Auto-detect commute from calendar to real scheduler and permission checks', () => {
    expect(settingsContent).toContain('Auto-detect commute from calendar');
    expect(settingsContent).toContain('scheduleCalendarCommuteAlerts');
    expect(settingsContent).toContain('cancelCalendarCommuteAlerts');
    expect(settingsContent).toContain("requestPermission('calendar', 'settings_toggle')");
    expect(settingsContent).toContain('Calendar Access Needed');
  });
});
