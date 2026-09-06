import * as Notifications from 'expo-notifications';
import {
  LineId,
  DisruptionNotificationPayload,
  NOTIFICATION_CATEGORIES,
} from './payload';
import { CANONICAL_ALTERNATIVES, DisruptionAlternative } from './intent';

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
  alternative?: DisruptionAlternative;
}

export interface PresentServiceRecoveryOptions {
  lineId: LineId;
  lineName: string;
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
 *
 * "The Banner is the First Screen": Body copy answers the commuter's decision immediately
 * by providing the top operating alternative and expected delta time.
 */
export async function presentDisruptionNotification(
  opts: PresentDisruptionOptions
): Promise<string> {
  const { lineId, lineName, statusDescription, reason, severity } = opts;
  const alt = opts.alternative || CANONICAL_ALTERNATIVES[lineId];

  const data: DisruptionNotificationPayload & {
    action: 'show-disruption';
    alternative?: DisruptionAlternative;
    statusAsOf: number;
  } = {
    type: 'COMMUTE_DISRUPTION',
    action: 'show-disruption',
    lineId,
    lineName,
    severity,
    status: statusDescription,
    reason,
    alternative: alt,
    statusAsOf: Date.now(),
    timestamp: Date.now(),
  };

  const reasonSnippet = reason ? ` (${reason})` : '';
  const altSnippet = alt ? ` ${alt.lineName} running normally, +${alt.deltaMinutes} min.` : '';
  const bodyText = `${statusDescription}${reasonSnippet}.${altSnippet}`;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: `Disruption on ${lineName} line`,
      body: bodyText,
      categoryIdentifier: NOTIFICATION_CATEGORIES.REROUTE_ONLY,
      data: data as unknown as Record<string, any>,
      sound: true,
    },
    trigger: null,
  });
}

/**
 * Dispatches a notification informing the user that Good Service has resumed.
 */
export async function presentServiceRecoveryNotification(
  opts: PresentServiceRecoveryOptions
): Promise<string> {
  const { lineId, lineName } = opts;

  const data: DisruptionNotificationPayload = {
    type: 'SERVICE_RECOVERED',
    lineId,
    lineName,
    status: 'Good Service',
    timestamp: Date.now(),
  };

  return Notifications.scheduleNotificationAsync({
    content: {
      title: `Service cleared on ${lineName} line`,
      body: `Good Service has resumed.`,
      categoryIdentifier: NOTIFICATION_CATEGORIES.COMMUTE_STATUS,
      data: data as unknown as Record<string, any>,
      sound: true,
    },
    trigger: null,
  });
}

/**
 * Dispatches a notification informing the user that conditions are improving.
 */
export async function presentServiceImprovingNotification(
  opts: PresentServiceImprovingOptions
): Promise<string> {
  const { lineId, lineName, statusDescription, reason } = opts;

  const data: DisruptionNotificationPayload = {
    type: 'SERVICE_IMPROVING',
    lineId,
    lineName,
    status: statusDescription,
    reason,
    timestamp: Date.now(),
  };

  return Notifications.scheduleNotificationAsync({
    content: {
      title: `Service improving on ${lineName} line`,
      body: `${statusDescription}${reason ? `: ${reason}` : ''}`,
      categoryIdentifier: NOTIFICATION_CATEGORIES.COMMUTE_STATUS,
      data: data as unknown as Record<string, any>,
      sound: true,
    },
    trigger: null,
  });
}
