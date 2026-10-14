// frontend/services/GoodServiceRecovery.ts
// ==============================================================================
// Line Recovery Service
//
// Governed by Grounded Invariants:
// 1. Idle -> wipe old disruption push notification (line-disruption-${lineId}) ONLY.
//    Zero Live Activity started when idle. Zero Lock Screen card. Zero island popups.
// 2. Commute on same line -> update running Live Activity in-place (turns countdown clean white),
//    resetting disruption debounce beforehand.
// 3. Commute on other line -> wipe old notification only, leave running activity untouched.
// 4. Zero fake commute data: never pass fake origin, destination, or fake arrivals.
// ==============================================================================

import { createMMKV } from 'react-native-mmkv';
import { LINE_NAMES } from '../constants/lineColors';
import { dismissDisruptionNotification } from './notifications/dispatch';
import { SessionManager } from './SessionManager';
import { LiveActivityService } from './LiveActivityService';

export type LineId = string;

export interface ActiveCommuteInfo {
  lineId: string;
  originStationId: string;
}

export interface RecoveryDeps {
  dismissNotification: (lineId: string) => Promise<void>;
  getActiveCommute: () => ActiveCommuteInfo | null;
  updateActivity: (stationId: string, lineId: string) => Promise<void>;
  resetDisruptionDebounce?: (lineId: string) => void;
}

const backgroundStorage = createMMKV({ id: 'background-storage' });

export const liveRecoveryDeps: RecoveryDeps = {
  dismissNotification: async (lineId: string) => {
    const lineName = LINE_NAMES[lineId] ?? lineId;
    await dismissDisruptionNotification({ lineId, lineName });
  },
  getActiveCommute: (): ActiveCommuteInfo | null => {
    const sessionState = SessionManager.getSessionState();
    if (sessionState === 'idle') {
      return null;
    }
    const lineId = SessionManager.getCommuteLineId() || backgroundStorage.getString('commute_line_id') || '';
    const originStationId = SessionManager.getCommuteOriginId() || backgroundStorage.getString('commute_origin_id') || '';
    if (!lineId || !originStationId) {
      return null;
    }
    return { lineId, originStationId };
  },
  updateActivity: async (stationId: string, lineId: string): Promise<void> => {
    await LiveActivityService.update(stationId, lineId);
  },
  resetDisruptionDebounce: (lineId: string) => {
    LiveActivityService.resetDisruptionDebounce(lineId);
  },
};

/**
 * Handle recovery when a TfL rail line status recovers (e.g. to Good Service or downgraded severity).
 */
export async function handleLineRecovery(
  lineId: LineId,
  deps: RecoveryDeps = liveRecoveryDeps
): Promise<void> {
  // Always dismiss the prior disruption notification for this line
  await deps.dismissNotification(lineId);

  if (deps.resetDisruptionDebounce) {
    deps.resetDisruptionDebounce(lineId);
  }

  const commute = deps.getActiveCommute();
  if (!commute) {
    // Branch 1: Idle — notification wiped, zero Live Activities started
    return;
  }

  // Branch 2: Commute on the same line — update running commute in-place
  if (commute.lineId === lineId) {
    await deps.updateActivity(commute.originStationId, lineId);
    return;
  }

  // Branch 3: Commute on a different line — do not touch the active commute
}

// Backwards-compatible alias
export const handleGoodServiceRecovery = handleLineRecovery;
