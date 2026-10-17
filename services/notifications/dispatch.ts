import * as Notifications from 'expo-notifications';
import { createMMKV } from 'react-native-mmkv';
import {
  LineId,
  DisruptionNotificationPayload,
  NOTIFICATION_CATEGORIES,
  disruptionThreadId,
} from './payload';
import { getSeverityRank } from '../../utils/getSeverityColor';
import { formatDisruptionNotificationBody } from './disruptionCopy';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';

const notifStorage = createMMKV({ id: 'background-storage' });

/**
 * Type-safe notification dispatch layer.
 * Enforces that every disruption notification emitted locally carries a strictly
 * validated LineId, eliminating silent undefined data and hardcoded fallback bugs.
 */

export interface PresentDisruptionOptions {
  lineId: LineId;
  lineName: string;
  statusDescription: string;
  reason?: string;
  severity?: number;
}

export interface DismissDisruptionOptions {
  lineId: LineId | string;
  lineName?: string;
}

export interface PresentServiceImprovingOptions {
  lineId: LineId;
  lineName: string;
  statusDescription: string;
  reason?: string;
}

/**
 * Dispatches an actionable disruption notification with a 'View Reroute' action.
 * Guaranteed to attach the exact disrupted LineId to both `data.lineId` and the payload.
 */
// 10-minute anti-flap suppression window matching in-app pill bucket
const DEDUP_BUCKET_MS = 10 * 60 * 1000;

export async function presentDisruptionNotification(
  opts: PresentDisruptionOptions
): Promise<string> {
  const { lineId, lineName, statusDescription, reason, severity } = opts;

  // Defensive guard: never dispatch a disruption notification for healthy status
  const rank = getSeverityRank(severity, statusDescription);
  if (rank === 0 || statusDescription.toLowerCase().includes('good service')) {
    console.warn(
      `[dispatch] Suppressed disruption notification for healthy status "${statusDescription}" on ${lineName} line (${lineId})`
    );
    return `suppressed_healthy_${lineId}`;
  }

  // 1-Tap Silence Today: Suppress if user silenced this specific line for today
  if (useUserPreferencesStore.getState().isLineSilencedToday(lineId)) {
    console.log(
      `[dispatch] Suppressed disruption notification for ${lineName} (${lineId}) — line silenced today.`
    );
    return `suppressed_silenced_${lineId}`;
  }

  // Symmetric cross-system dedup: suppress if in-app pill or local notification already fired recently
  try {
    const lastNotified = notifStorage.getNumber(`notified_disruption_${lineId}`);
    if (lastNotified && Date.now() - lastNotified < DEDUP_BUCKET_MS) {
      return `suppressed_duplicate_${lineId}`;
    }
    notifStorage.set(`notified_disruption_${lineId}`, Date.now());
  } catch {
    // MMKV fallback in test environments
  }

  const data: DisruptionNotificationPayload & {
    action: 'show-disruption';
    statusAsOf: number;
  } = {
    type: 'COMMUTE_DISRUPTION',
    action: 'show-disruption',
    lineId,
    lineName,
    severity,
    status: statusDescription,
    reason,
    statusAsOf: Date.now(),
    timestamp: Date.now(),
  };

  const bodyText = formatDisruptionNotificationBody({
    statusDescription,
    cause: reason,
  });

  const deliveryMode = useUserPreferencesStore.getState().shushPreferences?.alertDeliveryMode || 'shush';
  const shouldPlaySound = deliveryMode === 'loud';

  return Notifications.scheduleNotificationAsync({
    identifier: disruptionThreadId(lineId),
    content: {
      title: `Disruption on ${lineName} line`,
      body: bodyText,
      categoryIdentifier: NOTIFICATION_CATEGORIES.REROUTE_ONLY,
      data: data as unknown as Record<string, any>,
      sound: shouldPlaySound,
      interruptionLevel: 'active',
    },
    trigger: null,
  });
}

/**
 * Dispatches service recovery silently by dismissing the disruption notification.
 * ZERO-NAG INVARIANT: Good Service recovery NEVER schedules noisy lockscreen banners with sound.
 * AUTOMATIC ISOLATED DISMISSAL: Clears ONLY the stale disruption notification for this line.
 */
export async function dismissDisruptionNotification(
  opts: DismissDisruptionOptions
): Promise<string> {
  const { lineId, lineName } = opts;

  console.log(`[dispatch] Good service recovery on ${lineName ?? lineId} line (${lineId}) — silent transition (dismissing lockscreen alert).`);

  if (typeof Notifications.dismissNotificationAsync === 'function') {
    try {
      await Notifications.dismissNotificationAsync(disruptionThreadId(lineId));
    } catch {
      // Graceful fallback
    }
  }

  return `silent_recovery_${lineId}`;
}

/**
 * Dispatches a notification informing the user that conditions are improving.
 * Overwrites previous disruption notification in place using the same line identifier.
 */
export async function presentServiceImprovingNotification(
  opts: PresentServiceImprovingOptions
): Promise<string> {
  const { lineId, lineName, statusDescription, reason } = opts;

  // 1-Tap Silence Today: Suppress if user silenced this specific line for today
  if (useUserPreferencesStore.getState().isLineSilencedToday(lineId)) {
    return `suppressed_silenced_${lineId}`;
  }

  const data: DisruptionNotificationPayload = {
    type: 'SERVICE_IMPROVING',
    lineId,
    lineName,
    status: statusDescription,
    reason,
    timestamp: Date.now(),
  };

  const bodyText = formatDisruptionNotificationBody({
    statusDescription,
    cause: reason,
  });

  const deliveryMode = useUserPreferencesStore.getState().shushPreferences?.alertDeliveryMode || 'shush';
  const shouldPlaySound = deliveryMode === 'loud';

  return Notifications.scheduleNotificationAsync({
    identifier: disruptionThreadId(lineId),
    content: {
      title: `Service improving on ${lineName} line`,
      body: bodyText,
      categoryIdentifier: NOTIFICATION_CATEGORIES.COMMUTE_STATUS,
      data: data as unknown as Record<string, any>,
      sound: shouldPlaySound,
      interruptionLevel: 'active',
    },
    trigger: null,
  });
}
