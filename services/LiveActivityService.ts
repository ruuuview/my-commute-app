/**
 * ============================================================================
 * LiveActivityService — READ-ONLY bridge to the Swift Live Activity.
 * ============================================================================
 *
 * CRITICAL ARCHITECTURE RULE (do not violate):
 *   The React Native layer (Tier2CacheManager) is the ONE AND ONLY writer of
 *   the Tier 2 cache. This service READS that cache and forwards a flattened,
 *   display-ready payload to the native bridge module
 *   (modules/my-commute-live-activity). It NEVER fetches TfL, NEVER owns or
 *   duplicates cache state. Single source of truth = the Tier 2 cache.
 *
 *   The native bridge writes a slim JSON mirror of the payload into the App
 *   Group container (group.com.mycommute.app) so the Widget Extension process
 *   — which cannot call this bridge — can render the Lock Screen / Dynamic
 *   Island passively from the same single source of truth.
 *
 * Lifecycle (per master plan):
 *   - Starts on Tier 2 geofence entry (NOT Tier 1 exit).
 *   - Ends at closeSession() (Tier 1 destination arrival).
 *   - If there is NOTHING cached, the activity is NOT started (honest void).
 * ============================================================================
 */

import { NativeModules, Platform } from 'react-native';
import { createMMKV } from 'react-native-mmkv';
import { getTier2Cache, type Tier2Cache } from '../services/tier2Cache';
import { normaliseLineId } from '../utils/normaliseLineId';
import { tflCapitalise } from '../utils/tflCapitalise';

// Re-use the same background MMKV the SessionManager uses (single store).
const backgroundStorage = createMMKV({ id: 'background-storage' });

// The Expo Modules bridge (expo-modules-core requireNativeModule).
const { MyCommuteLiveActivityModule } = NativeModules;

export type LiveActivitySignalState = 'ok' | 'no-signal' | 'meltdown';

export interface LiveActivityBridgePayload {
  stationId: string;
  lineId: string;
  lineName: string;
  branchKnown: boolean;
  arrivals: Array<{ destinationName: string; timeToStationSeconds: number }>;
  statusText: string;
  isDisrupted: boolean;
  signalState: LiveActivitySignalState;
}

const SOFTEN_THRESHOLD_SECONDS = 5 * 60; // under ~5 min = full confidence

export class LiveActivityService {
  private static activeAbortController: AbortController | null = null;

  /**
   * Build the bridge payload from the Tier 2 cache + session context.
   * Returns null when there is nothing usable to show (honest void).
   */
  private static buildPayload(stationId: string, lineId: string): LiveActivityBridgePayload | null {
    const cache = getTier2Cache(stationId);
    if (!cache) {
      // Truly nothing cached -> do NOT start a false card.
      return null;
    }

    const { cleanLineId } = normaliseLineId(cache.lineId || lineId);
    const lineName = tflCapitalise(cleanLineId);

    // Arrivals: earliest first (cache already sorted by timeToStation).
    const arrivals = (cache.platforms || [])
      .slice(0, 3)
      .map((p) => ({
        destinationName: p.destinationName || '',
        timeToStationSeconds: Math.max(0, Math.round(p.timeToStation || 0)),
      }));

    if (arrivals.length === 0) {
      // No arrivals cached -> honest void, not a false card.
      return null;
    }

    const disruption = cache.disruption;
    const isDisrupted = disruption?.isDisrupted ?? false;
    const statusText = isDisrupted
      ? `${disruption?.description || 'Disrupted'}${disruption?.reason ? ` — ${disruption.reason}` : ''}`
      : 'On time';

    // Branch known when the session has resolved a destination (Priority 1-3).
    const branchKnown = !!backgroundStorage.getString('commute_destination_id');

    // Signal state: meltdown is a backend global-outage flag; no-signal is the
    // absence of any cache (handled above as null). We pass 'ok' here and the
    // caller can force 'meltdown' via startWithSignalState().
    const signalState: LiveActivitySignalState = LiveActivityService.readSignalState();

    return {
      stationId,
      lineId: cleanLineId,
      lineName,
      branchKnown,
      arrivals,
      statusText,
      isDisrupted,
      signalState,
    };
  }

