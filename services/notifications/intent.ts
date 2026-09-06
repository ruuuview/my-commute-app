/**
 * Notification Intent Architecture & Stack-Preserving Navigation.
 *
 * Implements a centralized, type-safe data contract for decoding, validating,
 * and routing notification responses without destroying user navigation context.
 */

import { LineId, isLineId, KNOWN_LINE_IDS } from './payload';
import { Router } from 'expo-router';

export interface DisruptionAlternative {
  lineId: LineId;
  lineName: string;
  deltaMinutes: number;
}

export const CANONICAL_ALTERNATIVES: Record<LineId, DisruptionAlternative> = {
  piccadilly: { lineId: 'district', lineName: 'District line', deltaMinutes: 6 },
  victoria: { lineId: 'jubilee', lineName: 'Jubilee line', deltaMinutes: 5 },
  central: { lineId: 'elizabeth', lineName: 'Elizabeth line', deltaMinutes: 8 },
  metropolitan: { lineId: 'jubilee', lineName: 'Jubilee line', deltaMinutes: 10 },
  district: { lineId: 'piccadilly', lineName: 'Piccadilly line', deltaMinutes: 5 },
  bakerloo: { lineId: 'jubilee', lineName: 'Jubilee line', deltaMinutes: 7 },
  northern: { lineId: 'victoria', lineName: 'Victoria line', deltaMinutes: 5 },
  jubilee: { lineId: 'metropolitan', lineName: 'Metropolitan line', deltaMinutes: 5 },
  circle: { lineId: 'district', lineName: 'District line', deltaMinutes: 4 },
  'hammersmith-city': { lineId: 'circle', lineName: 'Circle line', deltaMinutes: 4 },
  'waterloo-city': { lineId: 'northern', lineName: 'Northern line', deltaMinutes: 8 },
  dlr: { lineId: 'jubilee', lineName: 'Jubilee line', deltaMinutes: 6 },
  elizabeth: { lineId: 'central', lineName: 'Central line', deltaMinutes: 8 },
  'london-overground': { lineId: 'jubilee', lineName: 'Jubilee line', deltaMinutes: 7 },
  overground: { lineId: 'jubilee', lineName: 'Jubilee line', deltaMinutes: 7 },
  tram: { lineId: 'district', lineName: 'District line', deltaMinutes: 10 },
};

export interface ShowDisruptionIntent {
  action: 'show-disruption';
  lineId: LineId;
  alternative?: DisruptionAlternative;
  initialSection?: 'overview' | 'alternatives';
  statusAsOf?: number;
}

export interface ShowRerouteIntent {
  action: 'show-reroute';
  lineId: LineId;
  alternative?: DisruptionAlternative;
  initialSection: 'alternatives';
  statusAsOf?: number;
}

export interface OverviewIntent {
  action: 'overview';
  statusAsOf?: number;
}

export type NotificationIntent = ShowDisruptionIntent | ShowRerouteIntent | OverviewIntent;

/**
 * Validates and logs notification payload errors for telemetry / Sentry.
 * Never silently swallows corrupted or unrecognized payloads.
 */
export function reportNotificationParseError(data: unknown, reason: string): void {
  console.warn(`[NotificationIntent] Parse Error: ${reason}`, { receivedData: data });
}

/**
 * Validates an incoming raw notification data payload into a typed NotificationIntent.
 *
 * Poka-yoke rule:
 * - If lineId is present and valid, returns typed intent.
 * - If data specifies overview, returns OverviewIntent.
 * - If malformed or lineId unrecognized, reports error and returns null (never guesses).
 */
export function parseNotificationIntent(data: unknown): NotificationIntent | null {
  if (!data || typeof data !== 'object') {
    reportNotificationParseError(data, 'Payload is not an object');
    return null;
  }

  const record = data as Record<string, any>;
  const rawAction = record.action || (record.openReroute ? 'show-reroute' : undefined);
  const rawLineId = record.lineId || record.disruption?.lineId;

  // Overview intent
  if (rawAction === 'overview' || (!rawLineId && record.type === 'OVERVIEW')) {
    return {
      action: 'overview',
      statusAsOf: typeof record.statusAsOf === 'number' ? record.statusAsOf : Date.now(),
    };
  }

  // Must have a valid lineId if not overview
  if (!isLineId(rawLineId)) {
    reportNotificationParseError(data, `Invalid or missing lineId: "${rawLineId}"`);
    return null;
  }

  const lineId = rawLineId.toLowerCase().trim() as LineId;

  // Validate alternative if present
  let alternative: DisruptionAlternative | undefined = undefined;
  if (record.alternative && typeof record.alternative === 'object') {
    const alt = record.alternative;
    if (isLineId(alt.lineId)) {
      alternative = {
        lineId: alt.lineId.toLowerCase().trim() as LineId,
        lineName: typeof alt.lineName === 'string' ? alt.lineName : `${alt.lineId} line`,
        deltaMinutes: typeof alt.deltaMinutes === 'number' ? alt.deltaMinutes : 5,
      };
    }
  } else if (CANONICAL_ALTERNATIVES[lineId]) {
    alternative = CANONICAL_ALTERNATIVES[lineId];
  }

  const statusAsOf = typeof record.statusAsOf === 'number' ? record.statusAsOf : (record.timestamp || Date.now());

  if (rawAction === 'show-reroute') {
    return {
      action: 'show-reroute',
      lineId,
      alternative,
      initialSection: 'alternatives',
      statusAsOf,
    };
  }

  return {
    action: 'show-disruption',
    lineId,
    alternative,
    initialSection: record.initialSection === 'alternatives' ? 'alternatives' : 'overview',
    statusAsOf,
  };
}

/**
 * Stack-preserving navigation router.
 *
 * Replaces destructive router.replace calls with router.navigate, preserving the
 * user's navigation stack so back button or swipe-down returns to their previous screen.
 */
export function navigateToIntent(router: Router, intent: NotificationIntent): void {
  if (intent.action === 'overview') {
    router.navigate('/(tabs)');
    return;
  }

  // Pass intent as JSON parameter with a timestamp nonce to ensure consume-once semantics
  router.navigate({
    pathname: '/(tabs)',
    params: {
      notificationIntent: JSON.stringify(intent),
      notificationNonce: String(Date.now()),
    },
  } as never);
}
