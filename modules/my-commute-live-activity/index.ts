import { requireNativeModule } from 'expo-modules-core';
import type { Tier2Cache } from '../../services/tier2Cache';

// The native module is registered by ExpoModulesCore via expo-module.config.json.
// It exposes startCommuteActivity / updateCommuteActivity / endCommuteActivity / isActivityActive.
const MyCommuteLiveActivityModule = requireNativeModule('MyCommuteLiveActivityModule');

export type LiveActivitySignalState = 'ok' | 'no-signal' | 'meltdown';

/**
 * The exact contract the native Swift layer expects. It is a flattened,
 * display-ready projection of the Tier 2 cache — shaped by the RN layer
 * (Tier2CacheManager agent) BEFORE it reaches the bridge. The bridge does
 * NOT fetch, compute, or duplicate cache data. It only forwards + mirrors.
 */
export interface LiveActivityBridgePayload {
  /** Stable string id of the station (matches tier2:<stationId> key). */
  stationId: string;
  /** Canonical line id, e.g. "northern", "elizabeth", "overground". */
  lineId: string;
  /** Human line name, e.g. "Northern line". */
  lineName: string;
  /**
   * True when the branch / direction is confirmed. Until then the widget shows
   * line-level arrivals keyed by lineId (e.g. "Northern · 3 min") and performs
   * a shared-element content swap (no rebuild) when this flips to true.
   */
  branchKnown: boolean;
  /**
   * Up to 3 soonest arrivals, earliest first. `destinationName` is the
   * direction text (e.g. "Edgware", "Charing Cross"). `timeToStationSeconds`
   * seeds the native system timer (zero network cost once seeded).
   */
  arrivals: Array<{
    destinationName: string;
    timeToStationSeconds: number;
  }>;
  /** Disruption status text from cached disruption data. */
  statusText: string;
  /** Whether the line/branch is currently disrupted. */
  isDisrupted: boolean;
  /** Drives the meltdown glass panel vs normal rendering. */
  signalState: LiveActivitySignalState;
}

export interface MyCommuteLiveActivity {
  startCommuteActivity(payload: LiveActivityBridgePayload): Promise<string | null>;
  updateCommuteActivity(payload: LiveActivityBridgePayload): Promise<void>;
  endCommuteActivity(): Promise<void>;
  isActivityActive(): Promise<boolean>;
}

export default MyCommuteLiveActivityModule as MyCommuteLiveActivity;
