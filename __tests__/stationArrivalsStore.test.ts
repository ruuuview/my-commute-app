import { renderHook, act } from '@testing-library/react-native';
import { AppState } from 'react-native';
import {
  useStationArrivals,
  setCachedArrivals,
  deleteCachedArrivals,
  getCachedArrivals,
  getActiveSubscriptionCount,
  subscribeToStation,
  resetArrivalsStoreForTesting,
  fetchOnce,
  FRESH_MS,
} from '../services/stationArrivalsStore';
import * as apiService from '../services/apiService';

jest.mock('../services/apiService', () => ({
  fetchNormalizedStationArrivals: jest.fn(),
}));

describe('stationArrivalsStore v1.2 Invariant Suite', () => {
  const stationA = '940GZZLUVIC';
  const stationB = '940GZZLUOXC';
  const mockDepartures = [
    { id: '1', lineId: 'victoria', destinationName: 'Brixton', minutesAway: 2, platformName: 'Southbound - Platform 1' },
    { id: '2', lineId: 'victoria', destinationName: 'Walthamstow Central', minutesAway: 5, platformName: 'Northbound - Platform 2' },
  ];

  beforeEach(() => {
    resetArrivalsStoreForTesting();
    deleteCachedArrivals(stationA);
    deleteCachedArrivals(stationB);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initial state derives loading from data absence (loading=true on first cold launch)', async () => {
    (apiService.fetchNormalizedStationArrivals as jest.Mock).mockReturnValue(new Promise(() => {})); // pending

    const { result } = await renderHook(() => useStationArrivals(stationA));
    expect(result.current.loading).toBe(true);
    expect(result.current.arrivals).toEqual([]);
  });

  it('exit-edit remount renders last-known data instantly with zero loading flash', async () => {
    // Pre-seed store with last-known data
    setCachedArrivals(stationA, mockDepartures as any);
    (apiService.fetchNormalizedStationArrivals as jest.Mock).mockReturnValue(new Promise(() => {})); // pending background refresh

    const { result } = await renderHook(() => useStationArrivals(stationA));
    // Must immediately read from store synchronously
    expect(result.current.loading).toBe(false);
    expect(result.current.arrivals).toEqual(mockDepartures);
  });

  it('single-flight deduplication: concurrent fetchOnce calls coalesce into 1 network request', async () => {
    (apiService.fetchNormalizedStationArrivals as jest.Mock).mockImplementation(
      () => new Promise(res => setTimeout(() => res({ departures: mockDepartures }), 50))
    );

    const promise1 = fetchOnce(stationA);
    const promise2 = fetchOnce(stationA);

    const [res1, res2] = await Promise.all([promise1, promise2]);
    expect(res1).toEqual(mockDepartures);
    expect(res2).toEqual(mockDepartures);
    expect(apiService.fetchNormalizedStationArrivals).toHaveBeenCalledTimes(1);
  });

  it('freshness gate: does not refetch if entry was fetched within FRESH_MS (20s)', async () => {
    expect(FRESH_MS).toBe(20_000);
    setCachedArrivals(stationA, mockDepartures as any);

    const res = await fetchOnce(stationA);
    expect(res).toEqual(mockDepartures);
    expect(apiService.fetchNormalizedStationArrivals).not.toHaveBeenCalled();
  });

  it('AppState foreground transition refreshes stale data silently without resetting loading', async () => {
    jest.useFakeTimers();
    let appStateListener: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((event: string, handler: any) => {
      if (event === 'change') appStateListener = handler;
      return { remove: jest.fn() } as any;
    });

    setCachedArrivals(stationA, mockDepartures as any);
    const refreshedDepartures = [
      { id: '3', lineId: 'victoria', destinationName: 'Brixton', minutesAway: 1, platformName: 'Southbound - Platform 1' },
    ];
    (apiService.fetchNormalizedStationArrivals as jest.Mock).mockResolvedValue({ departures: refreshedDepartures });

    const { result } = await renderHook(() => useStationArrivals(stationA));
    expect(result.current.loading).toBe(false);

    // Fast-forward past freshness gate (25 seconds)
    jest.advanceTimersByTime(FRESH_MS + 5000);

    // App resumes from background
    await act(async () => {
      appStateListener?.('active');
    });

    expect(apiService.fetchNormalizedStationArrivals).toHaveBeenCalledWith(stationA, expect.any(AbortSignal));
    expect(result.current.loading).toBe(false);
    expect(getCachedArrivals(stationA)).toEqual(refreshedDepartures);
  });

  it('deleteCachedArrivals purges station from store cleanly', () => {
    setCachedArrivals(stationA, mockDepartures as any);
    expect(getCachedArrivals(stationA)).toEqual(mockDepartures);

    deleteCachedArrivals(stationA);
    expect(getCachedArrivals(stationA)).toBeUndefined();
  });

  it('subscribeToStation reference counting: multiple subscribers share 1 subscription and teardown at count=0', () => {
    const fetchMock = jest.fn().mockResolvedValue(undefined);

    expect(getActiveSubscriptionCount(stationA)).toBe(0);

    const unsub1 = subscribeToStation(stationA, fetchMock);
    expect(getActiveSubscriptionCount(stationA)).toBe(1);

    const unsub2 = subscribeToStation(stationA, fetchMock);
    expect(getActiveSubscriptionCount(stationA)).toBe(2);

    unsub1();
    expect(getActiveSubscriptionCount(stationA)).toBe(1);

    unsub2();
    expect(getActiveSubscriptionCount(stationA)).toBe(0);
  });

  it('useStationArrivals hook integration: subscribes on mount and unsubscribes on unmount', async () => {
    (apiService.fetchNormalizedStationArrivals as jest.Mock).mockReturnValue(new Promise(() => {}));

    expect(getActiveSubscriptionCount(stationA)).toBe(0);

    const { unmount } = await renderHook(() => useStationArrivals(stationA));
    expect(getActiveSubscriptionCount(stationA)).toBe(1);

    await act(async () => {
      unmount();
    });
    expect(getActiveSubscriptionCount(stationA)).toBe(0);
  });

  it('edit-mode gate (enabled=false): zero subscriptions and zero fetches', async () => {
    (apiService.fetchNormalizedStationArrivals as jest.Mock).mockReturnValue(new Promise(() => {}));

    expect(getActiveSubscriptionCount(stationA)).toBe(0);

    const { result, unmount } = await renderHook(() => useStationArrivals(stationA, { enabled: false }));

    expect(getActiveSubscriptionCount(stationA)).toBe(0);
    expect(apiService.fetchNormalizedStationArrivals).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);
    expect(result.current.arrivals).toEqual([]);

    unmount();
    expect(getActiveSubscriptionCount(stationA)).toBe(0);
  });
});
