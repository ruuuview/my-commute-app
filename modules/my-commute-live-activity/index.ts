import { requireOptionalNativeModule, EventEmitter } from 'expo-modules-core';
import type { Tier2Cache } from '../../services/tier2Cache';

export interface EventSubscription {
  remove(): void;
}

const mockFallbackModule = {
  startCommuteActivity: async () => null,
  updateCommuteActivity: async () => {},
  endCommuteActivity: async () => {},
  isActivityActive: async () => false,
  syncWidgetCache: async () => {},
  hasDynamicIsland: async () => false,
  checkTimeSensitivePermission: async () => false,
  requestTimeSensitivePermission: async () => false,
  addListener: () => ({ remove: () => {} }),
  removeListeners: () => {},
};

// The native module is registered by ExpoModulesCore via expo-module.config.json.
// It exposes startCommuteActivity / updateCommuteActivity / endCommuteActivity / isActivityActive /
// syncWidgetCache / hasDynamicIsland / checkTimeSensitivePermission / requestTimeSensitivePermission.
const MyCommuteLiveActivityModule =
  requireOptionalNativeModule('MyCommuteLiveActivityModule') ??
  requireOptionalNativeModule('MyCommuteLiveActivity') ??
  mockFallbackModule;

const emitter = new EventEmitter(MyCommuteLiveActivityModule as any);

export type LiveActivitySignalState = 'ok' | 'no-signal' | 'meltdown';

/**
 * The exact contract the native Swift layer expects. It is a flattened,
 * display-ready projection of the Tier 2 cache — shaped by the RN layer
 * (Tier2CacheManager agent) BEFORE it reaches the bridge. The bridge does
 * NOT fetch, compute, or duplicate cache data. It only forwards + mirrors.
 */
export interface LiveActivityBridgePayload {
  journeyId?: string;
  backendUrl?: string;
  originStation?: string;
  destinationStation?: string;
  stationId: string;
  lineId: string;
  lineName: string;
  branchKnown: boolean;
  branchName?: string;
  arrivals: Array<{
    destinationName: string;
    timeToStationSeconds: number;
    via?: string;
    branch?: string;
  }>;
  statusSeverity?: 'good' | 'minor_delays' | 'severe_delays' | 'suspended';
  statusText: string;
  severityTier?: number;
  nextTrainMinutes?: number;
  etaTimestamp?: number;
  etaDelta?: string;
  isDisrupted: boolean;
  isEscalated?: boolean;
  detourLine?: string | null;
  detourMinutes?: number | null;
  detourStatus?: string | null;
  delayRepayEligible?: boolean;
  estimatedFare?: string | null;
  delayMinutes?: number;
  tunnelState?: 'normal' | 'held';
  progress?: number;
  segmentMaxDuration?: number;
  signalState: LiveActivitySignalState;
  phase?: 'approaching' | 'in_transit' | 'arrived';
  selectedEndpoint?: string;
  availableEndpoints?: string[];
  sessionStartTime?: number;
  currentStationName?: string;
  destinationStationName?: string;
}

export interface MyCommuteLiveActivity {
  startCommuteActivity(payload: LiveActivityBridgePayload): Promise<string | null>;
  updateCommuteActivity(payload: LiveActivityBridgePayload): Promise<void>;
  endCommuteActivity(): Promise<void>;
  isActivityActive(): Promise<boolean>;
  syncWidgetCache(linesJson: string, statusesJson: string): Promise<void>;
  hasDynamicIsland(): Promise<boolean>;
  checkTimeSensitivePermission(): Promise<boolean>;
  requestTimeSensitivePermission(): Promise<boolean>;
}

export function addPushToStartListener(listener: (event: { token: string }) => void): EventSubscription {
  return (emitter as any).addListener('onPushToStartTokenUpdate', listener);
}

export function addLiveActivityPushTokenListener(
  listener: (event: { journeyId: string; token: string }) => void
): EventSubscription {
  return (emitter as any).addListener('onLiveActivityPushTokenUpdate', listener);
}

export default MyCommuteLiveActivityModule as MyCommuteLiveActivity;


