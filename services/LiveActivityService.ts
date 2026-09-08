/**
 * ============================================================================
 * LiveActivityService — READ-ONLY bridge to the Swift Live Activity.
 * ============================================================================
 *
 * CRITICAL ARCHITECTURE RULE (do not violate):
 *   The React Native layer (Tier2CacheManager) is the ONE AND ONLY writer of
 *   the Tier 2 cache. This service READS that cache and forwards a flattened,
 *   display-ready projection to the native bridge module
 *   (modules/my-commute-live-activity). It NEVER fetches TfL, NEVER owns or
 *   duplicates cache state. Single source of truth = the Tier 2 cache.
 *
 *   The native bridge writes a slim JSON mirror of the payload into the App
 *   Group container (group.com.mycommute.app) so the Widget Extension process
 *   — which cannot call this bridge — can render the Lock Screen / Dynamic
 *   Island passively from the same single source of truth.
 *
 * Lifecycle (per master plan & Shush Mode v2.0):
 *   - Starts on Tier 2 geofence entry (NOT Tier 1 exit).
 *   - Respects Shush Mode delivery state ('loud' | 'shush' | 'off').
 *   - Auto-registers dual APNs push tokens (Push-to-Start on iOS 17.2+ & Live Activity).
 *   - Ends at closeSession() (Tier 1 destination arrival) or timeout.
 *   - If there is NOTHING cached, the activity is NOT started (honest void).
 * ============================================================================
 */

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { createMMKV } from 'react-native-mmkv';
import { getTier2Cache } from '../services/tier2Cache';
import { normaliseLineId } from '../utils/normaliseLineId';
import { tflCapitalise } from '../utils/tflCapitalise';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import {
  addPushToStartListener,
  addLiveActivityPushTokenListener,
} from '../modules/my-commute-live-activity';
import { track } from './analyticsService';
import { APP_CONFIG } from '../config/app.config';
import { ensureDeviceIdentity } from './deviceIdentity';
import { estimateFare } from './fareTable';
import { computeDetour } from './detourComputer';

// Re-use the same background MMKV the SessionManager uses (single store).
const backgroundStorage = createMMKV({ id: 'background-storage' });

// The Expo Modules bridge (expo-modules-core requireOptionalNativeModule).
const MyCommuteLiveActivityModule =
  requireOptionalNativeModule('MyCommuteLiveActivityModule') ??
  requireOptionalNativeModule('MyCommuteLiveActivity');

export type LiveActivitySignalState = 'ok' | 'no-signal' | 'meltdown';

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
  arrivals: { destinationName: string; timeToStationSeconds: number; via?: string; branch?: string }[];
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

const MAX_CACHE_AGE_MS = 5 * 60 * 1000; // 5 minutes

export class LiveActivityService {
  private static activeAbortController: AbortController | null = null;
  private static lastDisruptedAt = 0;
  private static lastWidgetSyncAt = 0;
  private static readonly WIDGET_RELOAD_DEBOUNCE_MS = 30_000;
  private static tokenSubscriptions: { remove: () => void }[] = [];

  /**
   * Initialize dual-token listeners for APNs push updates.
   * Observed asynchronously on module mount.
   */
  static initTokenListeners(): void {
    if (Platform.OS !== 'ios') return;
    if (this.tokenSubscriptions.length > 0) return;

    try {
      const subStart = addPushToStartListener((event) => {
        if (!event?.token) return;
        console.log('[LiveActivityService] Push-to-Start token updated:', event.token);
        backgroundStorage.set('push_to_start_token', event.token);
        track('shush_pushtostart_triggered');
        track('shush_token_rotated', { type: 'pushToStart' });
        void this.syncTokenToBackend('pushToStart', event.token);
      });
      this.tokenSubscriptions.push(subStart);

      const subLive = addLiveActivityPushTokenListener((event) => {
        if (!event?.token) return;
        console.log(`[LiveActivityService] Live Activity token for ${event.journeyId}:`, event.token);
        backgroundStorage.set('live_activity_token', event.token);
        track('shush_token_rotated', { type: 'liveActivity', journeyId: event.journeyId });
        void this.syncTokenToBackend('liveActivity', event.token, event.journeyId);
      });
      this.tokenSubscriptions.push(subLive);
    } catch (e) {
      console.warn('[LiveActivityService] Error initializing token listeners:', e);
    }
  }