  private static readSignalState(): LiveActivitySignalState {
    // Backend flags global outage after 2 consecutive failed poll cycles.
    // The poller/backend writes this flag; we only read it.
    const meltdown = backgroundStorage.getBoolean('tfl_global_outage') ?? false;
    return meltdown ? 'meltdown' : 'ok';
  }

  /**
   * Start the Live Activity. Reads the Tier 2 cache for `stationId`.
   * If the cache is empty, no activity is started (honest void, not a false card).
   */
  static async start(stationId: string, lineId: string): Promise<string | null> {
    if (Platform.OS !== 'ios') return null;

    if (!MyCommuteLiveActivityModule || typeof MyCommuteLiveActivityModule.startCommuteActivity !== 'function') {
      console.warn('[LiveActivityService] MyCommuteLiveActivityModule.startCommuteActivity unavailable.');
      return null;
    }

    const payload = this.buildPayload(stationId, lineId);
    if (!payload) {
      console.log('[LiveActivityService] No cache available — not starting a false Live Activity.');
      return null;
    }

    try {
      const activityId = await MyCommuteLiveActivityModule.startCommuteActivity(payload);
      console.log(`[LiveActivityService] Started activity ${activityId}`);
      return activityId;
    } catch (e) {
      console.error('[LiveActivityService] Failed to start activity:', e);
      return null;
    }
  }

  /**
   * Update the running Live Activity from the (already refreshed) Tier 2 cache.
   * Called whenever the Tier2CacheManager emits onTier2CachePopulated.
   * If signal returns after a gap, the widget flashes the resumed content
   * (handled natively by ActivityKit re-render).
   */
  static async update(stationId: string, lineId: string): Promise<void> {
    if (Platform.OS !== 'ios') return;
    if (!MyCommuteLiveActivityModule || typeof MyCommuteLiveActivityModule.updateCommuteActivity !== 'function') {
      return;
    }
    const payload = this.buildPayload(stationId, lineId);
    if (!payload) {
      // Cache vanished mid-session: keep the last rendered content (it stays
      // softened as normal). Do not crash the activity.
      return;
    }
    try {
      await MyCommuteLiveActivityModule.updateCommuteActivity(payload);
    } catch (e) {
      console.error('[LiveActivityService] Update failed:', e);
    }
  }

  /** Force a meltdown / no-signal / recovery render. */
  static async updateSignalState(state: LiveActivitySignalState, stationId?: string, lineId?: string): Promise<void> {
    if (Platform.OS !== 'ios') return;
    if (state === 'meltdown') {
      backgroundStorage.set('tfl_global_outage', true);
    } else if (state === 'ok') {
      backgroundStorage.set('tfl_global_outage', false);
    }
    // For meltdown / no-signal we still need a payload to drive the copy. If we
    // have a last-known cache, use it; otherwise the widget shows the void.
    const sid = stationId || backgroundStorage.getString('commute_origin_id') || '';
    const lid = lineId || backgroundStorage.getString('commute_line_id') || '';
    if (sid) {
      await this.update(sid, lid);
    }
  }

  static async end(): Promise<void> {
    if (Platform.OS !== 'ios') return;
    if (!MyCommuteLiveActivityModule || typeof MyCommuteLiveActivityModule.endCommuteActivity !== 'function') {
      return;
    }
    try {
      await MyCommuteLiveActivityModule.endCommuteActivity();
      console.log('[LiveActivityService] Ended activity');
    } catch (e) {
      console.error('[LiveActivityService] Failed to end activity:', e);
    }
  }

  static async isActive(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    if (!MyCommuteLiveActivityModule || typeof MyCommuteLiveActivityModule.isActivityActive !== 'function') {
      return false;
    }
    try {
      return await MyCommuteLiveActivityModule.isActivityActive();
    } catch (e) {
      console.error('[LiveActivityService] isActivityActive failed:', e);
      return false;
    }
  }
}

export default LiveActivityService;
