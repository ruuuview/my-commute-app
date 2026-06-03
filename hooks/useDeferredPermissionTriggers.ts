import { useCallback } from 'react';
import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';
import * as Notifications from 'expo-notifications';
import { useShallow } from 'zustand/react/shallow';
import { useUserPreferencesStore } from '../store/userPreferencesStore';

export function useDeferredPermissionTriggers() {
  const {
    sessionCount,
    calendarGranted,
    notificationsGranted,
    setCalendarGranted,
    setNotificationsGranted,
  } = useUserPreferencesStore(
    useShallow((s) => ({
      sessionCount: s.sessionCount,
      calendarGranted: s.calendarGranted,
      notificationsGranted: s.notificationsGranted,
      setCalendarGranted: s.setCalendarGranted,
      setNotificationsGranted: s.setNotificationsGranted,
    }))
  );

  // 1. Trigger evaluation
  const shouldShowNotificationPrompt = useCallback(() => {
    // Show on session 2 or higher if not already granted
    return sessionCount >= 2 && !notificationsGranted;
  }, [sessionCount, notificationsGranted]);

  const shouldShowCalendarPrompt = useCallback(() => {
    // Show on session 5 or higher if not already granted
    return sessionCount >= 5 && !calendarGranted;
  }, [sessionCount, calendarGranted]);

  // 2. Request Handlers
  const requestCalendarPermission = useCallback(async () => {
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      const granted = status === Calendar.PermissionStatus.GRANTED;
      setCalendarGranted(granted);
      return granted;
    } catch (err) {
      console.log('Error requesting calendar permissions:', err);
      return false;
    }
  }, [setCalendarGranted]);

  const requestNotificationPermission = useCallback(async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      const granted = status === 'granted';
      setNotificationsGranted(granted);
      return granted;
    } catch (err) {
      console.log('Error requesting notification permissions:', err);
      return false;
    }
  }, [setNotificationsGranted]);

  return {
    shouldShowNotificationPrompt,
    shouldShowCalendarPrompt,
    requestCalendarPermission,
    requestNotificationPermission,
    sessionCount,
  };
}
