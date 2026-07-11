import { NativeModules, Platform } from 'react-native';
import { resolveTflStopIds } from '../utils/resolveTflStopId';
import { normaliseLineId } from '../utils/normaliseLineId';
import { APP_CONFIG } from '../config/app.config';

const { LiveActivityModule } = NativeModules;

export interface LiveActivityStartConfig {
  originStation: string;
  destinationStation: string;
  lineId: string;
  lineName: string;
  originId: string;
}

const FETCH_TIMEOUT_MS = 8000;

const fetchWithTimeout = (url: string, signal?: AbortSignal, ms = FETCH_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  
  const onParentAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', onParentAbort, { once: true });
    }
  }

  return fetch(url, { signal: controller.signal })
    .finally(() => {
      clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener('abort', onParentAbort);
      }
    });
};

const fetchTflDirect = async (stationId: string, lineId: string, signal?: AbortSignal) => {
  try {
    const resolvedIds = resolveTflStopIds(stationId);
    const responses = await Promise.all(
      resolvedIds.map(id =>
        fetchWithTimeout(`${APP_CONFIG.BACKEND_URL}/api/stations/${id}`, signal)
          .then(res => (res.ok ? res.json() : null))
          .catch(() => null)
      )
    );

    const allRawDepartures: any[] = [];
    responses.forEach(sData => {
      if (sData && Array.isArray(sData.departures)) {
        allRawDepartures.push(...sData.departures);
      }
    });

    const filtered = allRawDepartures.filter(dep => {
      const { cleanLineId } = normaliseLineId(dep.line);
      const isOvergroundBranch = ['liberty', 'lioness', 'mildmay', 'suffragette', 'weaver', 'windrush'].includes(cleanLineId);
      const canonicalLineId = isOvergroundBranch ? 'overground' : cleanLineId;
      return canonicalLineId === lineId;
    });

    filtered.sort((a, b) => (a.minutes_away || 0) - (b.minutes_away || 0));

    const nextTrainMinutes = filtered[0]?.minutes_away ?? 0;
    const followingTrainMinutes = filtered[1]?.minutes_away ?? 0;

    let lineStatus = 'Good service';
    try {
      const lResp = await fetchWithTimeout(`${APP_CONFIG.BACKEND_URL}/api/lines`, signal);
      if (lResp.ok) {
        const lines = await lResp.json();
        const lineInfo = lines.find((l: any) => l.id.toLowerCase() === lineId.toLowerCase());
        if (lineInfo?.status) {
          lineStatus = lineInfo.status;
        }
      }
    } catch (e) {
      console.warn('Failed to fetch line status for widget poll:', e);
    }

    const expectedArrivalStr = filtered[0]?.expected_arrival;
    let nextTrainEpoch: number | null = null;
    if (expectedArrivalStr) {
      nextTrainEpoch = Math.floor(new Date(expectedArrivalStr).getTime() / 1000);
    }

    return {
      nextTrainMinutes,
      followingTrainMinutes,
      lineStatus,
      nextTrainEpoch,
    };
  } catch (error) {
    console.error('Failed to fetch TfL direct:', error);
    return {
      nextTrainMinutes: 0,
      followingTrainMinutes: 0,
      lineStatus: 'Offline',
      nextTrainEpoch: null,
    };
  }
};

export class LiveActivityService {
  private static pollIntervalId: any = null;
  private static activeAbortController: AbortController | null = null;

  static async start(config: LiveActivityStartConfig): Promise<string | null> {
    if (Platform.OS !== 'ios') return null;

    try {
      if (!LiveActivityModule || typeof LiveActivityModule.startCommuteActivity !== 'function') {
        console.warn('⚠️ LiveActivityModule.startCommuteActivity is not available.');
        return null;
      }

      // Abort any existing in-flight activity requests or loops
      if (this.activeAbortController) {
        this.activeAbortController.abort();
      }

      const controller = new AbortController();
      this.activeAbortController = controller;

      // Initial direct fetch
      const initialData = await fetchTflDirect(config.originId, config.lineId, controller.signal);
      if (controller.signal.aborted) {
        return null;
      }

      const activityId = await LiveActivityModule.startCommuteActivity(
        config.originStation,
        config.destinationStation,
        config.lineId,
        config.lineName,
        initialData.nextTrainMinutes,
        initialData.followingTrainMinutes,
        initialData.lineStatus,
        initialData.nextTrainEpoch ?? -1
      );

      if (controller.signal.aborted) {
        await LiveActivityModule.endCommuteActivity().catch(() => {});
        return null;
      }

      console.log(`✅ LiveActivityService: Started activity with ID ${activityId}`);

      // Start 30-second polling loop
      if (this.pollIntervalId) {
        clearInterval(this.pollIntervalId);
      }

      this.pollIntervalId = setInterval(async () => {
        if (controller.signal.aborted) return;
        console.log(`[LiveActivityService] Polling arrivals for ${config.originId} on ${config.lineId}`);
        const data = await fetchTflDirect(config.originId, config.lineId, controller.signal);
        
        if (controller.signal.aborted) return;

        try {
          await LiveActivityModule.updateCommuteActivity(
            data.nextTrainMinutes,
            data.followingTrainMinutes,
            data.lineStatus,
            data.nextTrainEpoch ?? -1
          );
          console.log(`[LiveActivityService] Updated widget next: ${data.nextTrainMinutes}m, follow: ${data.followingTrainMinutes}m`);
        } catch (err) {
          console.error('[LiveActivityService] Update fail inside poll:', err);
        }
      }, 30000);

      return activityId;
    } catch (error) {
      console.error('❌ LiveActivityService: Failed to start activity:', error);
      return null;
    }
  }

  static async end(): Promise<void> {
    if (Platform.OS !== 'ios') return;

    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }

    // Clear polling loop
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
      console.log('[LiveActivityService] Polling loop cleared');
    }

    try {
      if (!LiveActivityModule || typeof LiveActivityModule.endCommuteActivity !== 'function') {
        console.warn('⚠️ LiveActivityModule.endCommuteActivity is not available.');
        return;
      }

      await LiveActivityModule.endCommuteActivity();
      console.log('✅ LiveActivityService: Ended active activities');
    } catch (error) {
      console.error('❌ LiveActivityService: Failed to end activity:', error);
    }
  }

  static async isActive(): Promise<boolean> {
    if (Platform.OS !== 'ios') return false;

    try {
      if (!LiveActivityModule || typeof LiveActivityModule.isActivityActive !== 'function') {
        return false;
      }
      return await LiveActivityModule.isActivityActive();
    } catch (error) {
      console.error('❌ LiveActivityService: Failed to check activity status:', error);
      return false;
    }
  }
}

export default LiveActivityService;
