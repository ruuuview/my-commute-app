import { Platform } from 'react-native';
import { LiveActivityService } from '../services/LiveActivityService';

describe('LiveActivityService Throttle Bypass & Trailing Flush', () => {
  const originalOS = Platform.OS;
  let updateCommuteActivityMock: jest.Mock;

  beforeEach(() => {
    Platform.OS = 'ios';
    jest.useFakeTimers();
    updateCommuteActivityMock = jest.fn().mockResolvedValue(undefined);
    LiveActivityService._setNativeModuleForTesting({
      updateCommuteActivity: updateCommuteActivityMock,
      areActivitiesEnabled: jest.fn().mockResolvedValue(true),
    });
    LiveActivityService._resetThrottleForTesting();
  });

  afterEach(() => {
    jest.useRealTimers();
    LiveActivityService._setNativeModuleForTesting(null);
  });

  afterAll(() => {
    Platform.OS = originalOS;
  });

  test('throttles rapid duplicate updates within 2000ms', async () => {
    jest.spyOn(LiveActivityService, 'buildPayload').mockReturnValue({
      stationId: '940GZZLUKSX',
      lineId: 'victoria',
      lineName: 'Victoria',
      statusText: 'Good Service',
      severityTier: 0,
      nextTrainMinutes: 2,
      phase: 'approaching',
    } as any);

    await LiveActivityService.update('940GZZLUKSX', 'victoria');
    expect(updateCommuteActivityMock).toHaveBeenCalledTimes(1);

    // Call again at +500ms
    jest.advanceTimersByTime(500);
    await LiveActivityService.update('940GZZLUKSX', 'victoria');
    expect(updateCommuteActivityMock).toHaveBeenCalledTimes(1);
  });

  test('trailing flush executes at the end of the 2000ms window with the latest payload', async () => {
    const buildPayloadSpy = jest.spyOn(LiveActivityService, 'buildPayload');
    buildPayloadSpy.mockReturnValueOnce({
      stationId: '940GZZLUKSX',
      lineId: 'victoria',
      lineName: 'Victoria',
      statusText: 'Minor Delays',
      severityTier: 1,
      nextTrainMinutes: 2,
      phase: 'approaching',
    } as any);

    await LiveActivityService.update('940GZZLUKSX', 'victoria');
    expect(updateCommuteActivityMock).toHaveBeenCalledTimes(1);

    // Advance 500ms and trigger update with newer arrival time
    jest.advanceTimersByTime(500);
    buildPayloadSpy.mockReturnValueOnce({
      stationId: '940GZZLUKSX',
      lineId: 'victoria',
      lineName: 'Victoria',
      statusText: 'Minor Delays',
      severityTier: 1,
      nextTrainMinutes: 1,
      phase: 'approaching',
    } as any);
    await LiveActivityService.update('940GZZLUKSX', 'victoria');
    expect(updateCommuteActivityMock).toHaveBeenCalledTimes(1);

    // Advance timers to trigger the trailing flush (remaining 1500ms)
    jest.advanceTimersByTime(1600);
    expect(updateCommuteActivityMock).toHaveBeenCalledTimes(2);
    expect(updateCommuteActivityMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ nextTrainMinutes: 1 })
    );
  });

  test('escalation in severity tier immediately bypasses the 2000ms debounce', async () => {
    const buildPayloadSpy = jest.spyOn(LiveActivityService, 'buildPayload');
    buildPayloadSpy.mockReturnValueOnce({
      stationId: '940GZZLUKSX',
      lineId: 'victoria',
      lineName: 'Victoria',
      statusText: 'Minor Delays',
      severityTier: 1,
      nextTrainMinutes: 2,
      phase: 'approaching',
    } as any);

    await LiveActivityService.update('940GZZLUKSX', 'victoria');
    expect(updateCommuteActivityMock).toHaveBeenCalledTimes(1);

    // Only 200ms later, line escalates to Severe Delays (tier 2)
    jest.advanceTimersByTime(200);
    buildPayloadSpy.mockReturnValueOnce({
      stationId: '940GZZLUKSX',
      lineId: 'victoria',
      lineName: 'Victoria',
      statusText: 'Severe Delays',
      severityTier: 2,
      nextTrainMinutes: 2,
      phase: 'approaching',
    } as any);

    await LiveActivityService.update('940GZZLUKSX', 'victoria');
    expect(updateCommuteActivityMock).toHaveBeenCalledTimes(2);
    expect(updateCommuteActivityMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ statusText: 'Severe Delays', severityTier: 2 })
    );
  });

  test('per-line severity isolation prevents cross-line flapping', async () => {
    const buildPayloadSpy = jest.spyOn(LiveActivityService, 'buildPayload');

    // Line A (Piccadilly) is at Severe Delays (tier 2)
    buildPayloadSpy.mockReturnValueOnce({
      stationId: '940GZZLUKSX',
      lineId: 'piccadilly',
      lineName: 'Piccadilly',
      statusText: 'Severe Delays',
      severityTier: 2,
      nextTrainMinutes: 5,
      phase: 'approaching',
    } as any);

    await LiveActivityService.update('940GZZLUKSX', 'piccadilly');
    expect(updateCommuteActivityMock).toHaveBeenCalledTimes(1);

    // Line B (Victoria) starts at Good Service (tier 0)
    jest.advanceTimersByTime(2100);
    buildPayloadSpy.mockReturnValueOnce({
      stationId: '940GZZLUKSX',
      lineId: 'victoria',
      lineName: 'Victoria',
      statusText: 'Good Service',
      severityTier: 0,
      nextTrainMinutes: 2,
      phase: 'approaching',
    } as any);

    await LiveActivityService.update('940GZZLUKSX', 'victoria');
    expect(updateCommuteActivityMock).toHaveBeenCalledTimes(2);

    // 200ms later, Line B escalates to Severe Delays (tier 2).
    // Because Victoria was at tier 0, this is an escalation (2 > 0 && 2 >= 2)
    // and MUST bypass the 2000ms debounce despite Piccadilly being at tier 2.
    jest.advanceTimersByTime(200);
    buildPayloadSpy.mockReturnValueOnce({
      stationId: '940GZZLUKSX',
      lineId: 'victoria',
      lineName: 'Victoria',
      statusText: 'Severe Delays',
      severityTier: 2,
      nextTrainMinutes: 2,
      phase: 'approaching',
    } as any);

    await LiveActivityService.update('940GZZLUKSX', 'victoria');
    expect(updateCommuteActivityMock).toHaveBeenCalledTimes(3);
    expect(updateCommuteActivityMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ lineId: 'victoria', statusText: 'Severe Delays', severityTier: 2 })
    );
  });
});