  private static async syncTokenToBackend(
    tokenType: 'device' | 'liveActivity' | 'pushToStart',
    token: string,
    journeyId?: string
  ): Promise<void> {
    try {
      const { userId, apiKey } = await ensureDeviceIdentity();
      await fetch(`${APP_CONFIG.BACKEND_API_URL}/api/devices/tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-api-key': apiKey,
        },
        body: JSON.stringify({ tokenType, token, journeyId, userId }),
      });
    } catch (err) {
      console.warn(`[LiveActivityService] Failed to sync ${tokenType} token to backend:`, err);
    }
  }

  /**
   * Build the bridge payload from the Tier 2 cache + session context.
   * Returns null when there is nothing usable to show (honest void).
   */
  private static buildPayload(
    stationId: string,
    lineId: string,
    signalStateOverride?: LiveActivitySignalState
  ): LiveActivityBridgePayload | null {
    const cache = getTier2Cache(stationId);
    if (!cache) {
      // Truly nothing cached -> do NOT start a false card.
      return null;
    }

    const ageMs = Date.now() - new Date(cache.arrivalsLastUpdated || cache.grabbedAt).getTime();
    if (!Number.isFinite(ageMs) || ageMs > MAX_CACHE_AGE_MS) {
      console.log(`[LiveActivityService] Tier 2 cache for ${stationId} is stale (${Math.round(ageMs / 1000)}s old) — dropping.`);
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
        via: p.via,
      }));

    if (arrivals.length === 0) {
      // No arrivals cached -> honest void, not a false card.
      return null;
    }

    const disruption = cache.disruption;
    const rawIsDisrupted = disruption?.isDisrupted ?? false;

    if (rawIsDisrupted) {
      LiveActivityService.lastDisruptedAt = Date.now();
    }

    // 120s Anti-Flap Debounce: do not revert to 'Good Service' until 120s of continuous clean data
    const isWithinDebounce = Date.now() - LiveActivityService.lastDisruptedAt < 120 * 1000;
    const isDisrupted = rawIsDisrupted || (LiveActivityService.lastDisruptedAt > 0 && isWithinDebounce);

    // Shush Mode Severity Classification (Section 8)
    let severityTier = 0;
    let statusSeverity: 'good' | 'minor_delays' | 'severe_delays' | 'suspended' = 'good';

    if (isDisrupted) {
      const desc = (disruption?.description || '').toLowerCase();
      if (desc.includes('suspended') || desc.includes('closure') || desc.includes('no service')) {
        severityTier = 3;
        statusSeverity = 'suspended';
      } else if (desc.includes('severe') || desc.includes('part suspended')) {
        severityTier = 2;
        statusSeverity = 'severe_delays';
      } else {
        severityTier = 1;
        statusSeverity = 'minor_delays';
      }
    }

    const rawStatusText = isDisrupted
      ? `${disruption?.description || 'Minor Delays'}${disruption?.reason ? ` — ${disruption.reason}` : ''}`
      : 'Good Service';
    // Max 60 chars per APNs payload limit (Section 6.1)
    const statusText = rawStatusText.length > 60 ? `${rawStatusText.slice(0, 57)}...` : rawStatusText;

    const nextTrainMinutes = Math.max(0, Math.round(arrivals[0].timeToStationSeconds / 60));
    const nowUnix = Math.floor(Date.now() / 1000);
    const estimatedTransitSec = 12 * 60; // 12m typical leg baseline
    const etaTimestamp = nowUnix + arrivals[0].timeToStationSeconds + estimatedTransitSec;
    const delayMinutes = isDisrupted ? (severityTier === 3 ? 20 : severityTier === 2 ? 10 : 4) : 0;
    const etaDelta = delayMinutes > 0 ? `+${delayMinutes}m` : 'On time';

    // Delay Repay Eligibility (delay >= 15 min on TfL operated routes)
    const delayRepayEligible = delayMinutes >= 15;
    const estimatedFare = delayRepayEligible ? estimateFare(1, 2) : null;

    // Branch known when the session has resolved a destination (Priority 1-3).
    const destId = backgroundStorage.getString('commute_destination_id');
    const branchKnown = !!destId;
    const journeyId = `j_${Math.floor(Date.now() / 1000)}`;

    // Derive branchName from hero arrival via, backgroundStorage, or cache
    const rawBranchName =
      backgroundStorage.getString('commute_branch_name') ||
      arrivals[0]?.via ||
      cache.platforms?.[0]?.via ||
      undefined;
    const branchName = rawBranchName
      ? rawBranchName.replace(/^via\s+/i, '').trim()
      : undefined;

    // Signal state override or read from storage.
    const signalState: LiveActivitySignalState =
      signalStateOverride ?? LiveActivityService.readSignalState();

    const detour = severityTier >= 3 ? computeDetour(cleanLineId) : null;

    const liveEndpoints = Array.from(
      new Set(
        arrivals.map((a) => {
          if (a.via) {
            const shortVia = a.via.replace(/^via\s+/i, '').trim();
            return `${a.destinationName} (${shortVia})`;
          }
          return a.destinationName;
        }).filter(Boolean)
      )
    );
    const lineTerminals: Record<string, string[]> = {
      central: ['Epping', 'Hainault', 'West Ruislip', 'Ealing Broadway'],
      northern: ['Bank', 'Charing Cross', 'Edgware', 'High Barnet'],
      piccadilly: ['Cockfosters', 'Heathrow T5', 'Uxbridge'],
      district: ['Upminster', 'Wimbledon', 'Richmond', 'Ealing Broadway'],
      metropolitan: ['Aldgate', 'Amersham', 'Watford', 'Uxbridge'],
      elizabeth: ['Reading', 'Heathrow', 'Shenfield', 'Abbey Wood'],
      victoria: ['Brixton', 'Walthamstow Central'],
      jubilee: ['Stratford', 'Stanmore'],
      bakerloo: ['Elephant & Castle', 'Harrow & Wealdstone'],
      circle: ['Hammersmith', 'Edgware Road'],
      hammersmith: ['Barking', 'Hammersmith'],
    };
    const availableEndpoints =
      liveEndpoints.length > 0
        ? liveEndpoints
        : lineTerminals[cleanLineId.toLowerCase()] || [];
    const selectedEndpoint =
      backgroundStorage.getString('commute_selected_endpoint') ||
      (arrivals[0]?.via
        ? `${arrivals[0].destinationName} (${arrivals[0].via.replace(/^via\s+/i, '').trim()})`
        : arrivals[0]?.destinationName) ||
      availableEndpoints[0] ||
      undefined;
    const sessionStartTime =
      backgroundStorage.getNumber('commute_session_start_time') || nowUnix;
    const phase =
      (backgroundStorage.getString('commute_phase') as
        | 'approaching'
        | 'in_transit'
        | 'arrived'
        | undefined) || 'approaching';
    const currentStationName =
      backgroundStorage.getString('commute_origin_name') || undefined;
    const destinationStationName =
      backgroundStorage.getString('commute_destination_name') || undefined;

    return {
      journeyId,
      backendUrl: APP_CONFIG.BACKEND_API_URL,
      originStation: stationId,
      destinationStation: destId || '',
      stationId,
      lineId: cleanLineId,
      lineName,
      branchKnown,
      branchName,
      arrivals,
      statusSeverity,
      statusText,
      severityTier,
      nextTrainMinutes,
      etaTimestamp,
      etaDelta,
      isDisrupted,
      isEscalated: severityTier >= 3,
      detourLine: detour?.detourLineName ?? null,
      detourMinutes: detour?.detourMinutes ?? null,
      detourStatus: detour?.detourStatus ?? null,
      delayRepayEligible,
      estimatedFare,
      delayMinutes,
      tunnelState: 'normal',
      progress: 0.15,
      segmentMaxDuration: 180,
      signalState,
      phase,
      selectedEndpoint,
      availableEndpoints,
      sessionStartTime,
      currentStationName,
      destinationStationName,
    };
  }

  private static readSignalState(): LiveActivitySignalState {
    const meltdown = backgroundStorage.getBoolean('tfl_global_outage') ?? false;
    return meltdown ? 'meltdown' : 'ok';
  }

  /**
   * Start the Live Activity. Reads the Tier 2 cache for `stationId`.
   * Respects Shush Mode delivery mode ('loud' | 'shush' | 'off').
   */
  static async start(stationId: string, lineId: string, trigger = 'geofence'): Promise<string | null> {
    if (Platform.OS !== 'ios') return null;

    const prefs = useUserPreferencesStore.getState();
    const deliveryMode = prefs.shushPreferences?.alertDeliveryMode || 'shush';
    if (deliveryMode === 'off') {
      console.log('[LiveActivityService] Delivery mode is OFF — suppressing Live Activity start.');
      return null;
    }

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
      console.log(`[LiveActivityService] Started activity ${activityId} in ${deliveryMode} mode`);
      track('shush_session_started', { trigger, mode: deliveryMode });
      if (payload.severityTier === 3) {
        track('shush_escalation_fired', { line: payload.lineId, tier: 3 });
      }
      return activityId;
    } catch (e) {
      console.error('[LiveActivityService] Failed to start activity:', e);
      return null;
    }
  }

  /**
   * Update the running Live Activity from the (already refreshed) Tier 2 cache.
   */
  static async update(
    stationId: string,
    lineId: string,
    signalStateOverride?: LiveActivitySignalState
  ): Promise<void> {
    if (Platform.OS !== 'ios') return;
    if (!MyCommuteLiveActivityModule || typeof MyCommuteLiveActivityModule.updateCommuteActivity !== 'function') {
      return;
    }
    const payload = this.buildPayload(stationId, lineId, signalStateOverride);
    if (!payload) {
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
    } else {
      backgroundStorage.set('tfl_global_outage', false);
    }
    const sid = stationId || backgroundStorage.getString('commute_origin_id') || '';
    const lid = lineId || backgroundStorage.getString('commute_line_id') || '';
    if (sid) {
      await this.update(sid, lid, state);
    }
  }

  /** Update the Live Activity phase (approaching -> in_transit -> arrived). */
  static async updatePhase(
    phase: 'approaching' | 'in_transit' | 'arrived',
    destinationName?: string
  ): Promise<void> {
    backgroundStorage.set('commute_phase', phase);
    if (destinationName) {
      backgroundStorage.set('commute_destination_name', destinationName);
    }
    const originId = backgroundStorage.getString('commute_origin_id');
    const lineId = backgroundStorage.getString('commute_line_id');
    if (originId && lineId) {
      await this.update(originId, lineId);
    }
  }

  /**
   * Synchronizes user's saved lines and latest status snapshots to the App Group UserDefaults.
   */
  static async syncWidgetCache(selectedLines: string[], customStatuses?: { id: string; name: string; status: string; severity: number }[]): Promise<void> {
    if (Platform.OS !== 'ios') return;
    if (!MyCommuteLiveActivityModule || typeof MyCommuteLiveActivityModule.syncWidgetCache !== 'function') {
      return;
    }

    const now = Date.now();
    if (now - this.lastWidgetSyncAt < this.WIDGET_RELOAD_DEBOUNCE_MS) {
      return;
    }
    this.lastWidgetSyncAt = now;

    try {
      const lines = (selectedLines && selectedLines.length > 0)
        ? selectedLines
        : useUserPreferencesStore.getState().selectedLines;

      const linesArray = (lines && lines.length > 0)
        ? lines.map(id => ({ id: normaliseLineId(id), name: tflCapitalise(id) }))
        : [];

      const linesJson = JSON.stringify(linesArray);

      let statusesJson = '';
      if (customStatuses && customStatuses.length > 0) {
        statusesJson = JSON.stringify(customStatuses);
      } else {
        const baselineStatuses = linesArray.map(l => ({
          id: l.id,
          name: l.name,
          status: 'Good Service',
          severity: 10,
        }));
        statusesJson = JSON.stringify(baselineStatuses);
      }

      await MyCommuteLiveActivityModule.syncWidgetCache(linesJson, statusesJson);
      console.log('[LiveActivityService] Synced widget pre-warmed snapshot cache.');
    } catch (e) {
      console.error('[LiveActivityService] syncWidgetCache failed:', e);
    }
  }

  /**
   * 1-Tap Preview trigger for instant on-device testing of Dynamic Island & Lock Screen Live Activity.
   * Auto-terminates after 5 seconds per Shush Onboarding spec (Section 19).
   */
  static async startPreviewActivity(): Promise<string | null> {
    if (Platform.OS !== 'ios') return null;
    if (!MyCommuteLiveActivityModule || typeof MyCommuteLiveActivityModule.startCommuteActivity !== 'function') {
      return null;
    }

    const state = useUserPreferencesStore.getState();
    const primaryLineId = state.selectedLines?.[0] || 'piccadilly';
    const primaryLineName = tflCapitalise(primaryLineId);
    const station = state.pinnedStations?.[0];

    const previewPayload: LiveActivityBridgePayload = {
      journeyId: `preview_${Math.floor(Date.now() / 1000)}`,
      originStation: station?.id || '940GZZLUPKC',
      destinationStation: 'Piccadilly Circus',
      stationId: station?.id || '940GZZLUPKC',
      lineId: primaryLineId,
      lineName: primaryLineName,
      branchKnown: true,
      arrivals: [
        { destinationName: 'Cockfosters', timeToStationSeconds: 120 },
        { destinationName: 'Arnos Grove', timeToStationSeconds: 300 },
      ],
      statusSeverity: 'good',
      statusText: 'Good Service',
      severityTier: 0,
      nextTrainMinutes: 2,
      etaTimestamp: Math.floor(Date.now() / 1000) + 720,
      etaDelta: 'On time',
      isDisrupted: false,
      isEscalated: false,
      delayRepayEligible: false,
      delayMinutes: 0,
      tunnelState: 'normal',
      progress: 0.25,
      segmentMaxDuration: 180,
      signalState: 'ok',
      phase: 'approaching',
      availableEndpoints: ['Cockfosters', 'Arnos Grove'],
      selectedEndpoint: 'Cockfosters',
      sessionStartTime: Math.floor(Date.now() / 1000),
      currentStationName: "King's Cross St. Pancras",
      destinationStationName: 'Piccadilly Circus',
    };

    try {
      const activityId = await MyCommuteLiveActivityModule.startCommuteActivity(previewPayload);
      console.log(`[LiveActivityService] Started preview activity ${activityId}`);
      track('shush_session_started', { trigger: 'preview', mode: 'shush' });

      // Auto-terminate after 5 seconds
      setTimeout(() => {
        void this.end('demo_timeout');
      }, 5000);

      return activityId;
    } catch (e) {
      console.error('[LiveActivityService] Failed to start preview activity:', e);
      return null;
    }
  }

  static async stopPreviewActivity(): Promise<void> {
    await this.end('manual_preview_stop');
  }

  static async end(reason = 'destination_reached'): Promise<void> {
    if (Platform.OS !== 'ios') return;
    if (!MyCommuteLiveActivityModule || typeof MyCommuteLiveActivityModule.endCommuteActivity !== 'function') {
      return;
    }
    try {
      await MyCommuteLiveActivityModule.endCommuteActivity();
      console.log(`[LiveActivityService] Ended activity. Reason: ${reason}`);
      track('shush_session_ended', { reason });
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

  static async hasDynamicIsland(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    if (!MyCommuteLiveActivityModule || typeof MyCommuteLiveActivityModule.hasDynamicIsland !== 'function') {
      return false;
    }
    try {
      return await MyCommuteLiveActivityModule.hasDynamicIsland();
    } catch {
      return false;
    }
  }

  static async checkTimeSensitivePermission(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    if (!MyCommuteLiveActivityModule || typeof MyCommuteLiveActivityModule.checkTimeSensitivePermission !== 'function') {
      return false;
    }
    try {
      return await MyCommuteLiveActivityModule.checkTimeSensitivePermission();
    } catch {
      return false;
    }
  }

  static async requestTimeSensitivePermission(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;
    if (!MyCommuteLiveActivityModule || typeof MyCommuteLiveActivityModule.requestTimeSensitivePermission !== 'function') {
      return false;
    }
    try {
      const granted = await MyCommuteLiveActivityModule.requestTimeSensitivePermission();
      useUserPreferencesStore.getState().setTimeSensitiveGranted(granted);
      return granted;
    } catch {
      return false;
    }
  }
}

export default LiveActivityService;
