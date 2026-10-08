// services/notifications/categories.ts
// Single source of truth for notification action categories.
// Guarantees zero drift between top-level registration and RootLayout effects.

export interface NotificationActionItem {
  identifier: string;
  buttonTitle: string;
  options: {
    opensAppToForeground: boolean;
  };
}

export const REROUTE_ONLY_ACTIONS: NotificationActionItem[] = [
  {
    identifier: 'view_reroute',
    buttonTitle: '🧭 View Reroute',
    options: {
      opensAppToForeground: true,
    },
  },
  {
    identifier: 'shush_today',
    buttonTitle: '🤫 Shush today',
    options: {
      opensAppToForeground: false,
    },
  },
];

export const CLAIM_REMINDER_ACTIONS: NotificationActionItem[] = [
  {
    identifier: 'view_claim',
    buttonTitle: 'View Refund',
    options: {
      opensAppToForeground: true,
    },
  },
];

export const ARRIVED_ALERT_ACTIONS: NotificationActionItem[] = [
  {
    identifier: 'snooze4h',
    buttonTitle: '4 hours',
    options: { opensAppToForeground: false },
  },
  {
    identifier: 'snooze8h',
    buttonTitle: '8 hours',
    options: { opensAppToForeground: false },
  },
  {
    identifier: 'snooze12h',
    buttonTitle: '12 hours',
    options: { opensAppToForeground: false },
  },
];
