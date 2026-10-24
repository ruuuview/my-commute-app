import { Platform } from 'react-native';
import { requireOptionalNativeModule, EventEmitter } from 'expo-modules-core';

export type TimeSensitiveStatus = 'not_supported' | 'disabled' | 'enabled';

export interface EventSubscription {
  remove(): void;
}

const mockFallbackModule = {
  startCommuteActivity: async () => null,
  startGoodServiceActivity: async (_lineId: string, _lineName: string) => null,
  endGoodServiceActivities: async () => {},
  updateCommuteActivity: async () => {},
  endCommuteActivity: async () => {},
  isActivityActive: async () => false,
  syncWidgetCache: async () => {},
  hasDynamicIsland: async () => false,
  getTimeSensitiveStatus: async (): Promise<TimeSensitiveStatus> => 'not_supported',
  checkTimeSensitivePermission: async () => false,
  requestTimeSensitivePermission: async () => false,
  areActivitiesEnabled: async () => false,
  activityAuthorizationInfo: async () => ({ supported: false, enabled: false }),
  getManualShushDate: async () => null,
  setManualShushDate: async () => {},
  registerNotificationCategories: async () => {},
  getPushToStartToken: async () => null,
  addListener: () => ({ remove: () => {} }),
  removeListeners: () => {},
};

// The native module is registered by ExpoModulesCore via expo-module.config.json.
const rawNativeModule =
  requireOptionalNativeModule('MyCommuteLiveActivityModule') ??
  requireOptionalNativeModule('MyCommuteLiveActivity');

const MyCommuteLiveActivityModule = rawNativeModule
  ? new Proxy(rawNativeModule, {
      get(target, prop, receiver) {
        const val = Reflect.get(target, prop, receiver);
        if (typeof val !== 'undefined') {
          return typeof val === 'function' ? val.bind(target) : val;
        }
        return (mockFallbackModule as any)[prop];
      },
    })
  : mockFallbackModule;

const emitter = new EventEmitter((rawNativeModule ?? mockFallbackModule) as any);

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
  arrivals: {
    destinationName: string;
    timeToStationSeconds: number;
    via?: string;
    branch?: string;
  }[];
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
  startGoodServiceActivity(lineId: string, lineName: string): Promise<string | null>;
  endGoodServiceActivities(): Promise<void>;
  updateCommuteActivity(payload: LiveActivityBridgePayload): Promise<void>;
  endCommuteActivity(): Promise<void>;
  isActivityActive(): Promise<boolean>;
  syncWidgetCache(linesJson: string, statusesJson: string): Promise<void>;
  hasDynamicIsland(): Promise<boolean>;
  getTimeSensitiveStatus(): Promise<TimeSensitiveStatus>;
  checkTimeSensitivePermission(): Promise<boolean>;
  requestTimeSensitivePermission(): Promise<boolean>;
  areActivitiesEnabled(): Promise<boolean>;
  activityAuthorizationInfo(): Promise<{ supported: boolean; enabled: boolean }>;
  /** Shared App Group manual-shush key. Unix seconds, or null when unshushed. */
  getManualShushDate(): Promise<number | null>;
  setManualShushDate(epochSeconds: number | null): Promise<void>;
  /** Registers native UNNotificationCategory with UNNotificationActionIcon for REROUTE_ONLY. */
  registerNotificationCategories(): Promise<void>;
  /** Bridge-cached Push-to-Start token (hex), or null when none has been emitted yet. */
  getPushToStartToken(): Promise<string | null>;
}

export function addPushToStartListener(listener: (event: { token: string }) => void): EventSubscription {
  return (emitter as any).addListener('onPushToStartTokenUpdate', listener);
}

export function addLiveActivityPushTokenListener(
  listener: (event: { journeyId: string; token: string }) => void
): EventSubscription {
  return (emitter as any).addListener('onLiveActivityPushTokenUpdate', listener);
}

/**
 * Returns the Push-to-Start token most recently observed (and cached) by the
 * native bridge, recovering tokens emitted before JS listeners attached.
 * Resolves to null on any error or on non-iOS platforms.
 */
export async function getPushToStartToken(): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    const mod = MyCommuteLiveActivityModule as unknown as {
      getPushToStartToken?: () => Promise<string | null>;
    };
    if (typeof mod.getPushToStartToken !== 'function') return null;
    return await mod.getPushToStartToken();
  } catch {
    return null;
  }
}

export default MyCommuteLiveActivityModule as MyCommuteLiveActivity;


