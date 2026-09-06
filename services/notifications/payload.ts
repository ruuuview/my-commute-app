/**
 * Canonical TfL line identifier definitions and Poka-Yoke notification payload types.
 * Prevents stringly-typed bugs and ensures every notification emitted across the codebase
 * carries an authenticated, validated LineId with zero hardcoded fallbacks.
 */

export const KNOWN_LINE_IDS = [
  'bakerloo',
  'central',
  'circle',
  'district',
  'hammersmith-city',
  'jubilee',
  'metropolitan',
  'northern',
  'piccadilly',
  'victoria',
  'waterloo-city',
  'dlr',
  'london-overground',
  'elizabeth',
  'tram',
  'overground',
] as const;

export type LineId = (typeof KNOWN_LINE_IDS)[number];

/**
 * Type guard validating whether a candidate string is an authenticated TfL LineId.
 */
export function isLineId(candidate: unknown): candidate is LineId {
  if (typeof candidate !== 'string') return false;
  const normalized = candidate.toLowerCase().trim();
  return (KNOWN_LINE_IDS as readonly string[]).includes(normalized);
}

/**
 * Valid notification category identifiers registered in the app.
 */
export const NOTIFICATION_CATEGORIES = {
  REROUTE_ONLY: 'REROUTE_ONLY',
  COMMUTE_STATUS: 'COMMUTE_STATUS',
  CLAIM_REMINDER: 'CLAIM_REMINDER',
  ARRIVED_ALERT: 'ARRIVED_ALERT',
  DIRECTION_CHOICE: 'DIRECTION_CHOICE',
} as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[keyof typeof NOTIFICATION_CATEGORIES];

/**
 * Strictly typed payload for disruption and service change notifications.
 */
export interface DisruptionNotificationPayload {
  type: 'COMMUTE_DISRUPTION' | 'SERVICE_RECOVERED' | 'SERVICE_IMPROVING';
  lineId: LineId;
  lineName: string;
  severity?: number;
  status?: string;
  reason?: string;
  timestamp: number;
}

/**
 * Resolves a safe, validated LineId from an incoming notification payload.
 * 
 * Poka-yoke device:
 * - If `data.lineId` is valid, returns the strongly typed `LineId`.
 * - If missing or unrecognized, returns `null`.
 * - NEVER guesses, NEVER regex-parses user-facing titles/copy, and NEVER defaults to 'victoria'.
 */
export function resolveRerouteTarget(data: unknown): LineId | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const rawLineId = (data as Record<string, any>).lineId;
  if (isLineId(rawLineId)) {
    return rawLineId.toLowerCase().trim() as LineId;
  }

  // Also check if lineId was passed inside a nested disruption object
  const nestedLineId = (data as Record<string, any>).disruption?.lineId;
  if (isLineId(nestedLineId)) {
    return nestedLineId.toLowerCase().trim() as LineId;
  }

  if (rawLineId != null) {
    console.warn(`[resolveRerouteTarget] Unrecognized lineId: "${rawLineId}". Degrading to null without guessing.`);
  }

  return null;
}
