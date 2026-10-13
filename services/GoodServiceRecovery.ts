// frontend/services/GoodServiceRecovery.ts
// ==============================================================================
// Good Service Recovery Service (Phase 1)
//
// Governed by Grounded Invariant:
// 1. Idle -> dismiss notification, start dedicated 8-second good_service island.
// 2. Commute on same line -> update activity in-place (turns countdown clean white).
// 3. Commute on other line -> dismiss notification only, leave running activity untouched.
// 4. Zero fake commute data: never pass origin, destination, or fake arrivals.
// ==============================================================================

import { AppState } from 'react-native';
import { createMMKV } from 'react-native-mmkv';
import { LINE_NAMES } from '../constants/lineColors';
import { dismissDisruptionNotification } from './notifications/dispatch';
import { SessionManager } from './SessionManager';
import { LiveActivityService } from './LiveActivityService';
import { getPermissionEntry } from '../store/permissionOrchestrator';
import MyCommuteLiveActivityModule from '../modules/my-commute-live-activity';

export type LineId = string;

export interface ActiveCommuteInfo {
  lineId: string;
  originStationId: string;
}

export interface RecoveryDeps {
  dismissNotification: (lineId: string) => Promise<void>;
  getActiveCommute: () => ActiveCommuteInfo | null;
  startGoodServiceActivity: (lineId: string, lineName?: string) => Promise<string | null>;
  updateActivity: (stationId: string, lineId: string) => Promise<void>;
  resetDisruptionDebounce?: (lineId: string) => void;
  canShowIsland: () => boolean;
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
  startGoodServiceActivity: async (lineId: string, lineName?: string): Promise<string | null> => {
    // Only starts if app is currently in foreground (iOS ActivityKit foreground requirement)
    if (AppState.currentState !== 'active') {
      return null;
    }
    if (!MyCommuteLiveActivityModule || typeof MyCommuteLiveActivityModule.startGoodServiceActivity !== 'function') {
      return null;
    }
    const resolvedName = lineName ?? (LINE_NAMES[lineId] ?? lineId.toUpperCase());
    try {
      return await MyCommuteLiveActivityModule.startGoodServiceActivity(lineId, resolvedName);
    } catch (e) {
      console.warn('[GoodServiceRecovery] Failed to start good service activity:', e);
      return null;
    }
  },
  updateActivity: async (stationId: string, lineId: string): Promise<void> => {
    await LiveActivityService.update(stationId, lineId);
  },
  resetDisruptionDebounce: (lineId: string) => {
    LiveActivityService.resetDisruptionDebounce(lineId);
  },
  canShowIsland: (): boolean => {
    return getPermissionEntry('notifications').decision === 'granted';
  },
};

/**
 * Handle recovery when a TfL rail line transitions from disrupted back to Good Service.
 */
export async function handleGoodServiceRecovery(
  lineId: LineId,
  deps: RecoveryDeps = liveRecoveryDeps
): Promise<void> {
  // Always dismiss the prior disruption notification for this line
  await deps.dismissNotification(lineId);

  const commute = deps.getActiveCommute();
  if (!commute) {
    // Branch 1: Idle — start dedicated 8-second Good Service Live Activity
    if (!deps.canShowIsland()) return; // dismissal already ran above
    try {
      const lineName = LINE_NAMES[lineId] ?? lineId;
      await deps.startGoodServiceActivity(lineId, lineName);
    } catch (e) {
      console.warn('[GoodServiceRecovery] startGoodServiceActivity failed gracefully:', e);
    }
    return;
  }

  // Branch 2: Commute on the same line — update running commute in-place
  if (commute.lineId === lineId) {
    if (deps.resetDisruptionDebounce) {
      deps.resetDisruptionDebounce(lineId);
    }
    await deps.updateActivity(commute.originStationId, lineId);
    return;
  }

  // Branch 3: Commute on a different line — do not touch the active commute
}
